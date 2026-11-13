// Lazy loader for OpenCV.js (https://docs.opencv.org/4.x/d5/d10/tutorial_js_root.html),
// used for keypoint-based image alignment. The bundle is ~10 MB, so it is only
// fetched when the user asks for auto-alignment.

import { loadScript } from './script.js';

const OPENCV_URL = 'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js';

let ready = null;

/**
 * Resolves to `{ cv }`. The module is wrapped in an object on purpose: the
 * Emscripten module is "thenable", and resolving a promise with it directly
 * can hang.
 */
export function loadOpenCV() {
  ready ??= loadScript(OPENCV_URL, 'Could not load OpenCV.js (needed for auto-align) from its CDN.')
    .then(async () => {
      let cv = window.cv;
      if (cv instanceof Promise) cv = await cv;
      else if (!cv?.Mat) await new Promise((done) => (cv.onRuntimeInitialized = done));
      return { cv };
    })
    .catch((err) => {
      ready = null;
      throw err;
    });
  return ready;
}
