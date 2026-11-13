// Detail panel for one record (opens on the right, or full width on small screens).

import { dateLabel, doiUrl, escapeHtml, imageUrl, recordUrl } from '../../lib/catalog.js';
import { isSelected, setSelected } from '../../state.js';

export function createDetails(container, catalog) {
  const panel = document.createElement('aside');
  panel.className = 'ml-details';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Record details');
  container.append(panel);

  let current = null;

  panel.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) close();
  });
  panel.addEventListener('change', (e) => {
    if (e.target.matches('[data-select]')) setSelected(current.id, e.target.checked);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) close();
  });

  function close() {
    panel.hidden = true;
    current = null;
  }

  function open(rec) {
    current = rec;
    const img = imageUrl(rec, 600);
    const features = catalog.features
      .filter((_, i) => rec.f & (1 << i))
      .map(([, label]) => `<li>${escapeHtml(label)}</li>`).join('');
    const links = [
      `<a href="${recordUrl(rec)}" target="_blank" rel="noopener">swisscollections</a>`,
      rec.doi ? `<a href="${doiUrl(rec)}" target="_blank" rel="noopener">DOI ${escapeHtml(rec.doi)}</a>` : '',
      rec.man ? `<a href="${escapeHtml(rec.man)}" target="_blank" rel="noopener">IIIF manifest</a>` : '',
      rec.ll ? `<a href="https://www.openstreetmap.org/?mlat=${rec.ll[0]}&mlon=${rec.ll[1]}#map=12/${rec.ll[0]}/${rec.ll[1]}" target="_blank" rel="noopener">Map</a>` : '',
    ].filter(Boolean).join(' · ');
    const dateNote = rec.df === 'open'
      ? '<p class="note">Open-ended date in the catalog (“after”).</p>'
      : rec.df === 'suspect'
        ? '<p class="note">This date looks like a typo in the catalog record. It is shown as catalogued and left out of the timeline.</p>'
        : '';

    panel.innerHTML = `
      <div class="ml-details-head">
        <h3>${escapeHtml(rec.t)}</h3>
        <button type="button" class="icon-btn" data-close aria-label="Close details">×</button>
      </div>
      ${img
        ? `<a class="ml-details-img" href="${rec.iiif ? `${rec.iiif}/full/full/0/default.jpg` : img}" title="Open full resolution" target="_blank" rel="noopener"><img src="${img}" alt="${escapeHtml(rec.desc || rec.t)}"></a>`
        : '<div class="ml-details-noimg">No online image yet (legacy record).</div>'}
      <label class="ml-select-main"><input type="checkbox" data-select ${isSelected(rec.id) ? 'checked' : ''}> Use as main image for pairing</label>
      <dl>
        <dt>Date</dt><dd>${escapeHtml(dateLabel(rec))}${rec.d && rec.d !== dateLabel(rec) ? ` <span class="muted">(catalog: ${escapeHtml(rec.d)})</span>` : ''}</dd>
        <dt>Place</dt><dd>${escapeHtml(rec.p || '–')}</dd>
        <dt>Country</dt><dd>${escapeHtml(rec.c.join(', ') || '–')}</dd>
        <dt>Genre</dt><dd>${escapeHtml(catalog.genres[rec.g] || '–')} <span class="muted">(machine-generated)</span></dd>
        ${rec.art ? `<dt>Painting</dt><dd>Reproduces a painting, match: ${escapeHtml(rec.art)}</dd>` : ''}
        <dt>MMS ID</dt><dd><code>${rec.id}</code></dd>
      </dl>
      ${dateNote}
      ${rec.desc ? `<h4>Description <span class="muted">(machine-generated, unreviewed)</span></h4><p>${escapeHtml(rec.desc)}</p>` : ''}
      ${features ? `<h4>Image content <span class="muted">(machine-generated, unreviewed)</span></h4><ul class="ml-tags">${features}</ul>` : ''}
      <p class="ml-links">${links}</p>
    `;
    panel.hidden = false;
    panel.querySelector('[data-close]').focus();
  }

  return {
    open,
    /** Keeps the checkbox in sync when the selection changes elsewhere. */
    refresh() {
      const box = panel.querySelector('[data-select]');
      if (box && current) box.checked = isSelected(current.id);
    },
  };
}
