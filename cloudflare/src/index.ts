export interface Env {
  DB: D1Database;
  FEED_IMAGES: R2Bucket;
  R2_ALERT_WEBHOOK_URL?: string;
}

type LeaderboardPeriod = "daily" | "weekly" | "overall";
type LeaderboardScope = "global" | "friends";
type SocialAvatarStyle = "classic" | "serif" | "cursive" | "graffiti" | "pixel" | "mono";
type SocialAvatar =
  | { kind: "letter"; letter: string; style: SocialAvatarStyle }
  | { kind: "icon"; icon: string };

interface SyncPayload {
  user: {
    userId: string;
    deviceSecret: string;
    friendCode: string;
    displayName: string;
    avatar?: unknown;
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

const MAX_JSON_BODY_BYTES = 256 * 1024;
const MAX_SYNC_STAT_ROWS = 370;
const MAX_DAILY_MINUTES = 24 * 60;
const MAX_DAILY_SESSIONS = 200;
const MAX_ID_LENGTH = 80;
const MAX_SECRET_LENGTH = 120;
const MAX_COMMENT_LENGTH = 220;
const MAX_FEED_IMAGE_BYTES = 5 * 1024 * 1024;
const FEED_IMAGE_TTL_MS = 5 * 24 * 60 * 60 * 1000;
const R2_STORAGE_WARNING_BYTES = 400 * 1024 * 1024;
const R2_STORAGE_HARD_BYTES = 500 * 1024 * 1024;
const R2_CLASS_A_WARNING_MONTHLY = 40_000;
const R2_CLASS_A_HARD_MONTHLY = 50_000;
const R2_CLASS_B_WARNING_MONTHLY = 200_000;
const R2_CLASS_B_HARD_MONTHLY = 250_000;
const R2_OWNER_FRIEND_CODE = "ZRWL-WKNF";
const avatarStyles = new Set<SocialAvatarStyle>(["classic", "serif", "cursive", "graffiti", "pixel", "mono"]);
const avatarIcons = new Set(["✦", "★", "◆", "☘", "☾", "☀", "♜", "♞", "⚡", "☕", "📚", "🧠", "🔥", "🌊", "🌿", "🪐"]);
const feedImageTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

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
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_JSON_BODY_BYTES) {
    throw new Response("Request body is too large.", { status: 413, headers: corsHeaders });
  }
  return request.json() as Promise<T>;
}

async function readParamsOrJson<T extends Record<string, unknown>>(request: Request): Promise<T> {
  if (request.method === "GET") {
    return Object.fromEntries(new URL(request.url).searchParams.entries()) as T;
  }
  return readJson<T>(request);
}

function requiredText(value: unknown, label: string, maxLength: number) {
  const text = String(value ?? "").trim();
  if (!text) throw new Response(`Missing ${label}.`, { status: 400, headers: corsHeaders });
  if (text.length > maxLength) throw new Response(`${label} is too long.`, { status: 400, headers: corsHeaders });
  return text;
}

function cleanUserId(value: unknown) {
  return requiredText(value, "userId", MAX_ID_LENGTH);
}

function cleanDeviceSecret(value: unknown) {
  return requiredText(value, "deviceSecret", MAX_SECRET_LENGTH);
}

function cleanCode(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

function cleanName(value: unknown) {
  const name = String(value ?? "").trim().slice(0, 48);
  return name || "Student";
}

function firstAvatarLetter(name: string) {
  return (name.trim()[0] || "S").toUpperCase();
}

function cleanAvatar(value: unknown, displayName: string): SocialAvatar {
  if (!value || typeof value !== "object") return { kind: "letter", letter: firstAvatarLetter(displayName), style: "classic" };
  const record = value as Record<string, unknown>;
  if (record.kind === "icon" && typeof record.icon === "string" && avatarIcons.has(record.icon)) {
    return { kind: "icon", icon: record.icon };
  }
  if (record.kind === "letter") {
    const letter = typeof record.letter === "string" && /^[A-Z]$/i.test(record.letter) ? record.letter.toUpperCase() : firstAvatarLetter(displayName);
    const style = typeof record.style === "string" && avatarStyles.has(record.style as SocialAvatarStyle) ? record.style as SocialAvatarStyle : "classic";
    return { kind: "letter", letter, style };
  }
  return { kind: "letter", letter: firstAvatarLetter(displayName), style: "classic" };
}

function parseAvatar(value: unknown, displayName: string): SocialAvatar {
  if (typeof value !== "string") return cleanAvatar(null, displayName);
  try {
    return cleanAvatar(JSON.parse(value), displayName);
  } catch {
    return cleanAvatar(null, displayName);
  }
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
  userId = cleanUserId(userId);
  deviceSecret = cleanDeviceSecret(deviceSecret);
  const user = await env.DB.prepare("SELECT id, device_secret, friend_code AS friendCode FROM users WHERE id = ?").bind(userId).first<{ id: string; device_secret: string; friendCode: string }>();
  if (!user) throw new Response("User has not synced a profile yet.", { status: 404, headers: corsHeaders });
  if (user.device_secret !== deviceSecret) throw new Response("Invalid device secret.", { status: 403, headers: corsHeaders });
  return user;
}

async function upsertUser(env: Env, payload: SyncPayload["user"]) {
  const userId = cleanUserId(payload.userId);
  const deviceSecret = cleanDeviceSecret(payload.deviceSecret);
  const friendCode = cleanCode(payload.friendCode);
  const displayName = cleanName(payload.displayName);
  const avatar = JSON.stringify(cleanAvatar(payload.avatar, displayName));
  const isPrivate = payload.isPrivate ? 1 : 0;
  if (!userId || !deviceSecret || !friendCode) throw new Response("Missing user identity.", { status: 400, headers: corsHeaders });

  const existing = await env.DB.prepare("SELECT id, device_secret FROM users WHERE id = ?").bind(userId).first<{ id: string; device_secret: string }>();
  if (existing && existing.device_secret !== deviceSecret) throw new Response("Invalid device secret.", { status: 403, headers: corsHeaders });

  const codeOwner = await env.DB.prepare("SELECT id FROM users WHERE friend_code = ? AND id != ?").bind(friendCode, userId).first<{ id: string }>();
  if (codeOwner) throw new Response("Friend code is already in use.", { status: 409, headers: corsHeaders });

  if (existing) {
    await env.DB.prepare("UPDATE users SET friend_code = ?, display_name = ?, avatar_json = ?, is_private = ?, updated_at = CURRENT_TIMESTAMP, last_seen_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(friendCode, displayName, avatar, isPrivate, userId)
      .run();
  } else {
    await env.DB.prepare("INSERT INTO users (id, device_secret, friend_code, display_name, avatar_json, is_private) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(userId, deviceSecret, friendCode, displayName, avatar, isPrivate)
      .run();
  }
}

function cleanText(value: unknown, max = 180) {
  return String(value ?? "").trim().slice(0, max);
}

function feedImageUrl(request: Request, key: string | null) {
  if (!key) return null;
  return `${new URL(request.url).origin}/feed/image/${encodeURIComponent(key)}`;
}

function imageExpiresAt(now = new Date()) {
  return new Date(now.getTime() + FEED_IMAGE_TTL_MS).toISOString();
}

function usageMonth(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

async function getR2Usage(env: Env, month = usageMonth()) {
  const [usage, storage] = await Promise.all([
    env.DB.prepare("SELECT class_a_ops AS classAOps, class_b_ops AS classBOps FROM r2_usage_monthly WHERE month = ?")
      .bind(month)
      .first<{ classAOps: number; classBOps: number }>(),
    env.DB.prepare("SELECT COALESCE(SUM(image_size_bytes), 0) AS storageBytes FROM feed_posts WHERE image_key IS NOT NULL")
      .first<{ storageBytes: number }>(),
  ]);
  const storageBytes = Number(storage?.storageBytes ?? 0);
  const classAOps = Number(usage?.classAOps ?? 0);
  const classBOps = Number(usage?.classBOps ?? 0);
  return {
    month,
    storageBytes,
    classAOps,
    classBOps,
    warning: storageBytes >= R2_STORAGE_WARNING_BYTES || classAOps >= R2_CLASS_A_WARNING_MONTHLY || classBOps >= R2_CLASS_B_WARNING_MONTHLY,
    paused: storageBytes >= R2_STORAGE_HARD_BYTES || classAOps >= R2_CLASS_A_HARD_MONTHLY || classBOps >= R2_CLASS_B_HARD_MONTHLY,
    limits: {
      storageWarningBytes: R2_STORAGE_WARNING_BYTES,
      storageHardBytes: R2_STORAGE_HARD_BYTES,
      classAWarningMonthly: R2_CLASS_A_WARNING_MONTHLY,
      classAHardMonthly: R2_CLASS_A_HARD_MONTHLY,
      classBWarningMonthly: R2_CLASS_B_WARNING_MONTHLY,
      classBHardMonthly: R2_CLASS_B_HARD_MONTHLY,
    },
  };
}

async function incrementR2Usage(env: Env, values: { classA?: number; classB?: number }) {
  const month = usageMonth();
  await env.DB.prepare(`
    INSERT INTO r2_usage_monthly (month, class_a_ops, class_b_ops, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(month) DO UPDATE SET
      class_a_ops = class_a_ops + excluded.class_a_ops,
      class_b_ops = class_b_ops + excluded.class_b_ops,
      updated_at = CURRENT_TIMESTAMP
  `).bind(month, values.classA ?? 0, values.classB ?? 0).run();
}

function r2AlertLevel(usage: Awaited<ReturnType<typeof getR2Usage>>) {
  return usage.paused ? "paused" : usage.warning ? "warning" : "ok";
}

function formatUsageBytes(bytes: number) {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

async function maybeNotifyR2Usage(env: Env, currentUsage?: Awaited<ReturnType<typeof getR2Usage>>) {
  if (!env.R2_ALERT_WEBHOOK_URL) return;
  const usage = currentUsage ?? await getR2Usage(env);
  const level = r2AlertLevel(usage);
  const existing = await env.DB.prepare("SELECT level FROM r2_alert_state WHERE id = 'global'").first<{ level: string }>();
  if ((existing?.level ?? "ok") === level) return;

  await env.DB.prepare(`
    INSERT INTO r2_alert_state (id, level, notified_at, updated_at)
    VALUES ('global', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET level = excluded.level, notified_at = excluded.notified_at, updated_at = CURRENT_TIMESTAMP
  `).bind(level).run();

  if (level === "ok") return;
  const title = level === "paused" ? "Study Tracker R2 paused" : "Study Tracker R2 warning";
  const body = `${title}: storage ${formatUsageBytes(usage.storageBytes)} / ${formatUsageBytes(usage.limits.storageHardBytes)}, writes ${usage.classAOps} / ${usage.limits.classAHardMonthly}, reads ${usage.classBOps} / ${usage.limits.classBHardMonthly}.`;
  await fetch(env.R2_ALERT_WEBHOOK_URL, {
    method: "POST",
    headers: {
      title,
      priority: level === "paused" ? "urgent" : "high",
      tags: level === "paused" ? "warning" : "eyes",
    },
    body,
  }).catch(() => undefined);
}

async function ownerR2Usage(env: Env, friendCode: string) {
  if (friendCode !== R2_OWNER_FRIEND_CODE) return undefined;
  return getR2Usage(env);
}

async function assertR2ClassABudget(env: Env, additionalOps: number) {
  const usage = await getR2Usage(env);
  await maybeNotifyR2Usage(env, usage);
  if (usage.classAOps + additionalOps > R2_CLASS_A_HARD_MONTHLY) {
    throw new Response("Image uploads are paused to keep R2 usage below the free tier.", { status: 429, headers: corsHeaders });
  }
  return usage;
}

async function assertR2ClassBBudget(env: Env) {
  const usage = await getR2Usage(env);
  await maybeNotifyR2Usage(env, usage);
  if (usage.classBOps + 1 > R2_CLASS_B_HARD_MONTHLY) {
    throw new Response("Image loading is paused to keep R2 usage below the free tier.", { status: 429, headers: corsHeaders });
  }
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
    Math.min(MAX_DAILY_MINUTES, Math.max(0, Math.round(Number(post.minutes ?? 0)))),
    cleanText(post.presetLabel, 60),
    /^\d{4}-\d{2}-\d{2}T/.test(String(post.createdAt ?? "")) ? String(post.createdAt) : new Date().toISOString(),
  ));
  await env.DB.batch(statements);
}

async function upsertStats(env: Env, userId: string, stats: SyncPayload["stats"]) {
  const statements = stats
    .slice(0, MAX_SYNC_STAT_ROWS)
    .filter((stat) => /^\d{4}-\d{2}-\d{2}$/.test(stat.date))
    .map((stat) => env.DB.prepare(
      "INSERT INTO daily_stats (user_id, date, minutes, sessions, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id, date) DO UPDATE SET minutes = excluded.minutes, sessions = excluded.sessions, updated_at = CURRENT_TIMESTAMP",
    ).bind(
      userId,
      stat.date,
      Math.min(MAX_DAILY_MINUTES, Math.max(0, Math.round(Number(stat.minutes ?? 0)))),
      Math.min(MAX_DAILY_SESSIONS, Math.max(0, Math.round(Number(stat.sessions ?? 0)))),
    ));

  if (statements.length) await env.DB.batch(statements);
}

async function getFriendIds(env: Env, userId: string) {
  const rows = await env.DB.prepare("SELECT CASE WHEN user_low = ? THEN user_high ELSE user_low END AS id FROM friendships WHERE user_low = ? OR user_high = ?")
    .bind(userId, userId, userId)
    .all<{ id: string }>();
  return rows.results.map((row) => row.id);
}

async function canViewFeedPost(env: Env, userId: string, postId: string) {
  const post = await env.DB.prepare(`
    SELECT p.user_id AS userId, u.is_private AS isPrivate
    FROM feed_posts p
    JOIN users u ON u.id = p.user_id
    WHERE p.id = ?
  `).bind(postId).first<{ userId: string; isPrivate: number }>();
  if (!post) return { allowed: false, missing: true };
  if (post.userId === userId || !post.isPrivate) return { allowed: true, missing: false };

  const [userLow, userHigh] = friendPair(userId, post.userId);
  const friendship = await env.DB.prepare("SELECT 1 FROM friendships WHERE user_low = ? AND user_high = ?")
    .bind(userLow, userHigh)
    .first();
  return { allowed: Boolean(friendship), missing: false };
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
    SELECT u.id AS userId, u.display_name AS displayName, u.friend_code AS friendCode, u.avatar_json AS avatarJson,
      COALESCE(SUM(ds.minutes), 0) AS minutes,
      COALESCE(SUM(ds.sessions), 0) AS sessions,
      MAX(ds.date) AS lastActiveDate
    FROM users u
    LEFT JOIN daily_stats ds ON ds.user_id = u.id
    ${whereClause}
    GROUP BY u.id, u.display_name, u.friend_code, u.avatar_json
    ORDER BY minutes DESC, displayName ASC
    LIMIT 50
  `).bind(...params).all<{
    userId: string;
    displayName: string;
    friendCode: string;
    avatarJson: string;
    minutes: number;
    sessions: number;
    lastActiveDate: string | null;
  }>();

  return rows.results.map((row, index) => ({
    ...row,
    avatar: parseAvatar(row.avatarJson, row.displayName),
    avatarJson: undefined,
    minutes: Number(row.minutes),
    sessions: Number(row.sessions),
    rank: index + 1,
    isSelf: row.userId === userId,
  }));
}

async function getFeed(request: Request, env: Env, userId: string, scope: LeaderboardScope) {
  const friendIds = scope === "friends" ? await getFriendIds(env, userId) : [];
  const viewerFriendIds = scope === "friends" ? friendIds : await getFriendIds(env, userId);
  const visibleReactorIds = new Set([userId, ...viewerFriendIds]);
  const visibleCommenterIds = visibleReactorIds;
  const allowedIds = scope === "friends" ? [userId, ...friendIds] : [];
  const clauses = scope === "global" ? ["u.is_private = 0"] : [`p.user_id IN (${allowedIds.map(() => "?").join(",") || "?"})`];
  const params = scope === "friends" ? (allowedIds.length ? allowedIds : [userId]) : [];
  const posts = await env.DB.prepare(`
    SELECT p.id, p.user_id AS userId, u.display_name AS displayName, u.friend_code AS friendCode, u.avatar_json AS avatarJson,
      p.type, p.subject, p.detail, p.note, p.icon, p.minutes, p.preset_label AS presetLabel, p.created_at AS createdAt,
      p.image_key AS imageKey, p.image_mime_type AS imageMimeType, p.image_expires_at AS imageExpiresAt, p.image_expired_at AS imageExpiredAt
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
    avatarJson: string;
    type: "session" | "milestone";
    subject: string;
    detail: string;
    note: string;
    icon: string;
    minutes: number;
    presetLabel: string;
    createdAt: string;
    imageKey: string | null;
    imageMimeType: string | null;
    imageExpiresAt: string | null;
    imageExpiredAt: string | null;
  }>();

  const ids = posts.results.map((post) => post.id);
  const reactionCounts = new Map<string, Record<string, number>>();
  const reacted = new Map<string, Record<string, boolean>>();
  const reactedBy = new Map<string, Record<string, string[]>>();
  const comments = new Map<string, Array<{
    id: string;
    postId: string;
    userId: string;
    displayName: string;
    friendCode: string;
    avatar: SocialAvatar;
    body: string;
    createdAt: string;
    isSelf: boolean;
  }>>();
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
    const namesRows = await env.DB.prepare(`
      SELECT r.post_id AS postId, r.user_id AS userId, r.emoji, u.display_name AS displayName, u.is_private AS isPrivate
      FROM feed_reactions r
      JOIN users u ON u.id = r.user_id
      WHERE r.post_id IN (${ids.map(() => "?").join(",")})
      ORDER BY r.post_id, r.emoji, u.display_name
    `).bind(...ids).all<{ postId: string; userId: string; emoji: string; displayName: string; isPrivate: number }>();
    namesRows.results.forEach((row) => {
      if (row.isPrivate && !visibleReactorIds.has(row.userId)) return;
      const existing = reactedBy.get(row.postId) ?? {};
      const names = existing[row.emoji] ?? [];
      names.push(row.displayName);
      existing[row.emoji] = names;
      reactedBy.set(row.postId, existing);
    });

    const commentRows = await env.DB.prepare(`
      SELECT c.id, c.post_id AS postId, c.user_id AS userId, u.display_name AS displayName, u.friend_code AS friendCode,
        u.avatar_json AS avatarJson, u.is_private AS isPrivate, c.body, c.created_at AS createdAt
      FROM feed_comments c
      JOIN users u ON u.id = c.user_id
      WHERE c.post_id IN (${ids.map(() => "?").join(",")})
      ORDER BY c.created_at ASC
    `).bind(...ids).all<{ id: string; postId: string; userId: string; displayName: string; friendCode: string; avatarJson: string; isPrivate: number; body: string; createdAt: string }>();
    commentRows.results.forEach((row) => {
      if (row.isPrivate && !visibleCommenterIds.has(row.userId)) return;
      const existing = comments.get(row.postId) ?? [];
      existing.push({
        id: row.id,
        postId: row.postId,
        userId: row.userId,
        displayName: row.displayName,
        friendCode: row.friendCode,
        avatar: parseAvatar(row.avatarJson, row.displayName),
        body: row.body,
        createdAt: row.createdAt,
        isSelf: row.userId === userId,
      });
      comments.set(row.postId, existing);
    });
  }

  return posts.results.map((post) => ({
    ...post,
    avatar: parseAvatar(post.avatarJson, post.displayName),
    avatarJson: undefined,
    minutes: Number(post.minutes),
    isSelf: post.userId === userId,
    imageUrl: feedImageUrl(request, post.imageKey),
    reactions: { fire: 0, brain: 0, clap: 0, ...(reactionCounts.get(post.id) ?? {}) },
    reacted: reacted.get(post.id) ?? {},
    reactedBy: reactedBy.get(post.id) ?? {},
    comments: comments.get(post.id) ?? [],
  }));
}

async function getSocialSnapshot(request: Request, env: Env, userId: string) {
  const friends = await env.DB.prepare(`
    SELECT u.id AS userId, u.display_name AS displayName, u.friend_code AS friendCode, u.avatar_json AS avatarJson, f.created_at AS friendsSince, u.last_seen_at AS lastSeenAt
    FROM friendships f
    JOIN users u ON u.id = CASE WHEN f.user_low = ? THEN f.user_high ELSE f.user_low END
    WHERE f.user_low = ? OR f.user_high = ?
    ORDER BY u.display_name ASC
  `).bind(userId, userId, userId).all();

  const incoming = await env.DB.prepare(`
    SELECT r.id, r.from_user_id AS fromUserId, r.to_user_id AS toUserId,
      from_u.display_name AS fromDisplayName, to_u.display_name AS toDisplayName,
      from_u.friend_code AS fromFriendCode, to_u.friend_code AS toFriendCode,
      from_u.avatar_json AS fromAvatarJson, to_u.avatar_json AS toAvatarJson,
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
      from_u.avatar_json AS fromAvatarJson, to_u.avatar_json AS toAvatarJson,
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
    global: await getFeed(request, env, userId, "global"),
    friends: await getFeed(request, env, userId, "friends"),
  };

  return {
    social: {
      friends: friends.results.map((friend) => ({
        ...friend,
        avatar: parseAvatar((friend as { avatarJson?: string }).avatarJson, (friend as { displayName?: string }).displayName ?? "Student"),
        avatarJson: undefined,
      })),
      incomingFriendRequests: incoming.results.map((request) => ({
        ...request,
        fromAvatar: parseAvatar((request as { fromAvatarJson?: string }).fromAvatarJson, (request as { fromDisplayName?: string }).fromDisplayName ?? "Student"),
        toAvatar: parseAvatar((request as { toAvatarJson?: string }).toAvatarJson, (request as { toDisplayName?: string }).toDisplayName ?? "Student"),
        fromAvatarJson: undefined,
        toAvatarJson: undefined,
      })),
      outgoingFriendRequests: outgoing.results.map((request) => ({
        ...request,
        fromAvatar: parseAvatar((request as { fromAvatarJson?: string }).fromAvatarJson, (request as { fromDisplayName?: string }).fromDisplayName ?? "Student"),
        toAvatar: parseAvatar((request as { toAvatarJson?: string }).toAvatarJson, (request as { toDisplayName?: string }).toDisplayName ?? "Student"),
        fromAvatarJson: undefined,
        toAvatarJson: undefined,
      })),
      cachedLeaderboards,
      cachedFeeds,
    },
  };
}

async function handleSync(request: Request, env: Env) {
  const payload = await readJson<SyncPayload>(request);
  if (!payload.user || typeof payload.user !== "object") return text("Missing user identity.", 400);
  await upsertUser(env, payload.user);
  const userId = cleanUserId(payload.user.userId);
  await upsertStats(env, userId, Array.isArray(payload.stats) ? payload.stats : []);
  await upsertFeedPosts(env, userId, payload.feedPosts);
  return json(await getSocialSnapshot(request, env, userId));
}

async function handleFeed(request: Request, env: Env) {
  const payload = await readParamsOrJson<{ userId: string; deviceSecret: string; scope?: LeaderboardScope }>(request);
  const userId = cleanUserId(payload.userId);
  const deviceSecret = cleanDeviceSecret(payload.deviceSecret);
  const scope = payload.scope === "friends" ? "friends" : "global";
  const viewer = await verifyUser(env, userId, deviceSecret);
  await env.DB.prepare("UPDATE users SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?").bind(userId).run();
  const usage = await getR2Usage(env);
  await maybeNotifyR2Usage(env, usage);
  return json({ feed: await getFeed(request, env, userId, scope), r2Usage: viewer.friendCode === R2_OWNER_FRIEND_CODE ? usage : undefined });
}

async function getOwnedPostImage(env: Env, userId: string, postId: string) {
  const row = await env.DB.prepare("SELECT user_id AS userId, image_key AS imageKey, image_size_bytes AS imageSizeBytes FROM feed_posts WHERE id = ?")
    .bind(postId)
    .first<{ userId: string; imageKey: string | null; imageSizeBytes: number }>();
  if (!row) throw new Response("Feed post not found.", { status: 404, headers: corsHeaders });
  if (row.userId !== userId) throw new Response("You can only edit your own post image.", { status: 403, headers: corsHeaders });
  return row;
}

async function handleFeedImageUpload(request: Request, env: Env) {
  const form = await request.formData();
  const userId = String(form.get("userId") ?? "").trim();
  const deviceSecret = String(form.get("deviceSecret") ?? "");
  const postId = cleanText(form.get("postId"), 80);
  const owner = await verifyUser(env, userId, deviceSecret);

  const existing = await getOwnedPostImage(env, userId, postId);
  const image = form.get("image");
  if (!(image instanceof File)) return text("Missing image.", 400);
  if (!feedImageTypes.has(image.type)) return text("Use PNG, JPEG, WebP, or GIF images.", 400);
  if (image.size > MAX_FEED_IMAGE_BYTES) return text("Image is too large. Use an image under 5 MB.", 413);

  const classAOps = existing.imageKey ? 2 : 1;
  const usage = await assertR2ClassABudget(env, classAOps);
  const previousBytes = Number(existing.imageSizeBytes ?? 0);
  const nextStorageBytes = usage.storageBytes - previousBytes + image.size;
  if (nextStorageBytes > R2_STORAGE_HARD_BYTES) {
    return text("Image uploads are paused to keep R2 storage below the free tier.", 429);
  }

  const extension = image.type === "image/png" ? "png" : image.type === "image/webp" ? "webp" : image.type === "image/gif" ? "gif" : "jpg";
  const key = `feed-posts/${postId}/${crypto.randomUUID()}.${extension}`;
  await env.FEED_IMAGES.put(key, image.stream(), {
    httpMetadata: { contentType: image.type },
  });
  if (existing.imageKey) await env.FEED_IMAGES.delete(existing.imageKey).catch(() => undefined);
  await incrementR2Usage(env, { classA: classAOps });

  const expiresAt = imageExpiresAt();
  await env.DB.prepare(`
    UPDATE feed_posts
    SET image_key = ?, image_mime_type = ?, image_expires_at = ?, image_expired_at = NULL, image_size_bytes = ?
    WHERE id = ? AND user_id = ?
  `).bind(key, image.type, expiresAt, image.size, postId, userId).run();
  await env.DB.prepare(`
    INSERT INTO r2_usage_monthly (month, storage_bytes, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(month) DO UPDATE SET storage_bytes = ?, updated_at = CURRENT_TIMESTAMP
  `).bind(usageMonth(), nextStorageBytes, nextStorageBytes).run();

  const nextUsage = await getR2Usage(env);
  await maybeNotifyR2Usage(env, nextUsage);
  return json({
    ok: true,
    imageKey: key,
    imageMimeType: image.type,
    imageExpiresAt: expiresAt,
    imageExpiredAt: null,
    imageUrl: feedImageUrl(request, key),
    r2Usage: owner.friendCode === R2_OWNER_FRIEND_CODE ? nextUsage : undefined,
  });
}

async function handleFeedImageDelete(request: Request, env: Env) {
  const payload = await readJson<{ userId: string; deviceSecret: string; postId: string }>(request);
  const userId = String(payload.userId ?? "").trim();
  const owner = await verifyUser(env, userId, String(payload.deviceSecret ?? ""));
  const postId = cleanText(payload.postId, 80);
  const existing = await getOwnedPostImage(env, userId, postId);
  if (existing.imageKey) await assertR2ClassABudget(env, 1);
  if (existing.imageKey) await env.FEED_IMAGES.delete(existing.imageKey).catch(() => undefined);
  if (existing.imageKey) await incrementR2Usage(env, { classA: 1 });
  const usage = await getR2Usage(env);
  const nextStorageBytes = Math.max(0, usage.storageBytes - Number(existing.imageSizeBytes ?? 0));
  await env.DB.prepare(`
    UPDATE feed_posts
    SET image_key = NULL, image_mime_type = NULL, image_expires_at = NULL, image_expired_at = NULL, image_size_bytes = 0
    WHERE id = ? AND user_id = ?
  `).bind(postId, userId).run();
  await env.DB.prepare(`
    INSERT INTO r2_usage_monthly (month, storage_bytes, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(month) DO UPDATE SET storage_bytes = ?, updated_at = CURRENT_TIMESTAMP
  `).bind(usageMonth(), nextStorageBytes, nextStorageBytes).run();
  const nextUsage = await getR2Usage(env);
  await maybeNotifyR2Usage(env, nextUsage);
  return json({ ok: true, r2Usage: owner.friendCode === R2_OWNER_FRIEND_CODE ? nextUsage : undefined });
}

async function handleFeedImageGet(request: Request, env: Env, key: string) {
  await assertR2ClassBBudget(env);
  const post = await env.DB.prepare("SELECT image_mime_type AS imageMimeType FROM feed_posts WHERE image_key = ? AND image_expires_at > ?")
    .bind(key, new Date().toISOString())
    .first<{ imageMimeType: string | null }>();
  if (!post) return text("Image not found.", 404);

  const object = await env.FEED_IMAGES.get(key);
  if (!object) return text("Image not found.", 404);
  await incrementR2Usage(env, { classB: 1 });
  await maybeNotifyR2Usage(env);
  return new Response(object.body, {
    headers: {
      ...corsHeaders,
      "content-type": post.imageMimeType || object.httpMetadata?.contentType || "application/octet-stream",
      "cache-control": "public, max-age=3600",
    },
  });
}

async function handleFeedReaction(request: Request, env: Env) {
  const payload = await readJson<{ userId: string; deviceSecret: string; postId: string; emoji: string }>(request);
  const userId = String(payload.userId ?? "").trim();
  await verifyUser(env, userId, String(payload.deviceSecret ?? ""));
  const postId = cleanText(payload.postId, 80);
  const visibility = await canViewFeedPost(env, userId, postId);
  if (visibility.missing) return text("Feed post not found.", 404);
  if (!visibility.allowed) return text("You cannot react to this feed post.", 403);

  const requestedEmoji = cleanText(payload.emoji, 8);
  const emoji = requestedEmoji && [...requestedEmoji].length <= 4 ? requestedEmoji : "fire";
  const existing = await env.DB.prepare("SELECT 1 FROM feed_reactions WHERE post_id = ? AND user_id = ? AND emoji = ?").bind(postId, userId, emoji).first();
  if (existing) {
    await env.DB.prepare("DELETE FROM feed_reactions WHERE post_id = ? AND user_id = ? AND emoji = ?").bind(postId, userId, emoji).run();
  } else {
    await env.DB.prepare("INSERT OR IGNORE INTO feed_reactions (post_id, user_id, emoji) VALUES (?, ?, ?)").bind(postId, userId, emoji).run();
  }
  return json({ ok: true });
}

async function handleFeedUpdate(request: Request, env: Env) {
  const payload = await readJson<{ userId: string; deviceSecret: string; postId: string; note: string }>(request);
  const userId = String(payload.userId ?? "").trim();
  await verifyUser(env, userId, String(payload.deviceSecret ?? ""));

  const postId = cleanText(payload.postId, 80);
  const existing = await env.DB.prepare("SELECT user_id AS userId FROM feed_posts WHERE id = ?").bind(postId).first<{ userId: string }>();
  if (!existing) return text("Feed post not found.", 404);
  if (existing.userId !== userId) return text("You can only edit your own posts.", 403);

  await env.DB.prepare("UPDATE feed_posts SET note = ? WHERE id = ? AND user_id = ?")
    .bind(cleanText(payload.note, 220), postId, userId)
    .run();
  return json({ ok: true });
}

async function handleFeedDelete(request: Request, env: Env) {
  const payload = await readJson<{ userId: string; deviceSecret: string; postId: string }>(request);
  const userId = String(payload.userId ?? "").trim();
  await verifyUser(env, userId, String(payload.deviceSecret ?? ""));

  const postId = cleanText(payload.postId, 80);
  const existing = await env.DB.prepare("SELECT user_id AS userId, image_key AS imageKey, image_size_bytes AS imageSizeBytes FROM feed_posts WHERE id = ?").bind(postId).first<{ userId: string; imageKey: string | null; imageSizeBytes: number }>();
  if (!existing) return text("Feed post not found.", 404);
  if (existing.userId !== userId) return text("You can only delete your own posts.", 403);

  if (existing.imageKey) await assertR2ClassABudget(env, 1);
  if (existing.imageKey) await env.FEED_IMAGES.delete(existing.imageKey).catch(() => undefined);
  if (existing.imageKey) {
    await incrementR2Usage(env, { classA: 1 });
    const usage = await getR2Usage(env);
    const nextStorageBytes = Math.max(0, usage.storageBytes - Number(existing.imageSizeBytes ?? 0));
    await env.DB.prepare(`
      INSERT INTO r2_usage_monthly (month, storage_bytes, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(month) DO UPDATE SET storage_bytes = ?, updated_at = CURRENT_TIMESTAMP
    `).bind(usageMonth(), nextStorageBytes, nextStorageBytes).run();
    await maybeNotifyR2Usage(env);
  }
  await env.DB.prepare("DELETE FROM feed_posts WHERE id = ? AND user_id = ?").bind(postId, userId).run();
  return json({ ok: true });
}

async function handleFeedComment(request: Request, env: Env) {
  const payload = await readJson<{ userId: string; deviceSecret: string; postId: string; body: string }>(request);
  const userId = String(payload.userId ?? "").trim();
  await verifyUser(env, userId, String(payload.deviceSecret ?? ""));
  const postId = cleanText(payload.postId, 80);
  const visibility = await canViewFeedPost(env, userId, postId);
  if (visibility.missing) return text("Feed post not found.", 404);
  if (!visibility.allowed) return text("You cannot comment on this feed post.", 403);

  const body = cleanText(payload.body, MAX_COMMENT_LENGTH);
  if (!body) return text("Comment cannot be empty.", 400);

  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO feed_comments (id, post_id, user_id, body) VALUES (?, ?, ?, ?)")
    .bind(id, postId, userId, body)
    .run();
  const row = await env.DB.prepare(`
    SELECT c.id, c.post_id AS postId, c.user_id AS userId, u.display_name AS displayName, u.friend_code AS friendCode,
      u.avatar_json AS avatarJson, c.body, c.created_at AS createdAt
    FROM feed_comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.id = ?
  `).bind(id).first<{ id: string; postId: string; userId: string; displayName: string; friendCode: string; avatarJson: string; body: string; createdAt: string }>();
  if (!row) return text("Comment could not be created.", 500);

  return json({
    ok: true,
    comment: {
      id: row.id,
      postId: row.postId,
      userId: row.userId,
      displayName: row.displayName,
      friendCode: row.friendCode,
      avatar: parseAvatar(row.avatarJson, row.displayName),
      body: row.body,
      createdAt: row.createdAt,
      isSelf: true,
    },
  });
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

  const reciprocalRequest = await env.DB.prepare("SELECT id FROM friend_requests WHERE from_user_id = ? AND to_user_id = ? AND status = 'pending'")
    .bind(target.id, fromUserId)
    .first<{ id: string }>();
  if (reciprocalRequest) {
    await env.DB.batch([
      env.DB.prepare("UPDATE friend_requests SET status = 'accepted', responded_at = CURRENT_TIMESTAMP WHERE id = ?").bind(reciprocalRequest.id),
      env.DB.prepare("INSERT OR IGNORE INTO friendships (user_low, user_high) VALUES (?, ?)").bind(userLow, userHigh),
    ]);
    return json(await getSocialSnapshot(request, env, fromUserId));
  }

  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO friend_requests (id, from_user_id, to_user_id, status) VALUES (?, ?, ?, 'pending') ON CONFLICT(from_user_id, to_user_id) DO UPDATE SET status = 'pending', responded_at = NULL")
    .bind(id, fromUserId, target.id)
    .run();
  return json(await getSocialSnapshot(request, env, fromUserId));
}

async function handlePresence(request: Request, env: Env) {
  const payload = await readJson<{ userId: string; deviceSecret: string }>(request);
  const userId = String(payload.userId ?? "").trim();
  await verifyUser(env, userId, String(payload.deviceSecret ?? ""));
  await env.DB.prepare("UPDATE users SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?").bind(userId).run();
  return json({ ok: true });
}

async function handleFriendStatus(request: Request, env: Env) {
  const payload = await readParamsOrJson<{ userId: string; deviceSecret: string }>(request);
  const userId = cleanUserId(payload.userId);
  const deviceSecret = cleanDeviceSecret(payload.deviceSecret);
  await verifyUser(env, userId, deviceSecret);
  await env.DB.prepare("UPDATE users SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?").bind(userId).run();
  return json(await getSocialSnapshot(request, env, userId));
}

async function handlePlayerStats(request: Request, env: Env) {
  const payload = await readParamsOrJson<{ userId: string; deviceSecret: string; targetUserId: string }>(request);
  const userId = cleanUserId(payload.userId);
  const deviceSecret = cleanDeviceSecret(payload.deviceSecret);
  const targetUserId = cleanUserId(payload.targetUserId);
  await verifyUser(env, userId, deviceSecret);

  const targetUser = await env.DB.prepare("SELECT id, display_name AS displayName, friend_code AS friendCode, avatar_json AS avatarJson, last_seen_at AS lastSeenAt FROM users WHERE id = ?")
    .bind(targetUserId).first<{ id: string; displayName: string; friendCode: string; avatarJson: string; lastSeenAt: string | null }>();
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
    avatar: parseAvatar(targetUser.avatarJson, targetUser.displayName),
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

  return json(await getSocialSnapshot(request, env, userId));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    try {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/health") return json({ ok: true });
      if (request.method === "GET" && url.pathname.startsWith("/feed/image/")) return await handleFeedImageGet(request, env, decodeURIComponent(url.pathname.slice("/feed/image/".length)));
      if ((request.method === "GET" || request.method === "POST") && url.pathname === "/feed") return await handleFeed(request, env);
      if (request.method === "POST" && url.pathname === "/sync") return await handleSync(request, env);
      if (request.method === "POST" && url.pathname === "/feed/react") return await handleFeedReaction(request, env);
      if (request.method === "POST" && url.pathname === "/feed/comment") return await handleFeedComment(request, env);
      if (request.method === "POST" && url.pathname === "/feed/update") return await handleFeedUpdate(request, env);
      if (request.method === "POST" && url.pathname === "/feed/delete") return await handleFeedDelete(request, env);
      if (request.method === "POST" && url.pathname === "/feed/image") return await handleFeedImageUpload(request, env);
      if (request.method === "POST" && url.pathname === "/feed/image/delete") return await handleFeedImageDelete(request, env);
      if (request.method === "POST" && url.pathname === "/friends/request") return await handleFriendRequest(request, env);
      if (request.method === "POST" && url.pathname === "/friends/respond") return await handleFriendResponse(request, env);
      if ((request.method === "GET" || request.method === "POST") && url.pathname === "/friends/status") return await handleFriendStatus(request, env);
      if (request.method === "POST" && url.pathname === "/presence") return await handlePresence(request, env);
      if ((request.method === "GET" || request.method === "POST") && url.pathname === "/player-stats") return await handlePlayerStats(request, env);
      return text("Not found.", 404);
    } catch (error: unknown) {
      if (error instanceof Response) return error;
      console.error(error);
      return text(error instanceof Error ? error.message : "Unexpected server error.", 500);
    }
  },
  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    const now = new Date().toISOString();
    const usage = await getR2Usage(env);
    const remainingClassA = Math.max(0, R2_CLASS_A_HARD_MONTHLY - usage.classAOps);
    if (!remainingClassA) return;
    const rows = await env.DB.prepare(`
      SELECT id, image_key AS imageKey, image_size_bytes AS imageSizeBytes
      FROM feed_posts
      WHERE image_key IS NOT NULL AND image_expires_at IS NOT NULL AND image_expires_at <= ?
      LIMIT 100
    `).bind(now).all<{ id: string; imageKey: string; imageSizeBytes: number }>();

    let deleted = 0;
    let releasedBytes = 0;
    for (const row of rows.results.slice(0, remainingClassA)) {
      await env.FEED_IMAGES.delete(row.imageKey).catch(() => undefined);
      await incrementR2Usage(env, { classA: 1 });
      deleted += 1;
      releasedBytes += Number(row.imageSizeBytes ?? 0);
      await env.DB.prepare(`
        UPDATE feed_posts
        SET image_key = NULL, image_mime_type = NULL, image_expires_at = NULL, image_expired_at = ?, image_size_bytes = 0
        WHERE id = ? AND image_key = ?
      `).bind(now, row.id, row.imageKey).run();
    }
    if (deleted) {
      const nextStorageBytes = Math.max(0, usage.storageBytes - releasedBytes);
      await env.DB.prepare(`
        INSERT INTO r2_usage_monthly (month, storage_bytes, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(month) DO UPDATE SET storage_bytes = ?, updated_at = CURRENT_TIMESTAMP
      `).bind(usageMonth(), nextStorageBytes, nextStorageBytes).run();
      await maybeNotifyR2Usage(env);
    }
  },
};
