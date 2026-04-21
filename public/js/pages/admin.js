const AdminPage = {
  async render(container) {
    container.innerHTML = `<div class="page-layout">
      <header class="top-bar"><button class="btn" onclick="App.navigate('projects')">← 返回</button><h2>管理后台</h2>
        <div class="top-actions">
          <button class="btn" onclick="AdminPage.showSection('users')">用户</button>
          <button class="btn" onclick="AdminPage.showSection('endpoints')">端点</button>
        </div>
      </header>
      <div id="adminContent" class="admin-content"></div>
    </div>`;
    this.showSection('users');
  },
  async showSection(section) {
    const content = document.getElementById('adminContent');
    if (section === 'users') {
      const data = await API.get('/api/admin/users');
      content.innerHTML = `<div class="admin-section">
        <button class="btn btn-primary" onclick="AdminPage.showUserForm()">+ 新建用户</button>
        <table class="data-table"><thead><tr><th>用户名</th><th>昵称</th><th>角色</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>${data.users.map(u => `<tr><td>${u.username}</td><td>${u.nickname}</td><td>${u.role}</td><td>${u.status ? '启用' : '禁用'}</td>
          <td><button class="btn-sm" onclick="AdminPage.showUserForm(${u.id},'${u.username}','${u.nickname}','${u.role}')">编辑</button>
          <button class="btn-sm" onclick="AdminPage.toggleUser(${u.id},${u.status})">${u.status ? '禁用' : '启用'}</button>
          <button class="btn-sm btn-danger" onclick="AdminPage.deleteUser(${u.id})">删除</button></td></tr>`).join('')}</tbody></table></div>`;
    } else {
      const data = await API.get('/api/admin/endpoints');
      content.innerHTML = `<div class="admin-section">
        <button class="btn btn-primary" onclick="AdminPage.showEndpointForm()">+ 新建端点</button>
        <p class="hint">优先级数字越大越优先使用，同优先级轮询分配。端点失败自动停用，5分钟后自动恢复尝试。</p>
        <table class="data-table"><thead><tr><th>名称</th><th>模型</th><th>类型</th><th>状态</th><th>优先级</th><th>失败次数</th><th>操作</th></tr></thead>
        <tbody>${data.endpoints.map(e => `<tr><td>${e.name}</td><td>${e.model}</td><td>${e.model_type === 'understanding' ? '理解模型' : '图片模型'}</td>
          <td><span class="status-dot status-${e.status}"></span>${e.status === 'online' ? '在线' : '离线'}</td>
          <td>${e.priority}</td><td>${e.fail_count || 0}</td>
          <td>
            <button class="btn-sm" onclick="AdminPage.toggleEndpoint(${e.id},'${e.status}')">${e.status === 'online' ? '停用' : '启用'}</button>
            <button class="btn-sm" onclick="AdminPage.testEndpoint(${e.id})">检测</button>
            <button class="btn-sm" onclick='AdminPage.showEndpointForm(${JSON.stringify(e).replace(/'/g,"&#39;")})'>编辑</button>
            <button class="btn-sm btn-danger" onclick="AdminPage.deleteEndpoint(${e.id})">删除</button>
          </td></tr>`).join('')}</tbody></table></div>`;
    }
  },

  showUserForm(id, username, nickname, role) {
    const isEdit = !!id;
    const overlay = document.createElement('div');
    overlay.className = 'image-overlay';
    overlay.innerHTML = `<div class="overlay-content create-dialog">
      <h3>${isEdit ? '编辑用户' : '新建用户'}</h3>
      <form id="userForm">
        <label>用户名</label><input type="text" id="uf_username" value="${username || ''}" required>
        <label>密码${isEdit ? '（留空不修改）' : ''}</label><input type="password" id="uf_password" ${isEdit ? '' : 'required'}>
        <label>昵称</label><input type="text" id="uf_nickname" value="${nickname || ''}">
        <label>角色</label><select id="uf_role"><option value="user" ${role === 'user' ? 'selected' : ''}>普通用户</option><option value="admin" ${role === 'admin' ? 'selected' : ''}>管理员</option></select>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">${isEdit ? '保存' : '创建'}</button>
          <button type="button" class="btn" onclick="this.closest('.image-overlay').remove()">取消</button>
        </div>
      </form>
    </div>`;
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
    document.getElementById('userForm').onsubmit = async (e) => {
      e.preventDefault();
      const body = { username: document.getElementById('uf_username').value, nickname: document.getElementById('uf_nickname').value, role: document.getElementById('uf_role').value };
      const pwd = document.getElementById('uf_password').value;
      if (pwd) body.password = pwd;
      try {
        if (isEdit) { await API.put(`/api/admin/users/${id}`, body); }
        else { if (!pwd) { App.showToast('请输入密码', 'error'); return; } await API.post('/api/admin/users', body); }
        overlay.remove();
        this.showSection('users');
      } catch (err) { App.showToast(err.message, 'error'); }
    };
  },

  showEndpointForm(ep) {
    const isEdit = !!ep;
    const overlay = document.createElement('div');
    overlay.className = 'image-overlay';
    overlay.innerHTML = `<div class="overlay-content create-dialog">
      <h3>${isEdit ? '编辑端点' : '新建端点'}</h3>
      <form id="epForm">
        <label>名称</label><input type="text" id="ep_name" value="${ep?.name || ''}" required>
        <label>Base URL</label><input type="text" id="ep_base_url" value="${ep?.base_url || ''}" required placeholder="https://api.example.com/v1">
        <label>API Key</label><input type="text" id="ep_api_key" value="${ep?.api_key || ''}" required>
        <label>模型名称</label><input type="text" id="ep_model" value="${ep?.model || ''}" required placeholder="gemini-3.1-flash-image-preview">
        <label>模型类型</label><select id="ep_model_type"><option value="image" ${ep?.model_type === 'image' ? 'selected' : ''}>图片生成模型</option><option value="understanding" ${ep?.model_type === 'understanding' ? 'selected' : ''}>理解模型</option></select>
        <label>优先级</label><input type="number" id="ep_priority" value="${ep?.priority || 0}" min="0">
        ${isEdit ? `<label>状态</label><select id="ep_status"><option value="online" ${ep?.status === 'online' ? 'selected' : ''}>在线</option><option value="offline" ${ep?.status === 'offline' ? 'selected' : ''}>离线</option></select>` : ''}
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">${isEdit ? '保存' : '创建'}</button>
          <button type="button" class="btn" onclick="this.closest('.image-overlay').remove()">取消</button>
        </div>
      </form>
    </div>`;
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
    document.getElementById('epForm').onsubmit = async (e) => {
      e.preventDefault();
      const body = {
        name: document.getElementById('ep_name').value,
        base_url: document.getElementById('ep_base_url').value,
        api_key: document.getElementById('ep_api_key').value,
        model: document.getElementById('ep_model').value,
        model_type: document.getElementById('ep_model_type').value,
        priority: Number(document.getElementById('ep_priority').value)
      };
      if (isEdit) body.status = document.getElementById('ep_status').value;
      try {
        if (isEdit) { await API.put(`/api/admin/endpoints/${ep.id}`, body); }
        else { await API.post('/api/admin/endpoints', body); }
        overlay.remove();
        this.showSection('endpoints');
      } catch (err) { App.showToast(err.message, 'error'); }
    };
  },

  toggleUser(id, currentStatus) { API.put(`/api/admin/users/${id}`, { status: currentStatus ? 0 : 1 }).then(() => this.showSection('users')); },
  deleteUser(id) { if (confirm('确定删除？')) API.del(`/api/admin/users/${id}`).then(() => this.showSection('users')); },
  deleteEndpoint(id) { if (confirm('确定删除？')) API.del(`/api/admin/endpoints/${id}`).then(() => this.showSection('endpoints')); },
  toggleEndpoint(id, currentStatus) {
    const newStatus = currentStatus === 'online' ? 'offline' : 'online';
    API.put(`/api/admin/endpoints/${id}`, { status: newStatus, fail_count: 0 }).then(() => this.showSection('endpoints')).catch(e => App.showToast(e.message, 'error'));
  },
  async testEndpoint(id) {
    const btn = event.target;
    const origText = btn.textContent;
    btn.disabled = true; btn.textContent = '检测中...';
    try {
      const data = await API.post(`/api/admin/endpoints/${id}/test`, {});
      if (data.success) {
        App.showToast(`端点可用 (${data.latency}ms)`, 'success');
      } else {
        App.showToast(`端点不可用: ${data.error}`, 'error');
      }
      this.showSection('endpoints');
    } catch (e) {
      App.showToast(e.message, 'error');
    }
    btn.disabled = false; btn.textContent = origText;
  }
};
