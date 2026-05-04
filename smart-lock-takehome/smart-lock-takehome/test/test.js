if (!process.env.LOG_LEVEL) {
  process.env.LOG_LEVEL = "SILENT";
}

const path = require("path");

const shadows = {};
const dedupTable = {};
const unitTable = {
  "7720fc98-1257-4a2e-9abb-55dc3dd5a54b": {
    id: "7720fc98-1257-4a2e-9abb-55dc3dd5a54b",
    name: "Unit 301",
    status: "ACTIVE",
    tenant_id: "acme",
    notifications: { enabled: true, channel: "default" },
    residents: [
      {
        name: "Jane Doe",
        email: "jane@example.com",
        phone: "+15555550101",
        preferences: { email: true, sms: true, push: false },
      },
      {
        name: "John Doe",
        email: "john@example.com",
        phone: "+15555550102",
        preferences: { email: true, sms: false, push: true },
      },
    ],
  },
  "11111111-2222-3333-4444-555555555555": {
    id: "11111111-2222-3333-4444-555555555555",
    name: "Corporate Suite 4B",
    status: "ACTIVE",
    tenant_id: "acme",
    notifications: { enabled: false, channel: "default" },
    residents: [
      {
        name: "Building Manager",
        email: "manager@example.com",
        phone: "+15555550200",
        preferences: { email: true, sms: false, push: false },
      },
    ],
  },
  "7720fc98-aaaa-bbbb-cccc-dddddddddddd": {
    id: "7720fc98-aaaa-bbbb-cccc-dddddddddddd",
    name: "Unit 612",
    status: "ACTIVE",
    tenant_id: "beacon",
    notifications: { enabled: true, channel: "default" },
    residents: [
      {
        name: "Alex Chen",
        email: "alex@example.com",
        phone: "+15555550600",
        preferences: { email: true, sms: true, push: true },
      },
    ],
  },
};

const publishedMessages = [];

class ValidationException extends Error {
  constructor(msg) {
    super(msg);
    this.name = "ValidationException";
  }
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

const projectItem = (item, projectionExpression, attrNames) => {
  if (!item || !projectionExpression) return item;

  const fields = projectionExpression.split(",").map((value) => value.trim());
  const out = {};

  for (const field of fields) {
    let actual = field;
    if (field.startsWith("#")) {
      if (!attrNames || !(field in attrNames)) {
        throw new ValidationException(`ExpressionAttributeNames contains invalid key: ${field}`);
      }
      actual = attrNames[field];
    }
    if (actual in item) out[actual] = item[actual];
  }

  return out;
};

const mockIoTSend = async (command) => {
  const name = command.constructor.name;
  await tick();

  if (name === "GetThingShadowCommand") {
    const key = `${command.input.thingName}:${command.input.shadowName}`;
    const shadow = shadows[key] || { state: { reported: {} } };
    return { payload: new TextEncoder().encode(JSON.stringify(shadow)) };
  }

  if (name === "UpdateThingShadowCommand") {
    const key = `${command.input.thingName}:${command.input.shadowName}`;
    const incoming = JSON.parse(command.input.payload);
    const existing = shadows[key] || { state: { reported: {} } };
    const mergedReported = {
      ...(existing.state?.reported || {}),
      ...(incoming.state?.reported || {}),
    };
    shadows[key] = { state: { reported: mergedReported } };
    return {};
  }

  if (name === "PublishCommand") {
    publishedMessages.push({
      topic: command.input.topic,
      payload: JSON.parse(command.input.payload),
      qos: command.input.qos,
    });
    return {};
  }

  throw new Error(`Unmocked IoT command: ${name}`);
};

const mockDynamoSend = async (command) => {
  const name = command.constructor.name;
  await tick();
  const table = command.input.TableName;

  if (name === "GetCommand") {
    if (table.includes("Dedup")) {
      const item = dedupTable[command.input.Key.messageHash];
      return { Item: item || undefined };
    }

    const id = command.input.Key.id;
    const raw = unitTable[id];
    if (!raw) return { Item: undefined };

    return {
      Item: projectItem(
        raw,
        command.input.ProjectionExpression,
        command.input.ExpressionAttributeNames
      ),
    };
  }

  if (name === "PutCommand") {
    if (table.includes("Dedup")) {
      dedupTable[command.input.Item.messageHash] = command.input.Item;
      return {};
    }
    return {};
  }

  throw new Error(`Unmocked DynamoDB command: ${name}`);
};

const Module = require("module");
const originalRequire = Module.prototype.require;

Module.prototype.require = function (id) {
  if (id === "@aws-sdk/client-iot-data-plane") {
    return {
      IoTDataPlaneClient: class { send = mockIoTSend; },
      PublishCommand: class { constructor(input) { this.input = input; } },
      GetThingShadowCommand: class { constructor(input) { this.input = input; } },
      UpdateThingShadowCommand: class { constructor(input) { this.input = input; } },
    };
  }

  if (id === "@aws-sdk/client-dynamodb") {
    return {
      DynamoDBClient: class { constructor() {} },
    };
  }

  if (id === "@aws-sdk/lib-dynamodb") {
    return {
      DynamoDBDocumentClient: { from: () => ({ send: mockDynamoSend }) },
      GetCommand: class { constructor(input) { this.input = input; } },
      PutCommand: class { constructor(input) { this.input = input; } },
    };
  }

  return originalRequire.apply(this, arguments);
};

const { handler } = require(path.resolve(__dirname, "..", "src", "handler.js"));

const TENANT = "acme";
const UNIT = "7720fc98-1257-4a2e-9abb-55dc3dd5a54b";

let eventCounter = 0;
const makeEvent = (overrides = {}) => ({
  topic: `v/${TENANT}/${UNIT}/lock/state_change`,
  event_id: `evt_${Date.now()}_${++eventCounter}`,
  state: "locked",
  sensor_id: "front_door_lock",
  device_name: "Front Door Lock",
  entity_id: "lock.front_door",
  battery_pct: 87,
  timestamp: new Date().toISOString(),
  ...overrides,
});

const reset = () => {
  Object.keys(shadows).forEach((key) => delete shadows[key]);
  Object.keys(dedupTable).forEach((key) => delete dedupTable[key]);
  publishedMessages.length = 0;
};

let passed = 0;
let failed = 0;
const assert = (condition, name, detail) => {
  if (condition) {
    console.log(`  PASS: ${name}`);
    passed++;
    return;
  }

  console.log(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  failed++;
};

const runTests = async () => {
  console.log("\n=== Smart Lock Processor Tests ===\n");

  console.log("Scenario 1: representative event is accepted");
  reset();
  try {
    const result = await handler(makeEvent());
    assert(result.statusCode === 200, "Returns 200 OK", `Got ${result.statusCode} ${result.body}`);
  } catch (error) {
    assert(false, "Returns 200 OK", error.message);
  }

  console.log("\nScenario 2: identical retransmission is collapsed");
  reset();
  try {
    const event = makeEvent();
    await handler(event);
    const result = await handler(event);
    assert(result.body === "Duplicate", "Second identical event is duplicate", `Got ${result.body}`);
  } catch (error) {
    assert(false, "Retransmission handling", error.message);
  }

  console.log("\nScenario 3: externally visible notification side effects complete before success return");
  reset();
  try {
    const result = await handler(makeEvent({
      topic: `v/${TENANT}/${UNIT}/lock/forced_open`,
      state: "forced_open",
    }));
    assert(result.statusCode === 200, "Returns 200 OK", `Got ${result.statusCode}`);
    assert(publishedMessages.length === 1,
      "One notification publish is observable immediately after success return",
      `Observed ${publishedMessages.length}`);
  } catch (error) {
    assert(false, "Notification boundary", error.message);
  }

  console.log("\nScenario 4: representative state-change sequence preserves semantics");
  reset();
  try {
    await handler(makeEvent({ state: "locked" }));
    const lockedShadow = shadows[`${UNIT}:front_door_lock`];
    assert(lockedShadow?.state?.reported?.state === "locked",
      "Locked event leaves shadow in locked state",
      `Got '${lockedShadow?.state?.reported?.state}'`);

    reset();
    await handler(makeEvent({ state: "unlocked" }));
    const unlockedShadow = shadows[`${UNIT}:front_door_lock`];
    assert(unlockedShadow?.state?.reported?.state === "unlocked",
      "Unlocked event leaves shadow in unlocked state",
      `Got '${unlockedShadow?.state?.reported?.state}'`);
  } catch (error) {
    assert(false, "State semantics", error.message);
  }

  console.log("\nScenario 5: topic-derived classification matches the topic suffix");
  reset();
  try {
    await handler(makeEvent({
      topic: `v/${TENANT}/${UNIT}/lock/jammed`,
      state: "jammed",
    }));
    const shadow = shadows[`${UNIT}:front_door_lock`];
    assert(shadow?.state?.reported?.event_type === "jammed",
      "Shadow records the event type from the topic suffix",
      `Got '${shadow?.state?.reported?.event_type}'`);
  } catch (error) {
    assert(false, "Topic-derived classification", error.message);
  }

  console.log("\nScenario 6: warm-container lookups stay isolated across units");
  reset();
  try {
    const { getUnit } = require(path.resolve(__dirname, "..", "src", "unit.js"));
    const first = await getUnit(UNIT);
    const second = await getUnit("7720fc98-aaaa-bbbb-cccc-dddddddddddd");
    assert(first?.name === "Unit 301", "First lookup returns Unit 301", `Got '${first?.name}'`);
    assert(second?.name === "Unit 612", "Second lookup returns Unit 612", `Got '${second?.name}'`);
    assert(second?.residents?.[0]?.name === "Alex Chen",
      "Second lookup returns Unit 612 resident data",
      `Got '${second?.residents?.[0]?.name}'`);
  } catch (error) {
    assert(false, "Warm-container lookup isolation", error.message);
  }

  console.log("\nScenario 7: derived tenant dimension is stable under repetition");
  reset();
  try {
    const { extractTenant } = require(path.resolve(__dirname, "..", "src", "metrics.js"));
    const topic = `v/${TENANT}/${UNIT}/lock/state_change`;
    let unknownCount = 0;
    for (let i = 0; i < 100; i++) {
      if (extractTenant(topic) === "unknown") unknownCount++;
    }
    assert(unknownCount === 0,
      "All 100 repeated extractions produce a tenant",
      `Unknown count ${unknownCount}`);
  } catch (error) {
    assert(false, "Tenant dimension stability", error.message);
  }

    console.log("\nScenario 8: distinct jam events with unique event_ids are not collapsed");
    reset();
    try {
        const base = {
            topic: `v/${TENANT}/${UNIT}/lock/jammed`,
            state: "jammed",
            sensor_id: "front_door_lock",
        };

        const result1 = await handler(makeEvent({ ...base, event_id: "evt_01JP3J3Y2R5STCF8T1J0A5JRM1" }));
        const result2 = await handler(makeEvent({ ...base, event_id: "evt_01JP3J4Z3YZV4QG91G7FB6YCMM" }));
        const result3 = await handler(makeEvent({ ...base, event_id: "evt_01JP3J6E65A9NQPZ0EZXWMS6H4" }));

        assert(result1.body === "OK", "First jam event is processed", `Got ${result1.body}`);
        assert(result2.body === "OK", "Second jam event is processed, not collapsed", `Got ${result2.body}`);
        assert(result3.body === "OK", "Third jam event is processed, not collapsed", `Got ${result3.body}`);
        assert(publishedMessages.length === 3, "Three notifications published", `Got ${publishedMessages.length}`);
    } catch (error) {
        assert(false, "Distinct jam dedup", error.message);
    }

    console.log("\nScenario 9: notifications are suppressed when the unit has notifications.enabled = false");
    reset();
    try {
        const CORP_UNIT = "11111111-2222-3333-4444-555555555555";
        const result = await handler(makeEvent({
            topic: `v/acme/${CORP_UNIT}/lock/jammed`,
            state: "jammed",
            sensor_id: "front_door_lock",
            event_id: `evt_disabled_unit_${Date.now()}`,
        }));
        assert(result.statusCode === 200,
            "Handler returns 200 for disabled-notification unit",
            `Got ${result.statusCode} ${result.body}`);
        assert(publishedMessages.length === 0,
            "No notification is published when unit.notifications.enabled is false",
            `Got ${publishedMessages.length} publish(es): ${JSON.stringify(publishedMessages.map(m => m.topic))}`);
    } catch (error) {
        assert(false, "Notification suppression for disabled unit", error.message);
    }

    console.log("\nScenario 10 (INC-2405): extractTenant resolves correctly for UUID and non-UUID unit IDs");
    reset();
    try {
        const { extractTenant } = require(path.resolve(__dirname, "..", "src", "metrics.js"));

        // Part A: UUID unit ID — the happy path that was already working
        const uuidTopic = `v/acme/7720fc98-1257-4a2e-9abb-55dc3dd5a54b/lock/jammed`;
        assert(
            extractTenant(uuidTopic) === "acme",
            "UUID unit ID: tenant resolves to 'acme'",
            `Got '${extractTenant(uuidTopic)}'`
        );

        // Part B: non-UUID unit ID — the pattern seen in the EMF sample that produced "unknown"
        const shortIdTopic = `v/acme/unit-301/lock/forced_open`;
        assert(
            extractTenant(shortIdTopic) === "acme",
            "Non-UUID unit ID: tenant still resolves to 'acme', not 'unknown'",
            `Got '${extractTenant(shortIdTopic)}'`
        );

        // Part C: parseTopic returns the subtype (parts[4]), not the category segment (parts[3])
        const { parseTopic } = require(path.resolve(__dirname, "..", "src", "topic.js"));
        const subtypes = ["jammed", "forced_open", "tamper", "battery_low", "state_change"];
        for (const subtype of subtypes) {
            const { eventType } = parseTopic(`v/acme/${UNIT}/lock/${subtype}`);
            assert(
                eventType === subtype,
                `parseTopic eventType is '${subtype}', not the category segment 'lock'`,
                `Got '${eventType}'`
            );
        }
    } catch (error) {
        assert(false, "INC-2405 metric dimensions", error.message);
    }

    console.log("\nScenario 11 (INC-2406): stale battery telemetry does not overwrite a fresher reading");
    reset();
    try {
        // Reproduces the exact sequence captured in the rollout artifacts:
        //   Event A arrives at 18:22:11.014 with eventTimestamp 18:22:11 → battery_pct 42
        //   Event B arrives at 18:22:11.066 with eventTimestamp 18:22:07 → battery_pct 41  (older!)
        // Without the fix, B wins because it is the last writer; battery_pct reverts to 41.
        // With the fix, shadow.js compares eventTimestamp before merging battery_pct,
        // and drops the stale field while still writing non-telemetry fields from Event B.

        const BASE = {
            topic: `v/${TENANT}/${UNIT}/lock/state_change`,
            sensor_id: "front_door_lock",
            state: "locked",
        };

        // Event A — newer device timestamp, arrives first
        const eventA = makeEvent({
            ...BASE,
            event_id: "evt_inc2406_A",
            battery_pct: 42,
            eventTimestamp: "2026-04-08T18:22:11.000Z",
        });

        // Event B — older device timestamp (4 s earlier), arrives 52 ms later
        const eventB = makeEvent({
            ...BASE,
            event_id: "evt_inc2406_B",
            battery_pct: 41,
            eventTimestamp: "2026-04-08T18:22:07.000Z",
        });

        const resultA = await handler(eventA);
        assert(resultA.statusCode === 200,
            "Event A (battery 42, t=11s) is processed OK",
            `Got ${resultA.statusCode}`);

        const shadowAfterA = shadows[`${UNIT}:front_door_lock`];
        assert(
            shadowAfterA?.state?.reported?.battery_pct === 42,
            "Shadow reflects battery_pct 42 after Event A",
            `Got ${shadowAfterA?.state?.reported?.battery_pct}`
        );

        const resultB = await handler(eventB);
        assert(resultB.statusCode === 200,
            "Event B (battery 41, t=07s) is accepted without error",
            `Got ${resultB.statusCode}`);

        const shadowAfterB = shadows[`${UNIT}:front_door_lock`];
        assert(
            shadowAfterB?.state?.reported?.battery_pct === 42,
            "Shadow battery_pct remains 42 — stale Event B must not overwrite fresher value",
            `Got ${shadowAfterB?.state?.reported?.battery_pct} (regressed to stale value)`
        );

        // Non-telemetry fields from Event B (state, event_type, last_updated, etc.)
        // must still be written — the fix should only suppress battery_pct, not the
        // entire shadow update.
        assert(
            shadowAfterB?.state?.reported?.state === "locked",
            "Non-telemetry fields from Event B are still merged into shadow",
            `Got '${shadowAfterB?.state?.reported?.state}'`
        );
    } catch (error) {
        assert(false, "INC-2406 stale battery telemetry", error.message);
    }

    console.log("\nScenario 12 (INC-2407): each resident receives a publish addressed only to them");
    reset();
    try {
        // Unit 301 has two qualifying residents: Jane Doe and John Doe.
        // A jammed event triggers a notification (notify: true in state-map).
        // The bug: sendNotification issues ONE publish whose recipients array contains
        // both residents. The downstream dispatcher then has to pick a name — and
        // whichever it picks, the other resident sees the wrong name in their alert.
        //
        // The correct fix: one publish per recipient, each payload's recipients array
        // containing exactly that one person.  The test is written against that
        // contract, so it will fail on the current code and pass after the fix.
        await handler(makeEvent({
            topic: `v/${TENANT}/${UNIT}/lock/jammed`,
            state: "jammed",
            sensor_id: "front_door_lock",
        }));

        // Both residents opted in (email/sms/push all set), so we expect two publishes.
        assert(
            publishedMessages.length === 2,
            "One publish per qualifying resident (not one publish for all)",
            `Got ${publishedMessages.length} publish(es)`
        );

        // Every publish must have exactly one entry in its recipients array.
        // A multi-recipient payload is the root cause of the name-leak.
        for (const msg of publishedMessages) {
            assert(
                msg.payload.recipients.length === 1,
                `Publish to '${msg.payload.recipients[0]?.name ?? "?"}' carries exactly one recipient`,
                `Got ${msg.payload.recipients.length} recipient(s) in payload`
            );
        }

        // Each resident must appear in exactly one publish — no resident is missing,
        // and no resident bleeds into another resident's payload.
        const names = publishedMessages.map((m) => m.payload.recipients[0]?.name);
        assert(
            names.includes("Jane Doe"),
            "Jane Doe appears in exactly one publish",
            `Recipients across publishes: ${JSON.stringify(names)}`
        );
        assert(
            names.includes("John Doe"),
            "John Doe appears in exactly one publish",
            `Recipients across publishes: ${JSON.stringify(names)}`
        );
        assert(
            new Set(names).size === names.length,
            "No resident name appears in more than one publish",
            `Duplicates found: ${JSON.stringify(names)}`
        );

        // The template and shared parameters must still be present in every publish
        // so each recipient gets the full notification context.
        for (const msg of publishedMessages) {
            assert(
                msg.payload.template === "lock_jammed_notify",
                `Publish to '${msg.payload.recipients[0]?.name ?? "?"}' carries the correct template`,
                `Got '${msg.payload.template}'`
            );
            assert(
                typeof msg.payload.parameters?.lock_name === "string",
                `Publish to '${msg.payload.recipients[0]?.name ?? "?"}' carries lock_name parameter`,
                `Got ${JSON.stringify(msg.payload.parameters)}`
            );
        }
    } catch (error) {
        assert(false, "INC-2407 cross-resident notification isolation", error.message);
    }

    console.log("\nScenario 13 (INC-2407 staging spike): buildRecipients dead-code divergence");
    reset();
    try {
        // What the staging triage observed:
        //   helper=buildRecipients severity=warn resident_count=2 result=[]
        //
        // buildRecipients is exported but never called by sendNotification — the
        // production path uses shouldDeliverToResident inline instead.  The two
        // functions are logically identical today, but they live separately and can
        // drift.  The staging spike was a false lead precisely because the triage
        // team tested the dead helper rather than the live path.
        //
        // This scenario pins three things:
        //   A. The live path (sendNotification) does produce recipients for the
        //      residents that triggered the spike — so the empty-list result cannot
        //      come from production code.
        //   B. buildRecipients and shouldDeliverToResident agree on every
        //      severity × preference combination in the unit table, so any future
        //      wiring of buildRecipients into the production path won't silently
        //      change behaviour.
        //   C. A resident with no preferences at all is handled consistently by
        //      both functions — the edge case that most likely produced the empty
        //      list in staging.

        const { buildRecipients } = require(path.resolve(__dirname, "..", "src", "notifications.js"));

        // Part A — live path produces recipients for unit 301 residents at severity=warn.
        // Jane: { email: true, sms: true,  push: false } → qualifies
        // John: { email: true, sms: false, push: true  } → qualifies
        await handler(makeEvent({
            topic: `v/${TENANT}/${UNIT}/lock/jammed`,
            state: "jammed",
            sensor_id: "front_door_lock",
        }));
        // After the Scenario 13 fix there will be one publish per resident;
        // before that fix there is one publish with two recipients.
        // Either way, at least one publish must exist — an empty recipient list
        // would mean zero publishes, reproducing the staging spike on prod data.
        assert(
            publishedMessages.length > 0,
            "sendNotification (live path) produces at least one publish for unit 301 at severity=warn",
            `Got ${publishedMessages.length} publish(es) — live path is dropping all recipients`
        );
        const allRecipientNames = publishedMessages.flatMap((m) => m.payload.recipients.map((r) => r.name));
        assert(
            allRecipientNames.includes("Jane Doe"),
            "Jane Doe is delivered to by the live path",
            `Recipients across all publishes: ${JSON.stringify(allRecipientNames)}`
        );
        assert(
            allRecipientNames.includes("John Doe"),
            "John Doe is delivered to by the live path",
            `Recipients across all publishes: ${JSON.stringify(allRecipientNames)}`
        );

        // Part B — buildRecipients must agree with shouldDeliverToResident for every
        // resident in the unit table across both severity levels.
        // If they diverge, wiring buildRecipients in will silently change who gets notified.
        const severities = ["warn", "alert", "info"];
        for (const [unitId, unitData] of Object.entries(unitTable)) {
            for (const severity of severities) {
                const fromHelper = await buildRecipients(unitData.residents, severity);
                const fromLive = unitData.residents.filter((r) => {
                    if (severity === "alert") return Boolean(r.email || r.phone);
                    const p = r.preferences || {};
                    return Boolean(p.email || p.sms || p.push);
                });

                assert(
                    fromHelper.length === fromLive.length,
                    `buildRecipients and shouldDeliverToResident agree on count for unit '${unitData.name}' at severity=${severity}`,
                    `buildRecipients=${fromHelper.length}, shouldDeliverToResident=${fromLive.length} — functions have diverged`
                );

                const helperNames = fromHelper.map((r) => r.name).sort();
                const liveNames = fromLive.map((r) => r.name).sort();
                assert(
                    JSON.stringify(helperNames) === JSON.stringify(liveNames),
                    `buildRecipients and shouldDeliverToResident agree on which residents qualify for unit '${unitData.name}' at severity=${severity}`,
                    `buildRecipients=[${helperNames}], shouldDeliverToResident=[${liveNames}]`
                );
            }
        }

        // Part C — resident with no preferences object at all.
        // This is the most likely shape of the staging data that produced result=[].
        // Both functions must handle it without throwing and must agree on the outcome.
        const bareResident = { name: "No Prefs", email: "", phone: "" };
        for (const severity of severities) {
            const fromHelper = await buildRecipients([bareResident], severity);
            const qualifies = severity === "alert"
                ? Boolean(bareResident.email || bareResident.phone)
                : Boolean((bareResident.preferences || {}).email ||
                    (bareResident.preferences || {}).sms ||
                    (bareResident.preferences || {}).push);
            const fromLive = qualifies ? [bareResident] : [];

            assert(
                fromHelper.length === fromLive.length,
                `Both functions agree on bare-preferences resident at severity=${severity} (expected ${fromLive.length})`,
                `buildRecipients=${fromHelper.length}, shouldDeliverToResident=${fromLive.length}`
            );
        }
    } catch (error) {
        assert(false, "INC-2407 staging spike / buildRecipients divergence", error.message);
    }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);

  if (failed > 0) {
    console.log("Some scenarios failed. The incident set also requires reading");
    console.log("the docs and evidence snapshots under artifacts/.\n");
  }
};

runTests().catch((error) => {
  console.error("Test runner error:", error);
  process.exit(1);
});
