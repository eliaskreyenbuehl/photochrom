// Storage of user annotations (comments, tags, regions, microscope images). The UI only
// talks to this module; a later app can replace it (e.g. with a REST API) and import the
// JSON files as they are. Format and folder layout: docs/annotations.md.
//
// Two places, one at a time:
//   folder   a local folder chosen by the user (File System Access API, Chrome and Edge),
//            outside this repository: annotations/<uuid>.json + media/<file>. The folder
//            handle is kept in IndexedDB; on later visits Chrome either still has the
//            permission or asks once (reconnect(), needs a click).
//   browser  IndexedDB of this browser profile and origin (Firefox, Safari, or before a
//            folder is connected). Survives reloads, not a cleared browser; back it up
//            with exportZip(). Connecting a folder moves these annotations into it.
//
//   await init();                          restore the folder (no prompt) or use the browser
//   getStatus()                            { mode: 'folder' | 'locked' | 'browser', folderName, count, … }
//   onChange(fn)                           after every change of status or annotations
//   connect() / reconnect() / disconnect() choose a folder / grant access again / use the browser
//   list(source)                           annotations of a work (canonicalUrl), newest first
//   storeMedia(file, hint) -> { path, format }   copy a microscope image into media/
//   save(annotation) / remove(id)
//   mediaUrl(path) -> blob URL | null
//   exportZip() / importZip(file)
//
// Media files in a folder are never deleted by the app (they may be captures the user
// put there); in browser storage, images no annotation uses any more are removed.

import { concerns, fileNameOf, isAnnotation, mediaPaths } from './annotation-model.js';
import { unzip, zipBlob } from './zip.js';

const DB_NAME = 'photochrom-annotations';
const ANNOTATION_DIR = 'annotations';
const MEDIA_DIR = 'media';

export const folderSupported = typeof window.showDirectoryPicker === 'function';

// ---------------------------------------------------------------------------
// IndexedDB

let dbPromise = null;

function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('annotations', { keyPath: 'id' });
      db.createObjectStore('media'); // key: relative path, value: Blob
      db.createObjectStore('settings'); // 'folder': FileSystemDirectoryHandle
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

/** Run one request in a transaction; resolves with its result once the transaction is done. */
async function idb(storeName, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const request = fn(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Storage transaction aborted.'));
  });
}

const browserBackend = {
  kind: 'browser',
  readAll: () => idb('annotations', 'readonly', (s) => s.getAll()),
  write: (annotation) => idb('annotations', 'readwrite', (s) => s.put(annotation)),
  delete: (id) => idb('annotations', 'readwrite', (s) => s.delete(id)),
  writeMedia: (path, blob) => idb('media', 'readwrite', (s) => s.put(blob, path)),
  readMedia: async (path) => (await idb('media', 'readonly', (s) => s.get(path))) ?? null,
  deleteMedia: (path) => idb('media', 'readwrite', (s) => s.delete(path)),
  async clear() {
    await idb('annotations', 'readwrite', (s) => s.clear());
    await idb('media', 'readwrite', (s) => s.clear());
  },
};

// ---------------------------------------------------------------------------
// Folder (File System Access API)

/** Path segments of a relative media path; rejects anything leaving the folder. */
function segments(path) {
  const parts = String(path).split('/');
  if (!parts.length || parts.some((p) => !p || p === '.' || p === '..' || p.includes('\\'))) throw new Error(`Invalid file path: ${path}`);
  return parts;
}

function folderBackend(root) {
  const fileOf = new Map(); // annotation id -> file name (imported files may be named differently)
  const dir = (name) => root.getDirectoryHandle(name, { create: true });

  async function fileHandle(path, create) {
    const parts = segments(path);
    let d = root;
    for (const part of parts.slice(0, -1)) d = await d.getDirectoryHandle(part, { create });
    return d.getFileHandle(parts.at(-1), { create });
  }

  async function writeFile(handle, data) {
    const writable = await handle.createWritable(); // written to a temporary file, swapped in on close
    try {
      await writable.write(data);
      await writable.close();
    } catch (err) {
      await writable.abort().catch(() => {});
      throw err;
    }
  }

  const notFound = (err) => err?.name === 'NotFoundError' || err?.name === 'TypeMismatchError';

  return {
    kind: 'folder',
    unreadable: 0, // JSON files that could not be read on the last readAll()
    async readAll() {
      fileOf.clear();
      this.unreadable = 0;
      const annotations = [];
      for await (const [name, handle] of (await dir(ANNOTATION_DIR)).entries()) {
        if (handle.kind !== 'file' || !name.endsWith('.json') || name.startsWith('.')) continue;
        try {
          const json = JSON.parse(await (await handle.getFile()).text());
          if (!isAnnotation(json)) throw new Error('not an annotation');
          annotations.push(json);
          fileOf.set(json.id, name);
        } catch (err) {
          this.unreadable++;
          console.warn(`Annotation file ${name} skipped:`, err);
        }
      }
      return annotations;
    },
    async write(annotation) {
      const name = fileOf.get(annotation.id) ?? fileNameOf(annotation.id);
      const handle = await (await dir(ANNOTATION_DIR)).getFileHandle(name, { create: true });
      await writeFile(handle, `${JSON.stringify(annotation, null, 2)}\n`);
      fileOf.set(annotation.id, name);
    },
    async delete(id) {
      try {
        await (await dir(ANNOTATION_DIR)).removeEntry(fileOf.get(id) ?? fileNameOf(id));
      } catch (err) {
        if (!notFound(err)) throw err;
      }
      fileOf.delete(id);
    },
    async writeMedia(path, blob) {
      await writeFile(await fileHandle(path, true), blob);
    },
    async readMedia(path) {
      try {
        return await (await fileHandle(path, false)).getFile();
      } catch (err) {
        if (notFound(err)) return null;
        throw err;
      }
    },
    async deleteMedia() {
      // Never delete files in the user's folder (see the top of this file).
    },
  };
}

// ---------------------------------------------------------------------------
// State

let backend = browserBackend;
let status = { mode: 'browser', folderName: '', error: '', unreadable: 0 };
let folderHandle = null; // remembered folder (also while access is not granted)
let ready = null;
const cache = new Map(); // id -> annotation
const mediaUrls = new Map(); // path -> blob URL
const listeners = new Set();

function emit() {
  for (const fn of listeners) fn(getStatus());
}

function releaseMediaUrls() {
  for (const url of mediaUrls.values()) URL.revokeObjectURL(url);
  mediaUrls.clear();
}

async function load(next, nextStatus) {
  const annotations = await next.readAll();
  backend = next;
  cache.clear();
  for (const a of annotations) if (isAnnotation(a)) cache.set(a.id, a);
  releaseMediaUrls();
  status = { ...nextStatus, error: '', unreadable: next.unreadable ?? 0 };
  emit();
}

async function useBrowser() {
  await load(browserBackend, { mode: 'browser', folderName: '' });
  // Ask the browser not to evict this origin's storage under pressure (may be ignored).
  navigator.storage?.persist?.().catch(() => {});
}

const useFolder = (handle) => load(folderBackend(handle), { mode: 'folder', folderName: handle.name });

/** Current place and number of annotations. */
export function getStatus() {
  return { ...status, count: cache.size, folderSupported };
}

/** Call fn(status) after every change; returns an unsubscribe function. */
export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Restore the remembered folder if access is still granted; otherwise browser storage. */
export function init() {
  ready ??= (async () => {
    try {
      folderHandle = folderSupported ? (await idb('settings', 'readonly', (s) => s.get('folder'))) ?? null : null;
      if (folderHandle) {
        if ((await folderHandle.queryPermission({ mode: 'readwrite' })) === 'granted') {
          await useFolder(folderHandle);
        } else {
          // Access must be granted again with a click (reconnect()); nothing is shown until then.
          backend = null;
          cache.clear();
          status = { mode: 'locked', folderName: folderHandle.name, error: '', unreadable: 0 };
          emit();
        }
        return;
      }
      await useBrowser();
    } catch (err) {
      console.error(err);
      backend = null;
      status = { mode: 'browser', folderName: '', error: `Annotation storage not available: ${err.message}`, unreadable: 0 };
      emit();
    }
  })();
  return ready;
}

/** Make sure annotations can be written; in 'locked' mode this asks for access (needs a click). */
async function writable() {
  await init();
  if (status.mode === 'locked') await reconnect();
  if (!backend) throw new Error(status.error || 'Annotation storage not available.');
  return backend;
}

/** Copy all annotations and media of browser storage into `target`; newer versions win. */
async function moveBrowserData(target, existing) {
  const annotations = await browserBackend.readAll();
  let moved = 0;
  for (const a of annotations) {
    for (const path of mediaPaths(a)) {
      const blob = await browserBackend.readMedia(path);
      if (blob && !(await target.readMedia(path))) await target.writeMedia(path, blob);
    }
    const there = existing.get(a.id);
    if (!there || newer(a, there)) await target.write(a);
    moved++;
  }
  if (moved) await browserBackend.clear();
  return moved;
}

const time = (a) => Date.parse(a.modified || a.created || '') || 0;
const newer = (a, b) => time(a) > time(b);

/**
 * Choose the annotation folder (Chrome, Edge). Annotations kept in the browser so far are
 * moved into it. Must be called from a click. Throws AbortError if the user cancels.
 * @returns {Promise<{ moved: number }>}
 */
export async function connect() {
  if (!folderSupported) throw new Error('This browser cannot write to folders. Use Chrome or Edge, or export ZIP files.');
  const handle = await window.showDirectoryPicker({ id: 'photochrom-annotations', mode: 'readwrite' });
  await init();
  const target = folderBackend(handle);
  const existing = new Map((await target.readAll()).map((a) => [a.id, a]));
  const moved = await moveBrowserData(target, existing);
  await idb('settings', 'readwrite', (s) => s.put(handle, 'folder'));
  folderHandle = handle;
  await useFolder(handle);
  return { moved };
}

/** Grant access to the remembered folder again (after a browser restart). Needs a click. */
export async function reconnect() {
  if (!folderHandle) throw new Error('No annotation folder chosen yet.');
  if ((await folderHandle.requestPermission({ mode: 'readwrite' })) !== 'granted') {
    throw new Error(`No access to the folder “${folderHandle.name}”.`);
  }
  await useFolder(folderHandle);
}

/** Forget the folder (its files stay where they are) and use browser storage. */
export async function disconnect() {
  await init();
  await idb('settings', 'readwrite', (s) => s.delete('folder'));
  folderHandle = null;
  await useBrowser();
}

/** Annotations that concern a work (main target or compared image), newest first. */
export function list(source) {
  return [...cache.values()].filter((a) => concerns(a, source)).sort((a, b) => time(b) - time(a));
}

/** Number of annotations per work (canonical address). */
export function countFor(source) {
  let n = 0;
  for (const a of cache.values()) if (concerns(a, source)) n++;
  return n;
}

/** Tags in use, most frequent first: [{ tag, count }]. */
export function tags() {
  const counts = new Map();
  for (const a of cache.values()) {
    const bodies = Array.isArray(a.body) ? a.body : [a.body];
    for (const b of bodies) {
      if (b?.purpose !== 'tagging' || !b.value) continue;
      const key = b.value.toLowerCase();
      const entry = counts.get(key) ?? { tag: b.value, count: 0 };
      entry.count++;
      counts.set(key, entry);
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

const EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/tiff': 'tif', 'image/webp': 'webp', 'image/gif': 'gif', 'image/bmp': 'bmp' };

/** yyyymmdd-hhmmss in local time. */
function stamp(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

const safeName = (name) => String(name).replace(/[^\w.-]+/g, '_').replace(/^\.+/, '').slice(0, 120) || 'file';

/**
 * Put an image file (microscope capture, upload) into media/ and return its relative path.
 * Named <capture time>_<hint>.<ext> (hint: e.g. the MMS ID). A file that is already in
 * media/ under its own name (capture.ps1 -OutDir <folder>/media) is linked, not copied.
 * @returns {Promise<{ path, format }>}
 */
export async function storeMedia(file, hint = 'image') {
  const target = await writable();
  const format = file.type || 'application/octet-stream';
  const same = async (path) => (await target.readMedia(path))?.size === file.size;

  const ownPath = `${MEDIA_DIR}/${safeName(file.name)}`;
  if (file.name && (await same(ownPath))) return { path: ownPath, format };

  const ext = EXTENSIONS[file.type] ?? (file.name.match(/\.([a-z0-9]{1,5})$/i)?.[1].toLowerCase() || 'bin');
  const base = `${MEDIA_DIR}/${stamp(new Date(file.lastModified || Date.now()))}_${safeName(hint)}`;
  for (let i = 1; i < 1000; i++) {
    const path = `${base}${i > 1 ? `-${i}` : ''}.${ext}`;
    const existing = await target.readMedia(path);
    if (existing && existing.size === file.size) return { path, format }; // the same file added again
    if (!existing) {
      await target.writeMedia(path, file);
      return { path, format };
    }
  }
  throw new Error('Too many files with the same name.');
}

/** Write an annotation (new or edited). */
export async function save(annotation) {
  if (!isAnnotation(annotation)) throw new Error('Not a valid annotation.');
  const target = await writable();
  await target.write(annotation);
  cache.set(annotation.id, annotation);
  emit();
}

/** Delete an annotation (and, in browser storage, images nothing else uses). */
export async function remove(id) {
  const target = await writable();
  const annotation = cache.get(id);
  await target.delete(id);
  cache.delete(id);
  if (annotation) {
    const used = new Set([...cache.values()].flatMap(mediaPaths));
    for (const path of mediaPaths(annotation)) if (!used.has(path)) await target.deleteMedia(path);
  }
  emit();
}

/** Blob URL of a media file, or null if it is missing. */
export async function mediaUrl(path) {
  if (mediaUrls.has(path)) return mediaUrls.get(path);
  if (!backend) return null;
  const blob = await backend.readMedia(path).catch(() => null);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  mediaUrls.set(path, url);
  return url;
}

/**
 * All annotations and their media as one ZIP (same layout as the folder).
 * @returns {Promise<{ blob, annotations, media, missing }>}
 */
export async function exportZip() {
  const source = await writable();
  const entries = [];
  const paths = new Set();
  for (const a of cache.values()) {
    entries.push({ name: `${ANNOTATION_DIR}/${fileNameOf(a.id)}`, data: `${JSON.stringify(a, null, 2)}\n`, date: new Date(time(a) || Date.now()) });
    for (const p of mediaPaths(a)) paths.add(p);
  }
  let missing = 0;
  for (const path of paths) {
    const blob = await source.readMedia(path).catch(() => null);
    if (blob) entries.push({ name: path, data: blob });
    else missing++;
  }
  return { blob: await zipBlob(entries), annotations: cache.size, media: paths.size - missing, missing };
}

/**
 * Add the annotations and media of a ZIP (export of this app, or a zipped annotation
 * folder). An annotation that exists already is replaced only by a newer version.
 * @returns {Promise<{ added, updated, unchanged, media, skipped }>}
 */
export async function importZip(file) {
  const target = await writable();
  const entries = (await unzip(file)).filter((e) => !e.name.startsWith('__MACOSX/') && !/(^|\/)\./.test(e.name));
  const result = { added: 0, updated: 0, unchanged: 0, media: 0, skipped: 0 };
  for (const entry of entries) {
    const path = entry.name.match(/(?:^|\/)(media\/[^/]+)$/)?.[1];
    if (!path) continue;
    if (await target.readMedia(path)) continue; // never overwrite a file that is there already
    const blob = await entry.blob();
    await target.writeMedia(path, new Blob([blob], { type: guessType(path) }));
    result.media++;
  }
  for (const entry of entries) {
    if (!/(?:^|\/)annotations\/[^/]+\.json$/.test(entry.name)) continue;
    let json = null;
    try { json = JSON.parse(await entry.text()); } catch { /* counted below */ }
    if (!isAnnotation(json)) {
      result.skipped++;
      continue;
    }
    const existing = cache.get(json.id);
    if (existing && !newer(json, existing)) {
      result.unchanged++;
      continue;
    }
    await target.write(json);
    cache.set(json.id, json);
    result[existing ? 'updated' : 'added']++;
  }
  emit();
  return result;
}

function guessType(path) {
  const ext = path.split('.').pop().toLowerCase();
  return Object.entries(EXTENSIONS).find(([, e]) => e === ext)?.[0] ?? (ext === 'jpeg' ? 'image/jpeg' : '');
}
