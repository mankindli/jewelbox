const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authenticate, adminOnly } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, adminOnly);

router.get('/users', (req, res) => {
  const users = db.prepare('SELECT id, username, nickname, role, status, created_at FROM users ORDER BY id').all();
  res.json({ users });
});

router.post('/users', (req, res) => {
  const { username, password, nickname, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' });
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return res.status(400).json({ error: '用户名已存在' });
  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (username, password, nickname, role) VALUES (?, ?, ?, ?)').run(username, hash, nickname || '', role || 'user');
  res.json({ id: result.lastInsertRowid });
});

router.put('/users/:id', (req, res) => {
  const { username, nickname, password, role, status } = req.body;
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  if (username !== undefined) {
    const exists = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, req.params.id);
    if (exists) return res.status(400).json({ error: '用户名已存在' });
    db.prepare('UPDATE users SET username = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(username, req.params.id);
  }
  if (password) {
    db.prepare('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(bcrypt.hashSync(password, 10), req.params.id);
  }
  if (nickname !== undefined) db.prepare('UPDATE users SET nickname = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(nickname, req.params.id);
  if (role !== undefined) db.prepare('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(role, req.params.id);
  if (status !== undefined) db.prepare('UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, req.params.id);
  res.json({ success: true });
});

router.delete('/users/:id', (req, res) => {
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: '不能删除自己' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
