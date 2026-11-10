import { describe, it, expect } from 'vitest';
import { normalizePing } from '../src/ingest.js';

const B = 'https://ping.tejitpabari.com/ping?tool_type=plugin&tool_name=start&event=setup_done';
const n = (q = '', ua = null) => normalizePing(B + (q ? '&' + q : ''), ua);

describe('required fields', () => {
  it('valid minimal ping returns a row with defaults', () => {
    const r = n();
    expect(r).toMatchObject({
      tool_type: 'plugin', tool_name: 'start', event: 'setup_done', mode: 'prod',
      v: null, org: null, uid: null, n: null, ok: null, fail: null,
      step: null, reason: null, origin: 'other', run: null, extras: null,
    });
    expect(r.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
  it('missing/empty tool_type, tool_name, event => null', () => {
    expect(normalizePing('https://x/ping?tool_name=a&event=b')).toBeNull();
    expect(normalizePing('https://x/ping?tool_type=&tool_name=a&event=b')).toBeNull();
    expect(normalizePing('https://x/ping?tool_type=plugin&event=b')).toBeNull();
    expect(normalizePing('https://x/ping?tool_type=plugin&tool_name=%21%21&event=b')).toBeNull();
    expect(normalizePing('https://x/ping?tool_type=plugin&tool_name=a')).toBeNull();
    expect(normalizePing('https://x/ping?tool_type=plugin&tool_name=a&event=%20')).toBeNull();
  });
  it('first value wins', () => {
    expect(normalizePing(B + '&mode=test&mode=prod').mode).toBe('test');
    expect(normalizePing('https://x/ping?tool_type=plugin&tool_type=script&tool_name=a&event=b').tool_type).toBe('plugin');
  });
});

describe('tool_type / tool_name / event', () => {
  it('tool_type enum + other', () => {
    expect(normalizePing('https://x/ping?tool_type=%20Script%20&tool_name=a&event=b').tool_type).toBe('script');
    expect(normalizePing('https://x/ping?tool_type=foo&tool_name=a&event=b').tool_type).toBe('other');
  });
  it('tool_name sanitized, max 50', () => {
    expect(normalizePing('https://x/ping?tool_type=plugin&tool_name=%20Partner-Event_Finder!%20&event=b').tool_name).toBe('partner-event_finder');
    expect(normalizePing('https://x/ping?tool_type=plugin&tool_name=' + 'a'.repeat(80) + '&event=b').tool_name).toHaveLength(50);
  });
  it('event sanitized (no dash), max 50', () => {
    expect(normalizePing('https://x/ping?tool_type=plugin&tool_name=a&event=Batch-Done').event).toBe('batchdone');
    expect(normalizePing('https://x/ping?tool_type=plugin&tool_name=a&event=' + 'e'.repeat(80)).event).toHaveLength(50);
  });
});

describe('mode / v', () => {
  it('mode enum, default prod', () => {
    expect(n('mode=test').mode).toBe('test');
    expect(n('mode=TEST').mode).toBe('test');
    expect(n('mode=zzz').mode).toBe('prod');
  });
  it('v trimmed, max 20', () => {
    expect(n('v=%20%201.2.3%20').v).toBe('1.2.3');
    expect(n('v=' + '9'.repeat(40)).v).toHaveLength(20);
    expect(n('v=%20').v).toBeNull();
  });
});

describe('org', () => {
  it('Red Cross -> red_cross', () => expect(n('org=Red%20Cross').org).toBe('red_cross'));
  it('whitespace runs collapse', () => expect(n('org=%20Red%20%20%09Cross%20').org).toBe('red_cross'));
  it('@ -> redacted', () => {
    expect(n('org=a%40b.com').org).toBe('redacted');
    expect(n('org=Bob%20at%20x%40y').org).toBe('redacted');
  });
  it('NFC normalized', () => expect(n('org=Cafe%CC%81').org).toBe('café'));
  it('control chars stripped', () => expect(n('org=a%00b%07c%1Fd').org).toBe('abcd'));
  it('max 100', () => expect(n('org=' + 'x'.repeat(300)).org).toHaveLength(100));
  it('empty -> null', () => {
    expect(n('org=').org).toBeNull();
    expect(n('org=%20%20').org).toBeNull();
  });
  it('SQL-ish kept literally (lowercased)', () => {
    expect(n("org=" + encodeURIComponent("'; DROP TABLE events;--")).org).toBe("';_drop_table_events;--");
  });
});

describe('uid', () => {
  it('valid pattern kept', () => expect(n('uid=u_0a1b2c3d').uid).toBe('u_0a1b2c3d'));
  it('invalid -> null', () => {
    expect(n('uid=notvalid').uid).toBeNull();
    expect(n('uid=u_0A1B2C3D').uid).toBeNull();
    expect(n('uid=u_0a1b2c3d9').uid).toBeNull();
    expect(n('uid=u_0a1b2c3').uid).toBeNull();
  });
});

describe('origin', () => {
  it('enum accepted', () => {
    for (const o of ['claude', 'google_script', 'gpt', 'gemini', 'grok', 'perplexity', 'other']) {
      expect(n('origin=' + o).origin).toBe(o);
    }
    expect(n('origin=%20Gemini%20').origin).toBe('gemini');
  });
  it('bad origin + UA claude-user -> claude', () => {
    expect(n('origin=zzz', 'Mozilla/5.0 Claude-User/1.0').origin).toBe('claude');
  });
  it('missing origin + UA google-apps-script', () => {
    expect(n('', 'Mozilla/5.0 (compatible; Google-Apps-Script)').origin).toBe('google_script');
  });
  it('client origin beats UA', () => expect(n('origin=gpt', 'Claude-User/1.0').origin).toBe('gpt'));
  it('nothing usable -> other', () => {
    expect(n('', 'curl/8').origin).toBe('other');
    expect(n('origin=zzz', null).origin).toBe('other');
  });
  it('UA text never in row', () => {
    const r = n('', 'SECRET-UA-STRING Claude-User');
    expect(JSON.stringify(r)).not.toContain('SECRET-UA-STRING');
  });
});

describe('n / ok / fail', () => {
  it('valid ints, bounds', () => {
    const r = n('n=0&ok=5000&fail=12');
    expect([r.n, r.ok, r.fail]).toEqual([0, 5000, 12]);
  });
  it('invalid -> null', () => {
    expect(n('n=999999').n).toBeNull();
    expect(n('n=5001').n).toBeNull();
    expect(n('n=-1').n).toBeNull();
    expect(n('n=1.5').n).toBeNull();
    expect(n('n=abc').n).toBeNull();
    expect(n('n=').n).toBeNull();
    expect(n('ok=1e3').ok).toBeNull();
    expect(n('fail=%2B5').fail).toBeNull();
  });
});

describe('step / reason / x_run', () => {
  it('step sanitized, max 50', () => {
    expect(n('step=Send-Mail%20Now').step).toBe('sendmailnow');
    expect(n('step=' + 's'.repeat(90)).step).toHaveLength(50);
    expect(n('step=').step).toBeNull();
  });
  it('reason enum', () => {
    expect(n('reason=quota').reason).toBe('quota');
    expect(n('reason=zzz').reason).toBe('other');
    expect(n('').reason).toBeNull();
  });
  it('x_run -> run, not in extras', () => {
    const r = n('x_run=Run-ABC_1&foo=bar');
    expect(r.run).toBe('run-abc_1');
    expect(JSON.parse(r.extras)).toEqual({ foo: 'bar' });
    expect(r.extras).not.toContain('x_run');
    expect(n('x_run=' + 'r'.repeat(80)).run).toHaveLength(40);
    expect(n('x_run=').run).toBeNull();
    expect(n('x_run=!!').run).toBeNull();
  });
});

describe('t and reserved keys', () => {
  it('t ignored', () => {
    const r = n('t=abc123');
    expect(r.extras).toBeNull();
    expect(JSON.stringify(r)).not.toContain('abc123');
  });
  it('ts/id/country/client dropped', () => {
    const r = n('ts=1999-01-01&id=7&country=US&client=evil');
    expect(r.extras).toBeNull();
    expect(r.ts).not.toContain('1999');
    expect(r).not.toHaveProperty('id');
    expect(r).not.toHaveProperty('country');
    expect(r).not.toHaveProperty('client');
  });
  it('row has exactly the insert columns', () => {
    expect(Object.keys(n()).sort()).toEqual(
      ['ts', 'tool_type', 'tool_name', 'event', 'mode', 'v', 'org', 'uid', 'n', 'ok', 'fail', 'step', 'reason', 'origin', 'run', 'extras'].sort(),
    );
  });
});

describe('extras', () => {
  it('key lowercased sanitized max 30, value trimmed max 100', () => {
    const r = n('Foo-Bar=%20%20' + 'v'.repeat(300) + '&' + 'k'.repeat(50) + '=1');
    const e = JSON.parse(r.extras);
    expect(e.foobar).toHaveLength(100);
    expect(e['k'.repeat(30)]).toBe('1');
  });
  it('@ values redacted', () => {
    expect(JSON.parse(n('email=a%40b.com').extras)).toEqual({ email: 'redacted' });
  });
  it('30 extra keys -> <= 20 keys, <= 1024 B', () => {
    let q = '';
    for (let i = 0; i < 30; i++) q += `k${i}=v${i}&`;
    const e = n(q).extras;
    expect(Object.keys(JSON.parse(e)).length).toBe(20);
    expect(new TextEncoder().encode(e).length).toBeLessThanOrEqual(1024);
  });
  it('big values -> serialized <= 1024 B, excess keys dropped', () => {
    let q = '';
    for (let i = 0; i < 15; i++) q += `k${i}=${"z".repeat(100)}&`;
    const e = n(q).extras;
    const bytes = new TextEncoder().encode(e).length;
    expect(bytes).toBeLessThanOrEqual(1024);
    expect(Object.keys(JSON.parse(e)).length).toBeLessThan(15);
    expect(Object.keys(JSON.parse(e)).length).toBeGreaterThan(0);
  });
  it('empty key / empty after sanitize skipped; null when none', () => {
    expect(n('=x&%21%21=y').extras).toBeNull();
  });
  it('first value wins for extras', () => {
    expect(JSON.parse(n('foo=1&foo=2').extras)).toEqual({ foo: '1' });
  });
});

describe('url handling', () => {
  it('url > 2048 chars -> null', () => {
    expect(normalizePing(B + '&pad=' + 'a'.repeat(2100))).toBeNull();
  });
  it('accepts URL objects', () => {
    expect(normalizePing(new URL(B))).not.toBeNull();
  });
});
