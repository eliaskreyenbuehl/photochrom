// Sidebar controls of the comparison tab: overlay & alignment, differences,
// per-image adjustments. Reads and writes the shared store.

import { icon } from '../../lib/ui/icons.js';
import { infoTip } from '../../lib/ui/info.js';
import { ADJUSTMENTS, defaultAdjustments, isDefault } from './adjustments.js';
import { invert, overlapStats } from './geometry.js';
import { SIDES, baseImage, defaultManual, isAligned, otherSide, overlayImage, overlayMatrix, resetAlignment, setManual, store, subscribe, update } from './store.js';

const pct = (v) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)} %`;
const normalizeDeg = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

function rangeRow(name, label, min, max, step, extra = '') {
  return `
    <div class="range-row" ${extra}>
      <label for="cmp-${name}">${label}</label>
      <output id="cmp-${name}-out" for="cmp-${name}"></output>
      <input type="range" id="cmp-${name}" name="${name}" min="${min}" max="${max}" step="${step}">
    </div>`;
}

export function createControls({ onAutoAlign }) {
  let adjustSide = 'right'; // image whose adjustments the sliders edit
  const root = document.createElement('div');
  root.className = 'cmp-controls';
  root.innerHTML = `
    <details class="cmp-group" data-only="overlay slider diff" open>
      <summary>Overlay &amp; alignment</summary>
      <label class="control">
        <span>Overlay image</span>
        <select name="overlay-side"></select>
      </label>
      ${rangeRow('opacity', 'Opacity', 0, 100, 1, 'data-only="overlay"')}
      <div class="cmp-check" data-only="overlay">
        <label class="check"><input type="checkbox" name="difference-blend"> Difference blend</label>
        ${infoTip('Shows the difference of both images: matching areas turn dark, misaligned edges light up. Most useful at 100 % opacity.', 'About Difference blend')}
      </div>
      ${rangeRow('divider', 'Divider', 0, 100, 0.5, 'data-only="slider"')}
      ${rangeRow('scale', 'Scale', -300, 300, 1)}
      ${rangeRow('rotation', 'Rotation', -180, 180, 0.1)}
      <div class="offset-row">
        <label class="control"><span>Offset X (px)</span><input type="number" name="tx" step="1"></label>
        <label class="control"><span>Offset Y (px)</span><input type="number" name="ty" step="1"></label>
      </div>
      <div class="button-row">
        <button type="button" class="btn btn-primary" data-action="auto-align" title="Find matching keypoints and align the overlay (OpenCV, loads about 10 MB on first use)">${icon('align')}<span class="btn-label">Auto-align</span></button>
        <button type="button" class="btn" data-action="reset-manual" title="Undo manual move, scale and rotation">${icon('undo')}<span class="btn-label">Undo manual</span></button>
        <button type="button" class="btn" data-action="reset-fit" title="Discard the alignment and fit the overlay into the base">${icon('reset')}<span class="btn-label">Reset</span></button>
      </div>
      <p class="cmp-align-status" role="status" aria-live="polite"></p>
      <div class="cmp-overlap">
        <h4>Overlap ${infoTip('Computed from the overlay outline mapped onto the base image. With “Crop to print” on, color charts and scan borders are removed first; otherwise they count as image area.', 'About the overlap')}</h4>
        <ul class="cmp-overlap-stats"><li></li><li></li></ul>
        <p class="cmp-overlap-hint"></p>
      </div>
    </details>

    <details class="cmp-group" data-only="diff" open>
      <summary>Differences ${infoTip('Compares the image <b>structure</b> (locally normalised brightness), not colors, because photochroms are recolored. A heuristic: misalignment also shows up as differences along edges. Align the images first.', 'About the difference map')}</summary>
      ${rangeRow('sensitivity', 'Sensitivity', 0, 100, 1)}
      ${rangeRow('heat', 'Heatmap opacity', 0, 100, 1)}
      <p class="cmp-diff-summary" role="status" aria-live="polite"></p>
      <ol class="cmp-diff-regions"></ol>
    </details>

    <details class="cmp-group" open>
      <summary>Adjustments ${infoTip('Apply to the display and screenshots, per image. The color analysis below always uses the original pixels.', 'About adjustments')}</summary>
      <fieldset class="segmented cmp-adjust-target">
        <legend>Image to edit</legend>
        ${SIDES.map(
          (side) => `
          <label>
            <input type="radio" name="adjust-side" value="${side}"${side === adjustSide ? ' checked' : ''}>
            <span><span class="cmp-adjust-label"></span><span class="cmp-edited" hidden><span aria-hidden="true"> •</span><span class="visually-hidden"> (adjusted)</span></span></span>
          </label>`
        ).join('')}
      </fieldset>
      <div class="cmp-adjust">
        ${ADJUSTMENTS.map((a) => rangeRow(`adj-${a.id}`, a.label, a.min, a.max, 1)).join('')}
        <button type="button" class="btn" data-action="reset-adjust" title="Reset the adjustments of this image">${icon('reset')}<span class="btn-label">Reset</span></button>
      </div>
    </details>
  `;

  const $ = (sel) => root.querySelector(sel);
  const input = (name) => root.querySelector(`[name="${name}"]`);
  const alignStatus = $('.cmp-align-status');
  const overlapItems = root.querySelectorAll('.cmp-overlap-stats li');
  const overlapHint = $('.cmp-overlap-hint');

  // --- Events ----------------------------------------------------------------

  input('overlay-side').addEventListener('change', (e) => {
    // Swap base and overlay but keep the alignment: the new matrix is the inverse.
    const inverse = invert(overlayMatrix());
    update({ overlaySide: e.target.value, H: inverse, manual: defaultManual(), alignedH: isAligned() }, 'swap');
  });
  input('opacity').addEventListener('input', (e) => update({ opacity: e.target.value / 100 }, 'opacity'));
  input('difference-blend').addEventListener('change', (e) => update({ differenceBlend: e.target.checked }, 'blend'));
  input('divider').addEventListener('input', (e) => update({ divider: e.target.value / 100 }, 'divider'));
  input('scale').addEventListener('input', (e) => setManual({ scale: 2 ** (e.target.value / 100) }));
  input('rotation').addEventListener('input', (e) => setManual({ rotation: Number(e.target.value) }));
  input('tx').addEventListener('input', (e) => e.target.value !== '' && setManual({ tx: Number(e.target.value) }));
  input('ty').addEventListener('input', (e) => e.target.value !== '' && setManual({ ty: Number(e.target.value) }));
  input('sensitivity').addEventListener('input', (e) => update({ diff: { ...store.diff, sensitivity: Number(e.target.value) } }, 'diff'));
  input('heat').addEventListener('input', (e) => update({ diff: { ...store.diff, opacity: e.target.value / 100 } }, 'diff'));

  for (const a of ADJUSTMENTS) {
    input(`adj-${a.id}`).addEventListener('input', (e) => {
      update({ adjust: { ...store.adjust, [adjustSide]: { ...store.adjust[adjustSide], [a.id]: Number(e.target.value) } } }, 'adjust');
    });
  }
  for (const radio of root.querySelectorAll('input[name="adjust-side"]')) {
    radio.addEventListener('change', () => {
      adjustSide = radio.value;
      syncAdjustments();
    });
  }

  root.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'auto-align') onAutoAlign();
    else if (action === 'reset-manual') setManual(defaultManual());
    else if (action === 'reset-fit') resetFit();
    else if (action === 'reset-adjust') update({ adjust: { ...store.adjust, [adjustSide]: defaultAdjustments() } }, 'adjust');
  });

  function resetFit() {
    resetAlignment();
    setAlignStatus('');
  }

  // --- Sync from store -------------------------------------------------------

  // Controls and their value outputs, looked up once.
  const fields = new Map(
    [...root.querySelectorAll('input[name]')].map((el) => [el.name, { el, out: root.querySelector(`#cmp-${el.name}-out`) }])
  );

  /** Set a control's value; number fields being typed into are left alone. */
  function setValue(name, value, text) {
    const { el, out } = fields.get(name);
    if (!(el.type === 'number' && document.activeElement === el)) el.value = value;
    if (out && text !== undefined) out.textContent = text;
  }

  function syncOverlapStats() {
    const base = baseImage();
    const overlay = overlayImage();
    const { baseCovered, overlayInside } = overlapStats(overlayMatrix(), overlay.natW, overlay.natH, base.natW, base.natH);
    // Positions, not names: the sentences must read the same for any pair of images.
    const top = `${overlay.position.toLowerCase()} image`;
    const under = `${base.position.toLowerCase()} image`;
    overlapItems[0].textContent = `The ${top} covers ${pct(baseCovered)} of the ${under}`;
    overlapItems[1].textContent = `${pct(overlayInside)} of the ${top} lies within the ${under}`;
    let message;
    if (baseCovered < 0.9 && overlayInside >= 0.9) message = `The ${top} shows only a part (≈ ${pct(baseCovered)}) of the ${under}: it is cropped.`;
    else if (overlayInside < 0.9 && baseCovered >= 0.9) message = `The ${under} shows only a part (≈ ${pct(overlayInside)}) of the ${top}: it is cropped.`;
    else if (baseCovered < 0.9 && overlayInside < 0.9) message = 'The images only partly overlap.';
    else message = 'Both images show essentially the same section.';
    if (!isAligned()) message += ' Not aligned yet: run Auto-align (or align manually) for meaningful numbers.';
    overlapHint.textContent = message;
  }

  function syncAlignment() {
    const { scale, rotation, tx, ty } = store.manual;
    setValue('scale', Math.round(Math.log2(scale) * 100), `${(scale * 100).toFixed(1)} %`);
    setValue('rotation', normalizeDeg(rotation).toFixed(1), `${normalizeDeg(rotation).toFixed(1)}°`);
    setValue('tx', Math.round(tx));
    setValue('ty', Math.round(ty));
    syncOverlapStats();
  }

  function syncAdjustments() {
    const values = store.adjust[adjustSide];
    for (const a of ADJUSTMENTS) setValue(`adj-${a.id}`, values[a.id], `${values[a.id]}${a.unit === '%' ? ' %' : a.unit}`);
    $('[data-action="reset-adjust"]').disabled = isDefault(values);
    // Mark images that have adjustments, also the one not being edited.
    for (const side of SIDES) root.querySelector(`input[name="adjust-side"][value="${side}"] + span .cmp-edited`).hidden = isDefault(store.adjust[side]);
  }

  // Only the controls affected by the change reason are updated (dragging the
  // overlay fires 'transform' on every pointer move).
  subscribe((reason) => {
    if (!store.images.left) return;
    if (reason === 'pair' || reason === 'swap') {
      const select = input('overlay-side');
      select.replaceChildren(
        ...SIDES.map((side) => new Option(`${store.images[side].position} over ${store.images[otherSide(side)].position.toLowerCase()}`, side))
      );
      select.value = store.overlaySide;
      for (const side of SIDES) {
        const label = root.querySelector(`input[name="adjust-side"][value="${side}"] + span .cmp-adjust-label`);
        label.textContent = store.images[side].position;
        label.closest('label').title = store.images[side].label; // full name on hover
      }
    }
    if (reason === 'pair') {
      setAlignStatus('');
      setValue('opacity', Math.round(store.opacity * 100), `${Math.round(store.opacity * 100)} %`);
      input('difference-blend').checked = store.differenceBlend;
      setValue('divider', store.divider * 100, `${Math.round(store.divider * 100)} %`);
      setValue('sensitivity', store.diff.sensitivity, String(store.diff.sensitivity));
      setValue('heat', Math.round(store.diff.opacity * 100), `${Math.round(store.diff.opacity * 100)} %`);
    }
    if (reason === 'opacity') setValue('opacity', Math.round(store.opacity * 100), `${Math.round(store.opacity * 100)} %`);
    if (reason === 'divider') setValue('divider', store.divider * 100, `${Math.round(store.divider * 100)} %`);
    if (reason === 'diff') {
      setValue('sensitivity', store.diff.sensitivity, String(store.diff.sensitivity));
      setValue('heat', Math.round(store.diff.opacity * 100), `${Math.round(store.diff.opacity * 100)} %`);
    }
    if (reason === 'pair' || reason === 'swap' || reason === 'transform') syncAlignment();
    if (reason === 'pair' || reason === 'adjust') syncAdjustments();
  });

  function setAlignStatus(text, isError = false) {
    alignStatus.textContent = text;
    alignStatus.classList.toggle('is-error', isError);
  }

  return {
    element: root,
    setAlignStatus,
    setAlignBusy(busy) {
      root.querySelector('[data-action="auto-align"]').disabled = busy;
    },
    /** Show the difference summary and region list. */
    setDiffResult(current, error) {
      const summary = $('.cmp-diff-summary');
      const list = $('.cmp-diff-regions');
      list.innerHTML = '';
      summary.classList.toggle('is-error', Boolean(error));
      if (error) {
        summary.textContent = `Could not compute the differences: ${error.message}`;
        return;
      }
      if (!current) return;
      const { changedShare, comparedShare, regions } = current.analysis;
      if (comparedShare < 0.01) {
        summary.textContent = 'The images do not overlap; align them first.';
        return;
      }
      summary.textContent = `Changed: ${pct(changedShare)} of the compared area (${pct(comparedShare)} of the ${baseImage().position.toLowerCase()} image overlaps). ${regions.length ? 'Largest regions:' : 'No distinct regions at this sensitivity.'}`;
      regions.forEach((r) => list.append(Object.assign(document.createElement('li'), { textContent: `${r.where}: ${pct(r.share)} of the compared area` })));
    },
    setDiffBusy(busy) {
      if (busy) $('.cmp-diff-summary').textContent = 'Computing differences…';
    },
  };
}
