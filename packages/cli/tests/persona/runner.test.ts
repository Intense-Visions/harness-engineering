import { describe, it, expect, vi } from 'vitest';
import { runPersona, type CommandExecutor, type SkillExecutor } from '../../src/persona/runner';
import type { Persona } from '../../src/persona/schema';

const mockSkillExecutor: SkillExecutor = vi.fn().mockResolvedValue({
  status: 'pass',
  output: 'Review complete',
  durationMs: 100,
});

// Normalized v1 persona (has steps from normalization)
const mockPersona: Persona = {
  version: 1,
  name: 'Test Persona',
  description: 'Test',
  role: 'Test',
  skills: ['test-skill'],
  steps: [
    { command: 'validate', when: 'always' },
    { command: 'check-deps', when: 'always' },
  ],
  triggers: [{ event: 'on_pr' as const }],
  config: { severity: 'error', autoFix: false, timeout: 300000 },
  outputs: { 'agents-md': true, 'ci-workflow': true, 'runtime-config': true },
};

const mockV2Persona: Persona = {
  version: 2,
  name: 'Test Reviewer',
  description: 'Test',
  role: 'Test',
  skills: ['harness-code-review'],
  steps: [
    { command: 'validate', when: 'always' },
    { command: 'check-deps', when: 'always' },
    { command: 'check-docs', when: 'on_pr' },
    { skill: 'harness-code-review', when: 'on_pr', output: 'auto' },
  ],
  triggers: [{ event: 'on_pr' as const }],
  config: { severity: 'error', autoFix: false, timeout: 300000 },
  outputs: { 'agents-md': true, 'ci-workflow': true, 'runtime-config': true },
};

describe('runPersona', () => {
  it('executes all command steps and returns pass report', async () => {
    const executor: CommandExecutor = vi
      .fn()
      .mockResolvedValue({ ok: true, value: { valid: true } });
    const report = await runPersona(mockPersona, {
      trigger: 'on_pr',
      commandExecutor: executor,
      skillExecutor: mockSkillExecutor,
      projectPath: '/tmp/test',
    });
    expect(report.status).toBe('pass');
    expect(report.steps).toHaveLength(2);
    expect(report.steps[0]!.status).toBe('pass');
    expect(report.steps[0]!.type).toBe('command');
    expect(report.steps[1]!.status).toBe('pass');
    expect(executor).toHaveBeenCalledTimes(2);
  });

  it('filters steps by trigger context', async () => {
    const cmdExec: CommandExecutor = vi.fn().mockResolvedValue({ ok: true, value: {} });
    const skillExec: SkillExecutor = vi
      .fn()
      .mockResolvedValue({ status: 'pass', output: '', durationMs: 0 });

    // on_commit should only run "always" steps, not "on_pr" steps
    const report = await runPersona(mockV2Persona, {
      trigger: 'on_commit',
      commandExecutor: cmdExec,
      skillExecutor: skillExec,
      projectPath: '/tmp/test',
    });

    expect(report.steps).toHaveLength(2); // validate + check-deps (both "always")
    expect(cmdExec).toHaveBeenCalledTimes(2);
    expect(skillExec).not.toHaveBeenCalled();
  });

  it('executes skill steps on matching trigger', async () => {
    const cmdExec: CommandExecutor = vi.fn().mockResolvedValue({ ok: true, value: {} });
    const skillExec: SkillExecutor = vi
      .fn()
      .mockResolvedValue({ status: 'pass', output: 'Done', durationMs: 50 });

    // on_pr should run all 4 steps
    const report = await runPersona(mockV2Persona, {
      trigger: 'on_pr',
      commandExecutor: cmdExec,
      skillExecutor: skillExec,
      projectPath: '/tmp/test',
    });

    expect(report.steps).toHaveLength(4);
    expect(cmdExec).toHaveBeenCalledTimes(3); // validate, check-deps, check-docs
    expect(skillExec).toHaveBeenCalledTimes(1);
    expect(report.steps[3]!.type).toBe('skill');
    expect(report.steps[3]!.status).toBe('pass');
  });

  it('fails fast when a command step fails', async () => {
    const cmdExec: CommandExecutor = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, value: {} })
      .mockResolvedValueOnce({ ok: false, error: new Error('check-deps failed') });
    const report = await runPersona(mockV2Persona, {
      trigger: 'on_pr',
      commandExecutor: cmdExec,
      skillExecutor: mockSkillExecutor,
      projectPath: '/tmp/test',
    });
    expect(report.status).toBe('fail');
    expect(report.steps[1]!.status).toBe('fail');
    expect(report.steps.filter((s) => s.status === 'skipped').length).toBeGreaterThan(0);
  });

  it('fails fast when a skill step fails', async () => {
    const cmdExec: CommandExecutor = vi.fn().mockResolvedValue({ ok: true, value: {} });
    const skillExec: SkillExecutor = vi
      .fn()
      .mockResolvedValue({ status: 'fail', output: 'Error', durationMs: 0 });
    const report = await runPersona(mockV2Persona, {
      trigger: 'on_pr',
      commandExecutor: cmdExec,
      skillExecutor: skillExec,
      projectPath: '/tmp/test',
    });
    expect(report.status).toBe('fail');
    expect(report.steps.find((s) => s.type === 'skill')?.status).toBe('fail');
  });

  it('tracks duration per step', async () => {
    const executor: CommandExecutor = vi.fn().mockResolvedValue({ ok: true, value: {} });
    const report = await runPersona(mockPersona, {
      trigger: 'on_pr',
      commandExecutor: executor,
      skillExecutor: mockSkillExecutor,
      projectPath: '/tmp/test',
    });
    for (const step of report.steps) {
      expect(step.durationMs).toBeGreaterThanOrEqual(0);
    }
    expect(report.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('marks steps as skipped on timeout', async () => {
    const slowExecutor: CommandExecutor = vi
      .fn()
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, value: {} }), 5000))
      );
    const persona = { ...mockPersona, config: { ...mockPersona.config, timeout: 50 } };
    const report = await runPersona(persona, {
      trigger: 'on_pr',
      commandExecutor: slowExecutor,
      skillExecutor: mockSkillExecutor,
      projectPath: '/tmp/test',
    });
    expect(report.status).toBe('partial');
    expect(report.steps.some((s) => s.status === 'skipped')).toBe(true);
  });

  it('resolves auto trigger to manual when no handoff exists', async () => {
    const cmdExec: CommandExecutor = vi.fn().mockResolvedValue({ ok: true, value: {} });
    const report = await runPersona(mockPersona, {
      trigger: 'auto',
      commandExecutor: cmdExec,
      skillExecutor: mockSkillExecutor,
      projectPath: '/tmp/nonexistent-path',
    });
    // manual trigger matches "always" steps
    expect(report.status).toBe('pass');
    expect(report.steps).toHaveLength(2);
  });

  it('passes handoff context to skill steps', async () => {
    const cmdExec: CommandExecutor = vi.fn().mockResolvedValue({ ok: true, value: {} });
    const skillExec: SkillExecutor = vi
      .fn()
      .mockResolvedValue({ status: 'pass', output: 'Done', durationMs: 0 });

    const handoff = {
      fromSkill: 'harness-planning',
      summary: 'Test plan',
      pending: ['Task 1'],
    };

    await runPersona(mockV2Persona, {
      trigger: 'on_pr',
      commandExecutor: cmdExec,
      skillExecutor: skillExec,
      projectPath: '/tmp/test',
      handoff,
    });

    expect(skillExec).toHaveBeenCalledWith(
      'harness-code-review',
      expect.objectContaining({ handoff })
    );
  });
});
