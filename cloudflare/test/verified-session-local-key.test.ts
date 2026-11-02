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

async function commit(userId: string, deviceSecret: string, localSessionKey: string) {
  const response = await request("/verified-session/commit", { userId, deviceSecret, localSessionKey });
  expect(response.status).toBe(200);
}

const KEY = "2026-10-20T12:15:40.379Z";

describe("verified sessions reach the leaderboard only once saved", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM verified_daily_stats"),
      env.DB.prepare("DELETE FROM verified_study_sessions"),
      env.DB.prepare("DELETE FROM users"),
    ]);
  });

  it("pausing adds nothing; saving credits every piece's minutes and one session", async () => {
    await createUser("pause-user", "pause-secret", "BCDF-3301");
    await studyPiece("pause-user", "pause-secret", KEY, 60);
    await studyPiece("pause-user", "pause-secret", KEY, 40);
    await studyPiece("pause-user", "pause-secret", KEY, 20);
    expect(await totals("pause-user")).toEqual({ minutes: 0, sessions: 0 });

    await commit("pause-user", "pause-secret", KEY);
    expect(await totals("pause-user")).toEqual({ minutes: 120, sessions: 1 });
  });

  it("a repeated commit credits nothing twice", async () => {
    await createUser("dup-user", "dup-secret", "BCDF-3302");
    await studyPiece("dup-user", "dup-secret", KEY, 30);
    await commit("dup-user", "dup-secret", KEY);
    await commit("dup-user", "dup-secret", KEY);
    expect(await totals("dup-user")).toEqual({ minutes: 30, sessions: 1 });
  });

  it("a session that is never saved never counts", async () => {
    await createUser("discard-user", "discard-secret", "BCDF-3303");
    await studyPiece("discard-user", "discard-secret", KEY, 30);
    await commit("discard-user", "discard-secret", "2026-10-20T15:35:35.127Z");
    expect(await totals("discard-user")).toEqual({ minutes: 0, sessions: 0 });
  });

  it("commit finishes a still-running piece and credits it", async () => {
    await createUser("live-user", "live-secret", "BCDF-3304");
    const start = await request("/verified-session/start", { userId: "live-user", deviceSecret: "live-secret", localSessionKey: KEY });
    const { sessionId } = await start.json<{ sessionId: string }>();
    const startedAt = new Date(Date.now() - 25 * 60_000).toISOString();
    await env.DB.prepare("UPDATE verified_study_sessions SET started_at = ?, last_heartbeat_at = ? WHERE id = ?").bind(startedAt, new Date().toISOString(), sessionId).run();
    await commit("live-user", "live-secret", KEY);
    expect(await totals("live-user")).toEqual({ minutes: 25, sessions: 1 });
    const row = await env.DB.prepare("SELECT status FROM verified_study_sessions WHERE id = ?").bind(sessionId).first<{ status: string }>();
    expect(row?.status).toBe("finished");
  });

  it("keyless sessions from older clients are still credited on finish", async () => {
    await createUser("old-user", "old-secret", "BCDF-3305");
    await studyPiece("old-user", "old-secret", undefined, 20);
    expect(await totals("old-user")).toEqual({ minutes: 20, sessions: 1 });
  });
});
