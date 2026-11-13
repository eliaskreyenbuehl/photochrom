# Outline - Photochrom Comparison Tool

Goal of this project: creating a research environment for art history.

- From close reading images to distant reading: crafting research questions, finding answers by tagging and comparing subsets
- Image inspection in the smallest detail, revealing the secrets of their fabrication
- Color analysis and comparison of two images
- Comparison of image pairs

## Project setup

Each feature is implemented in a separate feature branch. The main branch is always deployable and contains the latest stable version.

## Architecture

The project is hosted on Github and therefore can only use static HTML. If things cannot be built due to this constraint, don't implement it and tell me about the problem.

Use appropriate skills like planning and frontend skills for the implementation.

In a first iteration we use two example images which should be used for the comparison tool (data/sample/gleyre-le-soir_original.jpg and data/sample/gleyre-le-soir_photochrom.jpg).

## Requirements/Ideas

The site consists of 3 tabs:

### Media Library Tab

The start page: the whole collection (9,604 records) as filters and an image mosaic. Here users choose the main images (left side) for pairing.

- **Date filter** (compact, in the filter panel): a tiny histogram of works per year, a range slider with two handles and START/END fields. The axis is fixed to 1889–1914. A record matches if its date range overlaps the selection. Option "exact dates only". Histogram: dark = dated to a single year, light = date spans spread evenly over their years (an estimate).
- **Date rules** (`scripts/build_catalog.py`): photochrom production ended 1914, so records starting after 1914 are excluded from the catalog (6 records). Ranges ending after 1914 are cut at 1914 (flag `capped`), open ends ("after 1905") end at 1914 (flag `open`). Probable typos in catalog dates are flagged `suspect`, not corrected, and excluded by the date filter. The catalogued date is always shown as well.
- **Filter pills**: genre, country, image content, source (with IIIF image, reproduces a painting). OR within a group, AND between groups; each pill shows its count given the other filters. Free-text search over title, place, country and MMS ID.
- **Views**: *Mosaic* (default) shows the filtered works as uniform image tiles; *List* shows the work list with sortable columns. Both use virtual scrolling (only visible rows are in the page) and share the selection. Click a tile or row for details.
- **Selection**: the checkbox on a tile or row makes the work a main image for the Pair Matching tab (open question for the team: should Photochrom–Photochrom pairs also be chosen here?). Kept in the browser only (localStorage), with export (CSV, JSON) and import.
- **Images**: thumbnails come from an own static IIIF level 0 service (`scripts/build_thumbs_iiif.py`, separate repository [photochrom-images](https://github.com/eliaskreyenbuehl/photochrom-images) on GitHub Pages), so scrolling does not load hundreds of images from e-rara. The detail panel loads the larger image from e-rara IIIF where available.
- **Image analyses over time**: the date histogram is the first step; later e.g. color values over time.

Data: `scripts/build_catalog.py` joins the Zenodo CSVs into `data/catalog.json` (about 0.9 MB compressed), which all tabs share.

### Pair matching Tab

Comparing images side by side is one of the key methods in art history. This tab creates candidate pairs for the Image Comparison tab.

The left image is always a main image from the Photochrom collection. The right image can be:

- another image from the same collection that is related to the main image in some way
- an image from another collection, a museum, Wikimedia Commons or any other web resource
- an image uploaded by the user

Candidates are found through the following features:

- **Wikidata match**: both images are linked to the same Wikidata entity
- **Metadata and image content**: matching metadata fields and depicted content (e.g. sky, boat, snowy mountain peaks)
- **Image similarity**: visual similarity of the images (e.g. image embeddings)
- **Color relation**: some kind of color relation, to be defined in the image analysis section
- **User annotations**: tags that users create themselves in the Image Comparison tab
- **Skill and MCP** *(future development, not possible on a static site)*: the user tells Claude what they want to compare, and Claude enriches the data if needed

Output and extensions:

- **Display pairs as gallery** with an option to open a pair in the Image Comparison tab
- **Allow for running custom scripts** on the image data (an LLM could produce the script from a user prompt)

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

Color charts on scans: see [Print area](#print-area-scans-without-color-charts) below. Color analysis uses only the print area.

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

## Print area: scans without color charts

About half of the scans (4,893 of 9,610, `scan_farbkarte = ja`) show a Kodak color control strip and/or a gray scale next to the print, on a dark or gray scanner background. All tabs should show and analyze **only the print**.

- **Stored as coordinates, not as cropped images.** `data/print-area.csv`: one row per image (`img` = image file name without extension, as in `catalog.json`), box `x0, y0, x1, y1` as **fractions of width and height** (0–1), so the same box applies to every resolution (300 px thumbnail, 800 px preview, 2K/4K scan, IIIF). Plus `note`, `method`, `review_status` (provenance). Images without a row: use the whole image.
- **Use in the app:** a shared helper (e.g. in `js/lib/catalog.js`) returns the box for a record. IIIF images can be requested with a region (`/<x>,<y>,<w>,<h>/` or `pct:x,y,w,h`) on e-rara; for the static thumbnails and local files, draw only the box (canvas `drawImage` with source rectangle, or CSS `object-view-box`/clip). Media Library mosaic, Image Comparison, color analysis and screenshots all use the same box.
- **How the box is computed** (`scripts/detect_print_area.py`, numpy only, no model; method `detect_print_area-v1`):
  1. Color chart: lines (rows/columns) near an edge where at least 12 % of the pixels are strongly saturated and belong to at least three different hues (chart patches). Photochroms are far less saturated. A chart strip must start in the outer 30 % and be contiguous; colorful areas deeper inside the print (blue lakes, gilded interiors) are not taken for a chart. The strip is cut off, together with an adjacent neutral gray label band.
  2. Background: the border color of the remaining area is taken as background; dark neutral pixels count as background too. Rows/columns with less than 35 % content are trimmed from the outside. A background gap in the outer 30 % separates further strips (gray scales, labels) from the print.
  3. Edge refinement (idea: Samuel): the paper edge of the print is a long straight edge. Each side is moved outwards to the outermost line with a continuous strong edge, if the area between is textured and everything beyond it is background. This repairs boxes that stopped inside dark parts of the print.
  4. Fallback: if trimming leaves less than half of the area, only the chart cut is used (minus 2 % margin), marked "check".
- **Quality** (fresh test sample of 100 scans with chart, `--seed 2026 --limit 100`): 89 boxes fit well, 6 keep part of the chart (mostly the label band of charts below the print), 5 cut off too much of the print. Further threshold tuning made things worse. Next ideas: template matching of the known Kodak patch sequence, corner detection. All boxes are machine-generated and unreviewed.
- **Status:** the full run (4,893 scans) and the new embeddings are computed on the Mac (loan from 14.11.2026, see workspace MOC).
- **Embeddings:** the SigLIP 2 embeddings in `data/zenodo/embeddings-siglip2/` were computed **from the full scans, with the charts**. The chart dominates similarity (95 % of the 10 nearest neighbors share the chart status, chance level 50 %; genre: 77 %). They must be recomputed from the print area before "image similarity" in Pair Matching is reliable.

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
js/tabs/comparison.js     Image Comparison tab: wires the modules below together
js/tabs/comparison/       sub-modules of the comparison tab
  store.js                  tab state (pair, images, view, alignment matrix, adjustments) + update/subscribe
  pairs.js                  comparison pairs from data/sample/sample-metadata.csv
  media.js                  image loading, downscaled display canvases
  viewer.js                 side-by-side / overlay / slider / difference views, drag + keyboard
  controls.js               sidebar: overlay & alignment, overlap %, differences, adjustments
  adjustments.js            per-image adjustments (CSS filter definitions)
  geometry.js               3×3 homography math, polygon clipping, overlap statistics
  align.js                  auto-align/deskew: ORB/AKAZE keypoints + RANSAC homography (OpenCV.js)
  warp.js                   homography pixel warp (screenshots, difference map)
  difference.js             structural difference map + regions
  diffview.js               computes/draws the difference map for the viewer
  screenshot.js             PNG export of the current view incl. credits
  metadata.js               metadata panel (key fields + all fields)
  analysis.js               color analysis section (UI: image/plot type/sample size chooser, plot)
  palette-view.js           palette display: highlight colors in the image, copy hex / image
  plot-types.js             PLOT_TYPES registry — add a plot type here (contract documented at the top of the file)
  color.js                  color space conversions (sRGB, XYZ, xy, Lab, HSV)
  pixels.js                 image loading, pixel extraction, seeded sampling
  palette.js                palette extraction (k-means in Lab)
  cie1931.js                CIE 1931 spectral locus + chromaticity diagram background
js/lib/catalog.js         loadCatalog() for data/catalog.json, thumbnail/IIIF image URLs (THUMB_IIIF_BASE), links, date labels
js/tabs/media-library.js  Media Library tab: wires the modules below together
js/tabs/media-library/
  filters.js                filter model, matching, facet counts (no DOM)
  date-filter.js            compact date filter: tiny histogram, two-handle slider, START/END
  mosaic.js                 virtual-scrolling image mosaic with checkboxes
  list.js                   virtual-scrolling work list with checkboxes
  details.js                detail panel for one record
  exchange.js               export/import of the selection (CSV, JSON)
css/media-library.css     styles of the Media Library (and candidate cards in Pair Matching)
scripts/build_catalog.py  builds data/catalog.json from the Zenodo CSVs (run after data updates)
scripts/build_thumbs_iiif.py  builds static IIIF level 0 thumbnails for the photochrom-images repository
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

`import { showTab } from '../main.js'; showTab('comparison');` — e.g. for "open pair in comparison tab". To pass data (which images to load), add a shared state module (e.g. `js/state.js`) rather than coupling tabs directly.

### Constraints & gotchas

- **Static only**: no server code, no secrets/API keys in the repo. Third-party libraries must be loaded from a CDN as ES modules (e.g. `https://esm.sh/...` or jsDelivr) or vendored into `js/vendor/`. UMD-only libraries (e.g. Plotly) can be injected as a classic `<script>` on demand, see `js/lib/plotly.js`.
- **CORS / tainted canvas**: pixel access (`getImageData`, filters, color analysis, screenshots via `canvas.toDataURL`) only works if the image host sends CORS headers. Set `img.crossOrigin = 'anonymous'` and use CORS-enabled hosts, or store images in this repo.
- **Accessibility**: tabs use `role="tab"` / `role="tabpanel"` / `aria-selected`; keep this when changing the tab bar.
