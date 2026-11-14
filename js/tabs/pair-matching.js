// Candidates tab (id 'pair-matching', kept for links and the URL hash #pair-matching).
// The step between the Media Library and the Image Comparison tab, which works with exactly two images.
//
// - Shows the works selected in the Media Library. Tick two of them and press "Compare"
//   to open them as a pair in the Image Comparison tab.
// - "Find pairs" suggests pairs for the selected works:
//     * data/candidates.csv: pairs between two photochroms, one row per pair, written by
//       pairing methods (e.g. embedding similarity). Columns: see docs/data.md.
//     * Genre "Reproduction": the painting the photochrom reproduces, from data/artwork-pairs.csv
//       (Wikidata match, unreviewed), as in the Image Comparison tab.
//   New pairing methods only need to write rows to candidates.csv.

import { dateLabel, escapeHtml, fullImageUrl, imageUrl, loadCatalog } from '../lib/catalog.js';
import { loadCsvObjects } from '../lib/csv.js';
import { showTab } from '../main.js';
import { addToSelection, clearSelection, getSelection, onSelectionChange, setComparisonPair, setSelected } from '../state.js';
import { exportCsv, exportJson, importFile } from './media-library/exchange.js';
import { loadArtworkPairs, photochromSide } from './comparison/pairs.js';

const CANDIDATES_URL = 'data/candidates.csv';
const REPRODUCTION = 'reproduktion'; // genre key in catalog.json ("Reproduction")
const LIMIT = 200; // keep the page light when many works are selected

let container;
let main; // redrawn part of the tab; the selection bar below it stays
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
  const button = container.querySelector('.cand-find');
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

function suggestionsHtml() {
  if (!suggestions) return '';
  pairsById.clear();
  const { pairs, notes } = suggestions;
  const items = pairs.map((p) => {
    pairsById.set(p.id, p);
    const method = p.method === 'wikidata-painting'
      ? 'Painting via Wikidata (unreviewed)'
      : `${escapeHtml(p.method)}${p.score ? ` · score ${escapeHtml(p.score)}` : ''}`;
    return `
      <li class="cand-pair">
        <div class="cand-pair-imgs">
          <img src="${escapeHtml(thumb(p.left))}" alt="" loading="lazy">
          <img src="${escapeHtml(thumb(p.right))}" alt="" loading="lazy">
        </div>
        <div class="cand-pair-body">
          <strong>${escapeHtml(p.label)}</strong>
          <span class="muted">${method}</span>
          <button type="button" class="cand-compare-btn" data-pair="${escapeHtml(p.id)}">Compare</button>
        </div>
      </li>`;
  }).join('');
  return `
    <section class="cand-section">
      <h3>Suggested pairs (${pairs.length})</h3>
      ${notes.map((n) => `<p class="muted">${escapeHtml(n)}</p>`).join('')}
      ${pairs.length ? `<ul class="cand-pairs">${items}</ul>` : '<p class="placeholder">No pairs found for the selected works.</p>'}
    </section>`;
}

async function draw() {
  const ids = getSelection();
  picked = picked.filter((id) => ids.includes(id)); // drop works removed from the selection
  updateBar(ids);
  if (!ids.length) {
    main.innerHTML = `
      <h2>Candidates</h2>
      <p class="placeholder">No images selected yet. Tick works in the Media Library to bring them here.</p>`;
    return;
  }
  const catalog = await loadCatalog();
  const cards = ids.slice(0, LIMIT).map((id) => {
    const r = catalog.byId.get(id);
    if (!r) return '';
    const img = imageUrl(r, 300);
    const on = picked.includes(id);
    const title = escapeHtml(r.t);
    return `
      <li class="pm-card${on ? ' picked' : ''}">
        <label class="pm-card-check"><input type="checkbox" data-pick="${r.id}" ${on ? 'checked' : ''}><span class="sr-only">Compare: ${title}</span></label>
        ${img ? `<img src="${img}" alt="" loading="lazy">` : '<div class="no-img">No online image yet</div>'}
        <div class="pm-card-body">
          <strong>${title}</strong>
          <span class="muted">${escapeHtml(dateLabel(r))}${r.p ? ` · ${escapeHtml(r.p)}` : ''}${r.g === REPRODUCTION ? ' · Reproduction' : ''}</span>
          <button type="button" class="link-btn" data-remove="${r.id}">Remove</button>
        </div>
      </li>`;
  }).join('');
  main.innerHTML = `
    <h2>Candidates</h2>
    <div class="cand-toolbar">
      <button type="button" class="cand-find">Find pairs</button>
      <span class="cand-status muted" role="status" aria-live="polite">${escapeHtml(statusText)}</span>
    </div>
    ${suggestionsHtml()}
    <section class="cand-section">
      <h3>Selected works (${ids.length.toLocaleString('en-US')})</h3>
      <p class="muted">Tick two images, then press Compare in the bar below.</p>
      <ul class="pm-grid">${cards}</ul>
      ${ids.length > LIMIT ? `<p class="muted">Showing the first ${LIMIT}.</p>` : ''}
    </section>`;
}

// --- selection bar (same as in the Media Library, without the filter actions) ---

const fmt = (n) => n.toLocaleString('en-US');
let clearArmed = null;

function barHtml() {
  return `
    <div class="ml-selbar" role="region" aria-label="Selection">
      <span class="ml-selcount"></span>
      <span class="sep" aria-hidden="true"></span>
      <button type="button" data-act="export-csv">Export CSV</button>
      <button type="button" data-act="export-json">Export JSON</button>
      <button type="button" data-act="import">Import…</button>
      <input type="file" accept=".json,.csv,.txt" hidden>
      <button type="button" data-act="clear">Clear</button>
      <span class="ml-selmsg" aria-live="polite"></span>
      <button type="button" class="primary" data-act="compare" disabled>Compare (0/2)</button>
    </div>`;
}

function updateBar(ids = getSelection()) {
  const bar = container.querySelector('.ml-selbar');
  bar.querySelector('.ml-selcount').innerHTML = `<strong>${fmt(ids.length)}</strong> image${ids.length === 1 ? '' : 's'} selected`;
  for (const act of ['export-csv', 'export-json', 'clear']) {
    bar.querySelector(`[data-act="${act}"]`).disabled = ids.length === 0;
  }
  const compare = bar.querySelector('[data-act="compare"]');
  compare.disabled = picked.length !== 2;
  compare.textContent = `Compare (${picked.length}/2)`;
}

function wireBar() {
  const bar = container.querySelector('.ml-selbar');
  const fileInput = bar.querySelector('input[type=file]');
  const msg = bar.querySelector('.ml-selmsg');
  bar.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    msg.textContent = '';
    const ids = getSelection();
    if (act === 'compare') compareSelected();
    else if (act === 'export-csv') exportCsv(ids, await loadCatalog());
    else if (act === 'export-json') exportJson(ids);
    else if (act === 'import') fileInput.click();
    else if (act === 'clear') {
      // Two clicks instead of a confirm dialog, as in the Media Library.
      if (clearArmed) {
        clearTimeout(clearArmed);
        clearArmed = null;
        btn.textContent = 'Clear';
        clearSelection();
      } else {
        btn.textContent = 'Click again to clear';
        clearArmed = setTimeout(() => { clearArmed = null; btn.textContent = 'Clear'; }, 3000);
      }
    }
  });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    const { known, unknown } = await importFile(file, await loadCatalog());
    addToSelection(known);
    msg.textContent = `Imported ${fmt(known.length)} record${known.length === 1 ? '' : 's'}`
      + (unknown.length ? `, ${fmt(unknown.length)} unknown ID${unknown.length === 1 ? '' : 's'} skipped` : '');
  });
}

function togglePick(id, on) {
  picked = picked.filter((p) => p !== id);
  if (on) picked.push(id);
  if (picked.length > 2) picked = picked.slice(-2); // a third tick replaces the oldest
  draw();
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
    container.innerHTML = `<div class="cand-main"></div>${barHtml()}`;
    main = container.querySelector('.cand-main');
    wireBar();
    main.addEventListener('click', (e) => {
      const remove = e.target.closest('[data-remove]')?.dataset.remove;
      if (remove) return setSelected(remove, false);
      if (e.target.closest('.cand-find')) return findPairs();
      const pairId = e.target.closest('[data-pair]')?.dataset.pair;
      if (pairId && pairsById.has(pairId)) openInComparison(pairsById.get(pairId));
    });
    main.addEventListener('change', (e) => {
      const box = e.target.closest('[data-pick]');
      if (box) togglePick(box.dataset.pick, box.checked);
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
