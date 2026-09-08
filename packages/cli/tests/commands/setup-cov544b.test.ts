import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';

/**
 * Coverage for the setup pieces the existing sibling test never reaches: the
 * `createSetupCommand` action (formatStep pass/warn/fail icons + "Setup
 * complete" output + exit codes), the runMcpSetup catch path, and the
 * ensureHooks initHooks success / skippedModified branches.
 */

const { setupMcpMock, initHooksMock } = vi.hoisted(() => ({
  setupMcpMock: vi.fn(() => ({ configured: [], skipped: [], trustedFolder: false })),
  initHooksMock: vi.fn(() => ({ copiedScripts: ['a', 'b'], skippedModified: [] as string[] })),
}));

vi.mock('../../src/commands/generate-slash-commands', () => ({
  generateSlashCommands: vi.fn(() => [{ platform: 'claude-code', outputDir: '/home/.claude' }]),
}));
vi.mock('../../src/commands/setup-mcp', () => ({ setupMcp: setupMcpMock }));
vi.mock('../../src/utils/first-run', () => ({ markSetupComplete: vi.fn() }));
vi.mock('../../src/integrations/config', () => ({
  readMcpConfig: vi.fn(() => ({ mcpServers: {} })),
  writeMcpEntry: vi.fn(),
  writeOpencodeMcpEntry: vi.fn(),
}));
vi.mock('../../src/commands/telemetry-wizard', () => ({
  ensureTelemetryConfigured: vi.fn(async () => ({ status: 'pass', message: 'telemetry ok' })),
}));
vi.mock('../../src/commands/hooks/init', () => ({ initHooks: initHooksMock }));
vi.mock('../../src/commands/migrate', () => ({
  detectLegacyArtifacts: vi.fn(async () => ({ adrLegacy: false, planLegacy: false })),
}));
vi.mock('../../src/commands/graph/scan', () => ({
  runScan: vi.fn(async () => ({ nodeCount: 3, edgeCount: 2 })),
}));

// fs mock: config + profile present (drives ensureHooks), clients absent by default.
const existsImpl = { current: (p: string) => /harness\.config\.json$|profile\.json$/.test(p) };
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn((p: unknown) => existsImpl.current(String(p))),
    readFileSync: vi.fn((p: unknown) => {
      if (String(p).endsWith('profile.json')) return JSON.stringify({ profile: 'standard' });
      return '';
    }),
  };
});

import { createSetupCommand, runSetup } from '../../src/commands/setup';
import { initHooks } from '../../src/commands/hooks/init';

describe('setup command action + branches (cov544b)', () => {
  const originalVersion = process.version;
  let logs: string[];
  let exitCode: number | null;
  let spies: Array<{ mockRestore: () => void }>;

  beforeEach(() => {
    vi.clearAllMocks();
    setupMcpMock.mockReturnValue({ configured: [], skipped: [], trustedFolder: false });
    initHooksMock.mockReturnValue({ copiedScripts: ['a', 'b'], skippedModified: [] });
    existsImpl.current = (p: string) => /harness\.config\.json$|profile\.json$/.test(p);
    Object.defineProperty(process, 'version', { value: 'v22.4.0', writable: true });
    logs = [];
    exitCode = null;
    spies = [
      vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
        logs.push(a.map(String).join(' '));
      }),
      vi.spyOn(process, 'exit').mockImplementation(((c?: number) => {
        exitCode = c ?? 0;
        throw new Error(`__exit__:${exitCode}`);
      }) as never),
    ];
  });

  afterEach(() => {
    spies.forEach((s) => s.mockRestore());
    Object.defineProperty(process, 'version', { value: originalVersion, writable: true });
  });

  async function runCmd() {
    try {
      await createSetupCommand().parseAsync([], { from: 'user' });
    } catch (e) {
      if (!(e instanceof Error) || !e.message.startsWith('__exit__')) throw e;
    }
  }

  it('action prints the step lines + "Setup complete" and exits 0 on success', async () => {
    await runCmd();
    expect(exitCode).toBe(0);
    const out = logs.join('\n');
    expect(out).toContain('harness setup');
    expect(out).toContain('Setup complete');
    // formatStep pass icon rendered for at least one step
    expect(out).toContain('Node.js');
    // ensureHooks initHooks success branch
    expect(initHooks).toHaveBeenCalled();
    expect(out).toContain('Installed 2 hooks (standard profile)');
  });

  it('action exits 1 and omits "Setup complete" when Node is too old', async () => {
    Object.defineProperty(process, 'version', { value: 'v20.11.0', writable: true });
    await runCmd();
    expect(exitCode).toBe(1);
    expect(logs.join('\n')).not.toContain('Setup complete');
  });

  it('ensureHooks warns (formatStep warn) when hooks are locally modified', async () => {
    initHooksMock.mockReturnValue({ copiedScripts: ['a'], skippedModified: ['pre-commit.js'] });
    await runCmd();
    const out = logs.join('\n');
    expect(out).toContain('preserved');
    expect(out).toContain('pre-commit.js');
  });

  it('runMcpSetup fail path (setupMcp throws) yields a fail step and non-zero exit', async () => {
    // Detect the Claude client so setupMcp is invoked, then make it throw.
    existsImpl.current = (p: string) =>
      /harness\.config\.json$|profile\.json$/.test(p) ||
      p.endsWith(path.join(os.homedir(), '.claude'));
    setupMcpMock.mockImplementation(() => {
      throw new Error('mcp write denied');
    });
    await runCmd();
    // A fail step forces overall failure => exit 1, no "Setup complete".
    expect(exitCode).toBe(1);
    const out = logs.join('\n');
    expect(out).toContain('MCP configuration failed');
    expect(out).toContain('mcp write denied');
  });

  it('runSetup reports the graph-scan node/edge counts (runInitialGraphScan success)', async () => {
    const { steps, success } = await runSetup('/tmp/whatever');
    expect(success).toBe(true);
    const graphStep = steps.find((s) => s.message.includes('knowledge graph'));
    expect(graphStep?.message).toContain('3 nodes, 2 edges');
  });

  it('detectLegacyLayout warns when legacy paths are present', async () => {
    const migrate = await import('../../src/commands/migrate');
    vi.mocked(migrate.detectLegacyArtifacts).mockResolvedValueOnce({
      adrLegacy: true,
      planLegacy: true,
    });
    const { steps } = await runSetup('/tmp/whatever');
    const legacy = steps.find((s) => s.message.includes('Legacy paths'));
    expect(legacy?.status).toBe('warn');
    expect(legacy?.message).toContain('.harness/architecture/');
    expect(legacy?.message).toContain('docs/plans/');
  });

  it('runInitialGraphScan warns when the scan throws', async () => {
    const scan = await import('../../src/commands/graph/scan');
    vi.mocked(scan.runScan).mockRejectedValueOnce(new Error('graph unavailable'));
    const { steps } = await runSetup('/tmp/whatever');
    const graphStep = steps.find((s) => s.message.includes('Knowledge graph creation skipped'));
    expect(graphStep?.status).toBe('warn');
    expect(graphStep?.message).toContain('graph unavailable');
  });
});
