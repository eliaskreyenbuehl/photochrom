// Inject a classic <script> once (for UMD bundles that have no ES module build).
// A failed load is not cached, so the next call retries.

const loading = new Map();

/** Resolves when the script has loaded; rejects with `errorMessage` otherwise. */
export function loadScript(url, errorMessage) {
  if (!loading.has(url)) {
    loading.set(
      url,
      new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => {
          loading.delete(url);
          script.remove();
          reject(new Error(errorMessage));
        };
        document.head.append(script);
      })
    );
  }
  return loading.get(url);
}
