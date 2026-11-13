// Image loading and pixel extraction for color analysis.
// Images are downscaled on a canvas first: the plots only need a representative
// set of pixels, and the full-resolution originals can be > 10 megapixels.

import { rgbToLab } from './color.js';

/** Longest side (px) of the downscaled analysis canvas. */
const ANALYSIS_SIZE = 512;

/** Upper bound for the per-image sample; smaller samples are prefixes of this one. */
export const MAX_SAMPLE = 20000;

/** Deterministic PRNG (mulberry32) so plots stay identical between redraws. */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Required for pixel access when the image is served from another origin.
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load image: ${url}`));
    img.src = url;
  });
}

/**
 * Load an image and extract its pixels.
 * @returns {Promise<{url, width, height, canvas, n, rgb: Uint8Array, lab: Float32Array, order: Uint32Array}>}
 *   rgb/lab hold 3 values per opaque pixel; `order` is a random permutation prefix
 *   (length ≤ MAX_SAMPLE) of pixel indices used for sampling.
 */
export async function analyzeImage(url) {
  const img = await loadImage(url);
  const scale = Math.min(1, ANALYSIS_SIZE / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  let rgba;
  try {
    rgba = ctx.getImageData(0, 0, width, height).data;
  } catch {
    throw new Error(`No pixel access to ${url} (the host does not send CORS headers).`);
  }

  // Keep opaque pixels only.
  const total = width * height;
  const rgb = new Uint8Array(total * 3);
  const lab = new Float32Array(total * 3);
  let n = 0;
  for (let i = 0; i < total; i++) {
    if (rgba[i * 4 + 3] < 128) continue;
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    rgb[n * 3] = r;
    rgb[n * 3 + 1] = g;
    rgb[n * 3 + 2] = b;
    const [L, A, B] = rgbToLab(r, g, b);
    lab[n * 3] = L;
    lab[n * 3 + 1] = A;
    lab[n * 3 + 2] = B;
    n++;
  }

  // Partial Fisher–Yates shuffle: the first k entries are a uniform random sample.
  const k = Math.min(n, MAX_SAMPLE);
  const indices = new Uint32Array(n);
  for (let i = 0; i < n; i++) indices[i] = i;
  const random = seededRandom(42);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(random() * (n - i));
    const tmp = indices[i];
    indices[i] = indices[j];
    indices[j] = tmp;
  }

  return {
    url,
    width,
    height,
    canvas,
    n,
    rgb: rgb.subarray(0, n * 3),
    lab: lab.subarray(0, n * 3),
    order: indices.slice(0, k),
  };
}

/** First `size` sampled pixel indices of an analysed image. */
export const sampleIndices = (image, size) => image.order.subarray(0, Math.min(size, image.order.length));
