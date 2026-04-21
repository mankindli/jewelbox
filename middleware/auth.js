const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');

function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: '未登录' });
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    const user = db.prepare('SELECT id, username, nickname, role, status FROM users WHERE id = ?').get(decoded.userId);
    if (!user || !user.status) return res.status(401).json({ error: '账号已禁用' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: '登录已过期' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '无权限' });
  next();
}

module.exports = { authenticate, adminOnly };
