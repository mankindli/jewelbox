const express = require('express');
const archiver = require('archiver');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/:projectId', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.projectId, req.user.id);
  if (!project) return res.status(404).json({ error: '项目不存在' });
  const nodes = db.prepare('SELECT * FROM design_nodes WHERE project_id = ? ORDER BY depth, created_at').all(project.id);
  const images = db.prepare("SELECT * FROM generated_images WHERE node_id IN (SELECT id FROM design_nodes WHERE project_id = ?) AND status = 'completed'").all(project.id);

  const metadata = {
    project: { name: project.name, jewelry_type: project.jewelry_type, target_country: project.target_country, resolution: project.resolution, created_at: project.created_at },
    tree: nodes.map(n => ({
      nodeId: n.id, depth: n.depth, type: n.node_type, prompt: n.base_prompt, adjustment: n.adjustment_desc,
      images: images.filter(img => img.node_id === n.id).map(img => ({ slot: img.slot_index, file: `round-${n.depth}-${n.id}/img-${img.slot_index}${path.extname(img.image_path)}`, variation_prompt: img.variation_prompt }))
    }))
  };

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(project.name)}.zip"`);
  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.pipe(res);
  archive.append(JSON.stringify(metadata, null, 2), { name: 'metadata.json' });
  for (const node of nodes) {
    const nodeImages = images.filter(img => img.node_id === node.id);
    for (const img of nodeImages) {
      const filePath = path.join(__dirname, '..', img.image_path);
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: `round-${node.depth}-${node.id}/img-${img.slot_index}${path.extname(img.image_path)}` });
      }
    }
  }
  archive.finalize();
});

router.get('/image/:imageId', (req, res) => {
  const image = db.prepare('SELECT gi.*, dn.project_id FROM generated_images gi JOIN design_nodes dn ON gi.node_id = dn.id WHERE gi.id = ?').get(req.params.imageId);
  if (!image) return res.status(404).json({ error: '图片不存在' });
  const project = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(image.project_id, req.user.id);
  if (!project) return res.status(403).json({ error: '无权限' });
  const filePath = path.join(__dirname, '..', image.image_path);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: '文件不存在' });
  res.sendFile(filePath);
});

module.exports = router;
