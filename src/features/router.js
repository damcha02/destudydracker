// src/features/router.js

import { DOM } from "../core/dom.js";
import { State } from "../core/state.js";
import { Events } from "../core/events.js";

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function setWorkspace(idx) {
  State.workspaceIndex = clamp(idx, 0, 2);

  // Toggle active workspace
  document.querySelectorAll(".workspace").forEach((sec, i) => {
    sec.classList.toggle("active", i === State.workspaceIndex);
  });

  // Show Add Project button only on Projects workspace (index 1)
  if (DOM.addProjectButton) {
    DOM.addProjectButton.classList.toggle(
      "hidden",
      State.workspaceIndex !== 1
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
