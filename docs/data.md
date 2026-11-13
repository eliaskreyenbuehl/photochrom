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
| `data/zenodo/photochrom-metadata.csv` | 9,610 | `identifier_swisscollections` | catalogue data, DOI, `iiif_manifest_url`, `iiif_image_uris`, primary coordinates (`geo_primary_lat/lon`) |
| `data/zenodo/photochrom-image-content.csv` | 9,610 | `mms_id` | machine-generated image content: `genre`, people, buildings, mountains, water … as yes/no columns, short English description |
| `data/zenodo/photochrom-places.csv` | 12,676 | `identifier_swisscollections` | every place mention with GND, Wikidata and coordinates |
| `data/zenodo/photochrom-main-place.csv` | 4,224 | `identifier_swisscollections` | main motif per legacy record (partial) |
| `data/zenodo/embeddings-siglip2/embeddings.npy` | 9,582 × 1152, float32 | row number | SigLIP 2 image vectors for similarity and free-text search |
| `data/zenodo/embeddings-siglip2/dateien.csv` | 9,582 | `zeile` (= row), `image_filename` | maps each vector row to an image |
| `data/catalog.json` | 9,604 | `id` (MMS ID) | **derived**: compact join of the files above for the web app, built by `scripts/build_catalog.py`; field list and provenance in its `fields` block. Records starting after 1914 are excluded (6, listed in its `excluded` block): photochrom production ended 1914 |
| `data/artwork-pairs.csv` | 240 | `mms_id` | **photochroms that reproduce paintings, matched to the original artwork** (see below) |

## Links between files

- `identifier_swisscollections` = `mms_id` = MMS ID of the catalogue record. **Always read it as text**,
  never as a number. Record page: `https://swisscollections.ch/Record/<MMS ID>`.
- Image file names: recatalogued = page VLID (`30418784.jpg` → `https://www.e-rara.ch/id/30418784`),
  legacy = MARC 993$a (`400013004.jpg`). `image_files` in the metadata gives the path inside the Zenodo ZIPs.
- IIIF image URL pattern (recatalogued): `https://www.e-rara.ch/i3f/v21/<VLID>/full/,560/0/default.jpg`.
- Several values in one cell are separated by ` | `.

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
19,182 files, about 166 MB. They are published as a separate repository (`photochrom-images`),
not in this one. Set `THUMB_IIIF_BASE` in `js/lib/catalog.js` to its URL; for local testing use
`?thumbs=<url>` (e.g. `?thumbs=http://127.0.0.1:8766/iiif` with `python -m http.server 8766`
in the thumbnails folder).

## Traps

- **Wikimedia Commons has no IIIF.** `commons_image_url` uses `Special:FilePath`, which can be
  resized with `?width=`. For a IIIF viewer on the right side, check each museum for its own IIIF
  service, or wrap the Commons image as a simple image source.
- **Rights of museum images vary.** Photochroms are public domain; museum photographs may not be.
- Place points for countries and regions are centroids, not camera positions.
- 2,438 records are dated only `1891/1914`.
- Historical titles contain terms that are discriminatory today.
- Eight recatalogued records (nine images) have no image content or embedding, because their images
  were added after that analysis.
