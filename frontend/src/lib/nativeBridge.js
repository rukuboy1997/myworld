export function isNativeApp() {
  return window.isNativeApp === true;
}

export function sendToNative(type, payload = {}) {
  if (!window.ReactNativeWebView) return;

  window.ReactNativeWebView.postMessage(
    JSON.stringify({
      type,
      payload,
    }),
  );
}
