import type { CalendarEntry, DailyTodo, Exam, Holiday, Semester, StudyUnit, TimetableEvent } from "../types";

export function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function maxIso(a: string | null, b: string): string {
  if (!a) return b;
  return a > b ? a : b;
}

function minIso(a: string | null, b: string): string {
  if (!a) return b;
  return a < b ? a : b;
}

function daysBetween(startIso: string, endIso: string): number {
  return Math.round((parseIsoDate(endIso).getTime() - parseIsoDate(startIso).getTime()) / 86400000);
}

function isSemesterScheduleActive(semester: Semester): boolean {
  return !semester.archived && semester.phase === "semester";
}

export function isHoliday(holidays: Holiday[], semesterId: string, dateIso: string): boolean {
  return holidays.some((holiday) => holiday.semesterId === semesterId && dateIso >= holiday.startDate && dateIso <= holiday.endDate);
}

function expandWeekdayFrom(anchorDateIso: string, rangeStartIso: string, rangeEndIso: string): string[] {
  if (rangeStartIso > rangeEndIso) return [];
  const weekday = parseIsoDate(anchorDateIso).getDay();
  const rangeStart = parseIsoDate(maxIso(anchorDateIso, rangeStartIso));
  const offset = (weekday - rangeStart.getDay() + 7) % 7;
  let cursor = addDays(rangeStart, offset);
  const dates: string[] = [];
  while (toIsoDate(cursor) <= rangeEndIso) {
    dates.push(toIsoDate(cursor));
    cursor = addDays(cursor, 7);
  }
  return dates;
}

export interface TimetableEventOccurrence {
  event: TimetableEvent;
  date: string;
}

export function expandTimetableEvents(
  events: TimetableEvent[],
  holidays: Holiday[],
  semester: Semester,
  rangeStartIso: string,
  rangeEndIso: string,
): TimetableEventOccurrence[] {
  if (!isSemesterScheduleActive(semester)) return [];
  const effectiveStart = maxIso(semester.startDate, rangeStartIso);
  const effectiveEnd = minIso(semester.endDate, rangeEndIso);
  if (effectiveStart > effectiveEnd) return [];

  const occurrences: TimetableEventOccurrence[] = [];
  for (const event of events) {
    if (event.semesterId !== semester.id) continue;
    if (event.repeatWeekly) {
      for (const date of expandWeekdayFrom(event.date, effectiveStart, effectiveEnd)) {
        if (isHoliday(holidays, semester.id, date)) continue;
        occurrences.push({ event, date });
      }
    } else if (event.date >= effectiveStart && event.date <= effectiveEnd) {
      occurrences.push({ event, date: event.date });
    }
  }
  return occurrences;
}

export function shouldAutoTransitionToExamPrep(semester: Semester, todayIso: string): boolean {
  if (semester.archived || semester.phase !== "semester" || !semester.endDate) return false;
  return todayIso > semester.endDate;
}

export function getSemesterWeekNumber(semester: Semester, dateIso: string): number | null {
  if (!semester.startDate || dateIso < semester.startDate) return null;
  return Math.floor(daysBetween(semester.startDate, dateIso) / 7) + 1;
}

export type DailyTimelineKind = "lecture" | "exercise-session" | "sheet-release" | "sheet-deadline" | "exam" | "calendar-entry" | "todo" | "study-unit";

export const timetableEventKindLabels: Record<TimetableEvent["kind"], string> = {
  lecture: "Lecture",
  "exercise-session": "Exercise session",
  "sheet-release": "Sheet released",
  "sheet-deadline": "Sheet due",
};

export interface DailyTimelineRow {
  id: string;
  kind: DailyTimelineKind;
  time: string | null;
  endTime: string | null;
  sortMinutes: number;
  title: string;
  courseId: string | null;
  url?: string | null;
  completed?: boolean;
  refId: string;
  occurrenceDate: string;
}

function timeToSortMinutes(time: string | null | undefined): number {
  if (!time) return 24 * 60 + 1;
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export interface DailyTimelineInputs {
  eventOccurrences: TimetableEventOccurrence[];
  exams: Exam[];
  calendarEntries: CalendarEntry[];
  dailyTodos: DailyTodo[];
  studyUnits: StudyUnit[];
}

export function buildDailyTimeline(dateIso: string, inputs: DailyTimelineInputs): DailyTimelineRow[] {
  const rows: DailyTimelineRow[] = [];

  for (const occurrence of inputs.eventOccurrences) {
    if (occurrence.date !== dateIso) continue;
    const { event } = occurrence;
    const title = event.kind === "sheet-release" ? `${event.label} released` : event.kind === "sheet-deadline" ? `${event.label} due` : event.label;
    rows.push({
      id: `${event.kind}:${event.id}:${dateIso}`,
      kind: event.kind,
      time: event.time,
      endTime: event.endTime,
      sortMinutes: timeToSortMinutes(event.time),
      title,
      courseId: event.courseId,
      url: event.url,
      completed: event.completedOccurrences.includes(dateIso),
      refId: event.id,
      occurrenceDate: dateIso,
    });
  }

  for (const exam of inputs.exams) {
    if (exam.examDate.slice(0, 10) !== dateIso) continue;
    rows.push({
      id: `exam:${exam.id}`,
      kind: "exam",
      time: null,
      endTime: null,
      sortMinutes: timeToSortMinutes(null),
      title: exam.title,
      courseId: exam.courseId,
      refId: exam.id,
      occurrenceDate: dateIso,
    });
  }

  for (const entry of inputs.calendarEntries) {
    if (entry.date !== dateIso) continue;
    rows.push({
      id: `calendar-entry:${entry.id}`,
      kind: "calendar-entry",
      time: entry.startTime ?? null,
      endTime: entry.endTime ?? null,
      sortMinutes: timeToSortMinutes(entry.startTime),
      title: entry.adHocTitle ?? "Task",
      courseId: entry.adHocCourseId ?? null,
      completed: entry.completed,
      refId: entry.id,
      occurrenceDate: dateIso,
    });
  }

  for (const todo of inputs.dailyTodos) {
    if (todo.date !== dateIso) continue;
    rows.push({
      id: `todo:${todo.id}`,
      kind: "todo",
      time: null,
      endTime: null,
      sortMinutes: timeToSortMinutes(null),
      title: todo.title,
      courseId: null,
      completed: todo.completed,
      refId: todo.id,
      occurrenceDate: dateIso,
    });
  }

  for (const unit of inputs.studyUnits) {
    if (unit.date !== dateIso) continue;
    rows.push({
      id: `study-unit:${unit.id}`,
      kind: "study-unit",
      time: unit.startTime,
      endTime: unit.endTime,
      sortMinutes: timeToSortMinutes(unit.startTime),
      title: unit.title,
      courseId: unit.courseId,
      completed: unit.completed,
      refId: unit.id,
      occurrenceDate: dateIso,
    });
  }

  return rows.sort((a, b) => a.sortMinutes - b.sortMinutes);
}
