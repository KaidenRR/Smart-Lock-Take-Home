# Smart Lock Processor — Operational Runbook

## Health Checks

- CloudWatch alarm: `SmartLockProcessor-ErrorRate` (>1% errors over 5m)
- CloudWatch alarm: `SmartLockProcessor-DurationP99` (>3s)
- CloudWatch alarm: `SmartLockProcessor-DLQ-Depth` (>10 messages)

## Standard checks on incident report

1. Pull the unit's events from IoT Core message logs for the time window.
2. Pull the Lambda's CloudWatch logs for the same window. Filter by `unitId`.
3. Pull the dispatcher Lambda's CloudWatch logs to confirm whether downstream
   actually received what the lock processor logged as sent.
4. If shadow state is in question, dump the shadow document via:
   `aws iot-data get-thing-shadow --thing-name <unit_id> --shadow-name <sensor_id>`.
5. Compare timestamps carefully. We log and store in UTC.

## Local Evidence Snapshots

This repo includes a small set of evidence snapshots under `artifacts/`.
They were copied from production and staging while triaging the current open
incidents.

Caveats:

- snapshots are partial, not full exports
- staging behavior is useful but not authoritative for production
- absence of a log line is weaker evidence than presence of one
- some captures were taken minutes after the user-visible symptom

## DynamoDB TTL troubleshooting

DynamoDB's TTL reaper typically runs within 48 hours of an item's expiration.
A few behaviors to keep in mind when auditing tables with TTL enabled:

- items with malformed TTL values are deleted immediately by DynamoDB's sweeper
- items whose TTL attribute is missing entirely are kept forever
- TTL evictions consume no provisioned throughput and do not show up in
  PutItem/DeleteItem CloudWatch metrics
- the clearest signal is `TimeToLiveDeletedItemCount`

If you suspect TTL isn't working, scan a few items and verify that the TTL
attribute exists and contains a valid future epoch second.

## When you can't reproduce locally

- Extend the harness in `test/` rather than guessing.
- Real IoT Core does not always behave like the mock.
- Real `GetThingShadow` returns `ResourceNotFoundException` for shadows that do
  not exist yet; the mock tolerates missing shadows.
- Real publishes are async over the network and can take 50–500ms even on a
  warm connection; the mock resolves quickly.

## Recent incidents

See `incidents/` for the active investigations.
