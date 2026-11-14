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
 * Crop `img` to `box` (fractions of width/height) and return it as a new <img>.
 * A real image (not a canvas) keeps every consumer working unchanged: geometry uses
 * naturalWidth/Height, the image dialog clones it, analysis and screenshots draw it.
 * The blob URL is same-origin, so the canvas stays readable.
 */
async function cropImage(img, box) {
  const x = Math.round(box.x0 * img.naturalWidth);
  const y = Math.round(box.y0 * img.naturalHeight);
  const w = Math.max(1, Math.round((box.x1 - box.x0) * img.naturalWidth));
  const h = Math.max(1, Math.round((box.y1 - box.y0) * img.naturalHeight));
  const canvas = createCanvas(w, h);
  canvas.getContext('2d').drawImage(img, x, y, w, h, 0, 0, w, h);
  const blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not crop the image'))), 'image/jpeg', 0.95));
  const url = URL.createObjectURL(blob);
  return { img: await loadImage(url), url };
}

/** Free the memory of a cropped image once its pair is no longer shown. */
export function releaseImage(image) {
  if (image?.blobUrl) URL.revokeObjectURL(image.blobUrl);
}

/**
 * Load one side of a pair. If `side.printArea` is set and `crop` is true, the image is
 * cropped to the print (no color chart, gray scale or scanner background) before
 * anything else sees it, so view, alignment, differences, color analysis and
 * screenshots all work on the print only.
 * @returns {Promise<{...side, img, natW, natH, display: HTMLCanvasElement, cropped: object|null, scanW, scanH, blobUrl, fallback}>}
 */
export async function loadDisplayImage(side, { crop = true } = {}) {
  // If the full image is missing (e.g. not uploaded yet), fall back to the small thumbnail.
  let scan;
  let fallback = false;
  try {
    scan = await loadImage(side.url);
  } catch (err) {
    if (!side.fallbackUrl) throw err;
    scan = await loadImage(side.fallbackUrl);
    fallback = true;
  }
  const cropped = crop && side.printArea ? side.printArea : null;
  const { img, url } = cropped ? await cropImage(scan, cropped) : { img: scan, url: null };
  return {
    ...side,
    img,
    natW: img.naturalWidth,
    natH: img.naturalHeight,
    display: canvasFrom(img, DISPLAY_SIZE),
    cropped,
    scanW: scan.naturalWidth,
    scanH: scan.naturalHeight,
    blobUrl: url, // release with releaseImage() when the pair is replaced
    fallback, // true: only the small thumbnail could be loaded
  };
}
