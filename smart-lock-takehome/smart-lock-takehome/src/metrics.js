const log = require("./logger");

const TOPIC_REGEX = /^v\/([a-z0-9-]+)\/[a-f0-9-]{36}\/lock\/[a-z_]+$/;

const extractTenant = (topic) => {
  const match = TOPIC_REGEX.exec(topic);
  return match ? match[1] : "unknown";
};

const recordEvent = (topic, eventType, outcome, durationMs) => {
  const tenant = extractTenant(topic);
  log.info(null, "metric", {
    metric: "lock_event",
    tenant,
    event_type: eventType,
    outcome,
    duration_ms: durationMs,
  });
};

module.exports = { recordEvent, extractTenant };
