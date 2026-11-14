// Palette display of the color analysis: proportional color bar (hex + share in
// each block, per-color copy), an image preview in which a clicked palette color
// is highlighted, and copy buttons (hex values as text, or the palette as PNG).
// The palettes are computed by analysis.js, which also uses them for the plots;
// a selection is reported back via onSelect so the plot can highlight it too.

import { canvasToBlob, downloadBlob } from '../../lib/download.js';
import { createCanvas } from './media.js';
import { icon } from '../../lib/ui/icons.js';

const SWATCH = 120; // px per color in the copied palette image

const COPY_ICON =
  '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 3.5v-.5a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 3v5A1.5 1.5 0 0 0 4 9.5h.5"/></svg>';
const CHECK_ICON =
  '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5 6.5 12 13 4.5"/></svg>';

/** Relative luminance (WCAG) of an sRGB color. */
function luminance([r, g, b]) {
  const lin = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** White or near-black text, whichever contrasts more with the color. */
function textColorOn(rgb) {
  const l = luminance(rgb);
  return (1.05 / (l + 0.05) >= (l + 0.05) / (luminance([31, 31, 31]) + 0.05)) ? '#ffffff' : '#1f1f1f';
}

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
  const el = Object.assign(document.createElement('button'), { type: 'button', className: 'btn btn-sm' });
  if (text) el.innerHTML = `${icon('copy')}<span class="btn-label">${text}</span>`;
  el.dataset.action = action;
  return el;
}

/**
 * One palette block.
 * @param entry { label, image (analyzeImage result), fileStem, palette, assign, onSelect }
 *   assign: palette index per analysed pixel; onSelect(index) with -1 for "none"
 */
function paletteBlock(entry) {
  const { label, image, fileStem, palette, assign, onSelect } = entry;
  let selected = -1;

  const block = document.createElement('div');
  block.className = 'palette';

  const head = document.createElement('div');
  head.className = 'palette-head';
  // One line (full title on hover), so both palettes' bars start at the same height.
  const title = Object.assign(document.createElement('h5'), { textContent: label, title: label });
  const actions = document.createElement('div');
  actions.className = 'palette-actions';
  actions.append(button('Copy hex', 'copy-hex'), button('Copy image', 'copy-image'));
  head.append(title, actions);

  // Proportional color bar; each block shows its hex value and share, has a copy
  // button for the hex value and highlights the color in the image when clicked.
  const bar = document.createElement('ol');
  bar.className = 'palette-bar';
  bar.setAttribute('aria-label', `${label} palette – select a color to highlight it in the image`);
  palette.forEach((c, i) => {
    const share = `${(c.share * 100).toFixed(1)} %`;
    const seg = document.createElement('li');
    seg.className = 'palette-seg';
    Object.assign(seg.style, { flexGrow: String(c.share), background: c.hex, color: textColorOn(c.rgb) });
    seg.title = `${c.hex} · ${share}`;

    const swatch = button('', 'select');
    swatch.className = 'palette-swatch';
    swatch.dataset.index = String(i);
    swatch.setAttribute('aria-pressed', 'false');
    swatch.setAttribute('aria-label', `Highlight ${c.hex} (${share})`);

    const copy = button('', 'copy-one');
    copy.className = 'palette-copy';
    copy.dataset.index = String(i);
    copy.setAttribute('aria-label', `Copy ${c.hex}`);
    copy.innerHTML = COPY_ICON;

    const hexRow = document.createElement('span');
    hexRow.className = 'palette-hex';
    hexRow.append(Object.assign(document.createElement('code'), { textContent: c.hex }), copy);
    seg.append(swatch, hexRow, Object.assign(document.createElement('span'), { className: 'palette-share', textContent: share }));
    bar.append(seg);
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
    const share = renderPreview(preview, image, assign, selected);
    bar.querySelectorAll('.palette-swatch').forEach((el) => el.setAttribute('aria-pressed', String(Number(el.dataset.index) === selected)));
    preview.setAttribute('aria-label', selected < 0 ? label : `${label}, pixels closest to ${palette[selected].hex} highlighted`);
    say(selected < 0 ? '' : `Highlighted ${palette[selected].hex}: ${(share * 100).toFixed(1)} % of the pixels (also in the plot above).`);
    onSelect?.(selected);
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

  async function copyOne(copyButton) {
    const { hex } = palette[Number(copyButton.dataset.index)];
    try {
      await navigator.clipboard.writeText(hex);
      say(`Copied ${hex}.`);
      copyButton.innerHTML = CHECK_ICON;
      setTimeout(() => (copyButton.innerHTML = COPY_ICON), 1200);
    } catch {
      say(`Clipboard not available: ${hex}`);
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
    else if (target.dataset.action === 'copy-one') copyOne(target);
    else if (target.dataset.action === 'copy-hex') copyHex();
    else if (target.dataset.action === 'copy-image') copyImage();
  });

  preview.setAttribute('aria-label', label);
  block.append(head, bar, preview, feedback);
  return block;
}

export function createPaletteView() {
  const root = document.createElement('div');
  root.className = 'analysis-palettes';
  return {
    element: root,
    /** entries: [{ label, image, fileStem, palette, assign, onSelect }] */
    update(entries) {
      root.replaceChildren(...entries.map(paletteBlock));
    },
  };
}
