CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  tool_type TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  event TEXT NOT NULL,
  mode TEXT NOT NULL,
  v TEXT,
  org TEXT,
  uid TEXT,
  n INTEGER,
  ok INTEGER,
  fail INTEGER,
  step TEXT,
  reason TEXT,
  origin TEXT NOT NULL,
  run TEXT,
  extras TEXT
);
CREATE INDEX events_ts ON events(ts);
CREATE INDEX events_mode_tool_ts ON events(mode, tool_name, ts);
CREATE INDEX events_org ON events(org);
CREATE UNIQUE INDEX events_dedupe ON events(uid, event, run) WHERE run IS NOT NULL;
