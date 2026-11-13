// Screenshot of the current comparison view as a PNG download. When the view is
// zoomed in, only the visible part is saved (at up to full image resolution).
// Rendered from the source images (not the screen), with the adjustments applied
// and a caption band with the image credits (the CC BY-SA original requires attribution).

import { canvasToBlob, downloadBlob } from '../../lib/download.js';
import { filterString } from './adjustments.js';
import { DIFF_BASE_FILTER, drawDifference, thresholdFor } from './difference.js';
import { createCanvas } from './media.js';
import { SIDES, VIEW_LABELS, baseImage, otherSide, overlayImage, overlayMatrix, store } from './store.js';
import { warpOverlay } from './warp.js';

/** Longest side (px) of the base image in overlay screenshots. */
const SHOT_SIZE = 2000;
const SIDE_HEIGHT = 1000;
const GAP = 24;

const FULL = { x0: 0, y0: 0, x1: 1, y1: 1 };

/** Region (image fractions) -> natural px rectangle. */
function cropOf(image, region) {
  const r = region ?? FULL;
  return { x: r.x0 * image.natW, y: r.y0 * image.natH, w: (r.x1 - r.x0) * image.natW, h: (r.y1 - r.y0) * image.natH };
}

/** Both images next to each other; regions = { left, right } when zoomed in. */
function renderSideBySide(regions) {
  const crops = SIDES.map((side) => cropOf(store.images[side], regions?.[side]));
  const h = Math.min(SIDE_HEIGHT, Math.max(...crops.map((c) => c.h)));
  const widths = crops.map((c) => (c.w * h) / c.h);
  const canvas = createCanvas(widths[0] + widths[1] + GAP, h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  SIDES.forEach((side, i) => {
    const c = crops[i];
    ctx.filter = filterString(store.adjust[side]);
    ctx.drawImage(store.images[side].img, c.x, c.y, c.w, c.h, i ? widths[0] + GAP : 0, 0, widths[i], h);
  });
  return canvas;
}

/** The overlay as a W×H canvas of the (scaled, shifted) base frame, with its adjustments. */
function warpedOverlay(W, H, s, ox, oy) {
  const filter = filterString(store.adjust[store.overlaySide]);
  const out = createCanvas(W, H);
  out.getContext('2d').putImageData(warpOverlay(overlayImage(), overlayMatrix(), W, H, { s, ox, oy, filter }), 0, 0);
  return out;
}

/** Overlay, slider or difference view; region = visible part of the base when zoomed in. */
function renderStage(diff, region) {
  const base = baseImage();
  const crop = cropOf(base, region);
  // Detail shots get more pixels, but never more than the base image has.
  const s = Math.min(1, SHOT_SIZE / Math.max(crop.w, crop.h));
  const W = Math.max(1, Math.round(crop.w * s));
  const H = Math.max(1, Math.round(crop.h * s));
  const ox = crop.x * s; // offset of the crop in the scaled base frame
  const oy = crop.y * s;
  const fullW = base.natW * s;
  const fullH = base.natH * s;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.filter = store.view === 'diff' ? DIFF_BASE_FILTER : filterString(store.adjust[otherSide(store.overlaySide)]);
  ctx.drawImage(base.img, crop.x, crop.y, crop.w, crop.h, 0, 0, W, H);
  ctx.filter = 'none';

  if (store.view === 'overlay') {
    ctx.globalAlpha = store.opacity;
    ctx.drawImage(warpedOverlay(W, H, s, ox, oy), 0, 0);
    ctx.globalAlpha = 1;
  } else if (store.view === 'slider') {
    const x = Math.round(store.divider * fullW - ox);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, 0, W - x, H);
    ctx.clip();
    ctx.drawImage(warpedOverlay(W, H, s, ox, oy), 0, 0);
    ctx.restore();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 2, 0, 4, H);
    ctx.fillStyle = '#1f1f1f';
    ctx.fillRect(x - 0.5, 0, 1, H);
  } else if (store.view === 'diff' && diff?.result) {
    const t = thresholdFor(store.diff.sensitivity);
    ctx.save();
    ctx.translate(-ox, -oy);
    drawDifference(ctx, diff.result, diff.analysis, t, store.diff.opacity, fullW, fullH, 3);
    ctx.restore();
  }
  return canvas;
}

/** Wrap text into lines that fit maxWidth. */
function wrap(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function withCaption(image, detail) {
  const font = Math.max(14, Math.round(image.width / 110));
  const lineH = Math.round(font * 1.45);
  const pad = Math.round(font * 1.2);
  const measure = createCanvas(1, 1).getContext('2d');
  measure.font = `${font}px system-ui, sans-serif`;
  const name = `${VIEW_LABELS[store.view]}${detail ? ' (zoomed detail)' : ''}`;
  const view = store.view === 'side' ? name : `${name}: ${overlayImage().label} on ${baseImage().label}`;
  const texts = [`${store.pair.label} · ${view}`, ...SIDES.map((side) => `${store.images[side].label}: ${store.images[side].credit}`)];
  const lines = texts.flatMap((t) => wrap(measure, t, image.width - 2 * pad));

  const canvas = createCanvas(image.width, image.height + lines.length * lineH + 2 * pad);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0);
  ctx.font = measure.font;
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => {
    ctx.fillStyle = i === 0 ? '#1f1f1f' : '#52514e';
    ctx.fillText(line, pad, image.height + pad + i * lineH);
  });
  return canvas;
}

/**
 * Render the current view and download it as PNG.
 * @param diff  { result, analysis } from the difference view
 * @param region  visible part when zoomed in (viewer.visibleRegion()), null = whole view
 */
export async function saveScreenshot(diff, region = null) {
  const image = store.view === 'side' ? renderSideBySide(region) : renderStage(diff, region);
  const blob = await canvasToBlob(withCaption(image, Boolean(region)));
  downloadBlob(blob, `${store.pair.id}-${store.view}${region ? '-detail' : ''}.png`);
}
