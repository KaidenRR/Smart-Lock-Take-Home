# Smart Lock Event Processor — Take-Home

You're joining the team that owns the smart-lock event processor for our
apartment platform. The previous engineer left in a rush and we've got a
stack of open incidents we haven't fully diagnosed. You've been handed the
repo to figure out what's actually going on.

The repo has the Lambda code, some docs, a test harness, and a folder of
evidence snapshots: logs, shadow dumps, DynamoDB scans.

## What we want you to do

Work through the incidents in `incidents/`. Diagnose what you believe is
real and fix what you can.

Not every source in this repo is equally authoritative. Part of the
exercise is deciding what to trust, what to verify, and what remains
uncertain.

## Using AI

Use AI however you'd normally use it. If/when you use it, we just
want to know how you used it: how you directed it, what
you verified independently, and where you chose not to trust it.

## To start debugging

A test harness is available at `test/test.js`.
The harness is useful, but it is not exhaustive.

## What we want to see

- Findings per incident
- Fixes for the bugs you diagnosed
- Enough evidence that another engineer could follow and verify your reasoning
- A note on how you used AI
- At least one concrete verification step you ran yourself (a test, a repro, a log correlation, a targeted code path check)

You don't need to cover every incident exhaustively. We'd rather see a
handful of well-supported conclusions than a long list of speculative
ones. If the repo only supports a partial conclusion, say so. If two
sources conflict, tell us which one you trusted and why.
