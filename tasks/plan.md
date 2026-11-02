# Implementation Plan: Route Planner (self-hosted web app for the S26)

## Overview
A small web app you install on your Galaxy S26 from Brave. You give it screenshots of your stops. The phone reads the addresses out of them, the app finds each address, puts 20–40 stops in the fastest driving order from where you are to your usual end place, and opens the route in Google Maps, in links of up to 9 stops each.

## Why self-hosted (decided 2026-11-02)
The claude.ai artifact version failed the spike on all three tests. The upload button did nothing in the installed app. The page can't reach outside services, so Claude had to guess coordinates, and it was sometimes far off (702 S Randall Ave). A normally hosted page has neither limit.

## Architecture Decisions
- **Static site, no build step, hosted on GitHub Pages** (free). Plain HTML and JS, with no framework and no server of our own.
- **Finding addresses: OpenStreetMap Nominatim** (free, no key). Tested 2026-11-02: 702 S Randall Ave and 3330 Atwood Ave both matched to the house. 1111 Vel R. Phillips Ave matched only the street. Usage rule: at most 1 request per second, so 40 stops take about 40 s. The app flags stops that matched only the street. Google's Geocoding API is the fallback if too many stops get flagged (it needs an API key).
- **Order: OSRM `table` (drive times between every pair of stops, free public server, tested with 42 points) plus our own optimizer** (nearest-neighbour from every possible first stop, then 2-opt and single-stop moves, end fixed). OSRM `trip` can't do "open start, fixed end" one way, so it's out. If OSRM is down, the same optimizer runs on straight-line distances (Task 6).
- **Reading screenshots: Tesseract.js on the phone** (loaded from jsDelivr). Free, and screenshots stay on the phone. The read text then goes through an address finder tuned for Wisconsin, including grid addresses like `W204N11509 Goldendale Rd`. You check and edit the list before planning.
- **Navigation: Google Maps links.** `…/maps/dir/?api=1&travelmode=driving`. The spike measured **at most 9 waypoints per link**. Each leg starts where the previous one ended. Leg 1 leaves out `origin`, so Maps starts from your location.
- **Storage: `localStorage` on the phone.** It holds the default end place, the current route and the stops you've ticked off. Only you use it, on one phone.
- **Installable PWA:** a manifest and a small service worker, so Brave's "Install app" works and the app opens without the browser bar.
- **Pure logic in `route.js`, tested with `node --test`:** the address finder, leg splitting and Maps links. No dependencies.

## Dependency graph
```
Repo + GitHub Pages + spike page (OCR on real screenshots)
   │
   ├── route.js: legs(), mapsUrl()  ──┐
   │                                  ├── Slice A: typed stops → Nominatim → OSRM → Maps legs
   │                                  │        │
   ├── route.js: findAddresses() ─────┴── Slice B: screenshots → OCR → addresses → Slice A
   │                                           │
   │                                           ├── Slice C: save end place, route, ticks
   │                                           ├── Slice D: install as an app (manifest, service worker)
   │                                           └── Slice E: when lookups miss or OSRM is down
```

## Task List

### Phase 0: Prove the risky part
- [x] Task 1: Repo, hosting and OCR spike

### Checkpoint: Spike
- [x] Hosted page opens on the S26. OCR reads your real screenshots well enough to fix by hand.

### Phase 1: Core route
- [ ] Task 2: Typed stops → road-optimized order → Google Maps legs
- [ ] Task 3: Screenshots → addresses → stop list

### Checkpoint: Core
- [ ] A real day, 20+ stops from screenshots, runs end to end on the S26
- [ ] Review with you before Phase 2

### Phase 2: Every day
- [ ] Task 4: Save end place, route and ticks
- [ ] Task 5: Install as an app
- [ ] Task 6: When lookups miss or OSRM is down

### Checkpoint: Complete
- [ ] Every acceptance criterion met on the S26

(Details for each task are in `tasks/todo.md`.)

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Tesseract misreads cluttered screenshots | High | Spike on your real screenshots first. You review and edit the stop list before planning. If OCR is too poor, use a paid Claude API key for scanning (a few cents a scan). |
| OSM is missing some house numbers (Milwaukee test matched only the street) | Med | Flag "street only" stops and let you edit them. If many get flagged, switch to Google Geocoding (free monthly allowance covers about 900 lookups). |
| The public OSRM server is slow or down | Med | Fall back to a straight-line order with a visible notice (Task 6). |
| Nominatim blocks heavy use | Low | 1 request per second, look up each address once per route, cache results in `localStorage`. |
| Brave clears site data | Low | Only the saved route and end place would be lost. Re-entering them takes seconds. |
| The repo is public (free GitHub Pages) | Low | It holds only code: no keys, no addresses. Your stops stay on the phone. |

## Answers (2026-11-02)
- Driving. 20–40 stops a day. Madison–Milwaukee, Wisconsin. Google Maps.
- The start changes each day (usually wherever you are). The end is almost always the same place.

## Open Questions
- Do you have a GitHub account? It's needed for free hosting.
- Can you share 2–3 real screenshots with me (with private details cropped out)? They become the OCR test cases.

## Task 1 results (2026-11-02, S26, Brave)
- The picker opens, and Tesseract reads the screenshots on the phone.
- The screenshots come from a delivery app's **Itinerary List**. Each stop is: an optional business name, the street line in capitals (with `UNIT`/`APT`), then the city alone on the next line (no state or ZIP). The stop badge, the "Expected by" time and a noise line follow.
- **All 8 street lines read cleanly.** The noise lines (status bar, badges, `# H.LO4.0V`) are easy to tell apart, because they don't start with a house number followed by a street suffix.
- One case needs care: a business name that wraps into the address (`SOME BUSINESS WI 4437 19` / `NOTREAL RD`). The house number ends up on the line before the street.
- `findAddresses` therefore joins "street line + next city line" and adds `, WI`. The test case is `tests/ocr/itinerary-list.txt`, with fake street names and the real layout. Real customer addresses never go in the repo.
- Decision: OCR is good enough. No Claude API key is needed. Phase 1 can start.
- Confirmed with you: screenshots always come from the **Amazon Flex** app. The wrapped stop was `4437`, with no `19`, so the expected output `4437 NOTREAL RD` is right. Time windows stay ignored: order by drive time only.

## Phone feedback after Task 4 (2026-11-02)
- "Didn't remember" on the first try: GitHub Pages lets browsers cache files for 10 minutes, so the phone ran the old version that didn't save. In local testing, a cached old `route.js` next to a new `app.js` stopped the app from starting at all. Fix: `sw.js`, a network-first service worker. Every load gets current files, and saved copies are used only offline. Tested in headless Brave: it takes control, reloads cleanly and opens offline. This covers Task 5's offline criterion. The manifest and icon are still to do.
- A stop on Yahara Rd wasn't found: the text reader misread YAHARA as YAHADRA. Even spelled right it failed, because Flex gives the postal city (Stoughton) and OSM files the house under the Town of Pleasant Springs. Fixes: retry the lookup without the city, accepting only an exact house-number match. Each stop it couldn't find is a tap-to-fix button that selects that line in the stop list. Failed lookups are no longer cached.
