import { describe, expect, it } from "vitest";
import {
  buildDailyTimeline,
  expandTimetableEvents,
  getSemesterWeekNumber,
  isHoliday,
  shouldAutoTransitionToExamPrep,
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
    kind: "lecture",
    label: "Lecture",
    date: "2026-09-07",
    time: "10:00",
    endTime: "12:00",
    repeatWeekly: true,
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
      dailyTodos: [{ id: "todo", date: "2026-09-07", title: "Buy pens", completed: false, completedAt: null, createdAt: "2026-01-01T00:00:00.000Z" }],
      studyUnits: [],
    });

    expect(rows.map((row) => row.kind)).toEqual(["lecture", "sheet-release", "exam", "todo"]);
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
