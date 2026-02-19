// src/core/events.js
export function createEventBus() {
  const handlers = new Map(); // event -> Set(callback)

  function on(event, cb) {
    if (!handlers.has(event)) handlers.set(event, new Set());
    handlers.get(event).add(cb);
    return () => off(event, cb);
  }

  function off(event, cb) {
    const set = handlers.get(event);
    if (!set) return;
    set.delete(cb);
    if (set.size === 0) handlers.delete(event);
  }

  function emit(event, detail) {
    const set = handlers.get(event);
    if (!set) return;

    const list = Array.from(set); // snapshot

    for (const cb of list) {
      try {
        cb({ detail });
      } catch (err) {
        console.error(`Error in handler for "${event}"`, err);
      }
    }
  }



  return { on, off, emit };
}

// singleton for the whole app
export const Events = createEventBus();
