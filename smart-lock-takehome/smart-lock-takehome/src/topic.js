const parseTopic = (topic) => {
  const parts = topic.split("/");
  return {
    tenantId: parts[1],
    unitId: parts[2],
    eventType: parts[4],
  };
};

module.exports = { parseTopic };
