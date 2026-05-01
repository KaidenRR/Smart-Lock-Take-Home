const log = require("./logger");
const { parseTopic } = require("./topic");
const { isDuplicate } = require("./dedup");
const { getUnit } = require("./unit");
const { updateShadow } = require("./shadow");
const { sendNotification } = require("./notifications");
const { mapLockState } = require("./state-map");
const { recordEvent } = require("./metrics");

exports.handler = async (event) => {
  const startedAt = Date.now();
  const topic = event.topic;

  if (!topic) {
    log.error(null, "Event missing MQTT topic", { event });
    return { statusCode: 400, body: "Missing topic" };
  }

  const { unitId, eventType } = parseTopic(topic);
  log.info(unitId, `Processing lock event: ${eventType}`, { topic });

  try {
    if (await isDuplicate(topic, event)) {
      log.info(unitId, "Duplicate event — skipping");
      recordEvent(topic, eventType, "duplicate", Date.now() - startedAt);
      return { statusCode: 200, body: "Duplicate" };
    }

    const unit = await getUnit(unitId);
    if (!unit) {
      log.error(unitId, "Unit not found in database");
      return { statusCode: 404, body: "Unit not found" };
    }

    const rawState = event.state;
    if (!rawState) {
      log.warn(unitId, "Event has no state field", { event });
      return { statusCode: 400, body: "Missing state" };
    }

    const { state, notify, template, severity } = mapLockState(rawState, eventType);
    log.info(unitId, `Lock state: ${rawState} → ${state}`, { notify, severity });

    const shadowName = event.sensor_id || "front_door_lock";
    await updateShadow(unitId, shadowName, {
      state,
      raw_state: rawState,
      event_type: eventType,
      battery_pct: event.battery_pct,
      parent_device_name: event.device_name || "Front Door Lock",
      attributes: {
        friendly_name: event.device_name || "Front Door Lock",
        entity_id: event.entity_id || `lock.${shadowName}`,
      },
    });

    if (notify && template) {
      await sendNotification(unit, template, {
        lock_name: event.device_name || "Front Door Lock",
        state: rawState,
        unit_name: unit.name || unitId,
        severity,
      });
    }

    log.info(unitId, "Lock event processed successfully", { state, notify });
    recordEvent(topic, eventType, "processed", Date.now() - startedAt);
    return { statusCode: 200, body: "OK" };
  } catch (error) {
    log.error(unitId, "Failed to process lock event", {
      error: error.message,
      stack: error.stack,
    });
    recordEvent(topic, eventType, "error", Date.now() - startedAt);
    return { statusCode: 500, body: "Internal error" };
  }
};
