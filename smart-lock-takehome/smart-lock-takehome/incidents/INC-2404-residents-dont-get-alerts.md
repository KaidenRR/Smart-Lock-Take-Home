# INC-2404

Residents are missing lock notifications, including security-sensitive ones.
One Park 16 resident reported a forced-open event while they were away and says
no email, SMS, or push ever arrived.

At the same time, a furnished corporate-housing unit reported the opposite
problem: notifications were supposedly disabled for that unit, but processor
activity suggested alert traffic was still being emitted for it.

Artifacts from the main investigation window:

- Processor logs: `artifacts/cloudwatch/processor-prod-2026-04-11.log`
- Dispatcher logs: `artifacts/cloudwatch/dispatcher-prod-2026-04-11.log`
- Corporate-suite unit snapshot: `artifacts/dynamodb/unit-corporate-suite-4b-2026-04-11.json`

Triage believes more than one thing may be wrong here.
