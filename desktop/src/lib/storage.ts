import type { AppState, Course, Exam, Semester, Task, TimerState } from "../types";

const STORAGE_KEY = "study-tracker-desktop-v2";

export function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function todayIso(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export const defaultTimer: TimerState = {
  phase: "idle",
  mode: "focus",
  remainingSeconds: 25 * 60,
  running: false,
  studyMinutes: 25,
  breakMinutes: 5,
  examMinutes: 90,
  startedAt: null,
  endsAt: null,
  semesterId: null,
  courseId: null,
  taskId: null,
  goal: "",
  learned: "",
  blocker: "",
  nextStep: "",
  confidence: 3,
  presetLabel: "Pomodoro 25/5",
};

export const defaultState: AppState = {
  semesters: [],
  courses: [],
  tasks: [],
  exams: [],
  sessions: [],
  exports: [],
  settings: {
    accent: "#8fb4ff",
    vaultPath: null,
    vaultName: "StudyTrackerVault",
    anthropicApiKey: "",
    aiModel: "claude-3-5-haiku-latest",
  },
  timer: defaultTimer,
  activeTab: "dashboard",
};

function rehydrateTimer(timer: Partial<TimerState> | undefined): TimerState {
  const merged = { ...defaultTimer, ...timer };

  if (!merged.running || !merged.endsAt) {
    return {
      ...merged,
      running: false,
      endsAt: null,
    };
  }

  const diff = Math.ceil((new Date(merged.endsAt).getTime() - Date.now()) / 1000);
  if (diff <= 0) {
    return {
      ...merged,
      running: false,
      endsAt: null,
      remainingSeconds: 0,
    };
  }

  return {
    ...merged,
    remainingSeconds: diff,
  };
}

function migrateSemesters(parsed: Record<string, unknown>) {
  const semesters = Array.isArray(parsed.semesters) ? (parsed.semesters as Semester[]) : [];
  const rawCourses = Array.isArray(parsed.courses) ? (parsed.courses as Array<Course & { semesterId?: string }>) : [];
  const rawTasks = Array.isArray(parsed.tasks) ? (parsed.tasks as Array<Task & { semesterId?: string }>) : [];
  const rawExams = Array.isArray(parsed.exams) ? (parsed.exams as Array<Exam & { semesterId?: string }>) : [];

  if (semesters.length) {
    return {
      semesters,
      courses: rawCourses,
      tasks: rawTasks,
      exams: rawExams,
    };
  }

  if (!rawCourses.length) {
    return {
      semesters: [],
      courses: rawCourses,
      tasks: rawTasks,
      exams: rawExams,
    };
  }

  const importedSemesterId = makeId();
  const importedSemester: Semester = {
    id: importedSemesterId,
    name: "Imported Semester",
    createdAt: new Date().toISOString(),
  };

  const courseSemesterLookup = new Map<string, string>();
  const courses = rawCourses.map((course) => {
    const semesterId = course.semesterId ?? importedSemesterId;
    courseSemesterLookup.set(course.id, semesterId);
    return {
      ...course,
      semesterId,
      targetGrade: typeof course.targetGrade === "number" && course.targetGrade >= 4 && course.targetGrade <= 6 ? course.targetGrade : 4,
    };
  });

  const tasks = rawTasks.map((task) => ({
    ...task,
    semesterId: task.semesterId ?? courseSemesterLookup.get(task.courseId) ?? importedSemesterId,
  }));

  const exams = rawExams.map((exam) => ({
    ...exam,
    semesterId: exam.semesterId ?? courseSemesterLookup.get(exam.courseId) ?? importedSemesterId,
  }));

  return {
    semesters: [importedSemester],
    courses,
    tasks,
    exams,
  };
}

export function loadAppState(): AppState {
  const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem("study-tracker-desktop-v1");
  if (!raw) return defaultState;

  try {
    const parsed = JSON.parse(raw) as Partial<AppState> & Record<string, unknown>;
    const migrated = migrateSemesters(parsed);

    return {
      ...defaultState,
      ...parsed,
      semesters: migrated.semesters,
      courses: Array.isArray(migrated.courses)
        ? migrated.courses.map((course) => ({
            ...course,
            targetGrade: typeof course.targetGrade === "number" && course.targetGrade >= 4 && course.targetGrade <= 6 ? course.targetGrade : 4,
          }))
        : [],
      tasks: Array.isArray(migrated.tasks) ? migrated.tasks : [],
      exams: Array.isArray(migrated.exams) ? migrated.exams : [],
      settings: {
        ...defaultState.settings,
        ...parsed.settings,
      },
      timer: rehydrateTimer(parsed.timer),
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      exports: Array.isArray(parsed.exports) ? parsed.exports : [],
    };
  } catch {
    return defaultState;
  }
}

export function saveAppState(state: AppState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function downloadBackup(state: AppState) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `study-tracker-backup-${todayIso()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
