import { describe, expect, it } from "vitest";
import { buildCurve, buildMinutesByCourseDay, buildWindowCurve, minutesToCredits, summarizeCourse, getTodoNames } from "./statistics";
import type { StudySession } from "../types";

function session(courseId: string | null, endedAt: string, minutes: number, kind: StudySession["kind"] = "study", goal = ""): StudySession {
  return { id: `${courseId}-${endedAt}`, semesterId: null, courseId, taskId: null, kind, goal, learned: "", blocker: "", nextStep: "", confidence: 3, startedAt: endedAt, endedAt, minutes, presetLabel: "" };
}

describe("statistics", () => {
  const data = buildMinutesByCourseDay([
    session("a", "2026-03-02T10:00:00", 60),
    session("a", "2026-03-02T15:00:00", 30),
    session("a", "2026-03-03T10:00:00", 45),
    session("b", "2026-03-09T10:00:00", 120),
    session(null, "2026-03-09T12:00:00", 10, "study", "Thesis "),
    session(null, "2026-03-10T12:00:00", 5, "study", "thesis"),
    session("a", "2026-03-04T10:00:00", 500, "break"),
  ]);

  it("groups by course and day and ignores breaks", () => {
    expect(data.get("a")?.get("2026-03-02")).toBe(90);
    expect(data.get("a")?.has("2026-03-04")).toBe(false);
    expect(data.get("todo:thesis")?.get("2026-03-09")).toBe(10);
    expect(data.get("todo:thesis")?.get("2026-03-10")).toBe(5);
    expect([...getTodoNames([session(null, "2026-03-09T12:00:00", 10, "study", "Thesis ")]).values()]).toEqual(["Thesis"]);
  });

  it("builds a running total that includes earlier study", () => {
    const curve = buildCurve(data, ["a"], "2026-03-03", "2026-03-04");
    expect(curve.map((point) => point.total)).toEqual([135, 135]);
    expect(buildWindowCurve(data, ["a"], "2026-03-03", "2026-03-04").map((point) => point.total)).toEqual([45, 45]);
  });

  it("summarises streaks and the best day", () => {
    const summary = summarizeCourse(data, "a", "A", "#000", "2026-03-01", "2026-03-31");
    expect(summary).toMatchObject({ minutes: 135, activeDays: 2, longestStreak: 2, bestDay: { date: "2026-03-02", minutes: 90 } });
  });

  it("converts hours to credits", () => {
    expect(minutesToCredits(30 * 60)).toBe(1);
    expect(minutesToCredits(60, 0)).toBe(0);
  });
});
