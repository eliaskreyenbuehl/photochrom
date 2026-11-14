// Color analysis section of the Image Comparison tab.
// Shows the colors of the left/right image (or both, for comparison) in a
// selectable plot type, plus an extracted color palette per image.
//
// The comparison tab passes the loaded images via setSources(), which starts the
// analysis; Plotly is loaded from its CDN on the first analysis.
//
// The palettes are computed here once per image and palette size and shared by
// the palette view and the plots: "Point colors: Palette colors" colors each plot
// point by its palette color, and selecting a color in a palette highlights its
// points in the plot.

import { loadPlotly } from '../../lib/plotly.js';
import { assignPixels, extractPalette } from './palette.js';
import { createPaletteView } from './palette-view.js';
import { analyzeImage, MAX_SAMPLE } from './pixels.js';
import { PLOT_TYPES } from './plot-types.js';

// Series colors in compare mode (categorical slots 1 and 2, validated colorblind-safe pair).
const SERIES_COLORS = { left: '#2a78d6', right: '#eb6834' };
// Marker shapes in compare mode, so the images stay apart when colored by palette.
const SERIES_SYMBOLS = { left: 'circle', right: 'diamond' };
const COLOR_MODES = [
  ['pixel', 'Pixel colors'],
  ['palette', 'Palette colors'],
];
const SAMPLE_SIZES = [2000, 5000, 10000, MAX_SAMPLE];
const PALETTE_SIZES = [4, 5, 6, 8, 10, 12];
const SIDES = ['left', 'right'];

const state = {
  source: 'both', // 'left' | 'right' | 'both'
  plotType: PLOT_TYPES[0].id,
  sampleSize: 5000,
  paletteSize: 6,
  colorMode: 'pixel', // 'pixel' | 'palette'
  selected: { left: -1, right: -1 }, // palette color picked in each image's palette
};

let sources = null; // { id, left: { label, img }, right: { label, img } }
let images = { left: null, right: null }; // analyzeImage() results for `sources`
let paletteData = { left: null, right: null }; // { palette, assign } per image for state.paletteSize
let els = null;
let palettes = null;
let Plotly = null;
let drawToken = 0;
let analysisToken = 0;
let renderQueue = Promise.resolve();
let shownType = null; // plot type currently drawn

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
        <span>Point colors</span>
        <select name="color-mode">
          ${COLOR_MODES.map(([value, text]) => option(value, text, value === state.colorMode)).join('')}
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
    <p class="analysis-note">Dominant colors found by k-means clustering in CIE Lab; percentages are the share of pixels closest to each color. Select a color to highlight where it occurs, in the image and in the plot above.</p>
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
  section.querySelector('select[name="color-mode"]').addEventListener('change', (e) => {
    state.colorMode = e.target.value;
    drawPlot();
  });
  section.querySelector('select[name="palette-size"]').addEventListener('change', (e) => {
    state.paletteSize = Number(e.target.value);
    drawPalettes();
    // New palettes: the plot's palette colors and highlight change too.
    if (state.colorMode === 'palette') drawPlot();
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
  const text = PLOT_TYPES.find((t) => t.id === state.plotType).description;
  els.description.textContent =
    state.colorMode === 'palette'
      ? `${text} Points are colored by their nearest palette color (${state.paletteSize} colors, see the palette below); the outlined markers are the palette colors, sized by their share.`
      : text;
}

function currentSeries() {
  const sides = state.source === 'both' ? SIDES : [state.source];
  return sides
    .filter((side) => images[side])
    .map((side) => ({
      label: sources[side].label,
      color: SERIES_COLORS[side],
      symbol: SERIES_SYMBOLS[side],
      image: images[side],
      palette: paletteData[side]?.palette,
      cluster: paletteData[side]?.assign,
      selected: state.selected[side],
    }));
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
      const { data, layout } = type.build(currentSeries(), { sampleSize: state.sampleSize, allImages, colorMode: state.colorMode });
      // uirevision keeps the user's zoom/rotation while switching images, sample size or
      // point colors. A new plot type starts from a clean plot: Plotly would otherwise
      // restore a zoom made earlier in that type (e.g. a thin box zoom in the CIE
      // diagram) when switching back, hiding the data.
      layout.uirevision = type.id;
      if (shownType !== type.id) Plotly.purge(els.plot);
      shownType = type.id;
      await Plotly.react(els.plot, data, layout, {
        responsive: true,
        displaylogo: false,
        // Double-click returns to the plot's own ranges (full diagram incl. background),
        // never to an autoscaled data range.
        doubleClick: 'reset',
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

/** Compute the palettes for the current palette size and show them (clears selections). */
function drawPalettes() {
  const sides = SIDES.filter((side) => images[side]);
  paletteData = { left: null, right: null };
  for (const side of sides) {
    const palette = extractPalette(images[side], state.paletteSize);
    paletteData[side] = { palette, assign: assignPixels(images[side], palette) };
  }
  state.selected = { left: -1, right: -1 };
  palettes.update(
    sides.map((side) => ({
      label: sources[side].label,
      image: images[side],
      fileStem: `${sources.id}-${side}`,
      ...paletteData[side],
      onSelect: (index) => {
        state.selected[side] = index;
        drawPlot();
      },
    }))
  );
}
