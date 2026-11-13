// Image Comparison tab
// Pair selection, side-by-side / overlay / slider / difference views, per-image
// adjustments, auto-alignment, overlap (crop) detection, screenshots, image dialog
// with metadata, and color analysis. Sub-modules live in js/tabs/comparison/.

import { DEFAULT_PAIR_ID } from '../config.js';
import { getComparisonPair, onComparisonPairChange, setComparisonPair } from '../state.js';
import * as analysis from './comparison/analysis.js';
import { autoAlign } from './comparison/align.js';
import { createControls } from './comparison/controls.js';
import { createDiffView } from './comparison/diffview.js';
import { loadDisplayImage } from './comparison/media.js';
import { loadSamplePairs } from './comparison/pairs.js';
import { saveScreenshot } from './comparison/screenshot.js';
import { SIDES, VIEW_LABELS, baseImage, defaultManual, initialPairState, overlayImage, store, subscribe, update } from './comparison/store.js';
import { createViewer } from './comparison/viewer.js';

let els = null;
let controls = null;
let diffView = null;
let viewer = null;
let pairs = [];
let started = false;
let loadToken = 0;

function setStatus(text, isError = false) {
  els.status.textContent = text;
  els.status.classList.toggle('is-error', isError);
}

function setBusy(busy) {
  els.section.classList.toggle('is-loading', busy);
  els.pairSelect.disabled = busy;
  els.screenshot.disabled = busy || !store.pair;
}

/** Ensure the pair selector contains `pair` (pairs set from other tabs may be new). */
function syncPairSelect(pair) {
  if (!pairs.some((p) => p.id === pair.id)) {
    pairs.push(pair);
    els.pairSelect.append(new Option(pair.label, pair.id));
  }
  els.pairSelect.value = pair.id;
}

async function loadPair(pair) {
  const token = ++loadToken;
  syncPairSelect(pair);
  setBusy(true);
  setStatus(`Loading ${pair.label}…`);
  try {
    const [left, right] = await Promise.all(SIDES.map((side) => loadDisplayImage(pair[side])));
    if (token !== loadToken) return;
    update({ pair, ...initialPairState({ left, right }) }, 'pair');
    els.main.hidden = false;
    analysis.setSources({ id: pair.id, left: { label: left.label, img: left.img }, right: { label: right.label, img: right.img } });
    setStatus('');
  } catch (err) {
    if (token !== loadToken) return;
    console.error(err);
    setStatus(`Could not load the pair: ${err.message}`, true);
  } finally {
    if (token === loadToken) setBusy(false);
  }
}

async function runAutoAlign() {
  const base = baseImage();
  const overlay = overlayImage();
  if (!base || !overlay) return;
  controls.setAlignBusy(true);
  try {
    const result = await autoAlign(base, overlay, (text) => controls.setAlignStatus(text));
    update({ H: result.H, manual: defaultManual(), alignedH: true }, 'transform');
    controls.setAlignStatus(`Aligned with ${result.method}: ${result.inliers} consistent keypoints of ${result.matches} matches.`);
    if (store.view === 'side') selectView('overlay');
  } catch (err) {
    console.error(err);
    controls.setAlignStatus(err.message, true);
  } finally {
    controls.setAlignBusy(false);
  }
}

function selectView(view) {
  update({ view }, 'view');
}

async function takeScreenshot() {
  els.screenshot.disabled = true;
  try {
    await saveScreenshot(diffView.current(), viewer.visibleRegion());
  } catch (err) {
    console.error(err);
    setStatus(`Screenshot failed: ${err.message}`, true);
  } finally {
    els.screenshot.disabled = false;
  }
}

async function start() {
  setStatus('Loading sample pairs…');
  try {
    pairs = await loadSamplePairs();
  } catch (err) {
    setStatus(`Could not load the sample pairs: ${err.message}`, true);
    return;
  }
  for (const pair of pairs) els.pairSelect.append(new Option(pair.label, pair.id));
  onComparisonPairChange((pair) => pair && loadPair(pair));
  const initial = getComparisonPair() ?? pairs.find((p) => p.id === DEFAULT_PAIR_ID) ?? pairs[0];
  if (initial) setComparisonPair(initial);
  else setStatus('No sample pairs found.', true);
}

export default {
  id: 'comparison',
  label: 'Image Comparison',

  render(container) {
    container.innerHTML = `
      <h2>Image Comparison</h2>
      <div class="cmp-toolbar">
        <label class="control">
          <span>Pair</span>
          <select name="cmp-pair"></select>
        </label>
        <fieldset class="segmented">
          <legend>View</legend>
          ${Object.entries(VIEW_LABELS).map(
            ([value, label]) => `
            <label>
              <input type="radio" name="cmp-view" value="${value}"${value === store.view ? ' checked' : ''}>
              <span>${label}</span>
            </label>`
          ).join('')}
        </fieldset>
        <button type="button" class="button" data-action="screenshot" disabled>Save screenshot</button>
      </div>
      <p class="cmp-status" role="status" aria-live="polite"></p>
      <div class="cmp-layout" hidden>
        <div class="cmp-main"></div>
        <aside class="cmp-sidebar" aria-label="Comparison settings"></aside>
      </div>
    `;
    els = {
      section: container,
      status: container.querySelector('.cmp-status'),
      pairSelect: container.querySelector('select[name="cmp-pair"]'),
      screenshot: container.querySelector('[data-action="screenshot"]'),
      main: container.querySelector('.cmp-layout'),
    };

    // Elements marked data-only="<views>" are shown only in those views (CSS).
    // Subscribed first, so the other modules already see the new layout.
    container.dataset.view = store.view;
    subscribe((reason) => {
      if (reason !== 'view') return;
      container.dataset.view = store.view;
      container.querySelector(`input[name="cmp-view"][value="${store.view}"]`).checked = true;
    });

    viewer = createViewer();
    controls = createControls({ onAutoAlign: runAutoAlign });
    diffView = createDiffView(viewer, {
      onResult: (current, error) => controls.setDiffResult(current, error),
      onBusy: (busy) => controls.setDiffBusy(busy),
    });
    container.querySelector('.cmp-main').append(viewer.element);
    container.querySelector('.cmp-sidebar').append(controls.element);

    analysis.render(container);

    els.pairSelect.addEventListener('change', (e) => setComparisonPair(pairs.find((p) => p.id === e.target.value)));
    container.querySelectorAll('input[name="cmp-view"]').forEach((input) => input.addEventListener('change', () => selectView(input.value)));
    els.screenshot.addEventListener('click', takeScreenshot);
  },

  activate() {
    if (!started) {
      started = true;
      start();
    }
    analysis.activate();
  },
};
