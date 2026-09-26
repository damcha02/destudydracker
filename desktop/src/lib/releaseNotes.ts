export type ReleaseNote = {
  title: string;
  items: { icon: string; heading: string; body: string }[];
};

// Add an entry for each release you want announced. Versions without an entry show nothing.
export const RELEASE_NOTES: Record<string, ReleaseNote> = {
  "0.1.66": {
    title: "Fresh out of the oven",
    items: [
      { icon: "✨", heading: "What's new popup", body: "You now see what changed every time the app updates." },
    ],
  },
};

const LAST_SEEN_KEY = "study-tracker-last-seen-version";

/** Returns the note to show for this boot, and records the version as seen. */
export function consumeReleaseNote(version: string): { note: ReleaseNote; version: string } | null {
  try {
    const last = localStorage.getItem(LAST_SEEN_KEY);
    localStorage.setItem(LAST_SEEN_KEY, version);
    // Fresh install: nothing "changed" from the user's point of view.
    if (last === null || last === version) return null;
    const note = RELEASE_NOTES[version];
    return note ? { note, version } : null;
  } catch {
    return null;
  }
}
