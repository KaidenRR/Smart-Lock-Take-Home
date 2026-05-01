const crypto = require("crypto");
const {
  DynamoDBClient,
} = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} = require("@aws-sdk/lib-dynamodb");

const dynamoClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.REGION || "us-east-1" })
);

const DEDUP_TABLE = process.env.DEDUP_TABLE_NAME || "MessageDeduplication-production";
const DEDUP_TTL_MINUTES = parseInt(process.env.DEDUP_TTL_MINUTES || "5", 10);

const generateMessageHash = (topic, payload) => {
  const stable = JSON.stringify({
    topic,
    state: payload.state,
    sensor_id: payload.sensor_id,
    event_id: payload.event_id,
  });
  return crypto.createHash("sha256").update(stable).digest("hex");
};

const isDuplicate = async (topic, payload) => {
  const hash = generateMessageHash(topic, payload);

  const existing = await dynamoClient.send(
    new GetCommand({
      TableName: DEDUP_TABLE,
      Key: { messageHash: hash },
    })
  );

  if (existing.Item) return true;

  const ttlSeconds = Math.floor(Date.now() / 1000) + DEDUP_TTL_MINUTES * 60;
  await dynamoClient.send(
    new PutCommand({
      TableName: DEDUP_TABLE,
      Item: {
        messageHash: hash,
        ttl: ttlSeconds,
        processedAt: new Date().toISOString(),
      },
    })
  );

  return false;
};

module.exports = { isDuplicate, generateMessageHash };
