# Notification Dispatcher Contract

The `IoT_Email_SMS_Dispatcher` Lambda subscribes to
`v/{unit_id}/message/default/send` and turns inbound publishes into emails,
SMS messages, and push notifications based on the per-resident contact
preferences stored in the unit record.

This document defines the contract that publishers (including this lock
processor) must conform to.

## Inbound Payload Schema

```json
{
  "template": "lock_jammed_notify",
  "parameters": {
    "lock_name": "Front Door Lock",
    "state": "jammed",
    "unit_name": "Unit 301",
    "severity": "warn"
  },
  "recipients": [
    {
      "name": "Jane Doe",
      "email": "jane@example.com",
      "phone": "+15555550101",
      "preferences": {
        "email": true,
        "sms": true,
        "push": false
      }
    }
  ]
}
```

### Required fields

| Field        | Required | Notes |
|--------------|----------|-------|
| `template`   | yes      | Must match a template registered in the dispatcher's template registry. Unknown templates → log + drop. |
| `parameters` | yes      | Free-form key/value pairs interpolated into the template. Missing keys render as the literal `{{key}}` placeholder. |
| `recipients` | yes      | Non-empty array. **Without `recipients`, the dispatcher has no way to know who to notify** — it logs a warning and drops the message. |

### Recipient shape

Every recipient object must include at least one of `email` or `phone`. The
dispatcher uses the recipient's `preferences` (which channels they've
opted into) to decide which transport(s) to use; recipients with all
channels disabled are skipped silently.

## Honoring Unit-Level Notification Settings

The unit record (see `unit-schema.md`) includes a `notifications` block:

```json
{
  "notifications": {
    "enabled": true,
    "channel": "default"
  }
}
```

If `notifications.enabled === false`, **publishers must not publish at all**.
The dispatcher does not enforce this — it is the publisher's responsibility.
This matters because some properties (corporate housing, model units,
maintenance vacancies) intentionally suppress all notifications.

## Idempotency

The dispatcher itself does not deduplicate. Publishers are expected to
have already deduplicated upstream. Publishing the same notification
twice will produce two emails / SMS / pushes per recipient.

## Failure modes

The dispatcher itself does not surface delivery failures back to publishers.
If a publish reaches the dispatcher and is well-formed, it returns 2xx and
the publisher has no signal as to whether downstream delivery succeeded.
Failures are visible only in the dispatcher's own CloudWatch logs.
