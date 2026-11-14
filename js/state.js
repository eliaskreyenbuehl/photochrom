// Shared state between tabs. Tabs never import each other; they talk through this module.
//
// selection      MMS IDs chosen in the Media Library as main images (left side of a pair).
//                Kept in this browser only (localStorage), never sent anywhere.
// comparisonPair the pair currently shown in the Image Comparison tab. To open a pair there:
//                  setComparisonPair(pair); showTab('comparison');   // showTab from js/main.js
//
// Pair shape (see js/tabs/comparison/pairs.js for how the sample pairs are built):
//   {
//     id: 'gleyre-le-soir',          // unique id, used in screenshot file names
//     label: 'Gleyre – Le Soir',     // shown in the pair selector
//     left:  { role, label, number, title, year, url, credit, creditUrl, fields },
//     right: { role, label, number, title, year, url, credit, creditUrl, fields },
//   }
//   role: 'original' | 'photochrom' (selects the metadata fields; both sides may be photochroms)
//   number: photochrom number, if any; label: display name, e.g. "No. 73 · Le soir"
//     (optional, built from number + title by imageName() in comparison/pairs.js)
//   title, year: shown under the image; fields: all metadata { column: value }

const SELECTION_KEY = 'photochrom.selection.v1';

let selection = new Set(readStored());
const selectionListeners = new Set();

function readStored() {
  try {
    const value = JSON.parse(localStorage.getItem(SELECTION_KEY) || '[]');
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return []; // storage blocked or corrupt: start empty
  }
}

function storeAndNotify() {
  try {
    localStorage.setItem(SELECTION_KEY, JSON.stringify([...selection]));
  } catch {
    // storage unavailable (private mode): selection lives until reload
  }
  for (const fn of selectionListeners) fn(getSelection());
}

export const getSelection = () => [...selection];
export const isSelected = (id) => selection.has(id);

export function setSelected(id, on) {
  if (on === selection.has(id)) return;
  if (on) selection.add(id); else selection.delete(id);
  storeAndNotify();
}

/** Adds many IDs at once (one notification). */
export function addToSelection(ids) {
  const before = selection.size;
  for (const id of ids) selection.add(String(id));
  if (selection.size !== before) storeAndNotify();
}

export function removeFromSelection(ids) {
  const before = selection.size;
  for (const id of ids) selection.delete(String(id));
  if (selection.size !== before) storeAndNotify();
}

export function clearSelection() {
  if (!selection.size) return;
  selection = new Set();
  storeAndNotify();
}

/** Calls fn(ids) on every change; returns an unsubscribe function. */
export function onSelectionChange(fn) {
  selectionListeners.add(fn);
  return () => selectionListeners.delete(fn);
}

let comparisonPair = null;
const pairListeners = new Set();

export const getComparisonPair = () => comparisonPair;

export function setComparisonPair(pair) {
  comparisonPair = pair;
  for (const fn of pairListeners) fn(pair);
}

export function onComparisonPairChange(fn) {
  pairListeners.add(fn);
  return () => pairListeners.delete(fn);
}
