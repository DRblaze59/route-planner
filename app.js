import { parseStops, geoQueries, findAddresses, straightTimes, order, pathCost, legs, mapsUrl } from './route.js';

const $ = id => document.getElementById(id);
const say = (t, bad) => { $('status').textContent = t; $('status').classList.toggle('bad', !!bad); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const VIEWBOX = '-90.3,43.7,-87.7,42.5'; // prefer matches in the Madison–Milwaukee region

// Everything lives in this phone's browser storage. Storage can be blocked or cleared,
// so the app works without it, it just forgets.
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

// state.route: [{addr, exact}] in driving order; state.done: addresses ticked off
let state = load('rp.state', { start: '', end: '', stops: '', route: null, total: 0, missing: [], done: [] });
const save = () => store('rp.state', state);
const found = load('rp.geo', {}); // address -> {lat, lng, exact} or null

async function geocode(addr) {
  if (found[addr]) return found[addr];
  let g = null;
  for (const [k, text] of geoQueries(addr).entries()) {
    const q = new URLSearchParams({ format: 'jsonv2', limit: '1', countrycodes: 'us', addressdetails: '1', viewbox: VIEWBOX, q: text });
    const r = await fetch('https://nominatim.openstreetmap.org/search?' + q);
    if (!r.ok) throw new Error(`The address lookup service answered ${r.status}.`);
    const [hit] = await r.json();
    await sleep(1100); // Nominatim allows 1 request per second
    const exact = !!hit?.address?.house_number;
    // Without the city only an exact house match counts: many towns share a street name.
    if (hit && (k === 0 || exact)) g = { lat: +hit.lat, lng: +hit.lon, exact };
    if (g?.exact) break;
  }
  if (g) { // misses aren't cached, so a retry asks again
    found[addr] = g;
    // shortcut: drops the oldest third once 3000 addresses are cached; plenty for one driver
    const keys = Object.keys(found);
    if (keys.length > 3000) keys.slice(0, 1000).forEach(k => delete found[k]);
    store('rp.geo', found);
  }
  return g;
}

async function driveTimes(pts) {
  const r = await fetch('https://router.project-osrm.org/table/v1/driving/' +
    pts.map(p => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';') + '?annotations=duration');
  const j = await r.json().catch(() => ({}));
  if (j.code !== 'Ok') throw new Error("The drive-time service didn't answer. Try again in a minute.");
  return j.durations.map(row => row.map(v => v ?? 1e9)); // null: no road between the two
}

const fmt = s => { const m = Math.round(s / 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };

function render() {
  const { route, end, done } = state;
  $('result').hidden = !route;
  if (!route) return;
  const ticked = new Set(done);
  const left = route.filter(p => !ticked.has(p.addr));
  const num = p => route.indexOf(p) + 1;

  $('summary').textContent = `${route.length} stops · ${ticked.size ? `${ticked.size} done, ${left.length} left · ` : ''}about ${fmt(state.total)} of driving planned${state.rough ? ' (a rough guess from straight-line distance)' : ''}.`;
  // Misses are usually a misread letter (YAHADRA for YAHARA), so make each one a tap away from fixing.
  $('missing').hidden = !state.missing.length;
  $('missing').replaceChildren(...(state.missing.length ? [
    Object.assign(document.createElement('p'), { textContent: `Couldn't find ${state.missing.length === 1 ? 'this stop, so it was' : `these ${state.missing.length} stops, so they were`} left out. Tap ${state.missing.length === 1 ? "it" : "one"}, fix its spelling to match Flex, then tap Plan route again.` }),
    ...state.missing.map(addr => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'fix'; b.textContent = addr;
      b.addEventListener('click', () => {
        const at = $('stops').value.indexOf(addr);
        if (at < 0) return say('That stop is no longer in the list.');
        $('stops').focus();
        $('stops').setSelectionRange(at, at + addr.length);
      });
      return b;
    }),
  ] : []));

  // Once a stop is ticked you're out on the route, so every leg starts from where you are.
  $('legs').replaceChildren(...legs(left.map(p => p.addr), end, ticked.size ? '' : state.start).map((l, k, ls) => {
    const a = document.createElement('a');
    a.className = 'btn'; a.href = mapsUrl(l); a.target = '_blank'; a.rel = 'noopener';
    const nums = left.slice(k * 10, k * 10 + 10).map(num), last = k === ls.length - 1;
    const title = document.createElement('span');
    title.textContent = !nums.length ? `Leg ${k + 1} · drive to the end`
      : `Leg ${k + 1} · stop${nums.length > 1 ? `s ${nums[0]}–${nums.at(-1)}` : ` ${nums[0]}`}${last ? ', then the end' : ''}`;
    // Maps lists the last place of each link as the destination, apart from the stops before it.
    const note = document.createElement('small');
    note.textContent = `${k ? `Starts at stop ${num(left[k * 10 - 1])}. ` : ''}Maps shows ${l.waypoints.length} stop${l.waypoints.length === 1 ? '' : 's'}, ` +
      `then ${last ? 'your end' : `stop ${nums.at(-1)}`} as the destination: ${l.destination}`;
    a.append(title, note);
    return a;
  }));

  $('order').replaceChildren(...route.map((p, i) => {
    const li = document.createElement('li');
    const label = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox'; box.id = 'done' + i; box.checked = ticked.has(p.addr);
    box.addEventListener('change', () => {
      state.done = box.checked ? [...state.done, p.addr] : state.done.filter(a => a !== p.addr);
      save(); render();
    });
    label.append(box, ' ', p.addr);
    if (!p.exact) { const c = document.createElement('span'); c.className = 'chip'; c.textContent = 'street only, check'; label.append(' ', c); }
    li.append(label);
    li.classList.toggle('done', box.checked);
    return li;
  }));
}

for (const id of ['start', 'end', 'stops']) {
  $(id).value = state[id];
  $(id).addEventListener('input', () => { state[id] = $(id).value; save(); });
}
render();

// The text reader is about 15 MB, so it loads on the first import only.
let worker, onProgress = () => {};
async function reader() {
  if (!window.Tesseract) await new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
    s.onload = ok; s.onerror = () => fail(new TypeError('load failed'));
    document.head.append(s);
  });
  return worker ??= await Tesseract.createWorker('eng', 1, { logger: m => m.status === 'recognizing text' && onProgress(m.progress) });
}

$('shots').addEventListener('change', async e => {
  const files = [...e.target.files];
  if (!files.length) return;
  try {
    say('Loading the text reader…');
    const w = await reader();
    const text = [];
    for (const [i, f] of files.entries()) {
      onProgress = p => say(`Reading screenshot ${i + 1} of ${files.length}: ${Math.round(p * 100)}%`);
      text.push((await w.recognize(f)).data.text);
    }
    const before = parseStops($('stops').value);
    const read = findAddresses(text.join('\n'));
    const after = parseStops([...before, ...read].join('\n'));
    $('stops').value = state.stops = after.join('\n');
    save();
    const added = after.length - before.length;
    say(!read.length ? "Couldn't find any addresses in those screenshots. Check that they show the Itinerary List."
      : `Added ${added} stop${added === 1 ? '' : 's'}${read.length > added ? ` (${read.length - added} already in the list)` : ''}. Check them, then plan.`, !read.length);
  } catch (err) {
    say(err instanceof TypeError ? "Couldn't load the text reader. Check your signal and try again." : `Couldn't read the screenshots: ${err.message ?? err}`, true);
  }
  e.target.value = ''; // let the same screenshots be picked again
});

$('newday').addEventListener('click', () => {
  if (!confirm('Clear the stops and today\'s route? Your end place stays.')) return;
  Object.assign(state, { start: '', stops: '', route: null, total: 0, missing: [], done: [], rough: false });
  $('start').value = $('stops').value = '';
  save(); render();
  say('Cleared. Import today\'s screenshots.');
});

$('plan').addEventListener('submit', async e => {
  e.preventDefault();
  const start = $('start').value.trim(), end = $('end').value.trim(), listed = parseStops($('stops').value);
  // Planning again mid-day (say, after adding a stop) keeps delivered stops done and plans only the rest.
  const kept = (state.route ?? []).filter(p => state.done.includes(p.addr) && listed.includes(p.addr));
  const stops = listed.filter(a => !kept.some(p => p.addr === a));
  if (!end) return say('Add where the route should end.', true);
  if (!stops.length) return say(listed.length ? 'Every stop is ticked off. Start a new day to plan again.' : 'Add at least one stop.', true);
  $('go').disabled = true;
  try {
    const all = [...(start ? [start] : []), ...stops, end];
    const pts = [];
    for (const [i, a] of all.entries()) {
      say(`Finding addresses: ${i + 1} of ${all.length}…`);
      pts.push({ addr: a, ...(await geocode(a)) });
    }
    for (const [label, p] of [['start', start && pts[0]], ['end', pts.at(-1)]]) {
      if (p && p.lat == null) throw new Error(`Couldn't find the ${label} address "${p.addr}". Check it and plan again.`);
    }
    const ok = pts.filter(p => p.lat != null);

    say('Working out the fastest order…');
    // If the drive-time service is down, straight-line distance still gives a sensible order.
    let rough = false;
    const d = await driveTimes(ok).catch(() => { rough = true; return straightTimes(ok); });
    const seq = order(d, start ? 0 : null);
    Object.assign(state, {
      start, end,
      route: [...kept, ...seq.map(i => ({ addr: ok[i].addr, exact: ok[i].exact }))],
      total: pathCost(d, start ? [0, ...seq, ok.length - 1] : [...seq, ok.length - 1]),
      missing: pts.filter(p => p.lat == null).map(p => p.addr),
      done: kept.map(p => p.addr),
      rough,
    });
    save(); render();
    say(rough ? "The drive-time service didn't answer, so stops are ordered by straight-line distance. Plan again later for a better order."
      : 'Planned. Open the legs in order, and tick stops off as you go.', rough);
  } catch (err) {
    say(err instanceof TypeError && /fetch|network|load/i.test(err.message) ? 'No connection to the map services. Check your signal and try again.' : err.message, true);
  }
  $('go').disabled = false;
});

navigator.serviceWorker?.register('sw.js').catch(() => {}); // fresh files when online, saved ones offline
