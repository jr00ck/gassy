<img src="icons/icon-512.png" width="96" height="96" alt="Gassy icon">

# Gassy

A simple gas fill-up log PWA. Install it to your home screen on iOS, Android, or desktop to use it like a native app — works fully offline once installed.

**Live app:** https://jr00ck.github.io/gassy/

## Features

- **Fields:** date & time, mileage (odometer), price/gallon, total cost, location
- **Auto-decimal price entry** — type digits, no need for a decimal point (assumes the standard trailing 9/10-cent, e.g. typing `349` gives `$3.499`)
- **Live MPG preview** — shown under Mileage as you fill out the form, computed against your most recent prior entry
- **Location lookup** — tap 📍 for your current GPS location, or fill it in automatically from a photo's metadata (see below). Specifically searches for nearby gas stations rather than any random business, with tappable alternatives shown if more than one is nearby
- **Fill from photo** — under the ⚙ Advanced panel: pick a photo (e.g. one taken at the pump) and it reads the date/time and GPS location straight out of the photo's EXIF metadata
- **Tap any log entry** to edit or delete it; a live "Advanced" panel exposes every stored field (entry ID, latitude, longitude, location source) for full transparency and manual correction
- **CSV export** of your full log, including coordinates
- **Pull down to refresh** to check for and install app updates (standard iOS/Android gesture — this app doesn't auto-update in the background)

## Data & privacy

Entries are stored **locally on-device only** (`localStorage`) — nothing is sent to a server. The only network calls are to public, free APIs for location lookups: OpenStreetMap's Nominatim (reverse geocoding) and Overpass (nearby fuel station search), both queried with just coordinates, no personal data.

## Installing

PWA installability is a standard web platform feature, not specific to any one device — this works the same way on iOS, Android, and desktop.

### iOS (Safari)

1. Open https://jr00ck.github.io/gassy/ in Safari.
2. Tap the Share icon → **Add to Home Screen**.

### Android (Chrome / Samsung Internet)

1. Open https://jr00ck.github.io/gassy/ in Chrome or Samsung Internet.
2. You'll typically see an automatic **"Install app" / "Add to Home Screen"** prompt; if not, open the browser menu and choose it manually.

Android's PWA support tends to be more consistent than iOS Safari's (fewer service-worker quirks), and the manifest already includes a maskable icon for Android's adaptive-icon system.

### Desktop (Chrome / Edge)

Click the install icon in the address bar, or use the browser menu → **Install Gassy…**. Opens as its own windowed app.

## Local development

Serve the folder with any static file server, e.g.:

```
python3 -m http.server 8099
```

Then open `http://localhost:8099`.

Note: service workers (and therefore offline support + install prompts) require HTTPS or `localhost` — a plain `http://` LAN address won't register one, though the rest of the app works fine for testing over the local network.

## Releasing

GitHub Pages only deploys on a pushed version tag (`v*`), not on every commit to `main` — see `.github/workflows/deploy.yml`. To ship a change:

```
git tag -a vX.Y.Z -m "vX.Y.Z - short description"
git push origin vX.Y.Z
gh release create vX.Y.Z --title "vX.Y.Z" --notes "..."
```

Also bump `APP_VERSION` in `app.js` — it drives the footer version display and the "✓ Updated" badge shown after a pull-to-refresh picks up a new release.
