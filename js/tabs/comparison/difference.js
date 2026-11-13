// Structural difference map between the aligned base and overlay images.
//
// Photochroms are recolored reproductions, so comparing colors directly would
// flag everything. Instead both images are reduced to luminance, lightly blurred
// (suppresses print grain), and *locally normalised* (subtract the local mean,
// divide by the local contrast). What remains is the image structure – edges,
// shapes, textures – independent of global tone and color. The smoothed absolute
// difference of the two structure maps is the score shown as a heatmap.
//
// This is a heuristic: it cannot say *what* changed, and residual misalignment
// shows up as differences along strong edges.

import { createCanvas, drawToSize, imageDataOf } from './media.js';
import { warpOverlay } from './warp.js';

/** Longest side (px) of the difference grid. */
const DIFF_SIZE = 640;
const HEAT_RGB = [227, 73, 72];
export const HEAT_COLOR = `rgb(${HEAT_RGB.join(',')})`;

/** CSS filter for the base image under the heatmap (screen and screenshot). */
export const DIFF_BASE_FILTER = 'grayscale(1) contrast(0.7) brightness(1.15)';

/**
 * Score threshold for a sensitivity of 0–100 (higher sensitivity = lower threshold):
 * 0 -> 1.2, 50 -> 0.6, 100 -> 0.3. Calibrated on the aligned Gleyre pair, where the
 * score median is ~0.17 and the 99th percentile ~0.66; a 40 px misalignment pushes
 * the 99th percentile above 1.1.
 */
export const thresholdFor = (sensitivity) => 1.2 * 0.25 ** (sensitivity / 100);

/** Mean of `values` over valid (mask) pixels in a (2r+1)² window, via integral images. */
function boxMean(values, mask, w, h, r) {
  const W = w + 1;
  const sum = new Float64Array(W * (h + 1));
  const cnt = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    let rowCnt = 0;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask[i]) {
        rowSum += values[i];
        rowCnt++;
      }
      sum[(y + 1) * W + x + 1] = sum[y * W + x + 1] + rowSum;
      cnt[(y + 1) * W + x + 1] = cnt[y * W + x + 1] + rowCnt;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const c = cnt[y1 * W + x1] - cnt[y0 * W + x1] - cnt[y1 * W + x0] + cnt[y0 * W + x0];
      const s = sum[y1 * W + x1] - sum[y0 * W + x1] - sum[y1 * W + x0] + sum[y0 * W + x0];
      out[y * w + x] = c ? s / c : 0;
    }
  }
  return out;
}

/** Locally normalised luminance: (I − local mean) / (local std + c). */
function structure(lum, mask, w, h, r) {
  let v = boxMean(lum, mask, w, h, 1);
  v = boxMean(v, mask, w, h, 1);
  const sq = v.map((x) => x * x);
  const mean = boxMean(v, mask, w, h, r);
  const meanSq = boxMean(sq, mask, w, h, r);
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) {
    if (!mask[i]) continue;
    const sd = Math.sqrt(Math.max(0, meanSq[i] - mean[i] * mean[i]));
    out[i] = (v[i] - mean[i]) / (sd + 6);
  }
  return out;
}

/**
 * Compute the difference score map in the base image's frame.
 * @param base, overlay  loaded images ({ display, natW, natH })
 * @param M  overlay natural px -> base natural px
 * @returns {{ w, h, score: Float32Array, mask: Uint8Array }}
 */
export function computeDifference(base, overlay, M) {
  const s = Math.min(1, DIFF_SIZE / Math.max(base.natW, base.natH));
  const w = Math.max(1, Math.round(base.natW * s));
  const h = Math.max(1, Math.round(base.natH * s));
  const baseData = imageDataOf(drawToSize(base.display, w, h));
  const warped = warpOverlay(overlay, M, w, h, { s, maxSide: 2048 });

  const n = w * h;
  const mask = new Uint8Array(n);
  const lumBase = new Float32Array(n);
  const lumOverlay = new Float32Array(n);
  const b = baseData.data;
  const o = warped.data;
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    mask[i] = o[p + 3] > 250 ? 1 : 0;
    lumBase[i] = 0.2126 * b[p] + 0.7152 * b[p + 1] + 0.0722 * b[p + 2];
    lumOverlay[i] = 0.2126 * o[p] + 0.7152 * o[p + 1] + 0.0722 * o[p + 2];
  }

  const r = Math.max(4, Math.round(Math.max(w, h) / 64));

  // Local statistics are unreliable near image borders and the edge of the
  // overlap (frames, scan borders): only compare pixels with a full window.
  const margin = Math.max(3, Math.round(Math.max(w, h) / 80));
  const full = (2 * margin + 1) ** 2;
  const ones = new Float32Array(n).fill(1);
  const coverage = boxMean(mask, ones, w, h, margin);
  const inner = new Uint8Array(n);
  for (let y = margin; y < h - margin; y++) {
    for (let x = margin; x < w - margin; x++) {
      const i = y * w + x;
      inner[i] = mask[i] && coverage[i] * full > full - 0.5 ? 1 : 0;
    }
  }

  const sb = structure(lumBase, mask, w, h, r);
  const so = structure(lumOverlay, mask, w, h, r);
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) if (mask[i]) d[i] = Math.abs(sb[i] - so[i]);
  const score = boxMean(d, inner, w, h, Math.max(2, Math.round(r / 2)));
  return { w, h, score, mask: inner };
}

/**
 * Connected regions above the threshold.
 * @returns {{ changedShare, comparedShare, regions: {x, y, w, h, share, where}[] }} boxes in diff px,
 *   shares relative to the compared (overlapping) area
 */
export function findRegions(result, threshold, maxRegions = 12) {
  const { w, h, score, mask } = result;
  const n = w * h;
  const hot = new Uint8Array(n);
  let valid = 0;
  let changed = 0;
  for (let i = 0; i < n; i++) {
    if (!mask[i]) continue;
    valid++;
    if (score[i] > threshold) {
      hot[i] = 1;
      changed++;
    }
  }

  const minArea = Math.max(20, valid * 0.002);
  const seen = new Uint8Array(n);
  const stack = new Int32Array(n);
  const regions = [];
  for (let start = 0; start < n; start++) {
    if (!hot[start] || seen[start]) continue;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    let area = 0;
    let x0 = w;
    let y0 = h;
    let x1 = 0;
    let y1 = 0;
    while (top) {
      const i = stack[--top];
      const x = i % w;
      const y = (i - x) / w;
      area++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      const visit = (j) => {
        if (hot[j] && !seen[j]) {
          seen[j] = 1;
          stack[top++] = j;
        }
      };
      if (x > 0) visit(i - 1);
      if (x < w - 1) visit(i + 1);
      if (y > 0) visit(i - w);
      if (y < h - 1) visit(i + w);
    }
    if (area >= minArea) {
      const cx = (x0 + x1) / 2 / w;
      const cy = (y0 + y1) / 2 / h;
      const where = `${['upper', 'middle', 'lower'][Math.min(2, Math.floor(cy * 3))]} ${['left', 'center', 'right'][Math.min(2, Math.floor(cx * 3))]}`;
      regions.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, share: area / valid, where: where.replace('middle center', 'center') });
    }
  }
  regions.sort((a, b) => b.share - a.share);
  return {
    changedShare: valid ? changed / valid : 0,
    comparedShare: valid / n,
    regions: regions.slice(0, maxRegions),
  };
}

/**
 * Heatmap at the resolution of the difference grid: red where the score exceeds
 * the threshold (fading in just below it), gray tint where nothing was compared.
 */
export function heatImage(result, threshold, opacity) {
  const { w, h, score, mask } = result;
  const heat = new ImageData(w, h);
  const lo = threshold * 0.7;
  for (let i = 0; i < w * h; i++) {
    const p = i * 4;
    if (!mask[i]) {
      heat.data[p] = heat.data[p + 1] = heat.data[p + 2] = 60;
      heat.data[p + 3] = 110;
      continue;
    }
    const a = Math.min(1, Math.max(0, (score[i] - lo) / (threshold - lo)));
    heat.data[p] = HEAT_RGB[0];
    heat.data[p + 1] = HEAT_RGB[1];
    heat.data[p + 2] = HEAT_RGB[2];
    heat.data[p + 3] = Math.round(a * opacity * 255);
  }
  return heat;
}

/**
 * Draw heatmap and numbered region boxes onto ctx at W×H (the size of the base
 * image on the target canvas). Used for screenshots; the viewer shows the boxes
 * as HTML so they stay sharp when zoomed.
 */
export function drawDifference(ctx, result, analysis, threshold, opacity, W, H, lineWidth = 2) {
  const { w, h } = result;
  const tmp = createCanvas(w, h);
  tmp.getContext('2d').putImageData(heatImage(result, threshold, opacity), 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(tmp, 0, 0, W, H);

  const sx = W / w;
  const sy = H / h;
  const font = Math.max(11, Math.round(lineWidth * 6.5));
  ctx.lineWidth = lineWidth;
  ctx.font = `600 ${font}px system-ui, sans-serif`;
  ctx.textBaseline = 'top';
  analysis.regions.forEach((r, i) => {
    const x = r.x * sx;
    const y = r.y * sy;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.strokeRect(x - lineWidth, y - lineWidth, r.w * sx + 2 * lineWidth, r.h * sy + 2 * lineWidth);
    ctx.strokeStyle = HEAT_COLOR;
    ctx.strokeRect(x, y, r.w * sx, r.h * sy);
    const label = String(i + 1);
    const pad = Math.round(font * 0.3);
    const tw = ctx.measureText(label).width + 2 * pad;
    ctx.fillStyle = '#1f1f1f';
    ctx.fillRect(x, y, tw, font + 2 * pad);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, x + pad, y + pad);
  });
  ctx.restore();
}
