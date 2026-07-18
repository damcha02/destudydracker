import type { AppState, CalendarEntry, Course, Exam, Semester, SocialAvatar, SocialAvatarStyle, SocialState, StudySession, TabKey, Task, TimerState } from "../types";

const STORAGE_KEY = "study-tracker-desktop-v2";
const avatarStyles: SocialAvatarStyle[] = ["classic", "serif", "cursive", "graffiti", "pixel", "mono"];
const avatarIcons = ["✦", "★", "◆", "☘", "☾", "☀", "♜", "♞", "⚡", "☕", "📚", "🧠", "🔥", "🌊", "🌿", "🪐"];

const defaultVisibleTabs: Record<TabKey, boolean> = {
  dashboard: true,
  planner: true,
  timer: true,
  vault: true,
  friends: true,
  break: true,
};

export function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function randomToken(length: number) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  if (globalThis.crypto?.getRandomValues) {
    const values = globalThis.crypto.getRandomValues(new Uint8Array(length));
    return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
  }
  return Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

function makeFriendCode() {
  return `${randomToken(4)}-${randomToken(4)}`;
}

function firstAvatarLetter(name: string) {
  return (name.trim()[0] || "S").toUpperCase();
}

function normalizeAvatar(avatar: unknown, displayName: string): SocialAvatar {
  if (!avatar || typeof avatar !== "object") return { kind: "letter", letter: firstAvatarLetter(displayName), style: "classic" };
  const record = avatar as Partial<SocialAvatar> & Record<string, unknown>;
  if (record.kind === "icon" && typeof record.icon === "string" && avatarIcons.includes(record.icon)) {
    return { kind: "icon", icon: record.icon };
  }
  if (record.kind === "letter") {
    const letter = typeof record.letter === "string" && /^[A-Z]$/i.test(record.letter) ? record.letter.toUpperCase() : firstAvatarLetter(displayName);
    const style = typeof record.style === "string" && avatarStyles.includes(record.style as SocialAvatarStyle) ? record.style as SocialAvatarStyle : "classic";
    return { kind: "letter", letter, style };
  }
  return { kind: "letter", letter: firstAvatarLetter(displayName), style: "classic" };
}

function makeDefaultSocialState(): SocialState {
  const friendCode = makeFriendCode();
  const displaySuffix = friendCode.slice(-4).replace(/[^A-Z0-9]/g, "");
  const displayName = `Student ${displaySuffix}`;
  return {
    userId: makeId(),
    deviceSecret: makeId(),
    friendCode,
    displayName,
    avatar: { kind: "letter", letter: firstAvatarLetter(displayName), style: "classic" },
    lastSyncedAt: null,
    lastSyncError: null,
    nextAutoSyncAt: null,
    isPrivate: false,
    autoPostSessions: false,
    friends: [],
    incomingFriendRequests: [],
    outgoingFriendRequests: [],
    cachedFeeds: {
      global: [],
      friends: [],
    },
    pendingFeedPosts: [],
    cachedLeaderboards: {
      global: { daily: [], weekly: [], overall: [] },
      friends: { daily: [], weekly: [], overall: [] },
    },
  };
}

export function todayIso(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
  calendarEntries: [],
  sessions: [],
  exports: [],
  settings: {
    accent: "#8fb4ff",
    userName: "",
    dailyGoalMinutes: 120,
    themeFamily: "normal",
    backgroundEffect: true,
    hideFeedImages: false,
    vaultPath: null,
    vaultName: "StudyTrackerVault",
    visibleTabs: defaultVisibleTabs,
  },
  social: makeDefaultSocialState(),
  timer: defaultTimer,
  activeTab: "dashboard",
  unlockedGames: [],
  unlockedGamesDate: "",
  playedBreaks: [],
  playedBreaksDate: "",
  totalUnlocks: 0,
  unlockStreak: 0,
  lastUnlockDate: "",
  speedrunnerToday: false,
  playedGamesAllTime: [],
  badgeCounts: {},
  badgeCountDates: {},
  waterGlasses: 0,
  waterDate: "",
  petRockPats: 0,
  durakPuzzle: {
    seed: null,
    hint: "",
    playerHand: [],
    cpuHand: [],
    trumpSuit: "hearts",
    table: [],
    discardPile: [],
    phase: "player_attack",
    message: "",
    failures: 0,
    completed: false,
  },
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

function recoverExpiredTimer(timer: TimerState, sessions: StudySession[]) {
  if (!timer.running || !timer.endsAt || (timer.phase !== "study" && timer.phase !== "exam")) {
    return { timer: rehydrateTimer(timer), sessions };
  }

  const endsAtTime = new Date(timer.endsAt).getTime();
  if (!Number.isFinite(endsAtTime) || endsAtTime > Date.now()) {
    return { timer: rehydrateTimer(timer), sessions };
  }

  const endedAt = new Date(endsAtTime).toISOString();
  const startedAt = timer.startedAt ?? endedAt;
  const minutes = Math.max(1, timer.phase === "exam" ? Math.round(timer.examMinutes) : Math.round(timer.studyMinutes));
  const recoveredId = `recovered-${timer.phase}-${startedAt}-${endedAt}`;
  if (sessions.some((session) => session.id === recoveredId)) {
    return { timer: rehydrateTimer(timer), sessions };
  }

  const recoveredSession: StudySession = {
    id: recoveredId,
    semesterId: timer.semesterId,
    courseId: timer.courseId,
    taskId: timer.taskId,
    kind: timer.phase === "exam" ? "exam" : "study",
    goal: timer.goal.trim(),
    learned: timer.learned.trim(),
    blocker: timer.blocker.trim(),
    nextStep: timer.nextStep.trim(),
    confidence: timer.confidence,
    startedAt,
    endedAt,
    minutes,
    presetLabel: timer.presetLabel,
  };

  return {
    sessions: [recoveredSession, ...sessions],
    timer: {
      ...defaultTimer,
      ...keepTimerContext(timer),
      running: false,
      phase: "idle" as const,
      startedAt: null,
      endsAt: null,
      remainingSeconds: timer.mode === "exam" ? timer.examMinutes * 60 : timer.mode === "endless" ? 0 : timer.studyMinutes * 60,
    },
  };
}

function normalizeSocialState(social: unknown): SocialState {
  const fallback = makeDefaultSocialState();
  if (!social || typeof social !== "object") return fallback;

  const record = social as Partial<SocialState>;
  const displayName = typeof record.displayName === "string" && record.displayName.trim() ? record.displayName : fallback.displayName;
  return {
    ...fallback,
    ...record,
    userId: typeof record.userId === "string" && record.userId ? record.userId : fallback.userId,
    deviceSecret: typeof record.deviceSecret === "string" && record.deviceSecret ? record.deviceSecret : fallback.deviceSecret,
    friendCode: typeof record.friendCode === "string" && record.friendCode ? record.friendCode : fallback.friendCode,
    displayName,
    avatar: normalizeAvatar(record.avatar, displayName),
    lastSyncedAt: typeof record.lastSyncedAt === "string" ? record.lastSyncedAt : null,
    lastSyncError: typeof record.lastSyncError === "string" ? record.lastSyncError : null,
    nextAutoSyncAt: typeof record.nextAutoSyncAt === "string" ? record.nextAutoSyncAt : null,
    isPrivate: Boolean(record.isPrivate),
    autoPostSessions: Boolean(record.autoPostSessions),
    friends: Array.isArray(record.friends) ? record.friends : [],
    incomingFriendRequests: Array.isArray(record.incomingFriendRequests) ? record.incomingFriendRequests : [],
    outgoingFriendRequests: Array.isArray(record.outgoingFriendRequests) ? record.outgoingFriendRequests : [],
    cachedFeeds: {
      global: Array.isArray(record.cachedFeeds?.global) ? record.cachedFeeds.global : [],
      friends: Array.isArray(record.cachedFeeds?.friends) ? record.cachedFeeds.friends : [],
    },
    pendingFeedPosts: Array.isArray(record.pendingFeedPosts) ? record.pendingFeedPosts : [],
    cachedLeaderboards: {
      global: {
        daily: record.cachedLeaderboards?.global?.daily ?? [],
        weekly: record.cachedLeaderboards?.global?.weekly ?? [],
        overall: record.cachedLeaderboards?.global?.overall ?? [],
      },
      friends: {
        daily: record.cachedLeaderboards?.friends?.daily ?? [],
        weekly: record.cachedLeaderboards?.friends?.weekly ?? [],
        overall: record.cachedLeaderboards?.friends?.overall ?? [],
      },
    },
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

function normalizeCalendarEntries(entries: unknown): CalendarEntry[] {
  if (!Array.isArray(entries)) return [];

  return entries.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Partial<CalendarEntry> & Record<string, unknown>;
    if (typeof record.id !== "string" || typeof record.taskId !== "string" || typeof record.date !== "string") return [];
    const unitAmount = record.unitAmount === 0.5 || record.unitAmount === 0.25 ? record.unitAmount : 1;

    return [{
      id: record.id,
      taskId: record.taskId,
      date: record.date,
      unitAmount,
      completed: Boolean(record.completed),
      completedAt: typeof record.completedAt === "string" ? record.completedAt : null,
      createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
      startTime: typeof record.startTime === "string" ? record.startTime : undefined,
      endTime: typeof record.endTime === "string" ? record.endTime : undefined,
      adHocTitle: typeof record.adHocTitle === "string" ? record.adHocTitle : undefined,
      adHocSemesterId: typeof record.adHocSemesterId === "string" ? record.adHocSemesterId : undefined,
      adHocCourseId: typeof record.adHocCourseId === "string" ? record.adHocCourseId : undefined,
    }];
  });
}

function normalizeVisibleTabs(visibleTabs: unknown): Record<TabKey, boolean> {
  if (!visibleTabs || typeof visibleTabs !== "object") return defaultVisibleTabs;

  const record = visibleTabs as Partial<Record<TabKey, unknown>>;
  const normalized = {
    ...defaultVisibleTabs,
    dashboard: record.dashboard !== false,
    planner: record.planner !== false,
    timer: record.timer !== false,
    vault: record.vault !== false,
    friends: record.friends !== false,
    break: record.break !== false,
  };

  return Object.values(normalized).some(Boolean) ? normalized : defaultVisibleTabs;
}

function normalizeActiveTab(activeTab: unknown, visibleTabs: Record<TabKey, boolean>): TabKey {
  if (typeof activeTab === "string" && activeTab in defaultVisibleTabs) {
    const tab = activeTab as TabKey;
    if (visibleTabs[tab] !== false) return tab;
  }

  return (Object.keys(defaultVisibleTabs) as TabKey[]).find((tab) => visibleTabs[tab] !== false) ?? "dashboard";
}

export function loadAppState(): AppState {
  const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem("study-tracker-desktop-v1");
  if (!raw) return defaultState;

  try {
    const parsed = JSON.parse(raw) as Partial<AppState> & Record<string, unknown>;
    const migrated = migrateSemesters(parsed);
    const sessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];
    const parsedTimer = parsed.timer && typeof parsed.timer === "object" ? parsed.timer : {};
    const timerRecovery = recoverExpiredTimer({ ...defaultTimer, ...parsedTimer }, sessions);
    const visibleTabs = normalizeVisibleTabs(parsed.settings?.visibleTabs);

    return {
      ...defaultState,
      ...parsed,
      activeTab: normalizeActiveTab(parsed.activeTab, visibleTabs),
      semesters: migrated.semesters,
      courses: Array.isArray(migrated.courses)
        ? migrated.courses.map((course) => ({
            ...course,
            targetGrade: typeof course.targetGrade === "number" && course.targetGrade >= 4 && course.targetGrade <= 6 ? course.targetGrade : 4,
          }))
        : [],
      tasks: Array.isArray(migrated.tasks) ? migrated.tasks : [],
      exams: Array.isArray(migrated.exams) ? migrated.exams : [],
      calendarEntries: normalizeCalendarEntries(parsed.calendarEntries),
      settings: {
        ...defaultState.settings,
        ...parsed.settings,
        visibleTabs,
        hideFeedImages: Boolean(parsed.settings?.hideFeedImages),
      },
      social: normalizeSocialState(parsed.social),
      timer: timerRecovery.timer,
      sessions: timerRecovery.sessions,
      exports: Array.isArray(parsed.exports) ? parsed.exports : [],
      badgeCounts: parsed.badgeCounts && typeof parsed.badgeCounts === "object" ? parsed.badgeCounts as Record<string, number> : {},
      badgeCountDates: parsed.badgeCountDates && typeof parsed.badgeCountDates === "object" ? parsed.badgeCountDates as Record<string, string> : {},
    };
  } catch {
    return defaultState;
  }
}

export function saveAppState(state: AppState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Study Tracker state could not be saved.", error);
  }
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
