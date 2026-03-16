import { describe, it, expect, vi } from 'vitest';
import { runPersona, type CommandExecutor } from '../../src/persona/runner';
import type { Persona } from '../../src/persona/schema';

const mockPersona: Persona = {
  version: 1,
  name: 'Test Persona',
  description: 'Test',
  role: 'Test',
  skills: ['test-skill'],
  commands: ['validate', 'check-deps'],
  triggers: [{ event: 'on_pr' as const }],
  config: { severity: 'error', autoFix: false, timeout: 300000 },
  outputs: { 'agents-md': true, 'ci-workflow': true, 'runtime-config': true },
};

describe('runPersona', () => {
  it('executes all commands and returns pass report', async () => {
    const executor: CommandExecutor = vi
      .fn()
      .mockResolvedValue({ ok: true, value: { valid: true } });
    const report = await runPersona(mockPersona, executor);
    expect(report.status).toBe('pass');
    expect(report.commands).toHaveLength(2);
    expect(report.commands[0].status).toBe('pass');
    expect(report.commands[1].status).toBe('pass');
    expect(executor).toHaveBeenCalledTimes(2);
  });

  it('fails fast when a command fails', async () => {
    const executor: CommandExecutor = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, value: {} })
      .mockResolvedValueOnce({ ok: false, error: new Error('check-deps failed') });
    const report = await runPersona(mockPersona, executor);
    expect(report.status).toBe('fail');
    expect(report.commands[0].status).toBe('pass');
    expect(report.commands[1].status).toBe('fail');
    expect(report.commands[1].error).toContain('check-deps failed');
  });

  it('tracks duration per command', async () => {
    const executor: CommandExecutor = vi.fn().mockResolvedValue({ ok: true, value: {} });
    const report = await runPersona(mockPersona, executor);
    for (const cmd of report.commands) {
      expect(cmd.durationMs).toBeGreaterThanOrEqual(0);
    }
    expect(report.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('marks commands as skipped on timeout', async () => {
    const slowExecutor: CommandExecutor = vi
      .fn()
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, value: {} }), 5000))
      );
    const persona = { ...mockPersona, config: { ...mockPersona.config, timeout: 50 } };
    const report = await runPersona(persona, slowExecutor);
    expect(report.status).toBe('partial');
    expect(report.commands.some((c) => c.status === 'skipped')).toBe(true);
  });
});
