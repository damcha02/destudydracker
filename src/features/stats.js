// src/features/stats.js
import { DOM } from "../core/dom.js";
import { getStore } from "../store/store.js";
import { Events } from "../core/events.js";

const UNIT_KEY = "studytracker_stats_unit"; // "minutes" | "hours" | "days"
const CHART_HEIGHT_PX = 200;

function isoDateKey(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function startOfWeekMonday(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7; // Mon=0..Sun=6
  x.setDate(x.getDate() - day);
  return x;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function getUnit() {
  const u = localStorage.getItem(UNIT_KEY);
  return u === "hours" || u === "days" ? u : "minutes";
}

function setUnit(u) {
  localStorage.setItem(UNIT_KEY, u);
}

function convertFromMinutes(minutes, unit) {
  const m = Number(minutes) || 0;
  if (unit === "hours") return m / 60;
  if (unit === "days") return m / (60 * 24);
  return m; // minutes
}

function unitLabel(unit) {
  if (unit === "hours") return "hours";
  if (unit === "days") return "days";
  return "minutes";
}

function fmt(value, unit) {
  // show decimals only when needed
  if (unit === "minutes") return `${Math.round(value)}`;
  return `${value.toFixed(2)}`;
}

function clearStats() {
  if (!DOM.statsContainer) return;
  DOM.statsContainer.innerHTML = "";
}

function renderUnitToggle(currentUnit, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "stats-unit-toggle";

  const btn = (label, unit) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "stats-unit-btn" + (unit === currentUnit ? " active" : "");
    b.textContent = label;
    b.addEventListener("click", () => onChange(unit));
    return b;
  };

  wrap.appendChild(btn("Minutes", "minutes"));
  wrap.appendChild(btn("Hours", "hours"));
  wrap.appendChild(btn("Days", "days"));
  return wrap;
}

async function renderStats() {
  if (!DOM.statsContainer) return;

  const store = getStore();
  const sessions = await store.getSessions?.() ?? [];

  const unit = getUnit();

  // Total minutes
  const totalMinutes = sessions.reduce((acc, s) => acc + (Number(s.minutes) || 0), 0);
  const totalInUnit = convertFromMinutes(totalMinutes, unit);

  // Week buckets (Mon..Sun)
  const start = startOfWeekMonday(new Date());
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const week = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    const key = isoDateKey(date);
    return { key, label: dayNames[i], studyMin: 0, examMin: 0 };
  });

  const map = new Map(week.map(d => [d.key, d]));

  sessions.forEach((s) => {
    const bucket = map.get(s.date);
    if (!bucket) return;

    const mins = Number(s.minutes) || 0;
    const isExam = !!(s.exam ?? s.isExam);
    if (isExam) bucket.examMin += mins;
    else bucket.studyMin += mins;
  });

  // Convert for display + scaling
  const weekDisplay = week.map(d => {
    const study = convertFromMinutes(d.studyMin, unit);
    const exam = convertFromMinutes(d.examMin, unit);
    return { ...d, study, exam, total: study + exam };
  });

  const maxDay = Math.max(1e-9, ...weekDisplay.map(d => d.total)); // avoid 0

  clearStats();

  // Unit toggle
  const toggle = renderUnitToggle(unit, (newUnit) => {
    setUnit(newUnit);
    renderStats().catch(console.error);
  });
  DOM.statsContainer.appendChild(toggle);

  // Summary
  const summary = document.createElement("div");
  summary.className = "stats-summary";
  summary.innerHTML = `
    <p>Total studied: <strong>${fmt(totalInUnit, unit)}</strong> ${unitLabel(unit)}</p>
  `;
  DOM.statsContainer.appendChild(summary);

  // Graph container
  const graph = document.createElement("div");
  graph.className = "stats-graph";
  graph.style.height = `${CHART_HEIGHT_PX}px`;

  weekDisplay.forEach((d) => {
    const bar = document.createElement("div");
    bar.className = "bar";

    // fixed-height stack
    const stack = document.createElement("div");
    stack.className = "bar-stack";
    stack.style.height = `${CHART_HEIGHT_PX - 24}px`; // leave room for label

    // Heights in PX (reliable)
    const studyH = Math.max(0, (d.study / maxDay) * (CHART_HEIGHT_PX - 24));
    const examH = Math.max(0, (d.exam / maxDay) * (CHART_HEIGHT_PX - 24));

    // Bottom study segment
    const studySeg = document.createElement("div");
    studySeg.className = "segment-study";
    studySeg.style.height = `${studyH}px`;

    // Exam segment stacked above
    const examSeg = document.createElement("div");
    examSeg.className = "segment-exam";
    examSeg.style.height = `${examH}px`;

    // Stack order: bottom -> top
    stack.appendChild(studySeg);
    stack.appendChild(examSeg);

    const label = document.createElement("div");
    label.className = "bar-label";
    label.textContent = d.label;

    const total = d.study + d.exam;
    bar.title = `${d.label}: ${fmt(total, unit)} ${unitLabel(unit)} (study ${fmt(d.study, unit)} / exam ${fmt(d.exam, unit)})`;

    bar.appendChild(stack);
    bar.appendChild(label);
    graph.appendChild(bar);
  });

  DOM.statsContainer.appendChild(graph);
}

export function initStats() {
  console.log("Stats initialized");
// window.addEventListener
  Events.on("workspace:change", (e) => {
    if (e.detail?.index === 2) renderStats().catch(console.error);
  });

    // Re-render if sessions change (e.g., timer completes)
  Events.on("sessions:changed", () => {
    renderStats().catch(console.error);
  });

  renderStats().catch(console.error);
}
