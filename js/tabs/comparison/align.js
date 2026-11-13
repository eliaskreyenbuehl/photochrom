// Automatic alignment (and deskewing) of the overlay onto the base image.
//
// Both images are converted to grayscale and contrast-equalised (CLAHE), so the
// photochrom's different colors matter less. Keypoints are detected and matched
// (ORB first; AKAZE as a slower, often more robust fallback), filtered with
// Lowe's ratio test, and a homography is fitted with RANSAC. The homography also
// corrects perspective, i.e. deskews a photographed or scanned print.

import { loadOpenCV } from '../../lib/opencv.js';
import { canvasFrom } from './media.js';
import { invert, isConvexQuad, mapRect, multiply, polygonArea, scaling } from './geometry.js';

/** Longest side (px) of the images used for feature detection. */
const WORK_SIZE = 1000;
const RATIO_TEST = 0.75;
const RANSAC_THRESHOLD = 4; // px in work resolution
const MIN_INLIERS = 15;
const GOOD_INLIERS = 60; // stop trying further detectors above this

function toGray(cv, canvas) {
  const rgba = cv.imread(canvas);
  const gray = new cv.Mat();
  cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
  rgba.delete();
  try {
    const clahe = new cv.CLAHE(2.0, new cv.Size(8, 8));
    clahe.apply(gray, gray);
    clahe.delete();
  } catch {
    cv.equalizeHist(gray, gray);
  }
  return gray;
}

function detect(cv, method, gray) {
  const detector = method === 'ORB' ? new cv.ORB(5000) : new cv.AKAZE();
  const keypoints = new cv.KeyPointVector();
  const descriptors = new cv.Mat();
  const noMask = new cv.Mat();
  detector.detectAndCompute(gray, noMask, keypoints, descriptors);
  detector.delete();
  noMask.delete();
  return { keypoints, descriptors };
}

/** Match overlay -> base features and fit a homography (work-resolution px). */
function estimate(cv, method, baseGray, overlayGray) {
  const b = detect(cv, method, baseGray);
  const o = detect(cv, method, overlayGray);
  const toFree = [b.keypoints, b.descriptors, o.keypoints, o.descriptors];
  try {
    if (b.descriptors.rows < 2 || o.descriptors.rows < 2) return { method, matches: 0, inliers: 0 };

    const matcher = new cv.BFMatcher(cv.NORM_HAMMING, false);
    const knn = new cv.DMatchVectorVector();
    matcher.knnMatch(o.descriptors, b.descriptors, knn, 2);
    toFree.push(matcher, knn);

    const src = [];
    const dst = [];
    for (let i = 0; i < knn.size(); i++) {
      const pair = knn.get(i);
      if (pair.size() >= 2) {
        const m = pair.get(0);
        if (m.distance < RATIO_TEST * pair.get(1).distance) {
          const p = o.keypoints.get(m.queryIdx).pt;
          const q = b.keypoints.get(m.trainIdx).pt;
          src.push(p.x, p.y);
          dst.push(q.x, q.y);
        }
      }
      pair.delete?.();
    }
    const matches = src.length / 2;
    if (matches < 4) return { method, matches, inliers: 0 };

    const srcMat = cv.matFromArray(matches, 1, cv.CV_32FC2, src);
    const dstMat = cv.matFromArray(matches, 1, cv.CV_32FC2, dst);
    const inlierMask = new cv.Mat();
    const H = cv.findHomography(srcMat, dstMat, cv.RANSAC, RANSAC_THRESHOLD, inlierMask);
    toFree.push(srcMat, dstMat, inlierMask, H);
    if (H.empty()) return { method, matches, inliers: 0 };

    let inliers = 0;
    for (let i = 0; i < inlierMask.rows; i++) if (inlierMask.data[i]) inliers++;
    return { method, matches, inliers, H: Array.from(H.data64F) };
  } finally {
    for (const m of toFree) m.delete();
  }
}

/** Reject homographies that fold, collapse or blow up the overlay. */
function isPlausible(H, overlay, base) {
  const quad = mapRect(H, overlay.natW, overlay.natH);
  if (!isConvexQuad(quad)) return false;
  const ratio = Math.abs(polygonArea(quad)) / (base.natW * base.natH);
  return ratio > 0.01 && ratio < 100;
}

/**
 * Estimate the overlay -> base homography in natural pixel coordinates.
 * @param onProgress  called with a status text
 * @returns {Promise<{ H: number[], method, matches, inliers }>}
 * @throws if no plausible alignment is found
 */
export async function autoAlign(base, overlay, onProgress = () => {}) {
  onProgress('Loading OpenCV.js (≈10 MB, only the first time)…');
  const { cv } = await loadOpenCV();

  const baseCanvas = canvasFrom(base.img, WORK_SIZE);
  const overlayCanvas = canvasFrom(overlay.img, WORK_SIZE);
  const sb = baseCanvas.width / base.natW;
  const so = overlayCanvas.width / overlay.natW;
  const baseGray = toGray(cv, baseCanvas);
  const overlayGray = toGray(cv, overlayCanvas);

  let best = null;
  try {
    for (const method of ['ORB', 'AKAZE']) {
      onProgress(`Matching keypoints (${method})…`);
      // Let the status text paint; detection blocks the main thread.
      await new Promise((resolve) => setTimeout(resolve, 30));
      const result = estimate(cv, method, baseGray, overlayGray);
      if (result.H) {
        result.H = multiply(scaling(1 / sb), result.H, scaling(so));
        // Sanity check also guards against singular matrices.
        try {
          invert(result.H);
          if (!isPlausible(result.H, overlay, base)) result.inliers = 0;
        } catch {
          result.inliers = 0;
        }
      }
      if (!best || result.inliers > best.inliers) best = result;
      if (best.inliers >= GOOD_INLIERS) break;
    }
  } finally {
    baseGray.delete();
    overlayGray.delete();
  }

  if (!best || best.inliers < MIN_INLIERS) {
    throw new Error(
      `Auto-align found no reliable match (best: ${best?.inliers ?? 0} consistent keypoints of ${best?.matches ?? 0} matches). This happens when the reproduction was redrawn rather than photographed, or the images differ too much. Align manually instead.`
    );
  }
  return best;
}
