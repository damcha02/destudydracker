export function createGuestStore(emitter) {
  return {
    getCurrentUsername() { return "Guest"; },
    getSessions() { return []; },
    addSession() {
      // do nothing, but you *can* emit if you want stats to refresh as empty
      emitter.emit("sessions:changed");
    },
    getProjects() { return []; },
    setProjects() {
      emitter.emit("projects:changed");
    },
  };
}
