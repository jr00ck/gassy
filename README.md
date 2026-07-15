# Gassy

A simple gas fill-up log PWA. Add to Home Screen on iOS to use it like a native app.

## Fields

- Date & time (defaults to now)
- Mileage (odometer)
- Price per gallon
- Total cost
- Location (defaults to current location via device GPS, reverse-geocoded)

Entries are stored locally on-device (`localStorage`) — nothing is sent to a server, aside from an optional reverse-geocoding lookup against OpenStreetMap's Nominatim API when filling in the location field.

## Install on iOS

1. Serve this folder over HTTPS (e.g. GitHub Pages, or any static host — iOS requires HTTPS for service workers, except on `localhost`).
2. Open the URL in Safari on iOS.
3. Tap the Share icon → **Add to Home Screen**.

## Local development

Serve the folder with any static file server, e.g.:

```
python3 -m http.server 8080
```

Then open `http://localhost:8080`.
