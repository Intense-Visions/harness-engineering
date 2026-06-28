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
});
