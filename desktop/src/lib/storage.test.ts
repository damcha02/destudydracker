import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultState, defaultTimer, saveAppState } from "./storage";
import type { AppState } from "../types";

const STORAGE_KEY = "study-tracker-desktop-v2"; // mirrors storage.ts's STORAGE_KEY

function createMemoryLocalStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key, value) => { map.set(key, value); },
    removeItem: (key) => { map.delete(key); },
    clear: () => map.clear(),
    key: (index) => [...map.keys()][index] ?? null,
    get length() { return map.size; },
  } as Storage;
}

describe("saveAppState remainingSeconds freshness", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createMemoryLocalStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("persists a freshly-derived remainingSeconds for a running countdown, not the stale in-memory value", () => {
    const startedAt = "2026-08-01T12:00:00.000Z";
    const endsAt = "2026-08-01T12:25:00.000Z"; // 25 min countdown

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T12:10:00.000Z")); // 10 minutes in, no transition since start

    const state: AppState = {
      ...defaultState,
      timer: {
        ...defaultTimer,
        phase: "study",
        running: true,
        startedAt,
        endsAt,
        remainingSeconds: 25 * 60, // stale: unchanged since start
        activeSegments: [{ startedAt, endedAt: null }],
      },
    };

    saveAppState(state);

    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) as string) as AppState;
    expect(persisted.timer.remainingSeconds).toBe(15 * 60);
  });

  it("persists freshly-derived elapsed seconds for a running endless timer", () => {
    const startedAt = "2026-08-01T12:00:00.000Z";

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T12:05:00.000Z"));

    const state: AppState = {
      ...defaultState,
      timer: {
        ...defaultTimer,
        mode: "endless",
        phase: "stopwatch",
        running: true,
        startedAt,
        endsAt: null,
        remainingSeconds: 0,
        activeSegments: [{ startedAt, endedAt: null }],
      },
    };

    saveAppState(state);

    const persisted = JSON.parse(
      localStorage.getItem(STORAGE_KEY) as string,
    ) as AppState;

    expect(persisted.timer.remainingSeconds).toBe(300);
  });

  it("leaves remainingSeconds untouched when the timer is not running", () => {
    const state: AppState = { ...defaultState, timer: { ...defaultTimer, running: false, remainingSeconds: 742 } };
    saveAppState(state);
    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) as string) as AppState;
    expect(persisted.timer.remainingSeconds).toBe(742);
  });
});
