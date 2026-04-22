const ProjectsPage = {
  async render(container) {
    container.innerHTML = `<div class="page-layout">
      <nav class="top-bar">
        <h1>&#x1F48E; 我的设计</h1>
        <div class="top-actions">
          ${API.user?.role === 'admin' ? '<button class="btn outline" onclick="App.navigate(\'admin\')">管理</button>' : ''}
          <button class="btn outline" onclick="App.navigate('settings')">设置</button>
          <button class="btn outline secondary" onclick="API.clearAuth();App.navigate('login')">退出</button>
        </div>
      </nav>
      <div class="projects-content">
        <button class="btn btn-primary" onclick="ProjectsPage.showCreate()">+ 新建设计</button>
        <div id="projectList" class="project-grid"><div class="loading"><span aria-busy="true">加载中...</span></div></div>
      </div>
    </div>`;
    this.loadList();
  },
  async loadList() {
    try {
      const data = await API.get('/api/projects');
      const list = document.getElementById('projectList');
      if (!data.projects.length) { list.innerHTML = '<p class="empty">暂无项目，点击上方按钮创建</p>'; return; }
      list.innerHTML = data.projects.map(p => `
        <article class="project-card" onclick="App.navigate('workspace', {projectId: ${p.id}})">
          <h3>${p.name}</h3>
          <div class="project-meta">
            <span class="badge">${p.jewelry_type}</span>
            <span class="badge">${p.target_country}</span>
            <span class="status-badge status-${p.status}">${p.status === 'active' ? '进行中' : p.status === 'draft' ? '草稿' : p.status}</span>
          </div>
          <div class="project-time">${new Date(p.updated_at).toLocaleString()}</div>
          <button class="btn-icon btn-delete" onclick="event.stopPropagation();ProjectsPage.deleteProject(${p.id})">&#x2715;</button>
        </article>
      `).join('');
    } catch (e) { App.showToast(e.message, 'error'); }
  },
  async showCreate() {
    try {
      const settings = await API.get('/api/settings');
      const types = settings.settings.jewelry_types || [];
      const countries = settings.settings.countries || [];
      const resolutions = settings.settings.resolutions || [];
      const overlay = document.createElement('div');
      overlay.className = 'image-overlay';
      overlay.innerHTML = `<div class="overlay-content create-dialog">
        <h3>新建珠宝设计</h3>
        <form id="createForm">
          <label>项目名称
            <input type="text" id="pName" placeholder="给你的设计起个名字" required>
          </label>
          <label>珠宝类型
            <select id="pType">${types.map(t => `<option value="${t.label}">${t.label}</option>`).join('')}</select>
          </label>
          <label>目标国家
            <select id="pCountry">${countries.map(c => `<option value="${c.label}">${c.label}</option>`).join('')}</select>
          </label>
          <label>分辨率
            <select id="pRes">${resolutions.map(r => `<option value="${r.id}">${r.label}</option>`).join('')}</select>
          </label>
          <label>设计描述
            <textarea id="pDesc" rows="3" placeholder="描述你想要的珠宝款式..."></textarea>
          </label>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">创建</button>
            <button type="button" class="btn outline" onclick="this.closest('.image-overlay').remove()">取消</button>
          </div>
        </form>
      </div>`;
      overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
      document.body.appendChild(overlay);
      document.getElementById('createForm').onsubmit = async (e) => {
        e.preventDefault();
        try {
          const data = await API.post('/api/projects', {
            name: document.getElementById('pName').value,
            jewelry_type: document.getElementById('pType').value,
            target_country: document.getElementById('pCountry').value,
            resolution: document.getElementById('pRes').value,
            description: document.getElementById('pDesc').value
          });
          overlay.remove();
          App.navigate('workspace', { projectId: data.id });
        } catch (err) { App.showToast(err.message, 'error'); }
      };
    } catch (e) { App.showToast(e.message, 'error'); }
  },
  async deleteProject(id) {
    if (!confirm('确定删除此项目？所有图片将被清除。')) return;
    try { await API.del(`/api/projects/${id}`); this.loadList(); } catch (e) { App.showToast(e.message, 'error'); }
  }
};
