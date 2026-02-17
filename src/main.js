/* =====================================================
   StudyTracker – Main Entry Point
   This file should stay small.
   It wires modules together and boots the app.
   ===================================================== */

import { initRouter } from "./features/router.js";
import { initTimer } from "./features/timer.js";
import { initProjects } from "./features/projects.js";
import { initStats } from "./features/stats.js";

import { initAuth } from "./auth/auth.js";
import { initStore } from "./store/store.js";

import { initUI } from "./ui/overlays.js";
import { initModal } from "./ui/modal.js";

import { initToast } from "./ui/toast.js";



/* ---------------------------
   App Bootstrap
---------------------------- */

async function bootstrap() {
  console.log("StudyTracker starting...");

  await initStore();
  await initAuth();

  initUI();
  initModal();
  initToast();

  initRouter();
  initTimer();
  initProjects();
  initStats();

  console.log("StudyTracker ready.");
}


/* ---------------------------
   Start App
---------------------------- */

document.addEventListener("DOMContentLoaded", bootstrap);
