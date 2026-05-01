# INC-2401

A resident reported that the mobile app showed her door as locked when it was
not. Staff reproduced the same symptom on a second unit later that day.

What triage already pulled:

- IoT Core message excerpt: `artifacts/iot-core/park16-state-mismatch-2026-04-09.ndjson`
- Shadow snapshot taken shortly after reproduction:
  `artifacts/shadows/unit-301-front-door-2026-04-09.json`

Open question:

Is this an app bug, a shadow-write bug, or bad interpretation of an otherwise
valid lock event?
