import type { AppState, SocialFriendRequest, SocialLeaderboardEntry, SocialLeaderboardPeriod, SocialLeaderboardScope, SocialState, StudySession } from "../types";
import { isoDate } from "./metrics";

export const SOCIAL_SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000;
const SOCIAL_API_URL = import.meta.env.VITE_SOCIAL_API_URL?.replace(/\/$/, "") ?? "";

export interface SocialDailyStat {
  date: string;
  minutes: number;
  sessions: number;
}

interface SocialSyncResponse {
  social: Pick<SocialState, "friends" | "incomingFriendRequests" | "outgoingFriendRequests" | "cachedLeaderboards">;
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
    minutes: matchingSessions.reduce((sum, session) => sum + Math.max(0, Math.round(session.minutes)), 0),
    sessions: matchingSessions.length,
    rank: 0,
    lastActiveDate: state.sessions.length ? sessionDateKey([...state.sessions].sort((a, b) => b.endedAt.localeCompare(a.endedAt))[0]) : null,
    isSelf: true,
  };
}

export function getLeaderboardWithLocalSelf(state: AppState, scope: SocialLeaderboardScope, period: SocialLeaderboardPeriod) {
  const self = getLocalLeaderboardEntry(state, period);
  const remote = state.social.cachedLeaderboards[scope][period].filter((entry) => entry.userId !== self.userId);
  const combined = [self, ...remote]
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
    },
    stats: getLocalSocialStats(state.sessions),
  };

  return requestSocialApi<SocialSyncResponse>("/sync", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createFriendRequest(social: SocialState, friendCode: string) {
  return requestSocialApi<{ request: SocialFriendRequest }>("/friends/request", {
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

export function getNextAutoSyncAt() {
  return new Date(Date.now() + SOCIAL_SYNC_INTERVAL_MS).toISOString();
}
