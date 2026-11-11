// Server-rendered /stats page. Every dynamic or table value goes through esc();
// there is no other place where data is interpolated into HTML.
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

const CSS = `
body{font:15px/1.4 system-ui,sans-serif;margin:0 auto;max-width:980px;padding:16px;color:#1a1a1a;background:#fff}
h1{font-size:20px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 8px}
.meta{color:#555;font-size:13px}.big{font-size:56px;font-weight:700;line-height:1.1}
.scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
table{border-collapse:collapse;width:100%;min-width:420px}
th,td{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left;white-space:nowrap}
th{background:#f4f4f4;font-weight:600}td.num,th.num{text-align:right}
td.empty{color:#777;text-align:center}
@media (prefers-color-scheme:dark){body{background:#121212;color:#e6e6e6}th{background:#222}th,td{border-color:#333}.meta{color:#aaa}td.empty{color:#999}}
`;

const td = (v, num) => `<td${num ? ' class="num"' : ''}>${esc(v)}</td>`;

// cols: [{ key, label, num? }]
function table(cols, rows) {
  const head = cols.map((c) => `<th${c.num ? ' class="num"' : ''}>${esc(c.label)}</th>`).join('');
  const body = rows.length
    ? rows.map((r) => `<tr>${cols.map((c) => td(r[c.key], c.num)).join('')}</tr>`).join('')
    : `<tr><td class="empty" colspan="${cols.length}">${esc('No data yet')}</td></tr>`;
  return `<div class="scroll"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

const section = (title, cols, rows) => `<h2>${esc(title)}</h2>\n${table(cols, rows)}`;

const TOOL_COLS = [
  { key: 'batches', label: 'Batches', num: true },
  { key: 'items', label: 'Items', num: true },
  { key: 'ok', label: 'OK', num: true },
  { key: 'fail', label: 'Fail', num: true },
  { key: 'orgs', label: 'Active orgs', num: true },
  { key: 'uids', label: 'Distinct uids', num: true },
];

export function renderStats(s, now = new Date()) {
  const gen = now.toISOString().slice(0, 19).replace('T', ' ');
  const modeLabel = s.includeTest ? 'Including test runs' : 'Production only';
  // Static literals only: href and label are chosen from two fixed options.
  const toggle = s.includeTest
    ? '<a href="/stats">Production only</a>'
    : '<a href="/stats?test=1">Include test runs</a>';
  const t = s.totals;
  const totals = table(
    [
      { key: 'events', label: 'Events', num: true },
      { key: 'uids', label: 'Distinct uids', num: true },
      { key: 'items', label: 'Items', num: true },
      { key: 'first', label: 'First event' },
      { key: 'last', label: 'Last event' },
    ],
    [t],
  );
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Usage stats</title>
<style>${CSS}</style></head><body>
<h1>Usage stats</h1>
<p class="meta">${esc(modeLabel)} &middot; ${toggle} &middot; ${esc('Generated ' + gen + ' UTC')}</p>
<h2>Active orgs</h2>
<div class="big" id="active-orgs">${esc(s.activeOrgs)}</div>
<p class="meta">Orgs with at least one batch or guide start (known origins only).</p>
${table([{ key: 'month', label: 'Month' }, { key: 'orgs', label: 'Active orgs', num: true }], s.activeOrgsByMonth)}
<h2>Totals</h2>
${totals}
${section('Per tool and month (last 24)', [{ key: 'tool_name', label: 'Tool' }, { key: 'month', label: 'Month' }, ...TOOL_COLS], s.toolMonth)}
${section('Per tool, all time', [{ key: 'tool_name', label: 'Tool' }, ...TOOL_COLS], s.toolAllTime)}
${section('Orgs (top 200 by batches)', [
    { key: 'org', label: 'Org' }, { key: 'tools', label: 'Tools', num: true }, { key: 'batches', label: 'Batches', num: true },
    { key: 'items', label: 'Items', num: true }, { key: 'first', label: 'First seen' }, { key: 'last', label: 'Last seen' },
  ], s.orgs)}
${section('Origins', [{ key: 'origin', label: 'Origin' }, { key: 'events', label: 'Events', num: true }, { key: 'orgs', label: 'Distinct orgs', num: true }], s.origins)}
${section('Top failing steps', [
    { key: 'tool_name', label: 'Tool' }, { key: 'step', label: 'Step' }, { key: 'reason', label: 'Reason' }, { key: 'count', label: 'Count', num: true },
  ], s.failingSteps)}
</body></html>`;
}

export const STATS_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
};
