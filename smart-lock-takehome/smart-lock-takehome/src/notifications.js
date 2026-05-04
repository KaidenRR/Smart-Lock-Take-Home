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

const buildRecipients = async (residents, severity) => {
    const flags = await Promise.all(
        (residents || []).map(r => hasAnyChannelOptIn(r, severity))
    );
    return residents
        .filter((_, i) => flags[i])
        .map(({ name, email, phone, preferences }) =>
            ({ name, email, phone, preferences }));
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
    if (!unit.notifications?.enabled) {
        log.info(unit.id, "Notifications disabled for unit — skipping", { template });
        return;
    }
    const channel = unit.notifications?.channel || "default";
    const qualifiedResidents = (unit.residents || [])
        .filter(r => shouldDeliverToResident(r, parameters.severity));

    await Promise.all(qualifiedResidents.map(resident => {
        const topic = `${MQTT_PREFIX}/${unit.id}/message/${channel}/send`;
        return iotClient.send(new PublishCommand({
            topic,
            payload: JSON.stringify({
                template,
                parameters: { ...parameters, resident_name: resident.name },
                recipients: [{
                    name: resident.name,
                    email: resident.email,
                    phone: resident.phone,
                    preferences: resident.preferences,
                }],
            }),
            qos: 1,
        }));
    }));

  log.info(unit.id, `Notification sent: ${template}`, { topic });
};

module.exports = { sendNotification, buildRecipients };
