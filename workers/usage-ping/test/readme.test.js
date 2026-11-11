import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';

const readme = env.README_TEXT;

describe('README coverage (Task 6)', () => {
  const params = ['tool_type', 'tool_name', 'event', 'mode', 'v', 'org', 'uid', 'origin', 'n', 'ok', 'fail', 'step', 'reason', 'x_run', 't'];
  it.each(params)('mentions contract param `%s`', (p) => {
    expect(readme).toContain('`' + p + '`');
  });
  it.each([
    'STATS_PASSWORD',
    'ORGS_EXCLUDE',
    'wrangler d1 create usage-ping-db',
    'wrangler d1 migrations apply usage-ping-db --remote',
    'wrangler delete --name usage-ping-spike',
    'wrangler deploy',
    'wrangler d1 delete usage-ping-spike-db',
    'npm test',
    'npm run dev',
    'rate-limit',
    'PRD.md',
    'always',
    '/stats',
    '/robots.txt',
  ])('mentions %s', (s) => {
    expect(readme).toContain(s);
  });
  it('lists cutover steps in order', () => {
    const order = ['d1 create', 'migrations apply', 'delete --name usage-ping-spike', 'wrangler deploy', 'd1 delete usage-ping-spike-db']
      .map((s) => readme.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
  it('does not advertise /stats in robots guidance', () => {
    expect(readme).not.toMatch(/Disallow:\s*\/stats/);
  });
});
