// Comparison pairs built from the sample metadata CSV (one row per pair).
// Left = original painting, right = photochrom (see the pair shape in js/state.js).

import { SAMPLE_IMAGE_DIR, SAMPLE_METADATA_URL } from '../../config.js';
import { loadCsvObjects } from '../../lib/csv.js';

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
    },
  };
}

/** Load all sample pairs. */
export async function loadSamplePairs() {
  const rows = await loadCsvObjects(SAMPLE_METADATA_URL);
  return rows.map(pairFromRow);
}
