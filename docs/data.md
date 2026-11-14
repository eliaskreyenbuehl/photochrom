# Data

All data in `data/` comes from the dataset **Photochrom Collection of the Zentralbibliothek Zürich**
(Zenodo, version 1.1, https://doi.org/10.5281/zenodo.24141227). Metadata is CC0, images are Public Domain Mark.
The full dataset description is the README on Zenodo; this page is the short version for the hack.

## Two groups of records

The column `subset` splits the 9,610 records into two groups. Each record belongs to one group only.

| subset | records | images | IIIF |
|---|---|---|---|
| `recatalogued` | 1,952 | 4K scans, new catalogue data | **yes**, via e-rara.ch / e-manuscripta.ch |
| `legacy` | 7,658 | older 2K scans, older catalogue data | **no**, only JPEGs on Zenodo |

**Consequence for the viewer:** only recatalogued records can be shown with a IIIF viewer. Legacy
images must be shown as static JPEGs downloaded from Zenodo (`images-legacy-preview.zip`, 800 px,
or `images-legacy-2k.zip`). The images are not in this repo.

## Files

| File | Rows | Key | Use |
|---|---|---|---|
| `data/zenodo/photochrom-metadata.csv` | 9,610 | `identifier_swisscollections` | catalogue data, DOI, `iiif_manifest_url`, `iiif_image_uris`, primary coordinates (`geo_primary_lat/lon`). **Added column, not in Zenodo v1.1:** `photochrom_number` (see below) |
| `data/zenodo/photochrom-image-content.csv` | 9,610 | `mms_id` | machine-generated image content: `genre`, people, buildings, mountains, water … as yes/no columns, short English description |
| `data/zenodo/photochrom-places.csv` | 12,676 | `identifier_swisscollections` | every place mention with GND, Wikidata and coordinates |
| `data/zenodo/photochrom-main-place.csv` | 4,224 | `identifier_swisscollections` | main motif per legacy record (partial) |
| `data/zenodo/embeddings-siglip2/embeddings.npy` | 9,582 × 1152, float32 | row number | SigLIP 2 image vectors for similarity and free-text search |
| `data/zenodo/embeddings-siglip2/dateien.csv` | 9,582 | `zeile` (= row), `image_filename` | maps each vector row to an image |
| `data/print-area.csv` | 4,873 | `img` | **derived**: box of the print without color chart, as fractions `x0,y0,x1,y1` of width/height, for every image with `scan_farbkarte = ja`. `scripts/detect_print_area.py`, method `detect_print_area-v1`, 14.11.2026, machine-generated, unreviewed. About 82–89 % fit well (two samples of 100). `note`: `chart` (4,615), `no chart` (217: chart flag set, but no chart found), `chart; fallback chart cut only, check` (41). 10 rows belong to images outside `catalog.json` (6 excluded records after 1914, 4 further pages of multi-image records) |
| `data/embeddings-siglip2-printarea/embeddings.npy` | 9,582 × 1152, float32, L2-normalized | row number | **derived**: SigLIP 2 image vectors **of the print area** (crop from `print-area.csv` applied to the 800 px preview; images without box uncropped). Use these for image similarity. Model `google/siglip2-so400m-patch14-384`, revision `e8e487298228002f3d8a82e0cd5c8ea9c567f57f`, fp16, computed on the Mac 14.11.2026 (797 s, 5.3 Wh). **Same rows, same order and same file names as the Zenodo embeddings** (`data/zenodo/embeddings-siglip2/`), so row *i* is the same image in both. Computed for all 9,591 images of the preview ZIPs; the 9 images not in Zenodo v1.1 (fetched later from e-rara: `29698016`, `31383513`, `31383522`, `31383540`, `31522620`, `32394185`, `32415604`, `32575839`, `32576584`) were removed on 14.11.2026, vectors otherwise unchanged |
| `data/embeddings-siglip2-printarea/dateien.csv` | 9,582 | `zeile` (= row), `image_filename` | maps each vector row to an image; identical to `data/zenodo/embeddings-siglip2/dateien.csv` (legacy, then recatalogued, each by file name) |
| `data/image-sizes.csv` | 9,591 | `img` | **derived**: width and height (px) of each image on the thumbnail IIIF service (`info.json` of photochrom-images; aspect ratio of the whole scan). `scripts/build_image_sizes.py`, 14.11.2026. Used by `build_catalog.py` for the field `ar` (masonry mosaic) |
| `data/catalog.json` | 9,604 | `id` (MMS ID) | **derived**: compact join of the files above for the web app, built by `scripts/build_catalog.py`; field list and provenance in its `fields` block (includes the photochrom number as `n`). Records starting after 1914 are excluded (6, listed in its `excluded` block): photochrom production ended 1914 |
| `data/commons-images.csv` | 167 | `commons_file` (= `commons_file` in artwork-pairs.csv) | **derived**: direct, CORS-enabled image URLs for the Commons images of the painting pairs (`original_url`, `thumb_url` about 1,920 px or the original if smaller, with real sizes), plus `license`, `artist`, `credit`, `attribution_required`. `scripts/resolve_commons_urls.py`, Commons API `imageinfo`, 14.11.2026. 158 public domain, 9 under CC licenses (8 need attribution) |
| `data/cluster-analysis/clusters_with_labels.csv` | 9,582 | `zeile` (= embedding row), `image_filename` | **derived**: HDBSCAN cluster (`-1` = noise, 44 clusters) on a 10D UMAP of the Zenodo SigLIP 2 embeddings, and a keyword `label` per cluster (e.g. "venice, doge, marco"). `scripts/similarity.ipynb`, machine-generated, unreviewed. `clusters.csv`: the same without labels |
| `data/cluster-analysis/umap-2d.npy` | 9,582 × 2, float32 | embedding row | **derived**: 2D UMAP (n_neighbors 30, min_dist 0.1, cosine, seed 42) of the Zenodo SigLIP 2 embeddings, raw coordinates. Computed once by `scripts/build_cluster_map.py` (umap-learn 0.5, 14.11.2026) and reused, because UMAP output differs between versions and machines |
| `data/cluster-map.json` | 9,571 points, 44 clusters | `points.img` (= catalog `img`) | **derived**: similarity map of the Media Library (view "Map"): per point `img`, `x`, `y` (rescaled to 0–100), cluster `c`; per cluster `label`, size `n`, label position and colour; `extent` of the background image. `scripts/build_cluster_map.py`; 11 embedding rows without catalog record are left out. Machine-generated, unreviewed |
| `data/cluster-map-bg.png` | 1000 × 1000 px | – | **derived**: light cluster areas behind the map points (each pixel takes the cluster of the nearest clustered point within 2.5 % of the extent), covering `extent` of `cluster-map.json` |
| `data/artwork-pairs.csv` | 240 | `mms_id` | **photochroms that reproduce paintings, matched to the original artwork** (see below) |
| `data/candidates.csv` | 0 | `mms_id_a`, `mms_id_b` | **candidate pairs of two photochroms** for the Candidates tab, written by pairing methods (see below) |

## Links between files

- `identifier_swisscollections` = `mms_id` = MMS ID of the catalogue record. **Always read it as text**,
  never as a number. Record page: `https://swisscollections.ch/Record/<MMS ID>`.
- Image file names: recatalogued = page VLID (`30418784.jpg` → `https://www.e-rara.ch/id/30418784`),
  legacy = MARC 993$a (`400013004.jpg`). `image_files` in the metadata gives the path inside the Zenodo ZIPs.
- IIIF image URL pattern (recatalogued): `https://www.e-rara.ch/i3f/v21/<VLID>/full/,560/0/default.jpg`.
- Several values in one cell are separated by ` | `.

## photochrom_number

The Photochrom number printed on the print, usually in gold at the lower left (e.g. `"17510.P.Z." -- unten links` in
`general_note` → `17510`). Digits only; empty when the note records none. Added to
`photochrom-metadata.csv` and `sample/sample-metadata.csv` as the last column by
`scripts/add_photochrom_number.py`, 14.11.2026,
rule-based (regular expressions), machine-made, **unreviewed**. All other cells are unchanged.

- 8,206 records have a number, 1,404 have none.
- Lengths: 4 digits 3,589, 5 digits 3,794, 3 digits 744, 1–2 digits 69, 6 digits 10. Short numbers
  are real (early series, many painting reproductions). The 6-digit values (`202010`–`202016`,
  `104836`, `104837`, `171442`, `818677`) are copied as catalogued and probably misreadings.
- Numbers of other prints mentioned in the note (“Grösseres Format von 662. P.Z.”, “Photochrom
  Nr. 1751 ist das gleiche Bild”), handwritten numbers and the inferred “Ermittelte
  Photochromnummer” are not taken. Suffixes are dropped (`1381.B.P.Z.` → `1381`, `8337-2. P.Z.` → `8337`).
- 89 numbers are printed on the back, not the front (noted as `auf der Rückseite`); they are
  included.

## candidates.csv

Pairs of two photochroms that the Candidates tab suggests with “Find pairs” (when one of the two is
in the user's selection). Every pairing method appends its own rows, so new methods need no code change.

| Column | Content |
|---|---|
| `mms_id_a`, `mms_id_b` | MMS IDs of the two photochroms (order does not matter; the selected one is shown on the left) |
| `method` | method and version, e.g. `siglip2-printarea-cosine-v1` |
| `score` | similarity or confidence, higher = closer; pairs are sorted by it |
| `retrieved` | date the row was made, `YYYY-MM-DD` |
| `review_status` | `unreviewed`, `confirmed` or `rejected` |

Painting pairs are not in this file: for works of the genre “Reproduction” the tab takes the painting
from `artwork-pairs.csv`.

## artwork-pairs.csv

The candidate pairs for the comparison view: photochrom (left) and the painting it reproduces (right).

How it was made: records with the GND subject “Reproduktion” or “Gemälde”, or with a reproduction
note, were selected from the catalogue. The artist's GND ID led to the artist in Wikidata, all works
of the artist (P170) were compared with the title and the reproduction note. Collection and year
from the note support the choice. Method `wikidata-p170-titel-2026-10-30`.

| match_status | n | meaning |
|---|---|---|
| `certain` | 153 | title and supporting evidence agree; 147 of them have a Commons image |
| `uncertain` | 38 | best candidate shown, check by eye |
| `no match` | 31 | artist found, work not found in Wikidata |
| `no artist` | 18 | no artist in the catalogue record |

Important columns:

- left side: `photochrom_iiif_manifest`, `photochrom_iiif_images`, `photochrom_doi` (232 of 240 are
  recatalogued and have IIIF)
- right side: `work_qid`, `commons_image_url` (178 rows), `museum_object_page` (44 rows),
  `collection`, `inventory_number`
- `note_work_*` are taken from the catalogue note by regex, not from Wikidata
- `review_status` is `unreviewed` for all rows: **the matching is machine-made and not checked.**
- One record (of 240) is not in the published dataset, because it has no image.

Most frequent collections: Museo del Prado (53), Louvre (30), Dresden (19), Kunsthistorisches
Museum Vienna (13), Musée d'Orsay (9).

## Thumbnails (IIIF level 0)

`scripts/build_thumbs_iiif.py` builds static thumbnails for all records from the preview ZIPs
(`images-legacy-preview.zip`, `images-recatalogued-preview.zip`): per image an `info.json`
(IIIF Image API 2.1, level 0) and one 300 px wide JPEG at `iiif/<img>/full/300,/0/default.jpg`.
The identifier is the catalog field `img` (image file name without extension). 9,591 images,
19,182 files, about 166 MB. They are published as a separate repository,
https://github.com/eliaskreyenbuehl/photochrom-images, served at
`https://eliaskreyenbuehl.github.io/photochrom-images/iiif` (`THUMB_IIIF_BASE` in `js/lib/catalog.js`). For local testing use
`?thumbs=<url>` (e.g. `?thumbs=http://127.0.0.1:8766/iiif` with `python -m http.server 8766`
in the thumbnails folder).

## Traps

- **Wikimedia Commons has no IIIF.** `commons_image_url` uses `Special:FilePath`, which can be
  resized with `?width=`. For a IIIF viewer on the right side, check each museum for its own IIIF
  service, or wrap the Commons image as a simple image source.
- **`Special:FilePath` breaks pixel access (CORS).** Its redirects send no CORS header, so the
  browser refuses canvas work on these URLs. Resolve them to `upload.wikimedia.org` /
  `thumb.wikimedia.org` URLs first: done in `data/commons-images.csv` (join on `commons_file`);
  details in `Outline.md`, section *CORS (cross-origin images)*.
- **Rights of museum images vary.** Photochroms are public domain; museum photographs may not be.
- Place points for countries and regions are centroids, not camera positions.
- 2,438 records are dated only `1891/1914`.
- Historical titles contain terms that are discriminatory today.
- Eight recatalogued records (nine images) have no image content or embedding, because their images
  were added after that analysis.
