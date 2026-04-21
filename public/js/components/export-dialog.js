const ExportDialog = {
  show(projectId) {
    const overlay = document.createElement('div');
    overlay.className = 'image-overlay';
    overlay.innerHTML = `<div class="overlay-content export-dialog">
      <h3>导出项目</h3>
      <p>将导出所有已生成的图片及设计参数元数据（含prompt历史）。</p>
      <div class="export-actions">
        <a href="/api/export/${projectId}" class="btn btn-primary" download>下载ZIP</a>
        <button class="btn" onclick="this.closest('.image-overlay').remove()">取消</button>
      </div>
    </div>`;
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
  }
};
