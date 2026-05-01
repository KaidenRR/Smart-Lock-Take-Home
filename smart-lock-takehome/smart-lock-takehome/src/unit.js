const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
} = require("@aws-sdk/lib-dynamodb");

const dynamoClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.REGION || "us-east-1" })
);

const UNIT_TABLE = process.env.UNIT_TABLE_NAME || "Unit-production";
const CACHE_TTL_MS = 60_000;
const unitCache = new Map();

const cacheGet = (unitId) => {
  const key = unitId;
  const entry = unitCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    unitCache.delete(key);
    return null;
  }
  return entry.unit;
};

const cacheSet = (unitId, unit) => {
  const key = unitId;
  unitCache.set(key, { unit, cachedAt: Date.now() });
};

const getUnit = async (unitId) => {
  const cached = cacheGet(unitId);
  if (cached) return cached;

  const result = await dynamoClient.send(
    new GetCommand({
      TableName: UNIT_TABLE,
      Key: { id: unitId },
      ProjectionExpression: "id, #name, #status, notifications, residents",
      ExpressionAttributeNames: {
        "#name": "name",
        "#status": "status",
      },
    })
  );

  const unit = result.Item || null;
  if (unit) cacheSet(unitId, unit);
  return unit;
};

module.exports = { getUnit };
