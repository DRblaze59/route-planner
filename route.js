// Pure route logic: no DOM, no network. Tested by route.test.js.

const key = s => s.toUpperCase().replace(/[\s,.]+/g, ' ').trim();

// One stop per line, blank lines dropped, repeats (ignoring case, commas, spacing) kept once.
export function parseStops(text) {
  const seen = new Set();
  return text.split('\n').map(s => s.trim()).filter(s => s && !seen.has(key(s)) && seen.add(key(s)));
}

// Unit and apartment numbers confuse the address lookup; Maps still gets the full text.
export const geoQuery = addr => addr.replace(/[\s,]+(?:UNIT|APT|STE|SUITE|LOT|BLDG|#)\s*[\w-]+/gi, '');

const SUFFIX = /\b(?:ST|AVE|RD|DR|LN|CT|CIR|TER|BLVD|WAY|PL|PKWY|TRL|HWY|PASS|RUN|XING|SQ|LOOP|PATH|ALY|PT|BND|RDG|CRES|STREET|AVENUE|ROAD|DRIVE|LANE|COURT|CIRCLE|TERRACE|BOULEVARD|PARKWAY|TRAIL|HIGHWAY|PLACE)\b/;
const HOUSE = /^(?:\d+[A-Z]?|[NSEW]\d+(?:[NSEW]\d+)?)$/; // 4437, 12B, and Wisconsin grid numbers like W204N11509
const CITY = /^[A-Z][A-Z .'-]{1,30}$/;

// Street addresses from the OCR text of Amazon Flex "Itinerary List" screenshots:
// a street line starting with a house number, then the city alone on the next line.
export function findAddresses(text) {
  const lines = text.split('\n').map(s => s.trim().toUpperCase()).filter(Boolean);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const words = lines[i].split(/\s+/);
    let street = null, next = i + 1;
    if (words.length > 1 && HOUSE.test(words[0]) && SUFFIX.test(lines[i])) street = lines[i];
    else if (!SUFFIX.test(lines[i]) && SUFFIX.test(lines[next] ?? '') && !HOUSE.test(lines[next].split(/\s+/)[0])) {
      // A long business name pushed the house number onto the line above the street.
      const n = words.find(w => /^\d/.test(w) && HOUSE.test(w));
      if (n) { street = `${n} ${lines[next]}`; next++; }
    }
    if (!street) continue;
    const city = CITY.test(lines[next] ?? '') && !SUFFIX.test(lines[next]) ? lines[next] : null;
    out.push(city ? `${street}, ${city}, WI` : `${street}, WI`);
    i = city ? next : next - 1;
  }
  return out;
}

// Lookups to try in order. Flex gives the postal city (STOUGHTON) but OpenStreetMap may file
// the house under its town (Pleasant Springs), so the second try leaves the city out.
export function geoQueries(addr) {
  const q = geoQuery(addr), parts = q.split(',').map(s => s.trim());
  return parts.length > 2 ? [q, `${parts[0]}, ${parts.at(-1)}`] : [q];
}

// Drive-time guesses from straight-line distance, for when the drive-time service is down.
// shortcut: roads assumed 1.3× the straight line at 45 km/h; good enough to order stops, not to time the day.
export function straightTimes(pts) {
  const rad = x => (x * Math.PI) / 180;
  const km = (a, b) => 12742 * Math.asin(Math.sqrt(Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2));
  return pts.map(a => pts.map(b => (km(a, b) * 1.3 / 45) * 3600));
}

export const pathCost =(d, p) => p.reduce((s, v, i) => (i ? s + d[p[i - 1]][v] : 0), 0);

// d: matrix of drive times. The last index is the end. `start` is the index of a fixed
// start, or null to let the route begin at whichever stop is best.
// Returns the stop indices in visiting order (start and end left out).
export function order(d, start = null) {
  const end = d.length - 1;
  const stops = [...d.keys()].filter(i => i !== start && i !== end);
  if (!stops.length) return [];
  const full = seq => (start == null ? [...seq, end] : [start, ...seq, end]);

  // Nearest-neighbour from the fixed start, or from every possible first stop.
  let best = null;
  for (const first of start == null ? stops : [start]) {
    const left = new Set(stops);
    const seq = [];
    if (start == null) { seq.push(first); left.delete(first); }
    for (let at = first; left.size;) {
      let next = null;
      for (const j of left) if (next == null || d[at][j] < d[at][next]) next = j;
      seq.push(next); left.delete(next); at = next;
    }
    if (!best || pathCost(d, full(seq)) < pathCost(d, full(best))) best = seq;
  }

  // Then reverse a stretch or move one stop, while either makes the drive shorter.
  // shortcut: full cost recompute per try is O(n^3) a pass; fine up to ~100 stops.
  let cost = pathCost(d, full(best));
  for (let improved = true; improved;) {
    improved = false;
    for (let i = 0; i < best.length; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const rev = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
        const fwd = [...best]; fwd.splice(j, 0, ...fwd.splice(i, 1));
        const back = [...best]; back.splice(i, 0, ...back.splice(j, 1));
        for (const cand of [rev, fwd, back]) {
          const c = pathCost(d, full(cand));
          if (c < cost - 1e-9) { best = cand; cost = c; improved = true; }
        }
      }
    }
  }
  return best;
}

// Split ordered stops + end into Google Maps links of at most `max` waypoints each.
// Each leg starts where the previous one ended. A blank start leaves Leg 1 without an
// origin, so Maps starts from the phone's location.
export function legs(stops, end, start = '', max = 9) {
  const pts = [...stops, end];
  const out = [];
  for (let i = 0; i < pts.length; i += max + 1) {
    const chunk = pts.slice(i, i + max + 1);
    out.push({ origin: i ? pts[i - 1] : start, waypoints: chunk.slice(0, -1), destination: chunk.at(-1) });
  }
  return out;
}

export function mapsUrl({ origin, waypoints, destination }) {
  const q = new URLSearchParams({ api: '1', travelmode: 'driving' });
  if (origin) q.set('origin', origin);
  q.set('destination', destination);
  if (waypoints.length) q.set('waypoints', waypoints.join('|'));
  return 'https://www.google.com/maps/dir/?' + q;
}
