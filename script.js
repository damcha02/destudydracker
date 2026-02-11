/* Study Tracker – fully robust version (fixed theme overlay)
 *
 * Fix summary:
 * - Removed duplicated/extra bottom block that redefined init/buildThemeList and re-bound events.
 * - Exactly ONE init() and ONE buildThemeList().
 * - Settings overlay is hidden by default and only opens via ⚙ button.
 * - If no theme is stored, default to "blue" (never force theme selection).
 */

const STORAGE_KEY = "study_tracker_app";

/* ----------------- Persistence Helpers ----------------- */

function loadApp() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { users: {}, currentUser: null };
  try {
    const app = JSON.parse(raw);
    return app && typeof app === "object" ? app : { users: {}, currentUser: null };
  } catch {
    return { users: {}, currentUser: null };
  }
}

function saveApp(app) { localStorage.setItem(STORAGE_KEY, JSON.stringify(app)); }

function withApp(mutator) {
  const app = loadApp();
  mutator(app);
  saveApp(app);
  return app;
}

function getCurrentUserRecord(app) {
  if (!app.currentUser) return null;
  return app.users?.[app.currentUser] ?? null;
}

/* ----------------- Utility Functions ----------------- */

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function percent(done, total) { return !total || total <= 0 ? 0 : Math.round((done / total) * 100); }

function sumProject(project) {
  let total = 0, done = 0;
  (project.subjects || []).forEach((sub) => {
    const tasks = sub.tasks || {};
    Object.keys(tasks).forEach((key) => {
      const t = tasks[key];
      total += t.total || 0;
      done  += t.done  || 0;
    });
  });
  done = clamp(done, 0, total);
  return { total, done, pct: percent(done, total) };
}

function sumSubject(subject) {
  let total = 0, done = 0;
  const tasks = subject.tasks || {};
  Object.keys(tasks).forEach((key) => {
    const t = tasks[key];
    total += t.total || 0;
    done  += t.done  || 0;
  });
  done = clamp(done, 0, total);
  return { total, done, pct: percent(done, total) };
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// Date helpers for statistics
function isoDateKey(d = new Date()) {
  // YYYY-MM-DD in local time
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function startOfWeekMonday(d = new Date()) {
  // Returns a Date set to local Monday 00:00 of the week containing d
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7; // Mon=0 ... Sun=6
  x.setDate(x.getDate() - day);
  return x;
}

function addDays(d, days) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

/* ----------------- Modal Prompt ----------------- */

const modal = {
  overlay: document.getElementById("modal-overlay"),
  title: document.getElementById("modal-title"),
  input: document.getElementById("modal-input"),
  error: document.getElementById("modal-error"),
  ok: document.getElementById("modal-ok"),
  cancel: document.getElementById("modal-cancel"),
};

function openModal({ title, placeholder="", validate=null }) {
  modal.title.textContent = title;
  modal.input.value = "";
  modal.input.placeholder = placeholder;
  modal.error.textContent = "";
  modal.overlay.classList.remove("hidden");
  modal.input.focus();
  return new Promise(resolve => {
    function close(value) {
      modal.overlay.classList.add("hidden");
      modal.ok.removeEventListener("click", onOk);
      modal.cancel.removeEventListener("click", onCancel);
      modal.input.removeEventListener("keydown", onKey);
      resolve(value);
    }
    function onOk() {
      const v = modal.input.value.trim();
      if (validate) {
        const err = validate(v);
        if (err) {
          modal.error.textContent = err;
          return;
        }
      }
      close(v);
    }
    function onCancel() { close(null); }
    function onKey(e) {
      if (e.key === "Enter") onOk();
      if (e.key === "Escape") onCancel();
    }
    modal.ok.addEventListener("click", onOk);
    modal.cancel.addEventListener("click", onCancel);
    modal.input.addEventListener("keydown", onKey);
  });
}

/* ----------------- DOM References ----------------- */

const els = {
  loginContainer: document.getElementById("login-container"),
  appContainer: document.getElementById("app-container"),
  loginForm: document.getElementById("login-form"),
  signupForm: document.getElementById("signup-form"),
  loginUsername: document.getElementById("login-username"),
  loginPassword: document.getElementById("login-password"),
  loginError: document.getElementById("login-error"),
  signupUsername: document.getElementById("signup-username"),
  signupPassword: document.getElementById("signup-password"),
  signupError: document.getElementById("signup-error"),
  showSignup: document.getElementById("show-signup"),
  showLogin: document.getElementById("show-login"),
  currentUser: document.getElementById("current-user"),
  logoutButton: document.getElementById("logout-button"),
  infoButton: document.getElementById("info-button"),
  settingsButton: document.getElementById("settings-button"),
  prevWorkspace: document.getElementById("prev-workspace"),
  nextWorkspace: document.getElementById("next-workspace"),
  projectsList: document.getElementById("projects-list"),
  statsContainer: document.getElementById("stats-container"),
  addProjectButton: document.getElementById("add-project-button"),
  strategyButton: document.getElementById("strategy-button"),
  strategyOverlay: document.getElementById("strategy-overlay"),
  strategyList: document.getElementById("strategy-list"),
  closeStrategyOverlay: document.getElementById("close-strategy-overlay"),
  settingsOverlay: document.getElementById("settings-overlay"),
  themeList: document.getElementById("theme-list"),
  closeSettingsOverlay: document.getElementById("close-settings-overlay"),
  studyDurationInput: document.getElementById("study-duration"),
  breakDurationInput: document.getElementById("break-duration"),
  timerDisplay: document.getElementById("timer-display"),
  timerMessage: document.getElementById("timer-message"),
  startTimerBtn: document.getElementById("start-timer"),
  pauseTimerBtn: document.getElementById("pause-timer"),
  resetTimerBtn: document.getElementById("reset-timer"),

  // Exam mode + labels (optional; will be null if your index.html doesn't include them yet)
  examModeButton: document.getElementById("exam-mode-button"),
  studyLabel: document.getElementById("study-label"),
  breakLabel: document.getElementById("break-label"),
  studyLabelText: document.getElementById("study-label-text"),
  breakLabelText: document.getElementById("break-label-text"),
};

/* ----------------- State Variables ----------------- */

let workspaceIndex = 1;
const expandedProjects = {};
const expandedSubjects = {};

const STRATEGIES = [
  { id:"pomodoro", name:"Pomodoro 25/5", study:25, break:5 },
  { id:"52-17", name:"52/17", study:52, break:17 },
  { id:"90-20", name:"90/20", study:90, break:20 },
];

const THEMES = [
  { id:"blue",  name:"Kanagawa Blue" },
  { id:"green", name:"Kanagawa Green" },
];

/* ----------------- Workspace Navigation ----------------- */

function setWorkspace(idx) {
  workspaceIndex = clamp(idx, 0, 2);
  document.querySelectorAll(".workspace").forEach((sec, i) => {
    sec.classList.toggle("active", i === workspaceIndex);
  });
  if (workspaceIndex === 1) {
    els.addProjectButton.classList.remove("hidden");
    renderProjects();
  } else {
    els.addProjectButton.classList.add("hidden");
  }

  // Refresh statistics view when navigating to it
  if (workspaceIndex === 2) {
    renderStats();
  }
}

els.prevWorkspace.addEventListener("click", () => setWorkspace(workspaceIndex - 1));
els.nextWorkspace.addEventListener("click", () => setWorkspace(workspaceIndex + 1));

/* ----------------- Authentication Flow ----------------- */

function showApp(username) {
  els.loginContainer.classList.add("hidden");
  els.appContainer.classList.remove("hidden");
  els.currentUser.textContent = username;
  setWorkspace(workspaceIndex);
  renderProjects();
}

function showAuth(mode) {
  els.loginContainer.classList.remove("hidden");
  els.appContainer.classList.add("hidden");
  if (mode === "signup") {
    els.loginForm.classList.add("hidden");
    els.signupForm.classList.remove("hidden");
  } else {
    els.signupForm.classList.add("hidden");
    els.loginForm.classList.remove("hidden");
  }
}

function loginUser() {
  const username = els.loginUsername.value.trim();
  const password = els.loginPassword.value;
  els.loginError.textContent = "";
  const app = loadApp();
  const user = app.users?.[username];
  if (!user || user.password !== password) {
    els.loginError.textContent = "Invalid username or password.";
    return;
  }
  app.currentUser = username;
  saveApp(app);
  showApp(username);
}

function signupUser() {
  const username = els.signupUsername.value.trim();
  const password = els.signupPassword.value;
  els.signupError.textContent = "";
  if (!username || !password) {
    els.signupError.textContent = "Please fill in both fields.";
    return;
  }
  withApp(app => {
    if (app.users?.[username]) {
      els.signupError.textContent = "That username is taken.";
      return;
    }
    app.users[username] = { password, projects: [], sessions: [] };
    app.currentUser = username;
  });
  showApp(username);
}

els.loginForm.addEventListener("submit", e => { e.preventDefault(); loginUser(); });
els.signupForm.addEventListener("submit", e => { e.preventDefault(); signupUser(); });
els.showSignup.addEventListener("click", e => { e.preventDefault(); showAuth("signup"); });
els.showLogin.addEventListener("click", e => { e.preventDefault(); showAuth("login"); });
els.logoutButton.addEventListener("click", () => {
  withApp(app => { app.currentUser = null; });
  location.reload();
});

/* ----------------- Theme Switching ----------------- */

function applyTheme() {
  const theme = localStorage.getItem("study_tracker_theme") || "blue";
  document.body.classList.toggle("theme-green", theme === "green");

  // keep list selection in sync if overlay is open
  if (els.themeList) {
    const items = els.themeList.querySelectorAll("li");
    items.forEach(li => {
      li.classList.toggle("selected", li.dataset.theme === theme);
    });
  }
}

function setTheme(themeId) {
  localStorage.setItem("study_tracker_theme", themeId);
  applyTheme();
  hideSettingsOverlay();
}

function buildThemeList() {
  els.themeList.innerHTML = "";
  const current = localStorage.getItem("study_tracker_theme") || "blue";

  THEMES.forEach(th => {
    const li = document.createElement("li");
    li.textContent = th.name;
    li.dataset.theme = th.id;
    if (th.id === current) li.classList.add("selected");
    li.addEventListener("click", () => setTheme(th.id));
    els.themeList.appendChild(li);
  });
}

function showSettingsOverlay() {
  buildThemeList();
  els.settingsOverlay.classList.remove("hidden");
}

function hideSettingsOverlay() {
  els.settingsOverlay.classList.add("hidden");
}

/* ----------------- Strategy Selection ----------------- */

function buildStrategyList() {
  els.strategyList.innerHTML = "";
  STRATEGIES.forEach(str => {
    const li = document.createElement("li");
    li.textContent = str.name;
    li.dataset.strategy = str.id;
    li.addEventListener("click", () => {
      els.studyDurationInput.value = str.study;
      els.breakDurationInput.value = str.break;
      els.timerMessage.textContent = `Strategy selected: ${str.name}. Adjust durations if needed.`;
      hideStrategyOverlay();
    });
    els.strategyList.appendChild(li);
  });
}

function showStrategyOverlay() {
  buildStrategyList();
  els.strategyOverlay.classList.remove("hidden");
}

function hideStrategyOverlay() {
  els.strategyOverlay.classList.add("hidden");
}

/* ----------------- Timer Functions ----------------- */

let timerInterval = null;
let timerMode = "study";
let timerRemaining = 0;
let studySeconds = 0;
let breakSeconds = 0;
let timerPaused = false;

// Exam mode state
// In exam mode the timer runs as a single uninterrupted countdown.
let examModeActive = false;
let examSeconds = 0;

function updateTimerDisplay() {
  const m = String(Math.floor(timerRemaining / 60)).padStart(2, "0");
  const s = String(Math.floor(timerRemaining % 60)).padStart(2, "0");
  els.timerDisplay.textContent = `${m}:${s}`;
}

function tickTimer() {
  if (timerPaused) return;

  if (timerRemaining > 0) {
    timerRemaining--;
    updateTimerDisplay();
    return;
  }

  // If we're in exam mode, finishing the countdown ends the session immediately.
  if (timerMode === "exam") {
    recordSessionMinutes(Math.round(examSeconds / 60), true);
    clearInterval(timerInterval);
    timerInterval = null;
    els.timerMessage.textContent = "Exam complete! Well done.";
    els.startTimerBtn.disabled = false;
    els.pauseTimerBtn.disabled = true;
    els.resetTimerBtn.disabled = false;
    els.pauseTimerBtn.textContent = "Pause";
    els.studyDurationInput.disabled = false;
    if (els.breakDurationInput) els.breakDurationInput.disabled = false;
    return;
  }

  // Normal study/break cycle
  if (timerMode === "study") {
    // Record the study portion as soon as it completes.
    recordSessionMinutes(Math.round(studySeconds / 60), false);
    timerMode = "break";
    timerRemaining = breakSeconds;
    els.timerMessage.textContent = "Break time! Relax.";
    updateTimerDisplay();
    return;
  }

  // Break finished – end session
  clearInterval(timerInterval);
  timerInterval = null;
  els.timerMessage.textContent = "Session complete! Well done.";
  els.startTimerBtn.disabled = false;
  els.pauseTimerBtn.disabled = true;
  els.resetTimerBtn.disabled = false;
  els.pauseTimerBtn.textContent = "Pause";
  els.studyDurationInput.disabled = false;
  if (els.breakDurationInput) els.breakDurationInput.disabled = false;
}

function startTimer() {
  const durationMin = parseInt(els.studyDurationInput.value, 10);
  const breakMin = parseInt(els.breakDurationInput?.value, 10);

  if (!durationMin || durationMin <= 0) {
    alert("Please enter a positive duration.");
    return;
  }

  if (!examModeActive) {
    if (!breakMin || breakMin <= 0) {
      alert("Please enter a positive break duration.");
      return;
    }
    studySeconds = durationMin * 60;
    breakSeconds = breakMin * 60;
    timerMode = "study";
    timerRemaining = studySeconds;
    els.timerMessage.textContent = "Study session started!";
  } else {
    examSeconds = durationMin * 60;
    timerMode = "exam";
    timerRemaining = examSeconds;
    els.timerMessage.textContent = "Exam started. Good luck!";
  }

  timerPaused = false;
  updateTimerDisplay();

  els.startTimerBtn.disabled = true;
  els.pauseTimerBtn.disabled = false;
  els.resetTimerBtn.disabled = false;
  els.pauseTimerBtn.textContent = "Pause";
  els.studyDurationInput.disabled = true;
  if (els.breakDurationInput) els.breakDurationInput.disabled = true;

  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(tickTimer, 1000);
}
function pauseTimer() {
  if (!timerInterval) return;

  timerPaused = !timerPaused;

  if (timerPaused) {
    els.timerMessage.textContent = "Paused";
    els.pauseTimerBtn.textContent = "Resume";
  } else {
    if (timerMode === "study") els.timerMessage.textContent = "Study session resumed";
    else if (timerMode === "break") els.timerMessage.textContent = "Break resumed";
    else els.timerMessage.textContent = "Exam resumed";
    els.pauseTimerBtn.textContent = "Pause";
  }
}

function resetTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;

  timerRemaining = 0;
  timerMode = "study";
  timerPaused = false;

  els.timerDisplay.textContent = "00:00";
  els.timerMessage.textContent = "";

  els.startTimerBtn.disabled = false;
  els.pauseTimerBtn.disabled = true;
  els.pauseTimerBtn.textContent = "Pause";
  els.resetTimerBtn.disabled = true;
  els.studyDurationInput.disabled = false;
  els.breakDurationInput.disabled = false;
}

/* ----------------- Exam Mode + Study Session Logging ----------------- */

function ensureUserSessions(app) {
  const user = getCurrentUserRecord(app);
  if (!user) return null;
  if (!Array.isArray(user.sessions)) user.sessions = [];
  return user;
}

function recordSessionMinutes(minutes, isExam) {
  // Minutes are stored as integers; date is local YYYY-MM-DD
  const mins = Math.max(0, Math.round(Number(minutes) || 0));
  if (!mins) return;

  withApp(app => {
    const user = ensureUserSessions(app);
    if (!user) return;
    user.sessions.push({ date: isoDateKey(new Date()), minutes: mins, exam: !!isExam });
  });
}

function toggleExamMode() {
  if (timerInterval) {
    alert("Stop/reset the timer before switching modes.");
    return;
  }
  examModeActive = !examModeActive;

  // UI changes are guarded in case your HTML doesn't include these elements yet
  if (els.examModeButton) els.examModeButton.classList.toggle("active", examModeActive);
  if (els.studyLabelText) els.studyLabelText.textContent = examModeActive ? "Exam Duration (min)" : "Study (min)";
  if (els.breakLabel) els.breakLabel.style.display = examModeActive ? "none" : "";
  if (els.strategyButton) els.strategyButton.disabled = examModeActive;
  els.timerMessage.textContent = examModeActive ? "Exam mode enabled. Set your duration." : "";

  resetTimer();
}

function formatTotal(totalMinutes) {
  const mins = Math.max(0, Math.round(totalMinutes));
  const hours = mins / 60;
  const days = hours / 24;
  return { mins, hours, days };
}

function renderStats() {
  if (!els.statsContainer) return;

  const app = loadApp();
  const user = ensureUserSessions(app);
  const sessions = user?.sessions || [];

  // Totals
  const totalMins = sessions.reduce((acc, s) => acc + (Number(s.minutes) || 0), 0);
  const t = formatTotal(totalMins);

  // Week buckets (Mon..Sun)
  const start = startOfWeekMonday(new Date());
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(start, i);
    const key = isoDateKey(d);
    return { key, label: ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][i], study: 0, exam: 0 };
  });

  const map = new Map(days.map(d => [d.key, d]));
  sessions.forEach(s => {
    const key = s.date;
    const bucket = map.get(key);
    if (!bucket) return;
    const mins = Number(s.minutes) || 0;
    if (s.exam) bucket.exam += mins;
    else bucket.study += mins;
  });

  const maxDay = Math.max(1, ...days.map(d => d.study + d.exam));

  els.statsContainer.innerHTML = "";

  const summary = document.createElement("div");
  summary.className = "stats-summary";
  summary.textContent = `Total studied: ${t.mins} minutes (${t.hours.toFixed(1)}h, ${t.days.toFixed(2)}d)`;
  els.statsContainer.appendChild(summary);

  const chart = document.createElement("div");
  chart.className = "week-chart";
  days.forEach(d => {
    const total = d.study + d.exam;
    const bar = document.createElement("div");
    bar.className = "week-bar";

    const stack = document.createElement("div");
    stack.className = "week-bar-stack";
    const studyPart = document.createElement("div");
    studyPart.className = "week-bar-study";
    studyPart.style.height = `${(d.study / maxDay) * 160}px`;
    const examPart = document.createElement("div");
    examPart.className = "week-bar-exam";
    examPart.style.height = `${(d.exam / maxDay) * 160}px`;

    // stack bottom -> top
    stack.appendChild(studyPart);
    stack.appendChild(examPart);

    const lbl = document.createElement("div");
    lbl.className = "week-bar-label";
    lbl.textContent = d.label;

    const tip = `${d.label}: ${total} min (study ${d.study} / exam ${d.exam})`;
    bar.title = tip;

    bar.appendChild(stack);
    bar.appendChild(lbl);
    chart.appendChild(bar);
  });

  els.statsContainer.appendChild(chart);
}

/* ----------------- Data Manipulation + Rendering ----------------- */
/* (This is your robust project/subject/task logic from the old file.) */

async function addProject() {
  const name = await openModal({
    title:"Project name",
    placeholder:"e.g. Semester 7",
    validate:v => (!v ? "Please enter a project name." : null),
  });
  if (!name) return;
  withApp(app => {
    const user = getCurrentUserRecord(app);
    if (user) user.projects.push({ name, subjects: [] });
  });
  renderProjects();
}

async function editProject(pIndex) {
  const app = loadApp();
  const user = getCurrentUserRecord(app);
  const project = user?.projects?.[pIndex];
  if (!project) return;

  const newName = await openModal({
    title:`Rename project "${project.name}"`,
    placeholder:project.name,
    validate:v => (!v ? "Please enter a name." : null),
  });
  if (!newName) return;

  withApp(app => {
    const u = getCurrentUserRecord(app);
    if (u && u.projects[pIndex]) u.projects[pIndex].name = newName;
  });
  renderProjects();
}

async function deleteProject(pIndex) {
  const app = loadApp();
  const user = getCurrentUserRecord(app);
  const project = user?.projects?.[pIndex];
  if (!project) return;

  const confirm = await openModal({
    title:`Delete project "${project.name}"?`,
    placeholder:"Type DELETE to confirm",
    validate:v => (v === "DELETE" ? null : "Type DELETE to confirm."),
  });
  if (!confirm) return;

  withApp(app => {
    const u = getCurrentUserRecord(app);
    if (u) u.projects.splice(pIndex, 1);
  });

  delete expandedProjects[pIndex];
  Object.keys(expandedSubjects).forEach(k => {
    if (k.startsWith(`${pIndex}-`)) delete expandedSubjects[k];
  });

  renderProjects();
}

async function addSubject(pIndex) {
  const name = await openModal({
    title:"Subject name",
    placeholder:"e.g. Quantum Mechanics",
    validate:v => (!v ? "Please enter a subject name." : null),
  });
  if (!name) return;

  withApp(app => {
    const u = getCurrentUserRecord(app);
    const proj = u?.projects?.[pIndex];
    if (proj) proj.subjects.push({ name, tasks:{} });
  });

  renderProjects();
}

async function editSubject(pIndex, sIndex) {
  const app = loadApp();
  const user = getCurrentUserRecord(app);
  const subject = user?.projects?.[pIndex]?.subjects?.[sIndex];
  if (!subject) return;

  const newName = await openModal({
    title:`Rename subject "${subject.name}"`,
    placeholder:subject.name,
    validate:v => (!v ? "Please enter a name." : null),
  });
  if (!newName) return;

  withApp(app => {
    const u = getCurrentUserRecord(app);
    const subj = u?.projects?.[pIndex]?.subjects?.[sIndex];
    if (subj) subj.name = newName;
  });

  renderProjects();
}

async function deleteSubject(pIndex, sIndex) {
  const app = loadApp();
  const user = getCurrentUserRecord(app);
  const subject = user?.projects?.[pIndex]?.subjects?.[sIndex];
  if (!subject) return;

  const confirm = await openModal({
    title:`Delete subject "${subject.name}"?`,
    placeholder:"Type DELETE to confirm",
    validate:v => (v === "DELETE" ? null : "Type DELETE to confirm."),
  });
  if (!confirm) return;

  withApp(app => {
    const u = getCurrentUserRecord(app);
    u.projects[pIndex].subjects.splice(sIndex, 1);
  });

  delete expandedSubjects[`${pIndex}-${sIndex}`];
  renderProjects();
}

async function addTask(pIndex, sIndex) {
  const taskName = await openModal({
    title:"Task name",
    placeholder:"e.g. Lectures",
    validate:v => (!v ? "Please enter a task name." : null),
  });
  if (!taskName) return;

  const totalStr = await openModal({
    title:`Total units for "${taskName}"`,
    placeholder:"e.g. 27",
    validate:v => {
      const n = Number(v);
      return (!Number.isFinite(n) || n <= 0) ? "Please enter a positive number." : null;
    },
  });
  if (!totalStr) return;

  const total = Math.floor(Number(totalStr));

  withApp(app => {
    const u = getCurrentUserRecord(app);
    const subj = u?.projects?.[pIndex]?.subjects?.[sIndex];
    if (subj) {
      if (!subj.tasks) subj.tasks = {};
      subj.tasks[taskName] = { total, done: 0 };
    }
  });

  renderProjects();
}

async function editTask(pIndex, sIndex, taskKey) {
  const app = loadApp();
  const user = getCurrentUserRecord(app);
  const task = user?.projects?.[pIndex]?.subjects?.[sIndex]?.tasks?.[taskKey];
  if (!task) return;

  const newName = await openModal({
    title:`Rename task "${taskKey}"`,
    placeholder:taskKey,
    validate:v => (!v ? "Please enter a name." : null),
  });
  if (!newName) return;

  const totalStr = await openModal({
    title:`Total units for "${newName}"`,
    placeholder:String(task.total),
    validate:v => {
      const n = Number(v);
      return (!Number.isFinite(n) || n <= 0) ? "Please enter a positive number." : null;
    },
  });
  if (!totalStr) return;

  const newTotal = Math.floor(Number(totalStr));

  withApp(app => {
    const u = getCurrentUserRecord(app);
    const subj = u?.projects?.[pIndex]?.subjects?.[sIndex];
    if (!subj || !subj.tasks?.[taskKey]) return;

    const old = subj.tasks[taskKey];
    const done = Math.min(old.done, newTotal);

    delete subj.tasks[taskKey];
    subj.tasks[newName] = { total:newTotal, done };
  });

  renderProjects();
}

async function deleteTask(pIndex, sIndex, taskKey) {
  const app = loadApp();
  const user = getCurrentUserRecord(app);
  const task = user?.projects?.[pIndex]?.subjects?.[sIndex]?.tasks?.[taskKey];
  if (!task) return;

  const confirm = await openModal({
    title:`Delete task "${taskKey}"?`,
    placeholder:"Type DELETE to confirm",
    validate:v => (v === "DELETE" ? null : "Type DELETE to confirm."),
  });
  if (!confirm) return;

  withApp(app => {
    const u = getCurrentUserRecord(app);
    const subj = u?.projects?.[pIndex]?.subjects?.[sIndex];
    if (!subj || !subj.tasks?.[taskKey]) return;
    delete subj.tasks[taskKey];
  });

  renderProjects();
}

function changeTaskDone(pIndex, sIndex, taskKey, delta) {
  withApp(app => {
    const u = getCurrentUserRecord(app);
    const t = u?.projects?.[pIndex]?.subjects?.[sIndex]?.tasks?.[taskKey];
    if (t) t.done = clamp((t.done || 0) + delta, 0, t.total || 0);
  });
  renderProjects();
}
function renderProjects() {
  const app = loadApp();
  const user = getCurrentUserRecord(app);
  if (!user) return;

  els.projectsList.innerHTML = "";

  if (!user.projects || user.projects.length === 0) {
    const p = document.createElement("p");
    p.style.color = "rgba(220,215,186,0.75)";
    p.textContent = "No projects yet. Use the 'Add Project' button to create one.";
    els.projectsList.appendChild(p);
    return;
  }

  user.projects.forEach((project, pIndex) => {
    const totals = sumProject(project);

    const card = document.createElement("div");
    card.className = "project";

    const header = document.createElement("div");
    header.className = "project-header";

    const title = document.createElement("div");
    title.className = "project-title";
    title.textContent = project.name;

    const circle = document.createElement("div");
    circle.className = "progress-circle";
    circle.textContent = `${totals.pct}%`;

    const actions = document.createElement("div");
    actions.className = "project-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "edit-btn";
    editBtn.title = "Edit project";
    editBtn.textContent = "✎";
    editBtn.addEventListener("click", e => { e.stopPropagation(); editProject(pIndex); });

    const delBtn = document.createElement("button");
    delBtn.className = "delete-btn";
    delBtn.title = "Delete project";
    delBtn.textContent = "🗑";
    delBtn.addEventListener("click", e => { e.stopPropagation(); deleteProject(pIndex); });

    actions.append(editBtn, delBtn);
    header.append(title, circle, actions);

    const body = document.createElement("div");
    body.className = "project-body";
    if (expandedProjects[pIndex]) body.classList.remove("hidden");
    else body.classList.add("hidden");

    const addSubBtn = document.createElement("button");
    addSubBtn.type = "button";
    addSubBtn.textContent = "Add Subject";
    addSubBtn.addEventListener("click", e => { e.stopPropagation(); addSubject(pIndex); });
    body.appendChild(addSubBtn);

    (project.subjects || []).forEach((subject, sIndex) => {
      const subjTotals = sumSubject(subject);
      const subj = document.createElement("div");
      subj.className = "subject";

      const key = `${pIndex}-${sIndex}`;
      if (expandedSubjects[key]) subj.classList.add("expanded");

      const subjHeader = document.createElement("div");
      subjHeader.className = "subject-header";

      const left = document.createElement("div");
      left.className = "subject-left";
      left.innerHTML =
        `<div class="subject-name">${escapeHtml(subject.name)}</div>` +
        `<div class="subject-progress">${subjTotals.done}/${subjTotals.total} • ${subjTotals.pct}%</div>`;

      const subjActions = document.createElement("div");
      subjActions.className = "subject-actions";

      const addTaskBtn = document.createElement("button");
      addTaskBtn.title = "Add task";
      addTaskBtn.textContent = "+";
      addTaskBtn.addEventListener("click", e => { e.stopPropagation(); addTask(pIndex, sIndex); });

      const editSubBtn = document.createElement("button");
      editSubBtn.className = "edit-btn";
      editSubBtn.title = "Edit subject";
      editSubBtn.textContent = "✎";
      editSubBtn.addEventListener("click", e => { e.stopPropagation(); editSubject(pIndex, sIndex); });

      const delSubBtn = document.createElement("button");
      delSubBtn.className = "delete-btn";
      delSubBtn.title = "Delete subject";
      delSubBtn.textContent = "🗑";
      delSubBtn.addEventListener("click", e => { e.stopPropagation(); deleteSubject(pIndex, sIndex); });

      subjActions.append(addTaskBtn, editSubBtn, delSubBtn);
      subjHeader.append(left, subjActions);

      subjHeader.addEventListener("click", () => {
        expandedSubjects[key] = !expandedSubjects[key];
        renderProjects();
      });

      const subjBody = document.createElement("div");
      subjBody.className = "subject-body";

      if (expandedSubjects[key]) {
        const tasks = subject.tasks || {};
        const keys = Object.keys(tasks);

        if (keys.length === 0) {
          const empty = document.createElement("div");
          empty.className = "task-meta";
          empty.textContent = "No tasks yet.";
          subjBody.appendChild(empty);
        } else {
          keys.forEach(taskKey => {
            const t = tasks[taskKey];
            const pct = percent(t.done || 0, t.total || 0);

            const row = document.createElement("div");
            row.className = "task-row";

            const nameCell = document.createElement("div");
            nameCell.innerHTML =
              `<div class="task-name">${escapeHtml(taskKey)}</div>` +
              `<div class="task-meta">${t.done || 0}/${t.total || 0} • ${pct}%</div>`;

            const rail = document.createElement("div");
            rail.className = "progress-rail";

            const fill = document.createElement("div");
            fill.className = "progress-fill";
            fill.style.width = `${pct}%`;

            rail.appendChild(fill);

            const actions = document.createElement("div");
            actions.className = "task-actions";

            const minusBtn = document.createElement("button");
            minusBtn.title = "Mark one unit undone";
            minusBtn.textContent = "−";
            minusBtn.addEventListener("click", e => { e.stopPropagation(); changeTaskDone(pIndex, sIndex, taskKey, -1); });

            const plusBtn = document.createElement("button");
            plusBtn.title = "Mark one unit done";
            plusBtn.textContent = "+";
            plusBtn.addEventListener("click", e => { e.stopPropagation(); changeTaskDone(pIndex, sIndex, taskKey, 1); });

            const editTaskBtn = document.createElement("button");
            editTaskBtn.className = "edit-btn";
            editTaskBtn.title = "Edit task";
            editTaskBtn.textContent = "✎";
            editTaskBtn.addEventListener("click", e => { e.stopPropagation(); editTask(pIndex, sIndex, taskKey); });

            const deleteTaskBtn = document.createElement("button");
            deleteTaskBtn.className = "delete-btn";
            deleteTaskBtn.title = "Delete task";
            deleteTaskBtn.textContent = "🗑";
            deleteTaskBtn.addEventListener("click", e => { e.stopPropagation(); deleteTask(pIndex, sIndex, taskKey); });

            actions.append(minusBtn, plusBtn, editTaskBtn, deleteTaskBtn);
            row.append(nameCell, rail, actions);

            subjBody.appendChild(row);
          });
        }
      }

      subj.append(subjHeader, subjBody);
      body.appendChild(subj);
    });

    header.addEventListener("click", () => {
      expandedProjects[pIndex] = !expandedProjects[pIndex];
      renderProjects();
    });

    card.append(header, body);
    els.projectsList.appendChild(card);
  });
}

/* ----------------- Event Binding ----------------- */

// Timer
els.startTimerBtn.addEventListener("click", startTimer);
els.pauseTimerBtn.addEventListener("click", pauseTimer);
els.resetTimerBtn.addEventListener("click", resetTimer);

// Exam mode toggle (guarded in case the button isn't present yet)
if (els.examModeButton) {
  els.examModeButton.addEventListener("click", toggleExamMode);
}

// Strategy overlay
els.strategyButton.addEventListener("click", e => { e.preventDefault(); showStrategyOverlay(); });
els.closeStrategyOverlay.addEventListener("click", e => { e.preventDefault(); hideStrategyOverlay(); });

// Settings overlay (theme)
els.settingsButton.addEventListener("click", e => { e.preventDefault(); showSettingsOverlay(); });
els.closeSettingsOverlay.addEventListener("click", e => { e.preventDefault(); hideSettingsOverlay(); });

// Add project
els.addProjectButton.addEventListener("click", e => { e.preventDefault(); addProject(); });

/* ----------------- Initialize (ONE) ----------------- */

(function init() {
  // Default theme if none exists
  if (!localStorage.getItem("study_tracker_theme")) {
    localStorage.setItem("study_tracker_theme", "blue");
  }

  applyTheme();
  hideSettingsOverlay();
  hideStrategyOverlay();

  const app = loadApp();
  if (app.currentUser) {
    showApp(app.currentUser);
  } else {
    const hasUsers = Object.keys(app.users || {}).length > 0;
    showAuth(hasUsers ? "login" : "signup");
    setWorkspace(workspaceIndex);
  }
})();
