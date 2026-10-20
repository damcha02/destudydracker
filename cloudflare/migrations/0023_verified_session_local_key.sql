-- One local study session can span several verified sessions (pause/resume, a late heartbeat
-- that let the server settle the old one, a break in between). Each verified session used to
-- add one to the leaderboard's session count, so a single session could show up as 3 or 4.
-- The client now sends a key for its local session; only the first verified session per key
-- counts as a session. Minutes are unaffected.
ALTER TABLE verified_study_sessions ADD COLUMN local_session_key TEXT;
ALTER TABLE verified_study_sessions ADD COLUMN counts_session INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_verified_study_sessions_user_local_key
  ON verified_study_sessions(user_id, local_session_key);
