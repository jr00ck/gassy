# Changelog

All notable changes to Gassy are listed here.
Generated with [git-cliff](https://git-cliff.org); keep commits conventional when you can.

<!-- git-cliff: end of header -->
## [1.11.1] - 2026-10-08

### Features

- Portrait lock by default and disable pinch-zoom
## [1.11.0] - 2026-10-08

### Features

- Month-grouped log, MPG trend, a11y, and structured changelog

### Other

- Mark v1.10.0 release steps done in the backlog
## [1.10.0] - 2026-10-08

### Other

- Update README with current features, Android/desktop install, and release process
- Add app icon to README
- Fix repeated location lookup re-triggering on field blur ([#2](https://github.com/jr00ck/gassy/pull/2))
- Fix price/gallon rounding in log list; widen fuel station search ([#3](https://github.com/jr00ck/gassy/pull/3))
- Re-lookup from saved coordinates when editing an entry ([#4](https://github.com/jr00ck/gassy/pull/4))
- Predict mileage, price/gallon, and total cost as ghost placeholders ([#5](https://github.com/jr00ck/gassy/pull/5))
- Predicted placeholders: fix load-time bug, keep them hint-only, add storage size badge ([#6](https://github.com/jr00ck/gassy/pull/6))
- Fix footer legibility and bump version to 1.9.0 ([#7](https://github.com/jr00ck/gassy/pull/7))
- Ship v1.10.0 reliability fixes, tests, and safer edit GPS
- Mark release PR opened; leave post-merge tagging on the backlog
- Clarify backlog items for MPG viz, reminders, and station chips
## [1.7.5] - 2026-07-16

### Other

- Only run location lookup on explicit action, not on app open ([#1](https://github.com/jr00ck/gassy/pull/1))
## [1.7.4] - 2026-07-15

### Other

- Don't fall back to an unrelated business when no fuel station is nearby
## [1.7.3] - 2026-07-15

### Other

- Prefer nearby fuel stations over random businesses; security + review fixes
## [1.7.2] - 2026-07-15

### Other

- Add gallons to live MPG preview text
## [1.7.1] - 2026-07-15

### Other

- Refine Advanced panel, MPG wording, and price entry
## [1.7.0] - 2026-07-15

### Other

- Add live MPG preview to the form
## [1.6.2] - 2026-07-15

### Other

- Reposition Advanced toggle; merge location status/address into one line
- Deploy to Pages only on version tags, not every push
## [1.6.1] - 2026-07-15

### Other

- Add Advanced panel exposing raw fields; fix edit-mode gaps
## [1.6.0] - 2026-07-15

### Other

- Replace delete icon with tap-to-edit; add missing-GPS recovery flow
## [1.5.2] - 2026-07-15

### Other

- Make "Fill from photo" a subtle icon instead of a full-width button
## [1.5.1] - 2026-07-15

### Other

- Fix pull-to-refresh to move the whole page, not just the indicator
## [1.5.0] - 2026-07-15

### Other

- Replace update banner with pull-to-refresh; auto-decimal pricing; address display
## [1.4.0] - 2026-07-15

### Other

- Add gas station fallback lookup; include coordinates in CSV export
## [1.3.0] - 2026-07-15

### Other

- Add photo-based autofill; improve location precision
## [1.2.0] - 2026-07-15

### Other

- Fix stuck update banner; add release notes preview
## [1.1.0] - 2026-07-15

### Other

- Add in-app update notification; restyle version footer
## [1.0.0] - 2026-07-15

### Other

- Initial commit: Gassy gas log PWA
- Add version footer to UI
