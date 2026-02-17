// src/ui/modal.js
import { DOM } from "../core/dom.js";

/**
 * Opens the reusable modal prompt and returns a Promise<string|null>.
 * - resolves to string when OK is pressed and validation passes
 * - resolves to null when cancelled
 */
export function openModal({ title, placeholder = "", validate = null }) {
  if (!DOM.modalOverlay) {
    throw new Error("Modal DOM not found. Ensure modal exists in index.html.");
  }

  DOM.modalTitle.textContent = title;
  DOM.modalInput.value = "";
  DOM.modalInput.placeholder = placeholder;
  DOM.modalError.textContent = "";
  DOM.modalOverlay.classList.remove("hidden");
  DOM.modalInput.focus();

  return new Promise((resolve) => {
    function cleanup() {
      DOM.modalOk.removeEventListener("click", onOk);
      DOM.modalCancel.removeEventListener("click", onCancel);
      DOM.modalInput.removeEventListener("keydown", onKey);
    }

    function close(value) {
      DOM.modalOverlay.classList.add("hidden");
      cleanup();
      resolve(value);
    }

    function onOk() {
      const v = DOM.modalInput.value.trim();
      if (validate) {
        const err = validate(v);
        if (err) {
          DOM.modalError.textContent = err;
          return;
        }
      }
      close(v);
    }

    function onCancel() {
      close(null);
    }

    function onKey(e) {
      if (e.key === "Enter") onOk();
      if (e.key === "Escape") onCancel();
    }

    DOM.modalOk.addEventListener("click", onOk);
    DOM.modalCancel.addEventListener("click", onCancel);
    DOM.modalInput.addEventListener("keydown", onKey);
  });
}

/**
 * Optional init hook (kept for symmetry; currently does nothing).
 * You can later add "click outside to close" here if you want.
 */
export function initModal() {
  // no-op for now
}
