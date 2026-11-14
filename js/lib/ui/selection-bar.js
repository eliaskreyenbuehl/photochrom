// Selection bar at the bottom of the Media Library and the Candidates tab: count of selected
// works, export (CSV, JSON), import, clear, plus tab-specific buttons and one primary action
// on the right. One implementation, so both tabs show the same labels, icons and behaviour.
//
//   const bar = createSelectionBar({
//     extra: [{ act: 'select-shown', icon: 'check-all', label: 'Select all shown' }],
//     primary: { act: 'to-pairing', icon: 'arrow-right', label: 'Open in Candidates' },
//     onAction(act) { … },   // extra and primary buttons
//   });
//   container.append(bar.element);
//   bar.update(ids);         // after every selection change

import { loadCatalog } from '../catalog.js';
import { exportCsv, exportJson, importFile } from '../exchange.js';
import { addToSelection, clearSelection, getSelection } from '../../state.js';
import { icon } from './icons.js';

const fmt = (n) => n.toLocaleString('en-US');
const CLEAR_TIMEOUT = 3000; // ms the "Click again to clear" state lasts

// trailing: icon after the label (arrows that point to where the button leads).
const button = ({ act, icon: name, label, title = '', primary = false, trailing = false }) =>
  `<button type="button" class="btn${primary ? ' btn-primary' : ''}" data-act="${act}"${title ? ` title="${title}"` : ''}>`
  + `${name && !trailing ? icon(name) : ''}<span class="btn-label">${label}</span>${name && trailing ? icon(name) : ''}</button>`;

export function createSelectionBar({ extra = [], primary, onAction = () => {} }) {
  const bar = document.createElement('div');
  bar.className = 'selbar';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Selection');
  bar.innerHTML = `
    <span class="selbar-count" aria-live="polite"></span>
    ${extra.length ? `<span class="selbar-group">${extra.map(button).join('')}</span><span class="sep" aria-hidden="true"></span>` : ''}
    <span class="selbar-group">
      ${button({ act: 'export-csv', icon: 'download', label: 'CSV', title: 'Export the selection as CSV' })}
      ${button({ act: 'export-json', icon: 'download', label: 'JSON', title: 'Export the selection as JSON' })}
      ${button({ act: 'import', icon: 'upload', label: 'Import…', title: 'Add works from a CSV or JSON file' })}
      ${button({ act: 'clear', icon: 'trash', label: 'Clear', title: 'Remove all works from the selection' })}
    </span>
    <input type="file" accept=".json,.csv,.txt" hidden>
    <span class="selbar-msg" aria-live="polite"></span>
    ${primary ? button({ ...primary, primary: true }) : ''}
  `;

  const fileInput = bar.querySelector('input[type=file]');
  const msg = bar.querySelector('.selbar-msg');
  const clearLabel = bar.querySelector('[data-act="clear"] .btn-label');
  let clearArmed = 0;

  function disarmClear() {
    clearTimeout(clearArmed);
    clearArmed = 0;
    clearLabel.textContent = 'Clear';
  }

  bar.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    msg.textContent = '';
    const ids = getSelection();
    if (act === 'export-csv') exportCsv(ids, await loadCatalog());
    else if (act === 'export-json') exportJson(ids);
    else if (act === 'import') fileInput.click();
    else if (act === 'clear') {
      // Two clicks instead of a confirm dialog.
      if (clearArmed) {
        disarmClear();
        clearSelection();
      } else {
        clearLabel.textContent = 'Click again to clear';
        clearArmed = setTimeout(disarmClear, CLEAR_TIMEOUT);
      }
    } else onAction(act, btn);
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    const { known, unknown } = await importFile(file, await loadCatalog());
    addToSelection(known);
    msg.textContent = `Imported ${fmt(known.length)} work${known.length === 1 ? '' : 's'}`
      + (unknown.length ? `, ${fmt(unknown.length)} unknown ID${unknown.length === 1 ? '' : 's'} skipped` : '');
  });

  return {
    element: bar,
    /** Count and enabled state after a selection change. */
    update(ids = getSelection()) {
      bar.querySelector('.selbar-count').innerHTML = `<strong>${fmt(ids.length)}</strong> selected`;
      for (const act of ['export-csv', 'export-json', 'clear']) bar.querySelector(`[data-act="${act}"]`).disabled = ids.length === 0;
    },
    /** A button of the bar (to change its label or disabled state). */
    button: (act) => bar.querySelector(`[data-act="${act}"]`),
    setLabel(act, text) { bar.querySelector(`[data-act="${act}"] .btn-label`).textContent = text; },
  };
}
