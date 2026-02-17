// src/ui/overlays.js
import { DOM } from "../core/dom.js";
import { Events } from "../core/events.js";

const THEME_KEY = "study_tracker_theme";
const STRATEGY_KEY = "study_tracker_strategy";

const THEMES = [
  { id: "blue", name: "Kanagawa Blue" },
  { id: "green", name: "Kanagawa Green" },
];

const STRATEGIES = [
  { id: "pomodoro", name: "Pomodoro 25/5", study: 25, break: 5 },
  { id: "52-17", name: "52/17", study: 52, break: 17 },
  { id: "90-20", name: "90/20", study: 90, break: 20 },
];

function open(el) { el?.classList.remove("hidden"); }
function close(el) { el?.classList.add("hidden"); }

function applyTheme() {
  const theme = localStorage.getItem(THEME_KEY) || "blue";
  document.body.classList.toggle("theme-green", theme === "green");
}

function buildThemeList() {
  if (!DOM.themeList) return;
  DOM.themeList.innerHTML = "";
  const current = localStorage.getItem(THEME_KEY) || "blue";

  THEMES.forEach(th => {
    const li = document.createElement("li");
    li.textContent = th.name;
    li.dataset.theme = th.id;
    if (th.id === current) li.classList.add("selected");
    li.addEventListener("click", () => {
      localStorage.setItem(THEME_KEY, th.id);
      applyTheme();
      buildThemeList();
      close(DOM.settingsOverlay);
    });
    DOM.themeList.appendChild(li);
  });
}

function buildStrategyList() {
  if (!DOM.strategyList) return;
  DOM.strategyList.innerHTML = "";
  const current = localStorage.getItem(STRATEGY_KEY) || STRATEGIES[0].id;

  STRATEGIES.forEach(s => {
    const li = document.createElement("li");
    li.textContent = s.name;
    li.dataset.strategy = s.id;
    if (s.id === current) li.classList.add("selected");
    li.addEventListener("click", () => {
      localStorage.setItem(STRATEGY_KEY, s.id);
      Events.emit("strategy:changed", { strategy: s });
      buildStrategyList();
      close(DOM.strategyOverlay);
    });
    DOM.strategyList.appendChild(li);
  });
}

export function initUI() {
  console.log("UI initialized");

  // Ensure defaults exist
  if (!localStorage.getItem(THEME_KEY)) localStorage.setItem(THEME_KEY, "blue");
  if (!localStorage.getItem(STRATEGY_KEY)) localStorage.setItem(STRATEGY_KEY, STRATEGIES[0].id);

  applyTheme();
  buildThemeList();
  buildStrategyList();

  DOM.settingsButton?.addEventListener("click", (e) => {
    e.preventDefault();
    buildThemeList();
    open(DOM.settingsOverlay);
  });
  DOM.closeSettingsOverlay?.addEventListener("click", (e) => {
    e.preventDefault();
    close(DOM.settingsOverlay);
  });

  DOM.strategyButton?.addEventListener("click", (e) => {
    e.preventDefault();
    buildStrategyList();
    open(DOM.strategyOverlay);
  });
  DOM.closeStrategyOverlay?.addEventListener("click", (e) => {
    e.preventDefault();
    close(DOM.strategyOverlay);
  });

  // click outside to close
  DOM.settingsOverlay?.addEventListener("click", (e) => {
    if (e.target === DOM.settingsOverlay) close(DOM.settingsOverlay);
  });
  DOM.strategyOverlay?.addEventListener("click", (e) => {
    if (e.target === DOM.strategyOverlay) close(DOM.strategyOverlay);
  });
}
