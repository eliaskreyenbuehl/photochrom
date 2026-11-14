// Pan & zoom for the comparison viewer, built on Panzoom 4.6.2 (MIT, vendored in
// js/vendor/panzoom/ – https://github.com/timmywil/panzoom).
//
// `content` is transformed inside its parent element (the viewport, which clips
// it). Panzoom's focal-point math assumes the content starts at the viewport's
// top-left corner, so `content` must span the viewport width and center its own
// children.
//
// Zooming: pinch, Ctrl/⌘ + scroll, double-click (Shift: out), keys + − 0.
// Plain scrolling is left to the page so the viewer never traps page scrolling,
// unless `wheelZoom: true` (e.g. in a modal dialog, where there is no page to scroll).

import Panzoom from '../../vendor/panzoom/panzoom.es.js';

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 16;
const BUTTON_FACTOR = 1.5;
const KEY_PAN = 60; // screen px per arrow key press

export const clampZoom = (s) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, s));

/**
 * @param content  element to transform (child of the viewport)
 * @param options.bindPointer  let Panzoom handle pointer events itself; false = the
 *   caller routes events through handleDown/handleMove/handleUp
 * @param options.onChange  called with { scale, x, y } after every change
 * @param options.allowDblClick  predicate deciding whether a double-click zooms
 * @param options.wheelZoom  plain scrolling zooms too (not only Ctrl/⌘ + scroll)
 */
export function createZoom(content, { bindPointer = true, onChange = () => {}, allowDblClick = () => true, wheelZoom = false } = {}) {
  const viewport = content.parentElement;
  let pz = null;

  /** Panzoom needs an attached element, so it is created on first use. */
  function ensure() {
    if (!pz) {
      pz = Panzoom(content, {
        minScale: MIN_ZOOM,
        maxScale: MAX_ZOOM,
        canvas: true, // drag anywhere in the viewport, not only on the content
        noBind: !bindPointer,
        cursor: bindPointer ? 'grab' : '',
        animate: false,
      });
      content.addEventListener('panzoomchange', (e) => onChange(e.detail));
    }
    return pz;
  }

  const scale = () => (pz ? pz.getScale() : 1);
  const pan = () => (pz ? pz.getPan() : { x: 0, y: 0 });

  function zoomAt(toScale, point) {
    ensure().zoomToPoint(clampZoom(toScale), { clientX: point.clientX, clientY: point.clientY });
  }

  function zoomBy(factor) {
    const rect = viewport.getBoundingClientRect();
    // Zoom around the visible part of the viewport (it may extend below the window).
    const top = Math.max(rect.top, 0);
    const bottom = Math.min(rect.bottom, window.innerHeight);
    zoomAt(scale() * factor, { clientX: rect.left + rect.width / 2, clientY: bottom > top ? (top + bottom) / 2 : rect.top + rect.height / 2 });
  }

  function panBy(dx, dy) {
    const { x, y } = pan();
    ensure().pan(x + dx / scale(), y + dy / scale(), { animate: false });
  }

  /** Set the state directly (silent: no change event, used for linked views). */
  function set(toScale, x, y, { silent = false } = {}) {
    const p = ensure();
    p.zoom(clampZoom(toScale), { animate: false, silent });
    p.pan(x, y, { animate: false, force: true, silent });
  }

  function reset({ silent = false } = {}) {
    ensure().reset({ animate: false, silent });
  }

  const isFit = () => Math.abs(scale() - 1) < 1e-3 && Math.abs(pan().x) < 0.5 && Math.abs(pan().y) < 0.5;

  /** Keyboard zoom/pan; returns true if the key was handled. */
  function handleKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    const step = e.shiftKey ? KEY_PAN * 4 : KEY_PAN;
    const actions = {
      '+': () => zoomBy(BUTTON_FACTOR),
      '=': () => zoomBy(BUTTON_FACTOR),
      '-': () => zoomBy(1 / BUTTON_FACTOR),
      _: () => zoomBy(1 / BUTTON_FACTOR),
      0: reset,
      ArrowLeft: () => panBy(step, 0),
      ArrowRight: () => panBy(-step, 0),
      ArrowUp: () => panBy(0, step),
      ArrowDown: () => panBy(0, -step),
    };
    if (!actions[e.key]) return false;
    actions[e.key]();
    return true;
  }

  viewport.addEventListener(
    'wheel',
    (e) => {
      // Trackpad pinch arrives as wheel events with ctrlKey set.
      if (!(wheelZoom || e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      let delta = e.deltaY || e.deltaX;
      if (e.deltaMode === 1) delta *= 16; // lines -> px
      delta = Math.max(-30, Math.min(30, delta));
      zoomAt(scale() * Math.exp(-delta * 0.01), e);
    },
    { passive: false }
  );

  viewport.addEventListener('dblclick', (e) => {
    if (!allowDblClick(e)) return;
    e.preventDefault();
    zoomAt(scale() * (e.shiftKey ? 0.5 : 2), e);
  });

  return {
    ensure,
    ready: () => Boolean(pz),
    scale,
    pan,
    set,
    reset,
    isFit,
    zoomIn: () => zoomBy(BUTTON_FACTOR),
    zoomOut: () => zoomBy(1 / BUTTON_FACTOR),
    handleKey,
    // Manual pointer routing (bindPointer: false)
    handleDown: (e) => ensure().handleDown(e),
    handleMove: (e) => pz?.handleMove(e),
    handleUp: (e) => pz?.handleUp(e),
  };
}
