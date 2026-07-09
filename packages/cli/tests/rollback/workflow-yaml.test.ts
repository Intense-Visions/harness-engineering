// Manual logic trace (the "not tested beyond syntax" boundary):
//   - schedule (cron) → the `sweep` job runs → `harness rollback sweep` (signal
//     arm) reads the timeline and, on a crossing, opens a revert PR for a HUMAN.
//   - pull_request[closed] + merged==true → the job runs but has NO run step yet;
//     it is the DARK eval-arm entry. The CLI self-gates on
//     rollback.evalTrigger.enabled (default false), so activation in Phase 4 is a
//     CODE change, not a workflow rewrite.
//   - permissions are minimal (contents:read + pull-requests:write); there is NO
//     contents:write and NO self-approving PAT — a human merges the revert PR.
// This test asserts YAML SYNTAX + the permission/trigger/concurrency/step
// invariants only. Runtime behavior on GitHub is NOT claimed tested here
// (actionlint is not available in this environment).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parse } from 'yaml';

const here = dirname(fileURLToPath(import.meta.url));
// tests/rollback/ → repo root is four levels up (packages/cli/tests/rollback).
const workflowPath = join(
  here,
  '..',
  '..',
  '..',
  '..',
  '.github',
  'workflows',
  'rollback-propose.yml'
);
const raw = readFileSync(workflowPath, 'utf8');

interface Workflow {
  on: {
    schedule?: { cron: string }[];
    pull_request?: { types?: string[] };
  };
  permissions: Record<string, string>;
  concurrency: { group: string; 'cancel-in-progress': boolean };
}

describe('rollback-propose.yml', () => {
  it('parses as valid YAML', () => {
    expect(() => parse(raw)).not.toThrow();
  });

  const wf = parse(raw) as Workflow;

  it('has a schedule cron trigger and a pull_request[closed] trigger', () => {
    expect(wf.on.schedule?.[0]?.cron).toBeTruthy();
    expect(wf.on.pull_request?.types).toContain('closed');
  });

  it('grants minimal propose-only permissions (contents:read, pull-requests:write)', () => {
    expect(wf.permissions.contents).toBe('read');
    expect(wf.permissions['pull-requests']).toBe('write');
  });

  it('never grants contents:write', () => {
    expect(wf.permissions.contents).not.toBe('write');
  });

  it('carries no self-approving PAT (no AUTOAPPROVE_PAT, no pr review --approve)', () => {
    expect(raw).not.toContain('AUTOAPPROVE_PAT');
    expect(raw).not.toContain('pr review --approve');
  });

  it('serializes proposals with cancel-in-progress: false', () => {
    expect(wf.concurrency['cancel-in-progress']).toBe(false);
  });

  it('runs the rollback sweep step (signal arm)', () => {
    expect(raw).toContain('rollback sweep');
  });
});
