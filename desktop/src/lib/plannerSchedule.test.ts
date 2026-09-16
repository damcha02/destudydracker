import { describe, expect, it } from "vitest";
import {
  buildDailyTimeline,
  computeOverlapLayout,
  expandTimetableEvents,
  getSemesterWeekNumber,
  isHoliday,
  makeTimetableEvent,
  moveSingleOccurrence,
  shouldAutoTransitionToExamPrep,
  splitRecurringEventAt,
} from "./plannerSchedule";
import type { Holiday, Semester, TimetableEvent } from "../types";

function semester(overrides: Partial<Semester>): Semester {
  return {
    id: "semester",
    name: "Semester",
    createdAt: "2026-01-01T00:00:00.000Z",
    startDate: null,
    endDate: null,
    phase: "semester",
    archived: false,
    archivedAt: null,
    ...overrides,
  };
}

function timetableEvent(overrides: Partial<TimetableEvent>): TimetableEvent {
  return {
    id: "event",
    semesterId: "semester",
    courseId: "course",
    kind: "occurrence",
    taskId: "task-1",
    label: "Lecture",
    date: "2026-09-07",
    time: "10:00",
    endTime: "12:00",
    repeatWeekly: true,
    recurrenceEndDate: null,
    occurrenceOverrides: {},
    url: null,
    completedOccurrences: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function holiday(overrides: Partial<Holiday>): Holiday {
  return {
    id: "holiday",
    semesterId: "semester",
    startDate: "2026-09-14",
    endDate: "2026-09-14",
    label: "Break",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("expandTimetableEvents", () => {
  it("expands a repeat-weekly event across a semester date range", () => {
    const sem = semester({ startDate: "2026-09-07", endDate: "2026-09-28" });
    const event = timetableEvent({ date: "2026-09-07" });
    const occurrences = expandTimetableEvents([event], [], sem, "2026-01-01", "2026-12-31");
    expect(occurrences.map((o) => o.date)).toEqual(["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"]);
  });

  it("includes occurrences exactly on startDate and endDate", () => {
    const sem = semester({ startDate: "2026-09-07", endDate: "2026-09-07" });
    const event = timetableEvent({ date: "2026-09-07" });
    const occurrences = expandTimetableEvents([event], [], sem, "2026-01-01", "2026-12-31");
    expect(occurrences.map((o) => o.date)).toEqual(["2026-09-07"]);
  });

  it("clamps to the query range even if the semester is longer", () => {
    const sem = semester({ startDate: "2026-01-01", endDate: "2026-12-31" });
    const event = timetableEvent({ date: "2026-09-07" });
    const occurrences = expandTimetableEvents([event], [], sem, "2026-09-01", "2026-09-14");
    expect(occurrences.map((o) => o.date)).toEqual(["2026-09-07", "2026-09-14"]);
  });

  it("returns nothing once the semester is in exam-prep phase", () => {
    const sem = semester({ startDate: "2026-09-07", endDate: "2026-09-28", phase: "exam-prep" });
    const event = timetableEvent({ date: "2026-09-07" });
    expect(expandTimetableEvents([event], [], sem, "2026-01-01", "2026-12-31")).toEqual([]);
  });

  it("returns nothing for an archived semester", () => {
    const sem = semester({ startDate: "2026-09-07", endDate: "2026-09-28", archived: true });
    const event = timetableEvent({ date: "2026-09-07" });
    expect(expandTimetableEvents([event], [], sem, "2026-01-01", "2026-12-31")).toEqual([]);
  });

  it("suppresses only the occurrence that falls on a holiday, leaving neighboring weeks intact", () => {
    const sem = semester({ startDate: "2026-09-07", endDate: "2026-09-28" });
    const event = timetableEvent({ date: "2026-09-07" });
    const occurrences = expandTimetableEvents([event], [holiday({ startDate: "2026-09-14", endDate: "2026-09-14" })], sem, "2026-01-01", "2026-12-31");
    expect(occurrences.map((o) => o.date)).toEqual(["2026-09-07", "2026-09-21", "2026-09-28"]);
  });

  it("does not suppress a non-repeating one-off event placed on a holiday date", () => {
    const sem = semester({ startDate: "2026-09-07", endDate: "2026-09-28" });
    const event = timetableEvent({ date: "2026-09-14", repeatWeekly: false });
    const occurrences = expandTimetableEvents([event], [holiday({ startDate: "2026-09-14", endDate: "2026-09-14" })], sem, "2026-01-01", "2026-12-31");
    expect(occurrences.map((o) => o.date)).toEqual(["2026-09-14"]);
  });

  it("includes a non-repeating event only once, within range", () => {
    const sem = semester({ startDate: "2026-09-01", endDate: "2026-09-30" });
    const event = timetableEvent({ date: "2026-09-10", repeatWeekly: false });
    const occurrences = expandTimetableEvents([event], [], sem, "2026-01-01", "2026-12-31");
    expect(occurrences).toEqual([{ event, date: "2026-09-10" }]);
  });

  it("clips weekly projection at recurrenceEndDate", () => {
    const sem = semester({ startDate: "2026-09-07", endDate: "2026-09-28" });
    const event = timetableEvent({ date: "2026-09-07", recurrenceEndDate: "2026-09-14" });
    const occurrences = expandTimetableEvents([event], [], sem, "2026-01-01", "2026-12-31");
    expect(occurrences.map((o) => o.date)).toEqual(["2026-09-07", "2026-09-14"]);
  });

  it("skips a specific occurrence when overridden as skipped", () => {
    const sem = semester({ startDate: "2026-09-07", endDate: "2026-09-28" });
    const event = timetableEvent({ date: "2026-09-07", occurrenceOverrides: { "2026-09-14": { skipped: true } } });
    const occurrences = expandTimetableEvents([event], [], sem, "2026-01-01", "2026-12-31");
    expect(occurrences.map((o) => o.date)).toEqual(["2026-09-07", "2026-09-21", "2026-09-28"]);
  });

  it("relocates a specific occurrence to an overridden date/time", () => {
    const sem = semester({ startDate: "2026-09-07", endDate: "2026-09-28" });
    const event = timetableEvent({ date: "2026-09-07", occurrenceOverrides: { "2026-09-14": { date: "2026-09-15", time: "14:00", endTime: "15:00" } } });
    const occurrences = expandTimetableEvents([event], [], sem, "2026-01-01", "2026-12-31");
    expect(occurrences.map((o) => o.date)).toEqual(["2026-09-07", "2026-09-15", "2026-09-21", "2026-09-28"]);
    const moved = occurrences.find((o) => o.date === "2026-09-15")!;
    expect(moved.event.time).toBe("14:00");
    expect(moved.event.endTime).toBe("15:00");
  });

  it("projects weekly recurrence identically regardless of which task (and therefore subtype) the event is linked to - the engine never reads taskId/kind, only date/time/repeatWeekly/overrides/recurrenceEndDate/holidays", () => {
    const sem = semester({ startDate: "2026-09-07", endDate: "2026-09-28" });
    const lectureEvent = timetableEvent({ taskId: "lecture-task", kind: "occurrence", date: "2026-09-07" });
    const sheetEvent = timetableEvent({ taskId: "sheet-task", kind: "sheet-release", date: "2026-09-07" });
    const orphanedEvent = timetableEvent({ taskId: "unknown-task-id", kind: "occurrence", date: "2026-09-07" });
    const lectureDates = expandTimetableEvents([lectureEvent], [], sem, "2026-01-01", "2026-12-31").map((o) => o.date);
    const sheetDates = expandTimetableEvents([sheetEvent], [], sem, "2026-01-01", "2026-12-31").map((o) => o.date);
    const orphanedDates = expandTimetableEvents([orphanedEvent], [], sem, "2026-01-01", "2026-12-31").map((o) => o.date);
    expect(lectureDates).toEqual(["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"]);
    expect(sheetDates).toEqual(lectureDates);
    expect(orphanedDates).toEqual(lectureDates);
  });
});

describe("moveSingleOccurrence", () => {
  it("writes an override entry keyed by the original occurrence date", () => {
    const event = timetableEvent({});
    const moved = moveSingleOccurrence(event, "2026-09-14", "2026-09-15", "14:00", "15:00");
    expect(moved.occurrenceOverrides["2026-09-14"]).toEqual({ date: "2026-09-15", time: "14:00", endTime: "15:00" });
    expect(event.occurrenceOverrides).toEqual({});
  });
});

describe("splitRecurringEventAt", () => {
  it("truncates the original series and starts a new one from the moved occurrence", () => {
    const event = timetableEvent({ date: "2026-09-07", completedOccurrences: ["2026-09-07"] });
    const { updatedOriginal, newEvent } = splitRecurringEventAt(event, "2026-09-14", "2026-09-16", "09:00", "10:00", () => "new-event-id");
    expect(updatedOriginal.recurrenceEndDate).toBe("2026-09-13");
    expect(updatedOriginal.completedOccurrences).toEqual(["2026-09-07"]);
    expect(newEvent.id).toBe("new-event-id");
    expect(newEvent.date).toBe("2026-09-16");
    expect(newEvent.time).toBe("09:00");
    expect(newEvent.recurrenceEndDate).toBeNull();
    expect(newEvent.completedOccurrences).toEqual([]);
  });
});

describe("isHoliday", () => {
  it("matches a date within a holiday range for the right semester", () => {
    const h = holiday({ startDate: "2026-12-20", endDate: "2027-01-05" });
    expect(isHoliday([h], "semester", "2026-12-25")).toBe(true);
    expect(isHoliday([h], "semester", "2026-12-19")).toBe(false);
    expect(isHoliday([h], "other-semester", "2026-12-25")).toBe(false);
  });
});

describe("getSemesterWeekNumber", () => {
  it("returns week 1 on the start date and increments weekly", () => {
    const sem = semester({ startDate: "2026-09-07" });
    expect(getSemesterWeekNumber(sem, "2026-09-07")).toBe(1);
    expect(getSemesterWeekNumber(sem, "2026-09-13")).toBe(1);
    expect(getSemesterWeekNumber(sem, "2026-09-14")).toBe(2);
  });

  it("returns null before the start date or when there is no start date", () => {
    const sem = semester({ startDate: "2026-09-07" });
    expect(getSemesterWeekNumber(sem, "2026-09-06")).toBeNull();
    expect(getSemesterWeekNumber(semester({ startDate: null }), "2026-09-07")).toBeNull();
  });
});

describe("shouldAutoTransitionToExamPrep", () => {
  it("is true once today is after the semester end date", () => {
    const sem = semester({ endDate: "2026-09-28" });
    expect(shouldAutoTransitionToExamPrep(sem, "2026-09-29")).toBe(true);
  });

  it("is false on the end date itself", () => {
    const sem = semester({ endDate: "2026-09-28" });
    expect(shouldAutoTransitionToExamPrep(sem, "2026-09-28")).toBe(false);
  });

  it("is false once already in exam-prep phase", () => {
    const sem = semester({ endDate: "2026-09-28", phase: "exam-prep" });
    expect(shouldAutoTransitionToExamPrep(sem, "2026-09-29")).toBe(false);
  });

  it("is false when there is no end date", () => {
    const sem = semester({ endDate: null });
    expect(shouldAutoTransitionToExamPrep(sem, "2026-09-29")).toBe(false);
  });
});

describe("buildDailyTimeline", () => {
  it("merges and sorts all entry kinds by time, with all-day items last", () => {
    const releaseEvent = timetableEvent({ id: "sheet1", kind: "sheet-release", time: "20:00", date: "2026-09-07" });
    const rows = buildDailyTimeline("2026-09-07", {
      eventOccurrences: [
        { event: timetableEvent({ date: "2026-09-07", time: "10:00" }), date: "2026-09-07" },
        { event: releaseEvent, date: "2026-09-07" },
      ],
      exams: [{ id: "exam", semesterId: "semester", courseId: "course", title: "Midterm", examDate: "2026-09-07", weight: 30, preparedness: 0, location: "" }],
      calendarEntries: [],
      dailyTodos: [{ id: "todo", date: "2026-09-07", time: null, title: "Buy pens", notes: "", completed: false, completedAt: null, createdAt: "2026-01-01T00:00:00.000Z" }],
      studyUnits: [],
    });

    expect(rows.map((row) => row.kind)).toEqual(["occurrence", "sheet-release", "exam", "todo"]);
  });

  it("reflects completion state from the event's own completedOccurrences", () => {
    const event = timetableEvent({ kind: "sheet-deadline", date: "2026-09-07", completedOccurrences: ["2026-09-07"] });
    const rows = buildDailyTimeline("2026-09-07", {
      eventOccurrences: [{ event, date: "2026-09-07" }],
      exams: [],
      calendarEntries: [],
      dailyTodos: [],
      studyUnits: [],
    });
    expect(rows[0].completed).toBe(true);
  });
});

describe("computeOverlapLayout", () => {
  it("gives every item columnCount 1 when nothing overlaps", () => {
    const layout = computeOverlapLayout([
      { id: "a", startMinutes: 540, endMinutes: 600 },
      { id: "b", startMinutes: 600, endMinutes: 660 },
      { id: "c", startMinutes: 700, endMinutes: 720 },
    ]);
    expect(layout.get("a")).toEqual({ column: 0, columnCount: 1 });
    expect(layout.get("b")).toEqual({ column: 0, columnCount: 1 });
    expect(layout.get("c")).toEqual({ column: 0, columnCount: 1 });
  });

  it("splits two overlapping items into two side-by-side columns", () => {
    const layout = computeOverlapLayout([
      { id: "a", startMinutes: 540, endMinutes: 600 },
      { id: "b", startMinutes: 570, endMinutes: 630 },
    ]);
    expect(layout.get("a")).toEqual({ column: 0, columnCount: 2 });
    expect(layout.get("b")).toEqual({ column: 1, columnCount: 2 });
  });

  it("reuses a freed column once an earlier item has ended, instead of always widening the cluster", () => {
    // a: 9:00-10:00, b: 9:30-10:30 (overlaps a), c: 10:00-11:00 (does not overlap a, but does
    // start exactly when a ends - column for a should be free again for c).
    const layout = computeOverlapLayout([
      { id: "a", startMinutes: 540, endMinutes: 600 },
      { id: "b", startMinutes: 570, endMinutes: 630 },
      { id: "c", startMinutes: 600, endMinutes: 660 },
    ]);
    expect(layout.get("a")!.columnCount).toBe(2);
    expect(layout.get("b")!.columnCount).toBe(2);
    expect(layout.get("c")!.columnCount).toBe(2);
    expect(layout.get("a")!.column).toBe(layout.get("c")!.column);
    expect(layout.get("a")!.column).not.toBe(layout.get("b")!.column);
  });

  it("assigns three columns for three mutually overlapping items", () => {
    const layout = computeOverlapLayout([
      { id: "a", startMinutes: 540, endMinutes: 600 },
      { id: "b", startMinutes: 545, endMinutes: 605 },
      { id: "c", startMinutes: 550, endMinutes: 610 },
    ]);
    const columns = new Set(["a", "b", "c"].map((id) => layout.get(id)!.column));
    expect(columns.size).toBe(3);
    expect(layout.get("a")!.columnCount).toBe(3);
  });

  it("does not treat touching endpoints (one item's end equals another's start) as overlapping", () => {
    const layout = computeOverlapLayout([
      { id: "a", startMinutes: 540, endMinutes: 600 },
      { id: "b", startMinutes: 600, endMinutes: 660 },
    ]);
    expect(layout.get("a")).toEqual({ column: 0, columnCount: 1 });
    expect(layout.get("b")).toEqual({ column: 0, columnCount: 1 });
  });
});

describe("makeTimetableEvent", () => {
  it("fills in the same defaults (recurrenceEndDate, occurrenceOverrides, completedOccurrences) regardless of caller, so every creation path shares one schema", () => {
    const event = makeTimetableEvent({
      id: "ev1", semesterId: "sem1", courseId: "course1", taskId: "task1",
      kind: "occurrence", label: "Lecture", date: "2026-09-07", time: "10:00", repeatWeekly: true,
    });
    expect(event).toMatchObject({
      id: "ev1", semesterId: "sem1", courseId: "course1", taskId: "task1",
      kind: "occurrence", label: "Lecture", date: "2026-09-07", time: "10:00",
      endTime: null, repeatWeekly: true, recurrenceEndDate: null, occurrenceOverrides: {},
      url: null, completedOccurrences: [],
    });
    expect(typeof event.createdAt).toBe("string");
  });

  it("carries an explicit endTime/url/createdAt through instead of defaulting them", () => {
    const event = makeTimetableEvent({
      id: "ev2", semesterId: "sem1", courseId: "course1", taskId: "task1",
      kind: "sheet-release", label: "Sheet 1", date: "2026-09-07", time: "20:00", endTime: "20:30",
      repeatWeekly: false, url: "https://example.com", createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(event.endTime).toBe("20:30");
    expect(event.url).toBe("https://example.com");
    expect(event.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });
});
