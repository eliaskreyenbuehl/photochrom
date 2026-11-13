// Pair Matching tab
// First step: shows the main images (left side) selected in the Media Library.
// Planned: find partner images via Wikidata, metadata and image content, image similarity,
// color relation and user annotations (see Outline.md), show pairs as a gallery and open
// them in the comparison tab.

import { dateLabel, escapeHtml, imageUrl, loadCatalog } from '../lib/catalog.js';
import { getSelection, onSelectionChange, setSelected } from '../state.js';

let container;

async function draw() {
  const ids = getSelection();
  if (!ids.length) {
    container.innerHTML = `
      <h2>Pair Matching</h2>
      <p class="placeholder">No main images selected yet. Check works in the Media Library to use them as the left image of a pair.</p>`;
    return;
  }
  const catalog = await loadCatalog();
  const LIMIT = 200; // keep the page light when many works are selected
  const cards = ids.slice(0, LIMIT).map((id) => {
    const r = catalog.byId.get(id);
    if (!r) return '';
    const img = imageUrl(r, 300);
    return `
      <li class="pm-card">
        ${img ? `<img src="${img}" alt="" loading="lazy">` : '<div class="no-img">No online image yet</div>'}
        <div class="pm-card-body">
          <strong>${escapeHtml(r.t)}</strong>
          <span class="muted">${escapeHtml(dateLabel(r))}${r.p ? ` · ${escapeHtml(r.p)}` : ''}</span>
          <button type="button" class="link-btn" data-remove="${r.id}">Remove</button>
        </div>
      </li>`;
  }).join('');
  container.innerHTML = `
    <h2>Pair Matching</h2>
    <p>${ids.length.toLocaleString('en-US')} main image${ids.length === 1 ? '' : 's'} (left side). Finding partner images comes next.</p>
    <ul class="pm-grid">${cards}</ul>
    ${ids.length > LIMIT ? `<p class="muted">Showing the first ${LIMIT}.</p>` : ''}`;
}

export default {
  id: 'pair-matching',
  label: 'Pair Matching',

  render(el) {
    container = el;
    container.addEventListener('click', (e) => {
      const id = e.target.closest('[data-remove]')?.dataset.remove;
      if (id) setSelected(id, false);
    });
    onSelectionChange(() => { if (!container.hidden) draw(); });
    draw();
  },

  activate() { draw(); },
};
