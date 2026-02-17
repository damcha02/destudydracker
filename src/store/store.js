// src/store/store.js
import { createLocalStore } from "./localStore.js";
import { createSupabaseStore } from "./supabaseStore.js";
import { getSession, onAuthStateChange } from "../auth/auth.js";
import { Events } from "../core/events.js";

let activeStore = null;
let activeKind = "local"; // "local" | "supabase"

function setActive(kind) {
  activeKind = kind;
  activeStore = kind === "supabase"
    ? createSupabaseStore(Events)
    : createLocalStore(Events);

  // Back-compat safety for local store only
  activeStore.ensureSessionsArray?.();
  activeStore.ensureProjectsArray?.();

  // Refresh UI
  Events.emit("sessions:changed");
  Events.emit("projects:changed");

  console.log(`Store initialized (${kind})`);
}

export async function initStore() {
  const session = await getSession().catch(() => null);
  setActive(session ? "supabase" : "local");

  onAuthStateChange((newSession) => {
    setActive(newSession ? "supabase" : "local");
  });
}

export function getStore() {
  if (!activeStore) throw new Error("Store not initialized");
  return activeStore;
}

export function getStoreKind() {
  return activeKind;
}
