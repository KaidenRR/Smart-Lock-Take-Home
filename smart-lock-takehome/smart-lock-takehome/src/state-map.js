const stateMap = {
  locked:           { state: "locked",            notify: false, template: null,                     severity: "info"  },
  auto_locked:      { state: "locked",            notify: false, template: null,                     severity: "info"  },
  manually_locked:  { state: "locked",            notify: false, template: null,                     severity: "info"  },
  unlocked:         { state: "unlocked",          notify: false, template: null,                     severity: "info"  },
  keypad_unlocked:  { state: "unlocked",          notify: false, template: null,                     severity: "info"  },
  remote_unlocked:  { state: "unlocked",          notify: false, template: null,                     severity: "info"  },
  jammed:           { state: "jammed",            notify: true,  template: "lock_jammed_notify",     severity: "warn"  },
  forced_open:      { state: "forced_open",       notify: true,  template: "door_forced_open_alert", severity: "alert" },
  tamper:           { state: "tamper",            notify: true,  template: "lock_tamper_alert",      severity: "alert" },
  battery_low:      { state: "battery_low",       notify: true,  template: "lock_battery_low",       severity: "info"  },
  battery_critical: { state: "battery_critical",  notify: true,  template: "lock_battery_critical",  severity: "warn" },
  offline:          { state: "offline",           notify: true,  template: "lock_offline_notify",    severity: "warn" },
};

const mapLockState = (rawState, eventType) => {
  return stateMap[rawState] || { state: eventType, notify: false, template: null, severity: "info" };
};

module.exports = { mapLockState, stateMap };
