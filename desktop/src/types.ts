export type Priority = "low" | "medium" | "high";
export type SessionKind = "study" | "break" | "exam";
export type TimerPhase = "idle" | "study" | "break" | "exam";
export type TimerMode = "focus" | "exam";
export type TabKey = "dashboard" | "planner" | "timer" | "vault";

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
  vaultPath: string | null;
  vaultName: string;
  anthropicApiKey: string;
  aiModel: string;
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

export interface AppState {
  semesters: Semester[];
  courses: Course[];
  tasks: Task[];
  exams: Exam[];
  sessions: StudySession[];
  exports: VaultExport[];
  settings: Settings;
  timer: TimerState;
  activeTab: TabKey;
}
