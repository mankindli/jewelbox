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
          <button onclick="ImageGrid.download('${img.image_path}')" title="下载">下载</button>
          <button onclick="ImageGrid.remove(${img.id})" title="删除" class="btn-grid-danger">删除</button>
        </div>` : img.status === 'failed' ? `<div class="grid-actions grid-actions-fail">
          <button onclick="ImageGrid.remove(${img.id})" title="删除" class="btn-grid-danger">删除</button>
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
    const imgEl = document.querySelector(`[data-image-id="${imageId}"] img`);
    const imagePath = imgEl ? imgEl.getAttribute('src') : src;
    const overlay = document.createElement('div');
    overlay.className = 'image-overlay';
    overlay.innerHTML = `<div class="overlay-content"><img src="${src}"><div class="overlay-actions">
      ${imageId ? `<button onclick="ImageGrid.select(${imageId})">选择优化</button>
      <button onclick="ImageGrid.download('${imagePath}')">下载</button>` : ''}
      <button onclick="this.closest('.image-overlay').remove()">关闭</button>
    </div></div>`;
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
  },
  download(imagePath) {
    const a = document.createElement('a');
    a.href = imagePath;
    a.download = imagePath.split('/').pop();
    document.body.appendChild(a);
    a.click();
    a.remove();
  },
  select(imageId) {
    document.querySelector('.image-overlay')?.remove();
    if (WorkspacePage.onSelectImage) WorkspacePage.onSelectImage(imageId);
  },
  async remove(imageId) {
    if (!confirm('确定删除这张图片？')) return;
    try {
      await API.del(`/api/generate/image/${imageId}`);
      await WorkspacePage.reloadProject();
      document.getElementById('imageGridContainer').innerHTML = WorkspacePage.renderActiveGrid();
      document.getElementById('treeContainer').innerHTML = IterationTree.render(WorkspacePage.tree, WorkspacePage.activeNodeId);
    } catch (e) { App.showToast(e.message, 'error'); }
  }
};
