export function showToast(message, type = "error") {
  if (typeof window === "undefined" || !message) return;
  window.dispatchEvent(new CustomEvent("myworld:toast", {
    detail: { message: String(message), type },
  }));
}
