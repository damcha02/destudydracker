import { describe, expect, it } from "vitest";
import { getSyncSocialStats, MAX_SYNC_STAT_ROWS } from "./social";
import type { StudySession } from "../types";

function sessionForDate(date: string): StudySession {
  return {
    id: date,
    semesterId: null,
    courseId: null,
    taskId: null,
    kind: "study",
    goal: "",
    learned: "",
    blocker: "",
    nextStep: "",
    confidence: 3,
    startedAt: `${date}T08:00:00.000Z`,
    endedAt: `${date}T09:00:00.000Z`,
    minutes: 60,
    presetLabel: "Study",
  };
}

describe("social sync payload", () => {
  it("syncs only the newest stat rows", () => {
    const sessions = Array.from({ length: MAX_SYNC_STAT_ROWS + 5 }, (_, index) => {
      const date = new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10);
      return sessionForDate(date);
    });

    const stats = getSyncSocialStats(sessions);

    expect(stats).toHaveLength(MAX_SYNC_STAT_ROWS);
    expect(stats[0].date).toBe("2025-01-06");
    expect(stats.at(-1)?.date).toBe("2026-01-10");
  });
});
