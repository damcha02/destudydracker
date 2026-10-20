import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

async function request(path: string, body: Record<string, unknown>) {
  return SELF.fetch(`https://test.local${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function createUser(userId: string, deviceSecret: string, friendCode: string) {
  const response = await request("/sync", {
    user: { userId, deviceSecret, friendCode, displayName: userId, lifetimeStudyMinutes: 0, lifetimeStudySessions: 0 },
    stats: [],
  });
  expect(response.status).toBe(200);
}

/** Starts a verified session backdated by `minutesAgo`, then finishes it (credited up to now, within the normal grace window). */
async function studyPiece(userId: string, deviceSecret: string, localSessionKey: string | undefined, minutesAgo: number) {
  const start = await request("/verified-session/start", { userId, deviceSecret, ...(localSessionKey ? { localSessionKey } : {}) });
  expect(start.status).toBe(200);
  const { sessionId } = await start.json<{ sessionId: string }>();
  const startedAt = new Date(Date.now() - minutesAgo * 60_000).toISOString();
  const heartbeatAt = new Date(Date.now() - (minutesAgo - 10) * 60_000).toISOString();
  await env.DB.prepare("UPDATE verified_study_sessions SET started_at = ?, last_heartbeat_at = ? WHERE id = ?").bind(startedAt, heartbeatAt, sessionId).run();
  const finish = await request("/verified-session/finish", { userId, deviceSecret, sessionId });
  expect(finish.status).toBe(200);
}

async function totals(userId: string) {
  const row = await env.DB.prepare("SELECT SUM(minutes) AS minutes, SUM(sessions) AS sessions FROM verified_daily_stats WHERE user_id = ?")
    .bind(userId).first<{ minutes: number | null; sessions: number | null }>();
  return { minutes: Number(row?.minutes ?? 0), sessions: Number(row?.sessions ?? 0) };
}

describe("verified sessions split from one local session", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM verified_daily_stats"),
      env.DB.prepare("DELETE FROM verified_study_sessions"),
      env.DB.prepare("DELETE FROM users"),
    ]);
  });

  it("counts one session however many verified sessions share a local key", async () => {
    await createUser("split-user", "split-secret", "BCDF-3301");
    await studyPiece("split-user", "split-secret", "2026-10-20T12:15:40.379Z", 60);
    await studyPiece("split-user", "split-secret", "2026-10-20T12:15:40.379Z", 40);
    await studyPiece("split-user", "split-secret", "2026-10-20T12:15:40.379Z", 20);
    expect(await totals("split-user")).toEqual({ minutes: 120, sessions: 1 });
  });

  it("still counts a new local session, and keyless starts as before", async () => {
    await createUser("two-user", "two-secret", "BCDF-3302");
    await studyPiece("two-user", "two-secret", "2026-10-20T12:15:40.379Z", 60);
    await studyPiece("two-user", "two-secret", "2026-10-20T15:35:35.127Z", 40);
    await studyPiece("two-user", "two-secret", undefined, 20);
    expect(await totals("two-user")).toEqual({ minutes: 120, sessions: 3 });
  });
});
