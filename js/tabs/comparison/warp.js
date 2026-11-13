// Pixel warping with a homography (inverse mapping + bilinear sampling).
// Used for screenshots and the difference map, where the overlay must be
// resampled into the base image's pixel grid.

import { invert, multiply, scaling, translation } from './geometry.js';
import { canvasFrom, imageDataOf } from './media.js';

/**
 * Warp `src` (ImageData) into a dstW×dstH image.
 * @param m matrix mapping src px -> dst px
 * @returns ImageData; pixels outside the source are transparent
 */
export function warpImageData(src, dstW, dstH, m) {
  const inv = invert(m);
  const out = new ImageData(dstW, dstH);
  const s = src.data;
  const d = out.data;
  const sw = src.width;
  const sh = src.height;
  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const w = inv[6] * px + inv[7] * py + inv[8];
      if (w <= 0) continue;
      const u = (inv[0] * px + inv[1] * py + inv[2]) / w - 0.5;
      const v = (inv[3] * px + inv[4] * py + inv[5]) / w - 0.5;
      if (u < -0.5 || v < -0.5 || u > sw - 0.5 || v > sh - 0.5) continue;
      const x0 = Math.max(0, Math.min(sw - 1, Math.floor(u)));
      const y0 = Math.max(0, Math.min(sh - 1, Math.floor(v)));
      const x1 = Math.min(sw - 1, x0 + 1);
      const y1 = Math.min(sh - 1, y0 + 1);
      const fx = Math.min(1, Math.max(0, u - x0));
      const fy = Math.min(1, Math.max(0, v - y0));
      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;
      const o = (y * dstW + x) * 4;
      for (let c = 0; c < 4; c++) {
        const top = s[i00 + c] + (s[i10 + c] - s[i00 + c]) * fx;
        const bottom = s[i01 + c] + (s[i11 + c] - s[i01 + c]) * fx;
        d[o + c] = top + (bottom - top) * fy;
      }
    }
  }
  return out;
}

/**
 * Resample the overlay into a W×H image of the base frame, where the base is
 * scaled by `s` (px per base natural px) and shifted by (-ox, -oy).
 * The overlay is first downscaled to about the resolution it is sampled at
 * (avoids aliasing and wasted work).
 * @param M  overlay natural px -> base natural px
 * @returns ImageData; transparent outside the overlay
 */
export function warpOverlay(overlay, M, W, H, { s, ox = 0, oy = 0, maxSide = 4096, filter = 'none' }) {
  const k = Math.sqrt(Math.abs((M[0] * M[4] - M[1] * M[3]) / (M[8] * M[8])));
  const side = Math.min(maxSide, Math.max(16, Math.round(Math.max(overlay.natW, overlay.natH) * k * s)));
  const source = canvasFrom(overlay.img, side, filter);
  const so = source.width / overlay.natW;
  return warpImageData(imageDataOf(source), W, H, multiply(translation(-ox, -oy), scaling(s), M, scaling(1 / so)));
}
