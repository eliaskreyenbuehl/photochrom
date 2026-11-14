# User annotations: format and storage

Comments, tags, regions and microscope images written by users in the details dialog
(every tab; in the Image Comparison tab also from the sidebar group "Annotations").
Plan and background: [user-data-plan.md](user-data-plan.md).

Code: `js/lib/annotation-model.js` (JSON), `js/lib/annotation-store.js` (storage),
`js/lib/ui/annotations.js` (UI), `js/lib/ui/region-layer.js` (rectangles on the image),
`js/lib/zip.js` (export/import).

## Where the data is

| Mode | Browser | Where | Survives |
|---|---|---|---|
| **Folder** | Chrome, Edge | a folder on the computer, chosen once with "Connect folder…" | everything except deleting the folder |
| **Browser** | all | IndexedDB of this browser profile and origin | reloads; **not** clearing site data, not another browser or port |

- The folder handle is kept in IndexedDB. After a browser restart Chrome may ask again:
  the panel then shows "Allow access" (one click). Until then no annotations are shown.
- Connecting a folder **moves** the annotations kept in the browser into it.
- "Use browser storage" forgets the folder; its files stay.
- **Export ZIP** / **Import ZIP…** work in every browser: backup, moving between computers,
  merging the work of several people. On import an annotation with the same `id` is
  replaced only by a newer `modified`; media files already present are never overwritten.
- Choose a folder **outside this repository** (it is public). `annotations/` in the repo
  root is git-ignored as a safety net.
- Microscope captures can be written straight into the folder:
  `capture.ps1 -OutDir <folder>/media` (see [microscope-capture.md](microscope-capture.md)).
  A file dropped in the dialog that already is in `media/` under its own name (same size)
  is linked, not copied.
- The app never deletes files in the folder's `media/` (they may be captures put there by
  hand); deleting an annotation removes only its JSON file. In browser storage, images no
  annotation uses any more are deleted with it.

## Folder layout (also the ZIP layout)

```
<annotation folder>/
├── annotations/
│   └── <uuid>.json                        one file per annotation
└── media/
    └── <yyyymmdd-hhmmss>_<mms_id>.png     microscope frames and other images
```

Media names use the file's last-modified time (= capture time) and the MMS ID of the
annotated photochrom (other images: a short form of their key). The import also accepts a
zipped folder (`<name>/annotations/…`, `<name>/media/…`).

## JSON: W3C Web Annotation

Each file is one [W3C Web Annotation](https://www.w3.org/TR/annotation-model/). Example
(comment + tags + microscope image + region, made while comparing with a painting):

```json
{
  "@context": "http://www.w3.org/ns/anno.jsonld",
  "id": "urn:uuid:c483845e-5b83-422a-a9f6-4bd7504e31bd",
  "type": "Annotation",
  "motivation": "describing",
  "created": "2026-11-14T14:13:43+01:00",
  "modified": "2026-11-14T14:20:05+01:00",
  "creator": { "type": "Person", "name": "<expert>" },
  "generator": { "id": "https://github.com/eliaskreyenbuehl/photochrom", "type": "Software", "name": "Photochrom research environment" },
  "body": [
    { "type": "TextualBody", "purpose": "describing", "value": "Blue plate printed over the yellow here.", "format": "text/plain" },
    { "type": "TextualBody", "purpose": "tagging", "value": "registration error" },
    { "id": "media/20261114-141343_991026887059705501.png", "type": "Image", "format": "image/png" }
  ],
  "target": [
    {
      "source": "https://swisscollections.ch/Record/991026887059705501",
      "selector": { "type": "FragmentSelector", "conformsTo": "http://www.w3.org/TR/media-frags/", "value": "xywh=percent:20.8,27.18,29.2,25.36" }
    },
    { "source": "https://commons.wikimedia.org/wiki/File:Fran%C3%A7oise_Foliot_-_Charles_Gleyre_-_Le_Soir.jpg" }
  ]
}
```

Rules (what this app writes; readers should also accept a single object instead of an array):

- **One save = one annotation.** `body` and `target` are always arrays.
- **Bodies:** the text is a `TextualBody` with `purpose` `"commenting"`, or `"describing"`
  when the annotation has an image (it is then the caption). Each tag is a `TextualBody` with
  `purpose: "tagging"` (free text; a controlled vocabulary would use `{ "id": "<GND/AAT URI>", "purpose": "tagging" }`).
  Each image is `{ "id": "media/…", "type": "Image", "format": … }`, a path relative to the folder;
  a later app rewrites it to its own URLs on import.
- **motivation:** `describing` if there is an image, else `commenting` if there is text, else `tagging`.
- **First target = the annotated work**, as a stable web address (`canonicalUrl()` in
  `js/lib/sources/index.js`): the swisscollections record for catalog photochroms, the
  Commons file page for Commons images (however they were linked), otherwise the source page
  or the image URL. Not the image file: the same work has several image sizes and hosts.
- **Region:** optional `FragmentSelector` on the first target, `xywh=percent:x,y,w,h` in percent of
  the **whole scan** (like `print-area.csv`), also when the dialog shows the photochrom cropped
  to the print. No selector = the whole image.
- **Second target (optional) = the compared image**, when the annotation was made in the Image
  Comparison tab (checkbox "Link to the compared image", on by default).
- **Provenance:** `creator` (name typed in the form, remembered in this browser), `created`
  and `modified` (local time with UTC offset), `generator` (this app). Someone else editing
  is added to `contributor`. Properties the app does not know are kept when editing.

## Open points

- Publication (Zenodo?), licence of the annotations, and whether the creator's name is published.
- Tags: free text for now, with suggestions of tags already used. Controlled vocabulary later.
- Candidates tab: tags as filter and pairing method (not built yet).
- Several annotators: works through ZIP export/import (one file per annotation merges cleanly);
  no live sharing (not possible on a static site).
