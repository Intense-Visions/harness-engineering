import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// Mirror the sibling update.test.ts mock surface so the action + helper paths
// run without spawning npm, touching disk, or blocking on prompts.
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, execFileSync: vi.fn(), execFile: vi.fn() };
});

const existsSyncMock = vi.fn(() => false);
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    realpathSync: vi.fn((p: string) => p),
    existsSync: (...a: unknown[]) => existsSyncMock(...(a as [string])),
    readFileSync: vi.fn(() => '{}'),
  };
});

vi.mock('node:readline', () => ({
  default: {
    createInterface: vi.fn(() => ({
      question: vi.fn((_q: string, cb: (a: string) => void) => cb('n')),
      close: vi.fn(),
    })),
  },
}));

vi.mock('../../src/commands/telemetry-wizard', () => ({
  ensureTelemetryConfigured: vi.fn().mockResolvedValue({ status: 'pass', message: 'OK' }),
}));

vi.mock('../../src/commands/hooks/init', () => ({
  initHooks: vi.fn(() => ({ copiedScripts: [], skippedModified: [] })),
}));

const readServersMock = vi.fn(() => [] as { name: string }[]);
vi.mock('../../src/commands/integrations/sync', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, readConfiguredServers: (...a: unknown[]) => readServersMock(...(a as [])) };
});

interface Drift {
  toAdd: { name: string }[];
  deprecated: { name: string }[];
}
const reconcileMock = vi.fn((): Drift => ({ toAdd: [], deprecated: [] }));
vi.mock('../../src/integrations/reconcile', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, reconcileIntegrations: (...a: unknown[]) => reconcileMock(...(a as [])) };
});

import {
  createUpdateCommand,
  offerIntegrationsSync,
  offerSkillProviderUpdates,
} from '../../src/commands/update';

const exitSentinel = new Error('__exit__');

describe('update helpers + regenerate path (cov544)', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let logs: string[];
  const origNoCheck = process.env['HARNESS_NO_UPDATE_CHECK'];
  const origTTYout = process.stdout.isTTY;
  const origTTYin = process.stdin.isTTY;

  beforeEach(() => {
    logs = [];
    existsSyncMock.mockReset();
    existsSyncMock.mockReturnValue(false);
    readServersMock.mockReset();
    readServersMock.mockReturnValue([]);
    reconcileMock.mockReset();
    reconcileMock.mockReturnValue({ toAdd: [], deprecated: [] });
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw exitSentinel;
    }) as never);
    logSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
      logs.push(a.join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    logSpy.mockRestore();
    vi.restoreAllMocks();
    if (origNoCheck === undefined) delete process.env['HARNESS_NO_UPDATE_CHECK'];
    else process.env['HARNESS_NO_UPDATE_CHECK'] = origNoCheck;
    (process.stdout as { isTTY?: boolean }).isTTY = origTTYout;
    (process.stdin as { isTTY?: boolean }).isTTY = origTTYin;
  });

  it('offerIntegrationsSync no-ops when no MCP servers are configured', () => {
    readServersMock.mockReturnValue([]);
    expect(() => offerIntegrationsSync('/nonexistent-project')).not.toThrow();
    expect(logs.join('\n')).not.toContain('differ from the suggested catalog');
  });

  it('offerIntegrationsSync no-ops when configured servers are already in sync', () => {
    readServersMock.mockReturnValue([{ name: 'ctx7' }]);
    reconcileMock.mockReturnValue({ toAdd: [], deprecated: [] });
    offerIntegrationsSync('/proj');
    expect(logs.join('\n')).not.toContain('differ from the suggested catalog');
  });

  it('offerIntegrationsSync surfaces both deprecated and newly-suggested drift', () => {
    readServersMock.mockReturnValue([{ name: 'ctx7' }]);
    reconcileMock.mockReturnValue({
      toAdd: [{ name: 'playwright' }],
      deprecated: [{ name: 'legacy' }],
    });
    offerIntegrationsSync('/proj');
    const out = logs.join('\n');
    expect(out).toContain('differ from the suggested catalog');
    expect(out).toContain('deprecated');
    expect(out).toContain('legacy');
    expect(out).toContain('newly suggested');
    expect(out).toContain('playwright');
    expect(out).toContain('harness integrations sync');
  });

  it('offerSkillProviderUpdates short-circuits when update checks are disabled', async () => {
    process.env['HARNESS_NO_UPDATE_CHECK'] = '1';
    await offerSkillProviderUpdates();
    expect(logs.join('\n')).toBe('');
  });

  it('offerSkillProviderUpdates returns quietly when no community lockfiles exist', async () => {
    delete process.env['HARNESS_NO_UPDATE_CHECK'];
    existsSyncMock.mockReturnValue(false); // no lockfiles
    await offerSkillProviderUpdates();
    expect(logs.join('\n')).not.toContain('harness skill update');
  });

  it('--regenerate runs the regenerate-only path and exits 0', async () => {
    const program = new Command();
    program.exitOverride();
    program.option('--verbose');
    program.addCommand(createUpdateCommand());
    let code: number | undefined;
    try {
      await program.parseAsync(['update', '--regenerate'], { from: 'user' });
    } catch (e) {
      if (e !== exitSentinel) throw e;
    }
    code = exitSpy.mock.calls.at(-1)?.[0] as number;
    expect(code).toBe(0);
  });
});
