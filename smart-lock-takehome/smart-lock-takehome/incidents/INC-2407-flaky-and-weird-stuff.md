# INC-2407

Small issues that do not escalate on their own, but together suggest this
service still has correctness problems beyond the headline incidents.

Observed symptoms:

- A resident at unit 301 saw another resident's name in a notification about
  her own door.
- Roughly half of metric events are landing in analytics with `tenant=unknown`.
- A staging spike from the dispatcher team showed a well-formed publish shape
  except that the resolved recipient list was empty.

Useful starting points:

- Metrics sample: `artifacts/cloudwatch/metrics-emf-sample-2026-04-14.log`
- Notification / triage window: `artifacts/cloudwatch/dispatcher-prod-2026-04-11.log`
- Staging lookup notes: `artifacts/cloudwatch/staging-triage-2026-04-15.log`

This may be one bug, three bugs, or a combination of a real bug and a false
lead. Treat it that way.
