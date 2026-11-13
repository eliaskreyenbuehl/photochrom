// Color palette extraction: k-means clustering in CIE Lab (perceptually uniform,
// so cluster distances match perceived color differences).

import { labToRgb, rgbHex } from './color.js';
import { sampleIndices, seededRandom } from './pixels.js';

const MAX_ITERATIONS = 30;

/**
 * Extract a palette of `k` colors from an analysed image.
 * @returns {{ rgb: number[], hex: string, lab: number[], share: number }[]} sorted by share, descending
 */
export function extractPalette(image, k, sampleSize = 20000) {
  const idx = sampleIndices(image, sampleSize);
  const n = idx.length;
  if (n === 0) return [];
  k = Math.min(k, n);

  const pts = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const p = idx[i] * 3;
    pts[i * 3] = image.lab[p];
    pts[i * 3 + 1] = image.lab[p + 1];
    pts[i * 3 + 2] = image.lab[p + 2];
  }

  const centers = initCenters(pts, n, k, seededRandom(7));
  const assignment = new Int32Array(n);
  const sums = new Float64Array(k * 3);
  const counts = new Uint32Array(k);

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let changed = 0;
    sums.fill(0);
    counts.fill(0);
    for (let i = 0; i < n; i++) {
      const c = nearest(pts, i, centers, k);
      if (c !== assignment[i] || iter === 0) changed++;
      assignment[i] = c;
      sums[c * 3] += pts[i * 3];
      sums[c * 3 + 1] += pts[i * 3 + 1];
      sums[c * 3 + 2] += pts[i * 3 + 2];
      counts[c]++;
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) continue; // keep empty centers where they are
      centers[c * 3] = sums[c * 3] / counts[c];
      centers[c * 3 + 1] = sums[c * 3 + 1] / counts[c];
      centers[c * 3 + 2] = sums[c * 3 + 2] / counts[c];
    }
    if (changed === 0) break;
  }

  const palette = [];
  for (let c = 0; c < k; c++) {
    if (counts[c] === 0) continue;
    const lab = [centers[c * 3], centers[c * 3 + 1], centers[c * 3 + 2]];
    const rgb = labToRgb(...lab);
    palette.push({ rgb, hex: rgbHex(...rgb), lab, share: counts[c] / n });
  }
  return palette.sort((a, b) => b.share - a.share);
}

function dist2(pts, i, centers, c) {
  const dL = pts[i * 3] - centers[c * 3];
  const da = pts[i * 3 + 1] - centers[c * 3 + 1];
  const db = pts[i * 3 + 2] - centers[c * 3 + 2];
  return dL * dL + da * da + db * db;
}

function nearest(pts, i, centers, k) {
  let best = 0;
  let bestD = Infinity;
  for (let c = 0; c < k; c++) {
    const d = dist2(pts, i, centers, c);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** k-means++ seeding: spread initial centers proportionally to squared distance. */
function initCenters(pts, n, k, random) {
  const centers = new Float64Array(k * 3);
  const minD = new Float64Array(n).fill(Infinity);
  const copy = (c, i) => {
    centers[c * 3] = pts[i * 3];
    centers[c * 3 + 1] = pts[i * 3 + 1];
    centers[c * 3 + 2] = pts[i * 3 + 2];
  };
  copy(0, Math.floor(random() * n));
  for (let c = 1; c < k; c++) {
    let total = 0;
    for (let i = 0; i < n; i++) {
      minD[i] = Math.min(minD[i], dist2(pts, i, centers, c - 1));
      total += minD[i];
    }
    let target = random() * total;
    let pick = n - 1;
    for (let i = 0; i < n; i++) {
      target -= minD[i];
      if (target <= 0) {
        pick = i;
        break;
      }
    }
    copy(c, pick);
  }
  return centers;
}
