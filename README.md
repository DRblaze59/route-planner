# Route Planner

A personal web app for planning a day of 20–40 driving stops in the Madison–Milwaukee area. You give it screenshots of your stops. It reads the addresses on the phone, orders the stops by drive time (OSRM), and opens the route in Google Maps, up to 9 stops per link.

Status: Tasks 1–6 done (screenshot import, drive-time order, Google Maps legs, saved route and ticks, installable app, straight-line fallback), plus optional Google address lookup. See `tasks/plan.md` and `tasks/todo.md`.

Tests: `node --test`

Hosted on GitHub Pages. No build step:

```bash
python3 -m http.server 8000
```

## Google address lookup (optional)

Without a key, addresses are found with OpenStreetMap (free, 1 per second). With one, Google finds them.
The key is pasted into the app under "Google address lookup" and stays on the phone; it never goes in this repo.

1. In the Google Cloud console, create a project and turn on billing.
2. Enable the **Maps JavaScript API** and the **Geocoding API**.
3. Create an API key. Restrict it to websites `https://drblaze59.github.io/*` (and `http://localhost:8000/*` for testing), and to those two APIs.
4. Set a daily quota on the Geocoding API (for example 300 a day) and a budget alert.
