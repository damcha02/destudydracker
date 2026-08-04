import type { AppState, CalendarEntry, Course, Exam, FlaggleGuess, FlagglePuzzleState, GeodlePuzzleState, Semester, SocialAvatar, SocialAvatarStyle, SocialFeedPost, SocialLeaderboardEntry, SocialSquadRole, SocialSquadScoreEntry, SocialState, StudySession, TabKey, Task, TimerState, TravlePuzzleState, WordlePuzzleState } from "../types";
import { getFlaggleAnswerForDate, getFlagglePuzzleId, makeFlaggleSeedSalt } from "./flaggle";
import { getGeodleAnswerForDate, getGeodlePuzzleId, makeGeodleSeedSalt } from "./geodle";
import { getTravlePuzzleForDate, getTravlePuzzleId, makeTravleSeedSalt } from "./travle";
import { getWordleAnswerForDate, getWordlePuzzleId, makeWordleSeedSalt } from "./wordle";

const STORAGE_KEY = "study-tracker-desktop-v2";
const avatarStyles: SocialAvatarStyle[] = ["classic", "serif", "cursive", "graffiti", "pixel", "mono"];
const avatarIcons = ["✦", "★", "◆", "☘", "☾", "☀", "♜", "♞", "⚡", "☕", "📚", "🧠", "🔥", "🌊", "🌿", "🪐", "🚀", "🎯", "🏆", "🛡", "🦉", "🐢", "🐺", "🐱", "🍄", "🌙", "🌸", "🍀", "💎", "🎲", "🎧", "📝", "🔮", "🧩", "🕹", "📖", "🧪", "🛰", "🌌", "🦊"];

const defaultVisibleTabs: Record<TabKey, boolean> = {
  dashboard: true,
  planner: true,
  timer: true,
  vault: true,
  friends: true,
  break: true,
};

function makeDefaultWordlePuzzle(): WordlePuzzleState {
  const activeDate = todayIso();
  const seedSalt = makeWordleSeedSalt();
  return {
    seedSalt,
    activeDate,
    puzzleId: getWordlePuzzleId(activeDate, seedSalt),
    answer: getWordleAnswerForDate(activeDate, seedSalt),
    guesses: [],
    completed: false,
    won: false,
    hardMode: false,
  };
}

function makeDefaultGeodlePuzzle(): GeodlePuzzleState {
  const activeDate = todayIso();
  const seedSalt = makeGeodleSeedSalt();
  return {
    seedSalt,
    activeDate,
    puzzleId: getGeodlePuzzleId(activeDate, seedSalt),
    answer: getGeodleAnswerForDate(activeDate, seedSalt),
    guesses: [],
    completed: false,
    won: false,
  };
}

function makeDefaultFlagglePuzzle(): FlagglePuzzleState {
  const activeDate = todayIso();
  const seedSalt = makeFlaggleSeedSalt();
  return {
    seedSalt,
    activeDate,
    puzzleId: getFlagglePuzzleId(activeDate, seedSalt),
    answer: getFlaggleAnswerForDate(activeDate, seedSalt),
    guesses: [],
    completed: false,
    won: false,
  };
}

function makeDefaultTravlePuzzle(): TravlePuzzleState {
  const activeDate = todayIso();
  const seedSalt = makeTravleSeedSalt();
  const puzzle = getTravlePuzzleForDate(activeDate, seedSalt);
  return {
    seedSalt,
    activeDate,
    puzzleId: getTravlePuzzleId(activeDate, seedSalt),
    start: puzzle.start,
    target: puzzle.target,
    guesses: [],
    completed: false,
    won: false,
  };
}

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
  if (record.kind === "photo") {
    const url = typeof record.url === "string" && record.url.startsWith("data:image/") ? record.url : "";
    if (url) {
      return {
        kind: "photo",
        name: typeof record.name === "string" ? record.name.slice(0, 180) : "photo",
        url,
        mimeType: typeof record.mimeType === "string" && record.mimeType.startsWith("image/") ? record.mimeType : "image/webp",
      };
    }
  }
  return { kind: "letter", letter: firstAvatarLetter(displayName), style: "classic" };
}

function normalizeSquadRole(role: unknown): SocialSquadRole {
  return role === "leader" || role === "co_leader" || role === "elder" || role === "member" ? role : "member";
}

function normalizeSquad(squad: unknown): SocialState["squad"] {
  if (!squad || typeof squad !== "object") return null;
  const record = squad as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.name !== "string") return null;
  const members = Array.isArray(record.members) ? record.members.flatMap((member) => {
    if (!member || typeof member !== "object") return [];
    const item = member as Record<string, unknown>;
    if (typeof item.userId !== "string" || typeof item.displayName !== "string" || typeof item.friendCode !== "string") return [];
    return [{
      userId: item.userId,
      displayName: item.displayName,
      friendCode: item.friendCode,
      avatar: normalizeAvatar(item.avatar, item.displayName),
      role: normalizeSquadRole(item.role),
      joinedAt: typeof item.joinedAt === "string" ? item.joinedAt : new Date().toISOString(),
      lastSeenAt: typeof item.lastSeenAt === "string" ? item.lastSeenAt : null,
      minutes: typeof item.minutes === "number" ? item.minutes : 0,
      sessions: typeof item.sessions === "number" ? item.sessions : 0,
      isSelf: Boolean(item.isSelf),
    }];
  }) : [];
  return {
    id: record.id,
    name: record.name,
    isPrivate: Boolean(record.isPrivate),
    createdByUserId: typeof record.createdByUserId === "string" ? record.createdByUserId : "",
    createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
    totalMinutes: typeof record.totalMinutes === "number" ? record.totalMinutes : 0,
    totalSessions: typeof record.totalSessions === "number" ? record.totalSessions : 0,
    memberCount: typeof record.memberCount === "number" ? record.memberCount : members.length,
    myRole: normalizeSquadRole(record.myRole),
    members,
  };
}

function normalizeSquadRequests(requests: unknown): SocialState["incomingSquadRequests"] {
  if (!Array.isArray(requests)) return [];
  return requests.flatMap((request) => {
    if (!request || typeof request !== "object") return [];
    const record = request as Record<string, unknown>;
    if (typeof record.id !== "string" || typeof record.squadId !== "string") return [];
    return [{
      id: record.id,
      squadId: record.squadId,
      squadName: typeof record.squadName === "string" ? record.squadName : undefined,
      userId: typeof record.userId === "string" ? record.userId : undefined,
      displayName: typeof record.displayName === "string" ? record.displayName : undefined,
      friendCode: typeof record.friendCode === "string" ? record.friendCode : undefined,
      avatar: normalizeAvatar(record.avatar, typeof record.displayName === "string" ? record.displayName : "Student"),
      isPrivate: typeof record.isPrivate === "boolean" ? record.isPrivate : undefined,
      status: record.status === "accepted" || record.status === "declined" ? record.status : "pending",
      createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
    }];
  });
}

function normalizeSquadMessages(messages: unknown): SocialState["squadMessages"] {
  if (!Array.isArray(messages)) return [];
  return messages.flatMap((message) => {
    if (!message || typeof message !== "object") return [];
    const record = message as Record<string, unknown>;
    if (typeof record.id !== "string" || typeof record.squadId !== "string" || typeof record.userId !== "string" || typeof record.displayName !== "string" || typeof record.body !== "string") return [];
    return [{
      id: record.id,
      squadId: record.squadId,
      userId: record.userId,
      displayName: record.displayName,
      friendCode: typeof record.friendCode === "string" ? record.friendCode : "",
      avatar: normalizeAvatar(record.avatar, record.displayName),
      role: normalizeSquadRole(record.role),
      body: record.body,
      createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
      isSelf: Boolean(record.isSelf),
    }];
  });
}

function normalizeSquadScoreEntries(entries: unknown): SocialSquadScoreEntry[] {
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    if (typeof record.squadId !== "string" || typeof record.squadName !== "string") return [];
    return [{
      squadId: record.squadId,
      squadName: record.squadName,
      isPrivate: Boolean(record.isPrivate),
      memberCount: typeof record.memberCount === "number" ? record.memberCount : 0,
      totalMinutes: typeof record.totalMinutes === "number" ? record.totalMinutes : 0,
      totalSessions: typeof record.totalSessions === "number" ? record.totalSessions : 0,
      averageMinutes: typeof record.averageMinutes === "number" ? record.averageMinutes : 0,
      rank: typeof record.rank === "number" ? record.rank : 0,
      points: typeof record.points === "number" ? record.points : 0,
      scoredDays: typeof record.scoredDays === "number" ? record.scoredDays : undefined,
    }];
  });
}

function normalizeFeedPosts(posts: unknown): SocialFeedPost[] {
  if (!Array.isArray(posts)) return [];
  return posts.flatMap((post) => {
    if (!post || typeof post !== "object") return [];
    const record = post as SocialFeedPost & Record<string, unknown>;
    const pollRecord = record.poll && typeof record.poll === "object" ? record.poll as unknown as Record<string, unknown> : null;
    const pollOptions = pollRecord && Array.isArray(pollRecord.options) ? pollRecord.options.flatMap((option) => {
      if (!option || typeof option !== "object") return [];
      const optionRecord = option as Record<string, unknown>;
      if (typeof optionRecord.id !== "string" || typeof optionRecord.text !== "string") return [];
      return [{
        id: optionRecord.id,
        text: optionRecord.text,
        votes: typeof optionRecord.votes === "number" ? optionRecord.votes : 0,
        selected: Boolean(optionRecord.selected),
      }];
    }) : [];
    return [{
      ...record,
      type: record.type === "milestone" ? "milestone" : "session",
      poll: pollRecord && typeof pollRecord.question === "string" && pollOptions.length >= 2 ? {
        question: pollRecord.question,
        multiple: Boolean(pollRecord.multiple),
        options: pollOptions,
        totalVotes: typeof pollRecord.totalVotes === "number" ? pollRecord.totalVotes : pollOptions.reduce((sum, option) => sum + option.votes, 0),
      } : null,
      reactions: record.reactions && typeof record.reactions === "object" ? record.reactions : { fire: 0, brain: 0, clap: 0 },
      reacted: record.reacted && typeof record.reacted === "object" ? record.reacted : {},
      comments: Array.isArray(record.comments) ? record.comments : [],
    }];
  });
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
    squad: null,
    incomingSquadRequests: [],
    outgoingSquadRequests: [],
    squadMessages: [],
    cachedFeeds: {
      global: [],
      friends: [],
    },
    pendingFeedPosts: [],
    cachedLeaderboards: {
      global: { daily: [], weekly: [], overall: [] },
      friends: { daily: [], weekly: [], overall: [] },
      squad: { daily: [], weekly: [], overall: [] },
    },
    cachedSquadScoreLeaderboards: { daily: [], season: [], overall: [] },
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
  loggedSplitSeconds: 0,
  activeSegments: [],
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
  lifetimeStudyMinutes: 0,
  lifetimeStudySessions: 0,
  exports: [],
  settings: {
    accent: "#8fb4ff",
    userName: "",
    dailyGoalMinutes: 120,
    themeFamily: "normal",
    backgroundEffect: true,
    hideFeedImages: false,
    hideFeedPolls: false,
    showHelpButton: true,
    telemetryEnabled: false,
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
    solvedCount: 0,
  },
  wordlePuzzle: makeDefaultWordlePuzzle(),
  geodlePuzzle: makeDefaultGeodlePuzzle(),
  flagglePuzzle: makeDefaultFlagglePuzzle(),
  travlePuzzle: makeDefaultTravlePuzzle(),
};

function normalizeTimerSegments(timer: Partial<TimerState> | undefined): TimerState["activeSegments"] {
  if (Array.isArray(timer?.activeSegments)) {
    return timer.activeSegments.flatMap((segment) => {
      if (!segment || typeof segment !== "object") return [];
      const startedAt = typeof segment.startedAt === "string" ? segment.startedAt : null;
      const endedAt = typeof segment.endedAt === "string" ? segment.endedAt : null;
      if (!startedAt || Number.isNaN(new Date(startedAt).getTime())) return [];
      if (endedAt && Number.isNaN(new Date(endedAt).getTime())) return [];
      return [{ startedAt, endedAt }];
    });
  }

  if (typeof timer?.startedAt === "string" && !Number.isNaN(new Date(timer.startedAt).getTime()) && (timer.phase === "study" || timer.phase === "exam" || timer.phase === "stopwatch")) {
    const startedAtMs = new Date(timer.startedAt).getTime();
    const studySeconds = typeof timer.studyMinutes === "number" ? timer.studyMinutes * 60 : defaultTimer.studyMinutes * 60;
    const examSeconds = typeof timer.examMinutes === "number" ? timer.examMinutes * 60 : defaultTimer.examMinutes * 60;
    const remainingSeconds = typeof timer.remainingSeconds === "number" ? timer.remainingSeconds : 0;
    const loggedSplitSeconds = typeof timer.loggedSplitSeconds === "number" ? timer.loggedSplitSeconds : 0;
    const configuredSeconds = timer.phase === "stopwatch" ? Math.max(0, remainingSeconds) : timer.phase === "exam" ? examSeconds : studySeconds;
    const activeSeconds = timer.phase === "stopwatch" ? configuredSeconds : Math.max(0, Math.min(configuredSeconds, configuredSeconds - remainingSeconds - loggedSplitSeconds));
    return [{ startedAt: timer.startedAt, endedAt: timer.running ? null : new Date(startedAtMs + activeSeconds * 1000).toISOString() }];
  }

  return [];
}

function rehydrateTimer(timer: Partial<TimerState> | undefined): TimerState {
  const merged = {
    ...defaultTimer,
    ...timer,
    loggedSplitSeconds: typeof timer?.loggedSplitSeconds === "number" && Number.isFinite(timer.loggedSplitSeconds) ? Math.max(0, timer.loggedSplitSeconds) : 0,
    activeSegments: normalizeTimerSegments(timer),
  };

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

function normalizeTaskUnitLabel(task: Partial<Task>) {
  const label = typeof task.unitLabel === "string" ? task.unitLabel.trim() : "";
  return label || "Unit";
}

function nextLocalMidnightAfter(date: Date) {
  const next = new Date(date);
  next.setHours(24, 0, 0, 0);
  return next;
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function buildRecoveredSessionsFromSegments(timer: TimerState, segments: Array<{ startedAt: string; endedAt: string }>) {
  const buckets = new Map<string, { startedAt: string; endedAt: string; seconds: number }>();
  segments.forEach((segment) => {
    let cursorMs = new Date(segment.startedAt).getTime();
    const endMs = new Date(segment.endedAt).getTime();
    if (!Number.isFinite(cursorMs) || !Number.isFinite(endMs) || endMs <= cursorMs) return;

    while (cursorMs < endMs) {
      const midnight = nextLocalMidnightAfter(new Date(cursorMs)).getTime();
      const segmentEndMs = Math.min(endMs, midnight);
      const bucketEndMs = segmentEndMs === midnight ? segmentEndMs - 1 : segmentEndMs;
      const startedAt = new Date(cursorMs).toISOString();
      const endedAt = new Date(bucketEndMs).toISOString();
      const key = localDateKey(new Date(cursorMs));
      const current = buckets.get(key);
      const seconds = Math.max(0, (segmentEndMs - cursorMs) / 1000);
      buckets.set(key, current ? { startedAt: current.startedAt, endedAt, seconds: current.seconds + seconds } : { startedAt, endedAt, seconds });
      cursorMs = segmentEndMs;
    }
  });

  return [...buckets.values()].map((bucket) => ({
      id: `recovered-${timer.phase}-${bucket.startedAt}-${bucket.endedAt}`,
      semesterId: timer.semesterId,
      courseId: timer.courseId,
      taskId: timer.taskId,
      kind: timer.phase === "exam" ? "exam" as const : "study" as const,
      goal: timer.goal.trim(),
      learned: timer.learned.trim(),
      blocker: timer.blocker.trim(),
      nextStep: timer.nextStep.trim(),
      confidence: timer.confidence,
      startedAt: bucket.startedAt,
      endedAt: bucket.endedAt,
      minutes: Math.max(1, Math.round(bucket.seconds / 60)),
      presetLabel: timer.presetLabel,
    }));
}

function closeTimerSegmentsForRecovery(timer: TimerState, endedAt: string) {
  const segments = timer.activeSegments.length ? timer.activeSegments : normalizeTimerSegments(timer);
  return segments.flatMap((segment) => {
    const startedAt = new Date(segment.startedAt).getTime();
    const closedAt = new Date(segment.endedAt ?? endedAt).getTime();
    const finalEnd = Math.min(closedAt, new Date(endedAt).getTime());
    if (!Number.isFinite(startedAt) || !Number.isFinite(finalEnd) || finalEnd <= startedAt) return [];
    return [{ startedAt: segment.startedAt, endedAt: new Date(finalEnd).toISOString() }];
  });
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
  const resetTimer = {
    ...defaultTimer,
    ...keepTimerContext(timer),
    running: false,
    phase: "idle" as const,
    startedAt: null,
    endsAt: null,
    loggedSplitSeconds: 0,
    activeSegments: [],
    remainingSeconds: timer.mode === "exam" ? timer.examMinutes * 60 : timer.mode === "endless" ? 0 : timer.studyMinutes * 60,
  };
  const recoveredSessions = buildRecoveredSessionsFromSegments(timer, closeTimerSegmentsForRecovery(timer, endedAt));
  if (!recoveredSessions.length || recoveredSessions.every((recoveredSession) => sessions.some((session) => session.id === recoveredSession.id))) {
    return { timer: resetTimer, sessions };
  }

  return {
    sessions: [...recoveredSessions.filter((recoveredSession) => !sessions.some((session) => session.id === recoveredSession.id)), ...sessions],
    timer: resetTimer,
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
    squad: normalizeSquad(record.squad),
    incomingSquadRequests: normalizeSquadRequests(record.incomingSquadRequests),
    outgoingSquadRequests: normalizeSquadRequests(record.outgoingSquadRequests),
    squadMessages: normalizeSquadMessages(record.squadMessages),
    cachedFeeds: {
      global: normalizeFeedPosts(record.cachedFeeds?.global),
      friends: normalizeFeedPosts(record.cachedFeeds?.friends),
    },
    pendingFeedPosts: normalizeFeedPosts(record.pendingFeedPosts),
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
      squad: {
        daily: record.cachedLeaderboards?.squad?.daily ?? [],
        weekly: record.cachedLeaderboards?.squad?.weekly ?? [],
        overall: record.cachedLeaderboards?.squad?.overall ?? [],
      },
    },
    cachedSquadScoreLeaderboards: {
      daily: normalizeSquadScoreEntries(record.cachedSquadScoreLeaderboards?.daily),
      season: normalizeSquadScoreEntries(record.cachedSquadScoreLeaderboards?.season ?? (record.cachedSquadScoreLeaderboards as { weekly?: unknown } | undefined)?.weekly),
      overall: normalizeSquadScoreEntries(record.cachedSquadScoreLeaderboards?.overall),
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
    unitLabel: normalizeTaskUnitLabel(task),
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
      unitStart: typeof record.unitStart === "number" && Number.isFinite(record.unitStart) ? record.unitStart : undefined,
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

function normalizeWordlePuzzle(puzzle: unknown): WordlePuzzleState {
  if (!puzzle || typeof puzzle !== "object") return makeDefaultWordlePuzzle();
  const record = puzzle as Partial<WordlePuzzleState> & Record<string, unknown>;
  const seedSalt = typeof record.seedSalt === "string" && record.seedSalt ? record.seedSalt : makeWordleSeedSalt();
  const activeDate = todayIso();
  const puzzleId = getWordlePuzzleId(activeDate, seedSalt);
  const isCurrentDailyPuzzle = record.activeDate === activeDate && record.puzzleId === puzzleId;
  const answer = isCurrentDailyPuzzle && typeof record.answer === "string" && /^[a-z]{5}$/.test(record.answer) ? record.answer : getWordleAnswerForDate(activeDate, seedSalt);
  const guesses = isCurrentDailyPuzzle && Array.isArray(record.guesses) ? record.guesses.filter((guess): guess is string => typeof guess === "string" && /^[a-z]{5}$/.test(guess)).slice(0, 6) : [];
  return {
    seedSalt,
    activeDate,
    puzzleId,
    answer,
    guesses,
    completed: isCurrentDailyPuzzle && Boolean(record.completed),
    won: isCurrentDailyPuzzle && Boolean(record.won),
    hardMode: Boolean(record.hardMode),
  };
}

function normalizeGeodlePuzzle(puzzle: unknown): GeodlePuzzleState {
  if (!puzzle || typeof puzzle !== "object") return makeDefaultGeodlePuzzle();
  const record = puzzle as Partial<GeodlePuzzleState> & Record<string, unknown>;
  const seedSalt = typeof record.seedSalt === "string" && record.seedSalt ? record.seedSalt : makeGeodleSeedSalt();
  const activeDate = todayIso();
  const puzzleId = getGeodlePuzzleId(activeDate, seedSalt);
  const isCurrentDailyPuzzle = record.activeDate === activeDate && record.puzzleId === puzzleId;
  const answer = isCurrentDailyPuzzle && typeof record.answer === "string" && record.answer ? record.answer : getGeodleAnswerForDate(activeDate, seedSalt);
  const guesses = isCurrentDailyPuzzle && Array.isArray(record.guesses) ? record.guesses.filter((guess): guess is string => typeof guess === "string").slice(0, 7) : [];
  return {
    seedSalt,
    activeDate,
    puzzleId,
    answer,
    guesses,
    completed: isCurrentDailyPuzzle && Boolean(record.completed),
    won: isCurrentDailyPuzzle && Boolean(record.won),
  };
}

function normalizeFlagglePuzzle(puzzle: unknown): FlagglePuzzleState {
  if (!puzzle || typeof puzzle !== "object") return makeDefaultFlagglePuzzle();
  const record = puzzle as Partial<FlagglePuzzleState> & Record<string, unknown>;
  const seedSalt = typeof record.seedSalt === "string" && record.seedSalt ? record.seedSalt : makeFlaggleSeedSalt();
  const activeDate = todayIso();
  const puzzleId = getFlagglePuzzleId(activeDate, seedSalt);
  const isCurrentDailyPuzzle = record.activeDate === activeDate && record.puzzleId === puzzleId;
  const answer = isCurrentDailyPuzzle && typeof record.answer === "string" && record.answer ? record.answer : getFlaggleAnswerForDate(activeDate, seedSalt);
  const guesses = isCurrentDailyPuzzle && Array.isArray(record.guesses) ? record.guesses.flatMap((guess): FlaggleGuess[] => {
    if (!guess || typeof guess !== "object") return [];
    const item = guess as Partial<FlaggleGuess>;
    if (typeof item.country !== "string" || typeof item.maskedFlagDataUrl !== "string" || typeof item.similarity !== "number") return [];
    return [{ country: item.country, similarity: item.similarity, maskedFlagDataUrl: item.maskedFlagDataUrl }];
  }).slice(0, 7) : [];
  return {
    seedSalt,
    activeDate,
    puzzleId,
    answer,
    guesses,
    completed: isCurrentDailyPuzzle && Boolean(record.completed),
    won: isCurrentDailyPuzzle && Boolean(record.won),
  };
}

function normalizeTravlePuzzle(puzzle: unknown): TravlePuzzleState {
  if (!puzzle || typeof puzzle !== "object") return makeDefaultTravlePuzzle();
  const record = puzzle as Partial<TravlePuzzleState> & Record<string, unknown>;
  const seedSalt = typeof record.seedSalt === "string" && record.seedSalt ? record.seedSalt : makeTravleSeedSalt();
  const activeDate = todayIso();
  const puzzleId = getTravlePuzzleId(activeDate, seedSalt);
  const dailyPuzzle = getTravlePuzzleForDate(activeDate, seedSalt);
  const isCurrentDailyPuzzle = record.activeDate === activeDate && record.puzzleId === puzzleId;
  const start = isCurrentDailyPuzzle && typeof record.start === "string" && record.start ? record.start : dailyPuzzle.start;
  const target = isCurrentDailyPuzzle && typeof record.target === "string" && record.target ? record.target : dailyPuzzle.target;
  const guesses = isCurrentDailyPuzzle && Array.isArray(record.guesses) ? record.guesses.filter((guess): guess is string => typeof guess === "string").slice(0, 7) : [];
  return {
    seedSalt,
    activeDate,
    puzzleId,
    start,
    target,
    guesses,
    completed: isCurrentDailyPuzzle && Boolean(record.completed),
    won: isCurrentDailyPuzzle && Boolean(record.won),
  };
}

function normalizeActiveTab(activeTab: unknown, visibleTabs: Record<TabKey, boolean>): TabKey {
  if (typeof activeTab === "string" && activeTab in defaultVisibleTabs) {
    const tab = activeTab as TabKey;
    if (visibleTabs[tab] !== false) return tab;
  }

  return (Object.keys(defaultVisibleTabs) as TabKey[]).find((tab) => visibleTabs[tab] !== false) ?? "dashboard";
}

function getSessionTotals(sessions: StudySession[]) {
  return sessions
    .filter((session) => session.kind === "study" || session.kind === "exam")
    .reduce((totals, session) => ({
      minutes: totals.minutes + Math.max(0, Math.round(session.minutes)),
      sessions: totals.sessions + 1,
    }), { minutes: 0, sessions: 0 });
}

function getCachedSelfOverallTotals(social: unknown) {
  if (!social || typeof social !== "object") return { minutes: 0, sessions: 0 };
  const record = social as Record<string, unknown>;
  const userId = typeof record.userId === "string" ? record.userId : "";
  const cachedLeaderboards = record.cachedLeaderboards;
  if (!userId || !cachedLeaderboards || typeof cachedLeaderboards !== "object") return { minutes: 0, sessions: 0 };

  return ["global", "friends", "squad"].reduce((best, scope) => {
    const scopeRecord = (cachedLeaderboards as Record<string, unknown>)[scope];
    const overall = scopeRecord && typeof scopeRecord === "object" ? (scopeRecord as Record<string, unknown>).overall : null;
    if (!Array.isArray(overall)) return best;
    const self = overall.find((entry) => {
      return entry && typeof entry === "object" && (entry as Record<string, unknown>).userId === userId;
    }) as Record<string, unknown> | undefined;
    const minutes = typeof self?.minutes === "number" ? Math.max(0, Math.round(self.minutes)) : 0;
    const sessions = typeof self?.sessions === "number" ? Math.max(0, Math.round(self.sessions)) : 0;
    return minutes > best.minutes ? { minutes, sessions } : best;
  }, { minutes: 0, sessions: 0 });
}

function normalizeLifetimeTotals(parsed: Partial<AppState> & Record<string, unknown>, sessions: StudySession[]) {
  const sessionTotals = getSessionTotals(sessions);
  const cachedTotals = getCachedSelfOverallTotals(parsed.social);
  const storedMinutes = typeof parsed.lifetimeStudyMinutes === "number" ? Math.max(0, Math.round(parsed.lifetimeStudyMinutes)) : 0;
  const storedSessions = typeof parsed.lifetimeStudySessions === "number" ? Math.max(0, Math.round(parsed.lifetimeStudySessions)) : 0;
  const candidates = [
    { minutes: storedMinutes, sessions: storedSessions },
    sessionTotals,
    cachedTotals,
  ];
  return candidates.reduce((best, candidate) => candidate.minutes > best.minutes ? candidate : best, { minutes: 0, sessions: 0 });
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
    const lifetimeTotals = normalizeLifetimeTotals(parsed, timerRecovery.sessions);

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
      tasks: Array.isArray(migrated.tasks) ? migrated.tasks.map((task) => ({ ...task, unitLabel: normalizeTaskUnitLabel(task) })) : [],
      exams: Array.isArray(migrated.exams) ? migrated.exams : [],
      calendarEntries: normalizeCalendarEntries(parsed.calendarEntries),
      settings: {
        ...defaultState.settings,
        ...parsed.settings,
        visibleTabs,
        hideFeedImages: Boolean(parsed.settings?.hideFeedImages),
        hideFeedPolls: Boolean(parsed.settings?.hideFeedPolls),
        showHelpButton: parsed.settings?.showHelpButton !== false,
        telemetryEnabled: Boolean(parsed.settings?.telemetryEnabled),
      },
      social: normalizeSocialState(parsed.social),
      wordlePuzzle: normalizeWordlePuzzle(parsed.wordlePuzzle),
      geodlePuzzle: normalizeGeodlePuzzle(parsed.geodlePuzzle),
      flagglePuzzle: normalizeFlagglePuzzle(parsed.flagglePuzzle),
      travlePuzzle: normalizeTravlePuzzle(parsed.travlePuzzle),
      timer: timerRecovery.timer,
      sessions: timerRecovery.sessions,
      lifetimeStudyMinutes: lifetimeTotals.minutes,
      lifetimeStudySessions: lifetimeTotals.sessions,
      exports: Array.isArray(parsed.exports) ? parsed.exports : [],
      badgeCounts: parsed.badgeCounts && typeof parsed.badgeCounts === "object" ? parsed.badgeCounts as Record<string, number> : {},
      badgeCountDates: parsed.badgeCountDates && typeof parsed.badgeCountDates === "object" ? parsed.badgeCountDates as Record<string, string> : {},
    };
  } catch {
    return defaultState;
  }
}

function stripAvatarCopiesForStorage(state: AppState): AppState {
  const withoutAvatar = <T extends { avatar?: unknown }>(item: T): Omit<T, "avatar"> => {
    const copy = { ...item };
    delete copy.avatar;
    return copy;
  };
  const stripLeaderboard = (entry: SocialLeaderboardEntry) => withoutAvatar(entry);
  return {
    ...state,
    social: {
      ...state.social,
      avatar: state.social.avatar,
      pendingFeedPosts: state.social.pendingFeedPosts.map((post) => withoutAvatar(post)),
      cachedFeeds: {
        global: state.social.cachedFeeds.global.map((post) => withoutAvatar(post)),
        friends: state.social.cachedFeeds.friends.map((post) => withoutAvatar(post)),
      },
      cachedLeaderboards: {
        global: {
          daily: state.social.cachedLeaderboards.global.daily.map(stripLeaderboard),
          weekly: state.social.cachedLeaderboards.global.weekly.map(stripLeaderboard),
          overall: state.social.cachedLeaderboards.global.overall.map(stripLeaderboard),
        },
        friends: {
          daily: state.social.cachedLeaderboards.friends.daily.map(stripLeaderboard),
          weekly: state.social.cachedLeaderboards.friends.weekly.map(stripLeaderboard),
          overall: state.social.cachedLeaderboards.friends.overall.map(stripLeaderboard),
        },
        squad: {
          daily: state.social.cachedLeaderboards.squad.daily.map(stripLeaderboard),
          weekly: state.social.cachedLeaderboards.squad.weekly.map(stripLeaderboard),
          overall: state.social.cachedLeaderboards.squad.overall.map(stripLeaderboard),
        },
      },
      squad: state.social.squad ? {
        ...state.social.squad,
        members: state.social.squad.members.map((member) => withoutAvatar(member)),
      } : null,
      squadMessages: state.social.squadMessages.map((message) => withoutAvatar(message)),
      friends: state.social.friends.map((friend) => withoutAvatar(friend)),
    },
  };
}

export function saveAppState(state: AppState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stripAvatarCopiesForStorage(state)));
    } catch {
      console.warn("Study Tracker state could not be saved.", error);
    }
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
