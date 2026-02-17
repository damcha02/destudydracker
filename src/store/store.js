import { createLocalStore } from "./localStore.js";
import { createSupabaseStore } from "./supabaseStore.js";
import { createGuestStore } from "./guestStore.js";
import { getSession, onAuthStateChange } from "../auth/auth.js";
import { Events } from "../core/events.js";

let activeStore = null;
let activeKind = "guest"; // "guest" | "local" | "supabase"

function makeStore(kind) {
  if (kind === "supabase") return createSupabaseStore(Events);
  if (kind === "local") return createLocalStore(Events);
  return createGuestStore(Events);
}

export function setStoreKind(kind) {
  activeKind = kind;
  activeStore = makeStore(kind);

  activeStore.ensureSessionsArray?.();
  activeStore.ensureProjectsArray?.();

  Events.emit("sessions:changed");
  Events.emit("projects:changed");
  console.log(`Store initialized (${kind})`);
}

export async function initStore() {
  const session = await getSession().catch(() => null);
  setStoreKind(session ? "supabase" : "guest");

  onAuthStateChange((newSession) => {
    setStoreKind(newSession ? "supabase" : "guest");
  });
}

export function getStore() {
  if (!activeStore) throw new Error("Store not initialized");
  return activeStore;
}

export function getStoreKind() {
  return activeKind;
}
