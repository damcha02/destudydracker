import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

async function request(path: string, body: Record<string, unknown>) {
  return SELF.fetch(`https://test.local${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function createUser(userId: string, deviceSecret: string, friendCode: string, minutes = 0) {
  const response = await request("/sync", {
    user: {
      userId,
      deviceSecret,
      friendCode,
      displayName: userId,
      lifetimeStudyMinutes: minutes,
      lifetimeStudySessions: minutes ? 1 : 0,
    },
    stats: [],
  });
  expect(response.status).toBe(200);
}

describe("verified leaderboard sessions", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM verified_daily_stats"),
      env.DB.prepare("DELETE FROM verified_study_sessions"),
      env.DB.prepare("DELETE FROM leaderboard_daily_baselines"),
      env.DB.prepare("DELETE FROM leaderboard_baselines"),
      env.DB.prepare("DELETE FROM users"),
    ]);
  });

  it("does not let a later client sync rewrite the frozen leaderboard baseline", async () => {
    await createUser("baseline-user", "baseline-secret", "BCDF-2345", 120);
    await env.DB.prepare("INSERT INTO leaderboard_baselines (user_id, minutes, sessions) VALUES (?, ?, ?)")
      .bind("baseline-user", 120, 1).run();

    const changed = await request("/sync", {
      user: {
        userId: "baseline-user",
        deviceSecret: "baseline-secret",
        friendCode: "BCDF-2345",
        displayName: "baseline-user",
        lifetimeStudyMinutes: 999_999,
        lifetimeStudySessions: 999_999,
      },
      stats: [{ date: "2026-08-08", minutes: 1440, sessions: 200 }],
    });
    expect(changed.status).toBe(200);

    const response = await request("/leaderboard", {
      userId: "baseline-user",
      deviceSecret: "baseline-secret",
      scope: "global",
      period: "overall",
    });
    const payload = await response.json<{ entries: Array<{ userId: string; minutes: number }> }>();
    expect(payload.entries.find((entry) => entry.userId === "baseline-user")?.minutes).toBe(120);
  });

  it("credits only server-created verified session records", async () => {
    await createUser("verified-user", "verified-secret", "BCDG-2346");
    await env.DB.prepare("INSERT INTO leaderboard_baselines (user_id, minutes, sessions) VALUES (?, 0, 0)")
      .bind("verified-user").run();

    const start = await request("/verified-session/start", { userId: "verified-user", deviceSecret: "verified-secret" });
    expect(start.status).toBe(200);
    const { sessionId } = await start.json<{ sessionId: string }>();
    const now = Date.now();
    await env.DB.prepare("UPDATE verified_study_sessions SET started_at = ?, last_heartbeat_at = ? WHERE id = ?")
      .bind(new Date(now - 20 * 60_000).toISOString(), new Date(now - 5 * 60_000).toISOString(), sessionId).run();

    const finish = await request("/verified-session/finish", { userId: "verified-user", deviceSecret: "verified-secret", sessionId });
    expect(finish.status).toBe(200);
    const row = await env.DB.prepare("SELECT SUM(minutes) AS minutes FROM verified_daily_stats WHERE user_id = ?")
      .bind("verified-user").first<{ minutes: number }>();
    expect(Number(row?.minutes)).toBeGreaterThan(0);
    expect(Number(row?.minutes)).toBeLessThanOrEqual(20);
  });

  it("settles a stale active session before returning the leaderboard", async () => {
    await createUser("stale-user", "stale-secret", "BCDH-2347");
    await env.DB.prepare("INSERT INTO leaderboard_baselines (user_id, minutes, sessions) VALUES (?, 0, 0)")
      .bind("stale-user").run();

    const start = await request("/verified-session/start", { userId: "stale-user", deviceSecret: "stale-secret" });
    expect(start.status).toBe(200);
    const { sessionId } = await start.json<{ sessionId: string }>();
    const now = Date.now();
    await env.DB.prepare("UPDATE verified_study_sessions SET started_at = ?, last_heartbeat_at = ? WHERE id = ?")
      .bind(new Date(now - 120 * 60_000).toISOString(), new Date(now - 110 * 60_000).toISOString(), sessionId).run();

    const response = await request("/leaderboard", {
      userId: "stale-user",
      deviceSecret: "stale-secret",
      scope: "global",
      period: "daily",
    });
    expect(response.status).toBe(200);
    const payload = await response.json<{ entries: Array<{ userId: string; minutes: number; sessions: number }> }>();
    const self = payload.entries.find((entry) => entry.userId === "stale-user");

    expect(self?.minutes).toBeGreaterThan(0);
    expect(self?.minutes).toBeLessThanOrEqual(120);
    expect(self?.sessions).toBe(1);
    const session = await env.DB.prepare("SELECT status, credited_minutes AS creditedMinutes FROM verified_study_sessions WHERE id = ?")
      .bind(sessionId).first<{ status: string; creditedMinutes: number }>();
    expect(session?.status).toBe("finished");
    expect(Number(session?.creditedMinutes)).toBe(self?.minutes);
  });

  it("does not settle a fresh active session before returning the leaderboard", async () => {
    await createUser("fresh-user", "fresh-secret", "BCDJ-2348");
    await env.DB.prepare("INSERT INTO leaderboard_baselines (user_id, minutes, sessions) VALUES (?, 0, 0)")
      .bind("fresh-user").run();

    const start = await request("/verified-session/start", { userId: "fresh-user", deviceSecret: "fresh-secret" });
    expect(start.status).toBe(200);
    const { sessionId } = await start.json<{ sessionId: string }>();
    const now = Date.now();
    await env.DB.prepare("UPDATE verified_study_sessions SET started_at = ?, last_heartbeat_at = ? WHERE id = ?")
      .bind(new Date(now - 10 * 60_000).toISOString(), new Date(now - 5 * 60_000).toISOString(), sessionId).run();

    const response = await request("/leaderboard", {
      userId: "fresh-user",
      deviceSecret: "fresh-secret",
      scope: "global",
      period: "daily",
    });
    expect(response.status).toBe(200);

    const session = await env.DB.prepare("SELECT status, credited_minutes AS creditedMinutes FROM verified_study_sessions WHERE id = ?")
      .bind(sessionId).first<{ status: string; creditedMinutes: number }>();
    expect(session?.status).toBe("active");
    expect(Number(session?.creditedMinutes)).toBe(0);
  });

  it("settles a stale active session before returning a sync snapshot", async () => {
    await createUser("sync-stale-user", "sync-stale-secret", "BCDK-2349");
    await env.DB.prepare("INSERT INTO leaderboard_baselines (user_id, minutes, sessions) VALUES (?, 0, 0)")
      .bind("sync-stale-user").run();

    const start = await request("/verified-session/start", { userId: "sync-stale-user", deviceSecret: "sync-stale-secret" });
    expect(start.status).toBe(200);
    const { sessionId } = await start.json<{ sessionId: string }>();
    const now = Date.now();
    await env.DB.prepare("UPDATE verified_study_sessions SET started_at = ?, last_heartbeat_at = ? WHERE id = ?")
      .bind(new Date(now - 90 * 60_000).toISOString(), new Date(now - 70 * 60_000).toISOString(), sessionId).run();

    const sync = await request("/sync", {
      user: {
        userId: "sync-stale-user",
        deviceSecret: "sync-stale-secret",
        friendCode: "BCDK-2349",
        displayName: "sync-stale-user",
        lifetimeStudyMinutes: 90,
        lifetimeStudySessions: 1,
      },
      stats: [],
    });
    expect(sync.status).toBe(200);
    const payload = await sync.json<{ social: { cachedLeaderboards: { global: { daily: Array<{ userId: string; minutes: number }> } } } }>();
    const self = payload.social.cachedLeaderboards.global.daily.find((entry) => entry.userId === "sync-stale-user");

    expect(self?.minutes).toBeGreaterThan(0);
    const session = await env.DB.prepare("SELECT status FROM verified_study_sessions WHERE id = ?")
      .bind(sessionId).first<{ status: string }>();
    expect(session?.status).toBe("finished");
  });
});
