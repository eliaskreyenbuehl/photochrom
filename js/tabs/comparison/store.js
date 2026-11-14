// State of the Image Comparison tab, shared by its sub-modules.
// Mutate only through update(); listeners receive the change reason so they can
// skip work that is not affected (e.g. 'transform' does not rebuild canvases).
//
// Reasons: 'pair' | 'view' | 'swap' | 'transform' | 'opacity' | 'blend' | 'divider' | 'adjust' | 'diff'

import { defaultAdjustments } from './adjustments.js';
import { apply, identity, multiply, rotation, scaling, translation } from './geometry.js';

export const SIDES = ['left', 'right'];
/** Short names of the two images, used where a full name does not fit. */
export const POSITION = { left: 'Left', right: 'Right' };

export const VIEW_LABELS = { side: 'Side by side', overlay: 'Overlay', slider: 'Slider', diff: 'Differences' };
export const VIEW_ICONS = { side: 'side', overlay: 'overlay', slider: 'slider', diff: 'difference' }; // js/lib/ui/icons.js

export const defaultManual = () => ({ tx: 0, ty: 0, scale: 1, rotation: 0 });
const defaultAdjust = () => ({ left: defaultAdjustments(), right: defaultAdjustments() });

export const store = {
  pair: null, // see js/state.js
  images: { left: null, right: null }, // loadDisplayImage() results
  view: 'side', // 'side' | 'overlay' | 'slider' | 'diff'
  overlaySide: 'right', // image drawn on top in overlay views; the other one is the base
  H: identity(), // overlay natural px -> base natural px (initial fit or auto-align result)
  manual: defaultManual(), // user adjustments on top of H (base px, factor, degrees)
  alignedH: false, // H holds an alignment (auto-align, or manual moves kept through a swap)
  opacity: 0.5,
  differenceBlend: false, // overlay view: overlay drawn with mix-blend-mode difference
  divider: 0.5, // slider position, fraction of the base width
  adjust: defaultAdjust(),
  diff: { sensitivity: 50, opacity: 0.75 },
};

const listeners = new Set();

export function update(patch, reason) {
  Object.assign(store, patch);
  for (const listener of listeners) listener(reason);
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const otherSide = (side) => (side === 'left' ? 'right' : 'left');
export const baseImage = () => store.images[otherSide(store.overlaySide)];
export const overlayImage = () => store.images[store.overlaySide];

/** Change the manual move/scale/rotation (part of the alignment). */
export const setManual = (patch) => update({ manual: { ...store.manual, ...patch } }, 'transform');

/** Scale the overlay to fit inside the base, centered. */
export function fitMatrix(overlay, base) {
  const s = Math.min(base.natW / overlay.natW, base.natH / overlay.natH);
  return multiply(translation((base.natW - overlay.natW * s) / 2, (base.natH - overlay.natH * s) / 2), scaling(s));
}

/** State patch for a newly loaded pair: overlay fitted into the base, no adjustments. */
export const initialPairState = (images, overlaySide = 'right') => ({
  images,
  overlaySide,
  H: fitMatrix(images[overlaySide], images[otherSide(overlaySide)]),
  manual: defaultManual(),
  alignedH: false,
  adjust: defaultAdjust(),
});

/** Discard the alignment: overlay fitted into the base again. */
export const resetAlignment = () =>
  update({ H: fitMatrix(overlayImage(), baseImage()), manual: defaultManual(), alignedH: false }, 'transform');

/** True once the images were aligned (auto-align or by hand). */
export const isAligned = () => store.alignedH || Object.entries(defaultManual()).some(([key, value]) => store.manual[key] !== value);

/**
 * Complete overlay -> base matrix: H, then the manual move/scale/rotation around
 * the overlay's current center.
 */
export function overlayMatrix() {
  const o = overlayImage();
  if (!o) return identity();
  const { tx, ty, scale, rotation: deg } = store.manual;
  const [cx, cy] = apply(store.H, o.natW / 2, o.natH / 2);
  return multiply(
    translation(cx + tx, cy + ty),
    rotation((deg * Math.PI) / 180),
    scaling(scale),
    translation(-cx, -cy),
    store.H
  );
}
