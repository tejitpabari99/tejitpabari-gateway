const COLS = [
  'ts', 'tool_type', 'tool_name', 'event', 'mode', 'v', 'org', 'uid',
  'n', 'ok', 'fail', 'step', 'reason', 'origin', 'run', 'extras',
];
const SQL = `INSERT OR IGNORE INTO events (${COLS.join(', ')}) VALUES (${COLS.map(() => '?').join(', ')})`;

// Insert one normalized row. Never throws: failures are logged and swallowed.
export async function insertEvent(db, row) {
  try {
    await db.prepare(SQL).bind(...COLS.map((c) => row[c] ?? null)).run();
    return true;
  } catch (err) {
    console.error('usage-ping insert failed', err && err.message);
    return false;
  }
}
