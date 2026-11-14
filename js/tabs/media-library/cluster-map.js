// Similarity map of the Media Library (view "Map"): every image as a point, placed so that
// visually similar images lie close together (UMAP of the SigLIP 2 embeddings), coloured by
// cluster with a keyword label per cluster. Data: data/cluster-map.json and the background
// data/cluster-map-bg.png, built by scripts/build_cluster_map.py. Positions, clusters and
// labels are machine-generated and unreviewed.
//
// Works that match the filters are coloured, the others stay as faint gray points. Hover
// shows the thumbnail; click selects, double-click opens the details (like tiles and rows);
// the lasso / box tools add all shown works inside to the selection.
// Plotly is lazy-loaded the first time the view is shown.

import { escapeHtml, imageUrl } from '../../lib/catalog.js';
import { isCropping } from '../../lib/print-area.js';
import { loadPlotly } from '../../lib/plotly.js';
import { infoTip } from '../../lib/ui/info.js';
import { addToSelection, isSelected, setSelected } from '../../state.js';

export const CLUSTER_MAP_URL = 'data/cluster-map.json';

const NOISE_COLOR = '#8f8c86';   // shown works outside every cluster
const OTHER_COLOR = '#dcd9d2';   // works hidden by the filters
const SELECTED_COLOR = '#1f1f1f';
const DOUBLE_CLICK_MS = 400;
const LABEL_CHAR_W = 6.2;  // px per character of an 11 px label (estimate for collision tests)
const LABEL_HALF_H = 8;
const fmt = (n) => n.toLocaleString('en-US');

// Help text of the "i" button above the map (the counts are filled in once the data is loaded).
const aboutText = (nClusters = 'The') => '<b>Similar images lie close together.</b> '
  + 'Positions come from image embeddings (SigLIP 2, reduced to 2D with UMAP). '
  + `${nClusters} clusters (HDBSCAN) are coloured and named with keywords; gray points belong to no cluster. `
  + 'Colours only tell neighbouring clusters apart; the labels name them. '
  + 'Positions, clusters and labels were computed by models and are not reviewed.<br><br>'
  + '<b>Scroll</b> to zoom, drag to pan, house icon to reset. <b>Click</b> a point to select the work, '
  + '<b>double-click</b> for its details. The box and lasso tools (top right) select all coloured points inside. '
  + 'Works hidden by the filters stay as light gray points.';

let dataPromise = null;
function loadMapData() {
  if (!dataPromise) {
    dataPromise = fetch(CLUSTER_MAP_URL).then((res) => {
      if (!res.ok) throw new Error(`${CLUSTER_MAP_URL}: HTTP ${res.status}`);
      return res.json();
    });
    dataPromise.catch(() => { dataPromise = null; }); // allow a retry
  }
  return dataPromise;
}

export function createClusterMap(container, { onOpen }) {
  container.innerHTML = `
    <div class="ml-map-bar">
      <p class="ml-map-note"><span class="badge badge-machine">machine-generated</span>${infoTip(aboutText(), 'About the similarity map')}</p>
      <p class="ml-map-missing" hidden></p>
      <label class="ml-map-labels"><input type="checkbox" checked> Cluster labels</label>
    </div>
    <div class="ml-map-wrap">
      <div class="ml-map-plot" role="img" aria-label="Similarity map of the works"></div>
      <div class="ml-map-tip" hidden></div>
      <p class="ml-map-status" aria-live="polite">Loading map…</p>
    </div>`;
  const wrap = container.querySelector('.ml-map-wrap');
  const plot = container.querySelector('.ml-map-plot');
  const tip = container.querySelector('.ml-map-tip');
  const status = container.querySelector('.ml-map-status');
  const note = container.querySelector('.ml-map-note');
  const missingNote = container.querySelector('.ml-map-missing');
  const labelsBox = container.querySelector('.ml-map-labels input');

  let data = null;          // cluster-map.json
  let Plotly = null;
  let byImg = new Map();    // img -> point index
  let records = [];         // works that match the filters
  let shown = [];           // per point of the "shown" trace: { r, p } (record, point index)
  let areas = new Map();    // img -> print-area box (thumbnail crop)
  let started = false;
  let visible = false;
  let lastClick = null;     // { i, t, undo } for double-click detection
  let filtered = false;     // do the filters hide part of the map?

  // Plotly must not start a render while another one runs on the same element: queue them.
  let queue = Promise.resolve();
  const enqueue = (fn) => { queue = queue.then(fn).catch((err) => console.error('Map:', err)); return queue; };

  // Scrolling zooms the map (Plotly scrollZoom), like a geographic map. The map fills its pane,
  // so there is no page to scroll here. Hide the hover card while zooming.
  wrap.addEventListener('wheel', () => { tip.hidden = true; }, { capture: true, passive: true });

  const relabel = () => enqueue(() => Plotly?.relayout(plot, { annotations: annotations() }));
  labelsBox.addEventListener('change', relabel);

  async function start() {
    started = true;
    try {
      [data, Plotly] = await Promise.all([loadMapData(), loadPlotly()]);
    } catch (err) {
      status.textContent = `Could not load the map (${err.message}).`;
      started = false;
      return;
    }
    byImg = new Map(data.points.img.map((img, i) => [img, i]));
    status.hidden = true;
    note.querySelector('.info-pop').innerHTML = aboutText(data.clusters.length);
    await enqueue(draw);
    relabel(); // the first draw fixed the axis ranges (aspect ratio): place the labels for them
    bindEvents();
    new ResizeObserver(() => {
      if (!visible || !plot.offsetWidth) return;
      enqueue(() => Plotly.Plots.resize(plot));
      relabel();
    }).observe(wrap);
  }

  /**
   * Cluster labels for the current zoom: larger clusters first, a label that would overlap
   * one already placed is left out (zoom in to see it).
   */
  function annotations() {
    if (!labelsBox.checked || !data) return [];
    const [ex0, ey0, ex1, ey1] = data.extent;
    const xr = plot.layout?.xaxis?.range ?? [ex0, ex1];
    const yr = plot.layout?.yaxis?.range ?? [ey0, ey1];
    const w = plot.clientWidth || 1;
    const h = plot.clientHeight || 1;
    const kx = w / (xr[1] - xr[0]);
    const ky = h / (yr[1] - yr[0]);
    const placed = [];
    const out = [];
    for (const c of [...data.clusters].sort((a, b) => b.n - a.n)) {
      const cx = (c.x - xr[0]) * kx;
      const cy = (yr[1] - c.y) * ky;
      if (cx < 0 || cx > w || cy < 0 || cy > h) continue;
      const hw = c.label.length * LABEL_CHAR_W / 2 + 4;  // estimated half width in px
      const box = [cx - hw, cy - LABEL_HALF_H, cx + hw, cy + LABEL_HALF_H];
      if (placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
      placed.push(box);
      out.push({
        x: c.x, y: c.y, text: escapeHtml(c.label), showarrow: false,
        font: { size: 11, color: filtered ? '#6b6b6b' : '#1f1f1f' },
        bgcolor: 'rgba(255,255,255,0.6)', borderpad: 1, captureevents: false,
      });
    }
    return out;
  }

  function traces() {
    const { x, y, c } = data.points;
    const inFilter = new Set();
    shown = [];
    for (const r of records) {
      const p = r.img ? byImg.get(r.img) : undefined;
      if (p === undefined || inFilter.has(p)) continue;
      inFilter.add(p);
      shown.push({ r, p });
    }
    const colorOf = (cl) => (cl >= 0 ? data.clusters[cl].color : NOISE_COLOR);
    const others = [];
    for (let p = 0; p < x.length; p++) if (!inFilter.has(p)) others.push(p);
    filtered = others.length > 0;
    const missing = records.length - shown.length;
    missingNote.hidden = missing === 0;
    missingNote.textContent = `${fmt(missing)} shown work${missing === 1 ? '' : 's'} not on the map`;
    missingNote.title = 'These works have no image embedding (no image in the embedding set).';
    return [
      {
        type: 'scattergl', mode: 'markers', name: 'other', hoverinfo: 'skip',
        x: others.map((p) => x[p]), y: others.map((p) => y[p]),
        marker: { size: 3, color: OTHER_COLOR },
      },
      {
        type: 'scattergl', mode: 'markers', name: 'shown', hoverinfo: 'none',
        x: shown.map((s) => x[s.p]), y: shown.map((s) => y[s.p]),
        // filtered: fewer points, make them stand out from the gray ones
        marker: {
          size: filtered ? 7 : 5, color: shown.map((s) => colorOf(c[s.p])), opacity: 0.9,
          line: filtered ? { width: 1, color: '#ffffff' } : { width: 0 },
        },
        selected: { marker: { opacity: 0.9 } }, unselected: { marker: { opacity: 0.9 } },
      },
      {
        type: 'scattergl', mode: 'markers', name: 'selected', hoverinfo: 'skip',
        ...selectedXY(),
        // A plain circle with transparent fill and an outline, not symbol 'circle-open': scattergl
        // draws symbols from a texture that smears into noisy black squares on some GPUs.
        marker: { size: 10, color: 'rgba(0,0,0,0)', line: { width: 1.5, color: SELECTED_COLOR } },
      },
    ];
  }

  /** Positions of the selected works among the shown ones (rings on top of their points). */
  function selectedXY() {
    const { x, y } = data.points;
    const sel = shown.filter((s) => isSelected(s.r.id));
    return { x: sel.map((s) => x[s.p]), y: sel.map((s) => y[s.p]) };
  }

  function layout() {
    const [x0, y0, x1, y1] = data.extent;
    return {
      margin: { l: 0, r: 0, t: 0, b: 0 },
      paper_bgcolor: '#ffffff', plot_bgcolor: '#ffffff',
      xaxis: { range: [x0, x1], visible: false, showgrid: false, zeroline: false },
      yaxis: { range: [y0, y1], visible: false, showgrid: false, zeroline: false, scaleanchor: 'x' },
      showlegend: false,
      dragmode: 'pan',
      hovermode: 'closest',
      hoverdistance: 8,
      uirevision: 'map', // keep zoom and pan when the filters change
      images: [{
        source: data.background, xref: 'x', yref: 'y', x: x0, y: y1,
        sizex: x1 - x0, sizey: y1 - y0, xanchor: 'left', yanchor: 'top',
        sizing: 'stretch', layer: 'below', opacity: filtered ? 0.45 : 1,
      }],
      annotations: annotations(),
    };
  }

  async function draw() {
    await Plotly.react(plot, traces(), layout(), {
      displaylogo: false,
      scrollZoom: true,
      doubleClick: false, // double-click on a point opens its details
      modeBarButtonsToRemove: ['toImage', 'zoomIn2d', 'zoomOut2d', 'autoScale2d'],
    });
  }

  function bindEvents() {
    plot.on('plotly_hover', (ev) => {
      const pt = ev.points.find((q) => q.curveNumber === 1);
      if (!pt) return;
      showTip(shown[pt.pointIndex], ev.event);
    });
    plot.on('plotly_unhover', () => { tip.hidden = true; });
    plot.on('plotly_relayouting', () => { tip.hidden = true; });
    // after zoom / pan (not after our own label update): place the labels again
    plot.on('plotly_relayout', (ev) => {
      if (Object.keys(ev ?? {}).some((k) => k.startsWith('xaxis') || k.startsWith('yaxis'))) relabel();
    });

    plot.on('plotly_click', (ev) => {
      const pt = ev.points.find((q) => q.curveNumber === 1);
      if (!pt) return;
      const i = pt.pointIndex;
      const now = performance.now();
      if (lastClick && lastClick.i === i && now - lastClick.t < DOUBLE_CLICK_MS) {
        lastClick.undo();
        lastClick = null;
        tip.hidden = true;
        onOpen(shown.map((s) => s.r), i);
        return;
      }
      const { r } = shown[i];
      const was = isSelected(r.id);
      setSelected(r.id, !was);
      lastClick = { i, t: now, undo: () => setSelected(r.id, was) };
    });

    // Lasso / box: add the shown works inside to the selection, then clear Plotly's own selection.
    plot.on('plotly_selected', (ev) => {
      const ids = (ev?.points ?? []).filter((q) => q.curveNumber === 1).map((q) => shown[q.pointIndex].r.id);
      if (ids.length) addToSelection(ids);
      enqueue(async () => {
        await Plotly.restyle(plot, { selectedpoints: [null] }, [1]);
        await Plotly.relayout(plot, { selections: [] }); // remove the drawn lasso / box
      });
    });
  }

  function showTip(item, mouse) {
    if (!item) return;
    const { r, p } = item;
    const cl = data.points.c[p];
    const cluster = cl >= 0 ? escapeHtml(data.clusters[cl].label) : 'no cluster';
    tip.innerHTML = `
      ${thumbHtml(r)}
      <div class="ml-map-tip-title">${r.n ? `No. ${escapeHtml(r.n)} · ` : ''}${escapeHtml(r.t)}</div>
      <div class="ml-map-tip-meta"><span class="swatch" style="background:${cl >= 0 ? data.clusters[cl].color : NOISE_COLOR}"></span>${cluster}</div>
      ${isSelected(r.id) ? '<div class="ml-map-tip-meta">Selected</div>' : ''}`;
    tip.hidden = false;
    const box = wrap.getBoundingClientRect();
    const mx = (mouse?.clientX ?? box.left) - box.left;
    const my = (mouse?.clientY ?? box.top) - box.top;
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const left = mx + 16 + w > box.width ? mx - 16 - w : mx + 16;
    const top = Math.min(Math.max(4, my - h / 2), box.height - h - 4);
    tip.style.left = `${Math.max(4, left)}px`;
    tip.style.top = `${Math.max(4, top)}px`;
  }

  /** Thumbnail, cropped to the print area where there is a box (as in the mosaic). */
  function thumbHtml(r) {
    const src = imageUrl(r, 300);
    if (!src) return '';
    const box = r.img ? areas.get(r.img) : null;
    if (!isCropping(box)) return `<div class="ml-map-tip-img"><img src="${src}" alt=""></div>`;
    const bw = box.x1 - box.x0;
    const bh = box.y1 - box.y0;
    const ratio = (r.ar || 4 / 3) * (bw / bh);
    const style = `width:${(100 / bw).toFixed(3)}%;left:${(-box.x0 / bw * 100).toFixed(3)}%;top:${(-box.y0 / bh * 100).toFixed(3)}%`;
    return `<div class="ml-map-tip-img cropped" style="aspect-ratio:${ratio.toFixed(4)}"><img src="${src}" alt="" style="${style}"></div>`;
  }

  return {
    /** records: the filtered works (those with an embedding are coloured). */
    update(recs) {
      records = recs;
      if (data) enqueue(draw);
    },
    /** Print-area boxes (Map img -> box) for the hover thumbnails. */
    setPrintAreas(map) { areas = map; },
    /** The selection changed: redraw only the selection rings. */
    refresh() {
      if (!data || !plot.data) return;
      enqueue(() => {
        const { x, y } = selectedXY();
        return Plotly.restyle(plot, { x: [x], y: [y] }, [2]);
      });
    },
    /** Called when the view becomes visible (Plotly needs a sized container). */
    show() {
      visible = true;
      if (!started) start();
      else if (data) enqueue(() => Plotly.Plots.resize(plot));
    },
    hide() { visible = false; tip.hidden = true; },
  };
}
