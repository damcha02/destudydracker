import type { Course, Semester, StudySession } from "../types";
import { isoDate } from "./metrics";

/** Rule of thumb for ECTS-style credits: one credit is roughly this many hours of work. */
export const DEFAULT_HOURS_PER_CREDIT = 30;
/** Prefix of the key for study time that was never linked to a course: it belongs to a to-do, named only by the session goal. */
export const TODO_KEY_PREFIX = "todo:";

/** The bucket a session counts toward: its course, else the to-do it was started from (same title, ignoring case, is the same to-do). */
export function getSessionKey(session: Pick<StudySession, "courseId" | "goal">): string {
  return session.courseId ?? `${TODO_KEY_PREFIX}${session.goal.trim().toLowerCase()}`;
}

/** Display names for every to-do key found in the sessions (the first spelling seen, newest first). */
export function getTodoNames(sessions: StudySession[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const session of sessions) {
    if (session.kind === "break" || session.courseId) continue;
    const key = getSessionKey(session);
    if (!names.has(key)) names.set(key, session.goal.trim() || "Untitled to-do");
  }
  return names;
}

/** course id -> (YYYY-MM-DD -> minutes studied). Breaks are not study time and are left out. */
export type MinutesByCourseDay = Map<string, Map<string, number>>;

export interface CurvePoint {
  date: string;
  /** Minutes studied on that day. */
  day: number;
  /** Running total of minutes up to and including that day. */
  total: number;
}

export function minutesToCredits(minutes: number, hoursPerCredit = DEFAULT_HOURS_PER_CREDIT): number {
  if (hoursPerCredit <= 0) return 0;
  return minutes / 60 / hoursPerCredit;
}

export function formatCredits(credits: number): string {
  if (credits >= 10) return credits.toFixed(0);
  return credits.toFixed(credits >= 1 ? 1 : 2);
}

export function formatHours(minutes: number): string {
  const hours = minutes / 60;
  return hours >= 100 ? hours.toFixed(0) : hours.toFixed(1);
}

export function buildMinutesByCourseDay(sessions: StudySession[]): MinutesByCourseDay {
  const result: MinutesByCourseDay = new Map();
  for (const session of sessions) {
    if (session.kind === "break" || session.minutes <= 0) continue;
    const courseId = getSessionKey(session);
    const date = isoDate(new Date(session.endedAt));
    let days = result.get(courseId);
    if (!days) {
      days = new Map();
      result.set(courseId, days);
    }
    days.set(date, (days.get(date) ?? 0) + session.minutes);
  }
  return result;
}

export function addDays(date: string, delta: number): string {
  const next = new Date(`${date}T00:00:00`);
  next.setDate(next.getDate() + delta);
  return isoDate(next);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86400000);
}

export function sumCourse(byDay: Map<string, number> | undefined, from: string, to: string): number {
  if (!byDay) return 0;
  let sum = 0;
  for (const [date, minutes] of byDay) if (date >= from && date <= to) sum += minutes;
  return sum;
}

/** Daily + running-total series for the given courses over [from, to], one point per day. */
export function buildCurve(data: MinutesByCourseDay, courseIds: string[], from: string, to: string): CurvePoint[] {
  const points: CurvePoint[] = [];
  const length = daysBetween(from, to);
  if (length < 0) return points;
  // Everything studied before the window counts toward the running total, so a curve that
  // starts mid-way does not pretend to begin from zero.
  let total = 0;
  for (const id of courseIds) {
    const days = data.get(id);
    if (!days) continue;
    for (const [date, minutes] of days) if (date < from) total += minutes;
  }
  for (let offset = 0; offset <= length; offset += 1) {
    const date = addDays(from, offset);
    let day = 0;
    for (const id of courseIds) day += data.get(id)?.get(date) ?? 0;
    total += day;
    points.push({ date, day, total });
  }
  return points;
}

/** Same as buildCurve but the total starts at zero at `from` (progress within the window). */
export function buildWindowCurve(data: MinutesByCourseDay, courseIds: string[], from: string, to: string): CurvePoint[] {
  const points = buildCurve(data, courseIds, from, to);
  const base = points.length ? points[0].total - points[0].day : 0;
  return points.map((point) => ({ ...point, total: point.total - base }));
}

export interface CourseSummary {
  id: string;
  name: string;
  color: string;
  minutes: number;
  activeDays: number;
  longestStreak: number;
  bestDay: { date: string; minutes: number } | null;
}

export function summarizeCourse(data: MinutesByCourseDay, id: string, name: string, color: string, from: string, to: string): CourseSummary {
  const days = [...(data.get(id) ?? [])].filter(([date]) => date >= from && date <= to).sort(([a], [b]) => a.localeCompare(b));
  let minutes = 0;
  let best: CourseSummary["bestDay"] = null;
  let longest = 0;
  let run = 0;
  let previous: string | null = null;
  for (const [date, value] of days) {
    minutes += value;
    if (!best || value > best.minutes) best = { date, minutes: value };
    run = previous && daysBetween(previous, date) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = date;
  }
  return { id, name, color, minutes, activeDays: days.length, longestStreak: longest, bestDay: best };
}

/** The date range a semester's statistics should cover: its start to today (or its end once archived/over without prep). */
export function getSemesterWindow(semester: Semester, data: MinutesByCourseDay, today: string): { from: string; to: string } {
  let earliest: string | null = null;
  for (const days of data.values()) for (const date of days.keys()) if (!earliest || date < earliest) earliest = date;
  const from = semester.startDate ?? earliest ?? addDays(today, -30);
  const closed = semester.archived && semester.endDate ? semester.endDate : null;
  const to = closed && closed < today ? closed : today;
  return { from: from > to ? addDays(to, -30) : from, to };
}

export function coursesForSemester(courses: Course[], semesterId: string): Course[] {
  return courses.filter((course) => course.semesterId === semesterId);
}

/** Local-only credits per course (ECTS the course is worth), kept out of app state so it never syncs or backs up with social data. */
const CREDITS_KEY = "study-tracker-stats-course-credits";
const HOURS_PER_CREDIT_KEY = "study-tracker-stats-hours-per-credit";

export function loadCourseCredits(): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(CREDITS_KEY) ?? "{}") as Record<string, unknown>;
    const result: Record<string, number> = {};
    for (const [id, value] of Object.entries(parsed)) if (typeof value === "number" && value > 0 && Number.isFinite(value)) result[id] = value;
    return result;
  } catch {
    return {};
  }
}

export function saveCourseCredits(credits: Record<string, number>): void {
  try {
    localStorage.setItem(CREDITS_KEY, JSON.stringify(credits));
  } catch {
    /* storage unavailable - credits just won't persist */
  }
}

export function loadHoursPerCredit(): number {
  try {
    const value = Number(localStorage.getItem(HOURS_PER_CREDIT_KEY));
    return value > 0 && Number.isFinite(value) ? value : DEFAULT_HOURS_PER_CREDIT;
  } catch {
    return DEFAULT_HOURS_PER_CREDIT;
  }
}

export function saveHoursPerCredit(hours: number): void {
  try {
    localStorage.setItem(HOURS_PER_CREDIT_KEY, String(hours));
  } catch {
    /* ignore */
  }
}
