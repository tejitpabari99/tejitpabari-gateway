import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';

const wf = parse(env.WORKFLOW_TEXT);
const steps = wf.jobs.test.steps;
const PATHS = ['workers/usage-ping/**', '.github/workflows/usage-ping-ci.yml'];

describe('usage-ping CI workflow (Task 7)', () => {
  it('is valid YAML with a name and a single test job', () => {
    expect(wf.name).toBeTruthy();
    expect(Object.keys(wf.jobs)).toEqual(['test']);
  });
  it('triggers on push and pull_request, scoped by paths', () => {
    const on = wf.on ?? wf[true];
    expect(Object.keys(on).sort()).toEqual(['pull_request', 'push']);
    expect(on.push.paths).toEqual(PATHS);
    expect(on.pull_request.paths).toEqual(PATHS);
  });
  it('least privilege: contents read only, no secrets', () => {
    expect(wf.permissions).toEqual({ contents: 'read' });
    expect(env.WORKFLOW_TEXT).not.toMatch(/secrets\./);
    expect(env.WORKFLOW_TEXT).not.toMatch(/wrangler deploy/);
  });
  it('defaults run in workers/usage-ping', () => {
    expect(wf.jobs.test.defaults.run['working-directory']).toBe('workers/usage-ping');
  });
  it('checkout, setup-node with npm cache on the worker lockfile, npm ci, npm test in order', () => {
    expect(steps[0].uses).toMatch(/^actions\/checkout@/);
    const node = steps[1];
    expect(node.uses).toMatch(/^actions\/setup-node@/);
    expect(node.with['cache']).toBe('npm');
    expect(node.with['cache-dependency-path']).toBe('workers/usage-ping/package-lock.json');
    expect(node.with['node-version']).toBeTruthy();
    expect(steps.slice(2).map((s) => s.run)).toEqual(['npm ci', 'npm test']);
  });
  it('references no other repo path (no root install)', () => {
    const paths = env.WORKFLOW_TEXT.match(/workers\/[\w./*-]+/g) ?? [];
    expect(paths.every((p) => p.startsWith('workers/usage-ping'))).toBe(true);
  });
});
