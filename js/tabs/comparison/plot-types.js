// Plot type registry for the color analysis section.
//
// To add a plot type, append an object to PLOT_TYPES:
//   {
//     id: 'my-plot',                 // stable id (used in the <select>)
//     label: 'My plot',              // shown in the plot type chooser
//     description: '…',              // one sentence shown under the chooser
//     build(series, options) {       // returns { data, layout } for Plotly.react
//       // series:  [{ label, color, symbol, image, palette, cluster, selected }] — one
//       //          entry, or two in compare mode. image = result of analyzeImage()
//       //          (see pixels.js); palette = the palette shown below the plot;
//       //          cluster[pixel] = its palette index; selected = palette index
//       //          picked in the palette (-1 = none)
//       // options: { sampleSize, allImages, colorMode }  allImages = every loaded
//       //          image, so axis ranges stay fixed between single and compare mode;
//       //          colorMode = 'pixel' | 'palette'
//     },
//   }
// Point colors (seriesTraces): in 'pixel' mode single-image plots use the pixels'
// own colors and compare mode uses one series color per image; in 'palette' mode
// every point gets the color of its nearest palette color and the palette colors
// themselves are drawn as outlined markers sized by their share (as in
// tests/color_outputs.py). A selected palette color is highlighted in both modes:
// its points stay colored, all others turn gray.

import { rgbCss, rgbHex, rgbToHsv, rgbToXy, hsvToRgb, labToRgb } from './color.js';
import { DIAGRAM_RANGE, SPECTRAL_LOCUS, SRGB_GAMUT, horseshoeImage } from './cie1931.js';
import { nearestPaletteIndex } from './palette.js';
import { sampleIndices } from './pixels.js';

const INK = '#1f1f1f';
const INK_MUTED = '#52514e';
const GRID = '#e4e1da';

const BASE_LAYOUT = {
  height: 680,
  margin: { l: 50, r: 20, t: 20, b: 50 },
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: 'rgba(0,0,0,0)',
  font: { family: 'system-ui, -apple-system, "Segoe UI", sans-serif', size: 13, color: INK },
  hoverlabel: { font: { family: 'system-ui, sans-serif', size: 12 } },
  legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom', itemsizing: 'constant' },
};

const axis3d = (title, extra = {}) => ({
  title: { text: title },
  gridcolor: GRID,
  zerolinecolor: '#c9c5bc',
  backgroundcolor: 'rgba(0,0,0,0)',
  showspikes: false,
  ...extra,
});

const MUTED = '#a8a49b';

const isCompare = (series) => series.length > 1;
const pick = (values, ids) => ids.map((i) => values[i]);

/**
 * Point traces of one series.
 * @param pts  { x, y, z?, custom, css, cluster } – arrays per point; css = the
 *             point's own color, cluster = its palette index
 * @param opts { type, size (number or per-point array), line, hovertemplate,
 *             colorMode, centers: per palette color { x, y, z? } or null }
 */
function seriesTraces(series, s, pts, { type, size, line, hovertemplate, colorMode, centers }) {
  const compare = isCompare(series);
  const paletteMode = colorMode === 'palette' && s.palette?.length > 0;
  const colorOf = paletteMode ? (i) => s.palette[pts.cluster[i]].hex : compare ? () => s.color : (i) => pts.css[i];
  const symbol = compare ? s.symbol : 'circle';
  const sizeOf = (ids) => (Array.isArray(size) ? pick(size, ids) : size);
  const coords = (ids) => ({ x: pick(pts.x, ids), y: pick(pts.y, ids), ...(pts.z && { z: pick(pts.z, ids) }), customdata: pick(pts.custom, ids) });
  const all = pts.x.map((_, i) => i);
  const selected = s.palette?.[s.selected] ? s.selected : -1;
  const traces = [];

  if (selected < 0) {
    traces.push({
      type,
      mode: 'markers',
      name: s.label,
      ...coords(all),
      marker: { size: sizeOf(all), color: all.map(colorOf), symbol, opacity: compare && !paletteMode ? 0.55 : 0.9, line },
      hovertemplate,
    });
  } else {
    const chosen = all.filter((i) => pts.cluster[i] === selected);
    const rest = all.filter((i) => pts.cluster[i] !== selected);
    traces.push(
      {
        type,
        mode: 'markers',
        name: `${s.label} – other colors`,
        showlegend: false,
        ...coords(rest),
        marker: { size: sizeOf(rest), color: MUTED, symbol, opacity: 0.12 },
        hoverinfo: 'skip',
      },
      {
        type,
        mode: 'markers',
        name: `${s.label} – ${s.palette[selected].hex}`,
        ...coords(chosen),
        marker: { size: sizeOf(chosen), color: chosen.map(colorOf), symbol, opacity: 0.95, line },
        hovertemplate,
      }
    );
  }
  if (paletteMode && centers) traces.push(paletteCenters(s, centers, type, symbol, selected));
  return traces;
}

/** The palette colors as outlined markers, sized by their share (selected one larger). */
function paletteCenters(s, centers, type, symbol, selected) {
  const ids = centers.map((p, i) => (p ? i : -1)).filter((i) => i >= 0);
  return {
    type,
    mode: 'markers',
    name: `${s.label} palette`,
    showlegend: false,
    x: ids.map((i) => centers[i].x),
    y: ids.map((i) => centers[i].y),
    ...(type === 'scatter3d' && { z: ids.map((i) => centers[i].z) }),
    customdata: ids.map((i) => [s.palette[i].hex, (s.palette[i].share * 100).toFixed(1)]),
    marker: {
      size: ids.map((i) => (8 + 30 * Math.sqrt(s.palette[i].share)) * (i === selected ? 1.4 : 1)),
      sizemode: 'diameter',
      color: ids.map((i) => s.palette[i].hex),
      symbol,
      opacity: 1,
      line: { color: INK, width: 2 },
    },
    hovertemplate: `Palette color %{customdata[0]} · %{customdata[1]} % of pixels<extra>${s.label}</extra>`,
  };
}

/** Sampled pixels of an image with their sRGB values and css/hex colors. */
function samplePixels(image, sampleSize) {
  const idx = sampleIndices(image, sampleSize);
  const out = { idx, css: new Array(idx.length), hex: new Array(idx.length) };
  for (let i = 0; i < idx.length; i++) {
    const p = idx[i] * 3;
    const r = image.rgb[p];
    const g = image.rgb[p + 1];
    const b = image.rgb[p + 2];
    out.css[i] = rgbCss(r, g, b);
    out.hex[i] = rgbHex(r, g, b);
  }
  return out;
}

// ---------------------------------------------------------------------------
// CIE 1931 xy chromaticity diagram

const cieXy = {
  id: 'cie-xy',
  label: 'CIE 1931 xy chromaticity',
  description:
    'Hue and saturation of each sampled pixel, independent of brightness. The outline is the spectral locus (wavelengths in nm); the dashed triangle is the sRGB gamut.',
  build(series, { sampleSize, colorMode }) {
    const locusX = SPECTRAL_LOCUS.map((p) => p.x);
    const locusY = SPECTRAL_LOCUS.map((p) => p.y);
    const labelled = SPECTRAL_LOCUS.filter((p) => [460, 480, 490, 500, 510, 520, 540, 560, 580, 600, 620].includes(p.nm));
    const { r, g, b, white } = SRGB_GAMUT;

    const data = [
      {
        type: 'scatter',
        mode: 'lines',
        x: [...locusX, locusX[0]],
        y: [...locusY, locusY[0]],
        line: { color: INK_MUTED, width: 1.5 },
        hoverinfo: 'skip',
        showlegend: false,
      },
      {
        type: 'scatter',
        mode: 'markers+text',
        x: labelled.map((p) => p.x),
        y: labelled.map((p) => p.y),
        text: labelled.map((p) => String(p.nm)),
        textposition: labelled.map((p) => (p.nm <= 500 ? 'middle left' : p.nm <= 540 ? 'top center' : 'middle right')),
        textfont: { size: 11, color: INK_MUTED },
        marker: { size: 4, color: INK_MUTED },
        hoverinfo: 'skip',
        showlegend: false,
      },
      {
        type: 'scatter',
        mode: 'lines',
        x: [r[0], g[0], b[0], r[0]],
        y: [r[1], g[1], b[1], r[1]],
        line: { color: INK_MUTED, width: 1.5, dash: 'dash' },
        hoverinfo: 'skip',
        showlegend: false,
      },
      {
        type: 'scatter',
        mode: 'markers+text',
        x: [white[0]],
        y: [white[1]],
        text: ['D65'],
        textposition: 'bottom right',
        textfont: { size: 11, color: INK_MUTED },
        marker: { size: 7, color: '#ffffff', line: { color: INK, width: 1.5 } },
        hoverinfo: 'skip',
        showlegend: false,
      },
    ];

    for (const s of series) {
      const px = samplePixels(s.image, sampleSize);
      const pts = { x: [], y: [], custom: [], css: [], cluster: [] };
      for (let i = 0; i < px.idx.length; i++) {
        const p = px.idx[i] * 3;
        const xy = rgbToXy(s.image.rgb[p], s.image.rgb[p + 1], s.image.rgb[p + 2]);
        if (!xy) continue; // pure black has no chromaticity
        pts.x.push(xy[0]);
        pts.y.push(xy[1]);
        pts.custom.push(px.hex[i]);
        pts.css.push(px.css[i]);
        pts.cluster.push(s.cluster?.[px.idx[i]]);
      }
      const centers = s.palette?.map((c) => {
        const xy = rgbToXy(...c.rgb);
        return xy && { x: xy[0], y: xy[1] };
      });
      data.push(
        ...seriesTraces(series, s, pts, {
          type: 'scattergl',
          size: 5,
          line: isCompare(series) ? undefined : { width: 0.5, color: 'rgba(0,0,0,0.45)' },
          hovertemplate: `%{customdata}<br>x %{x:.4f}, y %{y:.4f}<extra>${s.label}</extra>`,
          colorMode,
          centers,
        })
      );
    }

    const layout = {
      ...BASE_LAYOUT,
      showlegend: isCompare(series),
      // Copies: Plotly writes zoom changes into the range arrays it is given, which
      // would otherwise move the shared DIAGRAM_RANGE (and the background image).
      xaxis: { title: { text: 'x' }, range: [...DIAGRAM_RANGE.x], gridcolor: GRID, zeroline: false, constrain: 'domain' },
      yaxis: { title: { text: 'y' }, range: [...DIAGRAM_RANGE.y], gridcolor: GRID, zeroline: false, scaleanchor: 'x', scaleratio: 1 },
      images: [
        {
          source: horseshoeImage(),
          xref: 'x',
          yref: 'y',
          x: DIAGRAM_RANGE.x[0],
          y: DIAGRAM_RANGE.y[1],
          sizex: DIAGRAM_RANGE.x[1] - DIAGRAM_RANGE.x[0],
          sizey: DIAGRAM_RANGE.y[1] - DIAGRAM_RANGE.y[0],
          sizing: 'stretch',
          opacity: 0.4,
          layer: 'below',
        },
      ],
    };
    return { data, layout };
  },
};

// ---------------------------------------------------------------------------
// CIE Lab 3D scatter of pixel colors

// Symmetric a* and b* axis range (rounded up to 10) covering every pixel of every
// loaded image, so switching between single and compare mode keeps the same scale.
const maxAbCache = new WeakMap();
function abRange(images) {
  let max = 30;
  for (const image of images) {
    if (!maxAbCache.has(image)) {
      let m = 0;
      for (let i = 0; i < image.n; i++) {
        m = Math.max(m, Math.abs(image.lab[i * 3 + 1]), Math.abs(image.lab[i * 3 + 2]));
      }
      maxAbCache.set(image, m);
    }
    max = Math.max(max, maxAbCache.get(image));
  }
  max = Math.ceil(max / 10) * 10;
  return [-max, max];
}

const neutralAxis = {
  type: 'scatter3d',
  mode: 'lines',
  x: [0, 0],
  y: [0, 0],
  z: [0, 100],
  line: { color: INK_MUTED, width: 3 },
  hoverinfo: 'skip',
  showlegend: false,
};

/** Palette colors positioned in Lab (x = a*, y = b*, z = L*). */
const labCenters = (s) => s.palette?.map((c) => ({ x: c.lab[1], y: c.lab[2], z: c.lab[0] }));

function labScene(range) {
  return {
    xaxis: axis3d('a* (green → red)', { range }),
    yaxis: axis3d('b* (blue → yellow)', { range }),
    zaxis: axis3d('L* (lightness)', { range: [0, 100] }),
    aspectmode: 'cube',
    camera: { eye: { x: 1.35, y: -1.35, z: 0.75 } },
  };
}

const labScatter = {
  id: 'lab-3d',
  label: 'CIE Lab 3D – pixel colors',
  description:
    'Each sampled pixel placed in CIE L*a*b* space (perceptually uniform). The vertical line is the neutral gray axis. Drag to rotate, scroll to zoom.',
  build(series, { sampleSize, allImages, colorMode }) {
    const traces = series.flatMap((s) => {
      const px = samplePixels(s.image, sampleSize);
      const n = px.idx.length;
      const pts = { x: new Array(n), y: new Array(n), z: new Array(n), custom: px.hex, css: px.css, cluster: new Array(n) };
      for (let i = 0; i < n; i++) {
        const p = px.idx[i] * 3;
        pts.z[i] = s.image.lab[p];
        pts.x[i] = s.image.lab[p + 1];
        pts.y[i] = s.image.lab[p + 2];
        pts.cluster[i] = s.cluster?.[px.idx[i]];
      }
      return seriesTraces(series, s, pts, {
        type: 'scatter3d',
        size: 2.5,
        hovertemplate: `%{customdata}<br>L* %{z:.1f}, a* %{x:.1f}, b* %{y:.1f}<extra>${s.label}</extra>`,
        colorMode,
        centers: labCenters(s),
      });
    });
    const range = abRange(allImages);
    return {
      data: [neutralAxis, ...traces],
      layout: { ...BASE_LAYOUT, showlegend: isCompare(series), scene: labScene(range) },
    };
  },
};

// ---------------------------------------------------------------------------
// CIE Lab 3D color frequency

const BIN = 5; // Lab units per bin edge
const BINS_AB = Math.ceil(256 / BIN); // a*, b* in [-128, 128)
const BINS_L = Math.ceil(101 / BIN);
const MAX_BINS_SHOWN = 800;

/** Histogram of all analysed pixels in Lab bins; returns the most frequent bins. */
function labHistogram(image) {
  const size = BINS_L * BINS_AB * BINS_AB;
  const count = new Uint32Array(size);
  const sumL = new Float64Array(size);
  const sumA = new Float64Array(size);
  const sumB = new Float64Array(size);
  const clampBin = (v, max) => Math.min(max - 1, Math.max(0, Math.floor(v)));
  for (let i = 0; i < image.n; i++) {
    const L = image.lab[i * 3];
    const a = image.lab[i * 3 + 1];
    const b = image.lab[i * 3 + 2];
    const key =
      clampBin(L / BIN, BINS_L) * BINS_AB * BINS_AB +
      clampBin((a + 128) / BIN, BINS_AB) * BINS_AB +
      clampBin((b + 128) / BIN, BINS_AB);
    count[key]++;
    sumL[key] += L;
    sumA[key] += a;
    sumB[key] += b;
  }
  const bins = [];
  for (let k = 0; k < size; k++) {
    if (count[k] === 0) continue;
    const c = count[k];
    bins.push({ L: sumL[k] / c, a: sumA[k] / c, b: sumB[k] / c, share: c / image.n });
  }
  bins.sort((x, y) => y.share - x.share);
  return bins.slice(0, MAX_BINS_SHOWN);
}

const histogramCache = new WeakMap();
const cachedHistogram = (image) => {
  if (!histogramCache.has(image)) histogramCache.set(image, labHistogram(image));
  return histogramCache.get(image);
};

const labFrequency = {
  id: 'lab-frequency',
  label: 'CIE Lab 3D – color frequency',
  description: `All pixels grouped into ${BIN}×${BIN}×${BIN} Lab bins; marker size shows how often a color occurs (the ${MAX_BINS_SHOWN} most frequent bins per image). Uses all pixels, not the sample.`,
  build(series, { allImages, colorMode }) {
    const hists = series.map((s) => cachedHistogram(s.image));
    const maxShare = Math.max(...hists.map((h) => h[0]?.share ?? 0)) || 1;
    const traces = series.flatMap((s, si) => {
      const bins = hists[si];
      const pts = {
        x: bins.map((bin) => bin.a),
        y: bins.map((bin) => bin.b),
        z: bins.map((bin) => bin.L),
        custom: bins.map((bin) => [rgbHex(...labToRgb(bin.L, bin.a, bin.b)), (bin.share * 100).toFixed(2)]),
        css: bins.map((bin) => rgbCss(...labToRgb(bin.L, bin.a, bin.b))),
        // A bin belongs to the palette color nearest to its mean color.
        cluster: bins.map((bin) => (s.palette?.length ? nearestPaletteIndex(s.palette, bin.L, bin.a, bin.b) : undefined)),
      };
      return seriesTraces(series, s, pts, {
        type: 'scatter3d',
        size: bins.map((bin) => 3 + 27 * Math.sqrt(bin.share / maxShare)),
        line: { width: 0 },
        hovertemplate: `%{customdata[0]} · %{customdata[1]}% of pixels<br>L* %{z:.1f}, a* %{x:.1f}, b* %{y:.1f}<extra>${s.label}</extra>`,
        colorMode,
        centers: labCenters(s),
      });
    });
    const range = abRange(allImages);
    return {
      data: [neutralAxis, ...traces],
      layout: { ...BASE_LAYOUT, showlegend: isCompare(series), scene: labScene(range) },
    };
  },
};

// ---------------------------------------------------------------------------
// HSV cylinder

const HUE_RING = (() => {
  const h = Array.from({ length: 73 }, (_, i) => i * 5);
  const rad = h.map((d) => (d * Math.PI) / 180);
  return {
    type: 'scatter3d',
    mode: 'lines',
    x: rad.map(Math.cos),
    y: rad.map(Math.sin),
    z: h.map(() => 1),
    line: { width: 6, color: h.map((d) => rgbCss(...hsvToRgb(d % 360, 1, 1))) },
    hoverinfo: 'skip',
    showlegend: false,
  };
})();

const hsvCylinder = {
  id: 'hsv-3d',
  label: 'HSV cylinder 3D',
  description:
    'Pixels in the HSV cylinder: angle = hue (see the colored ring at the top), distance from the center = saturation, height = value (brightness).',
  build(series, { sampleSize, colorMode }) {
    const hsvPoint = (r, g, b) => {
      const [h, sat, v] = rgbToHsv(r, g, b);
      const rad = (h * Math.PI) / 180;
      return { x: sat * Math.cos(rad), y: sat * Math.sin(rad), z: v, h, sat, v };
    };
    const traces = series.flatMap((s) => {
      const px = samplePixels(s.image, sampleSize);
      const n = px.idx.length;
      const pts = { x: new Array(n), y: new Array(n), z: new Array(n), custom: new Array(n), css: px.css, cluster: new Array(n) };
      for (let i = 0; i < n; i++) {
        const p = px.idx[i] * 3;
        const q = hsvPoint(s.image.rgb[p], s.image.rgb[p + 1], s.image.rgb[p + 2]);
        pts.x[i] = q.x;
        pts.y[i] = q.y;
        pts.z[i] = q.z;
        pts.custom[i] = [px.hex[i], q.h.toFixed(0), (q.sat * 100).toFixed(0), (q.v * 100).toFixed(0)];
        pts.cluster[i] = s.cluster?.[px.idx[i]];
      }
      return seriesTraces(series, s, pts, {
        type: 'scatter3d',
        size: 2.5,
        hovertemplate: `%{customdata[0]}<br>H %{customdata[1]}°, S %{customdata[2]}%, V %{customdata[3]}%<extra>${s.label}</extra>`,
        colorMode,
        centers: s.palette?.map((c) => hsvPoint(...c.rgb)),
      });
    });
    return {
      data: [HUE_RING, ...traces],
      layout: {
        ...BASE_LAYOUT,
        showlegend: isCompare(series),
        scene: {
          xaxis: axis3d('S · cos(H)', { range: [-1.05, 1.05] }),
          yaxis: axis3d('S · sin(H)', { range: [-1.05, 1.05] }),
          zaxis: axis3d('V (value)', { range: [0, 1.05] }),
          aspectmode: 'manual',
          aspectratio: { x: 1, y: 1, z: 0.8 },
          camera: { eye: { x: 1.3, y: -1.3, z: 0.85 } },
        },
      },
    };
  },
};

export const PLOT_TYPES = [cieXy, labScatter, labFrequency, hsvCylinder];
