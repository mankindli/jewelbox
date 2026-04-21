const SettingsPage = {
  async render(container) {
    container.innerHTML = `<div class="page-layout">
      <header class="top-bar"><button class="btn" onclick="App.navigate('projects')">← 返回</button><h2>设置</h2></header>
      <div class="settings-content" id="settingsContent"><div class="loading">加载中...</div></div>
    </div>`;
    try {
      const isAdmin = API.user?.role === 'admin';
      const data = isAdmin ? await API.get('/api/settings/admin') : await API.get('/api/settings');
      const settings = data.settings;
      const content = document.getElementById('settingsContent');
      content.innerHTML = `
        <div class="settings-section">
          <h3>国家列表</h3>
          <div id="countriesList">${this.renderList(settings.countries || [], 'countries')}</div>
          ${isAdmin ? '<button class="btn" onclick="SettingsPage.addItem(\'countries\')">+ 添加国家</button>' : ''}
        </div>
        <div class="settings-section">
          <h3>分辨率选项</h3>
          <div id="resolutionsList">${this.renderList(settings.resolutions || [], 'resolutions')}</div>
          ${isAdmin ? '<button class="btn" onclick="SettingsPage.addItem(\'resolutions\')">+ 添加分辨率</button>' : ''}
        </div>
        <div class="settings-section">
          <h3>珠宝类型</h3>
          <div id="typesList">${this.renderList(settings.jewelry_types || [], 'jewelry_types')}</div>
          ${isAdmin ? '<button class="btn" onclick="SettingsPage.addItem(\'jewelry_types\')">+ 添加类型</button>' : ''}
        </div>`;
    } catch (e) { App.showToast(e.message, 'error'); }
  },
  renderList(items, key) {
    const isAdmin = API.user?.role === 'admin';
    return `<div class="settings-list">${items.map((i, idx) => `<span class="badge setting-item">
      ${i.label} (${i.id})
      ${isAdmin ? `<button class="btn-inline" onclick="SettingsPage.editItem('${key}',${idx})" title="编辑">✎</button>
      <button class="btn-inline btn-inline-danger" onclick="SettingsPage.deleteItem('${key}',${idx})" title="删除">×</button>` : ''}
    </span>`).join('')}</div>`;
  },
  addItem(key) {
    this.showItemForm(key);
  },
  editItem(key, index) {
    this.getList(key).then(list => {
      const item = list[index];
      if (!item) return;
      this.showItemForm(key, index, item);
    });
  },
  showItemForm(key, index, item) {
    const isEdit = item !== undefined;
    const overlay = document.createElement('div');
    overlay.className = 'image-overlay';
    overlay.innerHTML = `<div class="overlay-content create-dialog">
      <h3>${isEdit ? '编辑' : '添加'}</h3>
      <form id="settingItemForm">
        <label>ID（英文标识）</label><input type="text" id="si_id" value="${item?.id || ''}" required>
        <label>显示名称</label><input type="text" id="si_label" value="${item?.label || ''}" required>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">${isEdit ? '保存' : '添加'}</button>
          <button type="button" class="btn" onclick="this.closest('.image-overlay').remove()">取消</button>
        </div>
      </form>
    </div>`;
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
    document.getElementById('settingItemForm').onsubmit = (e) => {
      e.preventDefault();
      const newId = document.getElementById('si_id').value;
      const newLabel = document.getElementById('si_label').value;
      if (!newId || !newLabel) return;
      overlay.remove();
      if (isEdit) {
        this.saveList(key, l => { l[index] = { id: newId, label: newLabel }; return l; });
      } else {
        this.saveList(key, l => { l.push({ id: newId, label: newLabel }); return l; });
      }
    };
  },
  deleteItem(key, index) {
    if (!confirm('确定删除此项？')) return;
    this.saveList(key, list => { list.splice(index, 1); return list; });
  },
  async getList(key) {
    const data = await API.get('/api/settings/admin');
    return data.settings[key] || [];
  },
  async saveList(key, mutate) {
    try {
      const list = await this.getList(key);
      const updated = mutate(list);
      await API.put(`/api/settings/admin/${key}`, { value: updated });
      App.showToast('已更新', 'success');
      this.render(document.getElementById('app'));
    } catch (e) { App.showToast(e.message, 'error'); }
  }
};
