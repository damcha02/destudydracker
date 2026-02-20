// src/features/timer.js
import { DOM } from "../core/dom.js";
import { Events } from "../core/events.js";
import { getStore } from "../store/store.js";

function isoDateKey(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

let timerInterval = null;
let timerRemaining = 0;
let timerPaused = false;


let endAtMs = null;        // absolute deadline timestamp
let pausedRemainingSec = 0; // store remaining when paused

let examModeActive = false;
let timerMode = "study"; // "study" | "break" | "exam"

let studySeconds = 0;
let breakSeconds = 0;
let examSeconds = 0;

function updateTimerDisplay() {
  const m = String(Math.floor(timerRemaining / 60)).padStart(2, "0");
  const s = String(Math.floor(timerRemaining % 60)).padStart(2, "0");
  if (DOM.timerDisplay) DOM.timerDisplay.textContent = `${m}:${s}`;
}

function setMessage(msg) {
  if (DOM.timerMessage) DOM.timerMessage.textContent = msg || "";
}

function enableControls({ start, pause, reset, inputs }) {
  if (DOM.startBtn) DOM.startBtn.disabled = !start;
  if (DOM.pauseBtn) DOM.pauseBtn.disabled = !pause;
  if (DOM.resetBtn) DOM.resetBtn.disabled = !reset;

  if (DOM.studyInput) DOM.studyInput.disabled = !inputs;
  if (DOM.breakInput) DOM.breakInput.disabled = !inputs;
}

// async function recordSession(minutes, isExam) {
//   const store = getStore();
//   const mins = Math.round(Number(minutes) || 0);
//   if (!mins || mins <= 0) return;

//   await store.addSession({
//     date: isoDateKey(new Date()),
//     minutes: mins,
//     isExam: !!isExam
//   });
//   Events.emit("sessions:changed");
// }
async function recordSession(minutes, isExam) {
  const store = getStore();
  const mins = Math.round(Number(minutes) || 0);
  if (!mins || mins <= 0) return;

  // Helpful debug info
  const username = store.getCurrentUsername?.() ?? "(unknown)";
  console.log("[recordSession] attempting save", {
    mins,
    isExam: !!isExam,
    username,
    date: isoDateKey(new Date()),
  });

  Events.emit("toast", { msg: `Saving ${mins} min...` });

  try {
    await store.addSession({
      date: isoDateKey(new Date()),
      minutes: mins,
      isExam: !!isExam,
    });

    console.log("[recordSession] save OK");
    Events.emit("toast", { msg: `Saved ${mins} min` });
    Events.emit("sessions:changed");
  } catch (err) {
    console.error("[recordSession] save FAILED:", err);
    Events.emit("toast", { msg: "Session NOT saved (see console)" });
  }
}

function finishExam() {
  // SAFETY: never run exam finish unless we're actually in exam mode
  if (timerMode !== "exam") return;

  recordSession(examSeconds / 60, true);
  clearInterval(timerInterval);
  timerInterval = null;
  endAtMs = null;
  pausedRemainingSec = 0;
  timerPaused = false;

  setMessage("Exam complete! Well done.");
  enableControls({ start: true, pause: false, reset: true, inputs: true });
  if (DOM.pauseBtn) DOM.pauseBtn.textContent = "Pause";
}


function finishBreak() {
  clearInterval(timerInterval);
  timerInterval = null;
  endAtMs = null;
  pausedRemainingSec = 0;
  timerPaused = false;

  setMessage("Session complete! Well done.");
  enableControls({ start: true, pause: false, reset: true, inputs: true });
  if (DOM.pauseBtn) DOM.pauseBtn.textContent = "Pause";
}

function startBreak() {
  timerMode = "break";
  timerRemaining = breakSeconds;
  endAtMs = Date.now() + timerRemaining * 1000; 
  pausedRemainingSec = 0;  

  setMessage("Break time! Relax.");
  updateTimerDisplay();
}

function finishStudyStartBreak() {
  console.log("[timer] study finished -> starting break, recording study");
  startBreak();

  // record only the study portion
  recordSession(studySeconds / 60, false).catch(console.error);
}

function tick() {
  Events.emit("timer:tick", {
    timerMode,
    timerRemaining,
    timerPaused,
    studySeconds,
    breakSeconds,
    examSeconds
  });

  if (timerPaused) return;

  if (!endAtMs) return;

  // recompute remaining from real time
  const rem = Math.ceil((endAtMs - Date.now()) / 1000);
  timerRemaining = Math.max(0, rem);
  updateTimerDisplay();

  if (timerRemaining > 0) return;

  // hit 0 -> transition
  switch (timerMode) {
    case "exam":  finishExam(); break;
    case "study": finishStudyStartBreak(); break;
    case "break": finishBreak(); break;
  }
}



function startTimer() {
  const durationMin = parseInt(DOM.studyInput?.value, 10);
  const breakMin = parseInt(DOM.breakInput?.value, 10);

  if (!durationMin || durationMin <= 0) {
    alert("Please enter a positive duration.");
    return;
  }

  timerPaused = false;

  if (examModeActive) {
    examSeconds = durationMin * 60;
    timerMode = "exam";
    timerRemaining = examSeconds;
    endAtMs = Date.now() + timerRemaining * 1000;
    pausedRemainingSec = 0;
    setMessage("Exam started. Good luck!");
  } else {
    if (!breakMin || breakMin <= 0) {
      alert("Please enter a positive break duration.");
      return;
    }
    studySeconds = durationMin * 60;
    breakSeconds = breakMin * 60;
    timerMode = "study";
    timerRemaining = studySeconds;
    endAtMs = Date.now() + timerRemaining * 1000;
    pausedRemainingSec = 0;
    setMessage("Study session started!");
  }

  updateTimerDisplay();

  enableControls({ start: false, pause: true, reset: true, inputs: false });
  if (DOM.pauseBtn) DOM.pauseBtn.textContent = "Pause";

  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(tick, 1000);
}

function pauseTimer() {
  if (!timerInterval) return;

  timerPaused = !timerPaused;
  if (timerPaused) {
    setMessage("Paused");
    pausedRemainingSec = timerRemaining;
    endAtMs = null;
    if (DOM.pauseBtn) DOM.pauseBtn.textContent = "Resume";
  } else {
    // resume
    endAtMs = Date.now() + pausedRemainingSec * 1000;   
    pausedRemainingSec = 0;
    tick();
    if (timerMode === "study") setMessage("Study session resumed");
    else if (timerMode === "break") setMessage("Break resumed");
    else setMessage("Exam resumed");

    if (DOM.pauseBtn) DOM.pauseBtn.textContent = "Pause";
  }
}

function resetTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;

  timerRemaining = 0;
  timerPaused = false;
  timerMode = "study";
  endAtMs = null;
  pausedRemainingSec = 0;
  if (DOM.timerDisplay) DOM.timerDisplay.textContent = "00:00";
  setMessage("");

  enableControls({ start: true, pause: false, reset: false, inputs: true });
  if (DOM.pauseBtn) DOM.pauseBtn.textContent = "Pause";
}

function toggleExamMode() {
  if (timerInterval) {
    alert("Stop/reset the timer before switching modes.");
    return;
  }

  examModeActive = !examModeActive;

  // UI tweaks
  if (DOM.examModeButton) DOM.examModeButton.classList.toggle("active", examModeActive);
  if (DOM.studyLabelText) DOM.studyLabelText.textContent = examModeActive ? "Exam Duration (min)" : "Study (min)";
  if (DOM.breakLabel) DOM.breakLabel.style.display = examModeActive ? "none" : "";
  if (DOM.strategyButton) DOM.strategyButton.disabled = examModeActive;

  setMessage(examModeActive ? "Exam mode enabled. Set your duration." : "");
  resetTimer();
}

export function initTimer() {
  console.log("Timer initialized");

  DOM.startBtn?.addEventListener("click", startTimer);
  DOM.pauseBtn?.addEventListener("click", pauseTimer);
  DOM.resetBtn?.addEventListener("click", resetTimer);

  DOM.examModeButton?.addEventListener("click", toggleExamMode);

  Events.on("strategy:changed", (e) => {
    const s = e.detail?.strategy;
    if (!s) return;

    if (DOM.studyInput) DOM.studyInput.value = s.study;
    if (DOM.breakInput) DOM.breakInput.value = s.break;

    setMessage(`Strategy selected: ${s.name}.`);
  });

  // initial UI state
  enableControls({ start: true, pause: false, reset: false, inputs: true });
  updateTimerDisplay();

  document.addEventListener("visibilitychange", () => {
    console.log("[page] visibilitychange:", document.hidden ? "HIDDEN" : "VISIBLE", {
      timerMode,
      timerPaused,
      timerRemaining,
    });

    if (!document.hidden) {
      Events.emit("toast", { msg: "Welcome back — checking timer…" });
      tick(); 
    }
  });

}
