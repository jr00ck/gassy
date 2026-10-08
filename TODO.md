# Gassy — feature backlog

What's in the app already and what's still on the wishlist.
Written for humans (including non-devs); a bit of product/dev wording is fine when it
makes a feature clearer.

---

## In the app today

- Reliability basics: offline-friendly updates, safer location lookup, formula-safe CSV export, clearer storage errors
- Editing a fill-up without saved GPS won't silently overwrite a typed place name
- Live MPG preview while you fill out the form
- Predicted mileage / price / total as ghost placeholders (hints only)
- Fill from photo (JPEG EXIF date + GPS)
- Nearby gas-station lookup — auto-fills only when a station is truly close; farther matches stay as tappable suggestions with an empty field + “none nearby”
- CSV **export and import** (backup / restore) near the footer
- Pull down to refresh for app updates, with a ✓ Updated badge that shows what's new as a short bullet list
- Changelog tooling: Conventional Commits + [git-cliff](https://git-cliff.org) (`npm run changelog` → `CHANGELOG.md`)
- Long log by month — all months collapsed on load for at-a-glance summaries; tap to expand with a short animation
- New fill-ups open their month and arrive with a highlight animation so you can confirm what you just logged
- MPG trend — compact sparkline of recent per-fill-up MPG plus overall average, under the log
- Accessibility pass — clearer focus, larger tap targets, calmer pull-to-refresh when Reduce Motion is on
- Web manifest requests portrait for installed apps (honored on Android; **iOS home-screen apps ignore orientation**)
- No pinch / tap-to-zoom — viewport locked for a more installed-app feel

---

## Wishlist

- **Photo fill beyond JPEG** — HEIC / other formats (or convert before reading EXIF), not only JPEG APP1
- **Full vs partial fill-up** — mark top-offs so predictions and tank-capacity bounds aren't skewed by treating every interval as a full tank
- **Allow landscape** — optional Settings toggle to unlock orientation where the platform supports it (portrait stays the default)
- **Vehicle / tank profiles** — multiple cars, or at least a named tank capacity instead of guessing from the largest fill
- **Cost-per-mile & spend over time** — summary on a secondary surface, not the hero
- **Backup & restore beyond CSV** — e.g. one-tap JSON file, or Web Share of the backup
- **Quick-pick stations** — remember places you've logged (and/or pinned favorites) as tappable chips near Location
