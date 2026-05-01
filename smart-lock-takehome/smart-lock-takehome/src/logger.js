const LEVELS = { DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40, SILENT: 100 };
const threshold = LEVELS[(process.env.LOG_LEVEL || "INFO").toUpperCase()] ?? LEVELS.INFO;

const formatLog = (level, unitId, message, extra) => {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    unitId: unitId || "unknown",
    message,
  };
  if (extra) entry.extra = extra;
  return JSON.stringify(entry);
};

const emit = (level, method, unitId, message, extra) => {
  if (LEVELS[level] < threshold) return;
  method(formatLog(level, unitId, message, extra));
};

module.exports = {
  info:  (unitId, message, extra) => emit("INFO",  console.log,   unitId, message, extra),
  warn:  (unitId, message, extra) => emit("WARN",  console.warn,  unitId, message, extra),
  error: (unitId, message, extra) => emit("ERROR", console.error, unitId, message, extra),
  debug: (unitId, message, extra) => emit("DEBUG", console.debug, unitId, message, extra),
};
