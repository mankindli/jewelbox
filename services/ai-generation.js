const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { pickEndpoint, markOffline } = require('./endpoint-picker');
const config = require('../config');
const db = require('../db');

class Semaphore {
  constructor(max) { this.max = max; this.count = 0; this.queue = []; }
  acquire() {
    return new Promise(resolve => {
      if (this.count < this.max) { this.count++; resolve(); }
      else this.queue.push(resolve);
    });
  }
  release() {
    this.count--;
    if (this.queue.length) { this.count++; this.queue.shift()(); }
  }
}

const semaphore = new Semaphore(config.generation.maxConcurrent);

function saveBase64Image(base64Data) {
  let data = base64Data;
  if (data.startsWith('data:')) data = data.split(',')[1];
  const buf = Buffer.from(data, 'base64');
  let ext = 'png';
  if (buf[0] === 0xFF && buf[1] === 0xD8) ext = 'jpg';
  else if (buf[0] === 0x47 && buf[1] === 0x49) ext = 'gif';
  else if (buf[0] === 0x52 && buf[1] === 0x49) ext = 'webp';
  const filename = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}.${ext}`;
  const filepath = path.join(__dirname, '..', 'uploads', filename);
  fs.writeFileSync(filepath, buf);
  return `/uploads/${filename}`;
}

function extractImageFromResponse(data) {
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;
  if (typeof content === 'string') {
    const mdMatch = content.match(/!\[.*?\]\((data:image\/[^)]+)\)/);
    if (mdMatch) return mdMatch[1];
    const urlMatch = content.match(/(data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+)/);
    if (urlMatch) return urlMatch[1];
    return null;
  }
  if (Array.isArray(content)) {
    for (const part of content) {
      if (part.type === 'image_url') return part.image_url?.url;
      if (part.type === 'image' && part.source?.data) return `data:image/png;base64,${part.source.data}`;
      if (part.inline_data?.data) return `data:image/${part.inline_data.mimeType || 'png'};base64,${part.inline_data.data}`;
    }
  }
  return null;
}

async function generateSingleImage(imageId, variationPrompt, referenceImageBase64) {
  await semaphore.acquire();
  try {
    db.prepare("UPDATE generated_images SET status = 'generating' WHERE id = ?").run(imageId);
    const maxRetries = config.generation.maxRetries;
    for (let i = 0; i < maxRetries; i++) {
      const endpoint = pickEndpoint('image');
      if (!endpoint) {
        db.prepare("UPDATE generated_images SET status = 'failed', error_message = ? WHERE id = ?").run('没有可用的图片生成端点', imageId);
        return;
      }
      try {
        const userContent = [];
        if (referenceImageBase64) {
          userContent.push({ type: 'image_url', image_url: { url: referenceImageBase64 } });
        }
        userContent.push({ type: 'text', text: variationPrompt });
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), config.generation.timeoutMs);
        const resp = await fetch(`${endpoint.base_url}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${endpoint.api_key}` },
          body: JSON.stringify({ model: endpoint.model, messages: [{ role: 'user', content: userContent }], max_tokens: 16384 }),
          signal: controller.signal
        });
        clearTimeout(timeout);
        if (!resp.ok) { markOffline(endpoint.id); continue; }
        const data = await resp.json();
        const imageData = extractImageFromResponse(data);
        if (!imageData) {
          if (i === maxRetries - 1) {
            db.prepare("UPDATE generated_images SET status = 'failed', error_message = ?, model = ? WHERE id = ?").run('未能从响应中提取图片', endpoint.model, imageId);
          }
          continue;
        }
        const imagePath = saveBase64Image(imageData);
        db.prepare("UPDATE generated_images SET status = 'completed', image_path = ?, model = ? WHERE id = ?").run(imagePath, endpoint.model, imageId);
        return;
      } catch (e) {
        markOffline(endpoint.id);
        if (i === maxRetries - 1) {
          db.prepare("UPDATE generated_images SET status = 'failed', error_message = ?, model = ? WHERE id = ?").run(e.message, endpoint?.model, imageId);
        }
      }
    }
  } finally {
    semaphore.release();
  }
}

function startBatchGeneration(nodeId, variationPrompts, referenceImageBase64) {
  const promises = variationPrompts.map((prompt, index) => {
    const image = db.prepare('SELECT id FROM generated_images WHERE node_id = ? AND slot_index = ?').get(nodeId, index);
    if (!image) return Promise.resolve();
    return generateSingleImage(image.id, prompt, referenceImageBase64);
  });
  Promise.allSettled(promises).then(() => {
    const allImages = db.prepare('SELECT status FROM generated_images WHERE node_id = ?').all(nodeId);
    const allDone = allImages.every(img => img.status === 'completed' || img.status === 'failed');
    if (allDone) {
      const hasSuccess = allImages.some(img => img.status === 'completed');
      db.prepare(`UPDATE design_nodes SET status = ? WHERE id = ?`).run(hasSuccess ? 'completed' : 'failed', nodeId);
    }
  });
}

function resolveImageToBase64(imagePath) {
  if (!imagePath) return null;
  const fullPath = path.join(__dirname, '..', imagePath);
  if (!fs.existsSync(fullPath)) return null;
  const buf = fs.readFileSync(fullPath);
  let mime = 'image/png';
  if (imagePath.endsWith('.jpg') || imagePath.endsWith('.jpeg')) mime = 'image/jpeg';
  else if (imagePath.endsWith('.gif')) mime = 'image/gif';
  else if (imagePath.endsWith('.webp')) mime = 'image/webp';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

module.exports = { startBatchGeneration, resolveImageToBase64 };
