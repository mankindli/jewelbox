const WorkspacePage = {
  project: null, tree: [], cards: [], activeNodeId: null, pollingTimer: null, prompt: '',

  async render(container, params) {
    this.cleanup();
    try {
      const data = await API.get(`/api/projects/${params.projectId}`);
      this.project = data.project;
      this.tree = data.tree || [];
      this.cards = data.cards || [];
      this.activeNodeId = this.findLatestNodeId();
      this.renderUI(container);
    } catch (e) { App.showToast(e.message, 'error'); App.navigate('projects'); }
  },

  renderUI(container) {
    const p = this.project;
    container.innerHTML = `<div class="workspace">
      <header class="top-bar">
        <button class="btn" onclick="WorkspacePage.cleanup();App.navigate('projects')">← 返回</button>
        <h2>${p.name}</h2>
        <div class="top-badges"><span class="badge">${p.jewelry_type}</span><span class="badge">${p.target_country}</span></div>
        <div class="top-actions">
          <button class="btn" onclick="ExportDialog.show(${p.id})">导出</button>
        </div>
      </header>
      <div class="workspace-body">
        <aside class="left-panel">
          <div class="panel-section">
            <label>设计描述</label>
            <textarea id="descInput" rows="3">${p.description || ''}</textarea>
            <button class="btn btn-primary btn-block" id="btnAnalyze" onclick="WorkspacePage.analyze()">AI分析</button>
          </div>
          <div class="panel-section" id="cardsSection">
            <label>建议卡片 <button class="btn-sm" id="btnReAnalyze" onclick="WorkspacePage.analyze()" style="display:none">重新分析</button></label>
            <div id="cardsContainer">${SuggestionCards.render(this.cards)}</div>
          </div>
          <div class="panel-section">
            <button class="btn btn-block" id="btnFinalize" onclick="WorkspacePage.finalizePrompt()">整理Prompt</button>
          </div>
          <div class="panel-section" id="promptSection">${PromptEditor.render(this.prompt)}</div>
          <div class="panel-section">
            <button class="btn btn-primary btn-block btn-lg" id="btnGenerate" onclick="WorkspacePage.generate()">生成设计图</button>
          </div>
        </aside>
        <main class="center-panel">
          <div id="imageGridContainer">${this.renderActiveGrid()}</div>
          <div class="refine-section" id="refineSection" style="display:none">
            <div class="refine-divider"></div>
            <div class="refine-header">
              <span class="refine-title">调整优化</span>
              <span class="refine-selected" id="refineSelectedInfo"></span>
              <button class="btn-sm" onclick="WorkspacePage.cancelRefine()">取消选择</button>
            </div>
            <textarea id="refineInput" rows="3" placeholder="描述你想要的调整，例如：换成玫瑰金材质、加大主石尺寸..."></textarea>
            <div class="refine-actions">
              <button class="btn btn-primary" id="btnRefine" onclick="WorkspacePage.refine()">生成调整</button>
            </div>
          </div>
        </main>
        <div class="right-panel-resizer" id="rightResizer"></div>
        <aside class="right-panel" id="rightPanel">
          <label>迭代历史</label>
          <div id="treeContainer">${IterationTree.render(this.tree, this.activeNodeId)}</div>
        </aside>
      </div>
    </div>`;
    if (this.cards.length) document.getElementById('btnReAnalyze').style.display = '';
    this.checkPolling();
    this.initResizer();
  },

  initResizer() {
    const resizer = document.getElementById('rightResizer');
    const panel = document.getElementById('rightPanel');
    if (!resizer || !panel) return;
    let startX, startWidth;
    const onMouseMove = (e) => {
      const dx = startX - e.clientX;
      panel.style.width = Math.max(160, Math.min(500, startWidth + dx)) + 'px';
    };
    const onMouseUp = () => {
      resizer.classList.remove('dragging');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    resizer.addEventListener('mousedown', (e) => {
      startX = e.clientX;
      startWidth = panel.offsetWidth;
      resizer.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  },

  renderActiveGrid() {
    const node = this.findNode(this.activeNodeId);
    if (!node) return '<div class="grid-empty">点击"生成设计图"开始</div>';
    const cols = node.node_type === 'initial' ? 5 : 2;
    let header = '';
    if (node.node_type === 'refinement') {
      const baseImg = this.findImageById(node.selected_image_id);
      header = `<div class="grid-context">
        ${baseImg ? `<div class="grid-context-base"><span>基于图片:</span><img src="${baseImg.image_path}" class="context-thumb" onclick="ImageGrid.previewSrc('${baseImg.image_path}', ${baseImg.id})"></div>` : ''}
        ${node.adjustment_desc ? `<div class="grid-context-desc"><span>调整描述:</span><span class="context-text">${node.adjustment_desc}</span></div>` : ''}
      </div>`;
    }
    return header + ImageGrid.render(node.images || [], cols, this.selectedImageId);
  },

  findImageById(imageId) {
    if (!imageId) return null;
    const search = (nodes) => {
      for (const n of nodes) {
        const img = (n.images || []).find(i => i.id === imageId);
        if (img) return img;
        if (n.children) { const found = search(n.children); if (found) return found; }
      }
      return null;
    };
    return search(this.tree);
  },

  findNode(nodeId) {
    if (!nodeId) return null;
    const search = (nodes) => {
      for (const n of nodes) {
        if (n.id === nodeId) return n;
        if (n.children) { const found = search(n.children); if (found) return found; }
      }
      return null;
    };
    return search(this.tree);
  },

  findLatestNodeId() {
    let latest = null;
    const walk = (nodes) => { for (const n of nodes) { latest = n.id; if (n.children) walk(n.children); } };
    walk(this.tree);
    return latest;
  },

  switchNode(nodeId) {
    this.activeNodeId = nodeId;
    document.getElementById('imageGridContainer').innerHTML = this.renderActiveGrid();
    document.getElementById('treeContainer').innerHTML = IterationTree.render(this.tree, this.activeNodeId);
    this.checkPolling();
  },

  async analyze() {
    const btn = document.getElementById('btnAnalyze');
    btn.disabled = true; btn.textContent = '分析中...';
    try {
      const desc = document.getElementById('descInput').value;
      if (desc !== this.project.description) {
        await API.put(`/api/projects/${this.project.id}`, { description: desc });
        this.project.description = desc;
      }
      const data = await API.post(`/api/design/${this.project.id}/understand`, {});
      this.cards = data.cards;
      document.getElementById('cardsContainer').innerHTML = SuggestionCards.render(this.cards);
      document.getElementById('btnReAnalyze').style.display = '';
    } catch (e) { App.showToast(e.message, 'error'); }
    btn.disabled = false; btn.textContent = 'AI分析';
  },

  async finalizePrompt() {
    const btn = document.getElementById('btnFinalize');
    btn.disabled = true; btn.textContent = '整理中...';
    try {
      const selectedIds = SuggestionCards.getSelectedIds();
      await API.post(`/api/design/${this.project.id}/select-cards`, { cardIds: selectedIds });
      const data = await API.post(`/api/design/${this.project.id}/finalize-prompt`, {});
      this.prompt = data.prompt;
      PromptEditor.setValue(this.prompt);
    } catch (e) { App.showToast(e.message, 'error'); }
    btn.disabled = false; btn.textContent = '整理Prompt';
  },

  async generate() {
    const prompt = PromptEditor.getValue();
    if (!prompt) { App.showToast('请先生成或输入Prompt', 'error'); return; }
    const btn = document.getElementById('btnGenerate');
    btn.disabled = true; btn.textContent = '生成中...';
    try {
      const data = await API.post(`/api/generate/${this.project.id}/initial`, { prompt });
      await this.reloadProject();
      this.activeNodeId = data.nodeId;
      document.getElementById('imageGridContainer').innerHTML = this.renderActiveGrid();
      document.getElementById('treeContainer').innerHTML = IterationTree.render(this.tree, this.activeNodeId);
      this.startPolling(data.nodeId);
    } catch (e) { App.showToast(e.message, 'error'); }
    btn.disabled = false; btn.textContent = '生成设计图';
  },

  selectedImageId: null,
  onSelectImage(imageId) {
    this.selectedImageId = imageId;
    document.getElementById('imageGridContainer').innerHTML = this.renderActiveGrid();
    document.getElementById('refineSection').style.display = '';
    const node = this.findNode(this.activeNodeId);
    const img = node?.images?.find(i => i.id === imageId);
    const info = document.getElementById('refineSelectedInfo');
    if (info) info.textContent = img ? `第 ${img.slot_index + 1} 张` : '';
    document.getElementById('refineInput').focus();
  },

  cancelRefine() {
    this.selectedImageId = null;
    document.getElementById('refineSection').style.display = 'none';
    document.getElementById('imageGridContainer').innerHTML = this.renderActiveGrid();
  },

  async refine() {
    const adjustmentDesc = document.getElementById('refineInput').value;
    if (!adjustmentDesc) { App.showToast('请描述调整需求', 'error'); return; }
    const btn = document.getElementById('btnRefine');
    btn.disabled = true; btn.textContent = '生成中...';
    try {
      const data = await API.post(`/api/generate/${this.project.id}/refine`, {
        parentNodeId: this.activeNodeId,
        selectedImageId: this.selectedImageId,
        adjustmentDesc,
        prompt: PromptEditor.getValue()
      });
      await this.reloadProject();
      this.activeNodeId = data.nodeId;
      this.selectedImageId = null;
      document.getElementById('refineSection').style.display = 'none';
      document.getElementById('refineInput').value = '';
      document.getElementById('imageGridContainer').innerHTML = this.renderActiveGrid();
      document.getElementById('treeContainer').innerHTML = IterationTree.render(this.tree, this.activeNodeId);
      this.startPolling(data.nodeId);
    } catch (e) { App.showToast(e.message, 'error'); }
    btn.disabled = false; btn.textContent = '生成调整';
  },

  async reloadProject() {
    const data = await API.get(`/api/projects/${this.project.id}`);
    this.project = data.project;
    this.tree = data.tree || [];
    this.cards = data.cards || [];
  },

  startPolling(nodeId) {
    this.stopPolling();
    this.pollingTimer = setInterval(async () => {
      try {
        const data = await API.get(`/api/generate/node/${nodeId}/status`);
        const node = this.findNode(nodeId);
        if (node) { node.images = data.images; node.status = data.status; }
        document.getElementById('imageGridContainer').innerHTML = this.renderActiveGrid();
        document.getElementById('treeContainer').innerHTML = IterationTree.render(this.tree, this.activeNodeId);
        if (data.status === 'completed' || data.status === 'failed') this.stopPolling();
      } catch (e) { this.stopPolling(); }
    }, 2000);
  },

  checkPolling() {
    const node = this.findNode(this.activeNodeId);
    if (node && node.status === 'generating') this.startPolling(this.activeNodeId);
  },

  stopPolling() { if (this.pollingTimer) { clearInterval(this.pollingTimer); this.pollingTimer = null; } },
  cleanup() { this.stopPolling(); this.project = null; this.tree = []; this.cards = []; this.activeNodeId = null; this.prompt = ''; }
};
