# Changelog

## 0.7.4 — 2026-04-12

### Fixed
- Tightened `mapLockState` to handle vendor-specific raw event names
  (`auto_locked`, `manually_locked`, `keypad_unlocked`, `remote_unlocked`).
  Previously these were falling through to the default `notify: false`
  branch and being recorded as raw vendor strings in the shadow.

## 0.7.3 — 2026-04-05

### Fixed
- `dedup.isDuplicate` now writes a record before returning `false` so that
  legitimate retransmissions within the TTL window are filtered out. The
  previous implementation only checked existence — so a real MQTT
  retransmission would always be processed twice. (Regression from 0.7.0.)

### Changed
- Bumped `DEDUP_TTL_MINUTES` default from 2 to 5.

## 0.7.2 — 2026-03-30

### Added
- `unit.notifications.channel` field is now read by callers so notifications
  can be routed to non-default channels per-unit. (No callers use this yet.)

## 0.7.1 — 2026-03-21

### Changed
- Logger now stringifies `extra` payloads to one line for easier CloudWatch
  Logs Insights queries. No behavior change.

## 0.7.0 — 2026-03-14

### Changed
- Refactored handler into per-concern modules (`topic.js`, `dedup.js`,
  `shadow.js`, `state-map.js`, `notifications.js`, `unit.js`). Behavior
  preserved.
- MQTT topic format extended to include tenant: `v/{tenant}/{unit}/lock/{event}`.
  Previously: `v/{unit}/lock/{event}`. The lock processor's `parseTopic`
  was updated for the new format.

## 0.6.0 — 2026-02-28

### Added
- Notification publish for `tamper` and `offline` events.
- New canonical states `battery_critical` and `tamper`.

## 0.5.0 — 2026-02-12

### Added
- Initial release of the deduplication layer.
