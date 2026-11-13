// Loading the pair's images for display, plus small canvas helpers. Each image
// keeps its natural size (all geometry is in natural pixels) plus a downscaled
// canvas for drawing.

import { loadImage } from './pixels.js';

/** Longest side (px) of the display canvases (large enough for zooming in). */
const DISPLAY_SIZE = 4096;

export function createCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  return canvas;
}

/** Draw `source` (image or canvas) scaled to w×h onto a new canvas. */
export function drawToSize(source, w, h, filter = 'none') {
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.filter = filter;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Draw `source` onto a new canvas no larger than maxSide. */
export function canvasFrom(source, maxSide, filter = 'none') {
  const w = source.naturalWidth ?? source.width;
  const h = source.naturalHeight ?? source.height;
  const s = Math.min(1, maxSide / Math.max(w, h));
  return drawToSize(source, w * s, h * s, filter);
}

export const imageDataOf = (canvas) => canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);

/**
 * Load one side of a pair.
 * @returns {Promise<{...side, img, natW, natH, display: HTMLCanvasElement}>}
 */
export async function loadDisplayImage(side) {
  const img = await loadImage(side.url);
  return { ...side, img, natW: img.naturalWidth, natH: img.naturalHeight, display: canvasFrom(img, DISPLAY_SIZE) };
}
