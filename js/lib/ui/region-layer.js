// Rectangles on an image inside a zoomable viewport (details dialog): shows the regions of
// annotations and lets the user draw a new one.
//
// Regions are fractions { x, y, w, h } of the whole image (the scan). `frame` is the part
// of the scan the shown image covers, as fractions { x0, y0, x1, y1 }: the comparison tab
// shows photochroms cropped to the print, other tabs the whole scan.
//
// The layer is a sibling of the <img> inside the zoomed element and is placed over it with
// the image's layout box (offsetLeft/Width…, unaffected by the zoom transform). Pointer
// events on it are excluded from panning (class panzoom-exclude) while drawing.

const FULL = { x0: 0, y0: 0, x1: 1, y1: 1 };
const MIN_SIZE = 0.004; // smaller drags count as clicks
const clamp01 = (v) => Math.min(1, Math.max(0, v));

export function createRegionLayer(content) {
  const layer = document.createElement('div');
  layer.className = 'region-layer';
  layer.hidden = true;
  let img = null;
  let frame = FULL;
  let regions = []; // [{ id, region, label, draft }]
  let active = null;
  let drawing = null; // { resolve, start, box }

  const observer = new ResizeObserver(() => place());

  function place() {
    if (!img?.isConnected || !img.offsetWidth) {
      layer.hidden = true;
      return;
    }
    layer.hidden = false;
    layer.style.left = `${img.offsetLeft}px`;
    layer.style.top = `${img.offsetTop}px`;
    layer.style.width = `${img.offsetWidth}px`;
    layer.style.height = `${img.offsetHeight}px`;
  }

  /** Region of the scan -> CSS box in percent of the shown image. */
  function toCss({ x, y, w, h }) {
    const fw = frame.x1 - frame.x0;
    const fh = frame.y1 - frame.y0;
    return {
      left: `${((x - frame.x0) / fw) * 100}%`,
      top: `${((y - frame.y0) / fh) * 100}%`,
      width: `${(w / fw) * 100}%`,
      height: `${(h / fh) * 100}%`,
    };
  }

  /** Pointer position -> point of the scan (fractions). */
  function scanPoint(e) {
    const r = layer.getBoundingClientRect();
    const fx = clamp01((e.clientX - r.left) / r.width);
    const fy = clamp01((e.clientY - r.top) / r.height);
    return { x: frame.x0 + fx * (frame.x1 - frame.x0), y: frame.y0 + fy * (frame.y1 - frame.y0) };
  }

  function boxElement({ id, region, label, draft }) {
    const el = document.createElement('div');
    el.className = `region-box${draft ? ' is-draft' : ''}${id && id === active ? ' is-active' : ''}`;
    Object.assign(el.style, toCss(region));
    if (label) {
      const tag = document.createElement('span');
      tag.className = 'region-label';
      tag.textContent = label;
      el.append(tag);
    }
    return el;
  }

  function render() {
    const boxes = regions.map(boxElement);
    if (drawing?.box) boxes.push(boxElement({ region: drawing.box, draft: true }));
    layer.replaceChildren(...boxes);
  }

  function finish(region) {
    const done = drawing;
    drawing = null;
    layer.classList.remove('is-drawing', 'panzoom-exclude');
    render();
    done?.resolve(region);
  }

  layer.addEventListener('pointerdown', (e) => {
    if (!drawing || e.button !== 0) return;
    e.preventDefault();
    layer.setPointerCapture(e.pointerId);
    drawing.start = scanPoint(e);
    drawing.box = null;
  });
  layer.addEventListener('pointermove', (e) => {
    if (!drawing?.start || !layer.hasPointerCapture(e.pointerId)) return;
    const p = scanPoint(e);
    const s = drawing.start;
    drawing.box = { x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) };
    render();
  });
  const end = (e) => {
    if (!drawing?.start) return;
    if (layer.hasPointerCapture(e.pointerId)) layer.releasePointerCapture(e.pointerId);
    const box = drawing.box;
    drawing.start = null;
    if (box && box.w >= MIN_SIZE && box.h >= MIN_SIZE) finish(box);
    else {
      drawing.box = null;
      render();
    }
  };
  layer.addEventListener('pointerup', end);
  layer.addEventListener('pointercancel', end);

  return {
    element: layer,

    /** Show the layer over `image` (an <img> inside the zoomed content). */
    attach(image, frameBox = FULL) {
      observer.disconnect();
      img = image;
      frame = frameBox ?? FULL;
      if (!image) {
        layer.remove();
        layer.hidden = true;
        return;
      }
      content.append(layer);
      observer.observe(image);
      observer.observe(content);
      image.addEventListener('load', place);
      place();
      render();
    },

    /** Regions to show: [{ id, region, label, draft }]. */
    setRegions(list) {
      regions = list.filter((r) => r.region);
      render();
    },

    /** Emphasise one region (id) or none (null). */
    highlight(id) {
      active = id;
      for (const [i, el] of [...layer.children].entries()) el.classList.toggle('is-active', Boolean(id) && regions[i]?.id === id);
    },

    /** Let the user drag a rectangle; resolves with the region, or null if cancelled. */
    draw() {
      if (drawing) finish(null);
      layer.classList.add('is-drawing', 'panzoom-exclude');
      return new Promise((resolve) => { drawing = { resolve, start: null, box: null }; });
    },

    cancel() {
      if (drawing) finish(null);
    },

    get isDrawing() {
      return Boolean(drawing);
    },
  };
}
