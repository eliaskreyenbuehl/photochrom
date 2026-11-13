// Compact date filter: a tiny histogram, a range slider with two handles and
// START/END number fields (the keyboard path). The axis is fixed to the production
// period of the photochroms, 1889–1914 (catalog.years).
//
// Histogram: dark part = records dated to that single year; light part = records
// dated only as a span, spread evenly over the years of the span (an estimate).

import { datable } from './filters.js';

const H = 24;

export function createDateFilter(container, { domain, onChange }) {
  const [min, max] = domain;
  const years = max - min + 1;

  container.innerHTML = `
    <div class="df">
      <svg class="df-hist" viewBox="0 0 ${years} ${H}" preserveAspectRatio="none" aria-hidden="true"></svg>
      <div class="df-slider">
        <div class="df-track"><div class="df-fill"></div></div>
        <input type="range" class="df-from" min="${min}" max="${max}" step="1" value="${min}" aria-label="Start year">
        <input type="range" class="df-to" min="${min}" max="${max}" step="1" value="${max}" aria-label="End year">
      </div>
      <div class="df-fields">
        <label><span>Start</span><input type="number" class="df-from-num" min="${min}" max="${max}" value="${min}"></label>
        <label class="df-exact"><input type="checkbox"> Exact dates only</label>
        <label><span>End</span><input type="number" class="df-to-num" min="${min}" max="${max}" value="${max}"></label>
      </div>
    </div>`;

  const $ = (s) => container.querySelector(s);
  const hist = $('.df-hist');
  const from = $('.df-from');
  const to = $('.df-to');
  const fromNum = $('.df-from-num');
  const toNum = $('.df-to-num');
  const fill = $('.df-fill');
  const exact = $('.df-exact input');

  let frame = 0;
  const emit = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const a = Number(from.value);
      const b = Number(to.value);
      onChange({ years: a === min && b === max ? null : [a, b], exactOnly: exact.checked });
    });
  };

  function show(a, b) {
    from.value = a; to.value = b;
    fromNum.value = a; toNum.value = b;
    fill.style.left = `${((a - min) / (max - min)) * 100}%`;
    fill.style.right = `${((max - b) / (max - min)) * 100}%`;
    // keep the upper handle reachable when both meet at the right end
    from.style.zIndex = a > max - 2 ? 3 : 2;
  }

  from.addEventListener('input', () => {
    if (Number(from.value) > Number(to.value)) from.value = to.value;
    show(Number(from.value), Number(to.value));
    emit();
  });
  to.addEventListener('input', () => {
    if (Number(to.value) < Number(from.value)) to.value = from.value;
    show(Number(from.value), Number(to.value));
    emit();
  });
  const clamp = (v, fallback) => Math.min(max, Math.max(min, Number.isFinite(v) && v ? v : fallback));
  for (const input of [fromNum, toNum]) {
    input.addEventListener('change', () => {
      let a = clamp(Number(fromNum.value), min);
      let b = clamp(Number(toNum.value), max);
      if (a > b) [a, b] = [b, a];
      show(a, b);
      emit();
    });
  }
  exact.addEventListener('change', emit);

  return {
    /** records: records passing all filters except the date filter. */
    update(records, filters) {
      const exactCounts = new Float64Array(years);
      const spread = new Float64Array(years);
      for (const r of records) {
        if (!datable(r)) continue;
        if (r.y0 === r.y1 && !r.df) {
          exactCounts[r.y0 - min]++;
        } else {
          const share = 1 / (r.y1 - r.y0 + 1);
          for (let y = r.y0; y <= r.y1; y++) spread[y - min] += share;
        }
      }
      const top = Math.max(1, ...Array.from(exactCounts, (n, i) => n + (filters.exactOnly ? 0 : spread[i])));
      const [a, b] = filters.years || [min, max];
      let svg = '';
      for (let i = 0; i < years; i++) {
        const y = min + i;
        const out = y < a || y > b ? ' out' : '';
        const he = (exactCounts[i] / top) * H;
        const hs = filters.exactOnly ? 0 : (spread[i] / top) * H;
        const tip = `${y}: ${Math.round(exactCounts[i])} dated to this year`
          + (filters.exactOnly ? '' : `, about ${Math.round(spread[i])} more from date spans`);
        svg += `<g class="${out.trim()}"><title>${tip}</title>`
          + `<rect class="span" x="${i + 0.1}" y="${H - he - hs}" width="0.8" height="${hs}"/>`
          + `<rect class="exact" x="${i + 0.1}" y="${H - he}" width="0.8" height="${he}"/></g>`;
      }
      hist.innerHTML = svg;
      show(a, b);
      exact.checked = filters.exactOnly;
    },
  };
}
