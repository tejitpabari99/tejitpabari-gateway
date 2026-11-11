import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index.js';
import { insertEvent } from '../src/db.js';
import { esc } from '../src/html.js';

const PW = 'correct-horse-battery-staple-123';
const AUTH = { Authorization: 'Basic ' + btoa(`admin:${PW}`) };
const page = (q = '') =>
  worker.fetch(new Request(`https://ping.tejitpabari.com/stats${q}`, { headers: AUTH }), { DB: env.DB, STATS_PASSWORD: PW });

let seq = 0;
const ev = (o) => insertEvent(env.DB, {
  ts: '2026-03-10T10:00:00.000Z', tool_type: 'plugin', tool_name: 'start', event: 'batch_done',
  mode: 'prod', origin: 'claude', run: `r${seq++}`, ...o,
});

describe('esc', () => {
  it('escapes & < > " \' and stringifies', () => {
    expect(esc(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
    expect(esc(null)).toBe('');
    expect(esc(7)).toBe('7');
  });
});

describe('/stats HTML', () => {
  it('AC7: empty DB -> 200 HTML, No data yet rows, zeros', async () => {
    const res = await page();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/html/);
    const body = await res.text();
    expect(body.match(/No data yet/g)).toHaveLength(6);
    expect(body).toMatch(/<div class="big" id="active-orgs">0<\/div>/);
    expect(body).toContain('Production only');
  });

  it('all five security headers', async () => {
    const res = await page();
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-robots-tag')).toBe('noindex');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('content-security-policy')).toBe("default-src 'none'; style-src 'unsafe-inline'");
  });

  it('static page shape: viewport, no JS, scroll wrappers', async () => {
    const body = await (await page()).text();
    expect(body).toMatch(/^<!doctype html>/i);
    expect(body).toContain('<meta name="viewport"');
    expect(body.toLowerCase()).not.toContain('<script');
    expect(body).toContain('<style>');
    expect(body).toContain('class="scroll"');
  });

  it('AC6: hostile org/step/tool_name values are escaped, table intact', async () => {
    await ev({ org: '<script>alert(1)</script>' });
    await ev({ org: '"><img onerror=x>', tool_name: '<b>t</b>' });
    await ev({ org: "'; DROP TABLE events;--", event: 'step_failed', step: '<i>s</i>', reason: '"quote"' });
    const body = await (await page()).text();
    expect(body).not.toContain('<script');
    expect(body).not.toContain('<img');
    expect(body).not.toContain('<b>');
    expect(body).not.toContain('<i>');
    expect(body).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(body).toContain('&quot;&gt;&lt;img onerror=x&gt;');
    expect(body).toContain('&#39;; DROP TABLE events;--');
    expect((await env.DB.prepare('SELECT COUNT(*) c FROM events').first()).c).toBe(3);
  });

  it('extras are never rendered', async () => {
    await ev({ org: 'a', extras: '{"secret_key":"SECRETVAL"}' });
    const body = await (await page()).text();
    expect(body).not.toContain('SECRETVAL');
    expect(body).not.toContain('secret_key');
  });

  it('headline matches seeded data; toggle link and mode label', async () => {
    await ev({ org: 'a' });
    await ev({ org: 'b', event: 'guide_started' });
    await ev({ org: 'c', event: 'setup_done' });
    await ev({ org: 'tester', mode: 'test' });
    const prod = await (await page()).text();
    expect(prod).toMatch(/id="active-orgs">2</);
    expect(prod).toContain('Production only');
    expect(prod).toContain('<a href="/stats?test=1">Include test runs</a>');
    expect(prod).not.toContain('tester');
    const all = await (await page('?test=1')).text();
    expect(all).toMatch(/id="active-orgs">3</);
    expect(all).toContain('Including test runs');
    expect(all).toContain('<a href="/stats">Production only</a>');
    expect(all).toContain('tester');
    expect(all).toMatch(/Generated \d{4}-\d\d-\d\d \d\d:\d\d:\d\d UTC/);
  });

  it('renders per-month, per-tool, origins and failing sections with data', async () => {
    await ev({ org: 'a', n: 4, ok: 3, fail: 1 });
    await ev({ org: 'a', event: 'step_failed', step: 'send', reason: 'quota' });
    const body = await (await page()).text();
    expect(body).toContain('2026-03');
    expect(body).toContain('send');
    expect(body).toContain('quota');
    expect(body).toContain('claude');
    expect(body).not.toContain('No data yet');
  });
});
