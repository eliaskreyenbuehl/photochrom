// Annotations in the UI: comments, tags, a region and microscope images per image, written
// by the user (js/lib/annotation-store.js, W3C Web Annotations, docs/annotations.md).
//
//   storagePanel()        where annotations are saved, connect a folder, export / import ZIP
//                         (details dialog and the comparison sidebar)
//   annotationSection({ image, compareWith, regions })
//                         list + form for one image in the details dialog; `regions` is the
//                         dialog's region layer (js/lib/ui/region-layer.js), `compareWith`
//                         the other image of the comparison (added as second target)
// Both return { element, destroy() }; destroy() stops listening to the store.

import * as store from '../annotation-store.js';
import { cleanTags, createAnnotation, editAnnotation, fieldsOf } from '../annotation-model.js';
import { escapeHtml } from '../catalog.js';
import { downloadBlob } from '../download.js';
import { canonicalUrl, describeUrl } from '../sources/index.js';
import { icon } from './icons.js';
import { infoTip } from './info.js';

const NAME_KEY = 'photochrom.annotator.v1';
const fmt = (n) => n.toLocaleString('en-US');
const plural = (n, word) => `${fmt(n)} ${word}${n === 1 ? '' : 's'}`;

function readName() {
  try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; }
}

function storeName(name) {
  try { localStorage.setItem(NAME_KEY, name); } catch { /* storage blocked */ }
}

const isAbort = (err) => err?.name === 'AbortError';

function el(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html != null) node.innerHTML = html;
  return node;
}

const dateText = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const regionText = ({ x, y, w, h }) =>
  `Region ${Math.round(w * 100)} × ${Math.round(h * 100)} % at ${Math.round(x * 100)} / ${Math.round(y * 100)} %`;

// ---------------------------------------------------------------------------
// Storage panel

const STORAGE_HELP = 'Annotations are saved as one JSON file each (W3C Web Annotation) plus the images in <code>media/</code>. '
  + '<b>Folder</b> (Chrome, Edge): a folder on this computer, outside the repository; the data never leaves the computer. '
  + '<b>Browser</b>: kept in this browser profile only and lost when site data is cleared; export a ZIP as backup. '
  + 'Connecting a folder moves the browser annotations into it. A ZIP can be imported in any browser.';

export function storagePanel() {
  const root = el('div', 'anno-storage');
  root.innerHTML = `
    <p class="anno-storage-text"></p>
    <div class="anno-storage-actions">
      <button type="button" class="btn btn-sm" data-act="connect"></button>
      <button type="button" class="btn btn-sm" data-act="export" title="Download all annotations and their images as one ZIP file">${icon('download')}<span class="btn-label">Export ZIP</span></button>
      <button type="button" class="btn btn-sm" data-act="import" title="Add annotations from a ZIP file (export of this app or a zipped annotation folder)">${icon('upload')}<span class="btn-label">Import ZIP…</span></button>
      <button type="button" class="link-btn" data-act="disconnect" hidden title="Forget the folder (its files stay) and save in this browser">Use browser storage</button>
      ${infoTip(STORAGE_HELP, 'About annotation storage')}
    </div>
    <input type="file" accept=".zip,application/zip" hidden>
    <p class="anno-storage-msg" role="status" aria-live="polite"></p>
  `;
  const text = root.querySelector('.anno-storage-text');
  const msg = root.querySelector('.anno-storage-msg');
  const connectBtn = root.querySelector('[data-act="connect"]');
  const disconnectBtn = root.querySelector('[data-act="disconnect"]');
  const fileInput = root.querySelector('input[type=file]');

  const say = (message, isError = false) => {
    msg.textContent = message;
    msg.classList.toggle('is-error', isError);
  };

  function render(status = store.getStatus()) {
    const count = plural(status.count, 'annotation');
    const name = `<b>${escapeHtml(status.folderName)}</b>`;
    let html;
    let connect = null;
    if (status.mode === 'folder') {
      html = `${icon('folder')} Saved in the folder ${name} · ${count}`;
      connect = { label: 'Change folder…', title: 'Choose another annotation folder' };
    } else if (status.mode === 'locked') {
      html = `${icon('folder')} Annotation folder ${name}: allow access again to see and save annotations.`;
      connect = { label: 'Allow access', title: `Grant this page access to the folder “${status.folderName}” again`, primary: true };
    } else if (status.folderSupported) {
      html = `Saved in this browser only · ${count}. Connect a folder to keep them outside the browser.`;
      connect = { label: 'Connect folder…', title: 'Choose a folder on this computer for annotations and microscope images', primary: true };
    } else {
      html = `Saved in this browser only · ${count}. This browser cannot write to a folder (use Chrome or Edge for that); export a ZIP as backup.`;
    }
    if (status.unreadable) html += ` <span class="is-error">${plural(status.unreadable, 'file')} in <code>annotations/</code> could not be read (see the console).</span>`;
    text.innerHTML = html;
    connectBtn.hidden = !connect;
    if (connect) {
      connectBtn.innerHTML = `${icon('folder')}<span class="btn-label">${connect.label}</span>`;
      connectBtn.title = connect.title;
      connectBtn.classList.toggle('btn-primary', Boolean(connect.primary));
    }
    disconnectBtn.hidden = status.mode === 'browser';
    if (status.error) say(status.error, true);
  }

  async function run(fn) {
    say('');
    root.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    try {
      await fn();
    } catch (err) {
      if (!isAbort(err)) {
        console.error(err);
        say(err.message, true);
      }
    } finally {
      root.querySelectorAll('button').forEach((b) => { b.disabled = false; });
    }
  }

  root.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'connect') {
      run(async () => {
        if (store.getStatus().mode === 'locked') {
          await store.reconnect();
          return;
        }
        const { moved } = await store.connect();
        say(moved ? `${plural(moved, 'annotation')} moved from the browser into the folder.` : 'Folder connected.');
      });
    } else if (act === 'disconnect') {
      const { folderName } = store.getStatus();
      if (!confirm(`Stop using the folder “${folderName}”? Its files stay where they are; new annotations are saved in this browser.`)) return;
      run(async () => {
        await store.disconnect();
        say('Saving in this browser. Connect the folder again to see its annotations.');
      });
    } else if (act === 'export') {
      run(async () => {
        say('Packing the ZIP…');
        const { blob, annotations, media, missing } = await store.exportZip();
        const day = new Date().toISOString().slice(0, 10);
        downloadBlob(blob, `photochrom-annotations-${day}.zip`);
        say(`Exported ${plural(annotations, 'annotation')} and ${plural(media, 'image')}.${missing ? ` ${plural(missing, 'image')} not found.` : ''}`);
      });
    } else if (act === 'import') {
      fileInput.click();
    }
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    run(async () => {
      say('Reading the ZIP…');
      const r = await store.importZip(file);
      const parts = [
        r.added && `${fmt(r.added)} added`,
        r.updated && `${fmt(r.updated)} updated`,
        r.unchanged && `${fmt(r.unchanged)} unchanged`,
        r.media && `${plural(r.media, 'image')} copied`,
        r.skipped && `${plural(r.skipped, 'file')} skipped (not an annotation)`,
      ].filter(Boolean);
      say(parts.length ? `Import: ${parts.join(', ')}.` : 'No annotations found in this ZIP.');
    });
  });

  const unsubscribe = store.onChange(render);
  render();
  store.init();
  return { element: root, destroy: unsubscribe };
}

// ---------------------------------------------------------------------------
// Tag input: chips plus a text field with suggestions of tags already used.

function createTagInput(listId) {
  const root = el('div', 'anno-tags');
  root.innerHTML = `
    <ul class="tags" aria-label="Tags"></ul>
    <input type="text" list="${listId}" placeholder="Add a tag, Enter" aria-label="Add a tag" autocomplete="off">
    <datalist id="${listId}"></datalist>
  `;
  const chips = root.querySelector('ul');
  const input = root.querySelector('input');
  const datalist = root.querySelector('datalist');
  let tags = [];

  function render() {
    chips.replaceChildren(...tags.map((tag, i) => {
      const li = el('li', 'tag-chip');
      li.append(tag);
      const remove = el('button', 'tag-remove', icon('close', 12));
      remove.type = 'button';
      remove.dataset.index = String(i);
      remove.setAttribute('aria-label', `Remove tag ${tag}`);
      remove.title = 'Remove tag';
      li.append(remove);
      return li;
    }));
  }

  function commit() {
    const added = input.value.split(',');
    input.value = '';
    const next = cleanTags([...tags, ...added]);
    if (next.length !== tags.length) {
      tags = next;
      render();
    }
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (input.value.trim()) commit();
    } else if (e.key === 'Backspace' && !input.value && tags.length) {
      tags = tags.slice(0, -1);
      render();
    }
  });
  // A suggestion picked from the list arrives as one input event without inputType.
  input.addEventListener('input', (e) => { if (!e.inputType || e.inputType === 'insertReplacementText') commit(); });
  input.addEventListener('blur', () => input.value.trim() && commit());
  chips.addEventListener('click', (e) => {
    const btn = e.target.closest('.tag-remove');
    if (!btn) return;
    tags = tags.filter((_, i) => i !== Number(btn.dataset.index));
    render();
    input.focus();
  });

  return {
    element: root,
    get value() {
      if (input.value.trim()) commit();
      return [...tags];
    },
    set value(list) {
      tags = cleanTags(list);
      input.value = '';
      render();
    },
    suggest(used) {
      datalist.replaceChildren(...used.map(({ tag, count }) => Object.assign(document.createElement('option'), { value: tag, label: `${tag} (${count})` })));
    },
  };
}

// ---------------------------------------------------------------------------
// Annotation section of the details dialog

let sectionCounter = 0;

const SECTION_HELP = 'Your own notes on this image: a comment, tags, a region (drag a rectangle on the image) and microscope or other images. '
  + 'Saved as W3C Web Annotations with your name and the time; nothing is sent anywhere. '
  + 'Opened from the Image Comparison tab, the other image is linked as well, so the comparison is documented.';

/**
 * @param image        the image shown in the dialog (shape of js/lib/sources/image.js)
 * @param compareWith  the other image of the comparison, or null
 * @param regions      region layer of the dialog image
 */
export function annotationSection({ image, compareWith = null, regions }) {
  const n = ++sectionCounter;
  const source = canonicalUrl(image);
  const pairSource = compareWith ? canonicalUrl(compareWith) : null;
  const mediaHint = image.recordId || String(image.key || 'image').replace(/^[a-z]+:/, '');

  const root = el('section', 'details-section anno-section');
  root.innerHTML = `
    <h3>Annotations <span class="anno-count muted"></span> ${infoTip(SECTION_HELP, 'About annotations')}</h3>
    <div class="anno-storage-slot"></div>
    <ol class="anno-list"></ol>
    <form class="anno-form" novalidate>
      <h4 class="anno-form-title">New annotation</h4>
      <label class="control">Comment
        <textarea name="comment" rows="3" placeholder="What do you see? E.g. blue plate printed over the yellow here."></textarea>
      </label>
      <div class="control">
        <span id="anno-tags-label-${n}">Tags</span>
      </div>
      <div class="anno-region">
        <span class="anno-region-text">Whole image</span>
        <button type="button" class="btn btn-sm" data-act="draw" aria-pressed="false" title="Drag a rectangle on the image">${icon('region')}<span class="btn-label">Mark region</span></button>
        <button type="button" class="link-btn" data-act="clear-region" hidden>Remove region</button>
      </div>
      <div class="anno-drop">
        ${icon('image')}
        <span>Microscope images: drop files here or <button type="button" class="link-btn" data-act="pick">choose…</button></span>
        <input type="file" accept="image/*" multiple hidden>
      </div>
      <ul class="anno-files"></ul>
      <label class="check anno-pair" hidden><input type="checkbox" name="pair" checked> <span></span></label>
      <label class="control anno-name">Your name
        <input type="text" name="creator" autocomplete="name" placeholder="Saved with each annotation">
      </label>
      <div class="anno-form-actions">
        <button type="submit" class="btn btn-primary">${icon('note')}<span class="btn-label">Save annotation</span></button>
        <button type="button" class="btn" data-act="cancel" hidden>Cancel</button>
      </div>
      <p class="anno-msg" role="status" aria-live="polite"></p>
    </form>
  `;
  const $ = (sel) => root.querySelector(sel);
  const listEl = $('.anno-list');
  const form = $('.anno-form');
  const msg = $('.anno-msg');
  const fileInput = $('.anno-drop input');
  const drawBtn = $('[data-act="draw"]');
  const pairBox = $('.anno-pair');
  const nameInput = form.elements.creator;
  nameInput.value = readName();

  const tagInput = createTagInput(`anno-tags-${n}`);
  tagInput.element.setAttribute('aria-labelledby', `anno-tags-label-${n}`);
  $(`#anno-tags-label-${n}`).parentElement.append(tagInput.element);

  const storage = storagePanel();
  $('.anno-storage-slot').replaceWith(storage.element);

  // Form state
  let editing = null; // annotation being edited
  let region = null;
  let files = []; // new File objects
  let kept = []; // media of the edited annotation: [{ path, format }]
  let pairTarget = pairSource !== source ? pairSource : null;

  const say = (text, isError = false) => {
    msg.textContent = text;
    msg.classList.toggle('is-error', isError);
  };

  // ---- list

  const own = (a) => fieldsOf(a).source === source;

  let regionLabels = new Map(); // annotation id -> number shown on its region box

  function renderList() {
    const status = store.getStatus();
    const annotations = store.list(source);
    $('.anno-count').textContent = annotations.length ? `(${fmt(annotations.length)})` : '';
    regionLabels = new Map();
    annotations.filter((a) => own(a) && fieldsOf(a).region).forEach((a, i) => regionLabels.set(a.id, String(i + 1)));

    if (!annotations.length) {
      const empty = status.mode === 'locked' ? 'Allow access to the annotation folder to see its annotations.' : 'No annotations for this image yet.';
      listEl.replaceChildren(el('li', 'anno-empty muted', escapeHtml(empty)));
    } else {
      listEl.replaceChildren(...annotations.map((a) => itemElement(a, regionLabels.get(a.id))));
      fillAsync(annotations);
    }
    showRegions(annotations);
    tagInput.suggest(store.tags());
  }

  function itemElement(annotation, regionLabel) {
    const f = fieldsOf(annotation);
    const li = el('li', 'anno');
    li.dataset.id = annotation.id;
    li.tabIndex = -1;
    const edited = f.modified && f.created && f.modified !== f.created;
    li.innerHTML = `
      <div class="anno-head">
        ${regionLabel ? `<span class="anno-num" title="Region ${regionLabel} on the image">${regionLabel}</span>` : ''}
        <strong>${escapeHtml(f.creator || 'Unknown')}</strong>
        <time datetime="${escapeHtml(f.created)}" title="${escapeHtml(edited ? `Created ${dateText(f.created)}, edited ${dateText(f.modified)}` : f.created)}">${escapeHtml(dateText(f.created))}${edited ? ' (edited)' : ''}</time>
        <span class="anno-actions">
          ${own(annotation) ? `<button type="button" class="btn btn-ghost btn-icon btn-sm" data-act="edit" aria-label="Edit annotation" title="Edit">${icon('edit')}</button>` : ''}
          <button type="button" class="btn btn-ghost btn-icon btn-sm" data-act="delete" aria-label="Delete annotation" title="Delete">${icon('trash')}</button>
        </span>
      </div>
      ${f.comment ? `<p class="anno-text">${escapeHtml(f.comment)}</p>` : ''}
      ${f.tags.length ? `<ul class="tags">${f.tags.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>` : ''}
      ${f.media.length ? `<div class="anno-media">${f.media.map((m) => `<a class="anno-thumb" data-path="${escapeHtml(m.path)}" target="_blank" rel="noopener" title="${escapeHtml(m.path)}"><span class="muted">${escapeHtml(m.path.split('/').pop())}</span></a>`).join('')}</div>` : ''}
      <p class="anno-ctx muted"></p>
    `;
    const ctx = [];
    if (own(annotation) && f.region) ctx.push(regionText(f.region));
    li.querySelector('.anno-ctx').textContent = ctx.join(' · ');
    li.querySelector('.anno-ctx').hidden = !ctx.length;
    return li;
  }

  /** Images and the names of linked works load after the list is shown. */
  function fillAsync(annotations) {
    for (const a of annotations) {
      const li = listEl.querySelector(`[data-id="${CSS.escape(a.id)}"]`);
      if (!li) continue;
      for (const link of li.querySelectorAll('.anno-thumb')) {
        store.mediaUrl(link.dataset.path).then((url) => {
          if (!url) {
            link.classList.add('is-missing');
            link.title = `${link.dataset.path} not found in the annotation folder`;
            return;
          }
          link.href = url;
          const img = Object.assign(new Image(), { src: url, alt: link.dataset.path.split('/').pop(), decoding: 'async', loading: 'lazy' });
          link.replaceChildren(img);
        });
      }
      const f = fieldsOf(a);
      const linked = own(a) ? f.other : f.source;
      if (!linked) continue;
      describeUrl(linked).then((label) => {
        const ctx = li.querySelector('.anno-ctx');
        const text = own(a) ? `Compared with ${label}` : `Made on ${label}${f.region ? ' (with a region there)' : ''}`;
        ctx.textContent = [ctx.textContent, text].filter(Boolean).join(' · ');
        ctx.hidden = false;
      });
    }
  }

  function showRegions(annotations = store.list(source)) {
    const saved = annotations.filter((a) => own(a) && a.id !== editing?.id).map((a) => ({ id: a.id, region: fieldsOf(a).region, label: regionLabels.get(a.id) }));
    if (region) saved.push({ id: 'draft', region, label: editing ? regionLabels.get(editing.id) ?? '' : '', draft: true });
    regions.setRegions(saved);
  }

  listEl.addEventListener('pointerover', (e) => regions.highlight(e.target.closest('.anno')?.dataset.id ?? null));
  listEl.addEventListener('pointerleave', () => regions.highlight(null));
  listEl.addEventListener('focusin', (e) => regions.highlight(e.target.closest('.anno')?.dataset.id ?? null));

  listEl.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    const id = e.target.closest('.anno')?.dataset.id;
    if (!act || !id) return;
    const annotation = store.list(source).find((a) => a.id === id);
    if (!annotation) return;
    if (act === 'edit') startEdit(annotation);
    if (act === 'delete') {
      const f = fieldsOf(annotation);
      const what = f.comment ? `“${f.comment.slice(0, 60)}${f.comment.length > 60 ? '…' : ''}”` : 'this annotation';
      if (!confirm(`Delete ${what}?`)) return;
      try {
        await store.remove(id);
        if (editing?.id === id) resetForm();
        say('Annotation deleted.');
      } catch (err) {
        console.error(err);
        say(`Could not delete: ${err.message}`, true);
      }
    }
  });

  // ---- form

  function setRegion(next) {
    region = next;
    $('.anno-region-text').textContent = region ? regionText(region) : 'Whole image';
    $('[data-act="clear-region"]').hidden = !region;
    showRegions();
  }

  function renderFiles() {
    const items = [
      ...kept.map((m, i) => ({ name: m.path.split('/').pop(), kind: 'kept', i })),
      ...files.map((f, i) => ({ name: f.name || 'pasted image', kind: 'new', i, size: f.size })),
    ];
    $('.anno-files').replaceChildren(...items.map((item) => {
      const li = el('li', 'anno-file');
      const size = item.size ? ` <span class="muted">${(item.size / 1e6).toFixed(1)} MB</span>` : '';
      li.innerHTML = `${icon('image', 14)}<span class="anno-file-name">${escapeHtml(item.name)}</span>${size}`
        + `<button type="button" class="btn btn-ghost btn-icon btn-sm" data-remove="${item.kind}:${item.i}" aria-label="Remove ${escapeHtml(item.name)}" title="Remove">${icon('close', 14)}</button>`;
      return li;
    }));
  }

  function addFiles(list) {
    const images = [...list].filter((f) => f.type.startsWith('image/') || /\.(png|jpe?g|tiff?|webp|bmp)$/i.test(f.name));
    if (images.length < list.length) say('Only image files can be added.', true);
    files.push(...images);
    renderFiles();
  }

  function updatePairBox() {
    pairBox.hidden = !pairTarget;
    if (!pairTarget) return;
    pairBox.querySelector('span').textContent = 'Link to the compared image';
    describeUrl(pairTarget).then((label) => {
      pairBox.querySelector('span').textContent = `Link to the compared image: ${label}`;
    });
  }

  function resetForm() {
    regions.cancel();
    editing = null;
    form.elements.comment.value = '';
    tagInput.value = [];
    files = [];
    kept = [];
    pairTarget = pairSource !== source ? pairSource : null;
    form.elements.pair.checked = true;
    updatePairBox();
    renderFiles();
    setRegion(null);
    $('.anno-form-title').textContent = 'New annotation';
    $('[data-act="cancel"]').hidden = true;
    drawBtn.setAttribute('aria-pressed', 'false');
  }

  function startEdit(annotation) {
    resetForm();
    const f = fieldsOf(annotation);
    editing = annotation;
    form.elements.comment.value = f.comment;
    tagInput.value = f.tags;
    kept = f.media.map((m) => ({ ...m }));
    pairTarget = f.other ?? (pairSource !== source ? pairSource : null);
    form.elements.pair.checked = Boolean(f.other);
    updatePairBox();
    renderFiles();
    setRegion(f.region);
    $('.anno-form-title').textContent = `Edit annotation of ${f.creator || 'unknown'}, ${dateText(f.created)}`;
    $('[data-act="cancel"]').hidden = false;
    say('');
    form.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    form.elements.comment.focus({ preventScroll: true });
  }

  form.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    const removeKey = e.target.closest('[data-remove]')?.dataset.remove;
    if (removeKey) {
      const [kind, i] = removeKey.split(':');
      if (kind === 'kept') kept.splice(Number(i), 1);
      else files.splice(Number(i), 1);
      renderFiles();
    }
    if (act === 'pick') fileInput.click();
    if (act === 'clear-region') setRegion(null);
    if (act === 'cancel') {
      resetForm();
      say('');
    }
    if (act === 'draw') {
      if (regions.isDrawing) {
        regions.cancel();
        return;
      }
      drawBtn.setAttribute('aria-pressed', 'true');
      say('Drag a rectangle on the image. Click “Mark region” again to cancel.');
      const drawn = await regions.draw();
      drawBtn.setAttribute('aria-pressed', 'false');
      say('');
      if (drawn) setRegion(drawn);
    }
  });

  fileInput.addEventListener('change', () => {
    addFiles(fileInput.files);
    fileInput.value = '';
  });

  const drop = $('.anno-drop');
  drop.addEventListener('dragover', (e) => {
    if (![...e.dataTransfer.types].includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    drop.classList.add('is-over');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('is-over');
    addFiles(e.dataTransfer.files);
  });
  // Pasting an image (e.g. a copied microscope frame) into the comment adds it as a file.
  form.elements.comment.addEventListener('paste', (e) => {
    const pasted = [...(e.clipboardData?.files ?? [])];
    if (!pasted.length) return;
    e.preventDefault();
    addFiles(pasted);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const creator = nameInput.value.trim();
    const comment = form.elements.comment.value;
    const tags = tagInput.value;
    if (!creator) {
      say('Enter your name: it is saved with the annotation (provenance).', true);
      nameInput.focus();
      return;
    }
    if (!comment.trim() && !tags.length && !files.length && !kept.length) {
      say('Write a comment, add a tag or an image first.', true);
      form.elements.comment.focus();
      return;
    }
    storeName(creator);
    const submit = form.querySelector('[type=submit]');
    submit.disabled = true;
    say(files.length ? `Saving ${plural(files.length, 'image')}…` : 'Saving…');
    try {
      const media = [...kept];
      for (const file of files) media.push(await store.storeMedia(file, mediaHint));
      const fields = {
        comment,
        tags,
        media,
        region,
        source,
        other: pairTarget && form.elements.pair.checked ? pairTarget : null,
      };
      const annotation = editing ? editAnnotation(editing, fields, creator) : createAnnotation(fields, creator);
      await store.save(annotation);
      const where = store.getStatus().mode === 'folder' ? `in the folder “${store.getStatus().folderName}”` : 'in this browser';
      resetForm();
      say(`Saved ${where}.`);
    } catch (err) {
      console.error(err);
      say(isAbort(err) ? 'Not saved: no access to the folder.' : `Not saved: ${err.message}`, true);
    } finally {
      submit.disabled = false;
    }
  });

  const unsubscribe = store.onChange(() => renderList());
  updatePairBox();
  renderList();
  store.init();

  return {
    element: root,
    destroy() {
      unsubscribe();
      storage.destroy();
      regions.cancel();
      regions.setRegions([]);
    },
  };
}
