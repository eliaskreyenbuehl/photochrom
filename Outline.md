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

The website is optimised for desktop usage and does not have to be mobile friendly.

Use appropriate skills like planning and frontend skills for the implementation.

In a first iteration we use two example images which should be used for the comparison tool (data/sample/gleyre-le-soir_original.jpg and data/sample/gleyre-le-soir_photochrom.jpg).

## Requirements/Ideas

The site consists of 3 tabs:

### Media Library Tab

The start page: the whole collection (9,604 records) as filters and an image mosaic. Here users choose the main images (left side) for pairing.

- **Date filter** (compact, in the filter panel): a tiny histogram of works per year, a range slider with two handles and START/END fields. The axis is fixed to 1889–1914. A record matches if its date range overlaps the selection. Option "exact dates only". Histogram: dark = dated to a single year, light = date spans spread evenly over their years (an estimate).
- **Date rules** (`scripts/build_catalog.py`): photochrom production ended 1914, so records starting after 1914 are excluded from the catalog (6 records). Ranges ending after 1914 are cut at 1914 (flag `capped`), open ends ("after 1905") end at 1914 (flag `open`). Probable typos in catalog dates are flagged `suspect`, not corrected, and excluded by the date filter. The catalogued date is always shown as well.
- **Filter pills**: genre, country, image content, source (with IIIF image, reproduces a painting). OR within a group, AND between groups; each pill shows its count given the other filters. Free-text search over title, place, country and MMS ID.
- **Views**: *Mosaic* (default) shows the filtered works as uniform image tiles; *List* shows the work list with sortable columns; *Map* shows every image as a point on a similarity map (similar images close together, coloured by cluster with keyword labels, machine-generated). Mosaic and List use virtual scrolling (only visible rows are in the page); all three share the filters and the selection. Mosaic/List/Map is an icon toggle in the toolbar.
- **Similarity map** (`cluster-map.js`, data from `scripts/build_cluster_map.py`): 2D UMAP of the SigLIP 2 embeddings, clusters and labels from the cluster analysis (`scripts/similarity.ipynb`). Works that match the filters are coloured, the others gray. Hover shows the thumbnail (print-area crop), click selects, double-click opens the details, the lasso / box tools of the Plotly toolbar add all shown works inside to the selection. Scrolling zooms (unlike the other views, as on a geographic map; the map fills its pane, so there is no page to scroll), drag pans; overlapping cluster labels are hidden (larger clusters win) and appear when zooming in. Colours: the 8 hues of a validated categorical palette, assigned so that touching clusters differ (there are more clusters than distinguishable colours, so clusters are identified by their labels).
- **Selection**: a click on a tile or row (or Space) selects the work as a main image for the Candidates tab; a double-click (or Enter) opens the details dialog with ← / → through the shown works. Selected works (open question for the team: should Photochrom–Photochrom pairs also be chosen here?) are kept in the browser only (localStorage), with export (CSV, JSON) and import.
- **Images**: thumbnails come from an own static IIIF level 0 service, so scrolling does not load hundreds of images from e-rara. Sources and URLs for all sizes: see [Images: sources and URLs](#images-sources-and-urls).
- **Image analyses over time**: the date histogram is the first step; later e.g. color values over time.

Data: `scripts/build_catalog.py` joins the Zenodo CSVs into `data/catalog.json` (about 0.9 MB compressed), which all tabs share.

### Candidates Tab

Comparing images side by side is one of the key methods in art history. This tab creates candidate pairs for the Image Comparison tab.

Workflow: Media Library (selection) → Candidates → Image Comparison (exactly two images).

- **Pick two, compare**: the selected works appear as cards. Clicking a card (or its check box) picks it; picking two enables the **Compare** button in the selection bar at the bottom (same bar as in the Media Library: count, export, import, clear), which opens them as a pair in the Image Comparison tab. A third pick replaces the oldest. Double-click a card, or an image of a suggested pair, for its details.
- **Find pairs**: suggests pairs for the selected works, each with its own Compare button. Sources: `data/candidates.csv` (photochrom–photochrom pairs written by pairing methods, format in `docs/data.md`); for works of the genre “Reproduction” the painting from `artwork-pairs.csv`. Image similarity via embeddings (in progress) will write its pairs to `candidates.csv`.

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

- **Load 2 images**: a search field per image ("Left image", "Right image") at the top of the tab: search the media library or paste a Wikimedia Commons / e-rara / swisscollections link. Starts with the Gleyre sample pair. Photochroms load in zoom quality via `fullImageUrl()` (e-rara up to 4,000 px, legacy 2K scan from Hugging Face, 300 px thumbnail as fallback). Later also pairs from the Candidates tab (via `setComparisonPair()`).
- **Crop to print** (default on): photochroms with a box in `print-area.csv` are cropped to the print when loading, so view, alignment, overlap %, differences, color analysis and screenshots never see the color chart. The status line says when an image is cropped; unticking shows the whole scan.
- **Display images side by side** for comparison
- **Display image metadata** (loaded via seperate local csv)
- **Allow for image manipulation** (brightness, saturation, etc.)

- **Annotations** (user data, [docs/annotations.md](docs/annotations.md)): comments, tags, a region (rectangle drawn on the image) and microscope images per image, with the annotator's name and time, as W3C Web Annotations. Written in the details dialog (every tab; here the sidebar group "Annotations" opens it for the left or right image, and the other image is linked as second target). Saved in a local folder (Chrome/Edge, File System Access API) or in the browser (IndexedDB); export/import as ZIP. Never in the repo.

tbd for later:

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

## Images: sources and URLs

Every record in `data/catalog.json` has the field `img` (image file name without extension, also the identifier of all image services) and `s` (subset). Recatalogued records (`s = "r"`, 1,946) also have `iiif` (e-rara IIIF base URL); legacy records (`s = "l"`, 7,658) have no IIIF service at the ZB.

| Use | Recatalogued (`rec.iiif`) | Legacy (`rec.img`) |
|---|---|---|
| **Thumbnail** (mosaic, lists, cards), 300 px | `https://eliaskreyenbuehl.github.io/photochrom-images/iiif/<img>/full/300,/0/default.jpg` (own static IIIF 2.1 level 0, all 9,591 images; `info.json` next to it; **only width 300 exists**) | same |
| **Detail / comparison**, any size | `<iiif>/full/<w>,/0/default.jpg`, e.g. `!2000,2000` (best fit). e-rara is IIIF 2.1 **level 2**: regions (`x,y,w,h`, `pct:x,y,w,h`), sizes, rotation | `https://huggingface.co/datasets/eliaskre/photochrom-legacy-2k/resolve/main/images/<img>.jpg`: the whole 2K scan (about 2,000 px wide, median 620 KB). **No other sizes, no regions, no tiles** |
| **Deep zoom** (OpenSeadragon) | tile source `<iiif>/info.json` | `{ type: 'image', url: <2K URL> }`, zoom happens in the browser |
| **Full resolution** | `<iiif>/full/full/0/default.jpg` (4K scan, large) | the 2K scan is the largest version online (Zenodo has the same) |

**In code** use the helpers in `js/lib/catalog.js`, never build URLs by hand:

- `imageUrl(rec, 300)`: thumbnail (own service; falls back to e-rara only if `THUMB_IIIF_BASE` is empty)
- `fullImageUrl(rec, maxSize = 2000)`: image for comparison and color analysis (e-rara scaled, or the 2K legacy scan)
- `zoomSource(rec)`: OpenSeadragon tile source
- `largeImageUrl(rec, 600)`: medium image for the detail panel

**Rules**

- **CORS:** see the next section; all three image hosts allow it.
- **Spare e-rara** (production system of the ZB): only single images on demand (detail, comparison, zoom). Never load lists, mosaics or batch analyses from e-rara; use the thumbnail service.
- **Hugging Face** answers with a 302 redirect to a signed CDN URL; use the stable `resolve/main/...` URL, never the CDN URL (it expires). First load about 1–1.5 s.
- **Print area:** apply the box from `data/print-area.csv` (see next section) to every image, so color charts are not shown or analyzed. On e-rara the box can be requested as region `pct:x,y,w,h`; for thumbnails and legacy scans crop on canvas.
- **Rights and credit:** photochroms are Public Domain Mark 1.0. Credit line: "Zentralbibliothek Zürich, Photochrom Collection" with the DOI (`rec.doi`) or the swisscollections link.
- **Hosting:** thumbnails in the GitHub repository [photochrom-images](https://github.com/eliaskreyenbuehl/photochrom-images) (`scripts/build_thumbs_iiif.py`), legacy 2K scans in the Hugging Face dataset [eliaskre/photochrom-legacy-2k](https://huggingface.co/datasets/eliaskre/photochrom-legacy-2k) (`scripts/upload_legacy_2k_hf.py`, unchanged copies from Zenodo `images-legacy-2k.zip`). Both are copies; the source of record is the Zenodo dataset (https://doi.org/10.5281/zenodo.24141227).

### CORS (cross-origin images)

**What it is:** CORS (Cross-Origin Resource Sharing) decides whether a page from one origin (e.g. `https://eliaskreyenbuehl.github.io`) may *read* data from another origin (e.g. `huggingface.co`). Any page may *show* a foreign image in an `<img>`. But as soon as the app reads pixels (color analysis, palette, difference map, screenshot, auto-align), the browser requires the image host to allow it with the response header `Access-Control-Allow-Origin`. Without it the canvas is "tainted" and `getImageData()` / `toDataURL()` throw a `SecurityError`.

**Status of our hosts** (checked 14.11.2026 with `curl` and in Chrome from a GitHub Pages page):

| Host | Used for | Header | Notes |
|---|---|---|---|
| `eliaskreyenbuehl.github.io` (photochrom-images) | thumbnails, `info.json` | `Access-Control-Allow-Origin: *` | GitHub Pages sends it for all files |
| `www.e-rara.ch/i3f/v21/…` | recatalogued images, `info.json` | `Access-Control-Allow-Origin: *` | `info.json` declares `"cors"` support. The header comes on **GET**; a `curl -I` (HEAD) request for an image showed none, so test with GET |
| `huggingface.co/datasets/…/resolve/main/…` | legacy 2K scans | `Access-Control-Allow-Origin` on the 302 redirect **and** `*` on the CDN (`*.cdn.hf.co`) | both hops must allow it, and they do. Pixels readable in Chrome (tested: 2000×1455 image, 1.5 s) |

**In code**

- `<img>`: set `img.crossOrigin = 'anonymous'` **before** `img.src`; otherwise the browser loads without CORS and the canvas is tainted even though the host allows it.
- `fetch(url, { mode: 'cors' })` + `createImageBitmap(blob)` also works and keeps the canvas clean.
- OpenSeadragon: viewer option `crossOriginPolicy: 'Anonymous'`.
- Do not send credentials (`crossOrigin = 'use-credentials'`): the hosts answer with `*`, which browsers reject together with credentials.
- **Every redirect hop must allow CORS**, not only the final response. Hugging Face does this; Wikimedia does not (see below).
- **Wikimedia Commons (right-hand images of painting pairs):** `https://commons.wikimedia.org/wiki/Special:FilePath/<file>?width=…` **fails** in the browser (`Failed to fetch`): its 302/301 redirects carry no CORS header, only the final image does. The direct URLs work: `https://upload.wikimedia.org/wikipedia/commons/…` (original) and `https://thumb.wikimedia.org/wikipedia/commons/thumb/…/<w>px-…` (scaled), both `Access-Control-Allow-Origin: *`, pixels readable (tested 14.11.2026, 960 px and 4963 px). `commons_image_url` in `data/artwork-pairs.csv` uses `Special:FilePath`, so resolve it first via the Commons API, which itself allows CORS with `origin=*`: `https://commons.wikimedia.org/w/api.php?action=query&titles=File:<file>&prop=imageinfo&iiprop=url&iiurlwidth=1600&format=json&origin=*` → `thumburl` / `url`. **Done:** `data/commons-images.csv` (`scripts/resolve_commons_urls.py`) holds the direct URLs for all 167 Commons files, joined on `commons_file`; use `thumb_url` (about 1,920 px) for comparison and analysis. It also holds license and author: 9 photographs are under CC licenses, 8 of them require attribution, so show `artist` and `license` next to the image.
- Other new sources (museum sites): check before relying on pixel access; many museum sites send no CORS header. User uploads (`File` / blob URLs) are same-origin and always readable. If a source does not allow CORS, show the image but disable the analysis for it, with a message.

**How to test a host**

```
curl -s -D - -o /dev/null -L -H "Origin: https://eliaskreyenbuehl.github.io" "<image url>" | grep -i access-control
```

In the browser console of the app (not of an error page): `const r = await fetch(url, {mode: 'cors'})`; if it throws `Failed to fetch`, check the console for a CORS message.

**Pitfall seen while testing:** on GitHub's own 404 page the same fetch failed, because that page sets a Content Security Policy (CSP) that blocks requests to other hosts. That is a property of the test page, not of the image host. Our app sets no CSP; if one is added later, it must allow `connect-src` and `img-src` for the three hosts above.

**Local development:** pages opened as `file://` have origin `null` and ES modules do not load at all; always serve the folder (`python -m http.server`), see *Run locally*.

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
- **Status (14.11.2026):** `data/print-area.csv` holds boxes for all 4,873 images with chart (computed on the Mac). A second sample of 100 there: about 82 good, 7 with chart rest, 11 cut too much, so expect 82–89 %. 217 images flagged with chart got no box (VLM flag wrong or chart missed; to check).
- **Embeddings:** the SigLIP 2 embeddings in `data/zenodo/embeddings-siglip2/` were computed **from the full scans, with the charts**. The chart dominates similarity (95 % of the 10 nearest neighbors share the chart status, chance level 50 %; genre: 77 %). Recomputed from the print area in `data/embeddings-siglip2-printarea/` (use these): the chart effect drops from 0.953 to 0.769 (chance 0.50), genre stays at 0.779. The rest is probably due to chart rests and the 217 images without box.

## Project Structure & How-Tos (for contributors/agents)

Plain static site: vanilla HTML/CSS/JS ES modules, **no build step, no npm**. Runs directly on GitHub Pages.

```
index.html                page shell: header, tab bar (nav.tab-bar), panel container (#tab-panels)
css/styles.css            design tokens (CSS variables), shared components (.btn, .segmented, .badge, .info-btn, .card, .selbar, .details-dialog), Image Comparison styles
js/main.js                registers tabs, builds tab buttons/panels, handles switching; exports showTab(id)
js/config.js              SAMPLE_METADATA_URL, SAMPLE_IMAGE_DIR, DEFAULT_PAIR_ID — where the sample pairs come from
js/state.js               shared state between tabs: Media Library selection (localStorage) and the comparison pair (setComparisonPair() / onComparisonPairChange())
js/lib/csv.js             CSV parser (quoted fields), loadCsvObjects(url)
js/lib/plotly.js          loadPlotly(): lazy-loads Plotly from its CDN on first use
js/lib/opencv.js          loadOpenCV(): lazy-loads OpenCV.js (~10 MB) for auto-align
js/lib/script.js          loadScript(url): inject a classic <script> once (used by the loaders above)
js/lib/download.js        canvasToBlob(), downloadBlob() — saving generated PNGs
js/lib/exchange.js        export/import of the selection (CSV, JSON)
js/lib/annotation-model.js  user annotations as W3C Web Annotations: build/read the JSON (docs/annotations.md)
js/lib/annotation-store.js  annotation storage: local folder (File System Access API) or IndexedDB, media files, ZIP export/import
js/lib/zip.js             minimal ZIP writer/reader (no library) for the annotation export
js/lib/ui/                UI components shared by all tabs (see "UI conventions" below)
  icons.js                  icon(name): inline SVG icons, one style
  info.js                   infoTip(text): small "i" button with a popover for help text
  details.js                openDetails(image): details dialog (zoomable image + all metadata + annotations), the same in every tab
  annotations.js            annotation list + form of the dialog, storage panel (folder, export/import)
  region-layer.js           rectangles over the dialog image: show annotation regions, draw a new one
  metadata.js               key fields per role (photochrom / original / external) + all fields of an image
  zoom.js                   pan & zoom (pinch, Ctrl/⌘ + scroll, double-click, keys) on top of Panzoom
  select-open.js            click selects, double-click / Enter opens (tiles, rows, cards)
  selection-bar.js          selection bar at the bottom of Media Library and Candidates
js/lib/sources/           image sources (fetch layer): where images come from, independent of the UI
  index.js                  registry: searchImages(), imageFromLink(), parseLink(), canonicalUrl() (stable address of a work, annotation target) — the only module the UI uses
  image.js                  shared image shape (documented there), imageName(), stripHtml(), fetchJson()
  catalog.js                media library (catalog.json, thumbnails, e-rara IIIF, Hugging Face 2K scans): search, own links
  erara.js                  e-rara items outside the library (IIIF manifest / image service)
  commons.js                Wikimedia Commons file pages (Commons API)
js/vendor/panzoom/        Panzoom 4.6.2 (MIT, vendored ES module + license) — pan/zoom of the comparison views
js/tabs/comparison.js     Image Comparison tab: wires the modules below together
js/tabs/comparison/       sub-modules of the comparison tab
  store.js                  tab state (pair, images, view, alignment matrix, adjustments) + update/subscribe
  pairs.js                  sample pairs (data/sample/sample-metadata.csv; the tab starts with one), photochrom–painting pairs and photochromSide() for the Candidates tab
  media.js                  image loading (crop to print area, thumbnail fallback), display canvases, canvas helpers (createCanvas, canvasFrom, imageDataOf)
  viewer.js                 side-by-side / overlay / slider / difference views, view toolbar (Move overlay / Pan tools, zoom), drag + keyboard
  controls.js               sidebar: overlay & alignment, overlap %, differences, adjustments
  adjustments.js            per-image adjustments (CSS filter definitions)
  geometry.js               3×3 homography math, polygon clipping, overlap statistics
  align.js                  auto-align/deskew: ORB/AKAZE keypoints + RANSAC homography (OpenCV.js)
  warp.js                   homography pixel warp; warpOverlay() for screenshots and the difference map
  difference.js             structural difference map + regions
  diffview.js               computes the difference map for the viewer (heatmap canvas + HTML region boxes)
  screenshot.js             PNG export of the current view (or the zoomed-in part) incl. credits
  image-picker.js           "Left image" / "Right image" search fields at the top: choose from the library or a pasted link
  analysis.js               color analysis section (UI: image/plot type/sample size chooser, plot)
  palette-view.js           palette bar (hex + share inside each color block, per-color copy), highlight in the image, copy all hex / image
  plot-types.js             PLOT_TYPES registry — add a plot type here (contract documented at the top of the file)
  color.js                  color space conversions (sRGB, XYZ, xy, Lab, HSV)
  pixels.js                 image loading, pixel extraction, seeded sampling
  palette.js                palette extraction (k-means in Lab)
  cie1931.js                CIE 1931 spectral locus + chromaticity diagram background
js/lib/catalog.js         loadCatalog() for data/catalog.json, thumbnail/IIIF image URLs (THUMB_IIIF_BASE), fullImageUrl(), zoomSource(), links, date labels
js/lib/print-area.js      loadPrintAreas(), printAreaFor(rec): print box without color chart from data/print-area.csv
js/tabs/media-library.js  Media Library tab: wires the modules below together
js/tabs/media-library/
  filters.js                filter model, matching, facet counts (no DOM)
  date-filter.js            compact date filter: tiny histogram, two-handle slider, START/END
  mosaic.js                 virtual-scrolling image mosaic with checkboxes
  list.js                   virtual-scrolling work list with checkboxes
  cluster-map.js            similarity map (Plotly scattergl, lazy-loaded): data/cluster-map.json + background PNG
css/media-library.css     styles of the Media Library and the Candidates tab
scripts/build_catalog.py  builds data/catalog.json from the Zenodo CSVs (run after data updates)
scripts/build_thumbs_iiif.py  builds static IIIF level 0 thumbnails for the photochrom-images repository
scripts/build_cluster_map.py  builds data/cluster-map.json + cluster-map-bg.png (2D UMAP cached in data/cluster-analysis/umap-2d.npy)
scripts/similarity.ipynb  cluster analysis (UMAP + HDBSCAN + keyword labels) → data/cluster-analysis/
js/tabs/pair-matching.js  Candidates tab (id 'pair-matching')
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

- **Image sources** (`js/lib/sources/`): the UI never builds image URLs itself; it asks the registry (`searchImages()`, `imageFromLink()`), which returns images in one shape (see `image.js`). A source is a module with `search()` and/or `fromLink()`; to add one (e.g. Wikidata, an API instead of `catalog.json`) write the module and add it to `SOURCES` in `index.js`. Links are tried catalog first, so e-rara / DOI / swisscollections links to photochroms in the library get the catalog record (metadata, print-area crop). CORS: Commons API and images, e-rara IIIF manifests and images allow it; e-rara DOI landing pages do not, so DOIs are only resolved through the catalog. Choosing an image makes a new pair (the other image is kept); there is no pair selector.
- **Naming images**: never by role ("Original"/"Photochrom") — a pair can be two photochroms. An image is named by its photochrom number (if any) and title, `imageName()` in `js/lib/sources/image.js`, e.g. "No. 73 · Les illusions perdues"; where that does not fit (selectors, legends, sentences about overlap) use its position "Left"/"Right" (`POSITION` in `store.js`, `image.position`). `role` only selects the metadata fields. The number comes from `photochrom_number` (sample CSV) or the catalog field `n`.
- **State**: `comparison/store.js` holds the tab state. Change it only via `update(patch, reason)`; subscribers update only what the reason (`'pair' | 'view' | 'swap' | 'transform' | 'opacity' | 'blend' | 'divider' | 'adjust' | 'diff'`) affects — dragging the overlay fires `'transform'` on every pointer move, so that path must stay cheap (no layout reads, no DOM rebuilding).
- **Per-view visibility**: the panel carries `data-view`; mark elements with `data-only="overlay slider"` etc. and CSS hides them in other views. Don't toggle `hidden` per view in JS.
- **One geometric model**: a 3×3 homography `H` maps overlay *natural* pixels to base natural pixels. Auto-align sets `H`; manual move/scale/rotate is applied on top (`overlayMatrix()`). Swapping which image is on top inverts the matrix, so the alignment survives. All geometry is in natural pixels; convert to screen only at the edges (`geo.vs` × zoom).
- **Display vs. export**: the viewer shows downscaled display canvases (≤ 4096 px) and positions the overlay with CSS `matrix3d()` (cheap, supports perspective). Screenshots (from the original images) and the difference map warp pixels in JS (`warp.js`).
- **Difference blend** (overlay view, idea from the GLAMhack 2026 photochrom compare page, https://nbtkmy.github.io/glamhack2026_photochrom/compare.html): `mix-blend-mode: difference` on the overlay canvas; screenshots use `globalCompositeOperation = 'difference'` so they match the screen. It blends within the zoom wrapper (its transform makes it the isolation group), so keep base and overlay inside the same stacking context.
- **Adjustments** are CSS filter strings (`adjustments.js`): `style.filter` on screen, `ctx.filter` in screenshots. The color analysis deliberately ignores them. Each image keeps its own values (`store.adjust.left/right`); the sidebar has one set of sliders plus an "Image to edit" selector, and marks images that have adjustments.
- **Zoom/pan** (`js/lib/ui/zoom.js`) wraps Panzoom (vendored). Panzoom's focal-point math assumes the transformed element starts at its parent's top-left, so the zoom wrapper spans the viewport and centers its content itself. The stage routes pointer events by hand (`noBind`) so a drag does exactly one thing: pan, move the overlay or move the divider. Input conventions: pinch / Ctrl/⌘ + scroll zoom the view, plain scroll stays with the page (except in the modal details dialog, `wheelZoom: true`, where there is no page to scroll — the page is locked via `html.has-modal`), Shift/Alt + scroll only touch the overlay (Move tool), Space or middle button = temporary pan, a second finger always pinch-zooms. "Link" in the side-by-side view is relative: each change of one frame (zoom factor, pan as a fraction of the image size) is applied to the other, so offsets made while unlinked survive re-linking; "Fit" fits both silently. The slider divider lives in screen space (a child of the stage, not of the zoomed layer): it keeps its screen position while panning/zooming and `store.divider` (fraction of the base width) is recomputed from the zoom state, so it never leaves the view. Marks that belong to image positions but must keep their screen size (difference boxes) are HTML inside the zoomed layer sized with `calc(... * var(--inv-zoom))` — use widths or `box-shadow`, not borders: Chrome rounds borders below 1 px up to 1 px before the zoom scales them. Low-resolution layers (the heatmap) simply scale with the image.
- **Auto-align** (`align.js`, OpenCV.js lazy-loaded from jsDelivr, ≈10 MB): grayscale + CLAHE, ORB then AKAZE (SIFT is not in the build), ratio test, RANSAC homography, plus a plausibility check (convex quad, sane area). It only works when the reproduction is a photographic copy: the Gleyre pair aligns (~330 inliers), the Correggio photochrom is a redrawn detail and does not — manual alignment is the fallback.
- **Color analysis plots** (`analysis.js`, `plot-types.js`): the palettes are computed once per image and palette size in `analysis.js` and shared by the palette bar and the plots. "Point colors: Palette colors" colors every plot point by its nearest palette color and draws the palette colors as outlined markers sized `8 + 30·√share` (like the Clusters/Centroids layers of the Python analysis in `tests/color_outputs.py`); selecting a palette color highlights its points in the plot (others gray) in both modes. Builders use `seriesTraces()` for their point traces, so new plot types get both features.
- **Difference map** (`difference.js`): photochroms are recolored, so it compares *locally normalised luminance* (structure), not colors. The threshold mapping `1.2 · 0.25^(sensitivity/100)` was calibrated on the aligned Gleyre pair (median score ≈ 0.17, 99th percentile ≈ 0.66); image borders and the overlap edge are excluded because local statistics are unreliable there. It is a heuristic: misalignment shows up as differences along edges.
- **Overlap %** comes from clipping the mapped overlay quad against the base rectangle. With "Crop to print" on, photochroms are cropped to the print first, so color charts and scan borders no longer count (boxes are machine-generated; about 1 in 10 is imperfect).

### UI conventions

Keep the three tabs consistent; reuse the shared pieces instead of writing tab-specific copies.

- **Tokens**: colors, radii, control heights and text sizes are CSS variables at the top of `css/styles.css`. No raw hex values or new radii in tab styles. Radii: `--radius-sm` thumbnails, `--radius` controls, `--radius-lg` panels and cards.
- **Buttons**: `.btn` (default), `.btn-primary` (the one main action of an area: Open in Candidates, Compare, Auto-align), `.btn-ghost` (toolbars), `.btn-sm`, `.btn-icon` (icon only: needs `aria-label` and `title`). Toggle buttons use `aria-pressed`. Choices of 2–4 options: `.segmented` (buttons with `aria-pressed`, or radio labels in a fieldset). Text links inside text: `.link-btn`.
- **Icons**: `icon(name)` from `js/lib/ui/icons.js` (16 px, 1.5 px stroke, `currentColor`); next to a text label, or alone with `aria-label` + `title`. Add new icons there, never inline SVG in a tab.
- **Help text**: short hints as `title` tooltips; longer help that is not needed in normal use behind `infoTip()` (the "i" button, opens on hover or click). Status and error messages stay visible. For an "i" next to a form caption use `<div class="control"><span class="control-label"><label for=…>Caption</label>${infoTip(…)}</span><select id=…>`: a button inside a `<label>` would become the labelled control, so clicking the caption would open the popover instead of focusing the field. The popover text can be changed later (`.info-pop` element), e.g. the plot type description in the color analysis.
- **Machine-generated data**: label with `<span class="badge badge-machine">machine-generated</span>` (or "– machine-generated" in plain-text values).
- **Images in grids and lists**: click selects (check box + outline), double-click or Enter opens `openDetails()`, Space toggles (`js/lib/ui/select-open.js`). The selectable element has `role="checkbox"` + `aria-checked` and contains a visual `.check-box`.
- **Details**: always `openDetails(image)` with the image shape of `js/lib/sources/image.js`; pass `recordId` for catalog records (adds the record block, links and the Select toggle) and `browse` for ← / →.
- **Headings**: each tab has a visually hidden `h2` (the tab bar shows the name), sections use `h3`.

### Constraints & gotchas

- **Static only**: no server code, no secrets/API keys in the repo. Third-party libraries must be loaded from a CDN as ES modules (e.g. `https://esm.sh/...` or jsDelivr) or vendored into `js/vendor/`. UMD-only libraries (e.g. Plotly) can be injected as a classic `<script>` on demand, see `js/lib/plotly.js`.
- **CORS / tainted canvas**: pixel access (`getImageData`, filters, color analysis, screenshots via `canvas.toDataURL`) only works if the image host sends CORS headers. Set `img.crossOrigin = 'anonymous'` and use CORS-enabled hosts, or store images in this repo.
- **Accessibility**: tabs use `role="tab"` / `role="tabpanel"` / `aria-selected`; keep this when changing the tab bar.
- **Lazy-loaded libraries**: load heavy libraries only on first use (`js/lib/plotly.js`, `js/lib/opencv.js`); small ones needed at render time (Panzoom) are vendored so the UI never depends on a CDN being up. The OpenCV.js Emscripten module is itself a thenable — resolve the loader with a wrapper object (`{ cv }`), otherwise `await` hangs on it.
- **Plotly**: don't start a `Plotly.react` while another is still running on the same element (the plot gets stuck); queue renders (see `analysis.js`). Plotly writes zoom changes into the layout's range arrays: never pass shared constants (e.g. `DIAGRAM_RANGE`) as `range` — pass copies, or a zoom moves the constant (and everything positioned from it) for good. Changing the plot type purges the plot so no zoom state carries over between types; `doubleClick: 'reset'` returns to the layout's own ranges.
- **Plotly scattergl clicks**: `plotly_click` has no double-click of its own and Plotly's `doubleClick` would reset the zoom, so the map turns it off and detects a double-click as two clicks on the same point within 400 ms (undoing the first toggle, like `select-open.js`). Use `hoverinfo: 'none'` (not `'skip'`) on a trace whose hover events you need for a custom tooltip. Plotly's `scrollZoom` zooms on every wheel event (the map uses it on purpose: plain scroll zooms there). After a lasso / box selection, clear `selectedpoints` and `layout.selections`, or the shape and the dimming stay. Don't use marker symbols other than the plain circle in `scattergl` (e.g. `circle-open`): they are drawn from a texture that shows up as noisy black squares on some GPUs (not in headless Chrome, which renders in software); for rings use a circle with transparent `color` and `marker.line`.
- **`hidden` attribute**: a component's own `display` rule beats `[hidden]`, so `css/styles.css` has a global `[hidden] { display: none !important; }`. Rely on it instead of per-component overrides.
- **ResizeObserver**: if the callback changes the observed element's height (as the viewer does), react to width changes only, in a `requestAnimationFrame`, or it loops ("ResizeObserver loop completed with undelivered notifications").
- **Narrow screens**: `fieldset` has an intrinsic min width; set `min-inline-size: 0` and `max-width: 100%` on form controls, or the page overflows horizontally on phones.
- **Long metadata keys**: raw CSV column names are long; list them name-above-value, and cap label columns (`fit-content(40%)`) so values keep their space. Container queries (`container-type: inline-size`) adapt lists to a resizable panel.
- **Popovers** (`infoTip`): `toggle` events do not bubble, listen in the capture phase. A popover opened on hover must ignore the click that follows (the click would toggle it closed); `info.js` handles this.
- **Click vs. double-click**: a double-click fires two clicks first. `select-open.js` toggles on the first click (`detail === 1`), ignores the second and undoes the toggle on `dblclick`, so a double-click only opens details. Update selected state in place (no re-render between the clicks) so the dblclick target survives.
- **Opening a dialog with Enter**: call `preventDefault()` on the keydown, or the same key press activates the button that receives focus in the dialog (closing it again).
- **Clipboard**: `navigator.clipboard.write` with images needs a secure context, a user gesture and `ClipboardItem` support. Always offer a fallback (show the text / download the PNG).
- **Annotations / File System Access API**: `showDirectoryPicker()` and `requestPermission()` need a click (transient user activation): call them from the click handler with no slow work before. The handle survives in IndexedDB, the permission often not (Chrome asks again after a restart: "Allow access"). Firefox and Safari have no API, so they use IndexedDB plus ZIP. Headless tests can stand in a folder with the origin private file system: `window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('x', { create: true })`. Regions are stored relative to the whole scan; the comparison tab's dialog shows the print crop, so `region-layer.js` maps through `image.cropped`.
- **Testing interaction**: there is no test runner. Serve the folder and drive headless Chrome via the DevTools protocol (`Input.dispatchMouseEvent` / `dispatchTouchEvent` / `dispatchKeyEvent` give real pointer, wheel, pinch and key events). Use a fresh profile per run (Chrome caches ES modules aggressively), and remember that `+` in a URL query decodes to a space. Headless Chrome has no clipboard and cannot go below ~500 px window width.
