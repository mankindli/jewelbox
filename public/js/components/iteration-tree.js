const IterationTree = {
  render(tree, activeNodeId, allImages) {
    if (!tree || !tree.length) return '<div class="tree-empty">尚未开始生成</div>';
    this._allImages = allImages || this._collectImages(tree);
    return `<div class="iteration-tree">${this.renderNodes(tree, activeNodeId)}</div>`;
  },
  _collectImages(nodes) {
    const map = {};
    const walk = (list) => { for (const n of list) { for (const img of (n.images || [])) { map[img.id] = img; } if (n.children) walk(n.children); } };
    walk(nodes);
    return map;
  },
  renderNodes(nodes, activeNodeId) {
    return nodes.map(node => {
      const baseImg = node.selected_image_id ? this._allImages[node.selected_image_id] : null;
      return `
      <div class="tree-node ${node.id === activeNodeId ? 'active' : ''}" data-node-id="${node.id}" onclick="WorkspacePage.switchNode(${node.id})">
        <div class="node-header">
          <span class="node-badge">${node.node_type === 'initial' ? '初始' : `调整${node.depth}`}</span>
          <span class="node-status status-${node.status}">${node.status === 'completed' ? '✓' : node.status === 'generating' ? '...' : node.status === 'failed' ? '✗' : ''}</span>
        </div>
        ${baseImg ? `<div class="node-base"><span class="node-base-label">基于:</span><img src="${baseImg.image_path}" class="thumb"></div>` : ''}
        <div class="node-thumbs">${(node.images || []).filter(i => i.status === 'completed').slice(0, 4).map(i =>
          `<img src="${i.image_path}" class="thumb">`
        ).join('')}</div>
        ${node.adjustment_desc ? `<div class="node-desc" title="${node.adjustment_desc}">${node.adjustment_desc.slice(0, 30)}${node.adjustment_desc.length > 30 ? '...' : ''}</div>` : ''}
      </div>
      ${node.children && node.children.length ? `<div class="tree-children">${this.renderNodes(node.children, activeNodeId)}</div>` : ''}
    `}).join('');
  }
};
