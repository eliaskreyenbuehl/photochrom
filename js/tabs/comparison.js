// Image Comparison tab
// Pair selection, side-by-side / overlay / slider / difference views, per-image
// adjustments, auto-alignment, overlap (crop) detection, screenshots, image dialog
// with metadata, and color analysis. Sub-modules live in js/tabs/comparison/.

import { DEFAULT_PAIR_ID } from '../config.js';
import { icon } from '../lib/ui/icons.js';
import { infoTip } from '../lib/ui/info.js';
import { loadCatalog } from '../lib/catalog.js';
import { imageName } from '../lib/sources/index.js';
import { isCropping, printAreaFor } from '../lib/print-area.js';
import { getComparisonPair, onComparisonPairChange, setComparisonPair } from '../state.js';
import * as analysis from './comparison/analysis.js';
import { autoAlign } from './comparison/align.js';
import { createControls } from './comparison/controls.js';
import { createDiffView } from './comparison/diffview.js';
import { createImagePicker } from './comparison/image-picker.js';
import { loadDisplayImage, releaseImage } from './comparison/media.js';
import { loadSamplePairs } from './comparison/pairs.js';
import { saveScreenshot } from './comparison/screenshot.js';
import { POSITION, SIDES, VIEW_ICONS, VIEW_LABELS, baseImage, defaultManual, initialPairState, overlayImage, store, subscribe, update } from './comparison/store.js';
import { createViewer } from './comparison/viewer.js';

let els = null;
let controls = null;
let diffView = null;
let viewer = null;
let pickers = [];
let started = false;
let loadToken = 0;
let cropToPrint = true; // crop photochroms to the print area (data/print-area.csv)

function setStatus(text, isError = false) {
  els.status.textContent = text;
  els.status.classList.toggle('is-error', isError);
}

function setBusy(busy) {
  els.section.classList.toggle('is-loading', busy);
  for (const picker of pickers) picker.setDisabled(busy);
  els.screenshot.disabled = busy || !store.pair;
}

/** File-name-safe id part for an image of a pair. */
const imageKey = (pair, side) => (pair[side].key ?? `${pair.id}-${side}`).replace(/[^a-z0-9]+/gi, '-').slice(0, 60);

/** Replace one image of the current pair (image picker): a new pair, the other image is kept. */
function replaceImage(side, image) {
  const current = store.pair;
  const next = { ...current, [side]: image };
  next.id = `custom-${imageKey(next, 'left')}-${imageKey(next, 'right')}`;
  next.label = SIDES.map((s) => next[s].label || imageName(next[s])).join(' ↔ ');
  setComparisonPair(next);
}

/** Add the print area box to a side that belongs to a catalog record (if a box exists). */
async function withPrintArea(side) {
  if (!side.recordId) return side;
  try {
    const rec = (await loadCatalog()).byId.get(side.recordId);
    const box = await printAreaFor(rec);
    return isCropping(box) ? { ...side, printArea: box } : side;
  } catch (err) {
    console.warn('No print area:', err);
    return side;
  }
}

/** "Left image", "Right image" or "Both images". */
const whichImages = (imgs) => (imgs.length > 1 ? 'Both images' : `${imgs[0].position} image`);

/** Status line after loading: say what was cropped, so nobody mistakes the crop for the scan. */
function cropStatus(images) {
  const small = SIDES.map((s) => images[s]).filter((img) => img.fallback);
  const smallNote = small.length
    ? `Full-size version of ${small.length > 1 ? 'both images' : `the ${small[0].position.toLowerCase()} image`} not available yet, showing the 300 px thumbnail. `
    : '';
  const cropped = SIDES.map((s) => images[s]).filter((img) => img.cropped);
  if (!cropped.length) return smallNote.trim();
  const check = cropped.some((img) => /check/.test(img.cropped.note || '')) ? ' This box is a fallback, please check it.' : '';
  return `${smallNote}${whichImages(cropped)} cropped to the print: color chart and scan border removed (box machine-generated, unreviewed).${check} Untick "Crop to print" to see the whole scan.`;
}

async function loadPair(pair) {
  const token = ++loadToken;
  setBusy(true);
  setStatus(`Loading ${pair.label}…`);
  try {
    // Every image gets its position ("Left"/"Right") and a display name (number + title).
    const named = (side) => ({ ...pair[side], position: POSITION[side], label: pair[side].label || imageName(pair[side]) });
    const sides = await Promise.all(SIDES.map((side) => withPrintArea(named(side))));
    const [left, right] = await Promise.all(sides.map((side) => loadDisplayImage(side, { crop: cropToPrint })));
    if (token !== loadToken) {
      releaseImage(left);
      releaseImage(right);
      return;
    }
    const previous = store.images;
    update({ pair, ...initialPairState({ left, right }) }, 'pair');
    SIDES.forEach((side) => previous[side] !== store.images[side] && releaseImage(previous[side]));
    els.main.hidden = false;
    const source = ({ label, position, number, img }) => ({ label, position, number, img });
    analysis.setSources({ id: pair.id, left: source(left), right: source(right) });
    setStatus(cropStatus({ left, right }));
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

/** Start with the pair sent by another tab, or the default sample pair. */
async function start() {
  onComparisonPairChange((pair) => pair && loadPair(pair));
  let initial = getComparisonPair();
  if (!initial) {
    setStatus('Loading the sample pair…');
    try {
      const samples = await loadSamplePairs();
      initial = samples.find((p) => p.id === DEFAULT_PAIR_ID) ?? samples[0];
    } catch (err) {
      setStatus(`Could not load the sample pair: ${err.message}`, true);
      return;
    }
  }
  if (initial) setComparisonPair(initial);
  else setStatus('No sample pair found. Search for an image above.', true);
}

export default {
  id: 'comparison',
  label: 'Image Comparison',

  render(container) {
    container.innerHTML = `
      <h2 class="visually-hidden">Image Comparison</h2>
      <div class="cmp-toolbar">
        <div class="cmp-pickers"></div>
        <fieldset class="segmented">
          <legend class="visually-hidden">View</legend>
          ${Object.entries(VIEW_LABELS).map(
            ([value, label]) => `
            <label>
              <input type="radio" name="cmp-view" value="${value}"${value === store.view ? ' checked' : ''}>
              <span>${icon(VIEW_ICONS[value])}${label}</span>
            </label>`
          ).join('')}
        </fieldset>
        <span class="cmp-crop">
          <label class="check">
            <input type="checkbox" name="cmp-crop" checked>
            <span>Crop to print</span>
          </label>
          ${infoTip('Show and analyze only the photochrom print, without color chart, gray scale and scan border. The box comes from <code>data/print-area.csv</code> (machine-generated, unreviewed; about 1 in 10 is imperfect). Untick to see the whole scan.', 'About Crop to print')}
        </span>
        <button type="button" class="btn" data-action="screenshot" disabled title="Save the current view as PNG, with credits">${icon('camera')}<span class="btn-label">Screenshot</span></button>
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
    pickers = SIDES.map((side) => createImagePicker({ position: POSITION[side], onPick: (image) => replaceImage(side, image) }));
    container.querySelector('.cmp-pickers').append(...pickers.map((p) => p.element));
    container.querySelector('.cmp-sidebar').append(controls.element);

    analysis.render(container);

    container.querySelectorAll('input[name="cmp-view"]').forEach((input) => input.addEventListener('change', () => selectView(input.value)));
    els.screenshot.addEventListener('click', takeScreenshot);
    container.querySelector('input[name="cmp-crop"]').addEventListener('change', (e) => {
      cropToPrint = e.target.checked;
      if (store.pair) loadPair(store.pair);
    });
  },

  activate() {
    if (!started) {
      started = true;
      start();
    }
    analysis.activate();
  },
};
