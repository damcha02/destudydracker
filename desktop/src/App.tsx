import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import "./App.css";
import {
  buildDailyNoteMarkdown,
  calculateDailyWork,
  clamp,
  daysUntil,
  formatDate,
  formatMinutes,
  getCourseHealth,
  getCourseMinutes,
  getCourseTasks,
  getFocusMomentum,
  getOverallHealth,
  getRemainingUnits,
  getSemesterCourses,
  getSemesterHealth,
  getSemesterTasks,
  getStreakDays,
  getTaskProgress,
  getTodayMinutes,
  getTopPendingTasks,
  getUpcomingExams,
  getWeeklyActivity,
  isoDate,
} from "./lib/metrics";
import { createVault, exportDailyNote, isTauriApp, pickVaultParentDirectory } from "./lib/obsidian";
import { defaultTimer, downloadBackup, loadAppState, makeId, saveAppState } from "./lib/storage";
import type { AppState, Course, Exam, Priority, Semester, StudySession, TabKey, Task, TimerState } from "./types";

const focusPresets = [
  { label: "Pomodoro 25/5", study: 25, breakMinutes: 5, mode: "focus" as const },
  { label: "Deep Work 52/17", study: 52, breakMinutes: 17, mode: "focus" as const },
  { label: "Sprint 90/20", study: 90, breakMinutes: 20, mode: "focus" as const },
  { label: "Exam 120", study: 120, breakMinutes: 0, mode: "exam" as const },
];

const swissGrades = [4.0, 4.25, 4.5, 4.75, 5.0, 5.25, 5.5, 5.75, 6.0];
const TOTAL_WORKLOAD_ID = "__total_workload__";

type CourseDraft = {
  semesterId: string;
  name: string;
  targetGrade: string;
  color: string;
};

type TaskDraft = {
  semesterId: string;
  courseId: string;
  title: string;
  totalUnits: string;
  completedUnits: string;
  dueDate: string;
  priority: Priority;
  notes: string;
};

type ExamDraft = {
  semesterId: string;
  courseId: string;
  title: string;
  examDate: string;
  weight: string;
  preparedness: string;
};

function formatClock(totalSeconds: number) {
  const seconds = Math.max(0, totalSeconds);
  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
  const remaining = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${remaining}`;
}

function formatSwissGrade(grade: number) {
  const fixed = grade.toFixed(2);
  if (fixed.endsWith("00")) return fixed.slice(0, -1);
  if (fixed.endsWith("0")) return fixed.slice(0, -1);
  return fixed;
}

function toggleId(list: string[], id: string) {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

function getTimerMinutes(timer: TimerState) {
  if (!timer.startedAt || (timer.phase !== "study" && timer.phase !== "exam")) return 0;

  const configuredSeconds = timer.phase === "exam" ? timer.examMinutes * 60 : timer.studyMinutes * 60;
  const elapsed = clamp(configuredSeconds - timer.remainingSeconds, 0, configuredSeconds);
  return Math.max(1, Math.round(elapsed / 60));
}

function keepTimerContext(timer: TimerState) {
  return {
    studyMinutes: timer.studyMinutes,
    breakMinutes: timer.breakMinutes,
    examMinutes: timer.examMinutes,
    semesterId: timer.semesterId,
    courseId: timer.courseId,
    taskId: timer.taskId,
    goal: timer.goal,
    learned: timer.learned,
    blocker: timer.blocker,
    nextStep: timer.nextStep,
    confidence: timer.confidence,
    mode: timer.mode,
    presetLabel: timer.presetLabel,
  };
}

function buildSessionFromTimer(timer: TimerState, endedAt: string, minutes: number): StudySession {
  return {
    id: makeId(),
    semesterId: timer.semesterId,
    courseId: timer.courseId,
    taskId: timer.taskId,
    kind: timer.phase === "exam" ? "exam" : "study",
    goal: timer.goal.trim(),
    learned: timer.learned.trim(),
    blocker: timer.blocker.trim(),
    nextStep: timer.nextStep.trim(),
    confidence: timer.confidence,
    startedAt: timer.startedAt ?? endedAt,
    endedAt,
    minutes,
    presetLabel: timer.presetLabel,
  };
}

function App() {
  const [state, setState] = useState<AppState>(loadAppState);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [semesterName, setSemesterName] = useState("");
  const [courseDraft, setCourseDraft] = useState<CourseDraft>({
    semesterId: "",
    name: "",
    targetGrade: "4.0",
    color: "#8fb4ff",
  });
  const [taskDraft, setTaskDraft] = useState<TaskDraft>({
    semesterId: "",
    courseId: "",
    title: "",
    totalUnits: "10",
    completedUnits: "0",
    dueDate: "",
    priority: "medium",
    notes: "",
  });
  const [examDraft, setExamDraft] = useState<ExamDraft>({
    semesterId: "",
    courseId: "",
    title: "",
    examDate: "",
    weight: "40",
    preparedness: "35",
  });
  const [showSemesterForm, setShowSemesterForm] = useState(false);
  const [expandedSemesterIds, setExpandedSemesterIds] = useState<string[]>([]);
  const [expandedCourseIds, setExpandedCourseIds] = useState<string[]>([]);
  const [addingCourseSemesterId, setAddingCourseSemesterId] = useState<string | null>(null);
  const [addingTaskCourseId, setAddingTaskCourseId] = useState<string | null>(null);
  const [addingExamSemesterId, setAddingExamSemesterId] = useState<string | null>(null);
  const [calculatorOpen, setCalculatorOpen] = useState(true);
  const [timerAdvancedOpen, setTimerAdvancedOpen] = useState(false);

  useEffect(() => {
    saveAppState(state);
  }, [state]);

  useEffect(() => {
    if (!message) return undefined;
    const timeout = window.setTimeout(() => setMessage(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [message]);

  useEffect(() => {
    if (!state.timer.running) return undefined;

    const interval = window.setInterval(() => {
      setState((current) => {
        const timer = current.timer;
        if (!timer.running || !timer.endsAt) return current;

        const diff = Math.ceil((new Date(timer.endsAt).getTime() - Date.now()) / 1000);
        if (diff > 0) {
          if (diff === timer.remainingSeconds) return current;
          return { ...current, timer: { ...timer, remainingSeconds: diff } };
        }

        const endedAt = new Date().toISOString();
        if (timer.phase === "study") {
          const session = buildSessionFromTimer(timer, endedAt, Math.max(1, timer.studyMinutes));
          if (timer.mode === "focus" && timer.breakMinutes > 0) {
            return {
              ...current,
              sessions: [session, ...current.sessions].slice(0, 120),
              timer: {
                ...timer,
                phase: "break",
                running: true,
                startedAt: endedAt,
                endsAt: new Date(Date.now() + timer.breakMinutes * 60000).toISOString(),
                remainingSeconds: timer.breakMinutes * 60,
              },
            };
          }

          return {
            ...current,
            sessions: [session, ...current.sessions].slice(0, 120),
            timer: { ...defaultTimer, ...keepTimerContext(timer) },
          };
        }

        if (timer.phase === "exam") {
          const session = buildSessionFromTimer(timer, endedAt, Math.max(1, timer.examMinutes));
          return {
            ...current,
            sessions: [session, ...current.sessions].slice(0, 120),
            timer: { ...defaultTimer, ...keepTimerContext(timer) },
          };
        }

        return {
          ...current,
          timer: { ...defaultTimer, ...keepTimerContext(timer) },
        };
      });
    }, 500);

    return () => window.clearInterval(interval);
  }, [state.timer.running]);

  useEffect(() => {
    if (
      selectedTaskId === TOTAL_WORKLOAD_ID ||
      (selectedTaskId && state.tasks.some((task) => task.id === selectedTaskId))
    ) {
      return;
    }
    const nextTask = state.tasks.find((task) => getRemainingUnits(task) > 0) ?? state.tasks[0] ?? null;
    setSelectedTaskId(nextTask?.id ?? null);
  }, [selectedTaskId, state.tasks]);

  useEffect(() => {
    const firstSemester = state.semesters[0]?.id ?? "";
    if (!courseDraft.semesterId && firstSemester) {
      setCourseDraft((current) => ({ ...current, semesterId: firstSemester }));
    }
    if (!taskDraft.semesterId && firstSemester) {
      const firstCourse = state.courses.find((course) => course.semesterId === firstSemester);
      setTaskDraft((current) => ({
        ...current,
        semesterId: firstSemester,
        courseId: firstCourse?.id ?? current.courseId,
      }));
    }
    if (!examDraft.semesterId && firstSemester) {
      const firstCourse = state.courses.find((course) => course.semesterId === firstSemester);
      setExamDraft((current) => ({
        ...current,
        semesterId: firstSemester,
        courseId: firstCourse?.id ?? current.courseId,
      }));
    }
  }, [courseDraft.semesterId, examDraft.semesterId, state.courses, state.semesters, taskDraft.semesterId]);

  const semesterLookup = useMemo(
    () => new Map(state.semesters.map((semester) => [semester.id, semester])),
    [state.semesters],
  );
  const courseLookup = useMemo(
    () => new Map(state.courses.map((course) => [course.id, course])),
    [state.courses],
  );
  const taskLookup = useMemo(() => new Map(state.tasks.map((task) => [task.id, task])), [state.tasks]);
  const selectedTask = useMemo(
    () => state.tasks.find((task) => task.id === selectedTaskId) ?? null,
    [selectedTaskId, state.tasks],
  );
  const totalWorkload = useMemo(() => {
    const totalUnits = state.tasks.reduce((sum, task) => sum + Math.max(task.totalUnits, 1), 0);
    const completedUnits = state.tasks.reduce(
      (sum, task) => sum + clamp(task.completedUnits, 0, task.totalUnits),
      0,
    );
    const unfinishedTasks = state.tasks.filter((task) => getRemainingUnits(task) > 0);
    const datedTasks = unfinishedTasks.filter((task) => task.dueDate);
    const nearestDueDate = datedTasks.length
      ? [...datedTasks].sort((a, b) => daysUntil(a.dueDate ?? "") - daysUntil(b.dueDate ?? ""))[0]?.dueDate ?? null
      : null;
    const remainingUnits = Math.max(0, totalUnits - completedUnits);

    let daysLeft: number | null = null;
    let unitsPerDay = remainingUnits;
    let message = "Add due dates to get a realistic overall pace.";

    if (remainingUnits <= 0) {
      unitsPerDay = 0;
      daysLeft = 0;
      message = "Everything tracked is complete. Use the timer for revision or new work.";
    } else if (nearestDueDate) {
      const dueIn = daysUntil(nearestDueDate);
      daysLeft = dueIn;
      if (dueIn <= 0) {
        unitsPerDay = remainingUnits;
        message = `Nearest deadline is now. You need ${remainingUnits} units today to stay on top.`;
      } else {
        unitsPerDay = remainingUnits / dueIn;
        message = `${unitsPerDay.toFixed(1)} units/day keeps total workload ahead of the nearest deadline (${formatDate(nearestDueDate)}).`;
      }
    }

    const progress = totalUnits ? Math.round((completedUnits / totalUnits) * 100) : 0;

    return {
      totalUnits,
      completedUnits,
      remainingUnits,
      progress,
      unitsPerDay,
      daysLeft,
      nearestDueDate,
      message,
    };
  }, [state.tasks]);
  const isTotalWorkloadSelected = selectedTaskId === TOTAL_WORKLOAD_ID;

  const weeklyActivity = useMemo(() => getWeeklyActivity(state.sessions), [state.sessions]);
  const topTasks = useMemo(() => getTopPendingTasks(state), [state]);
  const upcomingExams = useMemo(() => getUpcomingExams(state), [state]);
  const overallHealth = useMemo(() => getOverallHealth(state), [state]);
  const notePreview = useMemo(() => buildDailyNoteMarkdown(state), [state]);
  const healthLabel = overallHealth >= 75 ? "Strong" : overallHealth >= 55 ? "Steady" : overallHealth >= 35 ? "Watch" : "Critical";
  const selectedTaskCalc = selectedTask ? calculateDailyWork(selectedTask) : null;
  const selectedTaskProgress = isTotalWorkloadSelected ? totalWorkload.progress : selectedTask ? getTaskProgress(selectedTask) : 0;
  const maxWeeklyMinutes = Math.max(30, ...weeklyActivity.map((entry) => entry.minutes));
  const completionRadius = 58;
  const completionCircumference = 2 * Math.PI * completionRadius;
  const completionOffset = completionCircumference - (selectedTaskProgress / 100) * completionCircumference;

  const timerCourses = state.timer.semesterId ? getSemesterCourses(state, state.timer.semesterId) : state.courses;
  const timerTasks = state.timer.courseId ? getCourseTasks(state, state.timer.courseId) : [];
  const timerCourse = state.timer.courseId ? courseLookup.get(state.timer.courseId) : null;
  const hasKnownTimerPreset = focusPresets.some((preset) => preset.label === state.timer.presetLabel);

  const gardenPlants = useMemo(
    () => state.sessions.slice(0, 16).map((session, index) => ({
      id: session.id,
      left: 7 + (index % 4) * 22 + (index % 2) * 4,
      height: 58 + (session.minutes % 70),
      scale: 0.85 + session.confidence / 10,
      bloom: session.kind === "exam" ? "var(--danger)" : courseLookup.get(session.courseId ?? "")?.color ?? "var(--accent)",
    })),
    [courseLookup, state.sessions],
  );

  function setActiveTab(activeTab: TabKey) {
    setState((current) => ({ ...current, activeTab }));
  }

  function addSemester(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = semesterName.trim();
    if (!name) {
      setMessage("Give the semester a name first.");
      return;
    }

    const semester: Semester = {
      id: makeId(),
      name,
      createdAt: new Date().toISOString(),
    };

    setState((current) => ({ ...current, semesters: [...current.semesters, semester] }));
    setSemesterName("");
    setCourseDraft((current) => ({ ...current, semesterId: semester.id }));
    setTaskDraft((current) => ({ ...current, semesterId: semester.id, courseId: "" }));
    setExamDraft((current) => ({ ...current, semesterId: semester.id, courseId: "" }));
    setShowSemesterForm(false);
    setExpandedSemesterIds((current) => (current.includes(semester.id) ? current : [...current, semester.id]));
    setAddingCourseSemesterId(semester.id);
    setMessage(`${semester.name} added.`);
  }

  function addCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!courseDraft.semesterId || !courseDraft.name.trim()) {
      setMessage("Pick a semester and give the course a name.");
      return;
    }

    const course: Course = {
      id: makeId(),
      semesterId: courseDraft.semesterId,
      name: courseDraft.name.trim(),
      color: courseDraft.color,
      targetGrade: Number(courseDraft.targetGrade) || 4,
      createdAt: new Date().toISOString(),
    };

    setState((current) => ({ ...current, courses: [...current.courses, course] }));
    setCourseDraft((current) => ({ ...current, name: "", targetGrade: "4.0" }));
    setTaskDraft((current) => ({ ...current, semesterId: course.semesterId, courseId: course.id }));
    setExamDraft((current) => ({ ...current, semesterId: course.semesterId, courseId: course.id }));
    setExpandedSemesterIds((current) => (current.includes(course.semesterId) ? current : [...current, course.semesterId]));
    setExpandedCourseIds((current) => (current.includes(course.id) ? current : [...current, course.id]));
    setAddingCourseSemesterId(null);
    setAddingTaskCourseId(course.id);
    setMessage(`${course.name} added to ${semesterLookup.get(course.semesterId)?.name ?? "semester"}.`);
  }

  function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!taskDraft.semesterId || !taskDraft.courseId || !taskDraft.title.trim()) {
      setMessage("A task needs a semester, course, and title.");
      return;
    }

    const task: Task = {
      id: makeId(),
      semesterId: taskDraft.semesterId,
      courseId: taskDraft.courseId,
      title: taskDraft.title.trim(),
      totalUnits: Math.max(1, Number(taskDraft.totalUnits) || 1),
      completedUnits: clamp(Number(taskDraft.completedUnits) || 0, 0, Number(taskDraft.totalUnits) || 1),
      dueDate: taskDraft.dueDate || null,
      priority: taskDraft.priority,
      notes: taskDraft.notes.trim(),
      createdAt: new Date().toISOString(),
    };

    setState((current) => ({ ...current, tasks: [task, ...current.tasks] }));
    setTaskDraft((current) => ({
      ...current,
      title: "",
      totalUnits: "10",
      completedUnits: "0",
      dueDate: "",
      notes: "",
    }));
    setExpandedCourseIds((current) => (current.includes(task.courseId) ? current : [...current, task.courseId]));
    setAddingTaskCourseId(null);
    setSelectedTaskId(task.id);
    setMessage(`${task.title} is now tracked.`);
  }

  function addExam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!examDraft.semesterId || !examDraft.courseId || !examDraft.title.trim() || !examDraft.examDate) {
      setMessage("An exam needs a semester, course, title, and date.");
      return;
    }

    const exam: Exam = {
      id: makeId(),
      semesterId: examDraft.semesterId,
      courseId: examDraft.courseId,
      title: examDraft.title.trim(),
      examDate: examDraft.examDate,
      weight: clamp(Number(examDraft.weight) || 0, 0, 100),
      preparedness: clamp(Number(examDraft.preparedness) || 0, 0, 100),
    };

    setState((current) => ({ ...current, exams: [exam, ...current.exams] }));
    setExamDraft((current) => ({ ...current, title: "", examDate: "", weight: "40", preparedness: "35" }));
    setAddingExamSemesterId(null);
    setMessage(`${exam.title} added to the runway.`);
  }

  function adjustTask(taskId: string, delta: number) {
    setState((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === taskId ? { ...task, completedUnits: clamp(task.completedUnits + delta, 0, task.totalUnits) } : task,
      ),
    }));
  }

  function removeTask(taskId: string) {
    setState((current) => ({
      ...current,
      tasks: current.tasks.filter((task) => task.id !== taskId),
      timer: current.timer.taskId === taskId ? { ...current.timer, taskId: null } : current.timer,
    }));
  }

  function removeCourse(courseId: string) {
    setState((current) => ({
      ...current,
      courses: current.courses.filter((course) => course.id !== courseId),
      tasks: current.tasks.filter((task) => task.courseId !== courseId),
      exams: current.exams.filter((exam) => exam.courseId !== courseId),
      timer:
        current.timer.courseId === courseId
          ? { ...current.timer, courseId: null, taskId: null }
          : current.timer,
    }));
    setExpandedCourseIds((current) => current.filter((item) => item !== courseId));
    setAddingTaskCourseId((current) => (current === courseId ? null : current));
  }

  function removeSemester(semesterId: string) {
    const courseIds = state.courses.filter((course) => course.semesterId === semesterId).map((course) => course.id);
    setState((current) => ({
      ...current,
      semesters: current.semesters.filter((semester) => semester.id !== semesterId),
      courses: current.courses.filter((course) => course.semesterId !== semesterId),
      tasks: current.tasks.filter((task) => task.semesterId !== semesterId),
      exams: current.exams.filter((exam) => exam.semesterId !== semesterId),
      timer:
        current.timer.semesterId === semesterId || courseIds.includes(current.timer.courseId ?? "")
          ? { ...current.timer, semesterId: null, courseId: null, taskId: null }
          : current.timer,
    }));
    setExpandedSemesterIds((current) => current.filter((item) => item !== semesterId));
    setExpandedCourseIds((current) => current.filter((item) => !courseIds.includes(item)));
    setAddingCourseSemesterId((current) => (current === semesterId ? null : current));
    setAddingExamSemesterId((current) => (current === semesterId ? null : current));
    setAddingTaskCourseId((current) => (current && courseIds.includes(current) ? null : current));
  }

  function removeExam(examId: string) {
    setState((current) => ({ ...current, exams: current.exams.filter((exam) => exam.id !== examId) }));
  }

  function toggleSemester(semesterId: string) {
    setExpandedSemesterIds((current) => toggleId(current, semesterId));
  }

  function toggleCourse(courseId: string) {
    setExpandedCourseIds((current) => toggleId(current, courseId));
  }

  function applyPreset(label: string, study: number, breakMinutes: number, mode: "focus" | "exam") {
    setState((current) => ({
      ...current,
      timer: {
        ...current.timer,
        mode,
        studyMinutes: study,
        breakMinutes,
        examMinutes: study,
        presetLabel: label,
        phase: current.timer.running ? current.timer.phase : "idle",
        remainingSeconds: current.timer.running ? current.timer.remainingSeconds : study * 60,
      },
    }));
  }

  function startTimer() {
    const isExam = state.timer.mode === "exam";
    const totalSeconds = (isExam ? state.timer.examMinutes : state.timer.studyMinutes) * 60;
    const startedAt = new Date().toISOString();

    setState((current) => ({
      ...current,
      activeTab: "timer",
      timer: {
        ...current.timer,
        running: true,
        phase: isExam ? "exam" : "study",
        startedAt,
        endsAt: new Date(Date.now() + totalSeconds * 1000).toISOString(),
        remainingSeconds: totalSeconds,
      },
    }));
  }

  function pauseTimer() {
    setState((current) => {
      const timer = current.timer;
      if (timer.phase === "idle") return current;

      if (timer.running && timer.endsAt) {
        const diff = Math.max(0, Math.ceil((new Date(timer.endsAt).getTime() - Date.now()) / 1000));
        return { ...current, timer: { ...timer, running: false, endsAt: null, remainingSeconds: diff } };
      }

      return {
        ...current,
        timer: {
          ...timer,
          running: true,
          endsAt: new Date(Date.now() + timer.remainingSeconds * 1000).toISOString(),
        },
      };
    });
  }

  function resetTimer() {
    setState((current) => ({
      ...current,
      timer: {
        ...defaultTimer,
        ...keepTimerContext(current.timer),
        remainingSeconds: current.timer.mode === "exam" ? current.timer.examMinutes * 60 : current.timer.studyMinutes * 60,
      },
    }));
  }

  function completeSessionManually() {
    if (state.timer.phase !== "study" && state.timer.phase !== "exam") {
      setMessage("There is no active study block to save.");
      return;
    }

    setState((current) => {
      const timer = current.timer;
      if (timer.phase !== "study" && timer.phase !== "exam") return current;
      const minutes = getTimerMinutes(timer);
      const session = buildSessionFromTimer(timer, new Date().toISOString(), minutes);
      return {
        ...current,
        sessions: [session, ...current.sessions].slice(0, 120),
        timer: { ...defaultTimer, ...keepTimerContext(timer) },
      };
    });
    setMessage("Session saved.");
  }

  async function handleCreateVault() {
    if (!isTauriApp()) {
      setMessage("Vault creation works inside the desktop build.");
      return;
    }

    try {
      const parent = await pickVaultParentDirectory();
      if (!parent) return;
      const vaultPath = await createVault(parent, state.settings.vaultName || "StudyTrackerVault");
      setState((current) => ({
        ...current,
        activeTab: "vault",
        settings: { ...current.settings, vaultPath },
      }));
      setMessage(`Vault created at ${vaultPath}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create the vault.");
    }
  }

  async function handleExportDailyNote() {
    if (!state.settings.vaultPath) {
      setMessage("Create the Obsidian vault first.");
      return;
    }

    try {
      const notePath = await exportDailyNote(state.settings.vaultPath, isoDate(), notePreview);
      setState((current) => ({
        ...current,
        exports: [
          {
            id: makeId(),
            exportedAt: new Date().toISOString(),
            noteDate: isoDate(),
            notePath,
          },
          ...current.exports,
        ].slice(0, 20),
      }));
      setMessage(`Daily note exported to ${notePath}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not export today’s note.");
    }
  }

  return (
    <div className="shell" style={{ "--accent": state.settings.accent } as CSSProperties}>
      <header className="topbar">
        <div>
          <p className="eyebrow">Desktop Study Command Center</p>
          <h1>Study Tracker</h1>
          <p className="subtitle">
            Semester-based planning, calmer tracking, clearer workload, and room to think.
          </p>
        </div>

        <div className="topbar-actions">
          <button className="ghost-button" onClick={() => downloadBackup(state)} type="button">
            Backup JSON
          </button>
          <div className="health-pill" title="Heuristic score based on task progress, overdue work, and exam pressure.">
            <small>Overall score</small>
            <strong>{overallHealth}/100</strong>
            <span>{healthLabel}</span>
          </div>
        </div>
      </header>

      <nav className="tab-row" aria-label="Primary navigation">
        {([
          ["dashboard", "Dashboard"],
          ["planner", "Planner"],
          ["timer", "Timer"],
          ["vault", "Vault + AI"],
        ] as [TabKey, string][]).map(([key, label]) => (
          <button
            key={key}
            className={`tab-button ${state.activeTab === key ? "active" : ""}`}
            onClick={() => setActiveTab(key)}
            type="button"
          >
            {label}
          </button>
        ))}
      </nav>

      {message ? <div className="message-banner">{message}</div> : null}

      {state.activeTab === "dashboard" ? (
        <section className="dashboard-stack">
          <div className="dashboard-pair top-row">
            <article className="today-card panel-card compact-card">
              <div className="today-shell">
                <div className="today-copy">
                  <p className="eyebrow">Today</p>
                  <h2>Finish the work that moves the semester forward.</h2>
                  <p>
                    The dashboard weighs overdue work, exam pressure, and real progress without forcing a long scroll.
                  </p>

                  <div className="hero-metrics today-metrics">
                    <div>
                      <span className="metric-label">Focused today</span>
                      <strong>{formatMinutes(getTodayMinutes(state))}</strong>
                    </div>
                    <div>
                      <span className="metric-label">Streak</span>
                      <strong>{getStreakDays(state)} days</strong>
                    </div>
                    <div>
                      <span className="metric-label">Momentum</span>
                      <strong>{getFocusMomentum(state)}</strong>
                    </div>
                  </div>
                </div>

                <div className="garden-card today-garden">
                  <p className="eyebrow">Knowledge Garden</p>
                  <div className="garden-stage compact-garden" aria-hidden="true">
                    {gardenPlants.map((plant) => (
                      <div
                        key={plant.id}
                        className="garden-plant"
                        style={{
                          left: `${plant.left}%`,
                          height: `${plant.height}px`,
                          transform: `translateX(-50%) scale(${plant.scale})`,
                          "--bloom": plant.bloom,
                        } as CSSProperties}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </article>

            <article className="panel-card focus-card compact-card">
              <div className="section-head compact-headline">
                <div>
                  <p className="eyebrow">Highest Impact</p>
                  <h3>Urgent tasks</h3>
                </div>
              </div>

              <div className="stack-list">
                {topTasks.length ? (
                  topTasks.map((task) => {
                    const course = courseLookup.get(task.courseId);
                    const semester = semesterLookup.get(task.semesterId);
                    return (
                      <button
                        key={task.id}
                        type="button"
                        className={`focus-task ${selectedTaskId === task.id ? "selected" : ""}`}
                        onClick={() => {
                          setSelectedTaskId(task.id);
                          setActiveTab("planner");
                        }}
                      >
                        <span className="focus-task-top">
                          <strong>{task.title}</strong>
                          <em>{course?.name ?? "No course"}</em>
                        </span>
                        <span className="focus-task-meta">
                          <span>{semester?.name ?? "No semester"}</span>
                          <span>{getRemainingUnits(task)} units left</span>
                          <span>{task.dueDate ? `due ${formatDate(task.dueDate)}` : "no due date"}</span>
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <p className="empty-copy">Add a semester, then courses, then tasks. The riskiest work will show up here.</p>
                )}
              </div>
            </article>
          </div>

          <article className="panel-card stats-card compact-card weekly-row">
            <div className="section-head compact-headline">
              <div>
                <p className="eyebrow">Weekly Focus</p>
                <h3>Last 7 days</h3>
              </div>
            </div>

            <div className="bar-chart compact-chart">
              {weeklyActivity.map((entry) => (
                <div key={entry.key} className="bar-column" title={`${entry.label}: ${entry.minutes} minutes`}>
                  <div className="bar-track compact-track">
                    <div className="bar-fill" style={{ height: `${(entry.minutes / maxWeeklyMinutes) * 100}%` }} />
                  </div>
                  <span>{entry.label}</span>
                  <strong>{entry.minutes}</strong>
                </div>
              ))}
            </div>
          </article>

          <div className="dashboard-pair bottom-row">
            <article className="panel-card course-card compact-card">
              <div className="section-head compact-headline">
                <div>
                  <p className="eyebrow">Course Radar</p>
                  <h3>How your courses are holding up</h3>
                </div>
              </div>

              <div className="course-health-list">
                {state.courses.length ? (
                  state.courses.map((course) => {
                    const health = getCourseHealth(state, course);
                    const semester = semesterLookup.get(course.semesterId);
                    return (
                      <div className="course-health-row" key={course.id}>
                        <div className="course-badge" style={{ background: course.color }} />
                        <div className="course-health-copy">
                          <div className="course-health-title">
                            <strong>{course.name}</strong>
                            <span>{health.label}</span>
                          </div>
                          <div className="health-track">
                            <div className="health-fill" style={{ width: `${health.score}%`, background: course.color }} />
                          </div>
                          <small>
                            {semester?.name ?? "No semester"} • {getCourseTasks(state, course.id).length} tasks • {getCourseMinutes(state, course.id)} minutes • {health.overdue} overdue
                          </small>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="empty-copy">Courses will appear here once you start filling a semester.</p>
                )}
              </div>
            </article>

            <article className="panel-card exam-card compact-card">
              <div className="section-head compact-headline">
                <div>
                  <p className="eyebrow">Exam Runway</p>
                  <h3>What is getting close</h3>
                </div>
              </div>

              <div className="stack-list compact">
                {upcomingExams.length ? (
                  upcomingExams.map((exam) => (
                    <div key={exam.id} className="exam-row">
                      <div>
                        <strong>{exam.title}</strong>
                        <p>{courseLookup.get(exam.courseId)?.name ?? "No course"}</p>
                      </div>
                      <div className="exam-side">
                        <span>{daysUntil(exam.examDate)} days</span>
                        <small>{exam.preparedness}% prepared</small>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="empty-copy">Add exams so the dashboard can see grade pressure early.</p>
                )}
              </div>
            </article>
          </div>
        </section>
      ) : null}

      {state.activeTab === "planner" ? (
        <section className="planner-stack">
          <article className="panel-card planner-board-panel">
            <div className="section-head planner-header">
              <div>
                <p className="eyebrow">Planner</p>
                <h2>Semesters, courses, and tasks</h2>
                <p className="section-note">Click a semester or course to expand it. Click it again to collapse.</p>
              </div>
              <button type="button" className="ghost-button" onClick={() => setShowSemesterForm((current) => !current)}>
                {showSemesterForm ? "Close" : "+ Add semester"}
              </button>
            </div>

            {showSemesterForm ? (
              <form className="inline-form-card" onSubmit={addSemester}>
                <label className="field">
                  <span>Semester name</span>
                  <input value={semesterName} onChange={(event) => setSemesterName(event.target.value)} placeholder="e.g. Semester 1 2026" />
                </label>
                <button type="submit">Create semester</button>
              </form>
            ) : null}

            <div className="semester-board roomy-top">
              {state.semesters.length ? (
                state.semesters.map((semester) => {
                  const courses = getSemesterCourses(state, semester.id);
                  const tasks = getSemesterTasks(state, semester.id);
                  const semesterHealth = getSemesterHealth(state, semester);
                  const semesterExpanded = expandedSemesterIds.includes(semester.id);
                  const semesterExams = state.exams.filter((exam) => exam.semesterId === semester.id);

                  return (
                    <section key={semester.id} className={`semester-card ${semesterExpanded ? "open" : ""}`}>
                      <div className="semester-header-row">
                        <button type="button" className="accordion-toggle semester-toggle" onClick={() => toggleSemester(semester.id)}>
                          <span className="accordion-title-group">
                            <strong>{semester.name}</strong>
                            <small>
                              {courses.length} courses • {tasks.length} tasks • {tasks.filter((task) => getRemainingUnits(task) > 0).length} active • {semesterHealth.label}
                            </small>
                          </span>
                        </button>

                        <div className="accordion-actions">
                          <div className="mini-health">
                            <strong>{semesterHealth.score}</strong>
                            <span>{semesterHealth.label}</span>
                          </div>
                          <button
                            type="button"
                            className="ghost-button small-button"
                            onClick={() => {
                              setExpandedSemesterIds((current) => (current.includes(semester.id) ? current : [...current, semester.id]));
                              setCourseDraft((current) => ({ ...current, semesterId: semester.id }));
                              setAddingCourseSemesterId((current) => (current === semester.id ? null : semester.id));
                            }}
                          >
                            + Course
                          </button>
                          <button
                            type="button"
                            className="ghost-button small-button"
                            onClick={() => {
                              const firstCourse = courses[0];
                              setExpandedSemesterIds((current) => (current.includes(semester.id) ? current : [...current, semester.id]));
                              setExamDraft((current) => ({ ...current, semesterId: semester.id, courseId: firstCourse?.id ?? "" }));
                              setAddingExamSemesterId((current) => (current === semester.id ? null : semester.id));
                            }}
                          >
                            + Exam
                          </button>
                          <button type="button" className="mini-danger" onClick={() => removeSemester(semester.id)}>
                            Remove
                          </button>
                        </div>
                      </div>

                      {semesterExpanded ? (
                        <div className="accordion-body">
                          {addingCourseSemesterId === semester.id ? (
                            <form className="inline-form-card nested-form" onSubmit={addCourse}>
                              <div className="inline-form-grid inline-form-grid-course">
                                <label className="field">
                                  <span>Course name</span>
                                  <input
                                    value={courseDraft.name}
                                    onChange={(event) => setCourseDraft((current) => ({ ...current, name: event.target.value, semesterId: semester.id }))}
                                    placeholder="e.g. Numerical Methods"
                                  />
                                </label>
                                <label className="field">
                                  <span>Target grade</span>
                                  <select value={courseDraft.targetGrade} onChange={(event) => setCourseDraft((current) => ({ ...current, semesterId: semester.id, targetGrade: event.target.value }))}>
                                    {swissGrades.map((grade) => (
                                      <option key={grade} value={grade.toString()}>
                                        {formatSwissGrade(grade)}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="field">
                                  <span>Color</span>
                                  <input type="color" value={courseDraft.color} onChange={(event) => setCourseDraft((current) => ({ ...current, color: event.target.value, semesterId: semester.id }))} />
                                </label>
                              </div>
                              <div className="inline-form-actions">
                                <button type="submit">Add course</button>
                                <button type="button" className="ghost-button" onClick={() => setAddingCourseSemesterId(null)}>
                                  Cancel
                                </button>
                              </div>
                            </form>
                          ) : null}

                          <div className="course-stack">
                            {courses.length ? (
                              courses.map((course) => {
                                const courseTasks = getCourseTasks(state, course.id);
                                const health = getCourseHealth(state, course);
                                const courseExpanded = expandedCourseIds.includes(course.id);

                                return (
                                  <article key={course.id} className={`course-sheet ${courseExpanded ? "open" : ""}`}>
                                    <div className="course-header-row">
                                      <button type="button" className="accordion-toggle course-toggle" onClick={() => toggleCourse(course.id)}>
                                        <div className="course-toggle-main">
                                          <div className="course-chip" style={{ background: course.color }} />
                                          <span className="accordion-title-group">
                                            <strong>{course.name}</strong>
                                            <small>
                                              Target {formatSwissGrade(course.targetGrade)} • {courseTasks.length} tasks • {health.label}
                                            </small>
                                          </span>
                                        </div>
                                      </button>

                                      <div className="accordion-actions">
                                        <button
                                          type="button"
                                          className="ghost-button small-button"
                                          onClick={() => {
                                            setExpandedSemesterIds((current) => (current.includes(semester.id) ? current : [...current, semester.id]));
                                            setExpandedCourseIds((current) => (current.includes(course.id) ? current : [...current, course.id]));
                                            setTaskDraft((current) => ({ ...current, semesterId: semester.id, courseId: course.id }));
                                            setAddingTaskCourseId((current) => (current === course.id ? null : course.id));
                                          }}
                                        >
                                          + Task
                                        </button>
                                        <button type="button" className="mini-danger" onClick={() => removeCourse(course.id)}>
                                          Remove
                                        </button>
                                      </div>
                                    </div>

                                    {courseExpanded ? (
                                      <div className="accordion-body nested-body">
                                        {addingTaskCourseId === course.id ? (
                                          <form className="inline-form-card nested-form" onSubmit={addTask}>
                                            <div className="inline-form-grid inline-form-grid-task">
                                              <label className="field task-title-field">
                                                <span>Task title</span>
                                                <input
                                                  value={taskDraft.title}
                                                  onChange={(event) => setTaskDraft((current) => ({ ...current, semesterId: semester.id, courseId: course.id, title: event.target.value }))}
                                                  placeholder="Sheet 4, reading pack, chapter summary..."
                                                />
                                              </label>
                                              <label className="field">
                                                <span>Total units</span>
                                                <input type="number" min="1" value={taskDraft.totalUnits} onChange={(event) => setTaskDraft((current) => ({ ...current, semesterId: semester.id, courseId: course.id, totalUnits: event.target.value }))} />
                                              </label>
                                              <label className="field">
                                                <span>Done</span>
                                                <input type="number" min="0" value={taskDraft.completedUnits} onChange={(event) => setTaskDraft((current) => ({ ...current, semesterId: semester.id, courseId: course.id, completedUnits: event.target.value }))} />
                                              </label>
                                              <label className="field">
                                                <span>Priority</span>
                                                <select value={taskDraft.priority} onChange={(event) => setTaskDraft((current) => ({ ...current, semesterId: semester.id, courseId: course.id, priority: event.target.value as Priority }))}>
                                                  <option value="high">High</option>
                                                  <option value="medium">Medium</option>
                                                  <option value="low">Low</option>
                                                </select>
                                              </label>
                                              <label className="field">
                                                <span>Due date (optional)</span>
                                                <input type="date" value={taskDraft.dueDate} onChange={(event) => setTaskDraft((current) => ({ ...current, semesterId: semester.id, courseId: course.id, dueDate: event.target.value }))} />
                                              </label>
                                              <label className="field task-notes-field">
                                                <span>Notes</span>
                                                <textarea value={taskDraft.notes} onChange={(event) => setTaskDraft((current) => ({ ...current, semesterId: semester.id, courseId: course.id, notes: event.target.value }))} placeholder="Definition of done, rubric hints, professor notes..." />
                                              </label>
                                            </div>
                                            <div className="inline-form-actions">
                                              <button type="submit">Add task</button>
                                              <button type="button" className="ghost-button" onClick={() => setAddingTaskCourseId(null)}>
                                                Cancel
                                              </button>
                                              {taskDraft.dueDate ? (
                                                <button type="button" className="ghost-button" onClick={() => setTaskDraft((current) => ({ ...current, dueDate: "" }))}>
                                                  Clear due date
                                                </button>
                                              ) : null}
                                            </div>
                                          </form>
                                        ) : null}

                                        <div className="task-table">
                                          {courseTasks.length ? (
                                            courseTasks.map((task) => {
                                              const calc = calculateDailyWork(task);
                                              const progress = getTaskProgress(task);
                                              return (
                                                <div key={task.id} className={`task-row-card ${selectedTaskId === task.id ? "selected" : ""}`}>
                                                  <div className="task-row-main">
                                                    <button type="button" className="link-button task-title-button" onClick={() => setSelectedTaskId(task.id)}>
                                                      <strong>{task.title}</strong>
                                                    </button>
                                                    <p>
                                                      {task.completedUnits}/{task.totalUnits} units • {task.dueDate ? `due ${formatDate(task.dueDate)}` : "no due date"}
                                                    </p>
                                                  </div>
                                                  <div className="task-row-progress">
                                                    <div className="progress-pill-row">
                                                      <span>{progress}%</span>
                                                      <span>{calc.unitsPerDay.toFixed(1)} / day</span>
                                                    </div>
                                                    <div className="health-track tight wide">
                                                      <div className="health-fill" style={{ width: `${progress}%`, background: course.color }} />
                                                    </div>
                                                  </div>
                                                  <div className="task-row-actions">
                                                    <button type="button" onClick={() => adjustTask(task.id, -1)}>
                                                      -
                                                    </button>
                                                    <button type="button" onClick={() => adjustTask(task.id, 1)}>
                                                      +
                                                    </button>
                                                    <button
                                                      type="button"
                                                      className="ghost-button small-button"
                                                      onClick={() => {
                                                        setSelectedTaskId(task.id);
                                                        setState((current) => ({
                                                          ...current,
                                                          activeTab: "timer",
                                                          timer: {
                                                            ...current.timer,
                                                            semesterId: task.semesterId,
                                                            courseId: task.courseId,
                                                            taskId: task.id,
                                                            goal: current.timer.goal || task.title,
                                                          },
                                                        }));
                                                      }}
                                                    >
                                                      Focus
                                                    </button>
                                                    <button type="button" className="mini-danger" onClick={() => removeTask(task.id)}>
                                                      Remove
                                                    </button>
                                                  </div>
                                                </div>
                                              );
                                            })
                                          ) : (
                                            <p className="empty-copy compact-empty">No tasks in this course yet.</p>
                                          )}
                                        </div>
                                      </div>
                                    ) : null}
                                  </article>
                                );
                              })
                            ) : (
                              <p className="empty-copy">No courses yet inside this semester.</p>
                            )}
                          </div>

                          <div className="semester-exam-panel">
                            <div className="section-head compact-head">
                              <div>
                                <p className="eyebrow">Assessment</p>
                                <h3>Exams in this semester</h3>
                              </div>
                            </div>

                            {addingExamSemesterId === semester.id ? (
                              <form className="inline-form-card nested-form" onSubmit={addExam}>
                                <div className="inline-form-grid inline-form-grid-exam">
                                  <label className="field">
                                    <span>Course</span>
                                    <select value={examDraft.courseId} onChange={(event) => setExamDraft((current) => ({ ...current, semesterId: semester.id, courseId: event.target.value }))}>
                                      <option value="">Select course</option>
                                      {courses.map((course) => (
                                        <option key={course.id} value={course.id}>
                                          {course.name}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="field">
                                    <span>Exam title</span>
                                    <input value={examDraft.title} onChange={(event) => setExamDraft((current) => ({ ...current, semesterId: semester.id, title: event.target.value }))} placeholder="Midterm, final, oral..." />
                                  </label>
                                  <label className="field">
                                    <span>Date</span>
                                    <input type="date" value={examDraft.examDate} onChange={(event) => setExamDraft((current) => ({ ...current, semesterId: semester.id, examDate: event.target.value }))} />
                                  </label>
                                  <label className="field">
                                    <span>Weight %</span>
                                    <input type="number" min="0" max="100" value={examDraft.weight} onChange={(event) => setExamDraft((current) => ({ ...current, semesterId: semester.id, weight: event.target.value }))} />
                                  </label>
                                  <label className="field">
                                    <span>Preparedness %</span>
                                    <input type="number" min="0" max="100" value={examDraft.preparedness} onChange={(event) => setExamDraft((current) => ({ ...current, semesterId: semester.id, preparedness: event.target.value }))} />
                                  </label>
                                </div>
                                <div className="inline-form-actions">
                                  <button type="submit">Add exam</button>
                                  <button type="button" className="ghost-button" onClick={() => setAddingExamSemesterId(null)}>
                                    Cancel
                                  </button>
                                </div>
                              </form>
                            ) : null}

                            <div className="stack-list compact">
                              {semesterExams.length ? (
                                semesterExams.map((exam) => (
                                  <div key={exam.id} className="exam-row detailed">
                                    <div>
                                      <strong>{exam.title}</strong>
                                      <p>{courseLookup.get(exam.courseId)?.name ?? "No course"}</p>
                                    </div>
                                    <div className="exam-side">
                                      <span>{daysUntil(exam.examDate)} days</span>
                                      <small>{exam.weight}% of grade</small>
                                    </div>
                                    <button type="button" className="mini-danger" onClick={() => removeExam(exam.id)}>
                                      Remove
                                    </button>
                                  </div>
                                ))
                              ) : (
                                <p className="empty-copy compact-empty">No exams added for this semester.</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </section>
                  );
                })
              ) : (
                <p className="empty-copy">Use the + button above to add your first semester.</p>
              )}
            </div>
          </article>

          <div className="planner-support-grid">
            <article className="panel-card calculator-card">
              <button type="button" className="accordion-toggle support-toggle" onClick={() => setCalculatorOpen((current) => !current)}>
                <span className="accordion-title-group">
                  <strong>Workload Calculator</strong>
                  <small>{calculatorOpen ? "Click to collapse" : "Click to expand"}</small>
                </span>
              </button>

              {calculatorOpen ? (
                <div className="accordion-body nested-body">
                  <label className="field">
                    <span>Selection</span>
                    <select value={selectedTaskId ?? ""} onChange={(event) => setSelectedTaskId(event.target.value)}>
                      <option value="">Select task</option>
                      <option value={TOTAL_WORKLOAD_ID}>Total workload</option>
                      {state.tasks.map((task) => (
                        <option key={task.id} value={task.id}>
                          {task.title}
                        </option>
                      ))}
                    </select>
                  </label>

                  {isTotalWorkloadSelected ? (
                    <div className="calculator-result roomy-box">
                      <strong>Total workload</strong>
                      <p>{totalWorkload.message}</p>
                      <div className="calculator-grid single-column-metrics">
                        <div>
                          <span>Remaining</span>
                          <strong>{totalWorkload.remainingUnits} units</strong>
                        </div>
                        <div>
                          <span>Days left</span>
                          <strong>{totalWorkload.daysLeft ?? "set due dates"}</strong>
                        </div>
                        <div>
                          <span>Target pace</span>
                          <strong>{totalWorkload.unitsPerDay.toFixed(1)} / day</strong>
                        </div>
                      </div>
                    </div>
                  ) : selectedTask && selectedTaskCalc ? (
                    <div className="calculator-result roomy-box">
                      <strong>{selectedTask.title}</strong>
                      <p>{selectedTaskCalc.message}</p>
                      <div className="calculator-grid single-column-metrics">
                        <div>
                          <span>Remaining</span>
                          <strong>{getRemainingUnits(selectedTask)} units</strong>
                        </div>
                        <div>
                          <span>Days left</span>
                          <strong>{selectedTaskCalc.daysLeft ?? "set due date"}</strong>
                        </div>
                        <div>
                          <span>Target pace</span>
                          <strong>{selectedTaskCalc.unitsPerDay.toFixed(1)} / day</strong>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="empty-copy">Choose a task and the app will estimate the daily pace needed to finish it.</p>
                  )}
                </div>
              ) : null}
            </article>

            <article className="panel-card completion-card">
              <div className="section-head compact-headline">
                <div>
                  <p className="eyebrow">Completion</p>
                  <h2>Percent done</h2>
                </div>
              </div>

              {isTotalWorkloadSelected || selectedTask ? (
                <div className="completion-ring-panel">
                  <div className="completion-ring-wrap">
                    <svg className="completion-ring" viewBox="0 0 140 140" role="img" aria-label={`${selectedTaskProgress}% complete`}>
                      <circle className="completion-ring-track" cx="70" cy="70" r={completionRadius} />
                      <circle
                        className="completion-ring-value"
                        cx="70"
                        cy="70"
                        r={completionRadius}
                        strokeDasharray={completionCircumference}
                        strokeDashoffset={completionOffset}
                      />
                    </svg>
                    <div className="completion-ring-label">
                      <strong>{selectedTaskProgress}%</strong>
                      <span>done</span>
                    </div>
                  </div>

                  <div className="completion-copy">
                    {isTotalWorkloadSelected ? (
                      <>
                        <strong>Total workload</strong>
                        <p>{totalWorkload.completedUnits}/{totalWorkload.totalUnits} units complete</p>
                        <small>
                          {totalWorkload.nearestDueDate ? `Nearest deadline ${formatDate(totalWorkload.nearestDueDate)}` : "No shared due date"}
                        </small>
                      </>
                    ) : selectedTask ? (
                      <>
                        <strong>{selectedTask.title}</strong>
                        <p>{selectedTask.completedUnits}/{selectedTask.totalUnits} units complete</p>
                        <small>
                          {courseLookup.get(selectedTask.courseId)?.name ?? "No course"} • {selectedTask.dueDate ? `Due ${formatDate(selectedTask.dueDate)}` : "No due date"}
                        </small>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="empty-copy">Pick a task in the calculator to see its completion ring.</p>
              )}
            </article>
          </div>

          <article className="panel-card semester-overview-card">
            <div className="section-head compact-headline">
              <div>
                <p className="eyebrow">Semester Overview</p>
                <h2>Exams by semester</h2>
              </div>
            </div>

            <div className="stack-list compact">
              {state.semesters.length ? (
                state.semesters.map((semester) => {
                  const courses = getSemesterCourses(state, semester.id);
                  const exams = state.exams.filter((exam) => exam.semesterId === semester.id);
                  const nextExam = [...exams].filter((exam) => daysUntil(exam.examDate) >= 0).sort((a, b) => daysUntil(a.examDate) - daysUntil(b.examDate))[0] ?? null;
                  return (
                    <div key={semester.id} className="overview-row detailed-overview">
                      <div>
                        <strong>{semester.name}</strong>
                        <p>{courses.length} courses • {exams.length} exams</p>
                        {nextExam ? <small>Next: {nextExam.title} in {daysUntil(nextExam.examDate)} days</small> : <small>No upcoming exams</small>}
                      </div>
                      <div className="overview-side exam-overview-side">
                        {exams.length ? exams.slice(0, 3).map((exam) => (
                          <span key={exam.id}>{exam.title}</span>
                        )) : <span>No exams yet</span>}
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="empty-copy">Your semesters will appear here once you add them.</p>
              )}
            </div>
          </article>
        </section>
      ) : null}

      {state.activeTab === "timer" ? (
        <section className="timer-grid">
          <article className="panel-card timer-main-card">
            <div className="section-head">
              <div>
                <p className="eyebrow">Focus Engine</p>
                <h2>Start a focus block</h2>
              </div>
              <span className="section-note">Keep the default view simple. Add course, task, and reflection only when you need it.</span>
            </div>

            <div className="timer-basics roomy-top">
              <label className="field timer-preset-select">
                <span>Timer setting</span>
                <select
                  value={hasKnownTimerPreset ? state.timer.presetLabel : "custom"}
                  onChange={(event) => {
                    const preset = focusPresets.find((item) => item.label === event.target.value);
                    if (preset) applyPreset(preset.label, preset.study, preset.breakMinutes, preset.mode);
                  }}
                  disabled={state.timer.running}
                >
                  {!hasKnownTimerPreset ? <option value="custom">Custom</option> : null}
                  {focusPresets.map((preset) => (
                    <option key={preset.label} value={preset.label}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="timer-setting-summary">
                <strong>{state.timer.mode === "exam" ? `${state.timer.examMinutes} min exam prep` : `${state.timer.studyMinutes} min focus`}</strong>
                <span>{state.timer.mode === "exam" ? "No break, logged as exam prep" : `${state.timer.breakMinutes} min break after completion`}</span>
              </div>
            </div>

            <div className="timer-face spacious-face">
              <p>{state.timer.phase === "break" ? "Break" : state.timer.mode === "exam" ? "Exam" : "Study"}</p>
              <strong>{formatClock(state.timer.remainingSeconds)}</strong>
              <span>{timerCourse?.name ?? "General focus"}</span>
            </div>

            <div className="control-row roomy-top">
              <button type="button" onClick={startTimer} disabled={state.timer.running}>
                Start
              </button>
              <button type="button" onClick={pauseTimer} disabled={state.timer.phase === "idle"}>
                {state.timer.running ? "Pause" : "Resume"}
              </button>
              <button type="button" onClick={completeSessionManually} disabled={state.timer.phase === "idle" || state.timer.phase === "break"}>
                Save session now
              </button>
              <button type="button" className="ghost-button" onClick={resetTimer}>
                Reset
              </button>
            </div>

            <button type="button" className="timer-advanced-toggle ghost-button" onClick={() => setTimerAdvancedOpen((current) => !current)}>
              {timerAdvancedOpen ? "Hide advanced settings" : "Advanced settings"}
            </button>

            {timerAdvancedOpen ? (
              <div className="timer-advanced-panel roomy-top">
                <div className="section-head compact-headline">
                  <div>
                    <p className="eyebrow">Advanced</p>
                    <h3>Session details and logging</h3>
                  </div>
                  <span className="section-note">Link a course or task, tune minutes, and write notes for the session log.</span>
                </div>

                <div className="timer-input-grid">
                  <label className="field">
                    <span>Semester</span>
                    <select
                      value={state.timer.semesterId ?? ""}
                      onChange={(event) => {
                        const semesterId = event.target.value || null;
                        const firstCourse = state.courses.find((course) => course.semesterId === semesterId);
                        setState((current) => ({
                          ...current,
                          timer: {
                            ...current.timer,
                            semesterId,
                            courseId: firstCourse?.id ?? null,
                            taskId: null,
                          },
                        }));
                      }}
                    >
                      <option value="">Any semester</option>
                      {state.semesters.map((semester) => (
                        <option key={semester.id} value={semester.id}>
                          {semester.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Course</span>
                    <select
                      value={state.timer.courseId ?? ""}
                      onChange={(event) => {
                        const courseId = event.target.value || null;
                        const course = courseId ? courseLookup.get(courseId) : null;
                        setState((current) => ({
                          ...current,
                          timer: {
                            ...current.timer,
                            semesterId: course?.semesterId ?? current.timer.semesterId,
                            courseId,
                            taskId: null,
                          },
                        }));
                      }}
                    >
                      <option value="">No linked course</option>
                      {timerCourses.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Task</span>
                    <select
                      value={state.timer.taskId ?? ""}
                      onChange={(event) => {
                        const taskId = event.target.value || null;
                        const task = taskId ? taskLookup.get(taskId) : null;
                        setState((current) => ({
                          ...current,
                          timer: {
                            ...current.timer,
                            semesterId: task?.semesterId ?? current.timer.semesterId,
                            courseId: task?.courseId ?? current.timer.courseId,
                            taskId,
                            goal: task ? task.title : current.timer.goal,
                          },
                        }));
                      }}
                    >
                      <option value="">No linked task</option>
                      {timerTasks.map((task) => (
                        <option key={task.id} value={task.id}>
                          {task.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Focus minutes</span>
                    <input
                      type="number"
                      min="1"
                      value={state.timer.mode === "exam" ? state.timer.examMinutes : state.timer.studyMinutes}
                      onChange={(event) => {
                        const next = Number(event.target.value) || 1;
                        setState((current) => ({
                          ...current,
                          timer: {
                            ...current.timer,
                            studyMinutes: next,
                            examMinutes: next,
                            remainingSeconds: current.timer.running ? current.timer.remainingSeconds : next * 60,
                            presetLabel: "Custom",
                          },
                        }));
                      }}
                    />
                  </label>
                  <label className="field">
                    <span>Break minutes</span>
                    <input
                      type="number"
                      min="0"
                      disabled={state.timer.mode === "exam"}
                      value={state.timer.breakMinutes}
                      onChange={(event) =>
                        setState((current) => ({
                          ...current,
                          timer: { ...current.timer, breakMinutes: Number(event.target.value) || 0, presetLabel: "Custom" },
                        }))
                      }
                    />
                  </label>
                  <label className="field wide">
                    <span>Goal for this block</span>
                    <input
                      value={state.timer.goal}
                      onChange={(event) => setState((current) => ({ ...current, timer: { ...current.timer, goal: event.target.value } }))}
                      placeholder="What should exist when the timer ends?"
                    />
                  </label>
                  <label className="field wide">
                    <span>What did you learn?</span>
                    <textarea
                      value={state.timer.learned}
                      onChange={(event) => setState((current) => ({ ...current, timer: { ...current.timer, learned: event.target.value } }))}
                      placeholder="Short reflection that can go straight into Obsidian later."
                    />
                  </label>
                  <label className="field">
                    <span>What is still weak?</span>
                    <input
                      value={state.timer.blocker}
                      onChange={(event) => setState((current) => ({ ...current, timer: { ...current.timer, blocker: event.target.value } }))}
                      placeholder="Weak topic or blocker"
                    />
                  </label>
                  <label className="field">
                    <span>Next step</span>
                    <input
                      value={state.timer.nextStep}
                      onChange={(event) => setState((current) => ({ ...current, timer: { ...current.timer, nextStep: event.target.value } }))}
                      placeholder="What comes next?"
                    />
                  </label>
                  <label className="field">
                    <span>Confidence</span>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      step="1"
                      value={state.timer.confidence}
                      onChange={(event) => setState((current) => ({ ...current, timer: { ...current.timer, confidence: Number(event.target.value) } }))}
                    />
                    <span className="range-value">{state.timer.confidence}/5</span>
                  </label>
                </div>
              </div>
            ) : null}
          </article>

          <article className="panel-card session-log-card">
            <div className="section-head">
              <div>
                <p className="eyebrow">Recent Sessions</p>
                <h2>What you actually learned</h2>
              </div>
            </div>

            <div className="stack-list compact">
              {state.sessions.length ? (
                state.sessions.slice(0, 10).map((session) => (
                  <div key={session.id} className="session-row">
                    <div>
                      <strong>{session.goal || session.presetLabel}</strong>
                      <p>
                        {semesterLookup.get(session.semesterId ?? "")?.name ?? "No semester"} • {courseLookup.get(session.courseId ?? "")?.name ?? "General"} • {formatMinutes(session.minutes)}
                      </p>
                      {session.learned ? <small>Learned: {session.learned}</small> : null}
                    </div>
                    <div className="session-side">
                      <span>{session.confidence}/5</span>
                      <small>{new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(session.endedAt))}</small>
                    </div>
                  </div>
                ))
              ) : (
                <p className="empty-copy">Completed study blocks land here and feed the daily note export.</p>
              )}
            </div>
          </article>
        </section>
      ) : null}

      {state.activeTab === "vault" ? (
        <section className="vault-grid">
          <article className="panel-card vault-card">
            <div className="section-head">
              <div>
                <p className="eyebrow">Obsidian</p>
                <h2>Create your vault and export notes</h2>
              </div>
            </div>

            <label className="field">
              <span>Vault name</span>
              <input
                value={state.settings.vaultName}
                onChange={(event) => setState((current) => ({ ...current, settings: { ...current.settings, vaultName: event.target.value } }))}
                placeholder="StudyTrackerVault"
              />
            </label>

            <label className="field">
              <span>Current vault path</span>
              <input value={state.settings.vaultPath ?? "Not created yet"} readOnly />
            </label>

            <div className="control-row left roomy-top">
              <button type="button" onClick={handleCreateVault}>
                Create new vault
              </button>
              <button type="button" className="ghost-button" onClick={handleExportDailyNote}>
                Export today’s note
              </button>
            </div>

            <p className="section-note">The app creates Daily, Weekly, Subjects, Exams, Summaries, Templates, and Inbox automatically.</p>
          </article>

          <article className="panel-card note-card">
            <div className="section-head">
              <div>
                <p className="eyebrow">Preview</p>
                <h2>Today’s markdown note</h2>
              </div>
            </div>

            <textarea className="note-preview" value={notePreview} readOnly />

            <div className="stack-list compact export-list">
              {state.exports.length ? (
                state.exports.map((item) => (
                  <div key={item.id} className="session-row">
                    <div>
                      <strong>{item.noteDate}</strong>
                      <p>{item.notePath}</p>
                    </div>
                    <small>{new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(item.exportedAt))}</small>
                  </div>
                ))
              ) : (
                <p className="empty-copy">Exports will appear here once you write the first daily note.</p>
              )}
            </div>
          </article>

          <article className="panel-card ai-card">
            <div className="section-head">
              <div>
                <p className="eyebrow">AI Foundation</p>
                <h2>Anthropic settings for the next step</h2>
              </div>
            </div>

            <label className="field">
              <span>Anthropic API key</span>
              <input
                type="password"
                value={state.settings.anthropicApiKey}
                onChange={(event) => setState((current) => ({ ...current, settings: { ...current.settings, anthropicApiKey: event.target.value } }))}
                placeholder="Optional for now"
              />
            </label>

            <label className="field">
              <span>Preferred model</span>
              <input
                value={state.settings.aiModel}
                onChange={(event) => setState((current) => ({ ...current, settings: { ...current.settings, aiModel: event.target.value } }))}
              />
            </label>

            <div className="ai-note">
              <strong>Current build status</strong>
              <p>
                The local planner and vault flow are cleaned up first. The next implementation step is a real Anthropic summary action from this screen.
              </p>
            </div>
          </article>
        </section>
      ) : null}
    </div>
  );
}

export default App;
