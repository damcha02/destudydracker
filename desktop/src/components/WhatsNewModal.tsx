import { useEffect } from "react";
import type { ReleaseNote } from "../lib/releaseNotes";

type Props = { version: string; note: ReleaseNote; onClose: () => void };

export function WhatsNewModal({ version, note, onClose }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Enter") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="whatsnew-backdrop" onClick={onClose}>
      <div className="whatsnew-card" role="dialog" aria-modal="true" aria-labelledby="whatsnew-title" onClick={(event) => event.stopPropagation()}>
        <div className="whatsnew-hero">
          <span className="whatsnew-badge">Updated to v{version}</span>
          <h2 id="whatsnew-title">{note.title}</h2>
          <p>Here's what's new since you last stopped by.</p>
        </div>
        <ul className="whatsnew-list">
          {note.items.map((item) => (
            <li key={item.heading}>
              <span className="whatsnew-icon" aria-hidden="true">{item.icon}</span>
              <div>
                <strong>{item.heading}</strong>
                <span>{item.body}</span>
              </div>
            </li>
          ))}
        </ul>
        <button type="button" className="whatsnew-cta" autoFocus onClick={onClose}>Let's go</button>
      </div>
    </div>
  );
}
