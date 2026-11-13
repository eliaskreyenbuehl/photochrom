// Shared app state between tabs.
//
// The comparison pair is set here instead of importing the comparison tab
// directly, e.g. from a gallery:
//   import { setComparisonPair } from '../state.js';
//   import { showTab } from '../main.js';
//   setComparisonPair(pair);
//   showTab('comparison');
//
// Pair shape (see js/tabs/comparison/pairs.js for how sample pairs are built):
//   {
//     id: 'gleyre-le-soir',          // unique id, used in screenshot file names
//     label: 'Gleyre – Le Soir',     // shown in the pair selector
//     left:  { role, label, url, credit, creditUrl, fields },  // fields: metadata
//     right: { role, label, url, credit, creditUrl, fields },  //   { column: value }
//   }

const events = new EventTarget();
let comparisonPair = null;

export function setComparisonPair(pair) {
  comparisonPair = pair;
  events.dispatchEvent(new Event('comparisonpair'));
}

export function getComparisonPair() {
  return comparisonPair;
}

/** Call `listener(pair)` whenever the comparison pair changes. */
export function onComparisonPairChange(listener) {
  events.addEventListener('comparisonpair', () => listener(comparisonPair));
}
