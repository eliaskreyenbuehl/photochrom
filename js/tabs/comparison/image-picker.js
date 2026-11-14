// Image picker: a search field (combobox) at the top of the comparison tab that sets
// the left or the right image. Searches the media library, or loads a pasted link
// (Wikimedia Commons, e-rara, swisscollections) – all through js/lib/sources, which
// decides where images come from.

import { LINK_HELP, imageFromLink, linkSourceLabel, parseLink, searchImages } from '../../lib/sources/index.js';

const LIMIT = 20;
const DEBOUNCE = 150; // ms

let uid = 0;

/**
 * @param position  'Left' | 'Right'
 * @param onPick    async (image) => void – called with the chosen image (see js/lib/sources/image.js)
 */
export function createImagePicker({ position, onPick }) {
  const id = `cmp-picker-${++uid}`;
  const root = document.createElement('div');
  root.className = 'cmp-picker';
  root.innerHTML = `
    <label class="cmp-picker-label" for="${id}-input">${position} image</label>
    <input id="${id}-input" type="search" autocomplete="off" spellcheck="false"
      role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}-list"
      aria-describedby="${id}-status"
      placeholder="Search the library or paste a Commons / e-rara link">
    <ul id="${id}-list" class="cmp-picker-list" role="listbox" aria-label="Images" hidden></ul>
    <p id="${id}-status" class="cmp-picker-status" role="status" aria-live="polite"></p>
  `;
  const input = root.querySelector('input');
  const list = root.querySelector('ul');
  const status = root.querySelector('.cmp-picker-status');

  let options = []; // [{ title, detail, thumb, load }]
  let locked = false; // disabled from outside while a pair is loading
  let active = -1;
  let timer = null;
  let token = 0;

  const say = (text, isError = false) => {
    status.textContent = text;
    status.classList.toggle('is-error', isError);
  };

  function close() {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  }

  function setActive(i) {
    active = options.length ? (i + options.length) % options.length : -1;
    list.querySelectorAll('[role="option"]').forEach((el, j) => el.setAttribute('aria-selected', String(j === active)));
    const el = list.querySelector(`#${id}-opt-${active}`);
    if (el) {
      input.setAttribute('aria-activedescendant', el.id);
      el.scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function show(items, note = '') {
    options = items;
    list.replaceChildren(
      ...items.map((item, i) => {
        const li = document.createElement('li');
        li.id = `${id}-opt-${i}`;
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', 'false');
        li.className = 'cmp-picker-option';
        if (item.thumb) li.append(Object.assign(document.createElement('img'), { src: item.thumb, alt: '', loading: 'lazy' }));
        else {
          const icon = Object.assign(document.createElement('span'), { className: 'cmp-picker-icon', textContent: '↗' });
          icon.setAttribute('aria-hidden', 'true');
          li.append(icon);
        }
        const text = document.createElement('span');
        text.className = 'cmp-picker-text';
        text.append(
          Object.assign(document.createElement('strong'), { textContent: item.title }),
          Object.assign(document.createElement('span'), { textContent: item.detail ?? '' })
        );
        li.append(text);
        return li;
      })
    );
    if (note) {
      const li = Object.assign(document.createElement('li'), { className: 'cmp-picker-note', textContent: note });
      li.setAttribute('role', 'presentation');
      list.append(li);
    }
    const open = items.length > 0 || Boolean(note);
    list.hidden = !open;
    input.setAttribute('aria-expanded', String(open));
    setActive(items.length ? 0 : -1);
  }

  async function pick(item) {
    if (!item) return;
    close();
    const my = ++token;
    say(`Loading ${item.title}…`);
    input.disabled = true;
    try {
      const image = await item.load();
      if (my !== token) return;
      await onPick(image);
      input.value = '';
      say('');
    } catch (err) {
      console.warn(err); // the message is shown next to the field
      if (my === token) say(err.message, true);
    } finally {
      input.disabled = locked;
    }
  }

  async function update() {
    const text = input.value.trim();
    const my = ++token;
    say('');
    if (!text) return close();
    const url = parseLink(text);
    if (url) {
      const source = linkSourceLabel(url);
      if (!source) {
        show([], `Links supported: ${LINK_HELP}.`);
        return;
      }
      show([{ title: `Load from ${source}`, detail: decodeURI(url.href), load: () => imageFromLink(url) }]);
      return;
    }
    if (text.length < 2) return close();
    try {
      const { total, results } = await searchImages(text, { limit: LIMIT });
      if (my !== token) return;
      const note = !total ? 'No images found.' : total > results.length ? `${total.toLocaleString('en-US')} images found, showing ${results.length}. Refine the search.` : '';
      show(results, note);
    } catch (err) {
      if (my === token) show([], `Search failed: ${err.message}`);
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(update, DEBOUNCE);
  });

  // A pasted supported link loads right away.
  input.addEventListener('paste', (e) => {
    const url = parseLink(e.clipboardData?.getData('text') ?? '');
    if (!url || !linkSourceLabel(url)) return;
    e.preventDefault();
    input.value = url.href;
    clearTimeout(timer);
    pick({ title: `image from ${linkSourceLabel(url)}`, load: () => imageFromLink(url) });
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (list.hidden) update();
      else setActive(active + (e.key === 'ArrowDown' ? 1 : -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(timer);
      if (!list.hidden && options[active]) pick(options[active]);
      else update().then(() => options.length === 1 && parseLink(input.value) && pick(options[0]));
    } else if (e.key === 'Escape') {
      if (!list.hidden) {
        e.preventDefault();
        close();
      } else if (input.value) {
        e.preventDefault();
        input.value = '';
        say('');
      }
    }
  });

  // mousedown keeps the focus in the input, so the list does not close before the click.
  list.addEventListener('mousedown', (e) => e.preventDefault());
  list.addEventListener('click', (e) => {
    const el = e.target.closest('[role="option"]');
    if (el) pick(options[Number(el.id.split('-').pop())]);
  });
  input.addEventListener('blur', () => setTimeout(close, 0));
  input.addEventListener('focus', () => input.value.trim() && update());

  return {
    element: root,
    /** Disable while a pair is loading. */
    setDisabled(disabled) {
      locked = disabled;
      input.disabled = disabled;
    },
  };
}
