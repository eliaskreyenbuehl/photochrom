// 2D projective geometry helpers. Matrices are 3×3, row-major arrays of 9 numbers:
//   [a, b, c,
//    d, e, f,
//    g, h, i]   maps (x, y) -> ((a x + b y + c) / w, (d x + e y + f) / w), w = g x + h y + i

export const identity = () => [1, 0, 0, 0, 1, 0, 0, 0, 1];
export const translation = (tx, ty) => [1, 0, tx, 0, 1, ty, 0, 0, 1];
export const scaling = (sx, sy = sx) => [sx, 0, 0, 0, sy, 0, 0, 0, 1];
export const rotation = (rad) => {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
};

/** Matrix product A·B (apply B first, then A). Accepts any number of matrices. */
export function multiply(...ms) {
  return ms.reduce((A, B) => {
    const out = new Array(9);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        out[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
      }
    }
    return out;
  });
}

export function invert(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) throw new Error('Matrix is not invertible.');
  const inv = [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d];
  return inv.map((v) => v / det);
}

export function apply(m, x, y) {
  const w = m[6] * x + m[7] * y + m[8];
  return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w];
}

/** CSS `matrix3d()` for a 2D homography (use with transform-origin: 0 0). */
export function toCssMatrix3d(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  return `matrix3d(${[a, d, 0, g, b, e, 0, h, 0, 0, 1, 0, c, f, 0, i].join(',')})`;
}

/** Corners of a w×h rectangle mapped through m (clockwise from top-left). */
export const mapRect = (m, w, h) => [[0, 0], [w, 0], [w, h], [0, h]].map(([x, y]) => apply(m, x, y));

/** Signed polygon area (shoelace); positive for clockwise in y-down coordinates. */
export function polygonArea(poly) {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

/** Clip a polygon to the rectangle [0, w] × [0, h] (Sutherland–Hodgman). */
export function clipToRect(poly, w, h) {
  const edges = [
    [(p) => p[0] >= 0, (a, b) => lerpAt(a, b, (0 - a[0]) / (b[0] - a[0]))],
    [(p) => p[0] <= w, (a, b) => lerpAt(a, b, (w - a[0]) / (b[0] - a[0]))],
    [(p) => p[1] >= 0, (a, b) => lerpAt(a, b, (0 - a[1]) / (b[1] - a[1]))],
    [(p) => p[1] <= h, (a, b) => lerpAt(a, b, (h - a[1]) / (b[1] - a[1]))],
  ];
  let out = poly;
  for (const [inside, intersect] of edges) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(intersect(prev, cur));
        out.push(cur);
      } else if (inside(prev)) {
        out.push(intersect(prev, cur));
      }
    }
    if (!out.length) break;
  }
  return out;
}

const lerpAt = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** True if the quad is convex and consistently oriented (a sane, non-folded homography). */
export function isConvexQuad(q) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const [x0, y0] = q[i];
    const [x1, y1] = q[(i + 1) % 4];
    const [x2, y2] = q[(i + 2) % 4];
    const cross = (x1 - x0) * (y2 - y1) - (y1 - y0) * (x2 - x1);
    if (Math.abs(cross) < 1e-9) return false;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

/**
 * How two images overlap when the overlay (ow×oh) is mapped into the base (bw×bh) by m.
 * @returns {{ baseCovered: number, overlayInside: number }} fractions 0–1:
 *   baseCovered   = share of the base image covered by the overlay
 *   overlayInside = share of the overlay that lies inside the base image
 */
export function overlapStats(m, ow, oh, bw, bh) {
  const quad = mapRect(m, ow, oh);
  if (!isConvexQuad(quad)) return { baseCovered: 0, overlayInside: 0 };
  const quadArea = Math.abs(polygonArea(quad));
  const clipped = clipToRect(quad, bw, bh);
  const inter = clipped.length >= 3 ? Math.abs(polygonArea(clipped)) : 0;
  return { baseCovered: inter / (bw * bh), overlayInside: quadArea ? inter / quadArea : 0 };
}
