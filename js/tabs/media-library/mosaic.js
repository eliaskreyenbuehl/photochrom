// Image mosaic of the filtered works as masonry columns: all columns have the same
// width, each tile keeps the aspect ratio of its image and goes into the shortest
// column. Only the tiles in view are in the DOM (virtual scrolling), like list.js.
//
// Aspect ratios come from the catalog (field "ar", see scripts/build_image_sizes.py), so
// tiles are placed before the images load. Where data/print-area.csv has a box, the tile
// shows only the print, without colour chart and scanner background (box machine-made,
// unreviewed; the details panel and the list still show the whole scan).

import { escapeHtml, hasImage, imageUrl } from '../../lib/catalog.js';
import { isCropping } from '../../lib/print-area.js';
import { isSelected, setSelected } from '../../state.js';

const MIN_COL = 190;   // px; the column count follows the available width
const GAP = 6;
const OVERSCAN = 600;  // px rendered above and below the visible part
const DEFAULT_RATIO = 4 / 3;
// Very wide or tall images would make tiny or huge tiles; beyond these limits the tile
// keeps the limit and the image is cropped to fill it.
const MIN_RATIO = 0.5;
const MAX_RATIO = 3;

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
  let areas = new Map();   // img -> print-area box
  let pos = [];            // per item: { x, y, h, box, ratio }
  let colW = MIN_COL;
  let rendered = '';
  let frame = 0;

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
  scroll.addEventListener('scroll', () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => render());
  }, { passive: true });
  let lastWidth = 0;
  new ResizeObserver(() => {
    if (scroll.clientWidth === lastWidth) { render(true); return; }
    lastWidth = scroll.clientWidth;
    layout();
    render(true);
  }).observe(scroll);

  /** Print-area box of a record, if it really removes something. */
  function boxOf(r) {
    const box = r.img ? areas.get(r.img) : null;
    return isCropping(box) ? box : null;
  }

  /** Masonry: every tile goes into the currently shortest column. */
  function layout() {
    const style = getComputedStyle(scroll);
    const width = scroll.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    if (!width) return;
    const cols = Math.max(2, Math.floor((width + GAP) / (MIN_COL + GAP)));
    colW = (width - GAP * (cols - 1)) / cols;
    const heights = new Array(cols).fill(0);
    pos = items.map((r) => {
      const box = boxOf(r);
      let ratio = r.ar || DEFAULT_RATIO;
      if (box) ratio *= (box.x1 - box.x0) / (box.y1 - box.y0);
      const clamped = Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));
      let c = 0;
      for (let k = 1; k < cols; k++) if (heights[k] < heights[c]) c = k;
      const h = Math.round(colW / clamped);
      const p = { x: c * (colW + GAP), y: heights[c], h, box, exact: clamped === ratio };
      heights[c] += h + GAP;
      return p;
    });
    spacer.style.height = `${Math.max(0, Math.max(...heights) - GAP)}px`;
  }

  /** Image inside the tile: whole image, or shifted and scaled so only the print area shows. */
  function imgHtml(r, p) {
    const src = imageUrl(r, 300);
    if (!p.box || !p.exact) return `<img src="${src}" alt="" loading="lazy" decoding="async">`;
    const bw = p.box.x1 - p.box.x0;
    const bh = p.box.y1 - p.box.y0;
    const style = `width:${(100 / bw).toFixed(3)}%;left:${(-p.box.x0 / bw * 100).toFixed(3)}%;top:${(-p.box.y0 / bh * 100).toFixed(3)}%`;
    return `<img class="cropped" src="${src}" alt="" loading="lazy" decoding="async" style="${style}">`;
  }

  function tileHtml(r, i) {
    const p = pos[i];
    const sel = isSelected(r.id);
    const title = escapeHtml(r.t);
    return `
      <div class="ml-tile${sel ? ' selected' : ''}" data-i="${i}" tabindex="0" role="button" aria-label="${title}" title="${title}"
        style="left:${p.x}px;top:${p.y}px;width:${colW}px;height:${p.h}px">
        ${imgHtml(r, p)}
        <label class="ml-tile-check"><input type="checkbox" data-id="${r.id}" ${sel ? 'checked' : ''}><span class="visually-hidden">Use as main image: ${title}</span></label>
        <span class="ml-tile-caption">${title}</span>
      </div>`;
  }

  function render(force = false) {
    empty.hidden = items.length > 0;
    const top = scroll.scrollTop - OVERSCAN;
    const bottom = scroll.scrollTop + scroll.clientHeight + OVERSCAN;
    const visible = [];
    for (let i = 0; i < pos.length; i++) {
      if (pos[i].y < bottom && pos[i].y + pos[i].h > top) visible.push(i);
    }
    const key = `${visible[0]}-${visible[visible.length - 1]}-${visible.length}-${colW}`;
    if (!force && key === rendered) return;
    rendered = key;
    spacer.innerHTML = visible.map((i) => tileHtml(items[i], i)).join('');
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
    /** Print-area boxes (Map img -> box) arrive after the catalog; re-place the tiles. */
    setPrintAreas(map) {
      areas = map;
      layout();
      render(true);
    },
    refresh() {
      for (const box of spacer.querySelectorAll('input[data-id]')) {
        box.checked = isSelected(box.dataset.id);
        box.closest('.ml-tile').classList.toggle('selected', box.checked);
      }
    },
    /** Called when the view becomes visible or its width changed (sizes were 0 while hidden). */
    show() { layout(); render(true); },
  };
}
