const {
  IoTDataPlaneClient,
  GetThingShadowCommand,
  UpdateThingShadowCommand,
} = require("@aws-sdk/client-iot-data-plane");

const iotClient = new IoTDataPlaneClient({
  region: process.env.REGION || "us-east-1",
  endpoint: process.env.IOT_ENDPOINT
    ? `https://${process.env.IOT_ENDPOINT}`
    : undefined,
});

const getShadow = async (unitId, shadowName) => {
  const response = await iotClient.send(
    new GetThingShadowCommand({
      thingName: unitId,
      shadowName,
    })
  );
  return JSON.parse(new TextDecoder().decode(response.payload));
};

const updateShadow = async (unitId, shadowName, newState) => {
    const current = await getShadow(unitId, shadowName);
    const currentReported = current.state?.reported || {};

    // For telemetry fields that can arrive out of order, only advance forward.
    const incomingEventTime = newState.event_timestamp
        ? new Date(newState.event_timestamp).getTime()
        : null;
    const storedEventTime = currentReported.event_timestamp
        ? new Date(currentReported.event_timestamp).getTime()
        : null;

    if (incomingEventTime && storedEventTime && incomingEventTime < storedEventTime) {
        // Stale event — merge non-telemetry fields only, drop battery_pct
        const { battery_pct, ...safeFields } = newState;
        newState = safeFields;
    }

    const merged = {
        ...currentReported,
        ...newState,
        last_updated: new Date().toISOString(),
    };

  await iotClient.send(
    new UpdateThingShadowCommand({
      thingName: unitId,
      shadowName,
      versionCheck: "STRICT",
      payload: JSON.stringify({
        state: { reported: merged },
      }),
    })
  );
};

module.exports = { getShadow, updateShadow, iotClient };
