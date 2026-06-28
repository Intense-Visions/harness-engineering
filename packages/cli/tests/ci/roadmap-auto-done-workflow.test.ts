import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const here = path.dirname(fileURLToPath(import.meta.url));
const workflowPath = path.resolve(here, '../../../../.github/workflows/roadmap-auto-done.yml');
const raw = readFileSync(workflowPath, 'utf8');
const wf = parse(raw) as {
  on: { pull_request: { types: string[] } };
  permissions: Record<string, string>;
  concurrency?: { group?: string; 'cancel-in-progress'?: boolean };
  jobs: Record<string, { if?: string; steps: Array<{ if?: string; run?: string; name?: string }> }>;
};

const job = wf.jobs['auto-done']!;
const stepRuns = job.steps.map((s) => s.run ?? '').join('\n');
const stepIfs = [job.if, ...job.steps.map((s) => s.if)].filter(Boolean).join('\n');

describe('roadmap-auto-done workflow', () => {
  it('triggers on pull_request: closed', () => {
    expect(wf.on.pull_request.types).toContain('closed');
  });

  it('grants contents: write so it can commit the shard flip', () => {
    expect(wf.permissions.contents).toBe('write');
  });

  it('gates on merged == true (does NOT run on a closed-unmerged PR)', () => {
    expect(stepIfs).toContain('github.event.pull_request.merged == true');
  });

  it('resolves the PR closing-issue references and runs reconcile --from-issues', () => {
    expect(raw).toContain('closingIssuesReferences');
    expect(stepRuns).toMatch(/roadmap reconcile/);
    expect(stepRuns).toMatch(/--from-issues/);
  });

  it('no-ops when there are no roadmap-linked closing issues', () => {
    // The reconcile step must be guarded so an empty closing-issue list skips it.
    const reconcileStep = job.steps.find((s) => (s.run ?? '').includes('roadmap reconcile'));
    expect(reconcileStep).toBeDefined();
    expect(reconcileStep!.if ?? '').toMatch(/steps\.\w+\.outputs\.\w+\s*!=\s*''/);
  });

  it('pushes with a rebase-retry loop to absorb concurrent merges', () => {
    expect(stepRuns).toMatch(/git pull --rebase/);
    expect(stepRuns).toMatch(/git push/);
  });

  it('stages the aggregate but guards the shard dir so a monolith layout is tolerated (C1)', () => {
    // A bare `git add docs/roadmap.d docs/roadmap.md` aborts (exit 128) in a
    // monolith repo with no shard dir — the commit step must not contain it.
    expect(stepRuns).not.toMatch(/git add docs\/roadmap\.d docs\/roadmap\.md/);
    // The shard dir is only staged when it exists.
    expect(stepRuns).toMatch(/\[ -d docs\/roadmap\.d \] && git add docs\/roadmap\.d/);
  });

  it('regenerates the aggregate from shards before committing in sharded mode (I1)', () => {
    const regenStep = job.steps.find((s) => (s.run ?? '').includes('roadmap regen'));
    expect(regenStep).toBeDefined();
    // Regen only runs when the shard dir exists (sharded mode).
    expect(regenStep!.run ?? '').toMatch(/\[ -d docs\/roadmap\.d \]/);
  });

  it('aborts any in-progress rebase at the start of each retry so a real conflict is retried cleanly (I2)', () => {
    expect(stepRuns).toMatch(/git rebase --abort/);
  });

  it('serializes commit-to-base via a concurrency group that never cancels in-flight runs (I3)', () => {
    expect(wf.concurrency).toBeDefined();
    expect(wf.concurrency!.group).toMatch(/roadmap-auto-done/);
    expect(wf.concurrency!['cancel-in-progress']).toBe(false);
  });
});
