// src/auth/auth.js
import { supabase } from "./supabaseClient.js";
import { DOM } from "../core/dom.js";

let authWired = false;

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function onAuthStateChange(cb) {
  return supabase.auth.onAuthStateChange((_event, session) => cb(session));
}

// Save username into user_data.data_json (minimal)
async function saveUsername(username) {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const user = data?.user;
  if (!user) throw new Error("Not authenticated");

  const { data: existing, error: readErr } = await supabase
    .from("user_data")
    .select("data_json")
    .eq("user_id", user.id)
    .maybeSingle();

  if (readErr) throw readErr;

  const current = existing?.data_json && typeof existing.data_json === "object"
    ? existing.data_json
    : {};

  const nextJson = { ...current, username };

  const { error: upsertErr } = await supabase.from("user_data").upsert({
    user_id: user.id,
    data_json: nextJson,
  });

  if (upsertErr) throw upsertErr;
}


async function getUsername() {
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  const user = userRes?.user;
  if (!user) return "";

  const { data, error } = await supabase
    .from("user_data")
    .select("data_json")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw error;
  return data?.data_json?.username ?? "";
}


async function showApp(session) {
  DOM.loginContainer?.classList.add("hidden");
  DOM.appContainer?.classList.remove("hidden");
  const username = await getUsername().catch(() => "");
  if (DOM.currentUser) DOM.currentUser.textContent = username || session.user.email;
}

function showAuth(mode = "login") {
  DOM.loginContainer?.classList.remove("hidden");
  DOM.appContainer?.classList.add("hidden");

  const signup = mode === "signup";
  DOM.loginForm?.classList.toggle("hidden", signup);
  DOM.signupForm?.classList.toggle("hidden", !signup);

  if (DOM.loginError) DOM.loginError.textContent = "";
  if (DOM.signupError) DOM.signupError.textContent = "";
}

export async function initAuth() {
  if (authWired) return;
  authWired = true;
    
  // Toggle links
  DOM.showSignup?.addEventListener("click", (e) => {
    e.preventDefault();
    showAuth("signup");
  });

  DOM.showLogin?.addEventListener("click", (e) => {
    e.preventDefault();
    showAuth("login");
  });

  // Login
  DOM.loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (DOM.loginError) DOM.loginError.textContent = "";

    try {
      const email = DOM.loginUsername?.value?.trim() ?? ""; // (name is legacy)
      const password = DOM.loginPassword?.value ?? "";
      await signIn(email, password);
      // UI updates happen from onAuthStateChange
    } catch (err) {
      if (DOM.loginError) DOM.loginError.textContent = err?.message ?? String(err);
    }
  });

  // Signup (email + username + password)
  DOM.signupForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (DOM.signupError) DOM.signupError.textContent = "";

    try {
      const email = DOM.signupEmail?.value?.trim() ?? "";
      const username = DOM.signupUsername?.value?.trim() ?? "";
      const password = DOM.signupPassword?.value ?? "";

      if (!email) throw new Error("Please enter an email.");
      if (!username) throw new Error("Please enter a username.");
      if (!password) throw new Error("Please enter a password.");

      localStorage.setItem("pending_username", username);
      await signUp(email, password);

      // If email confirmations are ON, the user may not be signed in yet.
      // Try to save username only if we have a session/user.
      try {
        await saveUsername(username);
        localStorage.removeItem("pending_username");
      } catch {
        // ignore if not signed in yet (email confirm flow)
      }

      showAuth("login");
    } catch (err) {
      if (DOM.signupError) DOM.signupError.textContent = err?.message ?? String(err);
    }
  });

  // Logout
  DOM.logoutButton?.addEventListener("click", (e) => {
    e.preventDefault();

    // instant UI feedback
    DOM.logoutButton.disabled = true;
    showAuth("login");

    // do the real sign-out (async) without freezing clicks
    signOut()
      .catch((err) => {
        // if signOut fails, show error and let user try again
        if (DOM.loginError) DOM.loginError.textContent = err?.message ?? String(err);
      })
      .finally(() => {
        DOM.logoutButton.disabled = false;
      });
  });

  // Initial + reactive auth UI
  const session = await getSession().catch(() => null);
  // session ? showApp(session) : showAuth("login");
  if (session) {
    const pending = localStorage.getItem("pending_username") || "";
    if (pending) {
      try {
        await saveUsername(pending);
        localStorage.removeItem("pending_username");
      } catch {}
    }
    await showApp(session);
  } else {
    showAuth("login");
  }

  onAuthStateChange(async (newSession) => {
    if (!newSession) return showAuth("login");

    // If username isn't in DB yet, try to commit pending username now (we are authenticated)
    const existingUsername = await getUsername().catch(() => "");
    if (!existingUsername) {
      const pending = localStorage.getItem("pending_username") || "";
      if (pending) {
        await saveUsername(pending).catch((e) => console.error("Failed to save pending username:", e));
        localStorage.removeItem("pending_username");
      }
    }
    await showApp(newSession);
  });
}
