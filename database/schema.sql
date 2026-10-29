CREATE TABLE IF NOT EXISTS posts_queue (
  post_id TEXT PRIMARY KEY,
  post_url TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  author TEXT,
  published_at TEXT NOT NULL,
  queued_at INTEGER NOT NULL,
  sent_at INTEGER
);

CREATE TABLE IF NOT EXISTS notification_control (
  name TEXT PRIMARY KEY,
  last_attempt_at INTEGER
);

INSERT OR IGNORE INTO notification_control (name, last_attempt_at)
VALUES ('telegram_digest', NULL);
