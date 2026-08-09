import { describe, expect, it } from "vitest";
import { defaultTimer } from "./storage";
import { getDisplayRemainingSeconds, getTimerActiveSeconds } from "./timerDisplay";
import type { TimerState } from "../types";

describe("getDisplayRemainingSeconds", () => {
  it("returns the stored snapshot when paused/idle, ignoring `now`", () => {
    const timer: TimerState = { ...defaultTimer, running: false, remainingSeconds: 742 };
    expect(getDisplayRemainingSeconds(timer, new Date("2026-01-01T00:00:00Z"))).toBe(742);
  });

  it("derives seconds left from endsAt for a running countdown", () => {
    const now = new Date("2026-08-01T12:00:00Z");
    const endsAt = new Date(now.getTime() + 37_000).toISOString();
    const timer: TimerState = { ...defaultTimer, phase: "study", running: true, endsAt, remainingSeconds: 999 };
    expect(getDisplayRemainingSeconds(timer, now)).toBe(37);
  });

  it("clamps to 0 once endsAt has passed", () => {
    const now = new Date("2026-08-01T12:00:00Z");
    const endsAt = new Date(now.getTime() - 5_000).toISOString();
    const timer: TimerState = { ...defaultTimer, phase: "study", running: true, endsAt, remainingSeconds: 999 };
    expect(getDisplayRemainingSeconds(timer, now)).toBe(0);
  });

  it("falls back to the stored snapshot when running with no endsAt", () => {
    const timer: TimerState = { ...defaultTimer, phase: "study", running: true, endsAt: null, remainingSeconds: 88 };
    expect(getDisplayRemainingSeconds(timer, new Date())).toBe(88);
  });

  it("delegates a running stopwatch to getTimerActiveSeconds using the same `now`", () => {
    const startedAt = "2026-08-01T12:00:00.000Z";
    const now = new Date("2026-08-01T12:05:30.000Z"); // 5m30s after start
    const timer: TimerState = {
      ...defaultTimer,
      phase: "stopwatch",
      mode: "endless",
      running: true,
      startedAt,
      endsAt: null,
      remainingSeconds: 0,
      activeSegments: [{ startedAt, endedAt: null }],
    };
    expect(getDisplayRemainingSeconds(timer, now)).toBe(330);
    expect(getDisplayRemainingSeconds(timer, now)).toBe(getTimerActiveSeconds(timer, now));
  });

  it("derives stopwatch display from the supplied `now`, not the real wall clock", () => {
    // `now` here is deliberately far from the actual current time. Before getTimerActiveSeconds
    // accepted a `now` parameter, the stopwatch branch called `new Date()` internally and ignored
    // whatever instant the caller intended, which would make this assertion fail (or return a
    // huge/unrelated value tied to real elapsed wall-clock time since `startedAt`).
    const startedAt = "2020-01-01T00:00:00.000Z";
    const now = new Date("2020-01-01T00:01:30.000Z"); // exactly 90s after start
    const timer: TimerState = {
      ...defaultTimer,
      phase: "stopwatch",
      mode: "endless",
      running: true,
      startedAt,
      endsAt: null,
      remainingSeconds: 0,
      activeSegments: [{ startedAt, endedAt: null }],
    };
    expect(getDisplayRemainingSeconds(timer, now)).toBe(90);
  });
});
