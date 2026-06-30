export interface Env {
  DB: D1Database;
}

type LeaderboardPeriod = "daily" | "weekly" | "overall";
type LeaderboardScope = "global" | "friends";

interface SyncPayload {
  user: {
    userId: string;
    deviceSecret: string;
    friendCode: string;
    displayName: string;
  };
  stats: Array<{
    date: string;
    minutes: number;
    sessions: number;
  }>;
}

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function text(message: string, status = 400) {
  return new Response(message, { status, headers: corsHeaders });
}

async function readJson<T>(request: Request): Promise<T> {
  return request.json() as Promise<T>;
}

function cleanCode(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

function cleanName(value: unknown) {
  const name = String(value ?? "").trim().slice(0, 48);
  return name || "Student";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function weekStartIso() {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return date.toISOString().slice(0, 10);
}

function friendPair(a: string, b: string) {
  return a < b ? [a, b] : [b, a];
}

async function verifyUser(env: Env, userId: string, deviceSecret: string) {
  const user = await env.DB.prepare("SELECT id, device_secret FROM users WHERE id = ?").bind(userId).first<{ id: string; device_secret: string }>();
  if (!user) throw new Response("User has not synced a profile yet.", { status: 404, headers: corsHeaders });
  if (user.device_secret !== deviceSecret) throw new Response("Invalid device secret.", { status: 403, headers: corsHeaders });
}

async function upsertUser(env: Env, payload: SyncPayload["user"]) {
  const userId = String(payload.userId ?? "").trim();
  const deviceSecret = String(payload.deviceSecret ?? "").trim();
  const friendCode = cleanCode(payload.friendCode);
  const displayName = cleanName(payload.displayName);
  if (!userId || !deviceSecret || !friendCode) throw new Response("Missing user identity.", { status: 400, headers: corsHeaders });

  const existing = await env.DB.prepare("SELECT id, device_secret FROM users WHERE id = ?").bind(userId).first<{ id: string; device_secret: string }>();
  if (existing && existing.device_secret !== deviceSecret) throw new Response("Invalid device secret.", { status: 403, headers: corsHeaders });

  const codeOwner = await env.DB.prepare("SELECT id FROM users WHERE friend_code = ? AND id != ?").bind(friendCode, userId).first<{ id: string }>();
  if (codeOwner) throw new Response("Friend code is already in use.", { status: 409, headers: corsHeaders });

  if (existing) {
    await env.DB.prepare("UPDATE users SET friend_code = ?, display_name = ?, updated_at = CURRENT_TIMESTAMP, last_seen_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(friendCode, displayName, userId)
      .run();
  } else {
    await env.DB.prepare("INSERT INTO users (id, device_secret, friend_code, display_name) VALUES (?, ?, ?, ?)")
      .bind(userId, deviceSecret, friendCode, displayName)
      .run();
  }
}

async function upsertStats(env: Env, userId: string, stats: SyncPayload["stats"]) {
  const statements = stats
    .filter((stat) => /^\d{4}-\d{2}-\d{2}$/.test(stat.date))
    .map((stat) => env.DB.prepare(
      "INSERT INTO daily_stats (user_id, date, minutes, sessions, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id, date) DO UPDATE SET minutes = excluded.minutes, sessions = excluded.sessions, updated_at = CURRENT_TIMESTAMP",
    ).bind(userId, stat.date, Math.max(0, Math.round(stat.minutes)), Math.max(0, Math.round(stat.sessions))));

  if (statements.length) await env.DB.batch(statements);
}

async function getFriendIds(env: Env, userId: string) {
  const rows = await env.DB.prepare("SELECT CASE WHEN user_low = ? THEN user_high ELSE user_low END AS id FROM friendships WHERE user_low = ? OR user_high = ?")
    .bind(userId, userId, userId)
    .all<{ id: string }>();
  return rows.results.map((row) => row.id);
}

function leaderboardWhere(period: LeaderboardPeriod) {
  if (period === "daily") return { clause: "WHERE ds.date = ?", params: [todayIso()] };
  if (period === "weekly") return { clause: "WHERE ds.date >= ?", params: [weekStartIso()] };
  return { clause: "", params: [] };
}

async function getLeaderboard(env: Env, userId: string, scope: LeaderboardScope, period: LeaderboardPeriod) {
  const friendIds = scope === "friends" ? await getFriendIds(env, userId) : [];
  const allowedIds = scope === "friends" ? [userId, ...friendIds] : [];
  const periodFilter = leaderboardWhere(period);
  const idFilter = allowedIds.length ? `AND u.id IN (${allowedIds.map(() => "?").join(",")})` : "";
  const params = [...periodFilter.params, ...allowedIds];
  const rows = await env.DB.prepare(`
    SELECT u.id AS userId, u.display_name AS displayName, u.friend_code AS friendCode,
      COALESCE(SUM(ds.minutes), 0) AS minutes,
      COALESCE(SUM(ds.sessions), 0) AS sessions,
      MAX(ds.date) AS lastActiveDate
    FROM users u
    LEFT JOIN daily_stats ds ON ds.user_id = u.id
    ${periodFilter.clause}
    ${idFilter}
    GROUP BY u.id, u.display_name, u.friend_code
    ORDER BY minutes DESC, displayName ASC
    LIMIT 50
  `).bind(...params).all<{
    userId: string;
    displayName: string;
    friendCode: string;
    minutes: number;
    sessions: number;
    lastActiveDate: string | null;
  }>();

  return rows.results.map((row, index) => ({
    ...row,
    minutes: Number(row.minutes),
    sessions: Number(row.sessions),
    rank: index + 1,
    isSelf: row.userId === userId,
  }));
}

async function getSocialSnapshot(env: Env, userId: string) {
  const friends = await env.DB.prepare(`
    SELECT u.id AS userId, u.display_name AS displayName, u.friend_code AS friendCode, f.created_at AS friendsSince, u.last_seen_at AS lastSeenAt
    FROM friendships f
    JOIN users u ON u.id = CASE WHEN f.user_low = ? THEN f.user_high ELSE f.user_low END
    WHERE f.user_low = ? OR f.user_high = ?
    ORDER BY u.display_name ASC
  `).bind(userId, userId, userId).all();

  const incoming = await env.DB.prepare(`
    SELECT r.id, r.from_user_id AS fromUserId, r.to_user_id AS toUserId,
      from_u.display_name AS fromDisplayName, to_u.display_name AS toDisplayName,
      from_u.friend_code AS fromFriendCode, to_u.friend_code AS toFriendCode,
      r.status, r.created_at AS createdAt
    FROM friend_requests r
    JOIN users from_u ON from_u.id = r.from_user_id
    JOIN users to_u ON to_u.id = r.to_user_id
    WHERE r.to_user_id = ? AND r.status = 'pending'
    ORDER BY r.created_at DESC
  `).bind(userId).all();

  const outgoing = await env.DB.prepare(`
    SELECT r.id, r.from_user_id AS fromUserId, r.to_user_id AS toUserId,
      from_u.display_name AS fromDisplayName, to_u.display_name AS toDisplayName,
      from_u.friend_code AS fromFriendCode, to_u.friend_code AS toFriendCode,
      r.status, r.created_at AS createdAt
    FROM friend_requests r
    JOIN users from_u ON from_u.id = r.from_user_id
    JOIN users to_u ON to_u.id = r.to_user_id
    WHERE r.from_user_id = ? AND r.status = 'pending'
    ORDER BY r.created_at DESC
  `).bind(userId).all();

  const cachedLeaderboards = {
    global: {
      daily: await getLeaderboard(env, userId, "global", "daily"),
      weekly: await getLeaderboard(env, userId, "global", "weekly"),
      overall: await getLeaderboard(env, userId, "global", "overall"),
    },
    friends: {
      daily: await getLeaderboard(env, userId, "friends", "daily"),
      weekly: await getLeaderboard(env, userId, "friends", "weekly"),
      overall: await getLeaderboard(env, userId, "friends", "overall"),
    },
  };

  return {
    social: {
      friends: friends.results,
      incomingFriendRequests: incoming.results,
      outgoingFriendRequests: outgoing.results,
      cachedLeaderboards,
    },
  };
}

async function handleSync(request: Request, env: Env) {
  const payload = await readJson<SyncPayload>(request);
  await upsertUser(env, payload.user);
  await upsertStats(env, payload.user.userId, Array.isArray(payload.stats) ? payload.stats : []);
  return json(await getSocialSnapshot(env, payload.user.userId));
}

async function handleFriendRequest(request: Request, env: Env) {
  const payload = await readJson<{ userId: string; deviceSecret: string; friendCode: string }>(request);
  const fromUserId = String(payload.userId ?? "").trim();
  await verifyUser(env, fromUserId, String(payload.deviceSecret ?? ""));

  const target = await env.DB.prepare("SELECT id FROM users WHERE friend_code = ?").bind(cleanCode(payload.friendCode)).first<{ id: string }>();
  if (!target) return text("No user with that friend code exists.", 404);
  if (target.id === fromUserId) return text("You cannot add yourself.", 400);

  const [userLow, userHigh] = friendPair(fromUserId, target.id);
  const existingFriendship = await env.DB.prepare("SELECT 1 FROM friendships WHERE user_low = ? AND user_high = ?").bind(userLow, userHigh).first();
  if (existingFriendship) return text("You are already friends.", 409);

  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO friend_requests (id, from_user_id, to_user_id, status) VALUES (?, ?, ?, 'pending') ON CONFLICT(from_user_id, to_user_id) DO UPDATE SET status = 'pending', responded_at = NULL")
    .bind(id, fromUserId, target.id)
    .run();
  return json(await getSocialSnapshot(env, fromUserId));
}

async function handleFriendResponse(request: Request, env: Env) {
  const payload = await readJson<{ userId: string; deviceSecret: string; requestId: string; response: "accepted" | "declined" }>(request);
  const userId = String(payload.userId ?? "").trim();
  await verifyUser(env, userId, String(payload.deviceSecret ?? ""));

  const friendRequest = await env.DB.prepare("SELECT id, from_user_id, to_user_id FROM friend_requests WHERE id = ? AND to_user_id = ? AND status = 'pending'")
    .bind(String(payload.requestId ?? ""), userId)
    .first<{ id: string; from_user_id: string; to_user_id: string }>();
  if (!friendRequest) return text("Friend request not found.", 404);

  const response = payload.response === "accepted" ? "accepted" : "declined";
  await env.DB.prepare("UPDATE friend_requests SET status = ?, responded_at = CURRENT_TIMESTAMP WHERE id = ?").bind(response, friendRequest.id).run();

  if (response === "accepted") {
    const [userLow, userHigh] = friendPair(friendRequest.from_user_id, friendRequest.to_user_id);
    await env.DB.prepare("INSERT OR IGNORE INTO friendships (user_low, user_high) VALUES (?, ?)").bind(userLow, userHigh).run();
  }

  return json(await getSocialSnapshot(env, userId));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    try {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/health") return json({ ok: true });
      if (request.method === "POST" && url.pathname === "/sync") return handleSync(request, env);
      if (request.method === "POST" && url.pathname === "/friends/request") return handleFriendRequest(request, env);
      if (request.method === "POST" && url.pathname === "/friends/respond") return handleFriendResponse(request, env);
      return text("Not found.", 404);
    } catch (error: unknown) {
      if (error instanceof Response) return error;
      console.error(error);
      return text(error instanceof Error ? error.message : "Unexpected server error.", 500);
    }
  },
};
