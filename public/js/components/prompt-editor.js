const PromptEditor = {
  render(prompt) {
    return `<div class="prompt-editor">
      <label>Prompt</label>
      <textarea id="promptText" rows="6" placeholder="AI将根据你的描述生成prompt...">${prompt || ''}</textarea>
    </div>`;
  },
  getValue() {
    return document.getElementById('promptText')?.value || '';
  },
  setValue(text) {
    const el = document.getElementById('promptText');
    if (el) el.value = text;
  }
};
