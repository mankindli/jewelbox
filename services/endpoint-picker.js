const db = require('../db');
const config = require('../config');

let roundRobinIndex = { understanding: 0, image: 0 };

function pickEndpoint(modelType) {
  const now = Date.now();
  const staleMs = config.generation.staleRecoveryMs;
  const staleEndpoints = db.prepare(
    "SELECT id FROM api_endpoints WHERE model_type = ? AND status = 'offline' AND last_fail_at IS NOT NULL AND (strftime('%s','now')*1000 - strftime('%s',last_fail_at)*1000) > ?"
  ).all(modelType, staleMs);
  for (const ep of staleEndpoints) {
    db.prepare("UPDATE api_endpoints SET status = 'online', fail_count = 0 WHERE id = ?").run(ep.id);
  }

  const endpoints = db.prepare(
    "SELECT * FROM api_endpoints WHERE model_type = ? AND status = 'online' ORDER BY priority DESC"
  ).all(modelType);
  if (!endpoints.length) return null;

  const idx = roundRobinIndex[modelType] % endpoints.length;
  roundRobinIndex[modelType] = idx + 1;
  return endpoints[idx];
}

function markOffline(endpointId) {
  db.prepare(
    "UPDATE api_endpoints SET status = 'offline', fail_count = fail_count + 1, last_fail_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(endpointId);
}

module.exports = { pickEndpoint, markOffline };
