// Shared state between tabs. Tabs never import each other; they talk through this module.
//
// selection      MMS IDs chosen in the Media Library as main images (left side of a pair).
//                Kept in this browser only (localStorage), never sent anywhere.
// comparisonPair the pair currently shown in the Image Comparison tab.

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
