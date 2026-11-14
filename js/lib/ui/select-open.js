// Click to select, double-click to open: the convention of the image grids and lists
// (Media Library mosaic and list, Candidates cards).
//
//   click         toggle(el)  (select / deselect)
//   double-click  undoes the toggle of its first click, then open(el) (details dialog)
//   Space         toggle(el)    Enter  open(el)    (when the item itself has focus)
//
// toggle(el) may return an undo function; without one, the double-click calls toggle
// again. Clicks on links and buttons inside an item are left alone.

const ignored = (target) => target.closest('a, button, input, select, textarea');

export function bindSelectAndOpen(root, { item, toggle, open }) {
  let undo = null;
  root.addEventListener('click', (e) => {
    const el = item(e.target);
    if (!el || ignored(e.target)) return;
    if (e.detail > 1) return; // second click of a double-click
    const result = toggle(el);
    undo = typeof result === 'function' ? result : () => toggle(el);
  });
  root.addEventListener('dblclick', (e) => {
    const el = item(e.target);
    if (!el || ignored(e.target)) return;
    undo?.();
    undo = null;
    window.getSelection?.().removeAllRanges(); // a double-click selects text
    open(el);
  });
  root.addEventListener('keydown', (e) => {
    const el = item(e.target);
    if (!el || e.target !== el) return;
    if (e.key === ' ') {
      e.preventDefault();
      toggle(el);
    } else if (e.key === 'Enter') {
      e.preventDefault(); // otherwise the key press also activates the dialog's focused button
      open(el);
    }
  });
}
