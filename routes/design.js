const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const { generateSuggestionCards, generateSuggestionCardsForRefinement, finalizePrompt } = require('../services/ai-understanding');
const { resolveImageToBase64 } = require('../services/ai-generation');
const { getMergedSettings } = require('./settings');

const router = express.Router();
router.use(authenticate);

function resolveCountryName(countryValue, userId) {
  const settings = getMergedSettings(userId);
  const countries = settings.countries || [];
  const byId = countries.find(c => c.id === countryValue);
  if (byId) return byId.label;
  const byLabel = countries.find(c => c.label === countryValue);
  if (byLabel) return byLabel.label;
  return countryValue;
}

function resolveTypeName(typeValue, userId) {
  const settings = getMergedSettings(userId);
  const types = settings.jewelry_types || [];
  const byId = types.find(t => t.id === typeValue);
  if (byId) return byId.label;
  const byLabel = types.find(t => t.label === typeValue);
  if (byLabel) return byLabel.label;
  return typeValue;
}

router.post('/:projectId/understand', async (req, res) => {
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.projectId, req.user.id);
    if (!project) return res.status(404).json({ error: '项目不存在' });
    const countryName = resolveCountryName(project.target_country, req.user.id);
    const typeName = resolveTypeName(project.jewelry_type, req.user.id);
    const { nodeId, adjustmentDesc } = req.body;
    let cards;
    if (nodeId && adjustmentDesc) {
      const node = db.prepare('SELECT * FROM design_nodes WHERE id = ? AND project_id = ?').get(nodeId, project.id);
      if (!node) return res.status(404).json({ error: '节点不存在' });
      const selectedImage = req.body.selectedImageId ? db.prepare('SELECT image_path FROM generated_images WHERE id = ?').get(req.body.selectedImageId) : null;
      const imageBase64 = selectedImage ? resolveImageToBase64(selectedImage.image_path) : null;
      cards = await generateSuggestionCardsForRefinement(typeName, countryName, adjustmentDesc, imageBase64);
    } else {
      cards = await generateSuggestionCards(typeName, countryName, project.description);
    }
    db.prepare('DELETE FROM suggestion_cards WHERE project_id = ? AND node_id IS ?').run(project.id, nodeId || null);
    const stmt = db.prepare('INSERT INTO suggestion_cards (project_id, node_id, card_text, sort_order) VALUES (?, ?, ?, ?)');
    const savedCards = [];
    cards.forEach((card, i) => {
      const text = typeof card === 'string' ? card : card.text;
      const result = stmt.run(project.id, nodeId || null, text, i);
      savedCards.push({ id: result.lastInsertRowid, card_text: text, selected: 0, sort_order: i });
    });
    res.json({ cards: savedCards });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:projectId/select-cards', (req, res) => {
  const project = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(req.params.projectId, req.user.id);
  if (!project) return res.status(404).json({ error: '项目不存在' });
  const { cardIds } = req.body;
  if (!Array.isArray(cardIds)) return res.status(400).json({ error: '请提供cardIds数组' });
  db.prepare('UPDATE suggestion_cards SET selected = 0 WHERE project_id = ?').run(project.id);
  if (cardIds.length) {
    const placeholders = cardIds.map(() => '?').join(',');
    db.prepare(`UPDATE suggestion_cards SET selected = 1 WHERE id IN (${placeholders}) AND project_id = ?`).run(...cardIds, project.id);
  }
  res.json({ success: true });
});

router.post('/:projectId/finalize-prompt', async (req, res) => {
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.projectId, req.user.id);
    if (!project) return res.status(404).json({ error: '项目不存在' });
    const countryName = resolveCountryName(project.target_country, req.user.id);
    const typeName = resolveTypeName(project.jewelry_type, req.user.id);
    const selectedCards = db.prepare('SELECT card_text FROM suggestion_cards WHERE project_id = ? AND selected = 1').all(project.id);
    const cardTexts = selectedCards.map(c => c.card_text);
    const prompt = await finalizePrompt(typeName, countryName, project.description, cardTexts);
    res.json({ prompt });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:projectId/prompt', (req, res) => {
  const project = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(req.params.projectId, req.user.id);
  if (!project) return res.status(404).json({ error: '项目不存在' });
  res.json({ success: true, prompt: req.body.prompt });
});

module.exports = router;
