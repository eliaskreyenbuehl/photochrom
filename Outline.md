# Outline - Photochrom Comparison Tool

## Project setup

Each feature is implemented in a separate feature branch. The main branch is always deployable and contains the latest stable version.

## Architecture

The project is hosted on Github and therefore can only use static HTML. If things cannot be built due to this constraint, don't implement it and tell me about the problem.

The website is optimised for desktop usage and does not have to be mobile friendly.

Use appropriate skills like planning and frontend skills for the implementation.

In a first iteration we use two example images which should be used for the comparison tool (data/sample/gleyre-le-soir_original.jpg and data/sample/gleyre-le-soir_photochrom.jpg).

## Requirements/Ideas

The site consists of 3 tabs:

### Media Library Tab

- **Media Gallery of Picture Set**
- **Image analyses over time** by plotting metadata of all images over time

### Pair matching Tab

- **Use metadata** to match images to pairs
- **Use image similarity** to match images
- **Display pairs as gallery** and add option to open in comparison tab
- **Allow for running custom scripts** on the image data (LLM could produce that script based on user prompt)

### Image Comparison Tab

- **Load 2 images** (for now static urls, later from gallery)
- **Display images side by side** for comparison
- **Display image metadata** (loaded via seperate local csv)
- **Allow for image manipulation** (brightness, saturation, etc.)

tbd for later:

- **Add comments?**
- **Update metadata?**

Image Overlay:

- **Overlay images** Drag the images with mouse and move them
- **Adjust transparency** of overlay
- **Scale/rotate overlay**
- **Auto align/Deskew images** Use e.g. keypoint detection to align images and overlay them
- **Take screenshot** and save as file
- **Overlay slider** to compare images (like before/after sliders)
- **Compare image overlay match percentage** by detecting cropping (one image is only part of another)
- **Show image manipulations** like people added or landscape changed

tbd: crop out the color palette on scans to only analyze the colors of the actual image and not the palette.

Image analysis:

For the following use a plot type chooser where useful and make it possible to implement more later.
Use a plotting library like Plotly or Chart.js for the plots.

- **Visualize ocurring colors on CIE plot**
- **Visualize occurring colors in CIE Lab 3D plot** (show pixel colors in scatters)
- **Visualize color frequency in CIE Lab 3D plot** (frequency of used colors in scattered 3D plot)
- **Visualize in HSV plot?**
- **Compare 3D plots** use one color for each picture and show in 3D scatter plot (plot type selectable)
- **Generate color palette for image**
- **Highlight color palette in image** (highlight the colors of the palette in the image when clicking on it)
- **Option to copy color palette to clipboard** (as hex values or as image)

## Project Structure & How-Tos (for contributors/agents)

Plain static site: vanilla HTML/CSS/JS ES modules, **no build step, no npm**. Runs directly on GitHub Pages.

```
index.html                page shell: header, tab bar (nav.tab-bar), panel container (#tab-panels)
css/styles.css            global styles + CSS variables (--bg, --fg, --muted, --accent, --border)
js/main.js                registers tabs, builds tab buttons/panels, handles switching; exports showTab(id)
js/config.js              SAMPLE_METADATA_URL, SAMPLE_IMAGE_DIR, DEFAULT_PAIR_ID — where the sample pairs come from
js/state.js               shared state between tabs: setComparisonPair() / onComparisonPairChange()
js/lib/csv.js             CSV parser (quoted fields), loadCsvObjects(url)
js/lib/plotly.js          loadPlotly(): lazy-loads Plotly from its CDN on first use
js/lib/opencv.js          loadOpenCV(): lazy-loads OpenCV.js (~10 MB) for auto-align
js/lib/script.js          loadScript(url): inject a classic <script> once (used by the loaders above)
js/lib/download.js        canvasToBlob(), downloadBlob() — saving generated PNGs
js/vendor/panzoom/        Panzoom 4.6.2 (MIT, vendored ES module + license) — pan/zoom of the comparison views
js/tabs/comparison.js     Image Comparison tab: wires the modules below together
js/tabs/comparison/       sub-modules of the comparison tab
  store.js                  tab state (pair, images, view, alignment matrix, adjustments) + update/subscribe
  pairs.js                  comparison pairs from data/sample/sample-metadata.csv
  media.js                  image loading, display canvases, canvas helpers (createCanvas, canvasFrom, imageDataOf)
  viewer.js                 side-by-side / overlay / slider / difference views, view toolbar (Move overlay / Pan tools, zoom), drag + keyboard
  zoom.js                   pan & zoom (pinch, Ctrl/⌘ + scroll, double-click, keys) on top of Panzoom
  controls.js               sidebar: overlay & alignment, overlap %, differences, adjustments
  adjustments.js            per-image adjustments (CSS filter definitions)
  geometry.js               3×3 homography math, polygon clipping, overlap statistics
  align.js                  auto-align/deskew: ORB/AKAZE keypoints + RANSAC homography (OpenCV.js)
  warp.js                   homography pixel warp; warpOverlay() for screenshots and the difference map
  difference.js             structural difference map + regions
  diffview.js               computes the difference map for the viewer (heatmap canvas + HTML region boxes)
  screenshot.js             PNG export of the current view (or the zoomed-in part) incl. credits
  image-dialog.js           dialog with the full (zoomable) image and its metadata, resizable split; opened from the side-by-side view
  metadata.js               metadata of one image (key fields + all fields)
  analysis.js               color analysis section (UI: image/plot type/sample size chooser, plot)
  palette-view.js           palette bar (hex + share inside each color block, per-color copy), highlight in the image, copy all hex / image
  plot-types.js             PLOT_TYPES registry — add a plot type here (contract documented at the top of the file)
  color.js                  color space conversions (sRGB, XYZ, xy, Lab, HSV)
  pixels.js                 image loading, pixel extraction, seeded sampling
  palette.js                palette extraction (k-means in Lab)
  cie1931.js                CIE 1931 spectral locus + chromaticity diagram background
js/tabs/media-library.js  Media Library tab
js/tabs/pair-matching.js  Pair Matching tab
.nojekyll                 disables Jekyll processing on GitHub Pages
```

### Run locally

ES modules do not load over `file://`. Serve the folder:

```
python3 -m http.server
```

then open http://localhost:8000.

### Tab module contract

Each tab is one file in `js/tabs/` with a default export:

```js
export default {
  id: 'comparison',          // used for DOM ids (tab-<id>, panel-<id>) and URL hash (#<id>)
  label: 'Image Comparison', // text on the tab button
  render(container) { ... }, // called once at startup; build the tab's DOM inside `container`
  activate() { ... },        // optional; called each time the tab becomes visible
};
```

- All tab panels are rendered at startup and hidden/shown via the `hidden` attribute.
- Keep tab-specific logic inside the tab's file (or a sub-folder like `js/tabs/comparison/` if it grows).
- Tab-specific styles: add to `css/styles.css` scoped under `#panel-<id>`, or create `css/<id>.css` and link it in `index.html`.

### Add a new tab

1. Create `js/tabs/<name>.js` following the contract above.
2. Import it in `js/main.js` and add it to the `TABS` array (order = button order).

### Switch tabs programmatically

`import { showTab } from '../main.js'; showTab('comparison');` — e.g. for "open pair in comparison tab". Pass data through `js/state.js`, not by importing another tab's internals:

```js
import { setComparisonPair } from '../state.js';
setComparisonPair(pair); // shape documented in js/state.js (id, label, left/right: url, label, credit, fields)
showTab('comparison');
```

### Image Comparison tab: how it works

- **State**: `comparison/store.js` holds the tab state. Change it only via `update(patch, reason)`; subscribers update only what the reason (`'pair' | 'view' | 'swap' | 'transform' | 'opacity' | 'divider' | 'adjust' | 'diff'`) affects — dragging the overlay fires `'transform'` on every pointer move, so that path must stay cheap (no layout reads, no DOM rebuilding).
- **Per-view visibility**: the panel carries `data-view`; mark elements with `data-only="overlay slider"` etc. and CSS hides them in other views. Don't toggle `hidden` per view in JS.
- **One geometric model**: a 3×3 homography `H` maps overlay *natural* pixels to base natural pixels. Auto-align sets `H`; manual move/scale/rotate is applied on top (`overlayMatrix()`). Swapping which image is on top inverts the matrix, so the alignment survives. All geometry is in natural pixels; convert to screen only at the edges (`geo.vs` × zoom).
- **Display vs. export**: the viewer shows downscaled display canvases (≤ 4096 px) and positions the overlay with CSS `matrix3d()` (cheap, supports perspective). Screenshots (from the original images) and the difference map warp pixels in JS (`warp.js`).
- **Difference blend** (overlay view, idea from the GLAMhack 2026 photochrom compare page, https://nbtkmy.github.io/glamhack2026_photochrom/compare.html): `mix-blend-mode: difference` on the overlay canvas; screenshots use `globalCompositeOperation = 'difference'` so they match the screen. It blends within the zoom wrapper (its transform makes it the isolation group), so keep base and overlay inside the same stacking context.
- **Adjustments** are CSS filter strings (`adjustments.js`): `style.filter` on screen, `ctx.filter` in screenshots. The color analysis deliberately ignores them. Each image keeps its own values (`store.adjust.left/right`); the sidebar has one set of sliders plus an "Image to edit" selector, and marks images that have adjustments.
- **Zoom/pan** (`zoom.js`) wraps Panzoom (vendored). Panzoom's focal-point math assumes the transformed element starts at its parent's top-left, so the zoom wrapper spans the viewport and centers its content itself. The stage routes pointer events by hand (`noBind`) so a drag does exactly one thing: pan, move the overlay or move the divider. Input conventions: pinch / Ctrl/⌘ + scroll zoom the view, plain scroll stays with the page (except in the modal image dialog, `wheelZoom: true`, where there is no page to scroll — the page is locked via `html.has-modal`), Shift/Alt + scroll only touch the overlay (Move tool), Space or middle button = temporary pan, a second finger always pinch-zooms. "Link" in the side-by-side view is relative: each change of one frame (zoom factor, pan as a fraction of the image size) is applied to the other, so offsets made while unlinked survive re-linking; "Fit" fits both silently. The slider divider lives in screen space (a child of the stage, not of the zoomed layer): it keeps its screen position while panning/zooming and `store.divider` (fraction of the base width) is recomputed from the zoom state, so it never leaves the view. Marks that belong to image positions but must keep their screen size (difference boxes) are HTML inside the zoomed layer sized with `calc(... * var(--inv-zoom))` — use widths or `box-shadow`, not borders: Chrome rounds borders below 1 px up to 1 px before the zoom scales them. Low-resolution layers (the heatmap) simply scale with the image.
- **Auto-align** (`align.js`, OpenCV.js lazy-loaded from jsDelivr, ≈10 MB): grayscale + CLAHE, ORB then AKAZE (SIFT is not in the build), ratio test, RANSAC homography, plus a plausibility check (convex quad, sane area). It only works when the reproduction is a photographic copy: the Gleyre pair aligns (~330 inliers), the Correggio photochrom is a redrawn detail and does not — manual alignment is the fallback.
- **Difference map** (`difference.js`): photochroms are recolored, so it compares *locally normalised luminance* (structure), not colors. The threshold mapping `1.2 · 0.25^(sensitivity/100)` was calibrated on the aligned Gleyre pair (median score ≈ 0.17, 99th percentile ≈ 0.66); image borders and the overlap edge are excluded because local statistics are unreliable there. It is a heuristic: misalignment shows up as differences along edges.
- **Overlap %** comes from clipping the mapped overlay quad against the base rectangle. Scan borders and color charts count as image area until cropping them out is implemented.

### Constraints & gotchas

- **Static only**: no server code, no secrets/API keys in the repo. Third-party libraries must be loaded from a CDN as ES modules (e.g. `https://esm.sh/...` or jsDelivr) or vendored into `js/vendor/`. UMD-only libraries (e.g. Plotly) can be injected as a classic `<script>` on demand, see `js/lib/plotly.js`.
- **CORS / tainted canvas**: pixel access (`getImageData`, filters, color analysis, screenshots via `canvas.toDataURL`) only works if the image host sends CORS headers. Set `img.crossOrigin = 'anonymous'` and use CORS-enabled hosts, or store images in this repo.
- **Accessibility**: tabs use `role="tab"` / `role="tabpanel"` / `aria-selected`; keep this when changing the tab bar.
- **Lazy-loaded libraries**: load heavy libraries only on first use (`js/lib/plotly.js`, `js/lib/opencv.js`); small ones needed at render time (Panzoom) are vendored so the UI never depends on a CDN being up. The OpenCV.js Emscripten module is itself a thenable — resolve the loader with a wrapper object (`{ cv }`), otherwise `await` hangs on it.
- **Plotly**: don't start a `Plotly.react` while another is still running on the same element (the plot gets stuck); queue renders (see `analysis.js`).
- **`hidden` attribute**: a component's own `display` rule beats `[hidden]`, so `css/styles.css` has a global `[hidden] { display: none !important; }`. Rely on it instead of per-component overrides.
- **ResizeObserver**: if the callback changes the observed element's height (as the viewer does), react to width changes only, in a `requestAnimationFrame`, or it loops ("ResizeObserver loop completed with undelivered notifications").
- **Narrow screens**: `fieldset` has an intrinsic min width; set `min-inline-size: 0` and `max-width: 100%` on form controls, or the page overflows horizontally on phones.
- **Long metadata keys**: raw CSV column names are long; list them name-above-value, and cap label columns (`fit-content(40%)`) so values keep their space. Container queries (`container-type: inline-size`) adapt lists to a resizable panel.
- **Opening a dialog with Enter**: call `preventDefault()` on the keydown, or the same key press activates the button that receives focus in the dialog (closing it again).
- **Clipboard**: `navigator.clipboard.write` with images needs a secure context, a user gesture and `ClipboardItem` support. Always offer a fallback (show the text / download the PNG).
- **Testing interaction**: there is no test runner. Serve the folder and drive headless Chrome via the DevTools protocol (`Input.dispatchMouseEvent` / `dispatchTouchEvent` / `dispatchKeyEvent` give real pointer, wheel, pinch and key events). Use a fresh profile per run (Chrome caches ES modules aggressively), and remember that `+` in a URL query decodes to a space. Headless Chrome has no clipboard and cannot go below ~500 px window width.
