// Palette display of the color analysis: proportional strip, swatch list, an image
// preview in which a clicked palette color is highlighted, and copy buttons
// (hex values as text, or the palette as PNG image).

import { canvasToBlob, downloadBlob } from '../../lib/download.js';
import { createCanvas } from './media.js';
import { assignPixels, extractPalette } from './palette.js';

const SWATCH = 120; // px per color in the copied palette image

/** Draw the image; with a selection, other pixels are shown as muted gray. */
function renderPreview(canvas, image, assign, selected) {
  const ctx = canvas.getContext('2d');
  if (selected < 0) {
    ctx.drawImage(image.canvas, 0, 0);
    return 0;
  }
  const out = ctx.createImageData(image.width, image.height);
  out.data.fill(255);
  let count = 0;
  for (let i = 0; i < image.n; i++) {
    const p = image.pos[i] * 4;
    const r = image.rgb[i * 3];
    const g = image.rgb[i * 3 + 1];
    const b = image.rgb[i * 3 + 2];
    if (assign[i] === selected) {
      out.data[p] = r;
      out.data[p + 1] = g;
      out.data[p + 2] = b;
      count++;
    } else {
      const v = 128 + (0.299 * r + 0.587 * g + 0.114 * b - 128) * 0.25;
      out.data[p] = out.data[p + 1] = out.data[p + 2] = v;
    }
  }
  ctx.putImageData(out, 0, 0);
  return count / image.n;
}

function paletteImage(palette) {
  const canvas = createCanvas(SWATCH * palette.length, SWATCH + 48);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = '600 15px system-ui, sans-serif';
  ctx.textBaseline = 'top';
  palette.forEach((c, i) => {
    ctx.fillStyle = c.hex;
    ctx.fillRect(i * SWATCH, 0, SWATCH, SWATCH);
    ctx.fillStyle = '#1f1f1f';
    ctx.fillText(c.hex, i * SWATCH + 8, SWATCH + 8);
    ctx.fillStyle = '#52514e';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(`${(c.share * 100).toFixed(1)} %`, i * SWATCH + 8, SWATCH + 28);
    ctx.font = '600 15px system-ui, sans-serif';
  });
  return canvas;
}

function button(text, action) {
  const el = Object.assign(document.createElement('button'), { type: 'button', className: 'button button-small', textContent: text });
  el.dataset.action = action;
  return el;
}

/**
 * One palette block.
 * @param entry { label, image (analyzeImage result), fileStem }
 */
function paletteBlock(entry, k) {
  const { label, image, fileStem } = entry;
  const palette = extractPalette(image, k);
  let assign = null;
  let selected = -1;

  const block = document.createElement('div');
  block.className = 'palette';

  const head = document.createElement('div');
  head.className = 'palette-head';
  const title = Object.assign(document.createElement('h5'), { textContent: label });
  const actions = document.createElement('div');
  actions.className = 'palette-actions';
  actions.append(button('Copy hex', 'copy-hex'), button('Copy image', 'copy-image'));
  head.append(title, actions);

  const strip = document.createElement('div');
  strip.className = 'palette-strip';
  strip.setAttribute('aria-hidden', 'true');
  for (const c of palette) {
    const seg = document.createElement('span');
    seg.style.background = c.hex;
    seg.style.flexGrow = String(c.share);
    strip.append(seg);
  }

  const list = document.createElement('ol');
  list.className = 'palette-swatches';
  list.setAttribute('aria-label', `${label} palette – select a color to highlight it in the image`);
  palette.forEach((c, i) => {
    const item = document.createElement('li');
    const swatch = button('', 'select');
    swatch.className = 'palette-swatch';
    swatch.dataset.index = String(i);
    swatch.setAttribute('aria-pressed', 'false');
    swatch.innerHTML = `<span class="palette-chip" style="background:${c.hex}"></span><code>${c.hex}</code><span class="palette-share">${(c.share * 100).toFixed(1)} %</span>`;
    item.append(swatch);
    list.append(item);
  });

  const preview = document.createElement('canvas');
  preview.className = 'palette-preview';
  preview.width = image.width;
  preview.height = image.height;
  preview.setAttribute('role', 'img');
  renderPreview(preview, image, null, -1);

  const feedback = document.createElement('p');
  feedback.className = 'palette-feedback';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  const say = (text) => (feedback.textContent = text);

  function select(i) {
    selected = selected === i ? -1 : i;
    assign ??= assignPixels(image, palette);
    const share = renderPreview(preview, image, assign, selected);
    list.querySelectorAll('.palette-swatch').forEach((el) => el.setAttribute('aria-pressed', String(Number(el.dataset.index) === selected)));
    preview.setAttribute('aria-label', selected < 0 ? label : `${label}, pixels closest to ${palette[selected].hex} highlighted`);
    say(selected < 0 ? '' : `Highlighted ${palette[selected].hex}: ${(share * 100).toFixed(1)} % of the pixels.`);
  }

  async function copyHex() {
    say('Copying…');
    const text = palette.map((c) => c.hex).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      say(`Copied ${palette.length} hex values.`);
    } catch {
      say(`Clipboard not available. Hex values: ${palette.map((c) => c.hex).join(', ')}`);
    }
  }

  async function copyImage() {
    say('Copying…');
    const blob = await canvasToBlob(paletteImage(palette));
    try {
      if (!navigator.clipboard?.write || !window.ClipboardItem) throw new Error('unsupported');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      say('Copied the palette as image.');
    } catch {
      downloadBlob(blob, `${fileStem}-palette.png`);
      say('Copying images is not supported here, so the palette was downloaded as PNG instead.');
    }
  }

  block.addEventListener('click', (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    if (target.dataset.action === 'select') select(Number(target.dataset.index));
    else if (target.dataset.action === 'copy-hex') copyHex();
    else if (target.dataset.action === 'copy-image') copyImage();
  });

  preview.setAttribute('aria-label', label);
  block.append(head, strip, list, preview, feedback);
  return block;
}

export function createPaletteView() {
  const root = document.createElement('div');
  root.className = 'analysis-palettes';
  return {
    element: root,
    /** entries: [{ label, image, fileStem }] */
    update(entries, k) {
      root.replaceChildren(...entries.map((entry) => paletteBlock(entry, k)));
    },
  };
}
