// Color analysis section of the Image Comparison tab.
// Shows the colors of the left/right image (or both, for comparison) in a
// selectable plot type, plus an extracted color palette per image.
//
// The comparison tab passes the loaded images via setSources(), which starts the
// analysis; Plotly is loaded from its CDN on the first analysis.

import { loadPlotly } from '../../lib/plotly.js';
import { createPaletteView } from './palette-view.js';
import { analyzeImage, MAX_SAMPLE } from './pixels.js';
import { PLOT_TYPES } from './plot-types.js';

// Series colors in compare mode (categorical slots 1 and 2, validated colorblind-safe pair).
const SERIES_COLORS = { left: '#2a78d6', right: '#eb6834' };
const SAMPLE_SIZES = [2000, 5000, 10000, MAX_SAMPLE];
const PALETTE_SIZES = [4, 5, 6, 8, 10, 12];
const SIDES = ['left', 'right'];

const state = {
  source: 'both', // 'left' | 'right' | 'both'
  plotType: PLOT_TYPES[0].id,
  sampleSize: 5000,
  paletteSize: 8,
};

let sources = null; // { id, left: { label, img }, right: { label, img } }
let images = { left: null, right: null }; // analyzeImage() results for `sources`
let els = null;
let palettes = null;
let Plotly = null;
let drawToken = 0;
let analysisToken = 0;
let renderQueue = Promise.resolve();

const option = (value, text, selected) => `<option value="${value}"${selected ? ' selected' : ''}>${text}</option>`;

export function render(container) {
  const section = document.createElement('section');
  section.className = 'analysis';
  section.setAttribute('aria-labelledby', 'analysis-heading');
  section.innerHTML = `
    <h3 id="analysis-heading">Color analysis</h3>

    <div class="analysis-controls">
      <fieldset class="segmented">
        <legend>Image</legend>
        ${[...SIDES, 'both']
          .map(
            (value) => `
          <label>
            <input type="radio" name="analysis-source" value="${value}"${value === state.source ? ' checked' : ''}>
            <span>${value === 'both' ? 'Compare both' : ''}</span>
          </label>`
          )
          .join('')}
      </fieldset>
      <label class="control">
        <span>Plot type</span>
        <select name="plot-type">
          ${PLOT_TYPES.map((t) => option(t.id, t.label, t.id === state.plotType)).join('')}
        </select>
      </label>
      <label class="control">
        <span>Points per image</span>
        <select name="sample-size">
          ${SAMPLE_SIZES.map((n) => option(n, n.toLocaleString('en-US'), n === state.sampleSize)).join('')}
        </select>
      </label>
    </div>

    <p class="analysis-description"></p>
    <p class="analysis-status" role="status" aria-live="polite"></p>
    <div class="analysis-plot"></div>

    <div class="analysis-palette-header">
      <h4>Color palette</h4>
      <label class="control">
        <span>Colors</span>
        <select name="palette-size">
          ${PALETTE_SIZES.map((n) => option(n, n, n === state.paletteSize)).join('')}
        </select>
      </label>
    </div>
    <p class="analysis-note">Dominant colors found by k-means clustering in CIE Lab; percentages are the share of pixels closest to each color. Select a color to highlight where it occurs.</p>
  `;
  palettes = createPaletteView();
  section.append(palettes.element);
  container.append(section);

  els = {
    section,
    description: section.querySelector('.analysis-description'),
    status: section.querySelector('.analysis-status'),
    plot: section.querySelector('.analysis-plot'),
  };

  section.querySelectorAll('input[name="analysis-source"]').forEach((input) =>
    input.addEventListener('change', () => {
      state.source = input.value;
      drawPlot();
    })
  );
  section.querySelector('select[name="plot-type"]').addEventListener('change', (e) => {
    state.plotType = e.target.value;
    drawPlot();
  });
  section.querySelector('select[name="sample-size"]').addEventListener('change', (e) => {
    state.sampleSize = Number(e.target.value);
    drawPlot();
  });
  section.querySelector('select[name="palette-size"]').addEventListener('change', (e) => {
    state.paletteSize = Number(e.target.value);
    drawPalettes();
  });

  updateDescription();
}

/** Set the images to analyse: { id, left: { label, img }, right: { label, img } }. */
export function setSources(next) {
  sources = next;
  for (const side of SIDES) {
    const label = els.section.querySelector(`input[value="${side}"] + span`);
    label.textContent = next[side].label;
  }
  analyse();
}

export function activate() {
  if (Plotly && els.plot.data) Plotly.Plots.resize(els.plot); // window may have been resized while hidden
}

async function analyse() {
  const token = ++analysisToken;
  const current = sources;
  setStatus('Analysing colors…');
  // Let the status paint before the synchronous pixel work.
  await new Promise((resolve) => setTimeout(resolve, 30));
  const [plotly, ...results] = await Promise.allSettled([loadPlotly(), ...SIDES.map((side) => analyzeImage(current[side].img))]);
  if (token !== analysisToken) return;

  const errors = [];
  images = { left: null, right: null };
  SIDES.forEach((side, i) => {
    const ok = results[i].status === 'fulfilled';
    if (ok) images[side] = results[i].value;
    else errors.push(results[i].reason.message);
    els.section.querySelector(`input[value="${side}"]`).disabled = !ok;
  });
  els.section.querySelector('input[value="both"]').disabled = !(images.left && images.right);

  if (plotly.status === 'rejected') errors.unshift(plotly.reason.message);
  else Plotly = plotly.value;

  const available = SIDES.filter((side) => images[side]);
  if (state.source !== 'both' ? !images[state.source] : available.length < 2) {
    state.source = available[0] ?? state.source;
    const radio = els.section.querySelector(`input[value="${state.source}"]`);
    if (radio) radio.checked = true;
  }

  drawPalettes();
  if (Plotly && available.length) await drawPlot();
  if (errors.length) setStatus(errors.join(' '), true);
}

function setStatus(text, isError = false) {
  els.status.textContent = text;
  els.status.classList.toggle('is-error', isError);
}

function updateDescription() {
  els.description.textContent = PLOT_TYPES.find((t) => t.id === state.plotType).description;
}

function currentSeries() {
  const sides = state.source === 'both' ? SIDES : [state.source];
  return sides
    .filter((side) => images[side])
    .map((side) => ({ label: sources[side].label, color: SERIES_COLORS[side], image: images[side] }));
}

/**
 * Redraw the plot for the current state. Renders are queued so Plotly never
 * works on two updates at once; queued renders superseded by a newer request
 * are skipped.
 */
function drawPlot() {
  updateDescription();
  if (!Plotly || !currentSeries().length) return Promise.resolve();

  const token = ++drawToken;
  setStatus('Computing plot…');
  const isCurrent = () => token === drawToken;

  renderQueue = renderQueue
    .then(async () => {
      if (!isCurrent()) return;
      // Let the status message paint before the synchronous computation starts.
      await new Promise((resolve) => setTimeout(resolve, 30));
      if (!isCurrent()) return;

      const type = PLOT_TYPES.find((t) => t.id === state.plotType);
      const allImages = SIDES.map((side) => images[side]).filter(Boolean);
      const { data, layout } = type.build(currentSeries(), { sampleSize: state.sampleSize, allImages });
      // uirevision keeps the user's zoom/rotation while switching images or sample size.
      layout.uirevision = type.id;
      await Plotly.react(els.plot, data, layout, {
        responsive: true,
        displaylogo: false,
        toImageButtonOptions: { filename: `${sources.id}-color-${type.id}-${state.source}`, scale: 2 },
      });
      if (isCurrent()) setStatus('');
    })
    .catch((err) => {
      console.error(err);
      if (isCurrent()) setStatus(`Could not draw the plot: ${err.message}`, true);
    });
  return renderQueue;
}

function drawPalettes() {
  palettes.update(
    SIDES.filter((side) => images[side]).map((side) => ({
      label: sources[side].label,
      image: images[side],
      fileStem: `${sources.id}-${side}`,
    })),
    state.paletteSize
  );
}
