// Pure /ping normalizer. normalizePing(url, uaHeader) -> row | null.
// Contract: PRD "/ping contract" table. UA text is only used to derive `origin`, never stored.

const MAX_URL = 2048;
const ORIGINS = ['claude', 'google_script', 'gpt', 'gemini', 'grok', 'perplexity', 'other'];
const REASONS = ['no_access', 'not_found', 'quota', 'bad_input', 'other'];
const UID_RE = /^u_[0-9a-f]{8}$/;
const KNOWN = new Set([
  'tool_type', 'tool_name', 'event', 'mode', 'v', 'org', 'uid', 'origin',
  'n', 'ok', 'fail', 'step', 'reason', 'x_run',
]);
// Reserved: ignored (t) or server-derived (ts, id, country, client); never go to extras.
const RESERVED = new Set(['t', 'ts', 'id', 'country', 'client']);

const clean = (s, re, max) => (s ?? '').trim().toLowerCase().replace(re, '').slice(0, max);
const orNull = (s) => (s === '' ? null : s);

function count(s) {
  if (s == null || !/^\d{1,4}$/.test(s.trim())) return null;
  const v = Number(s.trim());
  return v >= 0 && v <= 5000 ? v : null;
}

function normOrg(s) {
  if (s == null) return null;
  let o = s.normalize('NFC').trim();
  if (o.includes('@')) return 'redacted';
  // eslint-disable-next-line no-control-regex
  o = o.toLowerCase().replace(/[\x00-\x1f\x7f-\x9f]/g, '').replace(/\s+/g, '_').slice(0, 100);
  return orNull(o);
}

function deriveOrigin(raw, ua) {
  const o = (raw ?? '').trim().toLowerCase();
  if (ORIGINS.includes(o)) return o;
  const u = (ua ?? '').toLowerCase();
  if (u.includes('claude-user')) return 'claude';
  if (u.includes('google-apps-script')) return 'google_script';
  return 'other';
}

function buildExtras(params) {
  const out = {};
  let count_ = 0;
  for (const [rawKey, rawVal] of params) {
    const key = rawKey.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30);
    if (!key || KNOWN.has(key) || RESERVED.has(key) || key in out) continue;
    if (KNOWN.has(rawKey.toLowerCase()) || RESERVED.has(rawKey.toLowerCase())) continue;
    let val = rawVal.trim().slice(0, 100);
    if (val.includes('@')) val = 'redacted';
    if (count_ >= 20) break;
    const next = { ...out, [key]: val };
    if (new TextEncoder().encode(JSON.stringify(next)).length > 1024) continue; // drop excess key
    out[key] = val;
    count_++;
  }
  return count_ ? JSON.stringify(out) : null;
}

export function normalizePing(url, uaHeader = null) {
  const href = typeof url === 'string' ? url : url.href;
  if (href.length > MAX_URL) return null;
  let u;
  try {
    u = typeof url === 'string' ? new URL(url) : url;
  } catch {
    return null;
  }
  const sp = u.searchParams;
  const get = (k) => sp.get(k); // first value wins

  const rawType = (get('tool_type') ?? '').trim().toLowerCase();
  const toolName = clean(get('tool_name'), /[^a-z0-9_-]/g, 50);
  const event = clean(get('event'), /[^a-z0-9_]/g, 50);
  if (!rawType || !toolName || !event) return null;

  const mode = (get('mode') ?? '').trim().toLowerCase() === 'test' ? 'test' : 'prod';
  const reasonRaw = get('reason');
  const reason = reasonRaw == null ? null : REASONS.includes(reasonRaw.trim().toLowerCase()) ? reasonRaw.trim().toLowerCase() : 'other';
  const uid = get('uid');

  return {
    ts: new Date().toISOString(),
    tool_type: rawType === 'plugin' || rawType === 'script' ? rawType : 'other',
    tool_name: toolName,
    event,
    mode,
    v: orNull((get('v') ?? '').trim().slice(0, 20)),
    org: normOrg(get('org')),
    uid: uid != null && UID_RE.test(uid) ? uid : null,
    n: count(get('n')),
    ok: count(get('ok')),
    fail: count(get('fail')),
    step: orNull(clean(get('step'), /[^a-z0-9_]/g, 50)),
    reason,
    origin: deriveOrigin(get('origin'), uaHeader),
    run: orNull(clean(get('x_run'), /[^a-z0-9_-]/g, 40)),
    extras: buildExtras(sp),
  };
}
