import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, vi } from 'vitest';
import worker from '../src/index.js';

const H = 'https://ping.tejitpabari.com';
const P = '/ping?tool_type=plugin&tool_name=start&event=setup_done';
const count = async () => (await env.DB.prepare('SELECT COUNT(*) c FROM events').first()).c;
const rows = async () => (await env.DB.prepare('SELECT * FROM events').all()).results;

describe('GET /ping', () => {
  it('AC1: valid ping -> 200 ok text/plain no-store, one row, no UA/IP/country', async () => {
    const res = await SELF.fetch(
      `${H}${P}&org=Red%20Cross&uid=u_0a1b2c3d&mode=test`,
      { headers: { 'User-Agent': 'SECRET-UA/9.9', 'CF-Connecting-IP': '203.0.113.7' }, redirect: 'manual' },
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
    expect(res.headers.get('content-type')).toMatch(/^text\/plain/);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const r = await rows();
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ org: 'red_cross', origin: 'other', mode: 'test', uid: 'u_0a1b2c3d', tool_name: 'start' });
    expect(r[0].ts).toMatch(/Z$/);
    const dump = JSON.stringify(r);
    expect(dump).not.toContain('SECRET-UA');
    expect(dump).not.toContain('203.0.113.7');
    expect(Object.keys(r[0])).not.toContain('country');
  });

  it('never redirects (http, trailing path variants handled without 3xx)', async () => {
    const res = await SELF.fetch(`http://ping.tejitpabari.com${P}`, { redirect: 'manual' });
    expect(res.status).toBe(200);
  });

  it('AC2: missing event -> ok, zero rows', async () => {
    const res = await SELF.fetch(`${H}/ping?tool_type=plugin&tool_name=start`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await count()).toBe(0);
  });

  it('bare /ping -> ok, zero rows', async () => {
    const res = await SELF.fetch(`${H}/ping`);
    expect(res.status).toBe(200);
    expect(await count()).toBe(0);
  });

  it('UA derives origin but is not stored', async () => {
    await SELF.fetch(`${H}${P}`, { headers: { 'User-Agent': 'Mozilla Claude-User/1.0' } });
    const [r] = await rows();
    expect(r.origin).toBe('claude');
    expect(JSON.stringify(r)).not.toContain('Mozilla');
  });

  it('SQL-ish org stored literally, table intact', async () => {
    const res = await SELF.fetch(`${H}${P}&org=${encodeURIComponent("'; DROP TABLE events;--")}`);
    expect(await res.text()).toBe('ok');
    const [r] = await rows();
    expect(r.org).toBe("';_drop_table_events;--");
    expect(await count()).toBe(1);
  });

  it('5a: same uid+event+x_run twice -> one row, both ok; run column set, not in extras', async () => {
    const u = `${H}${P}&uid=u_0a1b2c3d&x_run=run1`;
    const a = await SELF.fetch(u);
    const b = await SELF.fetch(u);
    expect(await a.text()).toBe('ok');
    expect(await b.text()).toBe('ok');
    const r = await rows();
    expect(r).toHaveLength(1);
    expect(r[0].run).toBe('run1');
    expect(r[0].extras).toBeNull();
  });

  it('5a: same without x_run twice -> two rows', async () => {
    const u = `${H}${P}&uid=u_0a1b2c3d`;
    await SELF.fetch(u);
    await SELF.fetch(u);
    expect(await count()).toBe(2);
  });

  it('forced DB failure still returns ok and logs', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const badEnv = {
      DB: {
        prepare() {
          throw new Error('boom');
        },
      },
    };
    const res = await worker.fetch(new Request(`${H}${P}`), badEnv, {});
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('forced async DB failure (run rejects) still ok', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const badEnv = { DB: { prepare: () => ({ bind: () => ({ run: () => Promise.reject(new Error('x')) }) }) } };
    const res = await worker.fetch(new Request(`${H}${P}`), badEnv, {});
    expect(await res.text()).toBe('ok');
    spy.mockRestore();
  });
});

describe('HEAD', () => {
  it('HEAD /ping -> 200, no body, nothing stored', async () => {
    const res = await SELF.fetch(`${H}${P}`, { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
    expect(await count()).toBe(0);
  });
  it('HEAD /robots.txt -> 200, no body', async () => {
    const res = await SELF.fetch(`${H}/robots.txt`, { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
  });
});

describe('/robots.txt', () => {
  it('allows /ping, never mentions stats', async () => {
    const res = await SELF.fetch(`${H}/robots.txt`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/plain/);
    const t = await res.text();
    expect(t).toContain('User-agent: *');
    expect(t).toContain('Allow: /ping');
    expect(t.toLowerCase()).not.toContain('stats');
  });
});

describe('404', () => {
  for (const p of ['/.env', '/.git/HEAD', '/backup.sql', '/__hits', '/', '/ping/', '/robots.txt/x']) {
    it(`GET ${p} -> 404, nothing stored`, async () => {
      const res = await SELF.fetch(`${H}${p}?tool_type=plugin&tool_name=a&event=b`);
      expect(res.status).toBe(404);
      expect(await count()).toBe(0);
    });
  }
  for (const m of ['POST', 'PUT', 'DELETE', 'PATCH']) {
    it(`${m} /ping -> 404, nothing stored`, async () => {
      const res = await SELF.fetch(`${H}${P}`, { method: m, body: m === 'DELETE' ? undefined : 'x' });
      expect(res.status).toBe(404);
      expect(await count()).toBe(0);
    });
  }
  it('POST /robots.txt -> 404', async () => {
    expect((await SELF.fetch(`${H}/robots.txt`, { method: 'POST', body: 'x' })).status).toBe(404);
  });
  it('HEAD on other path -> 404', async () => {
    expect((await SELF.fetch(`${H}/.env`, { method: 'HEAD' })).status).toBe(404);
  });
});
