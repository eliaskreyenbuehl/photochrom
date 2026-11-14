# Plan: user-generated data (comments, tags, microscope images)

Status: proposal, 14.11.2026. Nothing of this is built yet.

## Goal

In the Image Comparison tab, an expert writes comments, assigns tags and adds documentation
images taken with the USB microscope. The data must

- survive reloads, browser changes and a cleared cache,
- hold large files (microscope frames are 2592 × 1944 px PNG, see `microscope-capture.md`),
- stay out of this public repository,
- carry provenance (who, when, how),
- move into the later app without conversion.

For now this only needs to work on the expert's own computer (local version).

## Constraints

- The site is static HTML (GitHub Pages), there is no server that could store anything.
- **`localStorage` is not enough:** about 5 MB, tied to one browser profile and one origin
  (`http://127.0.0.1:8790` and `http://localhost:8000` are separate stores). Fine for the
  selection, not for research data.
- **Not in the repo:** it is public, and images do not belong in it.

## Proposal

### 1. Storage: a local folder, written by the browser

Chrome and Edge offer the **File System Access API**: the page asks once for a folder
(`showDirectoryPicker()`) and may then read and write files in it. The folder handle is kept in
IndexedDB, so on later visits the browser only asks to confirm access (Chrome can remember the
permission permanently). It works on `localhost` and on HTTPS pages, so also on GitHub Pages;
the data never leaves the computer.

Suggested folder, outside the repo:

```
GLAMhack-Photochrom/
├── repo/                        this repository
└── annotations/                 chosen once in the app
    ├── annotations/
    │   └── <uuid>.json          one file per annotation
    └── media/
        └── <timestamp>_<mms_id>.png    microscope frames, uploads
```

One file per annotation (not one big file) keeps saves small, avoids losing everything on a
broken write, and makes merging two people's folders trivial.

The microscope script already takes an output folder: `capture.ps1 -OutDir <folder>/media`.

Firefox and Safari do not support the API. Fallback there: keep annotations in IndexedDB and
offer export/import as a ZIP (same layout as above).

### 2. Data model: W3C Web Annotation

Each annotation is a JSON file following the
[W3C Web Annotation Data Model](https://www.w3.org/TR/annotation-model/), the open standard
also used by IIIF viewers. That gives the later app a known format instead of a home-made one.

```json
{
  "@context": "http://www.w3.org/ns/anno.jsonld",
  "id": "urn:uuid:5f0c…",
  "type": "Annotation",
  "motivation": "commenting",
  "created": "2026-11-14T14:05:00+01:00",
  "modified": "2026-11-14T14:07:12+01:00",
  "creator": { "type": "Person", "name": "<expert>" },
  "target": {
    "source": "https://swisscollections.ch/Record/991004262849705501",
    "selector": { "type": "FragmentSelector", "conformsTo": "http://www.w3.org/TR/media-frags/", "value": "xywh=percent:12.5,40,20,15" }
  },
  "body": { "type": "TextualBody", "value": "Blue plate printed over the yellow here.", "format": "text/plain", "language": "en" }
}
```

- **Target:** the photochrom record (MMS ID as swisscollections URL). The optional selector marks
  a region in percent of width and height, so it fits every image size, like `print-area.csv`.
  Without a selector the annotation is about the whole image.
- **Pair context:** when an annotation is made while comparing two images, add the other image as
  a second target, so the comparison itself is documented.
- **Comment:** `motivation: "commenting"`, `TextualBody` as above.
- **Tag:** `motivation: "tagging"`, body `{ "type": "TextualBody", "purpose": "tagging", "value": "registration error" }`,
  or, with a controlled vocabulary, `{ "id": "https://d-nb.info/gnd/…", "purpose": "tagging" }`.
- **Microscope image:** `motivation: "describing"`, body `{ "id": "media/20261114-140500_991004262849705501.png", "type": "Image", "format": "image/png" }`,
  plus a `TextualBody` for the caption. Relative paths inside the folder; the later app rewrites
  them to its own URLs on import.

### 3. Code: one store module

```
js/lib/annotation-store.js
  connect()                      ask for / restore the folder
  list(mmsId)       → [annotation]
  save(annotation, files?)       write JSON (and media files)
  remove(id)
  exportZip() / importZip(file)
```

The Image Comparison tab only talks to this module. The later app replaces the module (e.g. with
a REST API and a database) and imports the JSON files as they are.

### 4. UI in the Image Comparison tab

1. "Connect annotation folder" button; status shows the folder name.
2. Image dialog: list of annotations for this image below the metadata; form for comment and tags.
3. Region: draw a rectangle on the zoomable image, stored as selector.
4. Microscope: "Add image" accepts a file (drag and drop from the capture folder) and links it to
   the current image and region.
5. Candidates tab, later: tags as a filter and as a pairing method (writes to `candidates.csv`).

## Steps

| # | Step | Result |
|---|---|---|
| 1 | `annotation-store.js` with folder access and IndexedDB fallback | save/list works in the console |
| 2 | Comments and tags in the image dialog | first real annotations |
| 3 | Microscope images (file input, drag and drop) | images linked to records |
| 4 | Regions (rectangle selector) | annotations on details |
| 5 | Export/import ZIP | exchange between computers, backup |
| 6 | Hand-over to the app | schema and sample folder for the app |

## Open questions

- **Publication:** will the annotations be published later (e.g. on Zenodo)? Under which licence,
  and with the expert's name as creator?
- **Tags:** free text, or a controlled vocabulary (GND, Getty AAT)? Free text first, with a list
  of tags already used, is the cheapest start.
- **Browser:** does the expert work in Chrome or Edge? Otherwise only the fallback works.
- **Several people:** will more than one person annotate? Then `creator` becomes mandatory and
  the folders need merging (easy with one file per annotation).
