# INC-2402

During the storm, swollen frames caused repeated jam conditions across roughly
40 units. Residents described multiple jam attempts but usually received only a
single alert.

Artifacts pulled from one representative unit:

- IoT Core event window: `artifacts/iot-core/coastal-storm-jams-2026-03-27.ndjson`
- Dispatcher receive log for the same window:
  `artifacts/cloudwatch/dispatcher-prod-2026-03-27.log`

We want to know whether these are genuine duplicate retries, distinct events
being collapsed incorrectly, or something downstream of this processor.
