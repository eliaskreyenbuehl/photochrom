// Image viewer of the comparison tab.
//
// Views:
//   side     – both images next to each other
//   overlay  – overlay image on top of the base, draggable / scalable / rotatable
//   slider   – before/after: base left of the divider, overlay right of it
//   diff     – base in gray with the difference heatmap (drawn by diffview.js)
//
// The overlay is a canvas positioned with CSS matrix3d(), so any homography
// (including perspective from auto-align) is displayed without re-rendering pixels.
//
// Every view can be zoomed and panned (zoom.js). A toolbar above the picture holds
// the zoom buttons and, in the overlay view, the mouse tool: "Move overlay" drags
// the overlay, "Pan" drags the view. The tools keep the two drags apart; pinching
// and Ctrl/⌘ + scroll always zoom the view, Shift/Alt + scroll only ever act on
// the overlay.

import { openDetails } from '../../lib/ui/details.js';
import { icon } from '../../lib/ui/icons.js';
import { infoTip } from '../../lib/ui/info.js';
import { filterString } from './adjustments.js';
import { multiply, scaling, toCssMatrix3d, translation } from './geometry.js';
import { DIFF_BASE_FILTER } from './difference.js';
import { SIDES, baseImage, otherSide, overlayImage, overlayMatrix, setManual, store, subscribe, update } from './store.js';
import { MAX_ZOOM, MIN_ZOOM, clampZoom, createZoom } from '../../lib/ui/zoom.js';

const ZOOM_HINT = 'Pinch or Ctrl/⌘ + scroll to zoom, double-click to zoom in (Shift: out), 0 to fit.';

const HINTS = {
  side: 'Choose the images with the search fields at the top (media library, or a pasted Wikimedia Commons / e-rara link). Double-click an image (or click its title) for its details: the full image and all its metadata. Pinch or Ctrl/⌘ + scroll to zoom, drag to pan, 0 to fit. With "Link" on, both images zoom and pan together; turn it off to adjust one image, then on again to keep that offset.',
  'overlay-move': `Move overlay: drag to move it, Shift + scroll scales, Alt + scroll rotates; with the image focused, arrow keys move, + / − scale, [ / ] rotate (Shift: larger steps). Hold Space or switch to Pan (H) to drag the view. ${ZOOM_HINT}`,
  'overlay-pan': `Pan: drag to move the view, arrow keys pan. Switch to Move overlay (V) to align. ${ZOOM_HINT}`,
  slider: `Drag the divider line (or press ← →) to compare; drag anywhere else to pan. ${ZOOM_HINT}`,
  diff: `Red areas: the image structure differs between the aligned images (e.g. added, removed or changed content). Gray tint: outside the overlap, not compared. Align the images first. Drag to pan. ${ZOOM_HINT}`,
};

export function createViewer() {
  const root = document.createElement('div');
  root.className = 'cmp-viewer';
  root.innerHTML = `
    <div class="cmp-viewer-toolbar" role="toolbar" aria-label="View tools">
      <div class="cmp-toolset" data-only="overlay" role="group" aria-label="Mouse tool">
        <button type="button" class="btn btn-ghost" data-tool="move" aria-pressed="true" title="Drag moves the overlay (V)">${icon('move')}<span class="btn-label">Move overlay</span></button>
        <button type="button" class="btn btn-ghost" data-tool="pan" aria-pressed="false" title="Drag pans the view (H, or hold Space)">${icon('pan')}<span class="btn-label">Pan</span></button>
      </div>
      <div class="cmp-toolset" role="group" aria-label="Zoom">
        <button type="button" class="btn btn-ghost btn-icon" data-zoom="out" aria-label="Zoom out" title="Zoom out (−)">${icon('minus')}</button>
        <output class="cmp-zoom-level" aria-label="Zoom level">1×</output>
        <button type="button" class="btn btn-ghost btn-icon" data-zoom="in" aria-label="Zoom in" title="Zoom in (+)">${icon('plus')}</button>
        <button type="button" class="btn btn-ghost" data-zoom="fit" title="Fit to the view (0)">${icon('fit')}<span class="btn-label">Fit</span></button>
      </div>
      <span class="cmp-toolbar-end">
        <button type="button" class="btn btn-ghost" data-only="side" data-action="link" aria-pressed="true" title="Zoom and pan both images together">${icon('link')}<span class="btn-label">Link</span></button>
        ${infoTip('<span class="cmp-hint-text"></span>', 'How to use this view')}
      </span>
    </div>
    <div class="cmp-side-view" data-only="side">
      ${SIDES.map(
        (side) => `
        <figure class="cmp-figure" data-side="${side}">
          <div class="cmp-frame" tabindex="0"><div class="cmp-zoom"></div></div>
          <figcaption><button type="button" class="cmp-title" aria-haspopup="dialog" title="Show the details: full image and all metadata (or double-click the image)"></button> <span class="cmp-year"></span></figcaption>
        </figure>`
      ).join('')}
    </div>
    <div class="cmp-stage" data-only="overlay slider diff" tabindex="0" role="application" aria-roledescription="image comparison" aria-describedby="cmp-stage-hint">
      <div class="cmp-zoom">
        <div class="cmp-stage-inner">
          <div class="cmp-base-holder"></div>
          <div class="cmp-overlay-clip"></div>
          <canvas class="cmp-diff-layer" data-only="diff"></canvas>
          <div class="cmp-diff-boxes" data-only="diff"></div>
        </div>
      </div>
      <div class="cmp-divider" data-only="slider"><span class="cmp-divider-grip" aria-hidden="true">${icon('chevrons-lr')}</span></div>
    </div>
    <p class="visually-hidden" id="cmp-stage-hint"></p>
  `;

  const $ = (sel) => root.querySelector(sel);
  const stage = $('.cmp-stage');
  const inner = $('.cmp-stage-inner');
  const baseHolder = $('.cmp-base-holder');
  const overlayClip = $('.cmp-overlay-clip');
  const diffCanvas = $('.cmp-diff-layer');
  const diffBoxes = $('.cmp-diff-boxes');
  const divider = $('.cmp-divider');
  const hint = $('#cmp-stage-hint');
  const hintTip = $('.cmp-hint-text');
  const zoomLevel = $('.cmp-zoom-level');
  const linkButton = $('[data-action="link"]');
  const frame = (side) => root.querySelector(`.cmp-figure[data-side="${side}"] .cmp-frame`);

  /** Current stage geometry at zoom 1: padding, scale (CSS px per base natural px), base size, stage width. */
  let geo = { pad: 0, vs: 1, w: 0, h: 0, stageW: 0 };
  let tool = 'move'; // overlay view: 'move' | 'pan'
  let spaceHeld = false;
  let linked = true;
  let lastSide = 'left'; // side-by-side frame last zoomed (for the toolbar)

  // --- Zoom ------------------------------------------------------------------

  function showZoom(scale) {
    const value = scale >= 10 ? Math.round(scale) : Math.round(scale * 10) / 10;
    zoomLevel.textContent = `${value}×`;
    zoomLevel.setAttribute('aria-label', `Zoom level ${value} times`);
    $('[data-zoom="in"]').disabled = scale >= MAX_ZOOM - 1e-3;
    $('[data-zoom="out"]').disabled = scale <= MIN_ZOOM + 1e-3;
  }

  const stageZoom = createZoom($('.cmp-stage .cmp-zoom'), {
    bindPointer: false, // routed below, so the overlay drag and panning never compete
    allowDblClick: () => !(store.view === 'overlay' && tool === 'move' && !spaceHeld),
    onChange: ({ scale }) => {
      // Keeps the difference boxes a constant size on screen.
      inner.style.setProperty('--inv-zoom', String(1 / scale));
      if (store.view !== 'side') showZoom(scale);
      if (store.view === 'slider') keepDividerOnScreen();
    },
  });

  // Linked side-by-side zoom is relative: every change of one frame (zoom factor,
  // pan relative to the image size) is applied to the other one. Offsets made
  // while unlinked are therefore kept when linking again.
  const sideState = Object.fromEntries(SIDES.map((side) => [side, { scale: 1, x: 0, y: 0 }]));

  /** Apply the change of frame `from` (from sideState[from] to `next`) to the other frame. */
  function follow(from, next) {
    const to = otherSide(from);
    const a = store.images[from]?.display;
    const b = store.images[to]?.display;
    if (!a?.offsetWidth || !b?.offsetWidth) return;
    const prev = sideState[from];
    const cur = sideState[to];
    const zoom = sideZooms[to];
    zoom.set(
      (cur.scale * next.scale) / prev.scale,
      cur.x + ((next.x - prev.x) * b.offsetWidth) / a.offsetWidth,
      cur.y + ((next.y - prev.y) * b.offsetHeight) / a.offsetHeight,
      { silent: true }
    );
    sideState[to] = { scale: zoom.scale(), ...zoom.pan() };
  }

  const sideZooms = Object.fromEntries(
    SIDES.map((side) => [
      side,
      createZoom(frame(side).querySelector('.cmp-zoom'), {
        allowDblClick: () => false, // double-click opens the image dialog instead
        onChange: ({ scale, x, y }) => {
          if (linked) follow(side, { scale, x, y });
          sideState[side] = { scale, x, y };
          lastSide = side;
          if (store.view === 'side') showZoom(scale);
        },
      }),
    ])
  );

  /** Fit both side-by-side images (silently, so linking does not move them again). */
  function fitSides() {
    for (const side of SIDES) {
      sideZooms[side].reset({ silent: true });
      sideState[side] = { scale: 1, x: 0, y: 0 };
    }
    if (store.view === 'side') showZoom(1);
  }

  /** Zoom controllers the zoom buttons act on (linked: one frame, the other follows). */
  function toolbarTargets() {
    if (store.view !== 'side') return [stageZoom];
    return linked ? [sideZooms[lastSide]] : SIDES.map((side) => sideZooms[side]);
  }

  function resetZoom() {
    stageZoom.reset();
    fitSides();
  }

  function setLinked(value) {
    linked = value;
    linkButton.setAttribute('aria-pressed', String(linked));
  }

  function setTool(value) {
    tool = value;
    for (const button of root.querySelectorAll('[data-tool]')) button.setAttribute('aria-pressed', String(button.dataset.tool === tool));
    updateHint();
    updateCursor();
  }

  root.querySelector('.cmp-viewer-toolbar').addEventListener('click', (e) => {
    const button = e.target.closest('button');
    if (!button) return;
    if (button.dataset.tool) setTool(button.dataset.tool);
    else if (button.dataset.action === 'link') setLinked(!linked);
    else if (button.dataset.zoom === 'fit') store.view === 'side' ? fitSides() : stageZoom.reset();
    else if (button.dataset.zoom === 'in') toolbarTargets().forEach((z) => z.zoomIn());
    else if (button.dataset.zoom === 'out') toolbarTargets().forEach((z) => z.zoomOut());
  });

  // --- Layout ----------------------------------------------------------------

  function computeGeometry() {
    const base = baseImage();
    if (!base) return geo;
    const width = stage.clientWidth || 800;
    const maxH = Math.max(360, Math.round(window.innerHeight * 0.72));
    // Padding lets the overlay be dragged beyond the base edges in overlay view.
    const pad = store.view === 'overlay' ? Math.round(Math.min(width, maxH) * 0.06) : 0;
    const vs = Math.min((width - 2 * pad) / base.natW, (maxH - 2 * pad) / base.natH);
    return { pad, vs, w: base.natW * vs, h: base.natH * vs, stageW: width };
  }

  /** Move the display canvases into the containers of the current view. */
  function placeCanvases() {
    // Remove canvases of a previous pair / view before inserting the current ones.
    for (const container of root.querySelectorAll('.cmp-figure .cmp-zoom, .cmp-base-holder, .cmp-overlay-clip')) container.replaceChildren();
    for (const side of SIDES) {
      const image = store.images[side];
      if (!image) continue;
      const canvas = image.display;
      canvas.className = 'cmp-canvas';
      canvas.removeAttribute('style');
      if (store.view === 'side') {
        frame(side).querySelector('.cmp-zoom').append(canvas);
      } else if (side === store.overlaySide) {
        overlayClip.append(canvas);
      } else {
        baseHolder.append(canvas);
      }
    }
  }

  function updateCaptions() {
    for (const side of SIDES) {
      const image = store.images[side];
      const fig = root.querySelector(`.cmp-figure[data-side="${side}"]`);
      fig.querySelector('.cmp-title').textContent = image.label; // number + title
      fig.querySelector('.cmp-year').textContent = image.year ?? '';
      frame(side).setAttribute('aria-label', `${image.position} image: ${image.label}. Zoomable; press Enter for details.`);
    }
  }

  function updateHint() {
    const text = HINTS[store.view === 'overlay' ? `overlay-${tool}` : store.view];
    if (hint.textContent !== text) {
      hint.textContent = text;
      hintTip.textContent = text;
    }
  }

  /** Base size and stage height of the previous layout (to keep the zoomed region). */
  let lastLayout = null;

  /**
   * Keep the zoomed-in region on screen when the stage layout changes (view switch
   * adds/removes the overlay padding, window resize): same base size on screen and
   * same base point at the stage center.
   */
  function keepZoomedRegion(w, innerH) {
    if (lastLayout && stageZoom.ready() && !stageZoom.isFit() && (lastLayout.w !== w || lastLayout.innerH !== innerH)) {
      const s = stageZoom.scale();
      const t = stageZoom.pan();
      const s2 = clampZoom((s * lastLayout.w) / w);
      stageZoom.set(s2, (s * t.x) / s2, (lastLayout.innerH / 2 - innerH / 2 + s * t.y) / s2);
    }
    lastLayout = { w, innerH };
  }

  /** Filters (adjustments) of the visible canvases. */
  function applyFilters() {
    if (store.view === 'side') {
      for (const side of SIDES) store.images[side].display.style.filter = filterString(store.adjust[side]);
      return;
    }
    baseImage().display.style.filter = store.view === 'diff' ? DIFF_BASE_FILTER : filterString(store.adjust[otherSide(store.overlaySide)]);
    overlayImage().display.style.filter = filterString(store.adjust[store.overlaySide]);
  }

  /** Overlay position, opacity and blend mode (runs on every drag move). */
  function applyOverlay() {
    const overlay = overlayImage();
    const oc = overlay.display;
    const m = multiply(translation(geo.pad, geo.pad), scaling(geo.vs), overlayMatrix(), scaling(overlay.natW / oc.width, overlay.natH / oc.height));
    oc.style.transform = toCssMatrix3d(m);
    oc.style.opacity = store.view === 'overlay' ? String(store.opacity) : '1';
    oc.style.mixBlendMode = store.view === 'overlay' && store.differenceBlend ? 'difference' : 'normal';
  }

  // The slider divider lives in the stage (screen space), not in the zoomed
  // image, so it always spans the visible height and stays on screen. While
  // panning/zooming it keeps its screen position (within the visible part of the
  // base image) and store.divider – the split as a fraction of the base width –
  // follows the image moving underneath.

  /** Horizontal extent of the base image in stage px, computed from the zoom state (no layout read). */
  function baseSpan() {
    const s = stageZoom.scale();
    const cx = geo.stageW / 2;
    const innerLeft = (geo.stageW - geo.w - 2 * geo.pad) / 2;
    return { left: cx + s * (innerLeft + geo.pad - cx + stageZoom.pan().x), width: geo.w * s };
  }

  /** Clamp a stage x to the visible part of the base image and return it as base fraction. */
  function dividerAt(x) {
    const { left, width } = baseSpan();
    const visible = Math.min(Math.max(x, left, 0), left + width, geo.stageW);
    return (visible - left) / width;
  }

  let dividerX = null; // stage px of the divider line

  function keepDividerOnScreen() {
    if (dividerX === null) return;
    const fraction = dividerAt(dividerX);
    if (Math.abs(fraction - store.divider) > 1e-6) setDivider(fraction);
  }

  function applyDivider() {
    overlayClip.style.clipPath = store.view === 'slider' ? `inset(0 0 0 ${geo.pad + store.divider * geo.w}px)` : 'none';
    if (store.view === 'slider') {
      const { left, width } = baseSpan();
      dividerX = left + store.divider * width;
      divider.style.left = `${dividerX}px`;
      stage.setAttribute('aria-label', `Before/after slider: ${baseImage().label} left, ${overlayImage().label} right, divider at ${Math.round(store.divider * 100)}%`);
    }
  }

  /** Sizes and positions for the current view, pair and viewer width. */
  function layout() {
    if (!baseImage()) return;
    updateHint();
    updateCursor();
    applyFilters();

    if (store.view === 'side') {
      for (const side of SIDES) sideZooms[side].ensure();
      showZoom(sideZooms[lastSide].scale());
      return;
    }

    const base = baseImage();
    const overlay = overlayImage();
    stageZoom.ensure();
    geo = computeGeometry();
    const { pad, w, h } = geo;
    inner.style.width = `${w + 2 * pad}px`;
    inner.style.height = `${h + 2 * pad}px`;
    keepZoomedRegion(w, h + 2 * pad);
    showZoom(stageZoom.scale());

    for (const el of [base.display, diffCanvas, diffBoxes]) Object.assign(el.style, { left: `${pad}px`, top: `${pad}px`, width: `${w}px`, height: `${h}px` });
    const oc = overlay.display;
    Object.assign(oc.style, { width: `${oc.width}px`, height: `${oc.height}px`, visibility: store.view === 'diff' ? 'hidden' : 'visible' });
    stage.setAttribute('aria-label', `${overlay.label} over ${base.label}`);
    applyOverlay();
    applyDivider();
  }

  // --- Stage interaction -----------------------------------------------------
  //
  // Pointer events are routed by hand: depending on the view and tool a drag
  // either pans (Panzoom), moves the overlay or moves the slider divider. A second
  // finger always turns the gesture into a pinch zoom of the view.

  const pointers = new Map(); // pointerId -> latest event
  let gesture = null; // 'pan' | 'move' | 'divider'
  let moveStart = null;
  let stageLeft = 0; // stage rect left, fixed during a divider drag

  const setDivider = (value) => update({ divider: Math.min(1, Math.max(0, value)) }, 'divider');
  const movesOverlay = () => store.view === 'overlay' && tool === 'move' && !spaceHeld;
  /** Screen px per base natural px, including the zoom. */
  const screenScale = () => geo.vs * stageZoom.scale();

  const dividerFromEvent = (e) => setDivider(dividerAt(e.clientX - stageLeft));

  function updateCursor() {
    let cursor = 'grab';
    if (gesture === 'pan') cursor = 'grabbing';
    else if (gesture === 'divider') cursor = 'ew-resize';
    else if (gesture === 'move' || movesOverlay()) cursor = 'move';
    stage.style.cursor = cursor;
  }

  function startPan(e) {
    gesture = 'pan';
    stageZoom.handleDown(e);
  }

  stage.addEventListener('pointerdown', (e) => {
    if (!baseImage() || (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1)) return;
    e.preventDefault();
    stage.focus({ preventScroll: true });
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, e);

    if (pointers.size > 1) {
      // Pinch: hand all fingers to Panzoom (ends an overlay / divider drag).
      if (gesture !== 'pan') for (const [id, p] of pointers) if (id !== e.pointerId) stageZoom.handleDown(p);
      startPan(e);
    } else if (e.button === 1 || store.view === 'diff' || (store.view === 'overlay' && !movesOverlay())) {
      startPan(e);
    } else if (store.view === 'slider') {
      if (e.target.closest('.cmp-divider')) {
        gesture = 'divider';
        stageLeft = stage.getBoundingClientRect().left;
        dividerFromEvent(e);
      } else {
        startPan(e);
      }
    } else if (store.view === 'overlay') {
      gesture = 'move';
      moveStart = { x: e.clientX, y: e.clientY, tx: store.manual.tx, ty: store.manual.ty };
    }
    updateCursor();
  });

  stage.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, e);
    if (gesture === 'pan') stageZoom.handleMove(e);
    else if (gesture === 'divider') dividerFromEvent(e);
    else if (gesture === 'move') {
      const k = screenScale();
      setManual({ tx: moveStart.tx + (e.clientX - moveStart.x) / k, ty: moveStart.ty + (e.clientY - moveStart.y) / k });
    }
  });

  function endPointer(e) {
    if (!pointers.delete(e.pointerId)) return;
    if (gesture === 'pan') {
      stageZoom.handleUp(e);
      // One finger of a pinch lifted: continue panning with the remaining one.
      if (pointers.size === 1) stageZoom.handleDown([...pointers.values()][0]);
    }
    if (!pointers.size) gesture = null;
    updateCursor();
  }
  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);
  // No middle-click autoscroll while panning with the middle button.
  stage.addEventListener('mousedown', (e) => e.button === 1 && e.preventDefault());

  stage.addEventListener(
    'wheel',
    (e) => {
      // Ctrl/⌘ + scroll and pinch zoom the view (zoom.js); Shift/Alt only act on the overlay.
      if (!movesOverlay() || e.ctrlKey || e.metaKey) return;
      const delta = e.deltaY || e.deltaX;
      if (e.shiftKey) {
        e.preventDefault();
        setManual({ scale: store.manual.scale * Math.exp(-delta * 0.0015) });
      } else if (e.altKey) {
        e.preventDefault();
        setManual({ rotation: store.manual.rotation + delta * 0.05 });
      }
    },
    { passive: false }
  );

  function overlayKey(e) {
    const big = e.shiftKey;
    const move = (big ? 10 : 1) / screenScale();
    const { tx, ty, scale, rotation } = store.manual;
    const actions = {
      ArrowLeft: () => setManual({ tx: tx - move }),
      ArrowRight: () => setManual({ tx: tx + move }),
      ArrowUp: () => setManual({ ty: ty - move }),
      ArrowDown: () => setManual({ ty: ty + move }),
      '+': () => setManual({ scale: scale * (big ? 1.05 : 1.005) }),
      '=': () => setManual({ scale: scale * (big ? 1.05 : 1.005) }),
      '-': () => setManual({ scale: scale / (big ? 1.05 : 1.005) }),
      _: () => setManual({ scale: scale / 1.05 }),
      '[': () => setManual({ rotation: rotation - 0.1 }),
      ']': () => setManual({ rotation: rotation + 0.1 }),
      '{': () => setManual({ rotation: rotation - 1 }),
      '}': () => setManual({ rotation: rotation + 1 }),
    };
    if (!actions[e.key]) return false;
    actions[e.key]();
    return true;
  }

  stage.addEventListener('keydown', (e) => {
    if (e.key === ' ') {
      e.preventDefault(); // no page scroll; Space = temporary pan tool
      if (!spaceHeld) {
        spaceHeld = true;
        updateCursor();
      }
      return;
    }
    const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
    let handled = false;
    if (plain && store.view === 'overlay' && (e.key === 'v' || e.key === 'V')) {
      setTool('move');
      handled = true;
    } else if (plain && store.view === 'overlay' && (e.key === 'h' || e.key === 'H')) {
      setTool('pan');
      handled = true;
    } else if (store.view === 'slider' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      // 1 % (Shift: 10 %) of the visible width, so the step feels the same at any zoom.
      const step = (e.shiftKey ? 0.1 : 0.01) / stageZoom.scale();
      setDivider(store.divider + (e.key === 'ArrowLeft' ? -step : step));
      handled = true;
    } else if (plain && movesOverlay()) {
      handled = overlayKey(e) || stageZoom.handleKey(e);
    } else {
      handled = stageZoom.handleKey(e);
    }
    if (handled) e.preventDefault();
  });

  const releaseSpace = () => {
    spaceHeld = false;
    updateCursor();
  };
  stage.addEventListener('keyup', (e) => e.key === ' ' && releaseSpace());
  stage.addEventListener('blur', releaseSpace);

  // Side-by-side frames: Panzoom handles the pointer itself; add keyboard zoom and
  // the details dialog (double-click, Enter, or the title button).
  // The other image goes along, so annotations made there can document the comparison.
  const openDialog = (side, { annotate = false } = {}) =>
    store.images[side] && openDetails(store.images[side], { compareWith: store.images[otherSide(side)] ?? null, annotate });
  for (const side of SIDES) {
    const el = frame(side);
    el.addEventListener('pointerdown', () => el.focus({ preventScroll: true }));
    el.addEventListener('dblclick', () => openDialog(side));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault(); // otherwise the same key press activates the dialog's focused Close button
        openDialog(side);
      } else if (e.key === '0' && linked) {
        fitSides();
      } else if (sideZooms[side].handleKey(e)) e.preventDefault();
    });
    root.querySelector(`.cmp-figure[data-side="${side}"] .cmp-title`).addEventListener('click', () => openDialog(side));
  }

  // Layout inputs: the viewer width and the window height. (Observing the viewer's
  // height would loop, since layout() itself changes it.)
  let lastWidth = 0;
  new ResizeObserver(([entry]) => {
    const width = Math.round(entry.contentRect.width);
    if (width === lastWidth) return;
    lastWidth = width;
    requestAnimationFrame(layout);
  }).observe(root);
  let lastHeight = window.innerHeight;
  window.addEventListener('resize', () => {
    if (window.innerHeight === lastHeight) return;
    lastHeight = window.innerHeight;
    requestAnimationFrame(layout);
  });

  subscribe((reason) => {
    if (reason === 'pair') {
      resetZoom();
      lastLayout = null;
    }
    if (reason === 'pair' || reason === 'view' || reason === 'swap') {
      placeCanvases();
      updateCaptions();
      layout();
    } else if (!baseImage() || store.view === 'side') {
      if (reason === 'adjust') applyFilters();
    } else if (reason === 'transform' || reason === 'opacity' || reason === 'blend') {
      applyOverlay();
    } else if (reason === 'divider') {
      applyDivider();
    } else if (reason === 'adjust') {
      applyFilters();
    }
  });

  /** Visible part of `canvas` within `viewport`, as fractions of the image (null if none). */
  function regionOf(canvas, viewport) {
    const r = canvas.getBoundingClientRect();
    const v = viewport.getBoundingClientRect();
    const x0 = Math.max(r.left, v.left);
    const x1 = Math.min(r.right, v.right);
    const y0 = Math.max(r.top, v.top);
    const y1 = Math.min(r.bottom, v.bottom);
    if (!r.width || !r.height || x1 - x0 < 1 || y1 - y0 < 1) return null;
    return { x0: (x0 - r.left) / r.width, y0: (y0 - r.top) / r.height, x1: (x1 - r.left) / r.width, y1: (y1 - r.top) / r.height };
  }

  return {
    element: root,
    /** Open the details dialog of the left or right image; { annotate: true } scrolls to the annotation form. */
    openDialog,
    /** Difference layer: heatmap canvas and container for the region boxes. */
    diffCanvas,
    diffBoxes,
    /**
     * The zoomed-in part of the current view for screenshots, as image fractions:
     * stage views -> region of the base image; side view -> { left, right }.
     * null when nothing is zoomed (= the whole view).
     */
    visibleRegion() {
      if (store.view === 'side') {
        if (SIDES.every((side) => sideZooms[side].isFit())) return null;
        return Object.fromEntries(SIDES.map((side) => [side, regionOf(store.images[side].display, frame(side))]));
      }
      return stageZoom.isFit() ? null : regionOf(baseImage().display, stage);
    },
  };
}
