CREATE TABLE IF NOT EXISTS sites (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cameras (
  id SERIAL PRIMARY KEY,
  asset_code TEXT UNIQUE NOT NULL,
  site_id INTEGER NOT NULL REFERENCES sites(id),
  name TEXT NOT NULL,
  retention_days INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'unknown',
  last_seen_at TEXT
);
CREATE TABLE IF NOT EXISTS checkins (
  id SERIAL PRIMARY KEY,
  camera_id INTEGER NOT NULL REFERENCES cameras(id),
  checked_at TEXT NOT NULL,
  online BOOLEAN NOT NULL,
  recording BOOLEAN NOT NULL,
  storage_used_pct INTEGER NOT NULL,
  last_frame_at TEXT
);
CREATE TABLE IF NOT EXISTS alerts (
  id SERIAL PRIMARY KEY,
  camera_id INTEGER NOT NULL REFERENCES cameras(id),
  kind TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  detail TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS activities (
  id SERIAL PRIMARY KEY,
  camera_id INTEGER NOT NULL REFERENCES cameras(id),
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);
