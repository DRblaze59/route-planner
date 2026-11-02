# Route Planner

A personal web app for planning a day of 20–40 driving stops in the Madison–Milwaukee area. You give it screenshots of your stops. It reads the addresses on the phone, orders the stops by drive time (OSRM), and opens the route in Google Maps, up to 9 stops per link.

Status: Tasks 2–4 done (screenshot import, drive-time order, Google Maps legs, saved route and ticks). See `tasks/plan.md` and `tasks/todo.md`.

Tests: `node --test`

Hosted on GitHub Pages. No build step:

```bash
python3 -m http.server 8000
```
