# INC-2406

Firmware 2.5.0 adds a 5-second battery telemetry stream. During staged rollout,
firmware noticed the shadow's `battery_pct` sometimes moved backward in time.
The value would briefly show the newest report, then revert to something 30s–2m
older.

Artifacts attached from one rollout unit:

- Processor log excerpt: `artifacts/cloudwatch/processor-battery-rollout-2026-04-08.log`
- Shadow snapshots over the same window:
  `artifacts/shadows/battery-rollout-shadow-history-2026-04-08.ndjson`

No corresponding Lambda errors were called out in the ticket.