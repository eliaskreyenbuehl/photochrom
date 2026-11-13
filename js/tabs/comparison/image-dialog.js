// Image dialog: the full image (zoomable) with all metadata of one image.
// Opened by double-clicking an image (or its title) in the side-by-side view.
// A native <dialog> handles focus, Escape and the backdrop. A draggable divider
// splits the image and the metadata; its position is kept between openings.

import { metadataSection } from './metadata.js';
import { createZoom } from './zoom.js';

const SPLIT_STEP = 32; // px per arrow key press (Shift: ×3)
const MIN_META = 240; // px
const MIN_IMAGE = 240; // px

let metaWidth = 420; // px, shared by all openings

export function createImageDialog() {
  const dialog = document.createElement('dialog');
  dialog.className = 'cmp-dialog';
  dialog.setAttribute('aria-labelledby', 'cmp-dialog-title');
  dialog.innerHTML = `
    <header class="cmp-dialog-head">
      <div>
        <p class="cmp-dialog-role"></p>
        <h3 id="cmp-dialog-title"></h3>
        <p class="cmp-dialog-year"></p>
      </div>
      <button type="button" class="button" data-action="close">Close</button>
    </header>
    <div class="cmp-dialog-body">
      <figure class="cmp-dialog-figure">
        <div class="cmp-dialog-viewport"><div class="cmp-zoom"></div></div>
        <figcaption>Scroll or pinch to zoom, drag to pan, double-click to zoom in (Shift: out), 0 to fit.</figcaption>
      </figure>
      <div class="cmp-dialog-split" role="separator" aria-orientation="vertical" aria-label="Resize image and metadata" aria-valuemin="0" aria-valuemax="100" tabindex="0"></div>
      <div class="cmp-dialog-info">
        <p class="cmp-dialog-credit"></p>
        <div class="cmp-dialog-meta"></div>
      </div>
    </div>
  `;

  const $ = (sel) => dialog.querySelector(sel);
  const body = $('.cmp-dialog-body');
  const split = $('.cmp-dialog-split');
  const viewport = $('.cmp-dialog-viewport');
  // No page to scroll behind a modal: plain scrolling zooms the image.
  const zoom = createZoom($('.cmp-dialog-viewport .cmp-zoom'), { wheelZoom: true });

  /** Apply a metadata panel width (px), clamped so both sides stay usable. */
  function setMetaWidth(px) {
    const total = body.clientWidth - split.offsetWidth;
    if (total <= 0) return;
    metaWidth = Math.round(Math.min(Math.max(px, MIN_META), Math.max(MIN_META, total - MIN_IMAGE)));
    body.style.setProperty('--meta-width', `${metaWidth}px`);
    split.setAttribute('aria-valuenow', String(Math.round(((total - metaWidth) / total) * 100)));
    split.setAttribute('aria-valuetext', `Image ${Math.round(((total - metaWidth) / total) * 100)} %`);
  }

  split.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    split.setPointerCapture(e.pointerId);
    split.classList.add('is-dragging');
  });
  split.addEventListener('pointermove', (e) => {
    if (split.hasPointerCapture(e.pointerId)) setMetaWidth(body.getBoundingClientRect().right - e.clientX - split.offsetWidth / 2);
  });
  const endDrag = () => split.classList.remove('is-dragging');
  split.addEventListener('pointerup', endDrag);
  split.addEventListener('pointercancel', endDrag);
  split.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? SPLIT_STEP * 3 : SPLIT_STEP;
    const actions = {
      ArrowLeft: () => setMetaWidth(metaWidth + step),
      ArrowRight: () => setMetaWidth(metaWidth - step),
      Home: () => setMetaWidth(Infinity),
      End: () => setMetaWidth(0),
    };
    if (!actions[e.key]) return;
    e.preventDefault();
    actions[e.key]();
  });

  dialog.addEventListener('click', (e) => {
    // A click on the backdrop targets the dialog element itself.
    if (e.target === dialog || e.target.closest('[data-action="close"]')) dialog.close();
  });
  // Keep the page behind the dialog from scrolling.
  dialog.addEventListener('close', () => document.documentElement.classList.remove('has-modal'));
  viewport.tabIndex = 0;
  viewport.addEventListener('keydown', (e) => zoom.handleKey(e) && e.preventDefault());

  return {
    element: dialog,
    /** Show one side of the pair ({ role, label, title, year, credit, creditUrl, fields, img }). */
    open(image) {
      $('.cmp-dialog-role').textContent = image.label;
      $('#cmp-dialog-title').textContent = image.title || image.label;
      $('.cmp-dialog-year').textContent = image.year ?? '';

      const img = image.img.cloneNode();
      img.alt = `${image.label}: ${image.title ?? ''}`;
      $('.cmp-dialog-viewport .cmp-zoom').replaceChildren(img);

      const credit = $('.cmp-dialog-credit');
      if (image.creditUrl) {
        credit.replaceChildren(Object.assign(document.createElement('a'), { href: image.creditUrl, target: '_blank', rel: 'noopener', textContent: image.credit }));
      } else {
        credit.textContent = image.credit ?? '';
      }
      $('.cmp-dialog-meta').replaceChildren(metadataSection(image));

      document.documentElement.classList.add('has-modal');
      dialog.showModal();
      setMetaWidth(metaWidth);
      zoom.ensure();
      zoom.reset();
      $('.cmp-dialog-info').scrollTop = 0;
      $('[data-action="close"]').focus();
    },
  };
}
