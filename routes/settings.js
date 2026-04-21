const express = require('express');
const db = require('../db');
const { authenticate, adminOnly } = require('../middleware/auth');

const router = express.Router();

function getMergedSettings(userId) {
  const globals = db.prepare('SELECT key, value FROM global_settings').all();
  const userOverrides = db.prepare('SELECT key, value FROM user_settings WHERE user_id = ?').all(userId);
  const overrideMap = Object.fromEntries(userOverrides.map(r => [r.key, r.value]));
  const merged = {};
  for (const g of globals) {
    merged[g.key] = JSON.parse(overrideMap[g.key] || g.value);
  }
  return merged;
}

router.get('/', authenticate, (req, res) => {
  res.json({ settings: getMergedSettings(req.user.id) });
});

router.put('/:key', authenticate, (req, res) => {
  const { value } = req.body;
  if (value === undefined) return res.status(400).json({ error: '缺少value' });
  const jsonValue = JSON.stringify(value);
  db.prepare('INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP').run(req.user.id, req.params.key, jsonValue, jsonValue);
  res.json({ success: true });
});

router.get('/admin', authenticate, adminOnly, (req, res) => {
  const settings = db.prepare('SELECT key, value FROM global_settings').all();
  const result = {};
  for (const s of settings) result[s.key] = JSON.parse(s.value);
  res.json({ settings: result });
});

router.put('/admin/:key', authenticate, adminOnly, (req, res) => {
  const { value } = req.body;
  if (value === undefined) return res.status(400).json({ error: '缺少value' });
  const jsonValue = JSON.stringify(value);
  db.prepare('INSERT INTO global_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP').run(req.params.key, jsonValue, jsonValue);
  res.json({ success: true });
});

router.post('/admin/:key/push-to-users', authenticate, adminOnly, (req, res) => {
  const { userIds } = req.body;
  if (!userIds || !Array.isArray(userIds)) return res.status(400).json({ error: '请提供userIds数组' });
  const globalValue = db.prepare('SELECT value FROM global_settings WHERE key = ?').get(req.params.key);
  if (!globalValue) return res.status(404).json({ error: '设置不存在' });
  const stmt = db.prepare('INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP');
  for (const uid of userIds) {
    stmt.run(uid, req.params.key, globalValue.value, globalValue.value);
  }
  res.json({ success: true, updated: userIds.length });
});

module.exports = router;
module.exports.getMergedSettings = getMergedSettings;
