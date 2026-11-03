import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseStops, geoQuery, geoQueries, findAddresses, straightTimes, needsLookup, googleExact, order, pathCost, legs, mapsUrl } from './route.js';

const line = xs => xs.map(a => xs.map(b => Math.abs(a - b)));

test('parseStops drops blanks and repeats', () => {
  assert.deepEqual(parseStops('1 A ST, MADISON\n\n 1 a st  madison \n2 B RD\n'), ['1 A ST, MADISON', '2 B RD']);
});

test('geoQuery strips unit and apartment numbers', () => {
  assert.equal(geoQuery('200 EXAMPLE TER UNIT 3, MADISON, WI'), '200 EXAMPLE TER, MADISON, WI');
  assert.equal(geoQuery('300 TEST DR APT 4, MADISON, WI'), '300 TEST DR, MADISON, WI');
  assert.equal(geoQuery('5 MAIN ST #2B, MADISON'), '5 MAIN ST, MADISON');
  assert.equal(geoQuery('100 SAMPLE CT, SUN PRAIRIE, WI'), '100 SAMPLE CT, SUN PRAIRIE, WI');
});

test('geoQueries retries without the city', () => {
  assert.deepEqual(geoQueries('500 EXAMPLE RD, STOUGHTON, WI'), ['500 EXAMPLE RD, STOUGHTON, WI', '500 EXAMPLE RD, WI']);
  assert.deepEqual(geoQueries('200 EXAMPLE TER UNIT 3, MADISON, WI'), ['200 EXAMPLE TER, MADISON, WI', '200 EXAMPLE TER, WI']);
  assert.deepEqual(geoQueries('12 OAK ST, WI'), ['12 OAK ST, WI']);
});

const fixture = name => readFileSync(new URL(`tests/ocr/${name}`, import.meta.url), 'utf8');

test('findAddresses reads the Amazon Flex itinerary list', () => {
  assert.deepEqual(findAddresses(fixture('itinerary-list.txt')), fixture('itinerary-list.expected.txt').trim().split('\n'));
});

test('findAddresses handles grid addresses, mixed case and missing cities', () => {
  assert.deepEqual(findAddresses('Stop 5 of 32\nW204N11509 Goldendale Rd\nGermantown\nLeave at back door\n12 Oak St\n(608) 555-0142'),
    ['W204N11509 GOLDENDALE RD, GERMANTOWN, WI', '12 OAK ST, WI']);
});

test('findAddresses ignores status bars, badges and times', () => {
  assert.deepEqual(findAddresses('6:13 YT & Xe 5Guc all ( 70]\n# H.LO4.0V 1S\n[10] (© Expected by 10:00 AM\n(7) © 8:00 PM - 9:55 AM'), []);
});

test('order with an open start walks the line toward the end', () => {
  // stops at 0, 5, 2, 8, 3; end at 10
  assert.deepEqual(order(line([0, 5, 2, 8, 3, 10])), [0, 2, 4, 1, 3]);
});

test('order with a fixed start goes back first, then forward', () => {
  // start at 1; stops at 0, 6, 3; end at 10
  assert.deepEqual(order(line([1, 0, 6, 3, 10]), 0), [1, 3, 2]);
});

test('order handles 0 and 1 stops', () => {
  assert.deepEqual(order(line([10])), []);
  assert.deepEqual(order(line([1, 10]), 0), []);
  assert.deepEqual(order(line([4, 10])), [0]);
});

test('order visits every stop once and never loses to nearest-neighbour', () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const n = 42;
  const d = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : 60 + rnd() * 1800)));
  const seq = order(d, 0);
  assert.deepEqual([...seq].sort((a, b) => a - b), [...Array(n).keys()].slice(1, -1));
  const plain = [...Array(n).keys()];
  assert.ok(pathCost(d, [0, ...seq, n - 1]) <= pathCost(d, plain));
});

for (const n of [0, 1, 9, 10, 40]) {
  test(`legs for ${n} stops join up and include every stop once`, () => {
    const stops = Array.from({ length: n }, (_, i) => `stop ${i}`);
    const ls = legs(stops, 'END', 'START');
    assert.equal(ls[0].origin, 'START');
    assert.equal(ls.at(-1).destination, 'END');
    for (let k = 1; k < ls.length; k++) assert.equal(ls[k].origin, ls[k - 1].destination);
    for (const l of ls) assert.ok(l.waypoints.length <= 9);
    assert.deepEqual(ls.flatMap(l => [...l.waypoints, l.destination]), [...stops, 'END']);
  });
}

test('40 stops make 5 legs, the last one just driving to the end', () => {
  const ls = legs(Array.from({ length: 40 }, (_, i) => `s${i}`), 'END');
  assert.equal(ls.length, 5);
  assert.deepEqual(ls[4], { origin: 's39', waypoints: [], destination: 'END' });
});

test('mapsUrl leaves out a blank origin and joins waypoints with |', () => {
  const u = new URL(mapsUrl({ origin: '', waypoints: ['1 A ST, MADISON', '2 B RD'], destination: 'END' }));
  assert.equal(u.searchParams.get('origin'), null);
  assert.equal(u.searchParams.get('waypoints'), '1 A ST, MADISON|2 B RD');
  assert.equal(u.searchParams.get('travelmode'), 'driving');
  assert.match(u.href, /waypoints=1\+A\+ST%2C\+MADISON%7C2\+B\+RD/);
});

test('straight-line fallback orders stops along a road and keeps the end last', () => {
  // Points along a line of latitude, shuffled; the last one is the end.
  const lngs = [-89.40, -89.10, -89.30, -88.90, -89.20, -88.80];
  const d = straightTimes(lngs.map(lng => ({ lat: 43.07, lng })));
  assert.equal(d[0][0], 0);
  assert.ok(Math.abs(d[0][1] - d[1][0]) < 1e-6);
  assert.ok(d[0][1] > 2300 && d[0][1] < 2800); // about 24 km apart, so roughly 42 min
  const seq = order(d);
  assert.deepEqual(seq, [0, 2, 4, 1, 3]);
  assert.ok(!seq.includes(lngs.length - 1));
});

test('straight-line fallback counts north-south distance too', () => {
  // 0.2° of latitude is about 22 km, so roughly 39 min at the assumed road speed.
  const [[, t]] = straightTimes([{ lat: 43.0, lng: -89.4 }, { lat: 43.2, lng: -89.4 }]);
  assert.ok(t > 2100 && t < 2500, `got ${t}`);
});

test('needsLookup reuses saved stops, retries street-only ones with Google, and expires Google after 30 days', () => {
  const day = 864e5, now = 100 * day;
  const exact = { lat: 1, lng: 1, exact: true }, street = { lat: 1, lng: 1, exact: false };
  assert.equal(needsLookup(undefined, { now }), true);
  assert.equal(needsLookup(exact, { key: 'k', now }), false);
  assert.equal(needsLookup(street, { now }), false);
  assert.equal(needsLookup(street, { key: 'k', now }), true);
  assert.equal(needsLookup(street, { key: 'k', googleOff: 'refused', now }), false);
  assert.equal(needsLookup({ ...street, t: now - 29 * day }, { key: 'k', now }), false); // Google already tried
  assert.equal(needsLookup({ ...exact, t: now - 31 * day }, { now }), true);
});

test('googleExact needs a house-level match that is not a guess', () => {
  assert.equal(googleExact({ types: ['street_address'] }), true);
  assert.equal(googleExact({ types: ['premise'], partial_match: false }), true);
  assert.equal(googleExact({ types: ['street_address'], partial_match: true }), false);
  assert.equal(googleExact({ types: ['route'] }), false);
});
