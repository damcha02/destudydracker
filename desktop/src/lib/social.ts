import type { AppState, SocialAvatar, SocialFeedComment, SocialFeedPost, SocialFeedScope, SocialLeaderboardEntry, SocialLeaderboardPeriod, SocialLeaderboardScope, SocialState, StudySession } from "../types";
import { isoDate } from "./metrics";

export const SOCIAL_SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000;
const DEFAULT_SOCIAL_API_URL = "https://study-tracker-social.danil-poluyanov13.workers.dev";
const SOCIAL_API_URL = (import.meta.env.VITE_SOCIAL_API_URL || DEFAULT_SOCIAL_API_URL).replace(/\/$/, "");

export interface SocialDailyStat {
  date: string;
  minutes: number;
  sessions: number;
}

interface SocialSyncResponse {
  social: Pick<SocialState, "friends" | "incomingFriendRequests" | "outgoingFriendRequests" | "cachedLeaderboards" | "cachedFeeds">;
}

interface SocialStatusResponse {
  social: Pick<SocialState, "friends" | "incomingFriendRequests" | "outgoingFriendRequests" | "cachedLeaderboards" | "cachedFeeds">;
}

interface SocialFeedResponse {
  feed: SocialFeedPost[];
}

function sessionDateKey(session: StudySession) {
  return isoDate(new Date(session.endedAt));
}

function startOfWeek(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  const mondayOffset = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - mondayOffset);
  return copy;
}

function nextWeekStart(date = new Date()) {
  const next = startOfWeek(date);
  next.setDate(next.getDate() + 7);
  return next;
}

function nextDayStart(date = new Date()) {
  const next = new Date(date);
  next.setHours(24, 0, 0, 0);
  return next;
}

function isCurrentDayEntry(entry: SocialLeaderboardEntry, today: string) {
  return entry.lastActiveDate === today;
}

function isCurrentWeekEntry(entry: SocialLeaderboardEntry, weekStart: Date) {
  if (!entry.lastActiveDate) return false;
  const activeAt = new Date(`${entry.lastActiveDate}T00:00:00`);
  return activeAt >= weekStart;
}

export function getLocalSocialStats(sessions: StudySession[]) {
  const daily = new Map<string, SocialDailyStat>();
  sessions
    .filter((session) => session.kind === "study" || session.kind === "exam")
    .forEach((session) => {
      const date = sessionDateKey(session);
      const current = daily.get(date) ?? { date, minutes: 0, sessions: 0 };
      current.minutes += Math.max(0, Math.round(session.minutes));
      current.sessions += 1;
      daily.set(date, current);
    });

  return [...daily.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function getLocalLeaderboardEntry(state: AppState, period: SocialLeaderboardPeriod): SocialLeaderboardEntry {
  const today = isoDate();
  const weekStart = startOfWeek(new Date());
  const matchingSessions = state.sessions.filter((session) => {
    if (session.kind !== "study" && session.kind !== "exam") return false;
    const endedAt = new Date(session.endedAt);
    if (period === "daily") return sessionDateKey(session) === today;
    if (period === "weekly") return endedAt >= weekStart;
    return true;
  });

  return {
    userId: state.social.userId,
    displayName: state.social.displayName,
    friendCode: state.social.friendCode,
    avatar: state.social.avatar,
    minutes: matchingSessions.reduce((sum, session) => sum + Math.max(0, Math.round(session.minutes)), 0),
    sessions: matchingSessions.length,
    rank: 0,
    lastActiveDate: state.sessions.length ? sessionDateKey([...state.sessions].sort((a, b) => b.endedAt.localeCompare(a.endedAt))[0]) : null,
    isSelf: true,
  };
}

export function getLeaderboardWithLocalSelf(state: AppState, scope: SocialLeaderboardScope, period: SocialLeaderboardPeriod) {
  const self = getLocalLeaderboardEntry(state, period);
  const includeSelf = scope !== "global" || !state.social.isPrivate;
  const today = isoDate();
  const weekStart = startOfWeek(new Date());
  const remote = state.social.cachedLeaderboards[scope][period]
    .filter((entry) => entry.userId !== self.userId)
    .filter((entry) => period !== "daily" || isCurrentDayEntry(entry, today))
    .filter((entry) => period !== "weekly" || isCurrentWeekEntry(entry, weekStart));
  const combined = [...(includeSelf ? [self] : []), ...remote]
    .filter((entry) => scope === "global" || entry.isSelf || state.social.friends.some((friend) => friend.userId === entry.userId))
    .sort((a, b) => b.minutes - a.minutes || a.displayName.localeCompare(b.displayName));

  return combined.map((entry, index) => ({ ...entry, rank: index + 1, isSelf: entry.userId === self.userId }));
}

export function isSocialApiConfigured() {
  return Boolean(SOCIAL_API_URL);
}

export function shouldAutoSyncSocial(social: SocialState) {
  if (!isSocialApiConfigured()) return false;
  if (!social.nextAutoSyncAt) return true;
  return Date.now() >= new Date(social.nextAutoSyncAt).getTime();
}

function assertSocialApiConfigured() {
  if (!SOCIAL_API_URL) throw new Error("Social sync is not configured. Add VITE_SOCIAL_API_URL after deploying the Cloudflare Worker.");
}

async function requestSocialApi<T>(path: string, init: RequestInit): Promise<T> {
  assertSocialApiConfigured();
  const response = await fetch(`${SOCIAL_API_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Social sync failed with HTTP ${response.status}.`);
  }

  return response.json() as Promise<T>;
}

export async function syncSocialState(state: AppState) {
  const payload = {
    user: {
      userId: state.social.userId,
      deviceSecret: state.social.deviceSecret,
      friendCode: state.social.friendCode,
      displayName: state.social.displayName,
      avatar: state.social.avatar,
      isPrivate: state.social.isPrivate,
    },
    stats: getLocalSocialStats(state.sessions),
    feedPosts: state.social.pendingFeedPosts,
  };

  return requestSocialApi<SocialSyncResponse>("/sync", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getSocialFeed(social: SocialState, scope: SocialFeedScope) {
  return requestSocialApi<SocialFeedResponse>("/feed", {
    method: "POST",
    body: JSON.stringify({
      scope,
      userId: social.userId,
      deviceSecret: social.deviceSecret,
    }),
  });
}

export async function reactToFeedPost(social: SocialState, postId: string, emoji: string) {
  return requestSocialApi<{ ok: boolean }>("/feed/react", {
    method: "POST",
    body: JSON.stringify({
      userId: social.userId,
      deviceSecret: social.deviceSecret,
      postId,
      emoji,
    }),
  });
}

export async function updateFeedPost(social: SocialState, postId: string, note: string) {
  return requestSocialApi<{ ok: boolean }>("/feed/update", {
    method: "POST",
    body: JSON.stringify({
      userId: social.userId,
      deviceSecret: social.deviceSecret,
      postId,
      note,
    }),
  });
}

export async function deleteFeedPost(social: SocialState, postId: string) {
  return requestSocialApi<{ ok: boolean }>("/feed/delete", {
    method: "POST",
    body: JSON.stringify({
      userId: social.userId,
      deviceSecret: social.deviceSecret,
      postId,
    }),
  });
}

export async function commentOnFeedPost(social: SocialState, postId: string, body: string) {
  return requestSocialApi<{ ok: boolean; comment: SocialFeedComment }>("/feed/comment", {
    method: "POST",
    body: JSON.stringify({
      userId: social.userId,
      deviceSecret: social.deviceSecret,
      postId,
      body,
    }),
  });
}

export async function createFriendRequest(social: SocialState, friendCode: string) {
  return requestSocialApi<SocialSyncResponse>("/friends/request", {
    method: "POST",
    body: JSON.stringify({
      userId: social.userId,
      deviceSecret: social.deviceSecret,
      friendCode,
    }),
  });
}

export async function respondToFriendRequest(social: SocialState, requestId: string, response: "accepted" | "declined") {
  return requestSocialApi<SocialSyncResponse>("/friends/respond", {
    method: "POST",
    body: JSON.stringify({
      userId: social.userId,
      deviceSecret: social.deviceSecret,
      requestId,
      response,
    }),
  });
}

export async function getFriendStatus(social: SocialState) {
  return requestSocialApi<SocialStatusResponse>("/friends/status", {
    method: "POST",
    body: JSON.stringify({
      userId: social.userId,
      deviceSecret: social.deviceSecret,
    }),
  });
}

export function getNextAutoSyncAt() {
  const intervalSyncAt = new Date(Date.now() + SOCIAL_SYNC_INTERVAL_MS);
  const dailyResetAt = nextDayStart();
  const weeklyResetAt = nextWeekStart();
  return new Date(Math.min(intervalSyncAt.getTime(), dailyResetAt.getTime(), weeklyResetAt.getTime())).toISOString();
}

export async function presencePing(social: SocialState) {
  return requestSocialApi<{ ok: boolean }>("/presence", {
    method: "POST",
    body: JSON.stringify({
      userId: social.userId,
      deviceSecret: social.deviceSecret,
    }),
  });
}

export interface PlayerStatsResponse {
  displayName: string;
  friendCode: string;
  avatar?: SocialAvatar;
  lastSeenAt: string | null;
  daily: { minutes: number; sessions: number; lastActiveDate: string | null };
  weekly: { minutes: number; sessions: number; lastActiveDate: string | null };
  overall: { minutes: number; sessions: number; lastActiveDate: string | null };
}

export async function getPlayerStats(social: SocialState, targetUserId: string) {
  return requestSocialApi<PlayerStatsResponse>("/player-stats", {
    method: "POST",
    body: JSON.stringify({
      userId: social.userId,
      deviceSecret: social.deviceSecret,
      targetUserId,
    }),
  });
}
