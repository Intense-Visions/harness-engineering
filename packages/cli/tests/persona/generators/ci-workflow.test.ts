import { describe, it, expect } from 'vitest';
import YAML from 'yaml';
import { generateCIWorkflow } from '../../../src/persona/generators/ci-workflow';
import type { Persona } from '../../../src/persona/schema';

const mockPersona: Persona = {
  version: 1,
  name: 'Architecture Enforcer',
  description: 'Validates constraints',
  role: 'Enforce boundaries',
  skills: ['enforce-architecture'],
  steps: [
    { command: 'check-deps', when: 'always' },
    { command: 'validate', when: 'always' },
  ],
  triggers: [
    { event: 'on_pr' as const, conditions: { paths: ['src/**'] } },
    { event: 'on_commit' as const, conditions: { branches: ['main'] } },
    { event: 'scheduled' as const, cron: '0 6 * * 1' },
  ],
  config: { severity: 'error', autoFix: false, timeout: 300000 },
  outputs: { 'agents-md': true, 'ci-workflow': true, 'runtime-config': true },
};

describe('generateCIWorkflow', () => {
  it('generates valid GitHub Actions YAML', () => {
    const result = generateCIWorkflow(mockPersona, 'github');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const workflow = YAML.parse(result.value);
    expect(workflow.name).toBe('Architecture Enforcer');
    expect(workflow.on.pull_request).toBeDefined();
    expect(workflow.on.push).toBeDefined();
    expect(workflow.on.schedule).toBeDefined();
  });

  it('includes path filters for PR triggers', () => {
    const result = generateCIWorkflow(mockPersona, 'github');
    if (!result.ok) return;
    const workflow = YAML.parse(result.value);
    expect(workflow.on.pull_request.paths).toEqual(['src/**']);
  });

  it('includes branch filters for commit triggers', () => {
    const result = generateCIWorkflow(mockPersona, 'github');
    if (!result.ok) return;
    const workflow = YAML.parse(result.value);
    expect(workflow.on.push.branches).toEqual(['main']);
  });

  it('includes cron schedule', () => {
    const result = generateCIWorkflow(mockPersona, 'github');
    if (!result.ok) return;
    const workflow = YAML.parse(result.value);
    expect(workflow.on.schedule[0].cron).toBe('0 6 * * 1');
  });

  it('generates run steps for each command', () => {
    const result = generateCIWorkflow(mockPersona, 'github');
    if (!result.ok) return;
    const workflow = YAML.parse(result.value);
    const steps = workflow.jobs.enforce.steps;
    const runSteps = steps.filter((s: Record<string, unknown>) => typeof s.run === 'string');
    expect(runSteps.length).toBe(2);
    expect(runSteps[0].run).toContain('harness check-deps');
    expect(runSteps[1].run).toContain('harness validate');
  });

  it('includes the severity flag for a severity-aware command (check-security)', () => {
    const securityPersona: Persona = {
      ...mockPersona,
      steps: [{ command: 'check-security', when: 'always' }],
    };
    const result = generateCIWorkflow(securityPersona, 'github');
    if (!result.ok) return;
    expect(result.value).toContain('check-security --severity error');
  });

  it('omits the severity flag when no command accepts it', () => {
    // mockPersona runs check-deps + validate, neither of which takes --severity.
    const result = generateCIWorkflow(mockPersona, 'github');
    if (!result.ok) return;
    expect(result.value).not.toContain('--severity');
  });

  it('only emits command steps in CI (skips skill steps)', () => {
    const v2Persona: Persona = {
      ...mockPersona,
      version: 2,
      steps: [
        { command: 'validate', when: 'always' },
        { command: 'check-deps', when: 'always' },
        { command: 'check-docs', when: 'on_pr' },
        { skill: 'harness-code-review', when: 'on_pr', output: 'auto' },
      ],
    };
    const result = generateCIWorkflow(v2Persona, 'github');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const workflow = YAML.parse(result.value);
    const steps = workflow.jobs.enforce.steps;
    const runSteps = steps.filter((s: Record<string, unknown>) => typeof s.run === 'string');
    expect(runSteps.length).toBe(3); // validate, check-deps, check-docs (no skill)
  });
});

describe('generateCIWorkflow (options)', () => {
  it('defaults to the npx runner with no continue-on-error', () => {
    const result = generateCIWorkflow(mockPersona, 'github');
    if (!result.ok) return;
    const workflow = YAML.parse(result.value);
    const job = workflow.jobs.enforce;
    expect(job['continue-on-error']).toBeUndefined();
    const runSteps = job.steps.filter((s: Record<string, unknown>) => typeof s.run === 'string');
    expect(runSteps.every((s: { run: string }) => s.run.startsWith('npx harness'))).toBe(true);
    // npx runner keeps the minimal setup (no build step).
    expect(result.value).not.toContain('pnpm build');
  });

  it('workspace runner builds the workspace bin and invokes the dist entry', () => {
    const result = generateCIWorkflow(mockPersona, 'github', { runner: 'workspace' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const workflow = YAML.parse(result.value);
    const steps = workflow.jobs.enforce.steps;
    const uses = steps.filter((s: Record<string, unknown>) => typeof s.uses === 'string');
    expect(uses.map((s: { uses: string }) => s.uses)).toEqual([
      'actions/checkout@v6',
      'pnpm/action-setup@v5',
      'actions/setup-node@v6',
    ]);
    const runSteps = steps.filter((s: Record<string, unknown>) => typeof s.run === 'string');
    expect(runSteps.some((s: { run: string }) => s.run === 'pnpm install --frozen-lockfile')).toBe(
      true
    );
    expect(runSteps.some((s: { run: string }) => s.run === 'pnpm build')).toBe(true);
    const cmdSteps = runSteps.filter((s: { run: string }) =>
      s.run.startsWith('node packages/cli/dist/bin/harness.js')
    );
    expect(cmdSteps).toHaveLength(2);
    // Neither check-deps nor validate accepts --severity, so both are bare.
    expect(cmdSteps[0].run).toBe('node packages/cli/dist/bin/harness.js check-deps');
    expect(cmdSteps[1].run).toBe('node packages/cli/dist/bin/harness.js validate');
    // Node 22 (not the npx default of 20) and a concurrency guard.
    expect(workflow.on).toBeDefined();
    expect(workflow.concurrency['cancel-in-progress']).toBe(true);
    const nodeStep = uses.find((s: { uses: string }) => s.uses === 'actions/setup-node@v6');
    expect(nodeStep.with['node-version']).toBe(22);
  });

  it('appends --severity only to check-security, the one command that accepts it', () => {
    const securityPersona: Persona = {
      ...mockPersona,
      steps: [
        { command: 'check-security', when: 'always' },
        { command: 'check-perf', when: 'always' },
      ],
    };
    // Default runner is npx → steps read `npx harness <command>`.
    const result = generateCIWorkflow(securityPersona, 'github');
    if (!result.ok) return;
    const workflow = YAML.parse(result.value);
    const cmds = (workflow.jobs.enforce.steps as { run?: string }[])
      .map((s) => s.run)
      .filter((r): r is string => typeof r === 'string' && r.includes('npx harness'));
    expect(cmds.some((r) => r.endsWith('check-security --severity error'))).toBe(true);
    // check-perf rejects --severity, so it stays bare.
    expect(cmds.some((r) => r.endsWith('check-perf'))).toBe(true);
    expect(cmds.some((r) => r.includes('check-perf --severity'))).toBe(false);
  });

  it('advisory adds continue-on-error to the job', () => {
    const result = generateCIWorkflow(mockPersona, 'github', { advisory: true });
    if (!result.ok) return;
    const workflow = YAML.parse(result.value);
    expect(workflow.jobs.enforce['continue-on-error']).toBe(true);
  });

  it('sets least-privilege read-only permissions', () => {
    const result = generateCIWorkflow(mockPersona, 'github');
    if (!result.ok) return;
    const workflow = YAML.parse(result.value);
    expect(workflow.permissions).toEqual({ contents: 'read' });
  });
});

describe('generateCIWorkflow (gitlab)', () => {
  it('generates valid GitLab CI YAML with an enforce job', () => {
    const result = generateCIWorkflow(mockPersona, 'gitlab');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const pipeline = YAML.parse(result.value);
    expect(pipeline.workflow.name).toBe('Architecture Enforcer');
    expect(pipeline.enforce.image).toBe('node:20');
    expect(pipeline.enforce.before_script).toContain('pnpm install --frozen-lockfile');
  });

  it('maps each command step to a harness script line (skips skill steps)', () => {
    const result = generateCIWorkflow(mockPersona, 'gitlab');
    if (!result.ok) return;
    const pipeline = YAML.parse(result.value);
    // Neither check-deps nor validate accepts --severity, so both are bare.
    expect(pipeline.enforce.script).toEqual(['npx harness check-deps', 'npx harness validate']);
  });

  it('translates triggers into rules (MR source, branch match, schedule)', () => {
    const result = generateCIWorkflow(mockPersona, 'gitlab');
    if (!result.ok) return;
    const pipeline = YAML.parse(result.value);
    const rules = pipeline.enforce.rules as Array<Record<string, unknown>>;
    expect(rules).toContainEqual({
      if: '$CI_PIPELINE_SOURCE == "merge_request_event"',
      changes: ['src/**'],
    });
    expect(rules).toContainEqual({ if: '$CI_COMMIT_BRANCH == "main"' });
    expect(rules).toContainEqual({ if: '$CI_PIPELINE_SOURCE == "schedule"' });
  });

  it('falls back to a no-op script when a persona has only skill steps', () => {
    const skillOnly: Persona = {
      ...mockPersona,
      version: 2,
      steps: [{ skill: 'harness-code-review', when: 'on_pr', output: 'auto' }],
    };
    const result = generateCIWorkflow(skillOnly, 'gitlab');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const pipeline = YAML.parse(result.value);
    expect(pipeline.enforce.script).toEqual(['echo "No command steps to run in CI"']);
  });
});
