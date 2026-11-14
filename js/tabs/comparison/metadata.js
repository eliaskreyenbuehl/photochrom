// Metadata of one image (shown in the image dialog): key fields plus a disclosure
// with every column. Values come from the pair's `fields` (columns of sample-metadata.csv).

import { doiUrl, isUrl, rightsLabel } from './pairs.js';

const list = (s) => (s ? s.split('###').map((v) => v.trim()).filter(Boolean) : []);
// "Musizieren, ID: (DE-588)4170838-6" -> "Musizieren"
const stripAuthorityIds = (s) => s.replace(/,? ID: \([^)]*\)[^\s,]*/g, '').replace(/, Role: /g, ' – ');
const link = (text, href) => (href ? { text, href } : text);
/** A link with a fixed text ("Manifest"): nothing when there is no URL. */
const linkOnly = (text, href) => (href ? { text, href } : '');

// [label, (fields) => string | string[] | { text, href }]
const KEY_FIELDS = {
  original: [
    ['Artist', (f) => f.pair_artist_name],
    ['Work', (f) => f.pair_work_label],
    ['Title in catalogue note', (f) => f.pair_note_work_title],
    ['Date', (f) => f.pair_note_work_date || f.pair_work_year],
    ['Collection', (f) => f.pair_collection],
    ['Location', (f) => f.pair_location],
    ['Inventory number', (f) => f.pair_inventory_number],
    ['Wikidata', (f) => link(f.pair_work_qid, f.pair_work_wikidata_url)],
    ['Image size', (f) => (f.original_full_width ? `${f.original_full_width} × ${f.original_full_height} px` : '')],
    ['Image credit', (f) => f.original_image_credit],
    ['Licence', (f) => link(f.original_image_license, f.original_image_license_url)],
    ['Image source', (f) => linkOnly('Wikimedia Commons', f.original_commons_page)],
    ['Pair match', (f) => (f.pair_match_status ? `${f.pair_match_status} (score ${f.pair_match_score}), ${f.pair_review_status}` : '')],
  ],
  photochrom: [
    ['Photochrom number', (f) => f.photochrom_number],
    ['Title', (f) => f.photochrom_title || f.title],
    ['Statement of responsibility', (f) => f.photochrom_statement_of_responsibility],
    ['Date', (f) => f.photochrom_date_of_publication_or_production || f.date],
    ['Depicted place', (f) => f.place],
    ['Publisher', (f) => f.photochrom_publisher_or_producer],
    ['Place', (f) => f.photochrom_place_of_publication_or_production],
    ['Physical description', (f) => f.photochrom_physical_description],
    ['Call number', (f) => f.photochrom_library_call_number],
    ['People', (f) => list(f.photochrom_person).map(stripAuthorityIds)],
    ['Subjects', (f) => list(f.photochrom_subject_topic).map(stripAuthorityIds)],
    ['Notes', (f) => list(f.photochrom_general_note)],
    ['DOI', (f) => link(f.photochrom_digital_object_identifier, doiUrl(f.photochrom_digital_object_identifier))],
    ['IIIF manifest', (f) => linkOnly('Manifest', f.photochrom_iiif_manifest_url || f.iiif_manifest)],
    ['Rights', (f) => [f.photochrom_digital_reproduction_rights_owner, rightsLabel(f.photochrom_digital_reproduction_copyright)].filter(Boolean).join(', ')],
    ['Catalog record', (f) => linkOnly('swisscollections', f.record)],
  ],
  // Images loaded from a link (Wikimedia Commons, e-rara items outside the library).
  external: [
    ['Title', (f) => f.title || f.Titel],
    ['Artist', (f) => f.artist],
    ['Date', (f) => f.date || f.Impressum],
    ['Licence', (f) => link(f.license, f.license_url)],
    ['Credit', (f) => f.credit],
    ['Holding institution', (f) => f['Besitzende Institution']],
    ['Extent', (f) => f.size || f.Umfang],
    ['Description', (f) => f.description],
    ['Source', (f) => (f.file_page ? linkOnly('Wikimedia Commons', f.file_page) : f.source)],
  ],
};

function isEmpty(value) {
  if (Array.isArray(value)) return value.length === 0;
  if (value && typeof value === 'object') return !value.text;
  return !value;
}

/** Render a value (string, list or link) into `parent`. Only http(s) URLs become links. */
function appendValue(parent, value) {
  if (Array.isArray(value)) {
    if (value.length === 1) return appendValue(parent, value[0]);
    const ul = document.createElement('ul');
    for (const v of value) {
      const li = document.createElement('li');
      appendValue(li, v);
      ul.append(li);
    }
    parent.append(ul);
  } else if (value && typeof value === 'object') {
    if (isUrl(value.href)) {
      const a = document.createElement('a');
      a.href = value.href;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = value.text;
      parent.append(a);
    } else {
      parent.append(value.text);
    }
  } else if (isUrl(value) && !/\s/.test(value)) {
    appendValue(parent, { text: value, href: value });
  } else {
    parent.append(String(value));
  }
}

function definitionList(entries, className) {
  const dl = document.createElement('dl');
  dl.className = className;
  for (const [label, value] of entries) {
    if (isEmpty(value)) continue;
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    appendValue(dd, value);
    dl.append(dt, dd);
  }
  return dl;
}

/**
 * Metadata of one image: curated key fields plus a disclosure with every column.
 * @param image  one side of a pair ({ role, fields })
 */
export function metadataSection(image) {
  const section = document.createElement('div');
  section.className = 'cmp-meta';

  const fields = image.fields ?? {};
  const keyEntries = (KEY_FIELDS[image.role] ?? []).map(([label, get]) => [label, get(fields)]);
  const allEntries = Object.entries(fields)
    .filter(([, v]) => v !== '')
    .map(([key, v]) => [key, v.includes('###') ? list(v) : v]);

  if (keyEntries.some(([, v]) => !isEmpty(v))) section.append(definitionList(keyEntries, 'meta-key'));
  else section.append(Object.assign(document.createElement('p'), { className: 'placeholder', textContent: 'No metadata available.' }));

  if (allEntries.length) {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = `All fields (${allEntries.length})`;
    details.append(summary, definitionList(allEntries, 'meta-all'));
    section.append(details);
  }
  return section;
}
