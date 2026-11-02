-- Verified study time now reaches the leaderboard only once the client has saved the session.
-- A finished verified session that carries a local_session_key waits (committed_at IS NULL)
-- until /verified-session/commit credits all of that key's pieces at once: their minutes plus a
-- single session. Pausing, a settled-then-restarted session, or a discarded session therefore
-- adds nothing on its own. Keyless sessions (older clients) are still credited on finish.
ALTER TABLE verified_study_sessions ADD COLUMN committed_at TEXT;
