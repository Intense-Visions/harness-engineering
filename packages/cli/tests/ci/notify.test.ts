import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';

// Mock all external dependencies to avoid workspace build issues
vi.mock('@harness-engineering/core', () => ({
  CINotifier: class MockNotifier {
    notifyPR = vi.fn().mockResolvedValue({ ok: true, value: undefined });
    notifyIssue = vi.fn().mockResolvedValue({
      ok: true,
      value: { externalId: 'github:org/repo#1', url: 'https://github.com/org/repo/issues/1' },
    });
  },
  GitHubIssuesSyncAdapter: class MockAdapter {},
}));

vi.mock('../../src/config/loader', () => ({
  resolveConfig: vi.fn().mockReturnValue({
    ok: true,
    value: {
      roadmap: {
        tracker: {
          kind: 'github',
          repo: 'org/repo',
          labels: ['roadmap'],
          statusMap: { planned: 'open', done: 'closed' },
        },
      },
    },
  }),
}));

vi.mock('../../src/output/logger', () => ({
  logger: {
    success: vi.fn(),
    error: vi.fn(),
    dim: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../../src/utils/output', () => ({
  resolveOutputMode: vi.fn().mockReturnValue('human'),
}));

import { createNotifyCommand } from '../../src/commands/ci/notify';

describe('createNotifyCommand', () => {
  it('creates a command named notify', () => {
    const cmd = createNotifyCommand();
    expect(cmd.name()).toBe('notify');
  });

  it('has description mentioning CI check results', () => {
    const cmd = createNotifyCommand();
    expect(cmd.description()).toContain('CI check results');
  });

  it('requires --target option', () => {
    const cmd = createNotifyCommand();
    const targetOption = cmd.options.find((o) => o.long === '--target');
    expect(targetOption).toBeDefined();
    expect(targetOption!.required).toBe(true);
  });

  it('accepts --pr option', () => {
    const cmd = createNotifyCommand();
    const prOption = cmd.options.find((o) => o.long === '--pr');
    expect(prOption).toBeDefined();
  });

  it('accepts --title option', () => {
    const cmd = createNotifyCommand();
    const titleOption = cmd.options.find((o) => o.long === '--title');
    expect(titleOption).toBeDefined();
  });

  it('accepts --labels option', () => {
    const cmd = createNotifyCommand();
    const labelsOption = cmd.options.find((o) => o.long === '--labels');
    expect(labelsOption).toBeDefined();
  });

  it('accepts a report argument', () => {
    const cmd = createNotifyCommand();
    // Commander stores registered arguments
    expect(cmd.registeredArguments).toHaveLength(1);
    expect(cmd.registeredArguments[0].name()).toBe('report');
  });
});
