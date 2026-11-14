// Small "i" buttons for help text that is not needed in normal use: the text stays hidden
// until the button is hovered, focused and clicked, or tapped. Built on the Popover API
// (light dismiss, Escape, top layer, also above an open <dialog>); this module positions
// the popover next to its button.
//
//   container.innerHTML = `<h3>Overlap ${infoTip('How the overlap is computed …')}</h3>`;
//
// `text` is HTML (escape user data before passing it).

import { icon } from './icons.js';

let counter = 0;
const HOVER_DELAY = 250; // ms before a hovered button shows its text

/**
 * Markup of an info button and its popover.
 * @param text   help text (HTML)
 * @param label  accessible name of the button, e.g. "About the date filter"
 */
export function infoTip(text, label = 'More information') {
  const id = `info-pop-${++counter}`;
  return `<button type="button" class="info-btn" popovertarget="${id}" aria-label="${label}">${icon('info', 14)}</button>`
    + `<span id="${id}" class="info-pop" popover>${text}</span>`;
}

/** Place an open popover below (or above) its button, inside the window. */
function place(pop) {
  const button = document.querySelector(`[popovertarget="${pop.id}"]`);
  if (!button) return;
  const b = button.getBoundingClientRect();
  const p = pop.getBoundingClientRect();
  const margin = 8;
  let left = Math.min(Math.max(margin, b.left + b.width / 2 - p.width / 2), window.innerWidth - p.width - margin);
  let top = b.bottom + 6;
  if (top + p.height > window.innerHeight - margin) top = Math.max(margin, b.top - p.height - 6);
  left = Math.max(margin, left);
  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${Math.round(top)}px`;
}

// toggle does not bubble: listen in the capture phase.
document.addEventListener('toggle', (e) => {
  if (e.newState === 'open' && e.target.classList?.contains('info-pop')) place(e.target);
}, true);

// Hover: show after a short delay, hide when the pointer leaves (unless it was clicked open).
let hoverTimer = 0;
let hovered = null;
document.addEventListener('pointerover', (e) => {
  const button = e.target.closest?.('.info-btn');
  if (!button || e.pointerType === 'touch' || button === hovered) return;
  hovered = button;
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => {
    const pop = document.getElementById(button.getAttribute('popovertarget'));
    if (pop && !pop.matches(':popover-open')) {
      pop.showPopover();
      pop.dataset.hover = '1';
    }
  }, HOVER_DELAY);
});
document.addEventListener('pointerout', (e) => {
  const button = e.target.closest?.('.info-btn');
  if (!button || button.contains(e.relatedTarget)) return;
  hovered = null;
  clearTimeout(hoverTimer);
  const pop = document.getElementById(button.getAttribute('popovertarget'));
  if (pop?.dataset.hover && pop.matches(':popover-open')) pop.hidePopover();
});
// A click on a hover-opened tip keeps it open (the click would otherwise close it again).
document.addEventListener('click', (e) => {
  const button = e.target.closest?.('.info-btn');
  if (!button) return;
  const pop = document.getElementById(button.getAttribute('popovertarget'));
  if (pop?.dataset.hover && pop.matches(':popover-open')) {
    e.preventDefault(); // popovertarget would toggle it closed
    delete pop.dataset.hover;
  }
}, true);
document.addEventListener('toggle', (e) => {
  if (e.newState === 'closed' && e.target.classList?.contains('info-pop')) delete e.target.dataset.hover;
}, true);
