// User annotations as W3C Web Annotations (https://www.w3.org/TR/annotation-model/), the
// open standard also used by IIIF viewers. One annotation = one JSON file; format and
// folder layout: docs/annotations.md. This module only builds and reads the JSON; storage
// is js/lib/annotation-store.js, the UI js/lib/ui/annotations.js.
//
// The UI works with plain "fields" and never touches the JSON-LD directly:
//   { comment, tags: [string], media: [{ path, format }], region: { x, y, w, h } | null,
//     source, other: source | null }
//   region   fractions (0–1) of the whole image (the scan, not a crop of it), like
//            data/print-area.csv, so it fits every image size; stored as media fragment
//            "xywh=percent:…"
//   source   canonical web address of the annotated work (canonicalUrl() in js/lib/sources)
//   other    the image it was compared with (second target), or null

export const CONTEXT = 'http://www.w3.org/ns/anno.jsonld';
export const GENERATOR = {
  id: 'https://github.com/eliaskreyenbuehl/photochrom',
  type: 'Software',
  name: 'Photochrom research environment',
};
const MEDIA_FRAGMENTS = 'http://www.w3.org/TR/media-frags/';

/** ISO 8601 date with the local UTC offset, e.g. 2026-11-14T14:05:00+01:00. */
export function localIso(date = new Date()) {
  const pad = (n) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    + `${sign}${pad(offset / 60)}:${pad(offset % 60)}`;
}

const round = (v) => Math.round(v * 10000) / 100; // fraction -> percent, 2 decimals
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Region (fractions) -> FragmentSelector. */
export function regionSelector({ x, y, w, h }) {
  return { type: 'FragmentSelector', conformsTo: MEDIA_FRAGMENTS, value: `xywh=percent:${round(x)},${round(y)},${round(w)},${round(h)}` };
}

/** FragmentSelector -> region (fractions), or null if it is not a percent xywh fragment. */
export function selectorRegion(selector) {
  const m = String(selector?.value ?? '').match(/^xywh=percent:([\d.]+),([\d.]+),([\d.]+),([\d.]+)$/);
  if (!m) return null;
  const [x, y, w, h] = m.slice(1).map((v) => clamp01(Number(v) / 100));
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const sourceOf = (target) => (typeof target === 'string' ? target : target?.source ?? target?.id ?? null);

/** The annotation's targets as [{ source, region }]. */
export function targetsOf(annotation) {
  return asArray(annotation.target).map((t) => ({
    source: sourceOf(t),
    region: typeof t === 'object' ? selectorRegion(asArray(t.selector)[0]) : null,
  })).filter((t) => t.source);
}

/** Does the annotation concern this work (as main target or as compared image)? */
export const concerns = (annotation, source) => targetsOf(annotation).some((t) => t.source === source);

/** Relative paths of the media files (microscope images) an annotation links to. */
export const mediaPaths = (annotation) =>
  asArray(annotation.body).filter((b) => b?.type === 'Image' && typeof b.id === 'string' && !/^[a-z]+:/i.test(b.id)).map((b) => b.id);

/** Read an annotation into the plain fields the UI uses. */
export function fieldsOf(annotation) {
  const bodies = asArray(annotation.body);
  const text = bodies.find((b) => b?.type === 'TextualBody' && b.purpose !== 'tagging');
  const [main, other] = targetsOf(annotation);
  // Imported files may come from other tools: keep only values of the expected types.
  const str = (v) => (typeof v === 'string' ? v : '');
  return {
    id: annotation.id,
    comment: str(text?.value),
    tags: bodies.filter((b) => b?.purpose === 'tagging').map((b) => str(b.value) || str(b.id)).filter(Boolean),
    media: bodies.filter((b) => b?.type === 'Image' && typeof b.id === 'string').map((b) => ({ path: b.id, format: str(b.format) })),
    region: main?.region ?? null,
    source: main?.source ?? null,
    other: other?.source ?? null,
    creator: asArray(annotation.creator).map((c) => (typeof c === 'string' ? c : c?.name)).filter(Boolean).join(', '),
    created: annotation.created ?? '',
    modified: annotation.modified ?? '',
  };
}

function bodiesOf({ comment, tags, media }) {
  const bodies = [];
  const text = comment.trim();
  // With an image the text is its caption ("describing"), otherwise a comment.
  if (text) bodies.push({ type: 'TextualBody', purpose: media.length ? 'describing' : 'commenting', value: text, format: 'text/plain' });
  for (const tag of tags) bodies.push({ type: 'TextualBody', purpose: 'tagging', value: tag });
  for (const m of media) bodies.push({ id: m.path, type: 'Image', format: m.format || 'image/png' });
  return bodies;
}

const motivationOf = ({ comment, tags, media }) =>
  media.length ? 'describing' : comment.trim() ? 'commenting' : tags.length ? 'tagging' : 'commenting';

function targetOf({ source, region, other }) {
  const main = { source };
  if (region) main.selector = regionSelector(region);
  return other ? [main, { source: other }] : [main];
}

/** Normalise tags: trimmed, unique (case-insensitive), in input order. */
export function cleanTags(tags) {
  const seen = new Set();
  return tags.map((t) => t.trim().replace(/\s+/g, ' ')).filter((t) => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
}

/** New annotation from UI fields; `creator` is the annotator's name. */
export function createAnnotation(fields, creator) {
  const now = localIso();
  const annotation = {
    '@context': CONTEXT,
    id: `urn:uuid:${crypto.randomUUID()}`,
    type: 'Annotation',
    motivation: motivationOf(fields),
    created: now,
    modified: now,
    creator: { type: 'Person', name: creator },
    generator: GENERATOR,
    body: bodiesOf(fields),
    target: targetOf(fields),
  };
  return annotation;
}

/**
 * Edited copy of an annotation: id, created and creator stay; other people who edit it
 * are added as contributors. Unknown properties (from other tools) are kept.
 */
export function editAnnotation(annotation, fields, editor) {
  const creators = asArray(annotation.creator).map((c) => (typeof c === 'string' ? c : c?.name));
  const contributors = asArray(annotation.contributor);
  const known = [...creators, ...contributors.map((c) => (typeof c === 'string' ? c : c?.name))];
  const next = {
    ...annotation,
    motivation: motivationOf(fields),
    modified: localIso(),
    body: bodiesOf(fields),
    target: targetOf(fields),
  };
  if (editor && !known.includes(editor)) next.contributor = [...contributors, { type: 'Person', name: editor }];
  return next;
}

/** True if the JSON looks like a W3C annotation this app can read. */
export const isAnnotation = (json) =>
  Boolean(json && typeof json === 'object' && json.type === 'Annotation' && typeof json.id === 'string' && json.target);

/** File name of an annotation in the folder: its UUID (or a safe form of its id) + .json. */
export const fileNameOf = (id) => `${String(id).replace(/^urn:uuid:/, '').replace(/[^\w.-]+/g, '_').slice(0, 120)}.json`;
