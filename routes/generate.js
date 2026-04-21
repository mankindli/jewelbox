const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const { generateVariationPrompts, generateRefinementPrompts } = require('../services/ai-understanding');
const { startBatchGeneration, resolveImageToBase64 } = require('../services/ai-generation');

const router = express.Router();
router.use(authenticate);

router.post('/:projectId/initial', async (req, res) => {
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.projectId, req.user.id);
    if (!project) return res.status(404).json({ error: '项目不存在' });
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: '请提供prompt' });
    const variations = await generateVariationPrompts(prompt, 10);
    if (!variations.length) return res.status(500).json({ error: '生成变体prompt失败' });
    const node = db.prepare('INSERT INTO design_nodes (project_id, depth, node_type, base_prompt, status) VALUES (?, 0, ?, ?, ?)').run(project.id, 'initial', prompt, 'generating');
    const nodeId = node.lastInsertRowid;
    const imageIds = [];
    const stmt = db.prepare('INSERT INTO generated_images (node_id, slot_index, variation_prompt) VALUES (?, ?, ?)');
    for (let i = 0; i < variations.length; i++) {
      const r = stmt.run(nodeId, i, typeof variations[i] === 'string' ? variations[i] : JSON.stringify(variations[i]));
      imageIds.push(r.lastInsertRowid);
    }
    db.prepare("UPDATE projects SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(project.id);
    startBatchGeneration(nodeId, variations.map(v => typeof v === 'string' ? v : JSON.stringify(v)), null);
    res.json({ nodeId, imageIds });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:projectId/refine', async (req, res) => {
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.projectId, req.user.id);
    if (!project) return res.status(404).json({ error: '项目不存在' });
    const { parentNodeId, selectedImageId, adjustmentDesc, prompt: manualPrompt } = req.body;
    if (!parentNodeId || !selectedImageId || !adjustmentDesc) return res.status(400).json({ error: '缺少必要参数' });
    const parentNode = db.prepare('SELECT * FROM design_nodes WHERE id = ? AND project_id = ?').get(parentNodeId, project.id);
    if (!parentNode) return res.status(404).json({ error: '父节点不存在' });
    if (parentNode.depth >= 10) return res.status(400).json({ error: '已达到最大迭代深度(10轮)' });
    const selectedImage = db.prepare('SELECT * FROM generated_images WHERE id = ? AND node_id = ?').get(selectedImageId, parentNodeId);
    if (!selectedImage) return res.status(404).json({ error: '选中的图片不存在' });
    const imageBase64 = resolveImageToBase64(selectedImage.image_path);
    const basePrompt = manualPrompt || parentNode.base_prompt;
    const variations = await generateRefinementPrompts(basePrompt, adjustmentDesc, imageBase64);
    if (!variations.length) return res.status(500).json({ error: '生成变体prompt失败' });
    const node = db.prepare('INSERT INTO design_nodes (project_id, parent_node_id, depth, node_type, base_prompt, adjustment_desc, selected_image_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      project.id, parentNodeId, parentNode.depth + 1, 'refinement', basePrompt, adjustmentDesc, selectedImageId, 'generating'
    );
    const nodeId = node.lastInsertRowid;
    const imageIds = [];
    const stmt = db.prepare('INSERT INTO generated_images (node_id, slot_index, variation_prompt) VALUES (?, ?, ?)');
    for (let i = 0; i < variations.length; i++) {
      const r = stmt.run(nodeId, i, typeof variations[i] === 'string' ? variations[i] : JSON.stringify(variations[i]));
      imageIds.push(r.lastInsertRowid);
    }
    db.prepare("UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(project.id);
    startBatchGeneration(nodeId, variations.map(v => typeof v === 'string' ? v : JSON.stringify(v)), imageBase64);
    res.json({ nodeId, imageIds });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:projectId/continue', async (req, res) => {
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.projectId, req.user.id);
    if (!project) return res.status(404).json({ error: '项目不存在' });
    const { nodeId, count } = req.body;
    if (!nodeId || !count) return res.status(400).json({ error: '缺少参数' });
    const node = db.prepare('SELECT * FROM design_nodes WHERE id = ? AND project_id = ?').get(nodeId, project.id);
    if (!node) return res.status(404).json({ error: '节点不存在' });

    const existingImages = db.prepare('SELECT MAX(slot_index) as maxSlot FROM generated_images WHERE node_id = ?').get(nodeId);
    const startSlot = (existingImages.maxSlot ?? -1) + 1;

    const variations = await generateVariationPrompts(node.base_prompt, count);
    if (!variations.length) return res.status(500).json({ error: '生成变体prompt失败' });

    const imageIds = [];
    const stmt = db.prepare('INSERT INTO generated_images (node_id, slot_index, variation_prompt) VALUES (?, ?, ?)');
    for (let i = 0; i < variations.length; i++) {
      const r = stmt.run(nodeId, startSlot + i, typeof variations[i] === 'string' ? variations[i] : JSON.stringify(variations[i]));
      imageIds.push(r.lastInsertRowid);
    }

    db.prepare("UPDATE design_nodes SET status = 'generating' WHERE id = ?").run(nodeId);

    let referenceBase64 = null;
    if (node.selected_image_id) {
      const refImg = db.prepare('SELECT image_path FROM generated_images WHERE id = ?').get(node.selected_image_id);
      if (refImg) referenceBase64 = resolveImageToBase64(refImg.image_path);
    }

    startBatchGeneration(nodeId, variations.map(v => typeof v === 'string' ? v : JSON.stringify(v)), referenceBase64, startSlot);
    res.json({ nodeId, imageIds });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/node/:nodeId/status', (req, res) => {
  const node = db.prepare('SELECT * FROM design_nodes WHERE id = ?').get(req.params.nodeId);
  if (!node) return res.status(404).json({ error: '节点不存在' });
  const images = db.prepare('SELECT id, slot_index, status, image_path, error_message FROM generated_images WHERE node_id = ? ORDER BY slot_index').all(node.id);
  res.json({ status: node.status, images });
});

router.delete('/image/:imageId', (req, res) => {
  const image = db.prepare('SELECT gi.*, dn.project_id FROM generated_images gi JOIN design_nodes dn ON gi.node_id = dn.id WHERE gi.id = ?').get(req.params.imageId);
  if (!image) return res.status(404).json({ error: '图片不存在' });
  const project = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(image.project_id, req.user.id);
  if (!project) return res.status(403).json({ error: '无权限' });
  if (image.image_path) {
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(__dirname, '..', image.image_path);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  db.prepare('DELETE FROM generated_images WHERE id = ?').run(req.params.imageId);
  res.json({ success: true });
});

module.exports = router;
