// Candidates tab (id 'pair-matching', kept for links and the URL hash #pair-matching).
// The step between the Media Library and the Image Comparison tab, which works with exactly two images.
//
// - Shows the works selected in the Media Library. Click two of them (or tick their boxes)
//   and press "Compare" to open them as a pair in the Image Comparison tab. Double-click
//   an image for its details.
// - "Find pairs" suggests pairs for the selected works:
//     * data/candidates.csv: pairs between two photochroms, one row per pair, written by
//       pairing methods (e.g. embedding similarity). Columns: see docs/data.md.
//     * Genre "Reproduction": the painting the photochrom reproduces, from data/artwork-pairs.csv
//       (Wikidata match, unreviewed), as in the Image Comparison tab.
//   New pairing methods only need to write rows to candidates.csv.

import { dateLabel, escapeHtml, fullImageUrl, imageUrl, loadCatalog } from '../lib/catalog.js';
import { loadCsvObjects } from '../lib/csv.js';
import { imageFromRecord } from '../lib/sources/index.js';
import { openDetails } from '../lib/ui/details.js';
import { icon } from '../lib/ui/icons.js';
import { infoTip } from '../lib/ui/info.js';
import { bindSelectAndOpen } from '../lib/ui/select-open.js';
import { createSelectionBar } from '../lib/ui/selection-bar.js';
import { showTab } from '../main.js';
import { getSelection, onSelectionChange, setComparisonPair, setSelected } from '../state.js';
import { loadArtworkPairs, photochromSide } from './comparison/pairs.js';

const CANDIDATES_URL = 'data/candidates.csv';
const REPRODUCTION = 'reproduktion'; // genre key in catalog.json ("Reproduction")
const LIMIT = 200; // keep the page light when many works are selected

let container;
let main; // redrawn part of the tab; the selection bar below it stays
let bar; // selection bar (js/lib/ui/selection-bar.js)
let shownIds = []; // MMS IDs of the cards, in order (for browsing in the details dialog)
let picked = []; // up to two MMS IDs ticked for comparison, oldest first
let suggestions = null; // null = "Find pairs" not run yet; else { pairs, notes }
let statusText = '';
const pairsById = new Map(); // suggested pairs, for the per-pair compare buttons

/** Comparison pair from two catalog records (both photochroms). */
function pairFromRecords(a, b, extraFields = {}) {
  return {
    id: `cand-${a.id}-${b.id}`,
    label: `${a.t} – ${b.t}`,
    left: photochromSide(a, extraFields),
    right: photochromSide(b, extraFields),
    group: 'candidates',
  };
}

function openInComparison(pair) {
  setComparisonPair(pair);
  showTab('comparison');
}

/** Pairs between two photochroms from candidates.csv that involve a selected work. */
async function candidatesFromCsv(catalog, selected) {
  let rows;
  try {
    rows = await loadCsvObjects(CANDIDATES_URL);
  } catch (err) {
    console.warn('candidates.csv not available:', err);
    return { pairs: [], note: `${CANDIDATES_URL} could not be loaded.` };
  }
  const pairs = [];
  for (const row of rows) {
    if (!selected.has(row.mms_id_a) && !selected.has(row.mms_id_b)) continue;
    // The selected work goes on the left.
    const [leftId, rightId] = selected.has(row.mms_id_a) ? [row.mms_id_a, row.mms_id_b] : [row.mms_id_b, row.mms_id_a];
    const a = catalog.byId.get(leftId);
    const b = catalog.byId.get(rightId);
    if (!a || !b || !fullImageUrl(a) || !fullImageUrl(b)) continue;
    const how = { pair_method: row.method, pair_score: row.score, pair_review_status: row.review_status };
    pairs.push({ ...pairFromRecords(a, b, how), method: row.method, score: row.score });
  }
  pairs.sort((x, y) => (Number(y.score) || 0) - (Number(x.score) || 0));
  return { pairs, note: rows.length ? '' : `${CANDIDATES_URL} has no pairs yet.` };
}

/** Painting pairs (artwork-pairs.csv) for selected works of the genre "Reproduction". */
async function paintingPairs(catalog, selected) {
  const repro = [...selected].filter((id) => catalog.byId.get(id)?.g === REPRODUCTION);
  if (!repro.length) return { pairs: [], note: '' };
  const byId = new Map((await loadArtworkPairs()).map((p) => [p.id, p]));
  const pairs = repro.map((id) => byId.get(`art-${id}`)).filter(Boolean)
    .map((p) => ({ ...p, method: 'wikidata-painting', score: '' }));
  const missing = repro.length - pairs.length;
  const note = missing
    ? `${missing} reproduction${missing === 1 ? ' has' : 's have'} no painting with an image yet.`
    : '';
  return { pairs, note };
}

async function findPairs() {
  const button = container.querySelector('[data-act="find"]');
  button.disabled = true;
  setStatus('Searching…');
  try {
    const catalog = await loadCatalog();
    const selected = new Set(getSelection());
    const results = await Promise.all([candidatesFromCsv(catalog, selected), paintingPairs(catalog, selected)]);
    suggestions = {
      pairs: results.flatMap((r) => r.pairs),
      notes: results.map((r) => r.note).filter(Boolean),
    };
    setStatus('');
  } catch (err) {
    setStatus(`Finding pairs failed: ${err.message}`);
  } finally {
    button.disabled = false;
  }
  draw();
}

function setStatus(text) {
  statusText = text;
  const el = container.querySelector('.cand-status');
  if (el) el.textContent = text;
}

function thumb(side) {
  return side.fallbackUrl || side.url;
}

const MACHINE = '<span class="badge badge-machine" title="Machine-generated, not reviewed">machine-generated</span>';

function suggestionsHtml() {
  if (!suggestions) return '';
  pairsById.clear();
  const { pairs, notes } = suggestions;
  const items = pairs.map((p) => {
    pairsById.set(p.id, p);
    const method = p.method === 'wikidata-painting'
      ? 'Painting via Wikidata'
      : `${escapeHtml(p.method)}${p.score ? ` · score ${escapeHtml(p.score)}` : ''}`;
    const img = (side) => `<img src="${escapeHtml(thumb(p[side]))}" alt="${escapeHtml(p[side].label || p[side].title || '')}" loading="lazy" data-side="${side}" title="Double-click for details">`;
    return `
      <li class="card cand-pair" data-pair-card="${escapeHtml(p.id)}">
        <div class="cand-pair-imgs">${img('left')}${img('right')}</div>
        <div class="card-body">
          <strong class="card-title" title="${escapeHtml(p.label)}">${escapeHtml(p.label)}</strong>
          <span class="card-meta">${method} ${MACHINE}</span>
        </div>
        <div class="card-foot">
          <button type="button" class="btn btn-primary btn-sm" data-pair="${escapeHtml(p.id)}">${icon('compare')}<span class="btn-label">Compare</span></button>
        </div>
      </li>`;
  }).join('');
  return `
    <section class="cand-section">
      <h3>Suggested pairs <span class="count-pill">${pairs.length}</span></h3>
      ${notes.map((n) => `<p class="muted">${escapeHtml(n)}</p>`).join('')}
      ${pairs.length ? `<ul class="card-grid cand-pairs">${items}</ul>` : '<p class="placeholder">No pairs found for the selected works.</p>'}
    </section>`;
}

const HEADING = '<h2 class="visually-hidden">Candidates</h2>';
const FIND_INFO = 'Suggests pairs for the selected works: photochrom–photochrom pairs from <code>data/candidates.csv</code> (written by pairing methods such as image similarity), and for works of the genre “Reproduction” the painting they reproduce (Wikidata match). All suggestions are machine-generated and unreviewed.';
const PICK_INFO = 'Click two images (or tick their boxes) to pick them, then press <b>Compare</b> in the bar below. A third pick replaces the oldest. <b>Double-click</b> an image for its details.';

async function draw() {
  const ids = getSelection();
  picked = picked.filter((id) => ids.includes(id)); // drop works removed from the selection
  updateBar(ids);
  if (!ids.length) {
    shownIds = [];
    main.innerHTML = `${HEADING}
      <p class="placeholder">No works selected yet. Select works in the Media Library (click an image) to bring them here.</p>`;
    return;
  }
  const catalog = await loadCatalog();
  shownIds = ids.slice(0, LIMIT).filter((id) => catalog.byId.has(id));
  const cards = shownIds.map((id, i) => {
    const r = catalog.byId.get(id);
    const img = imageUrl(r, 300);
    const on = picked.includes(id);
    const title = escapeHtml(r.t);
    return `
      <li class="card pm-card${on ? ' picked' : ''}" data-id="${r.id}" data-i="${i}" tabindex="0" role="checkbox" aria-checked="${on}" aria-label="${title}">
        <div class="card-media">
          ${img ? `<img src="${img}" alt="" loading="lazy">` : '<div class="no-img">No online image yet</div>'}
          <span class="check-box" aria-hidden="true"></span>
          <button type="button" class="btn btn-icon btn-sm card-remove" data-remove="${r.id}" aria-label="Remove ${title} from the selection" title="Remove from the selection">${icon('close')}</button>
        </div>
        <div class="card-body">
          <strong class="card-title" title="${title}">${title}</strong>
          <span class="card-meta">${escapeHtml(dateLabel(r))}${r.p ? ` · ${escapeHtml(r.p)}` : ''}${r.g === REPRODUCTION ? ' · Reproduction' : ''}</span>
        </div>
      </li>`;
  }).join('');
  main.innerHTML = `${HEADING}
    <div class="toolbar cand-toolbar">
      <button type="button" class="btn" data-act="find">${icon('sparkle')}<span class="btn-label">Find pairs</span></button>
      ${infoTip(FIND_INFO, 'How pairs are found')}
      <span class="cand-status muted" role="status" aria-live="polite">${escapeHtml(statusText)}</span>
    </div>
    ${suggestionsHtml()}
    <section class="cand-section">
      <h3>Selected works <span class="count-pill">${ids.length.toLocaleString('en-US')}</span> ${infoTip(PICK_INFO, 'How to compare two works')}</h3>
      <ul class="card-grid pm-grid">${cards}</ul>
      ${ids.length > LIMIT ? `<p class="muted">Showing the first ${LIMIT}.</p>` : ''}
    </section>`;
}

/** Update the picked state of the cards in place (keeps focus, and a double-click intact). */
function syncPicks() {
  for (const card of main.querySelectorAll('.pm-card')) {
    const on = picked.includes(card.dataset.id);
    card.classList.toggle('picked', on);
    card.setAttribute('aria-checked', String(on));
  }
  updateBar();
}

// --- selection bar (js/lib/ui/selection-bar.js, as in the Media Library) ---

function updateBar(ids = getSelection()) {
  bar.update(ids);
  const compare = bar.button('compare');
  compare.disabled = picked.length !== 2;
  bar.setLabel('compare', `Compare (${picked.length}/2)`);
}

/** Pick or unpick a work; returns a function that restores the previous picks. */
function togglePick(id) {
  const before = picked;
  const on = !picked.includes(id);
  picked = picked.filter((p) => p !== id);
  if (on) picked.push(id);
  if (picked.length > 2) picked = picked.slice(-2); // a third pick replaces the oldest
  syncPicks();
  return () => { picked = before; syncPicks(); };
}

/** Details of a selected work, with ← / → through the cards. */
async function openWork(index) {
  const catalog = await loadCatalog();
  const at = (i) => imageFromRecord(catalog.byId.get(shownIds[i]));
  openDetails(at(index), { browse: { index, count: shownIds.length, at } });
}

async function compareSelected() {
  if (picked.length !== 2) return;
  const catalog = await loadCatalog();
  const [a, b] = picked.map((id) => catalog.byId.get(id));
  if (!a || !b) return;
  openInComparison(pairFromRecords(a, b));
}

export default {
  id: 'pair-matching',
  label: 'Candidates',

  render(el) {
    container = el;
    container.innerHTML = '<div class="cand-main"></div>';
    main = container.querySelector('.cand-main');
    bar = createSelectionBar({
      primary: { act: 'compare', icon: 'compare', label: 'Compare (0/2)', title: 'Open the two picked works in the Image Comparison tab' },
      onAction: (act) => act === 'compare' && compareSelected(),
    });
    container.append(bar.element);
    main.addEventListener('click', (e) => {
      const remove = e.target.closest('[data-remove]')?.dataset.remove;
      if (remove) return setSelected(remove, false);
      if (e.target.closest('[data-act="find"]')) return findPairs();
      const pairId = e.target.closest('[data-pair]')?.dataset.pair;
      if (pairId && pairsById.has(pairId)) openInComparison(pairsById.get(pairId));
    });
    // Selected works: click picks for comparison, double-click / Enter shows details.
    bindSelectAndOpen(main, {
      item: (target) => target.closest('.pm-card'),
      toggle: (card) => togglePick(card.dataset.id),
      open: (card) => openWork(Number(card.dataset.i)),
    });
    // Suggested pairs: double-click an image for its details.
    main.addEventListener('dblclick', (e) => {
      const img = e.target.closest('.cand-pair img[data-side]');
      const pair = pairsById.get(img?.closest('[data-pair-card]')?.dataset.pairCard);
      if (pair) openDetails(pair[img.dataset.side]);
    });
    onSelectionChange(() => {
      suggestions = null; // suggestions belong to the old selection
      statusText = '';
      if (!container.hidden) draw();
    });
    draw();
  },

  activate() { draw(); },
};
