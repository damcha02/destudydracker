// src/features/garden.js
import { Events } from "../core/events.js";
import { State } from "../core/state.js";
import { DOM } from "../core/dom.js";

const STORAGE_PREFIX = "garden_day_";
let gardenContainer = null;
let gardenVariant = "garden"; // "garden" or "garden-sketch"
let activeTheme = null;
let secondAccumulator = 0;
let todayKey = null;
let gardenData = [];
let growthProgress = 0;         // 0..1 over ~5 mins
let leftCursor = 5;             // % from left edge
let rightCursor = 95;           // % from left edge

const PLANT_INTERVAL_SECONDS = 1;

/* --------------------------
   Utilities
--------------------------- */

function isoDayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
}

function loadGarden() {
  todayKey = STORAGE_PREFIX + isoDayKey();
  const raw = localStorage.getItem(todayKey);
  gardenData = raw ? JSON.parse(raw) : [];
}

function saveGarden() {
  localStorage.setItem(todayKey, JSON.stringify(gardenData));
}

function random(min, max) {
  return Math.random() * (max - min) + min;
}

function edgeMarginPercent() {
  // half plant width / container width  -> percent margin
  const w = gardenContainer?.clientWidth || 1;
  const halfPlantPx = 80; // width 160 / 2
  const m = (halfPlantPx / w) * 100;
  return Math.min(18, Math.max(6, m + 1)); // keep sane bounds
}
/* --------------------------
   Plant Creation
--------------------------- */

function createPlant(config, instant = false) {
  const el = document.createElement("div");
  el.className = `plant type${config.type}`;
  el.style.left = config.left + "%";
  // el.style.transform = `translateX(-50%) scale(${config.scale})`;
  el.style.setProperty("--plant-height", config.height + "px");
  el.style.setProperty("--plant-scale", config.scale);

  // SVG markup per plant type
  el.innerHTML = getPlantSVG(config.type);

  gardenContainer.appendChild(el);

  if (instant) {
    el.classList.add("grown");
  } else {
    requestAnimationFrame(() => el.classList.add("growing"));
    // finish state after animation
    setTimeout(() => {
      el.classList.remove("growing");
      el.classList.add("grown");
    }, 1400);
  }
}

function pickTypeByStage(p) {
  // p = 0..1 growth progress

  // Early: mostly small plants (wildflowers/bush/cactus)
  if (p < 0.35) return [0, 1, 3][Math.floor(Math.random() * 3)];

  // Mid: add palms sometimes
  if (p < 0.75) {
    const pool = [0, 1, 3, 2, 0, 1]; // weighted toward smaller types
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Late: allow trees more often
  const pool = [0, 1, 2, 3, 4, 4]; // trees show up but not only trees
  return pool[Math.floor(Math.random() * pool.length)];
}

function generatePlant() {
  const TARGET_PLANTS = Math.floor((5 * 60) / PLANT_INTERVAL_SECONDS);
  growthProgress = Math.min(1, gardenData.length / Math.max(1, TARGET_PLANTS));

//   const side = Math.random() < 0.5 ? "left" : "right";

//   // Sides stay near edges early, move inward later
//   const inward = 42 * Math.pow(growthProgress, 4); // slower inward early, faster later
//   const leftBase = 4 + inward;
//   const rightBase = 96 - inward;

  // Chance to spawn in the center increases over time.
  // Early: ~10% center plants, Late: ~45% center plants
//   const centerChance = 0.3 + (0.35 * growthProgress);
//   const useCenter = Math.random() < centerChance;

//   let x;

//   if (useCenter) {
//   // Center spread: starts fairly tight, widens over time
//     const spread = 30 + (35 * growthProgress); // 10%..45%
//     x = random(50 - spread, 50 + spread) + random(-2, 2);
//   } else {
// // Your existing side-based spawn logic
//     const side = Math.random() < 0.5 ? "left" : "right";
//     const inward = 42 * Math.pow(growthProgress, 1.35);
//     const leftBase = 4 + inward;
//     const rightBase = 96 - inward;
//     const jitter = random(-2.5, 2.5);

//     if (side === "left") leftCursor = leftBase + jitter;
//     else rightCursor = rightBase + jitter;

//     x = side === "left" ? leftCursor : rightCursor;
// }
  const EARLY_RANDOM_PLANTS = 40;
  const count = gardenData.length;
  const margin = edgeMarginPercent();

  let x;

  if (count < EARLY_RANDOM_PLANTS) {
    // Early: genuinely random across the whole garden (looks nicer fast)
    x = random(margin, 100-margin) + random(-3, 3);
  } else {
    // Mid/Late: gentle bias toward center but still varied
    const p = growthProgress;

    const centerChance = 0.35 + (0.35 * p); // 35% -> 70%
    const useCenter = Math.random() < centerChance;

    if (useCenter) {
      const spread = 40 + (20 * p); // wide early-mid, slightly tighter later
      x = random(50 - spread, 50 + spread) + random(-2, 2);
    } else {
      const side = Math.random() < 0.5 ? "left" : "right";
      const inward = 36 * Math.pow(p, 1.15);
      const leftBase = margin + inward;
      const rightBase = (100 - margin) - inward;
      const jitter = random(-4, 4);

      if (side === "left") leftCursor = leftBase + jitter;
      else rightCursor = rightBase + jitter;

      x = side === "left" ? leftCursor : rightCursor;
    }
  }

  x = Math.max(margin, Math.min(100 - margin, x));
  // Height ramps up, but keep it lower early so you don't get "mid giant trees"
  const minH = 90 + growthProgress * 60;
  const maxH = 170 + growthProgress * 320;
  const height = random(minH, maxH);

  const type = pickTypeByStage(growthProgress);

  // Keep the really tall “tree” type from appearing too early or too central
//   let x = (side === "left" ? leftCursor : rightCursor);

  // Very late game: add some center fillers (creepers)
  if (growthProgress > 0.75 && Math.random() < 0.25) {
    x = random(25, 75);
  }

  const plant = {
    type,
    left: Math.max(0, Math.min(100, x)),
    height: Math.max(90, Math.min(520, height)),
    scale: random(0.75, 1.25)
  };

  gardenData.push(plant);
  saveGarden();
  createPlant(plant);
}



// SVG presets (simple but much nicer than rectangles)
function getPlantSVG(type) {
  // stem/leaf/flower colors are intentionally muted so it fits Kanagawa
  const stems = ["#5a7d5f", "#6ba368", "#4f8f4f"];
  const leaves = ["#6f9a6b", "#76946a", "#7fae73"];
  const flowers = ["#dcd7ba", "#c34043", "#7e9cd8", "#e5c07b"];

  const stem = stems[Math.floor(Math.random() * stems.length)];
  const leaf = leaves[Math.floor(Math.random() * leaves.length)];
  const flower = flowers[Math.floor(Math.random() * flowers.length)];

  // 5 nicer plant silhouettes
  if (type === 0) {
    // Wildflower
    return `
      <svg viewBox="0 0 120 320" class="plant-svg">
        <path class="stem" d="M60 320 C55 240, 65 180, 58 90" stroke="${stem}" stroke-width="8" fill="none" stroke-linecap="round"/>
        <path class="leaf" d="M56 210 C30 190, 26 160, 52 165" fill="${leaf}" opacity="0.9"/>
        <path class="leaf" d="M62 170 C86 150, 94 120, 68 125" fill="${leaf}" opacity="0.85"/>
        <circle class="bloom" cx="58" cy="86" r="18" fill="${flower}" />
        <circle class="bloom" cx="44" cy="90" r="10" fill="${flower}" opacity="0.85"/>
        <circle class="bloom" cx="72" cy="92" r="10" fill="${flower}" opacity="0.85"/>
      </svg>
    `;
  }

  if (type === 1) {
    // Bushy plant
    return `
      <svg viewBox="0 0 140 300" class="plant-svg">
        <path class="stem" d="M70 300 C70 220, 70 160, 70 70" stroke="${stem}" stroke-width="10" fill="none" stroke-linecap="round"/>
        <circle class="leaf" cx="48" cy="140" r="34" fill="${leaf}" opacity="0.9"/>
        <circle class="leaf" cx="90" cy="140" r="34" fill="${leaf}" opacity="0.85"/>
        <circle class="leaf" cx="70" cy="100" r="40" fill="${leaf}" opacity="0.9"/>
      </svg>
    `;
  }

  if (type === 2) {
    // Palm
    return `
      <svg viewBox="0 0 150 340" class="plant-svg">
        <path class="stem" d="M75 340 C62 260, 96 200, 75 90" stroke="#6d4c41" stroke-width="14" fill="none" stroke-linecap="round"/>
        <path class="leaf" d="M75 100 C30 70, 12 40, 52 62" fill="${leaf}" opacity="0.85"/>
        <path class="leaf" d="M75 100 C120 70, 140 40, 98 62" fill="${leaf}" opacity="0.85"/>
        <path class="leaf" d="M75 95 C55 55, 42 30, 70 52" fill="${leaf}" opacity="0.9"/>
        <path class="leaf" d="M75 95 C95 55, 110 30, 80 52" fill="${leaf}" opacity="0.9"/>
      </svg>
    `;
  }

  if (type === 3) {
    // Cactus
    return `
      <svg viewBox="0 0 140 320" class="plant-svg">
        <path class="stem" d="M70 320 C70 230, 70 170, 70 60" stroke="#357a38" stroke-width="22" fill="none" stroke-linecap="round"/>
        <path class="stem" d="M70 210 C40 210, 38 160, 52 150" stroke="#357a38" stroke-width="18" fill="none" stroke-linecap="round"/>
        <path class="stem" d="M70 190 C100 190, 106 140, 92 130" stroke="#357a38" stroke-width="18" fill="none" stroke-linecap="round"/>
      </svg>
    `;
  }

  // type 4: small tree
  return `
    <svg viewBox="0 0 160 340" class="plant-svg">
      <path class="stem" d="M80 340 C80 250, 80 200, 80 140" stroke="#8b5e3c" stroke-width="16" fill="none" stroke-linecap="round"/>
      <circle class="leaf" cx="60" cy="140" r="42" fill="${leaf}" opacity="0.9"/>
      <circle class="leaf" cx="100" cy="140" r="42" fill="${leaf}" opacity="0.85"/>
      <circle class="leaf" cx="80" cy="100" r="48" fill="${leaf}" opacity="0.9"/>
    </svg>
  `;
}


/* --------------------------
   Mount / Unmount
--------------------------- */

function mountGarden(variant) {
  // if switching variants, destroy old container first
  if (gardenContainer) unmountGarden();

  gardenVariant = variant;

  gardenContainer = document.createElement("div");
  gardenContainer.className = `garden ${variant}`;

  const timerWorkspace = document.querySelector('[data-workspace="0"]');
  if (!timerWorkspace) return;

  timerWorkspace.appendChild(gardenContainer);

  loadGarden();
  gardenData.forEach(p => createPlant(p, true));
}

function unmountGarden() {
  if (!gardenContainer) return;
  gardenContainer.remove();
  gardenContainer = null;
}

/* --------------------------
   Timer Integration
--------------------------- */

function handleTick(e) {
  if (!gardenContainer) return;
  if (State.workspaceIndex !== 0) return;

  const { timerMode, timerPaused } = e.detail;

  if (timerPaused) return;
  if (timerMode !== "study") return;

  secondAccumulator++;

  if (secondAccumulator >= PLANT_INTERVAL_SECONDS) {
    secondAccumulator = 0;
    generatePlant();
  }
}

/* --------------------------
   Theme Listener
--------------------------- */

function handleThemeChange(theme) {
  const btn = document.getElementById("garden-reset-btn");

  if (theme === "garden") {
    if (btn) btn.classList.remove("hidden");
    mountGarden("garden");
    return;
  }

  if (theme === "garden-sketch") {
    if (btn) btn.classList.remove("hidden");
    mountGarden("garden-sketch");
    return;
  }

  if (btn) btn.classList.add("hidden");
  unmountGarden();
}


function resetGarden() {
  // clear saved garden for today
  todayKey = STORAGE_PREFIX + isoDayKey();
  localStorage.removeItem(todayKey);

  gardenData = [];
  growthProgress = 0;
  leftCursor = 5;
  rightCursor = 95;
  secondAccumulator = 0;

  // clear DOM
  if (gardenContainer) gardenContainer.innerHTML = "";
}


/* --------------------------
   Init
--------------------------- */

export function initGarden() {
  Events.on("timer:tick", handleTick);

  Events.on("theme:changed", (e) => {
    handleThemeChange(e.detail.theme);
  });

    // attach reset button
    if (DOM?.gardenResetBtn) {
    DOM.gardenResetBtn.addEventListener("click", () => resetGarden());
    }


  // initial load
  const currentTheme =
    localStorage.getItem("study_tracker_theme") || "blue";

  handleThemeChange(currentTheme);
}
