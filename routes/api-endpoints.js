const express = require('express');
const db = require('../db');
const { authenticate, adminOnly } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, adminOnly);

router.get('/', (req, res) => {
  const endpoints = db.prepare('SELECT * FROM api_endpoints ORDER BY model_type, priority DESC').all();
  res.json({ endpoints });
});

router.post('/', (req, res) => {
  const { name, base_url, api_key, model, model_type, priority } = req.body;
  if (!name || !base_url || !api_key || !model || !model_type) return res.status(400).json({ error: '必填字段不完整' });
  const result = db.prepare('INSERT INTO api_endpoints (name, base_url, api_key, model, model_type, priority) VALUES (?, ?, ?, ?, ?, ?)').run(name, base_url, api_key, model, model_type, priority || 0);
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { name, base_url, api_key, model, model_type, status, priority, fail_count } = req.body;
  const ep = db.prepare('SELECT id FROM api_endpoints WHERE id = ?').get(req.params.id);
  if (!ep) return res.status(404).json({ error: '端点不存在' });
  const fields = [];
  const values = [];
  if (name !== undefined) { fields.push('name = ?'); values.push(name); }
  if (base_url !== undefined) { fields.push('base_url = ?'); values.push(base_url); }
  if (api_key !== undefined) { fields.push('api_key = ?'); values.push(api_key); }
  if (model !== undefined) { fields.push('model = ?'); values.push(model); }
  if (model_type !== undefined) { fields.push('model_type = ?'); values.push(model_type); }
  if (status !== undefined) { fields.push('status = ?'); values.push(status); }
  if (priority !== undefined) { fields.push('priority = ?'); values.push(priority); }
  if (fail_count !== undefined) { fields.push('fail_count = ?'); values.push(fail_count); }
  if (fields.length) {
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(req.params.id);
    db.prepare(`UPDATE api_endpoints SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  const onlineCount = db.prepare('SELECT COUNT(*) as cnt FROM api_endpoints WHERE status = ?').get('online').cnt;
  const ep = db.prepare('SELECT status FROM api_endpoints WHERE id = ?').get(req.params.id);
  if (ep && ep.status === 'online' && onlineCount <= 1) return res.status(400).json({ error: '不能删除最后一个在线端点' });
  db.prepare('DELETE FROM api_endpoints WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.post('/:id/test', async (req, res) => {
  const fetch = require('node-fetch');
  const ep = db.prepare('SELECT * FROM api_endpoints WHERE id = ?').get(req.params.id);
  if (!ep) return res.status(404).json({ error: '端点不存在' });
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const messages = [{ role: 'user', content: [{ type: 'text', text: 'Hi, respond with "ok".' }] }];
    const resp = await fetch(`${ep.base_url}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ep.api_key}` },
      body: JSON.stringify({ model: ep.model, messages, max_tokens: 16 }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    const latency = Date.now() - start;
    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '');
      db.prepare("UPDATE api_endpoints SET status = 'offline', fail_count = fail_count + 1, last_fail_at = CURRENT_TIMESTAMP WHERE id = ?").run(ep.id);
      return res.json({ success: false, error: `HTTP ${resp.status}: ${errBody.slice(0, 100)}`, latency });
    }
    db.prepare("UPDATE api_endpoints SET status = 'online', fail_count = 0 WHERE id = ?").run(ep.id);
    res.json({ success: true, latency });
  } catch (e) {
    const latency = Date.now() - start;
    db.prepare("UPDATE api_endpoints SET status = 'offline', fail_count = fail_count + 1, last_fail_at = CURRENT_TIMESTAMP WHERE id = ?").run(ep.id);
    res.json({ success: false, error: e.message, latency });
  }
});

module.exports = router;
