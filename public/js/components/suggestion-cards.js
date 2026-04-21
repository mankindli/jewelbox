const SuggestionCards = {
  render(cards, onToggle) {
    if (!cards || !cards.length) return '<div class="cards-empty">暂无建议</div>';
    return `<div class="suggestion-cards">${cards.map(c =>
      `<div class="card ${c.selected ? 'selected' : ''}" data-card-id="${c.id}" onclick="SuggestionCards.toggle(${c.id})">
        <span class="card-text">${c.card_text}</span>
      </div>`
    ).join('')}</div>`;
  },
  toggle(cardId) {
    const el = document.querySelector(`[data-card-id="${cardId}"]`);
    if (el) el.classList.toggle('selected');
  },
  getSelectedIds() {
    return [...document.querySelectorAll('.suggestion-cards .card.selected')].map(el => Number(el.dataset.cardId));
  }
};
