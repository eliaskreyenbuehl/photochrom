// Image mosaic of the filtered works. Tiles share one size (4:3, cropped);
// only the rows in view are in the DOM (virtual scrolling), like list.js.

import { escapeHtml, hasImage, imageUrl } from '../../lib/catalog.js';
import { isSelected, setSelected } from '../../state.js';

const MIN_TILE = 170;  // px; the column count follows the available width
const GAP = 6;
const OVERSCAN_ROWS = 3;

export function createMosaic(container, { onOpen }) {
  container.innerHTML = `
    <p class="ml-mosaic-note" hidden></p>
    <div class="ml-mosaic-scroll" tabindex="-1">
      <div class="ml-mosaic-spacer"></div>
    </div>
    <p class="ml-empty" hidden>No images match these filters.</p>`;
  const note = container.querySelector('.ml-mosaic-note');
  const scroll = container.querySelector('.ml-mosaic-scroll');
  const spacer = container.querySelector('.ml-mosaic-spacer');
  const empty = container.querySelector('.ml-empty');

  let items = [];
  let cols = 1;
  let tileW = MIN_TILE;
  let tileH = (MIN_TILE * 3) / 4;
  let rendered = '';

  spacer.addEventListener('change', (e) => {
    const box = e.target.closest('input[data-id]');
    if (box) setSelected(box.dataset.id, box.checked);
  });
  spacer.addEventListener('click', (e) => {
    if (e.target.closest('input, label')) return;
    const tile = e.target.closest('[data-i]');
    if (tile) onOpen(items[Number(tile.dataset.i)]);
  });
  spacer.addEventListener('keydown', (e) => {
    const tile = e.target.closest('[data-i]');
    if (tile && e.target === tile && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onOpen(items[Number(tile.dataset.i)]);
    }
  });
  scroll.addEventListener('scroll', () => render(), { passive: true });
  new ResizeObserver(() => { layout(); render(true); }).observe(scroll);

  function layout() {
    const style = getComputedStyle(scroll);
    const width = scroll.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    if (!width) return;
    cols = Math.max(2, Math.floor((width + GAP) / (MIN_TILE + GAP)));
    tileW = (width - GAP * (cols - 1)) / cols;
    tileH = Math.round((tileW * 3) / 4);
  }

  function tileHtml(r, i) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const sel = isSelected(r.id);
    const title = escapeHtml(r.t);
    return `
      <div class="ml-tile${sel ? ' selected' : ''}" data-i="${i}" tabindex="0" role="button" aria-label="${title}" title="${title}"
        style="left:${col * (tileW + GAP)}px;top:${row * (tileH + GAP)}px;width:${tileW}px;height:${tileH}px">
        <img src="${imageUrl(r, 300)}" alt="" loading="lazy" decoding="async">
        <label class="ml-tile-check"><input type="checkbox" data-id="${r.id}" ${sel ? 'checked' : ''}><span class="visually-hidden">Use as main image: ${title}</span></label>
        <span class="ml-tile-caption">${title}</span>
      </div>`;
  }

  function render(force = false) {
    const rows = Math.ceil(items.length / cols);
    spacer.style.height = `${Math.max(0, rows * (tileH + GAP) - GAP)}px`;
    empty.hidden = items.length > 0;
    const rowH = tileH + GAP;
    const firstRow = Math.max(0, Math.floor(scroll.scrollTop / rowH) - OVERSCAN_ROWS);
    const lastRow = Math.min(rows, Math.ceil((scroll.scrollTop + scroll.clientHeight) / rowH) + OVERSCAN_ROWS);
    const key = `${firstRow}-${lastRow}-${cols}`;
    if (!force && key === rendered) return;
    rendered = key;
    let html = '';
    const end = Math.min(items.length, lastRow * cols);
    for (let i = firstRow * cols; i < end; i++) html += tileHtml(items[i], i);
    spacer.innerHTML = html;
  }

  return {
    /** records: the filtered works; those without an online image are left out here. */
    update(records) {
      items = records.filter(hasImage);
      const missing = records.length - items.length;
      note.hidden = missing === 0;
      note.textContent = `${missing.toLocaleString('en-US')} work${missing === 1 ? '' : 's'} without online image ${missing === 1 ? 'is' : 'are'} only shown in the list.`;
      scroll.scrollTop = 0;
      layout();
      render(true);
    },
    refresh() {
      for (const box of spacer.querySelectorAll('input[data-id]')) {
        box.checked = isSelected(box.dataset.id);
        box.closest('.ml-tile').classList.toggle('selected', box.checked);
      }
    },
    /** Called when the view becomes visible (sizes were 0 while hidden). */
    show() { layout(); render(true); },
  };
}
