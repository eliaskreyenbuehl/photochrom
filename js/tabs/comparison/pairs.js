// Comparison pairs built from the sample metadata CSV (one row per pair).
// Left = original painting, right = photochrom (see the pair shape in js/state.js).

import { SAMPLE_IMAGE_DIR, SAMPLE_METADATA_URL } from '../../config.js';
import { dateLabel, fullImageUrl, imageUrl, loadCatalog, recordUrl } from '../../lib/catalog.js';
import { loadCsvObjects } from '../../lib/csv.js';

const ARTWORK_PAIRS_URL = 'data/artwork-pairs.csv';
const COMMONS_IMAGES_URL = 'data/commons-images.csv';

// Longest side requested for photochroms in the comparison (zoom quality).
// Recatalogued: e-rara IIIF scales to fit (4K scans); legacy: the 2K scan, its largest version.
const PHOTOCHROM_ZOOM_SIZE = 4000;

const pick = (row, prefixes) =>
  Object.fromEntries(Object.entries(row).filter(([key]) => prefixes.some((p) => key.startsWith(p))));

export const isUrl = (s) => /^https?:\/\//.test(s);
export const doiUrl = (doi) => (doi ? `https://doi.org/${doi}` : '');
/** Readable copyright of a photochrom reproduction ('pdm' = Public Domain Mark). */
export const rightsLabel = (code) => (code === 'pdm' ? 'Public Domain Mark' : code);

function originalCredit(row) {
  const work = [row.original_image_author, row.pair_work_label].filter(Boolean).join(', ');
  const year = row.pair_work_year ? ` (${row.pair_work_year})` : '';
  const photo = row.original_image_credit && !isUrl(row.original_image_credit) ? ` Photo: ${row.original_image_credit},` : '';
  return `${work}${year}.${photo} ${row.original_image_license || 'rights unknown'}`;
}

function photochromCredit(row) {
  const rights = rightsLabel(row.photochrom_digital_reproduction_copyright);
  const date = row.photochrom_date_of_publication_or_production;
  return `${row.photochrom_title}${date ? `, ${date}` : ''}. ${row.photochrom_digital_reproduction_rights_owner}, ${rights}`;
}

/** Turn one sample-metadata row into a comparison pair. */
function pairFromRow(row) {
  return {
    id: row.sample_id,
    label: `${row.original_image_author || row.pair_artist_name} – ${row.pair_work_label || row.photochrom_title}`,
    left: {
      role: 'original',
      label: 'Original',
      title: row.pair_work_label || row.pair_note_work_title,
      year: row.pair_work_year,
      url: SAMPLE_IMAGE_DIR + row.original_file,
      credit: originalCredit(row),
      creditUrl: row.original_commons_page,
      fields: pick(row, ['pair_', 'original_']),
    },
    right: {
      role: 'photochrom',
      label: 'Photochrom',
      title: row.photochrom_title,
      year: row.photochrom_date_of_publication_or_production,
      url: SAMPLE_IMAGE_DIR + row.photochrom_file,
      credit: photochromCredit(row),
      creditUrl: doiUrl(row.photochrom_digital_object_identifier),
      fields: pick(row, ['photochrom_']),
      recordId: row.photochrom_identifier_swisscollections, // catalog record (for the print area)
    },
  };
}

/** Load all sample pairs. */
export async function loadSamplePairs() {
  const rows = await loadCsvObjects(SAMPLE_METADATA_URL);
  return rows.map(pairFromRow);
}

/**
 * One side of a pair for a photochrom from the catalog (data/catalog.json record).
 * Loaded in zoom quality via fullImageUrl(), 300 px thumbnail as fallback.
 * `extraFields` are added to the metadata (e.g. how the pair was found).
 */
export function photochromSide(rec, extraFields = {}) {
  return {
    role: 'photochrom',
    label: 'Photochrom',
    title: rec.t,
    year: dateLabel(rec),
    url: fullImageUrl(rec, PHOTOCHROM_ZOOM_SIZE),
    fallbackUrl: imageUrl(rec, 300), // own thumbnail service, if the full image is missing
    credit: `${rec.t}${rec.d ? `, ${rec.d}` : ''}. Zentralbibliothek Zürich, Public Domain Mark`,
    creditUrl: rec.doi ? doiUrl(rec.doi) : recordUrl(rec),
    fields: { title: rec.t, date: rec.d, place: rec.p, countries: rec.c.join(', '), mms_id: rec.id,
      subset: rec.s === 'r' ? 'recatalogued (IIIF)' : 'legacy', ...extraFields },
    recordId: rec.id,
  };
}

/**
 * Painting pairs from the catalog: photochroms that reproduce a painting, matched to the
 * painting via Wikidata (data/artwork-pairs.csv, machine-made, unreviewed), with a
 * CORS-enabled Commons image (data/commons-images.csv). Left = painting, right = photochrom,
 * as in the sample pairs. The photochrom is loaded in zoom quality via fullImageUrl().
 */
export async function loadArtworkPairs() {
  const [catalog, pairRows, commonsRows] = await Promise.all([
    loadCatalog(), loadCsvObjects(ARTWORK_PAIRS_URL), loadCsvObjects(COMMONS_IMAGES_URL),
  ]);
  const commons = new Map(commonsRows.filter((c) => c.status === 'ok').map((c) => [c.commons_file, c]));
  const pairs = [];
  for (const row of pairRows) {
    if (!['certain', 'uncertain'].includes(row.match_status)) continue;
    const img = commons.get(row.commons_file);
    const rec = catalog.byId.get(row.mms_id);
    if (!img || !rec || !fullImageUrl(rec)) continue;
    const work = row.work_label || row.note_work_title;
    const photo = [img.artist && `Photo: ${img.artist}`, img.license].filter(Boolean).join(', ');
    pairs.push({
      id: `art-${row.mms_id}`,
      label: `${row.artist_name} – ${work}${row.match_status === 'uncertain' ? ' (uncertain match)' : ''}`,
      left: {
        role: 'original',
        label: 'Original',
        title: work,
        year: row.work_year,
        url: img.thumb_url,
        credit: `${row.artist_name}, ${work}${row.work_year ? ` (${row.work_year})` : ''}. ${row.collection || ''}${photo ? `. ${photo}` : ''}`,
        creditUrl: row.commons_file,
        fields: { ...pick(row, ['artist_', 'work_', 'note_work_', 'collection', 'location', 'inventory_number', 'museum_object_page', 'match_']),
          commons_license: img.license, commons_artist: img.artist, commons_credit: img.credit },
      },
      right: photochromSide(rec, { match_status: row.match_status, review_status: row.review_status }),
      group: 'painting',
    });
  }
  return pairs.sort((a, b) => a.label.localeCompare(b.label));
}
