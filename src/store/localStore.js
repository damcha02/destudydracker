// src/store/localStore.js

const STORAGE_KEY = "study_tracker_app";

function loadApp() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { users: {}, currentUser: null };
  try {
    const app = JSON.parse(raw);
    return app && typeof app === "object" ? app : { users: {}, currentUser: null };
  } catch {
    return { users: {}, currentUser: null };
  }
}

function saveApp(app) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(app));
}

function getUser(app) {
  if (!app.currentUser) return null;
  return app.users?.[app.currentUser] ?? null;
}

export function createLocalStore(emitter) {
  return {
    // For now: we assume "currentUser" exists in local mode
    getCurrentUsername() {
      return loadApp().currentUser;
    },

    ensureSessionsArray() {
      const app = loadApp();
      const user = getUser(app);
      if (!user) return;
      if (!Array.isArray(user.sessions)) user.sessions = [];
      saveApp(app);
    },

    addSession({ date, minutes, isExam }) {
      const app = loadApp();
      const user = getUser(app);
      if (!user) return;

      if (!Array.isArray(user.sessions)) user.sessions = [];
      user.sessions.push({
        date,
        minutes,
        exam: !!isExam
      });
      saveApp(app);

      // window.dispatchEvent(new CustomEvent("sessions:changed"));
      emitter.emit("sessions:changed");
    },

    getSessions() {
      const app = loadApp();
      const user = getUser(app);
      return Array.isArray(user?.sessions) ? user.sessions : [];
    },
    
    getProjects() {
      const app = loadApp();
      const user = getUser(app);
      return Array.isArray(user?.projects) ? user.projects : [];
    },

    setProjects(projects) {
      const app = loadApp();
      const user = getUser(app);
      if (!user) return;
      user.projects = Array.isArray(projects) ? projects : [];
      saveApp(app);

      // window.dispatchEvent(new CustomEvent("projects:changed"));
      emitter.emit("projects:changed");
    },

    ensureProjectsArray() {
      const app = loadApp();
      const user = getUser(app);
      if (!user) return;
      if (!Array.isArray(user.projects)) user.projects = [];
      saveApp(app);
    }

  };
}
