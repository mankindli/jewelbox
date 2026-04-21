const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const projects = db.prepare(
    'SELECT id, name, jewelry_type, target_country, status, created_at, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC'
  ).all(req.user.id);
  res.json({ projects });
});

router.post('/', (req, res) => {
  const { name, jewelry_type, target_country, description, resolution } = req.body;
  if (!name || !jewelry_type || !target_country) return res.status(400).json({ error: '项目名称、珠宝类型和目标国家必填' });
  const result = db.prepare(
    'INSERT INTO projects (user_id, name, jewelry_type, target_country, description, resolution) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.user.id, name, jewelry_type, target_country, description || '', resolution || '1024x1024');
  res.json({ id: result.lastInsertRowid });
});

router.get('/:id', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!project) return res.status(404).json({ error: '项目不存在' });

  // Fix stale generating/pending nodes and images
  db.prepare("UPDATE generated_images SET status = 'failed', error_message = '服务重启，任务中断' WHERE status IN ('generating', 'pending') AND node_id IN (SELECT id FROM design_nodes WHERE project_id = ?)").run(project.id);
  const staleNodes = db.prepare("SELECT id FROM design_nodes WHERE project_id = ? AND status IN ('generating', 'pending')").all(project.id);
  for (const sn of staleNodes) {
    const hasSuccess = db.prepare("SELECT id FROM generated_images WHERE node_id = ? AND status = 'completed' LIMIT 1").get(sn.id);
    db.prepare("UPDATE design_nodes SET status = ? WHERE id = ?").run(hasSuccess ? 'completed' : 'failed', sn.id);
  }

  const nodes = db.prepare('SELECT * FROM design_nodes WHERE project_id = ? ORDER BY depth ASC, created_at ASC').all(project.id);
  const images = db.prepare(
    'SELECT * FROM generated_images WHERE node_id IN (SELECT id FROM design_nodes WHERE project_id = ?) ORDER BY slot_index'
  ).all(project.id);
  const cards = db.prepare('SELECT * FROM suggestion_cards WHERE project_id = ? ORDER BY sort_order').all(project.id);
  const nodeMap = {};
  for (const node of nodes) { node.images = []; node.children = []; nodeMap[node.id] = node; }
  for (const img of images) { if (nodeMap[img.node_id]) nodeMap[img.node_id].images.push(img); }
  for (const node of nodes) { if (node.parent_node_id && nodeMap[node.parent_node_id]) nodeMap[node.parent_node_id].children.push(node); }
  const rootNodes = nodes.filter(n => !n.parent_node_id);
  res.json({ project, tree: rootNodes, cards });
});

router.put('/:id', (req, res) => {
  const project = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!project) return res.status(404).json({ error: '项目不存在' });
  const { name, description, resolution, status } = req.body;
  const fields = []; const values = [];
  if (name !== undefined) { fields.push('name = ?'); values.push(name); }
  if (description !== undefined) { fields.push('description = ?'); values.push(description); }
  if (resolution !== undefined) { fields.push('resolution = ?'); values.push(resolution); }
  if (status !== undefined) { fields.push('status = ?'); values.push(status); }
  if (fields.length) {
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(req.params.id);
    db.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  const project = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!project) return res.status(404).json({ error: '项目不存在' });
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
