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

  it('includes severity flag when severity is set', () => {
    const result = generateCIWorkflow(mockPersona, 'github');
    if (!result.ok) return;
    expect(result.value).toContain('--severity error');
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
    expect(pipeline.enforce.script).toEqual([
      'npx harness check-deps --severity error',
      'npx harness validate --severity error',
    ]);
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
