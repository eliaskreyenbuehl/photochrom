// The sample pairs (data/sample/sample-metadata.csv, one row per pair): the comparison
// tab starts with one of them. Other images are chosen with the image search
// (js/lib/sources). See the pair shape in js/state.js.
//
// Images are named by photochrom number (if any) and title, never by role: a pair can
// also be two photochroms, so the UI says "Left"/"Right" where a short name is needed.
// `role` ('original' | 'photochrom') only selects the metadata fields to show.

import { SAMPLE_IMAGE_DIR, SAMPLE_METADATA_URL } from '../../config.js';
import { loadCsvObjects } from '../../lib/csv.js';
import { imageName } from '../../lib/sources/index.js';

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
      key: `sample:${row.sample_id}-painting`,
      role: 'original',
      label: imageName({ title: row.pair_work_label || row.pair_note_work_title }),
      title: row.pair_work_label || row.pair_note_work_title,
      year: row.pair_work_year,
      url: SAMPLE_IMAGE_DIR + row.original_file,
      credit: originalCredit(row),
      creditUrl: row.original_commons_page,
      fields: pick(row, ['pair_', 'original_']),
    },
    right: {
      key: row.photochrom_identifier_swisscollections ? `catalog:${row.photochrom_identifier_swisscollections}` : `sample:${row.sample_id}-photochrom`,
      role: 'photochrom',
      label: imageName({ number: row.photochrom_number, title: row.photochrom_title }),
      number: row.photochrom_number,
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
