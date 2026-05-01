# Unit Record Schema

Stored in the `Unit-{environment}` DynamoDB table. Managed by the property
onboarding pipeline; the lock processor only reads.

```json
{
  "id": "7720fc98-1257-4a2e-9abb-55dc3dd5a54b",
  "name": "Unit 301",
  "status": "ACTIVE",
  "tenant_id": "acme",
  "notifications": {
    "enabled": true,
    "channel": "default"
  },
  "residents": [
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
  ],
  "address": "...",
  "created_at": "2024-09-12T10:00:00.000Z"
}
```

## Field notes

- `status` — `ACTIVE | VACANT | MAINTENANCE | OFFBOARDED`. Only `ACTIVE`
  units should produce notifications, but the lock processor itself does
  not gate on this — that's enforced upstream by the IoT Core rule that
  filters topics to active units.

- `notifications.enabled` — global on/off switch for the unit. **Honored
  by every notification publisher.** When `false`, publishers must not
  emit notification publishes at all (the dispatcher does not enforce
  this; see `dispatcher-contract.md`).

- `residents` — array of resident records. Used by notification
  publishers to populate the `recipients` field of the dispatcher payload.
  May be empty for vacant units.
