const ImageGrid = {
  render(images, columns = 5, selectedImageId = null) {
    if (!images || !images.length) return '<div class="grid-empty">暂无图片</div>';
    return `<div class="image-grid cols-${columns}">${images.map(img => `
      <div class="grid-item ${img.status} ${img.id === selectedImageId ? 'selected-for-refine' : ''}" data-image-id="${img.id}">
        ${img.status === 'completed' && img.image_path
          ? `<img src="${img.image_path}" alt="设计图" onclick="ImageGrid.preview(${img.id})">`
          : img.status === 'failed'
            ? `<div class="grid-placeholder error"><span>生成失败</span></div>`
            : `<div class="grid-placeholder loading"><div class="spinner"></div><span>生成中...</span></div>`
        }
        ${img.status === 'completed' ? `<div class="grid-actions">
          <button onclick="ImageGrid.select(${img.id})" title="选择优化">优化</button>
          <a href="/api/export/image/${img.id}" download title="下载">下载</a>
        </div>` : ''}
        ${img.id === selectedImageId ? '<div class="selected-badge">已选中</div>' : ''}
      </div>
    `).join('')}</div>`;
  },
  preview(imageId) {
    const img = document.querySelector(`[data-image-id="${imageId}"] img`);
    if (!img) return;
    this.previewSrc(img.src, imageId);
  },
  previewSrc(src, imageId) {
    const overlay = document.createElement('div');
    overlay.className = 'image-overlay';
    overlay.innerHTML = `<div class="overlay-content"><img src="${src}"><div class="overlay-actions">
      ${imageId ? `<button onclick="ImageGrid.select(${imageId})">选择优化</button>
      <a href="/api/export/image/${imageId}" download>下载</a>` : ''}
      <button onclick="this.closest('.image-overlay').remove()">关闭</button>
    </div></div>`;
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
  },
  select(imageId) {
    document.querySelector('.image-overlay')?.remove();
    if (WorkspacePage.onSelectImage) WorkspacePage.onSelectImage(imageId);
  }
};
