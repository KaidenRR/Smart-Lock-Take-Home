const log = require("./logger");
const {
  IoTDataPlaneClient,
  PublishCommand,
} = require("@aws-sdk/client-iot-data-plane");

const iotClient = new IoTDataPlaneClient({
  region: process.env.REGION || "us-east-1",
  endpoint: process.env.IOT_ENDPOINT
    ? `https://${process.env.IOT_ENDPOINT}`
    : undefined,
  maxRetries: parseInt(process.env.AWS_IOT_MAX_RETRIES || "3", 10),
});

const MQTT_PREFIX = process.env.MQTT_PREFIX || "v";

const buildRecipients = (residents, severity) => {
  const recipients = [];

  (residents || []).forEach(async (resident) => {
    const optedIn = await hasAnyChannelOptIn(resident, severity);
    if (optedIn) {
      recipients.push({
        name: resident.name,
        email: resident.email,
        phone: resident.phone,
        preferences: resident.preferences,
      });
    }
  });

  return recipients;
};

const hasAnyChannelOptIn = async (resident, severity) => {
  if (severity === "alert") {
    return Boolean(resident.email || resident.phone);
  }

  const prefs = resident.preferences || {};
  return Boolean(prefs.email || prefs.sms || prefs.push);
};

const shouldDeliverToResident = (resident, severity) => {
  if (severity === "alert") {
    return Boolean(resident.email || resident.phone);
  }

  const prefs = resident.preferences || {};
  return Boolean(prefs.email || prefs.sms || prefs.push);
};

const sendNotification = async (unit, template, parameters) => {
  const channel = unit.notifications?.channel || "default";
  const topic = `${MQTT_PREFIX}/${unit.id}/message/${channel}/send`;
  const recipients = (unit.residents || [])
    .filter((resident) => shouldDeliverToResident(resident, parameters.severity))
    .map((resident) => ({
      name: resident.name,
      email: resident.email,
      phone: resident.phone,
      preferences: resident.preferences,
    }));

  iotClient.send(
    new PublishCommand({
      topic,
      payload: JSON.stringify({
        template,
        parameters,
        recipients,
      }),
      qos: 1,
    })
  );

  log.info(unit.id, `Notification sent: ${template}`, { topic });
};

module.exports = { sendNotification, buildRecipients };
