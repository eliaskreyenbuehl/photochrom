// Color analysis section of the Image Comparison tab.
// Shows the colors of the left/right image (or both, for comparison) in a
// selectable plot type, plus an extracted color palette per image.
//
// Data and plot work is lazy: Plotly and the images are loaded the first time
// the section becomes visible (activate()).

import { DEFAULT_IMAGES, DEFAULT_IMAGE_INFO } from '../../config.js';
import { loadPlotly } from '../../lib/plotly.js';
import { analyzeImage, MAX_SAMPLE } from './pixels.js';
import { extractPalette } from './palette.js';
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

const images = { left: null, right: null }; // analyzeImage() results
let els = null;
let Plotly = null;
let started = false;
let drawToken = 0;
let renderQueue = Promise.resolve();

const option = (value, text, selected) =>
  `<option value="${value}"${selected ? ' selected' : ''}>${text}</option>`;

export function render(container) {
  const section = document.createElement('section');
  section.className = 'analysis';
  section.setAttribute('aria-labelledby', 'analysis-heading');
  section.innerHTML = `
    <h3 id="analysis-heading">Color analysis</h3>

    <div class="analysis-sources">
      ${SIDES.map(
        (side) => `
        <figure class="analysis-source" data-side="${side}">
          <div class="analysis-thumb" aria-hidden="true"></div>
          <figcaption>
            <span class="analysis-swatch" style="background:${SERIES_COLORS[side]}" aria-hidden="true"></span>
            <strong></strong>
            <a class="analysis-credit" target="_blank" rel="noopener"></a>
          </figcaption>
        </figure>`
      ).join('')}
    </div>

    <div class="analysis-controls">
      <fieldset class="segmented">
        <legend>Image</legend>
        ${[...SIDES, 'both']
          .map(
            (value) => `
          <label>
            <input type="radio" name="analysis-source" value="${value}"${value === state.source ? ' checked' : ''}>
            <span>${value === 'both' ? 'Compare both' : DEFAULT_IMAGE_INFO[value].label}</span>
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
    <p class="analysis-note">Dominant colors found by k-means clustering in CIE Lab; percentages are the share of pixels closest to each color.</p>
    <div class="analysis-palettes"></div>
  `;
  container.append(section);

  els = {
    section,
    description: section.querySelector('.analysis-description'),
    status: section.querySelector('.analysis-status'),
    plot: section.querySelector('.analysis-plot'),
    palettes: section.querySelector('.analysis-palettes'),
  };

  for (const side of SIDES) {
    const fig = section.querySelector(`.analysis-source[data-side="${side}"]`);
    const info = DEFAULT_IMAGE_INFO[side];
    fig.querySelector('strong').textContent = info.label;
    const credit = fig.querySelector('.analysis-credit');
    credit.textContent = info.credit;
    credit.href = info.creditUrl;
  }

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

export function activate() {
  if (!started) {
    started = true;
    start();
  } else if (Plotly && els.plot.data) {
    // The window may have been resized while the tab was hidden.
    Plotly.Plots.resize(els.plot);
  }
}

async function start() {
  setStatus('Loading images and plotting library…');
  const [plotly, ...results] = await Promise.allSettled([
    loadPlotly(),
    ...SIDES.map((side) => analyzeImage(DEFAULT_IMAGES[side])),
  ]);

  const errors = [];
  SIDES.forEach((side, i) => {
    const result = results[i];
    if (result.status === 'fulfilled') {
      images[side] = result.value;
      const thumb = els.section.querySelector(`.analysis-source[data-side="${side}"] .analysis-thumb`);
      thumb.append(result.value.canvas);
    } else {
      errors.push(result.reason.message);
      // Without this image, only the other one can be analysed.
      els.section.querySelector(`input[value="${side}"]`).disabled = true;
      els.section.querySelector('input[value="both"]').disabled = true;
    }
  });

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
    .map((side) => ({ label: DEFAULT_IMAGE_INFO[side].label, color: SERIES_COLORS[side], image: images[side] }));
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
        toImageButtonOptions: { filename: `color-analysis-${type.id}-${state.source}`, scale: 2 },
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
  els.palettes.replaceChildren(
    ...SIDES.filter((side) => images[side]).map((side) => {
      const palette = extractPalette(images[side], state.paletteSize);
      const block = document.createElement('div');
      block.className = 'palette';

      const title = document.createElement('h5');
      title.textContent = DEFAULT_IMAGE_INFO[side].label;

      // Proportional strip: each segment's width is its share of the pixels.
      const strip = document.createElement('div');
      strip.className = 'palette-strip';
      strip.setAttribute('aria-hidden', 'true');
      for (const c of palette) {
        const seg = document.createElement('span');
        seg.style.background = c.hex;
        seg.style.flexGrow = String(c.share);
        seg.title = `${c.hex} · ${(c.share * 100).toFixed(1)}%`;
        strip.append(seg);
      }

      const list = document.createElement('ol');
      list.className = 'palette-swatches';
      for (const c of palette) {
        const item = document.createElement('li');
        const chip = document.createElement('span');
        chip.className = 'palette-chip';
        chip.style.background = c.hex;
        const hex = document.createElement('code');
        hex.textContent = c.hex;
        const share = document.createElement('span');
        share.className = 'palette-share';
        share.textContent = `${(c.share * 100).toFixed(1)}%`;
        item.append(chip, hex, share);
        list.append(item);
      }

      block.append(title, strip, list);
      return block;
    })
  );
}
