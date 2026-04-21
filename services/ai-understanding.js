const fetch = require('node-fetch');
const { pickEndpoint, markOffline } = require('./endpoint-picker');
const config = require('../config');

async function callUnderstandingModel(messages) {
  const maxRetries = config.generation.maxRetries;
  for (let i = 0; i < maxRetries; i++) {
    const endpoint = pickEndpoint('understanding');
    if (!endpoint) throw new Error('没有可用的理解模型端点');
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.generation.timeoutMs);
      const resp = await fetch(`${endpoint.base_url}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${endpoint.api_key}` },
        body: JSON.stringify({ model: endpoint.model, messages, max_tokens: 4096 }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!resp.ok) { markOffline(endpoint.id); continue; }
      const data = await resp.json();
      const content = data.choices?.[0]?.message?.content || '';
      return content;
    } catch (e) {
      markOffline(endpoint.id);
      if (i === maxRetries - 1) throw e;
    }
  }
  throw new Error('所有理解模型端点均不可用');
}

async function generateSuggestionCards(jewelryType, country, description) {
  const messages = [
    { role: 'system', content: '你是一位专业的珠宝设计顾问。根据用户的珠宝设计需求，生成设计建议卡片。每张卡片是一个具体的、可操作的设计元素或技法建议。请严格以JSON数组格式返回，不要包含其他文字。注意：目标市场仅用于参考该地区的审美偏好，不要建议在珠宝上添加任何文字、字母或国家标识。' },
    { role: 'user', content: `珠宝类型：${jewelryType}\n目标市场审美参考：${country}（仅参考风格偏好，不要在珠宝上加文字或国家元素）\n用户描述：${description}\n\n请生成建议卡片，JSON数组格式：[{"text": "建议内容", "category": "material|style|technique|detail|market"}]\n根据需求复杂度自行决定卡片数量（3-8张）。` }
  ];
  const content = await callUnderstandingModel(messages);
  return parseJsonFromContent(content);
}

async function generateSuggestionCardsForRefinement(jewelryType, country, adjustmentDesc, imageBase64) {
  const userContent = [
    { type: 'text', text: `这是一个${jewelryType}设计，目标市场：${country}\n用户的调整需求：${adjustmentDesc}\n\n请根据这张图片和用户的调整需求，生成建议卡片。JSON数组格式：[{"text": "建议内容", "category": "material|style|technique|detail|market"}]` }
  ];
  if (imageBase64) {
    userContent.unshift({ type: 'image_url', image_url: { url: imageBase64 } });
  }
  const messages = [
    { role: 'system', content: '你是一位专业的珠宝设计顾问。根据用户选中的设计图片和调整需求，生成针对性的建议卡片。请严格以JSON数组格式返回。' },
    { role: 'user', content: userContent }
  ];
  const content = await callUnderstandingModel(messages);
  return parseJsonFromContent(content);
}

async function finalizePrompt(jewelryType, country, description, selectedCards) {
  const cardsText = selectedCards.length ? `用户选中的补充建议（作为额外参考，不得替代或覆盖用户原始描述）：\n${selectedCards.map(c => `- ${c}`).join('\n')}` : '（用户未选择补充建议）';
  const messages = [
    { role: 'system', content: `你是一位专业的珠宝设计顾问。请整合用户的设计需求，生成一段详细、连贯的英文图片生成prompt。只返回prompt文本，不要包含其他说明。

关键规则（违反任何一条都是严重错误）：
1. 用户原始描述中的每一个具体细节都必须在最终prompt中逐一体现，绝对不允许遗漏、概括化或用模糊表述替代。
   - 如果用户提到了具体品牌（如"梵克雅宝"），必须翻译为对应英文品牌名（如"Van Cleef & Arpels"）并明确写入prompt。
   - 如果用户提到了具体款式参考（如"四叶草戒指"），必须写为"inspired by [品牌] [具体款式名]"。
   - 不得用"classic luxury floral jewelry"之类的模糊表述替代用户明确指定的品牌和款式参考。
2. 补充建议卡片是额外的增强，不得与用户原始描述冲突。如果卡片建议"做出差异化"，应在保留原始参考的基础上做差异化，而不是删除原始参考。
3. 目标市场（${country}）仅用于参考该地区消费者的审美偏好，不要在珠宝上添加任何文字、字母或符号。
4. 不要使用国家代码或缩写。` },
    { role: 'user', content: `用户原始描述（以下每个细节都必须在prompt中体现，不得遗漏）：
"${description}"

珠宝类型：${jewelryType}
目标市场审美参考：${country}（仅参考风格方向）
${cardsText}

请生成英文图片生成prompt。生成后请自查：用户原始描述中的品牌名、款式参考、材质、形状等是否全部在prompt中明确出现？如有遗漏请补上。` }
  ];
  return await callUnderstandingModel(messages);
}

async function generateVariationPrompts(basePrompt, count = 10) {
  const messages = [
    { role: 'system', content: '你是一位专业的珠宝设计顾问。请基于给定的prompt生成多个变体。请严格以JSON数组格式返回，数组中每个元素是一个prompt字符串。重要：所有变体prompt中都不得要求在珠宝上添加任何文字、字母或符号。' },
    { role: 'user', content: `基础prompt：${basePrompt}\n\n请基于此prompt生成${count}个不同的变体prompt。每个变体应探索不同的设计诠释，同时忠于核心设计意图。可从以下维度变化：角度、光线、背景、材质质感、镶嵌方式、宝石排列等。珠宝上不得出现任何文字或字母。\n返回JSON数组，包含${count}个prompt字符串。` }
  ];
  const content = await callUnderstandingModel(messages);
  return parseJsonFromContent(content);
}

async function generateRefinementPrompts(basePrompt, adjustmentDesc, imageBase64, count = 4) {
  const userContent = [
    { type: 'text', text: `基础prompt：${basePrompt}\n用户调整需求：${adjustmentDesc}\n\n请基于这张图片、原始prompt和用户的调整需求，生成${count}个不同的变体prompt。每个变体应体现用户的调整方向，同时保持差异化。返回JSON数组，包含${count}个prompt字符串。` }
  ];
  if (imageBase64) {
    userContent.unshift({ type: 'image_url', image_url: { url: imageBase64 } });
  }
  const messages = [
    { role: 'system', content: '你是一位专业的珠宝设计顾问。请严格以JSON数组格式返回变体prompt。' },
    { role: 'user', content: userContent }
  ];
  const content = await callUnderstandingModel(messages);
  return parseJsonFromContent(content);
}

function parseJsonFromContent(content) {
  const match = content.match(/\[[\s\S]*\]/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }
  try { return JSON.parse(content); } catch {}
  return [];
}

module.exports = { generateSuggestionCards, generateSuggestionCardsForRefinement, finalizePrompt, generateVariationPrompts, generateRefinementPrompts };
