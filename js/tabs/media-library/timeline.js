// Horizontal timeline (inline SVG, no library).
//
// Upper part: one bar per year for records dated to a single year.
// Lower lane: records dated only as a span (e.g. 1891–1914), one bar per distinct span,
// thickness by number of records. Drag across the chart to select a range of years,
// click a year to select just that year.

const W = 1000;          // viewBox width; the SVG scales to the container
const LEFT = 44;
const RIGHT = 8;
const BAR_TOP = 10;
const BAR_H = 96;
const AXIS_Y = BAR_TOP + BAR_H + 16;
const SPAN_TOP = AXIS_Y + 14;
const LANE_H = 9;
const MAX_LANES = 8;

const NS = 'http://www.w3.org/2000/svg';

export function createTimeline(container, { domain, onBrush }) {
  const [y0, y1] = domain;
  const years = y1 - y0 + 1;
  const plotW = W - LEFT - RIGHT;
  const x = (year) => LEFT + ((year - y0) / years) * plotW;
  const yearAt = (vx) => Math.min(y1, Math.max(y0, Math.floor(y0 + ((vx - LEFT) / plotW) * years)));

  const svg = document.createElementNS(NS, 'svg');
  svg.classList.add('ml-timeline-svg');
  svg.setAttribute('role', 'img');
  container.append(svg);

  let range = null;   // committed selection [from, to]
  let drag = null;    // { start, current } while dragging
  let last = null;    // last data, for redraw during drag

  const toViewX = (clientX) => {
    const box = svg.getBoundingClientRect();
    return ((clientX - box.left) / box.width) * W;
  };

  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const year = yearAt(toViewX(e.clientX));
    drag = { start: year, current: year };
    svg.setPointerCapture(e.pointerId);
    draw();
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const year = yearAt(toViewX(e.clientX));
    if (year !== drag.current) { drag.current = year; draw(); }
  });
  const finish = () => {
    if (!drag) return;
    const r = [Math.min(drag.start, drag.current), Math.max(drag.start, drag.current)];
    drag = null;
    // Clicking the single selected year again clears the selection.
    const same = range && r[0] === range[0] && r[1] === range[1] && r[0] === r[1];
    onBrush(same ? null : r);
  };
  svg.addEventListener('pointerup', finish);
  svg.addEventListener('pointercancel', () => { drag = null; draw(); });

  function draw() {
    if (!last) return;
    const { exactCounts, spans, dimSpans } = last;
    const shown = drag
      ? [Math.min(drag.start, drag.current), Math.max(drag.start, drag.current)]
      : range;
    const inRange = (a, b) => !shown || (a <= shown[1] && b >= shown[0]);

    const max = Math.max(1, ...exactCounts.values());
    const bw = plotW / years;
    const parts = [];

    // y gridline with max value
    parts.push(`<line class="grid" x1="${LEFT}" x2="${W - RIGHT}" y1="${BAR_TOP}" y2="${BAR_TOP}"/>`);
    parts.push(`<text class="tick" x="${LEFT - 6}" y="${BAR_TOP + 4}" text-anchor="end">${max.toLocaleString('en-US')}</text>`);
    parts.push(`<text class="tick" x="${LEFT - 6}" y="${BAR_TOP + BAR_H}" text-anchor="end">0</text>`);

    if (shown) {
      parts.push(`<rect class="brush" x="${x(shown[0])}" y="0" width="${x(shown[1] + 1) - x(shown[0])}" height="${SPAN_TOP + MAX_LANES * LANE_H}"/>`);
    }

    for (let year = y0; year <= y1; year++) {
      const n = exactCounts.get(year) || 0;
      const h = (n / max) * BAR_H;
      const cls = inRange(year, year) ? 'bar' : 'bar out';
      parts.push(`<rect class="${cls}" x="${x(year) + 1}" y="${BAR_TOP + BAR_H - h}" width="${Math.max(1, bw - 2)}" height="${h}"><title>${year}: ${n.toLocaleString('en-US')} records dated to this year</title></rect>`);
    }

    // x axis
    parts.push(`<line class="axis" x1="${LEFT}" x2="${W - RIGHT}" y1="${BAR_TOP + BAR_H}" y2="${BAR_TOP + BAR_H}"/>`);
    for (let year = y0; year <= y1; year++) {
      if (year % 5 === 0 || (year === y0 && year % 5 < 3)) {
        parts.push(`<text class="tick" x="${x(year) + bw / 2}" y="${AXIS_Y}" text-anchor="middle">${year}</text>`);
      }
    }

    // span lane: pack spans into lanes, biggest first
    parts.push(`<text class="lane-label" x="${LEFT - 6}" y="${SPAN_TOP + 7}" text-anchor="end">spans</text>`);
    const lanes = [];
    const maxSpan = Math.max(1, ...spans.map((s) => s.n));
    for (const s of spans) {
      let lane = lanes.findIndex((end) => end < s.y0);
      if (lane === -1) {
        if (lanes.length >= MAX_LANES) continue;
        lane = lanes.length;
        lanes.push(s.y1);
      } else {
        lanes[lane] = s.y1;
      }
      const thick = 2 + Math.sqrt(s.n / maxSpan) * (LANE_H - 3);
      const top = SPAN_TOP + lane * LANE_H + (LANE_H - thick) / 2;
      const cls = `span${inRange(s.y0, s.y1) ? '' : ' out'}${dimSpans ? ' dim' : ''}`;
      parts.push(`<rect class="${cls}" x="${x(s.y0) + 1}" y="${top}" width="${x(s.y1 + 1) - x(s.y0) - 2}" height="${thick}" rx="2"><title>${s.y0}–${s.y1}: ${s.n.toLocaleString('en-US')} records</title></rect>`);
    }

    const height = SPAN_TOP + Math.max(1, lanes.length) * LANE_H + 4;
    svg.setAttribute('viewBox', `0 0 ${W} ${height}`);
    svg.innerHTML = parts.join('');
  }

  return {
    /** records: records passing all filters except the year filter. */
    update(records, filters) {
      const exactCounts = new Map();
      const spanMap = new Map();
      for (const r of records) {
        if (r.y0 == null || r.df === 'suspect') continue;
        if (r.y0 === r.y1) {
          exactCounts.set(r.y0, (exactCounts.get(r.y0) || 0) + 1);
        } else {
          const key = `${r.y0}/${r.y1}`;
          const s = spanMap.get(key) || { y0: r.y0, y1: r.y1, n: 0 };
          s.n++;
          spanMap.set(key, s);
        }
      }
      const spans = [...spanMap.values()].sort((a, b) => b.n - a.n);
      range = filters.years;
      last = { exactCounts, spans, dimSpans: filters.exactOnly };
      const total = records.length.toLocaleString('en-US');
      svg.setAttribute('aria-label', `Timeline of ${total} records by year of production`);
      draw();
    },
  };
}
