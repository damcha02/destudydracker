export type Priority = "low" | "medium" | "high";
export type SessionKind = "study" | "break" | "exam";
export type TimerPhase = "idle" | "study" | "break" | "exam" | "stopwatch";
export type TimerMode = "focus" | "exam" | "endless";
export type TabKey = "dashboard" | "planner" | "timer" | "vault" | "friends" | "break";
export type SocialLeaderboardScope = "global" | "friends";
export type SocialLeaderboardPeriod = "daily" | "weekly" | "overall";
export type SocialFeedScope = "global" | "friends";
export type SocialSubtab = "feed" | "leaderboard" | "friends" | "squad" | "profile";
export type SocialFriendRequestStatus = "pending" | "accepted" | "declined";

export interface Semester {
  id: string;
  name: string;
  createdAt: string;
}

export interface Course {
  id: string;
  semesterId: string;
  name: string;
  color: string;
  targetGrade: number;
  createdAt: string;
}

export interface Task {
  id: string;
  semesterId: string;
  courseId: string;
  title: string;
  totalUnits: number;
  completedUnits: number;
  dueDate: string | null;
  priority: Priority;
  notes: string;
  createdAt: string;
}

export interface Exam {
  id: string;
  semesterId: string;
  courseId: string;
  title: string;
  examDate: string;
  weight: number;
  preparedness: number;
}

export interface CalendarEntry {
  id: string;
  taskId: string;
  date: string;
  unitAmount: 1 | 0.5 | 0.25;
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  startTime?: string;
  endTime?: string;
  adHocTitle?: string;
  adHocSemesterId?: string;
  adHocCourseId?: string;
}

export interface StudySession {
  id: string;
  semesterId: string | null;
  courseId: string | null;
  taskId: string | null;
  kind: SessionKind;
  goal: string;
  learned: string;
  blocker: string;
  nextStep: string;
  confidence: number;
  startedAt: string;
  endedAt: string;
  minutes: number;
  presetLabel: string;
}

export interface VaultExport {
  id: string;
  exportedAt: string;
  notePath: string;
  noteDate: string;
}

export interface Settings {
  accent: string;
  userName: string;
  dailyGoalMinutes: number;
  themeFamily: "normal";
  vaultPath: string | null;
  vaultName: string;
  visibleTabs: Record<TabKey, boolean>;
}

export interface SocialLeaderboardEntry {
  userId: string;
  displayName: string;
  friendCode: string;
  minutes: number;
  sessions: number;
  rank: number;
  lastActiveDate: string | null;
  isSelf?: boolean;
}

export interface SocialFriendRequest {
  id: string;
  fromUserId: string;
  toUserId: string;
  fromDisplayName: string;
  toDisplayName: string;
  fromFriendCode: string;
  toFriendCode: string;
  status: SocialFriendRequestStatus;
  createdAt: string;
}

export interface SocialFriend {
  userId: string;
  displayName: string;
  friendCode: string;
  friendsSince: string;
  lastSeenAt: string | null;
}

export interface SocialFeedPost {
  id: string;
  userId: string;
  displayName: string;
  friendCode: string;
  type: "session" | "milestone";
  subject: string;
  detail: string;
  note: string;
  icon: string;
  minutes: number;
  presetLabel: string;
  createdAt: string;
  isSelf?: boolean;
  reactions: Record<string, number>;
  reacted?: Record<string, boolean>;
}

export interface SocialState {
  userId: string;
  deviceSecret: string;
  friendCode: string;
  displayName: string;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  nextAutoSyncAt: string | null;
  isPrivate: boolean;
  autoPostSessions: boolean;
  friends: SocialFriend[];
  incomingFriendRequests: SocialFriendRequest[];
  outgoingFriendRequests: SocialFriendRequest[];
  cachedFeeds: Record<SocialFeedScope, SocialFeedPost[]>;
  pendingFeedPosts: SocialFeedPost[];
  cachedLeaderboards: Record<SocialLeaderboardScope, Record<SocialLeaderboardPeriod, SocialLeaderboardEntry[]>>;
}

export interface TimerState {
  phase: TimerPhase;
  mode: TimerMode;
  remainingSeconds: number;
  running: boolean;
  studyMinutes: number;
  breakMinutes: number;
  examMinutes: number;
  startedAt: string | null;
  endsAt: string | null;
  semesterId: string | null;
  courseId: string | null;
  taskId: string | null;
  goal: string;
  learned: string;
  blocker: string;
  nextStep: string;
  confidence: number;
  presetLabel: string;
}

export interface PlayedBreak {
  name: string;
  playedAt: string;
}

export interface AppState {
  semesters: Semester[];
  courses: Course[];
  tasks: Task[];
  exams: Exam[];
  calendarEntries: CalendarEntry[];
  sessions: StudySession[];
  exports: VaultExport[];
  settings: Settings;
  social: SocialState;
  timer: TimerState;
  activeTab: TabKey;
  unlockedGames: string[];
  unlockedGamesDate: string;
  playedBreaks: PlayedBreak[];
  playedBreaksDate: string;
  totalUnlocks: number;
  unlockStreak: number;
  lastUnlockDate: string;
  speedrunnerToday: boolean;
  playedGamesAllTime: string[];
  waterGlasses: number;
  waterDate: string;
  petRockPats: number;
}
