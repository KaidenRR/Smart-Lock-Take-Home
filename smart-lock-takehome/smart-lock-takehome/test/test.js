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
