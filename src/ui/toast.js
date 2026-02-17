// src/ui/toast.js
import { DOM } from "../core/dom.js";
import { Events } from "../core/events.js";

let hideTimer = null;

export function showToast(message, ms = 2200) {
  if (!DOM.toast) return;

  DOM.toast.textContent = message;
  DOM.toast.classList.remove("hidden");

  // restart animation
  DOM.toast.classList.remove("toast-in");
  // force reflow
  void DOM.toast.offsetWidth;
  DOM.toast.classList.add("toast-in");

  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    DOM.toast.classList.remove("toast-in");
    DOM.toast.classList.add("toast-out");
    hideTimer = setTimeout(() => {
      DOM.toast.classList.add("hidden");
      DOM.toast.classList.remove("toast-out");
    }, 200);
  }, ms);
}

export function initToast() {
  Events.on("toast", (e) => {
    const msg = e.detail?.msg || "";
    if (msg) showToast(msg);
  });
}
