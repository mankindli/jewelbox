const ExportDialog = {
  show(projectId) {
    const overlay = document.createElement('div');
    overlay.className = 'image-overlay';
    overlay.innerHTML = `<div class="overlay-content export-dialog">
      <h3>导出项目</h3>
      <p>将导出所有已生成的图片及设计参数元数据（含prompt历史）。</p>
      <div class="export-actions">
        <button class="btn btn-primary" onclick="ExportDialog.download(${projectId})">下载ZIP</button>
        <button class="btn" onclick="this.closest('.image-overlay').remove()">取消</button>
      </div>
    </div>`;
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
  },
  async download(projectId) {
    try {
      const resp = await fetch(`/api/export/${projectId}`, {
        headers: { 'Authorization': `Bearer ${API.token}` }
      });
      if (!resp.ok) throw new Error('导出失败');
      const blob = await resp.blob();
      const disposition = resp.headers.get('content-disposition') || '';
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match ? decodeURIComponent(match[1]) : `project-${projectId}.zip`;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      document.querySelector('.image-overlay')?.remove();
    } catch (e) {
      App.showToast(e.message, 'error');
    }
  }
};
