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
