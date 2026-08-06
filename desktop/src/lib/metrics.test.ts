import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calculateAggregateWorkload } from "./metrics";
import type { Task } from "../types";

function task(overrides: Partial<Task>): Task {
  return {
    id: "task",
    semesterId: "semester",
    courseId: "course",
    title: "Task",
    unitLabel: "Unit",
    totalUnits: 10,
    completedUnits: 0,
    dueDate: null,
    priority: "medium",
    notes: "",
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("calculateAggregateWorkload", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("adds each task's deadline-specific daily pace", () => {
    const workload = calculateAggregateWorkload([
      task({ id: "first", totalUnits: 10, dueDate: "2026-08-11" }),
      task({ id: "second", totalUnits: 20, dueDate: "2026-08-21" }),
    ]);

    expect(workload.unitsPerDay).toBe(2);
    expect(workload.remainingUnits).toBe(30);
    expect(workload.nearestDueDate).toBe("2026-08-11");
  });

  it("counts due-today and overdue work as today's pace", () => {
    const workload = calculateAggregateWorkload([
      task({ id: "today", totalUnits: 3, dueDate: "2026-08-01" }),
      task({ id: "overdue", totalUnits: 4, dueDate: "2026-07-31" }),
      task({ id: "future", totalUnits: 10, dueDate: "2026-08-11" }),
    ]);

    expect(workload.unitsPerDay).toBe(8);
  });

  it("excludes completed and undated units from a dated pace", () => {
    const workload = calculateAggregateWorkload([
      task({ id: "dated", totalUnits: 10, completedUnits: 2, dueDate: "2026-08-11" }),
      task({ id: "complete", totalUnits: 8, completedUnits: 8, dueDate: "2026-08-02" }),
      task({ id: "undated", totalUnits: 5 }),
    ]);

    expect(workload.unitsPerDay).toBe(0.8);
    expect(workload.undatedRemainingUnits).toBe(5);
    expect(workload.message).toContain("5 undated units are not included");
  });

  it("uses the existing fallback when no unfinished work has a due date", () => {
    const workload = calculateAggregateWorkload([task({ totalUnits: 5 })]);

    expect(workload.unitsPerDay).toBe(5);
    expect(workload.message).toContain("Add due dates");
  });
});
