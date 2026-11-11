import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index.js';
import { insertEvent } from '../src/db.js';
import { ORGS_EXCLUDE } from '../src/config.js';
import { queryStats } from '../src/stats.js';
import { checkAuth } from '../src/auth.js';

const PW = 'correct-horse-battery-staple-123';
const basic = (u, p) => 'Basic ' + btoa(`${u}:${p}`);
const get = (path, headers = {}, secret = PW) =>
  worker.fetch(new Request(`https://ping.tejitpabari.com${path}`, { headers }), secret === 'UNSET' ? { DB: env.DB } : { DB: env.DB, STATS_PASSWORD: secret });

let seq = 0;
const ev = (o) => insertEvent(env.DB, {
  ts: '2026-03-10T10:00:00.000Z', tool_type: 'plugin', tool_name: 'start', event: 'batch_done',
  mode: 'prod', origin: 'claude', n: null, ok: null, fail: null, run: `r${seq++}`, ...o,
});
const NOW = new Date('2026-11-10T12:00:00Z');
const stats = (opts = {}) => queryStats(env.DB, { includeTest: false, now: NOW, ...opts });

describe('auth (AC5)', () => {
  it('config excludes tejit_test by default', () => {
    expect(ORGS_EXCLUDE).toEqual(['tejit_test']);
  });
  it('401 + WWW-Authenticate without creds', async () => {
    const res = await get('/stats');
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toBe('Basic realm="stats"');
  });
  it('401 wrong password, wrong user, garbage header', async () => {
    for (const h of [basic('admin', 'nope'), basic('root', PW), 'Basic !!!notb64', 'Bearer x', basic('admin', PW + 'x'), basic('admin', '')]) {
      const res = await get('/stats', { Authorization: h });
      expect(res.status).toBe(401);
      expect(res.headers.get('www-authenticate')).toBe('Basic realm="stats"');
    }
  });
  it('503 when secret unset or empty (fail closed), even with creds', async () => {
    for (const s of ['UNSET', '']) {
      const res = await get('/stats', { Authorization: basic('admin', '') }, s);
      expect(res.status).toBe(503);
    }
  });
  it('correct creds reach the stats handler (200)', async () => {
    const res = await get('/stats', { Authorization: basic('admin', PW) });
    expect(res.status).toBe(200);
  });
  it('password containing colon and non-ascii works', async () => {
    const p = 'pä:ss:wörd-long-enough-xx';
    expect(await checkAuth(new Request('https://x/stats', { headers: { Authorization: 'Basic ' + btoa(unescape(encodeURIComponent('admin:' + p))) } }), p)).toBe(true);
  });
  it('non-GET /stats and unauthenticated paths still 404 elsewhere', async () => {
    const res = await worker.fetch(new Request('https://x/stats', { method: 'POST', headers: { Authorization: basic('admin', PW) } }), { DB: env.DB, STATS_PASSWORD: PW });
    expect(res.status).toBe(404);
  });
});

describe('queryStats zero data', () => {
  it('returns empty sets and zeros without throwing', async () => {
    const s = await stats();
    expect(s.activeOrgs).toBe(0);
    expect(s.activeOrgsByMonth).toEqual([]);
    expect(s.totals).toMatchObject({ events: 0, uids: 0, items: 0, first: null, last: null });
    for (const k of ['toolMonth', 'toolAllTime', 'orgs', 'origins', 'failingSteps']) expect(s[k]).toEqual([]);
  });
});

describe('queryStats AC5b hygiene', () => {
  it('counts only prod batch_done/guide_started, known origin, non-excluded orgs', async () => {
    await ev({ org: 'good_a' });
    await ev({ org: 'good_b', event: 'guide_started' });
    await ev({ org: 'only_setup', event: 'setup_done' });
    await ev({ org: 'from_scanner', origin: 'other' });
    await ev({ org: 'tester', mode: 'test' });
    await ev({ org: 'tejit_test' });
    await ev({ org: 'good_a' });
    const s = await stats();
    expect(s.activeOrgs).toBe(2);
    expect(s.activeOrgsByMonth).toEqual([{ month: '2026-03', orgs: 2 }]);
    const names = s.orgs.map((o) => o.org).sort();
    expect(names).toEqual(['good_a', 'good_b', 'only_setup']);
    const t = await stats({ includeTest: true });
    expect(t.activeOrgs).toBe(3);
    expect(t.orgs.map((o) => o.org)).toContain('tester');
    expect(t.orgs.map((o) => o.org)).not.toContain('tejit_test');
    expect(t.orgs.map((o) => o.org)).not.toContain('from_scanner');
  });
  it('origins table lists every origin including other and test is mode-filtered', async () => {
    await ev({ org: 'a', origin: 'other' });
    await ev({ org: 'b', origin: 'claude' });
    await ev({ org: 'c', origin: 'claude' });
    await ev({ org: 'd', origin: 'gemini', mode: 'test' });
    const s = await stats();
    expect(s.origins).toEqual([
      { origin: 'claude', events: 2, orgs: 2 },
      { origin: 'other', events: 1, orgs: 1 },
    ]);
  });
  it('null-org rows are kept in totals and shown as (none) in org list', async () => {
    await ev({ org: null, n: 3 });
    const s = await stats();
    expect(s.totals.events).toBe(1);
    expect(s.activeOrgs).toBe(0);
    expect(s.orgs[0].org).toBe('(none)');
  });
});

describe('queryStats aggregates', () => {
  it('per tool x month, all-time per tool, totals, org list', async () => {
    await ev({ tool_name: 'start', org: 'a', uid: 'u_00000001', ts: '2026-03-05T00:00:00.000Z', n: 10, ok: 8, fail: 2 });
    await ev({ tool_name: 'start', org: 'b', uid: 'u_00000002', ts: '2026-03-20T00:00:00.000Z', n: 5, ok: 5, fail: 0 });
    await ev({ tool_name: 'start', org: 'a', uid: 'u_00000001', ts: '2026-04-02T00:00:00.000Z', n: 1, ok: 1, fail: 0 });
    await ev({ tool_name: 'start', org: 'a', event: 'setup_done', ts: '2026-04-03T00:00:00.000Z' });
    await ev({ tool_name: 'auto-emailer', tool_type: 'script', origin: 'google_script', org: 'b', ts: '2026-04-04T00:00:00.000Z', n: 7, ok: 7, fail: 0 });
    const s = await stats();
    expect(s.totals).toMatchObject({ events: 5, uids: 2, items: 23, first: '2026-03-05T00:00:00.000Z', last: '2026-04-04T00:00:00.000Z' });
    expect(s.toolMonth).toEqual([
      { tool_name: 'auto-emailer', month: '2026-04', batches: 1, items: 7, ok: 7, fail: 0, orgs: 1, uids: 0 },
      { tool_name: 'start', month: '2026-04', batches: 1, items: 1, ok: 1, fail: 0, orgs: 1, uids: 1 },
      { tool_name: 'start', month: '2026-03', batches: 2, items: 15, ok: 13, fail: 2, orgs: 2, uids: 2 },
    ]);
    expect(s.toolAllTime).toEqual([
      { tool_name: 'start', batches: 3, items: 16, ok: 14, fail: 2, orgs: 2, uids: 2 },
      { tool_name: 'auto-emailer', batches: 1, items: 7, ok: 7, fail: 0, orgs: 1, uids: 0 },
    ]);
    expect(s.activeOrgs).toBe(2);
    expect(s.activeOrgsByMonth).toEqual([{ month: '2026-04', orgs: 2 }, { month: '2026-03', orgs: 2 }]);
    const a = s.orgs.find((o) => o.org === 'a');
    expect(a).toMatchObject({ tools: 1, batches: 2, items: 11, first: '2026-03-05T00:00:00.000Z', last: '2026-04-03T00:00:00.000Z' });
    expect(s.orgs[0].batches).toBeGreaterThanOrEqual(s.orgs[1].batches);
  });
  it('per-month rows limited to last 24 months', async () => {
    await ev({ org: 'old', ts: '2024-01-15T00:00:00.000Z' });
    await ev({ org: 'new', ts: '2025-01-15T00:00:00.000Z' });
    const s = await stats();
    expect(s.toolMonth.map((r) => r.month)).toEqual(['2025-01']);
    expect(s.toolAllTime[0].batches).toBe(2);
  });
  it('top failing steps from step_failed, (none) for missing reason', async () => {
    await ev({ event: 'step_failed', tool_type: 'script', tool_name: 'auto-emailer', origin: 'google_script', org: 'a', step: 'read_sheet', reason: 'no_access' });
    await ev({ event: 'step_failed', tool_type: 'script', tool_name: 'auto-emailer', origin: 'google_script', org: 'a', step: 'read_sheet', reason: 'no_access' });
    await ev({ event: 'step_failed', org: 'a', step: 'send', reason: null });
    const s = await stats();
    expect(s.failingSteps).toEqual([
      { tool_name: 'auto-emailer', step: 'read_sheet', reason: 'no_access', count: 2 },
      { tool_name: 'start', step: 'send', reason: '(none)', count: 1 },
    ]);
  });
  it('SQL-ish values are only ever data', async () => {
    await ev({ org: "x'; drop table events;--" });
    const s = await stats();
    expect(s.orgs[0].org).toBe("x'; drop table events;--");
    expect((await env.DB.prepare('SELECT COUNT(*) c FROM events').first()).c).toBe(1);
  });
});
