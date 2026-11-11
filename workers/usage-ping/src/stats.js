import { ORGS_EXCLUDE, KNOWN_ORIGINS } from './config.js';

const ACTIVE_EVENTS = ['batch_done', 'guide_started'];

const ph = (arr) => arr.map(() => '?').join(', ');

// Months back (inclusive of current) shown in per-month tables.
const MONTHS = 24;

function cutoff(now) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (MONTHS - 1), 1));
  return d.toISOString();
}

// One D1 batch of aggregate SELECTs. All values are bound; the only dynamic SQL
// is the mode literal and placeholder lists sized from constants.
export async function queryStats(db, { includeTest = false, now = new Date(), excluded = ORGS_EXCLUDE } = {}) {
  const modeSql = includeTest ? '' : " AND mode = 'prod'";
  const exclSql = excluded.length ? ` AND (org IS NULL OR org NOT IN (${ph(excluded)}))` : '';
  const known = ` AND origin IN (${ph(KNOWN_ORIGINS)})`;
  const baseAll = `1=1${modeSql}${exclSql}`; // no origin filter (origins table)
  const base = `${baseAll}${known}`;
  const bAll = [...excluded];
  const b = [...excluded, ...KNOWN_ORIGINS];
  const act = `event IN (${ph(ACTIVE_EVENTS)}) AND org IS NOT NULL`;
  const actCase = `COUNT(DISTINCT CASE WHEN ${act} THEN org END)`;
  const since = cutoff(now);
  const P = (sql, ...params) => db.prepare(sql).bind(...params);

  const toolCols = `tool_name,
    SUM(event = 'batch_done') AS batches, COALESCE(SUM(n), 0) AS items,
    COALESCE(SUM(ok), 0) AS ok, COALESCE(SUM(fail), 0) AS fail,
    ${actCase} AS orgs, COUNT(DISTINCT uid) AS uids`;

  const res = await db.batch([
    P(`SELECT COUNT(*) AS events, COUNT(DISTINCT uid) AS uids, COALESCE(SUM(n), 0) AS items,
        MIN(ts) AS first, MAX(ts) AS last FROM events WHERE ${base}`, ...b),
    P(`SELECT COUNT(DISTINCT org) AS orgs FROM events WHERE ${base} AND ${act}`, ...b, ...ACTIVE_EVENTS),
    P(`SELECT substr(ts, 1, 7) AS month, COUNT(DISTINCT org) AS orgs FROM events
        WHERE ${base} AND ${act} AND ts >= ? GROUP BY month ORDER BY month DESC LIMIT ${MONTHS}`,
      ...b, ...ACTIVE_EVENTS, since),
    P(`SELECT ${toolCols.replace('tool_name,', 'tool_name, substr(ts, 1, 7) AS month,')} FROM events
        WHERE ${base} AND ts >= ? GROUP BY tool_name, month ORDER BY month DESC, tool_name ASC`,
      ...ACTIVE_EVENTS, ...b, since),
    P(`SELECT ${toolCols} FROM events WHERE ${base} GROUP BY tool_name ORDER BY batches DESC, tool_name ASC`,
      ...ACTIVE_EVENTS, ...b),
    P(`SELECT COALESCE(org, '(none)') AS org, COUNT(DISTINCT tool_name) AS tools,
        SUM(event = 'batch_done') AS batches, COALESCE(SUM(n), 0) AS items,
        MIN(ts) AS first, MAX(ts) AS last FROM events WHERE ${base}
        GROUP BY org ORDER BY batches DESC, items DESC, org ASC LIMIT 200`, ...b),
    P(`SELECT origin, COUNT(*) AS events, COUNT(DISTINCT org) AS orgs FROM events
        WHERE ${baseAll} GROUP BY origin ORDER BY events DESC, origin ASC`, ...bAll),
    P(`SELECT tool_name, COALESCE(step, '(none)') AS step, COALESCE(reason, '(none)') AS reason,
        COUNT(*) AS count FROM events WHERE ${base} AND event = 'step_failed'
        GROUP BY tool_name, step, reason ORDER BY count DESC, tool_name ASC, step ASC LIMIT 20`, ...b),
  ]);
  const rows = (i) => res[i].results;

  return {
    includeTest,
    totals: rows(0)[0],
    activeOrgs: rows(1)[0].orgs,
    activeOrgsByMonth: rows(2),
    toolMonth: rows(3),
    toolAllTime: rows(4),
    orgs: rows(5),
    origins: rows(6),
    failingSteps: rows(7),
  };
}
