import { invoke } from "@tauri-apps/api/core";
import type { AppState, SocialAvatar, SocialFeedComment, SocialFeedPoll, SocialFeedPost, SocialFeedScope, SocialLeaderboardEntry, SocialLeaderboardPeriod, SocialLeaderboardScope, SocialSquadDetails, SocialSquadRole, SocialState, StudySession } from "../types";
import { isoDate } from "./metrics";

export const SOCIAL_SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000;
export const MAX_SYNC_BODY_BYTES = 256 * 1024;
export const MAX_SYNC_STAT_ROWS = 370;
export const MAX_SYNC_FEED_POSTS = 25;
const DEFAULT_SOCIAL_API_URL = "https://study-tracker-social.danil-poluyanov13.workers.dev";
const SOCIAL_API_URL = (import.meta.env.VITE_SOCIAL_API_URL || DEFAULT_SOCIAL_API_URL).replace(/\/$/, "");

export interface SocialDailyStat {
  date: string;
  minutes: number;
  sessions: number;
}

interface SocialSyncResponse {
  social: Pick<SocialState, "friends" | "incomingFriendRequests" | "outgoingFriendRequests" | "cachedLeaderboards" | "cachedSquadScoreLeaderboards" | "cachedFeeds" | "squad" | "incomingSquadRequests" | "outgoingSquadRequests" | "squadMessages">;
}

interface SocialWriteResponse {
  ok: boolean;
  syncedAt?: string;
}

interface DeviceIdentity {
  fingerprintHash: string;
  label: string;
}

interface NativeHttpResponse {
  status: number;
  body: string;
}

export interface AppMetadata {
  version: string;
  platform: string;
  runtimeChannel: string;
}

interface SocialStatusResponse {
  social: Pick<SocialState, "friends" | "incomingFriendRequests" | "outgoingFriendRequests" | "cachedLeaderboards" | "cachedSquadScoreLeaderboards" | "cachedFeeds" | "squad" | "incomingSquadRequests" | "outgoingSquadRequests" | "squadMessages">;
}

export interface SquadSearchResult {
  id: string;
  name: string;
  isPrivate: boolean;
  createdAt: string;
  memberCount: number;
  maxMembers: number;
  totalMinutes: number;
  totalSessions: number;
  action: "join" | "request" | "pending" | "full" | "unavailable" | "current";
}

interface SocialFeedResponse {
  feed: SocialFeedPost[];
  r2Usage?: R2UsageStatus;
}

export interface AppAnnouncement {
  id: string;
  title: string;
  body: string;
  targetVersion?: string | null;
  createdAt: string;
  expiresAt: string | null;
}

export interface R2UsageStatus {
  month: string;
  storageBytes: number;
  classAOps: number;
  classBOps: number;
  warning: boolean;
  paused: boolean;
  limits: {
    storageWarningBytes: number;
    storageHardBytes: number;
    classAWarningMonthly: number;
    classAHardMonthly: number;
    classBWarningMonthly: number;
    classBHardMonthly: number;
  };
}

export interface AdminUsageResponse {
  summary: {
    userCount: number;
    active24h: number;
    active7d: number;
    usersWithAppVersion: number;
  } | null;
  users: Array<{
    displayName: string;
    friendCode: string;
    lastSeenAt: string;
    deviceLabel: string | null;
    deviceFingerprintHash: string | null;
    appVersion: string | null;
    appPlatform: string | null;
    appRuntimeChannel: string | null;
    appSeenAt: string | null;
  }>;
  telemetry: Array<{
    installId: string;
    appVersion: string;
    appPlatform: string;
    appRuntimeChannel: string;
    createdAt: string;
    lastSeenAt: string;
  }>;
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

export function getSyncSocialStats(sessions: StudySession[]) {
  return getLocalSocialStats(sessions).slice(-MAX_SYNC_STAT_ROWS);
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
    minutes: period === "overall" ? state.lifetimeStudyMinutes : matchingSessions.reduce((sum, session) => sum + Math.max(0, Math.round(session.minutes)), 0),
    sessions: period === "overall" ? state.lifetimeStudySessions : matchingSessions.length,
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
    .filter((entry) => {
      if (scope === "global") return true;
      if (entry.isSelf) return true;
      if (scope === "squad") return Boolean(state.social.squad?.members.some((member) => member.userId === entry.userId));
      return state.social.friends.some((friend) => friend.userId === entry.userId);
    })
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

async function getDeviceIdentity() {
  try {
    return await invoke<DeviceIdentity>("get_device_identity");
  } catch {
    return undefined;
  }
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

async function requestSocialForm<T>(path: string, form: FormData): Promise<T> {
  assertSocialApiConfigured();
  const response = await fetch(`${SOCIAL_API_URL}${path}`, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Social sync failed with HTTP ${response.status}.`);
  }

  return response.json() as Promise<T>;
}

export async function syncSocialState(state: AppState, app?: AppMetadata) {
  const device = await getDeviceIdentity();
  const payload = {
    user: {
      userId: state.social.userId,
      deviceSecret: state.social.deviceSecret,
      friendCode: state.social.friendCode,
      displayName: state.social.displayName,
       avatar: state.social.avatar,
       isPrivate: state.social.isPrivate,
       showHoursToFriends: state.social.showHoursToFriends,
       lifetimeStudyMinutes: state.lifetimeStudyMinutes,
      lifetimeStudySessions: state.lifetimeStudySessions,
      device,
      app,
    },
    stats: getSyncSocialStats(state.sessions),
    feedPosts: state.social.pendingFeedPosts.slice(0, MAX_SYNC_FEED_POSTS).map((post) => {
      return {
        id: post.id,
        type: post.type,
        subject: post.subject,
        detail: post.detail,
        note: post.note,
        icon: post.icon,
        minutes: post.minutes,
        presetLabel: post.presetLabel,
        createdAt: post.createdAt,
        poll: post.poll ? {
          question: post.poll.question,
          multiple: post.poll.multiple,
          options: post.poll.options.map((option) => ({ id: option.id, text: option.text })),
        } : null,
      };
    }),
  };

  const body = JSON.stringify(payload);
  const endpoint = `${SOCIAL_API_URL}/sync`;
  const payloadBytes = new TextEncoder().encode(body).length;

  if (payloadBytes > MAX_SYNC_BODY_BYTES) {
    throw new Error("Social sync payload is too large. Use a smaller profile photo, then sync again.");
  }

  let responseText: string;
  let responseOk: boolean;
  let responseStatus: number;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    responseText = await response.text().catch(() => "");
    responseOk = response.ok;
    responseStatus = response.status;
  } catch (error) {
    try {
      const nativeResponse = await invoke<NativeHttpResponse>("native_social_sync", { endpoint, body });
      responseText = nativeResponse.body;
      responseOk = nativeResponse.status >= 200 && nativeResponse.status < 300;
      responseStatus = nativeResponse.status;
    } catch (nativeError) {
      const originalMessage = error instanceof Error ? error.message : String(error);
      const nativeMessage = nativeError instanceof Error ? nativeError.message : String(nativeError);
      const message = `Could not reach the social sync server. Check your connection; if this keeps happening, your network may be blocking IPv6 or the Worker domain. (${originalMessage}; native fallback: ${nativeMessage})`;
      throw new Error(message);
    }
  }

  if (!responseOk) {
    throw new Error(responseText || `Social sync failed with HTTP ${responseStatus}.`);
  }
  return JSON.parse(responseText) as SocialWriteResponse;
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

export async function getCurrentAnnouncement(app: AppMetadata) {
  return requestSocialApi<{ announcement: AppAnnouncement | null }>(`/announcements/current?appVersion=${encodeURIComponent(app.version)}`, {
    method: "GET",
  });
}

export async function notifyUsersAboutUpdate(social: SocialState, targetVersion: string) {
  return requestSocialApi<{ ok: boolean; id: string; targetVersion: string }>("/announcements/update-notice", {
    method: "POST",
    body: JSON.stringify({
      userId: social.userId,
      deviceSecret: social.deviceSecret,
      targetVersion,
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

export async function voteOnFeedPoll(social: SocialState, postId: string, optionId: string) {
  return requestSocialApi<{ ok: boolean; poll: SocialFeedPoll | null }>("/feed/poll/vote", {
    method: "POST",
    body: JSON.stringify({
      userId: social.userId,
      deviceSecret: social.deviceSecret,
      postId,
      optionId,
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

export async function uploadFeedPostImage(social: SocialState, postId: string, image: Blob) {
  const form = new FormData();
  form.set("userId", social.userId);
  form.set("deviceSecret", social.deviceSecret);
  form.set("postId", postId);
  form.set("image", image, "feed-image.webp");
  return requestSocialForm<{ ok: boolean; imageUrl: string; imageMimeType: string; imageExpiresAt: string; imageExpiredAt: null; r2Usage?: R2UsageStatus }>("/feed/image", form);
}

export async function deleteFeedPostImage(social: SocialState, postId: string) {
  return requestSocialApi<{ ok: boolean; r2Usage?: R2UsageStatus }>("/feed/image/delete", {
    method: "POST",
    body: JSON.stringify({
      userId: social.userId,
      deviceSecret: social.deviceSecret,
      postId,
    }),
  });
}

export async function uploadProfileAvatar(social: SocialState, image: Blob, name: string) {
  const form = new FormData();
  form.set("userId", social.userId);
  form.set("deviceSecret", social.deviceSecret);
  form.set("name", name);
  form.set("image", image, name || "avatar.webp");
  return requestSocialForm<{ avatar: SocialAvatar }>("/profile/avatar", form);
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

export async function createSquad(social: SocialState, name: string, isPrivate: boolean) {
  return requestSocialApi<SocialSyncResponse>("/squads/create", {
    method: "POST",
    body: JSON.stringify({ userId: social.userId, deviceSecret: social.deviceSecret, name, isPrivate }),
  });
}

export async function searchSquads(social: SocialState, query: string) {
  return requestSocialApi<{ squads: SquadSearchResult[] }>("/squads/search", {
    method: "POST",
    body: JSON.stringify({ userId: social.userId, deviceSecret: social.deviceSecret, query }),
  });
}

export async function getSquadDetails(social: SocialState, squadId: string) {
  return requestSocialApi<{ squad: SocialSquadDetails }>("/squads/details", {
    method: "POST",
    body: JSON.stringify({ userId: social.userId, deviceSecret: social.deviceSecret, squadId }),
  });
}

export async function joinSquad(social: SocialState, squadId: string) {
  return requestSocialApi<SocialSyncResponse>("/squads/join", {
    method: "POST",
    body: JSON.stringify({ userId: social.userId, deviceSecret: social.deviceSecret, squadId }),
  });
}

export async function respondToSquadRequest(social: SocialState, requestId: string, response: "accepted" | "declined") {
  return requestSocialApi<SocialSyncResponse>("/squads/respond", {
    method: "POST",
    body: JSON.stringify({ userId: social.userId, deviceSecret: social.deviceSecret, requestId, response }),
  });
}

export async function leaveSquad(social: SocialState) {
  return requestSocialApi<SocialSyncResponse>("/squads/leave", {
    method: "POST",
    body: JSON.stringify({ userId: social.userId, deviceSecret: social.deviceSecret }),
  });
}

export async function sendSquadMessage(social: SocialState, body: string) {
  return requestSocialApi<SocialSyncResponse>("/squads/chat", {
    method: "POST",
    body: JSON.stringify({ userId: social.userId, deviceSecret: social.deviceSecret, body }),
  });
}

export async function deleteSquadMessage(social: SocialState, messageId: string) {
  return requestSocialApi<SocialSyncResponse>("/squads/chat/delete", {
    method: "POST",
    body: JSON.stringify({ userId: social.userId, deviceSecret: social.deviceSecret, messageId }),
  });
}

export async function setSquadMemberRole(social: SocialState, targetUserId: string, role: SocialSquadRole) {
  return requestSocialApi<SocialSyncResponse>("/squads/promote", {
    method: "POST",
    body: JSON.stringify({ userId: social.userId, deviceSecret: social.deviceSecret, targetUserId, role }),
  });
}

export async function kickSquadMember(social: SocialState, targetUserId: string) {
  return requestSocialApi<SocialSyncResponse>("/squads/kick", {
    method: "POST",
    body: JSON.stringify({ userId: social.userId, deviceSecret: social.deviceSecret, targetUserId }),
  });
}

export async function updateSquadSettings(social: SocialState, name: string, isPrivate: boolean) {
  return requestSocialApi<SocialSyncResponse>("/squads/settings", {
    method: "POST",
    body: JSON.stringify({ userId: social.userId, deviceSecret: social.deviceSecret, name, isPrivate }),
  });
}

export function getNextAutoSyncAt() {
  const intervalSyncAt = new Date(Date.now() + SOCIAL_SYNC_INTERVAL_MS);
  const dailyResetAt = nextDayStart();
  const weeklyResetAt = nextWeekStart();
  return new Date(Math.min(intervalSyncAt.getTime(), dailyResetAt.getTime(), weeklyResetAt.getTime())).toISOString();
}

export async function presencePing(social: SocialState, app?: AppMetadata) {
  return requestSocialApi<{ ok: boolean }>("/presence", {
    method: "POST",
    body: JSON.stringify({
      userId: social.userId,
      deviceSecret: social.deviceSecret,
      app,
    }),
  });
}

export async function sendTelemetryHeartbeat(installId: string, app: AppMetadata) {
  return requestSocialApi<{ ok: boolean }>("/telemetry/heartbeat", {
    method: "POST",
    body: JSON.stringify({ installId, app }),
  });
}

export async function getAdminUsage(social: SocialState) {
  return requestSocialApi<AdminUsageResponse>("/admin/usage", {
    method: "POST",
    body: JSON.stringify({ userId: social.userId, deviceSecret: social.deviceSecret }),
  });
}

export interface PlayerStatsResponse {
  displayName: string;
  friendCode: string;
  avatar?: SocialAvatar;
  lastSeenAt: string | null;
  hoursVisible: boolean;
  daily: { minutes: number; sessions: number; lastActiveDate: string | null } | null;
  weekly: { minutes: number; sessions: number; lastActiveDate: string | null } | null;
  overall: { minutes: number; sessions: number; lastActiveDate: string | null } | null;
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
