# Route Planner: Tasks

No build step. Files sit at the repo root and are served by GitHub Pages.
- Test: `node --test` (pure logic in `route.js`)
- Local preview: `python3 -m http.server 8000`, then open http://localhost:8000
- Check on the phone: the GitHub Pages URL in Brave on the S26

## Task 1: Repo, hosting and OCR spike
**Description:** Create the project folder and GitHub repo, turn on Pages, and publish a spike page. On the page, you pick screenshots and Tesseract.js reads them, showing the raw text.
**Acceptance criteria:**
- [x] The Pages URL opens in Brave on the S26
- [x] Choosing screenshots opens the Android picker and shows the read text for each one
- [x] For your real screenshots, it's written down which addresses came through cleanly and which got garbled
**Verification:**
- [x] Manual check on the S26. The OCR text of each screenshot is saved as a test case: `tests/ocr/*.txt`
**Dependencies:** None
**Files:** `index.html`, `README.md`
**Scope:** XS

## Checkpoint: Spike
- [x] OCR is good enough to fix by hand. Otherwise switch scanning to a paid Claude API key before Task 3.

## Task 2: Typed stops → road-optimized order → Google Maps legs
**Description:** An optional start field (blank means "where I am"), an end field and a box with one stop per line. "Plan route" looks up each address with Nominatim (1 per second, with progress), gets drive times from OSRM `table`, orders the stops with `order()`, then shows the numbered list, the total drive time and Leg 1…N Google Maps buttons.
**Acceptance criteria:**
- [ ] `legs(stops, end)` splits into links of at most 9 waypoints, each leg starting at the previous leg's last stop. Tests cover 0, 1, 9, 10 and 40 stops: every stop appears exactly once, and legs join end to start
- [ ] With a blank start, `order()` picks the best first stop, and Leg 1 has no `origin`. Tests for `order()`: points on a line come back in order, the end stays last, 0 and 1 stops work
- [ ] Maps links carry the address text, not coordinates
**Verification:**
- [ ] `node --test` passes
- [ ] Manual check: 10 real stops → sensible order → each leg opens in Maps on the S26 with every stop
**Dependencies:** Task 1
**Files:** `index.html`, `app.js`, `route.js`, `route.test.js`
**Scope:** M

## Task 3: Screenshots → addresses → stop list
**Description:** "Import screenshots" runs Tesseract on each image. Then `findAddresses(text)` pulls out street addresses, duplicates are removed, and the addresses are added to the stop box for review.
**Acceptance criteria:**
- [ ] `findAddresses` finds every address in the `tests/ocr/*.txt` cases, including Wisconsin grid addresses (`W204N11509 Goldendale Rd`), and ignores phone numbers, times and names
- [ ] An address already in the list (same text, ignoring case and spacing) isn't added twice
- [ ] Each image shows progress while it's read
**Verification:**
- [ ] `node --test` passes
- [ ] Manual check: 2 real screenshots → correct stops → plan → Maps
**Dependencies:** Task 2
**Files:** `app.js`, `route.js`, `route.test.js`, `index.html`
**Scope:** M

## Checkpoint: Core
- [ ] A real day, 20+ stops from screenshots, runs end to end on the S26
- [ ] You review it before Phase 2

## Task 4: Save end place, route and ticks
**Description:** Store the default end place, the planned route and ticked-off stops in `localStorage` (inside try/catch). Tapping a stop marks it done. The Maps buttons then cover only the stops that are left.
**Acceptance criteria:**
- [ ] Closing and reopening the app restores the route and the ticks
- [ ] The end field is pre-filled with the saved end place
- [ ] Looked-up addresses are cached, so planning again doesn't repeat Nominatim requests
**Verification:**
- [ ] Manual check: plan, tick 3 stops, swipe the app away, reopen, and the state is unchanged
**Dependencies:** Task 3
**Files:** `app.js`, `index.html`
**Scope:** S

## Task 5: Install as an app
**Description:** Add a manifest, an icon and a service worker that caches the app's own files. Brave → "Install app" then gives a full-screen app with its own icon.
**Acceptance criteria:**
- [x] Brave offers "Install app", and the installed app opens without the browser bar
- [x] The app's screen loads with no signal (planning still needs signal, and it says so)
**Verification:**
- [x] Manual check on the S26: install it, turn on airplane mode, open it, and the screen loads
**Dependencies:** Task 4
**Files:** `manifest.webmanifest`, `sw.js`, `icon.svg`, `index.html`
**Scope:** S

## Task 6: When lookups miss or OSRM is down
**Description:** Mark stops that only matched the street, or didn't match, as "check", and let you edit them and plan again. If OSRM fails, order the stops by straight-line distance (nearest-neighbour + 2-opt, fixed end) and show a notice.
**Acceptance criteria:**
- [ ] Stops not found are listed by name and never silently dropped
- [ ] Tests for the straight-line fallback cover: points on a line come back in order, and the end stays last
- [ ] OSRM failing still produces Maps legs, with a notice
**Verification:**
- [ ] `node --test` passes. Manual check: with a made-up address in the list, it gets flagged and the others still plan
**Dependencies:** Task 3
**Files:** `app.js`, `route.js`, `route.test.js`
**Scope:** S

## Checkpoint: Complete
- [ ] Every acceptance criterion met on the S26
