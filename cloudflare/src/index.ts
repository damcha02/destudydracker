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
    isPrivate?: boolean;
  };
  stats: Array<{
    date: string;
    minutes: number;
    sessions: number;
  }>;
  feedPosts?: Array<{
    id: string;
    type: "session" | "milestone";
    subject?: string;
    detail?: string;
    note?: string;
    icon?: string;
    minutes?: number;
    presetLabel?: string;
    createdAt?: string;
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
  const isPrivate = payload.isPrivate ? 1 : 0;
  if (!userId || !deviceSecret || !friendCode) throw new Response("Missing user identity.", { status: 400, headers: corsHeaders });

  const existing = await env.DB.prepare("SELECT id, device_secret FROM users WHERE id = ?").bind(userId).first<{ id: string; device_secret: string }>();
  if (existing && existing.device_secret !== deviceSecret) throw new Response("Invalid device secret.", { status: 403, headers: corsHeaders });

  const codeOwner = await env.DB.prepare("SELECT id FROM users WHERE friend_code = ? AND id != ?").bind(friendCode, userId).first<{ id: string }>();
  if (codeOwner) throw new Response("Friend code is already in use.", { status: 409, headers: corsHeaders });

  if (existing) {
    await env.DB.prepare("UPDATE users SET friend_code = ?, display_name = ?, is_private = ?, updated_at = CURRENT_TIMESTAMP, last_seen_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(friendCode, displayName, isPrivate, userId)
      .run();
  } else {
    await env.DB.prepare("INSERT INTO users (id, device_secret, friend_code, display_name, is_private) VALUES (?, ?, ?, ?, ?)")
      .bind(userId, deviceSecret, friendCode, displayName, isPrivate)
      .run();
  }
}

function cleanText(value: unknown, max = 180) {
  return String(value ?? "").trim().slice(0, max);
}

async function upsertFeedPosts(env: Env, userId: string, posts: SyncPayload["feedPosts"]) {
  if (!Array.isArray(posts) || !posts.length) return;
  const statements = posts.slice(0, 25).map((post) => env.DB.prepare(`
    INSERT INTO feed_posts (id, user_id, type, subject, detail, note, icon, minutes, preset_label, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      subject = excluded.subject,
      detail = excluded.detail,
      note = excluded.note,
      icon = excluded.icon,
      minutes = excluded.minutes,
      preset_label = excluded.preset_label
  `).bind(
    cleanText(post.id, 80) || crypto.randomUUID(),
    userId,
    post.type === "milestone" ? "milestone" : "session",
    cleanText(post.subject, 80),
    cleanText(post.detail, 80),
    cleanText(post.note, 220),
    cleanText(post.icon, 8),
    Math.max(0, Math.round(Number(post.minutes ?? 0))),
    cleanText(post.presetLabel, 60),
    /^\d{4}-\d{2}-\d{2}T/.test(String(post.createdAt ?? "")) ? String(post.createdAt) : new Date().toISOString(),
  ));
  await env.DB.batch(statements);
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
  const clauses = [];
  const params = [...periodFilter.params];
  if (periodFilter.clause) clauses.push(periodFilter.clause.replace(/^WHERE\s+/, ""));
  if (scope === "global") clauses.push("u.is_private = 0");
  if (allowedIds.length) {
    clauses.push(`u.id IN (${allowedIds.map(() => "?").join(",")})`);
    params.push(...allowedIds);
  }
  const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = await env.DB.prepare(`
    SELECT u.id AS userId, u.display_name AS displayName, u.friend_code AS friendCode,
      COALESCE(SUM(ds.minutes), 0) AS minutes,
      COALESCE(SUM(ds.sessions), 0) AS sessions,
      MAX(ds.date) AS lastActiveDate
    FROM users u
    LEFT JOIN daily_stats ds ON ds.user_id = u.id
    ${whereClause}
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

async function getFeed(env: Env, userId: string, scope: LeaderboardScope) {
  const friendIds = scope === "friends" ? await getFriendIds(env, userId) : [];
  const allowedIds = scope === "friends" ? [userId, ...friendIds] : [];
  const clauses = scope === "global" ? ["u.is_private = 0"] : [`p.user_id IN (${allowedIds.map(() => "?").join(",") || "?"})`];
  const params = scope === "friends" ? (allowedIds.length ? allowedIds : [userId]) : [];
  const posts = await env.DB.prepare(`
    SELECT p.id, p.user_id AS userId, u.display_name AS displayName, u.friend_code AS friendCode,
      p.type, p.subject, p.detail, p.note, p.icon, p.minutes, p.preset_label AS presetLabel, p.created_at AS createdAt
    FROM feed_posts p
    JOIN users u ON u.id = p.user_id
    WHERE ${clauses.join(" AND ")}
    ORDER BY p.created_at DESC
    LIMIT 80
  `).bind(...params).all<{
    id: string;
    userId: string;
    displayName: string;
    friendCode: string;
    type: "session" | "milestone";
    subject: string;
    detail: string;
    note: string;
    icon: string;
    minutes: number;
    presetLabel: string;
    createdAt: string;
  }>();

  const ids = posts.results.map((post) => post.id);
  const reactionCounts = new Map<string, Record<string, number>>();
  const reacted = new Map<string, Record<string, boolean>>();
  if (ids.length) {
    const countRows = await env.DB.prepare(`
      SELECT post_id AS postId, emoji, COUNT(*) AS count
      FROM feed_reactions
      WHERE post_id IN (${ids.map(() => "?").join(",")})
      GROUP BY post_id, emoji
    `).bind(...ids).all<{ postId: string; emoji: string; count: number }>();
    countRows.results.forEach((row) => {
      reactionCounts.set(row.postId, { ...(reactionCounts.get(row.postId) ?? {}), [row.emoji]: Number(row.count) });
    });
    const reactedRows = await env.DB.prepare(`
      SELECT post_id AS postId, emoji
      FROM feed_reactions
      WHERE user_id = ? AND post_id IN (${ids.map(() => "?").join(",")})
    `).bind(userId, ...ids).all<{ postId: string; emoji: string }>();
    reactedRows.results.forEach((row) => {
      reacted.set(row.postId, { ...(reacted.get(row.postId) ?? {}), [row.emoji]: true });
    });
  }

  return posts.results.map((post) => ({
    ...post,
    minutes: Number(post.minutes),
    isSelf: post.userId === userId,
    reactions: { fire: 0, brain: 0, clap: 0, ...(reactionCounts.get(post.id) ?? {}) },
    reacted: reacted.get(post.id) ?? {},
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
  const cachedFeeds = {
    global: await getFeed(env, userId, "global"),
    friends: await getFeed(env, userId, "friends"),
  };

  return {
    social: {
      friends: friends.results,
      incomingFriendRequests: incoming.results,
      outgoingFriendRequests: outgoing.results,
      cachedLeaderboards,
      cachedFeeds,
    },
  };
}

async function handleSync(request: Request, env: Env) {
  const payload = await readJson<SyncPayload>(request);
  await upsertUser(env, payload.user);
  await upsertStats(env, payload.user.userId, Array.isArray(payload.stats) ? payload.stats : []);
  await upsertFeedPosts(env, payload.user.userId, payload.feedPosts);
  return json(await getSocialSnapshot(env, payload.user.userId));
}

async function handleFeed(request: Request, env: Env) {
  const url = new URL(request.url);
  const userId = String(url.searchParams.get("userId") ?? "").trim();
  const deviceSecret = String(url.searchParams.get("deviceSecret") ?? "").trim();
  const scope = url.searchParams.get("scope") === "friends" ? "friends" : "global";
  await verifyUser(env, userId, deviceSecret);
  await env.DB.prepare("UPDATE users SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?").bind(userId).run();
  return json({ feed: await getFeed(env, userId, scope) });
}

async function handleFeedReaction(request: Request, env: Env) {
  const payload = await readJson<{ userId: string; deviceSecret: string; postId: string; emoji: string }>(request);
  const userId = String(payload.userId ?? "").trim();
  await verifyUser(env, userId, String(payload.deviceSecret ?? ""));
  const postId = cleanText(payload.postId, 80);
  const emoji = ["fire", "brain", "clap"].includes(payload.emoji) ? payload.emoji : "fire";
  const existing = await env.DB.prepare("SELECT 1 FROM feed_reactions WHERE post_id = ? AND user_id = ? AND emoji = ?").bind(postId, userId, emoji).first();
  if (existing) {
    await env.DB.prepare("DELETE FROM feed_reactions WHERE post_id = ? AND user_id = ? AND emoji = ?").bind(postId, userId, emoji).run();
  } else {
    await env.DB.prepare("INSERT OR IGNORE INTO feed_reactions (post_id, user_id, emoji) VALUES (?, ?, ?)").bind(postId, userId, emoji).run();
  }
  return json({ ok: true });
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

async function handlePresence(request: Request, env: Env) {
  const payload = await readJson<{ userId: string; deviceSecret: string }>(request);
  const userId = String(payload.userId ?? "").trim();
  await verifyUser(env, userId, String(payload.deviceSecret ?? ""));
  await env.DB.prepare("UPDATE users SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?").bind(userId).run();
  return json({ ok: true });
}

async function handlePlayerStats(request: Request, env: Env) {
  const url = new URL(request.url);
  const userId = String(url.searchParams.get("userId") ?? "").trim();
  const deviceSecret = String(url.searchParams.get("deviceSecret") ?? "").trim();
  const targetUserId = String(url.searchParams.get("targetUserId") ?? "").trim();
  await verifyUser(env, userId, deviceSecret);
  if (!targetUserId) return text("Missing targetUserId.", 400);

  const targetUser = await env.DB.prepare("SELECT id, display_name AS displayName, friend_code AS friendCode, last_seen_at AS lastSeenAt FROM users WHERE id = ?")
    .bind(targetUserId).first<{ id: string; displayName: string; friendCode: string; lastSeenAt: string | null }>();
  if (!targetUser) return text("User not found.", 404);

  const [userLow, userHigh] = friendPair(userId, targetUserId);
  const areFriends = await env.DB.prepare("SELECT 1 FROM friendships WHERE user_low = ? AND user_high = ?").bind(userLow, userHigh).first();
  if (!areFriends && targetUserId !== userId) {
    const isPublic = await env.DB.prepare("SELECT is_private FROM users WHERE id = ?").bind(targetUserId).first<{ is_private: number }>();
    if (!isPublic || isPublic.is_private) return text("User is private.", 403);
  }

  async function getStats(period: LeaderboardPeriod) {
    const periodFilter = leaderboardWhere(period);
    const clauses = [`u.id = ?`];
    const params: string[] = [targetUserId, ...periodFilter.params];
    if (periodFilter.clause) clauses.push(periodFilter.clause.replace(/^WHERE\s+/, ""));
    const row = await env.DB.prepare(`
      SELECT COALESCE(SUM(ds.minutes), 0) AS minutes, COALESCE(SUM(ds.sessions), 0) AS sessions, MAX(ds.date) AS lastActiveDate
      FROM users u
      LEFT JOIN daily_stats ds ON ds.user_id = u.id
      WHERE ${clauses.join(" AND ")}
      GROUP BY u.id
    `).bind(...params).first<{ minutes: number; sessions: number; lastActiveDate: string | null }>();
    return row ?? { minutes: 0, sessions: 0, lastActiveDate: null };
  }

  return json({
    displayName: targetUser.displayName,
    friendCode: targetUser.friendCode,
    lastSeenAt: targetUser.lastSeenAt,
    daily: await getStats("daily"),
    weekly: await getStats("weekly"),
    overall: await getStats("overall"),
  });
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
      if (request.method === "GET" && url.pathname === "/feed") return handleFeed(request, env);
      if (request.method === "POST" && url.pathname === "/sync") return handleSync(request, env);
      if (request.method === "POST" && url.pathname === "/feed/react") return handleFeedReaction(request, env);
      if (request.method === "POST" && url.pathname === "/friends/request") return handleFriendRequest(request, env);
      if (request.method === "POST" && url.pathname === "/friends/respond") return handleFriendResponse(request, env);
      if (request.method === "POST" && url.pathname === "/presence") return handlePresence(request, env);
      if (request.method === "GET" && url.pathname === "/player-stats") return handlePlayerStats(request, env);
      return text("Not found.", 404);
    } catch (error: unknown) {
      if (error instanceof Response) return error;
      console.error(error);
      return text(error instanceof Error ? error.message : "Unexpected server error.", 500);
    }
  },
};
