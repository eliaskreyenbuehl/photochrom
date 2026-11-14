// Filter model of the Media Library (pure logic, no DOM).
//
// Within a facet group the values are combined with OR, between groups with AND.
// Facet counts for a group are computed with all *other* groups applied, so a facet
// shows how many records you get when you add it.

export const GROUPS = ['genre', 'country', 'feature', 'source'];

export const SOURCES = [
  ['iiif', 'With image (IIIF)'],
  ['painting', 'Reproduces a painting'],
];

export function emptyFilters() {
  return {
    years: null,        // [from, to] or null; a record matches if its date range overlaps
    exactOnly: false,   // only records dated to a single year
    genre: new Set(),
    country: new Set(),
    feature: new Set(), // indices into catalog.features
    source: new Set(),
    query: '',
  };
}

export function isEmpty(f) {
  return !f.years && !f.exactOnly && !f.query && GROUPS.every((g) => f[g].size === 0);
}

/** Usable for the date filter: dated within 1889–1914 (open or capped ends are set to 1914). */
export const datable = (r) => r.y0 != null && r.df !== 'suspect';
/** Dated to a single year, without any correction. */
export const exactlyDated = (r) => datable(r) && !r.df && r.y0 === r.y1;

function matchYears(r, f) {
  if (f.exactOnly && !exactlyDated(r)) return false;
  if (!f.years) return true;
  if (!datable(r)) return false;
  return r.y0 <= f.years[1] && r.y1 >= f.years[0];
}

function matchGroup(r, f, group) {
  const set = f[group];
  if (!set.size) return true;
  switch (group) {
    case 'genre': return set.has(r.g);
    case 'country': return r.c.some((c) => set.has(c));
    case 'feature': for (const i of set) if (r.f & (1 << i)) return true; return false;
    case 'source':
      return (set.has('iiif') && !!r.iiif) || (set.has('painting') && !!r.art);
    default: return true;
  }
}

/** Lower-cased search text per record, cached on the record. */
function haystack(r) {
  if (r._q === undefined) r._q = `${r.t} ${r.p} ${r.c.join(' ')} ${r.id}`.toLowerCase();
  return r._q;
}

function matchQuery(r, f) {
  if (!f.query) return true;
  return f.query.toLowerCase().split(/\s+/).filter(Boolean).every((w) => haystack(r).includes(w));
}

/**
 * Does record r pass all filters, ignoring the parts named in `skip`
 * ('years', or one of GROUPS)?
 */
export function matches(r, f, skip = null) {
  if (skip !== 'years' && !matchYears(r, f)) return false;
  if (!matchQuery(r, f)) return false;
  for (const g of GROUPS) if (g !== skip && !matchGroup(r, f, g)) return false;
  return true;
}

/** Counts per facet value, each group computed with the other groups applied. */
export function facetCounts(records, f) {
  const counts = { genre: new Map(), country: new Map(), feature: new Map(), source: new Map() };
  const inc = (m, k) => m.set(k, (m.get(k) || 0) + 1);
  for (const r of records) {
    for (const g of GROUPS) {
      if (!matches(r, f, g)) continue;
      if (g === 'genre' && r.g) inc(counts.genre, r.g);
      else if (g === 'country') for (const c of r.c) inc(counts.country, c);
      else if (g === 'feature') {
        for (let i = 0; r.f >> i; i++) if (r.f & (1 << i)) inc(counts.feature, i);
      } else if (g === 'source') {
        if (r.iiif) inc(counts.source, 'iiif');
        if (r.art) inc(counts.source, 'painting');
      }
    }
  }
  return counts;
}
