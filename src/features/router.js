// src/features/router.js

import { DOM } from "../core/dom.js";
import { State } from "../core/state.js";
import { Events } from "../core/events.js";
import { getStoreKind } from "../store/store.js";


function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}


let lastGuestWarn = 0;
function guestWarnOnce(msg) {
  const now = Date.now();
  if (now - lastGuestWarn < 1500) return;
  lastGuestWarn = now;
  Events.emit("toast", { msg });

}

export function setWorkspace(idx) {
  const kind = getStoreKind();
  const next = clamp(idx, 0, 2);

  if (kind === "guest" && next !== 0) {
    guestWarnOnce("Login to save sessions and use Projects/Stats.");
    idx = 0;
  }

  State.workspaceIndex = clamp(idx, 0, 2);

  // Toggle active workspace
  document.querySelectorAll(".workspace").forEach((sec, i) => {
    sec.classList.toggle("active", i === State.workspaceIndex);
  });

  // Show Add Project button only on Projects workspace (index 1)
  if (DOM.addProjectButton) {
    const kind = getStoreKind();
    const show = State.workspaceIndex === 1 && kind !== "guest";
    DOM.addProjectButton.classList.toggle(
      "hidden",
      !show
    );
  }

  // window.dispatchEvent(
  //   new CustomEvent("workspace:change", { detail: { index: State.workspaceIndex } })
  // );
  Events.emit("workspace:change", { index: State.workspaceIndex });

}

export function initRouter() {
  console.log("Router initialized");

  // Button navigation
  if (DOM.prevWorkspace) {
    DOM.prevWorkspace.addEventListener("click", () => {
      setWorkspace(State.workspaceIndex - 1);
    });
  }

  if (DOM.nextWorkspace) {
    DOM.nextWorkspace.addEventListener("click", () => {
      setWorkspace(State.workspaceIndex + 1);
    });
  }

  // Keyboard navigation (ArrowLeft / ArrowRight)
  window.addEventListener("keydown", (e) => {
    // Ignore arrow keys while typing in inputs or textareas
    const tag = e.target?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea") return;

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setWorkspace(State.workspaceIndex - 1);
    }

    if (e.key === "ArrowRight") {
      e.preventDefault();
      setWorkspace(State.workspaceIndex + 1);
    }
  });

  // Initialize first workspace
  setWorkspace(State.workspaceIndex);
}
