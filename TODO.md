# Gassy backlog

Statuses: `done` · `in progress` · `todo`

## Now / this release

- [x] **done** — Reliability quick wins (network-first service worker, lookup timeouts + cancel safety, price float rounding, quota/corrupt storage handling, CSV formula-safe export, footer contrast, pinch-zoom)
- [x] **done** — When editing an entry with no saved coordinates, don't let 📍 silently replace a typed place name with live GPS (confirm first; empty field still allowed)
- [x] **done** — Add automated tests to the repo (`npm test` / jsdom coverage for form, storage, CSV, locate)
- [x] **done** — Fix date/time field not moving down when the Advanced (⚙) panel expands
- [x] **done** — Delete merged remote branches `claude/session-agzzje` and `claude/location-lookup-triggers-3yyjix`
- [x] **done** — Opened release PR [#8](https://github.com/jr00ck/gassy/pull/8) (`fix/reliability-quick-wins` → `main`, app bumped to 1.10.0)
- [ ] **todo** — After PR #8 merges: tag `v1.10.0` and create the GitHub release so Pages deploys

## Product backlog

- [ ] **todo** — CSV import (restore a previously exported log; separate from export)
- [ ] **todo** — Photo fill: support HEIC / non-JPEG EXIF (or convert before reading), not only JPEG APP1
- [ ] **todo** — Full vs partial fill-up flag *(not handled today — predictions and tank-capacity bounds treat every interval as a full tank, which skews guesses when people top off)*
- [ ] **todo** — Portrait lock on by default; add a Settings checkbox to allow landscape / unlock orientation
- [ ] **todo** — Long log: group entries by calendar month; months older than a threshold collapse by default (tappable to expand). Keep several recent months open — only the latest month open would be too strict at ~2–4 fill-ups/month. Each month header gets a compact summary (fill-up count, total spend, total miles, avg $/gal)
- [ ] **todo** — Vehicle / tank profiles (multiple cars, or at least a named tank capacity instead of inferring from largest fill)
- [ ] **todo** — Rolling MPG chart / sparkline (overall + last N fill-ups) without turning the first screen into a dashboard
- [ ] **todo** — Cost-per-mile and spend-over-time summary (secondary surface, not the hero)
- [ ] **todo** — Optional fuel grade / octane field (for station comparison later)
- [ ] **todo** — Reminder after X miles or Y days since last fill-up (local notification / badge)
- [ ] **todo** — Backup & restore beyond CSV (e.g. one-tap JSON file, or Web Share of the backup)
- [ ] **todo** — Station favorites / recent locations chips (skip a full lookup when you usually fill at the same 1–2 places)
- [ ] **todo** — Accessibility pass (focus order, reduce-motion for pull-to-refresh, larger tap targets review)
- [ ] **todo** — CI: run the automated test suite on PRs
