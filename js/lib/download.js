// Saving generated files (screenshots, palette images) from the browser.

/** Encode a canvas, rejecting instead of resolving with null on failure. */
export function canvasToBlob(canvas, type = 'image/png') {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image.'))), type)
  );
}

/** Offer `blob` as a download named `filename`. */
export function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
