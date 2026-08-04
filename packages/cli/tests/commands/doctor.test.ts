import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readdirSync: vi.fn(() => []),
    readFileSync: vi.fn(() => '{}'),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

import * as fs from 'fs';
import { runDoctor, isCatalogStale, checkCatalogFreshness } from '../../src/commands/doctor';
import { CATALOG_LAST_REVIEWED } from '../../src/integrations/registry';

const mockExistsSync = vi.mocked(fs.existsSync);
const mockReaddirSync = vi.mocked(fs.readdirSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);

// MCP config with all Tier 0 integrations configured (context7, playwright, harness)
const mcpJsonFull = JSON.stringify({
  mcpServers: {
    harness: { command: 'harness-mcp' },
    context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] },
    playwright: { command: 'npx', args: ['-y', '@playwright/mcp'] },
  },
});
// Harness config with Tier 1 integrations dismissed (so no info suggestions)
const harnessConfigDismissed = JSON.stringify({
  integrations: { enabled: [], dismissed: ['github', 'exa'] },
});
const claudeDir = path.join(os.homedir(), '.claude', 'commands', 'harness');
const geminiDir = path.join(os.homedir(), '.gemini', 'commands', 'harness');
// Note: checkMcpConfig checks cwd/.gemini/settings.json (project-local), not $HOME/.gemini/settings.json
const geminiSettingsForCwd = (cwd: string) => path.join(cwd, '.gemini', 'settings.json');

function buildExistsMap(cwd: string): Record<string, boolean> {
  return {
    [path.join(cwd, '.mcp.json')]: true,
    [path.join(cwd, '.gemini')]: true,
    [geminiSettingsForCwd(cwd)]: true,
    [path.join(cwd, 'harness.config.json')]: true,
  };
}

const readdirMap: Record<string, string[]> = {
  [claudeDir]: ['init.md', 'validate.md'],
  [geminiDir]: ['init.toml'],
};

function mockAllHealthy(cwd: string) {
  const existsMap = buildExistsMap(cwd);
  mockExistsSync.mockImplementation((p: fs.PathLike) => existsMap[String(p)] ?? false);
  mockReaddirSync.mockImplementation(
    (p: fs.PathOrFileDescriptor) => (readdirMap[String(p)] ?? []) as unknown as fs.Dirent[]
  );

  const readMap: Record<string, string> = {
    [path.join(cwd, '.mcp.json')]: mcpJsonFull,
    [geminiSettingsForCwd(cwd)]: mcpJsonFull,
    [path.join(cwd, 'harness.config.json')]: harnessConfigDismissed,
  };
  mockReadFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => readMap[String(p)] ?? '{}');
}

describe('runDoctor', () => {
  const originalVersion = process.version;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to defaults (clearAllMocks doesn't reset mockImplementation)
    mockExistsSync.mockReturnValue(false);
    mockReaddirSync.mockReturnValue([] as unknown as fs.Dirent[]);
    mockReadFileSync.mockReturnValue('{}');
    Object.defineProperty(process, 'version', { value: 'v22.4.0', writable: true });
  });

  afterEach(() => {
    Object.defineProperty(process, 'version', { value: originalVersion, writable: true });
  });

  it('returns allPassed true when all checks pass', () => {
    mockAllHealthy('/tmp/project');

    const result = runDoctor('/tmp/project');

    expect(result.allPassed).toBe(true);
    // Hermes Phase 3 / A7 checks (live-pings, hooks, baselines, sessions)
    // produce `info` results when their prerequisites are not configured,
    // which counts as "passed" (info != fail). The original assertion was
    // pre-hardening; relax to allowing any non-fail status.
    expect(result.checks.every((c) => c.status !== 'fail')).toBe(true);
  });

  it('reports Node version check', () => {
    mockAllHealthy('/tmp/project');

    const result = runDoctor('/tmp/project');
    const nodeCheck = result.checks.find((c) => c.name === 'node');

    expect(nodeCheck).toBeDefined();
    expect(nodeCheck!.status).toBe('pass');
    expect(nodeCheck!.message).toContain('Node.js');
    expect(nodeCheck!.message).toContain('v22.4.0');
  });

  it('fails Node version check when below 22', () => {
    Object.defineProperty(process, 'version', { value: 'v20.11.0', writable: true });
    mockAllHealthy('/tmp/project');

    const result = runDoctor('/tmp/project');
    const nodeCheck = result.checks.find((c) => c.name === 'node');

    expect(nodeCheck!.status).toBe('fail');
    expect(nodeCheck!.fix).toBeDefined();
    expect(result.allPassed).toBe(false);
  });

  it('reports slash command counts per platform', () => {
    mockAllHealthy('/tmp/project');

    const result = runDoctor('/tmp/project');
    const claudeSlash = result.checks.find((c) => c.name === 'slash-commands-claude-code');

    expect(claudeSlash!.status).toBe('pass');
    expect(claudeSlash!.message).toContain('2 commands');
  });

  it('fails slash command check when directory is empty or missing', () => {
    mockAllHealthy('/tmp/project');
    mockReaddirSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const result = runDoctor('/tmp/project');
    const slashChecks = result.checks.filter((c) => c.name.startsWith('slash-commands'));

    expect(slashChecks.every((c) => c.status === 'fail')).toBe(true);
    expect(slashChecks.every((c) => c.fix !== undefined)).toBe(true);
  });

  // Regression for #1009/#1010: doctor counted command files but never resolved
  // their `@`-references, so it reported `✓ installed` while every command
  // pointed at a SKILL.md removed by a CLI upgrade. The check must resolve, not
  // count.
  it('fails when a command references a SKILL.md that no longer resolves (#1009/#1010)', () => {
    mockAllHealthy('/tmp/project');
    // One generated Claude command references a SKILL.md under a now-removed
    // versioned install path — the exact shape a CLI upgrade leaves behind.
    const danglingRef = '/old/cli/2.8.0/dist/agents/skills/claude-code/init/SKILL.md';
    mockReadFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
      const s = String(p);
      if (s.endsWith('init.md')) return `# Init\n\n@${danglingRef}\n`;
      return '{}';
    });
    const existsMap = buildExistsMap('/tmp/project');
    mockExistsSync.mockImplementation((p: fs.PathLike) =>
      String(p) === danglingRef ? false : (existsMap[String(p)] ?? false)
    );

    const result = runDoctor('/tmp/project');
    const claudeSlash = result.checks.find((c) => c.name === 'slash-commands-claude-code');

    expect(claudeSlash!.status).toBe('fail');
    expect(claudeSlash!.message).toContain('2 commands, 1 resolvable');
    expect(claudeSlash!.message).toContain(danglingRef);
    expect(claudeSlash!.fix).toContain('generate-slash-commands');
  });

  it('reports the resolvable denominator on a healthy install (#1009)', () => {
    mockAllHealthy('/tmp/project');

    const result = runDoctor('/tmp/project');
    const claudeSlash = result.checks.find((c) => c.name === 'slash-commands-claude-code');

    expect(claudeSlash!.status).toBe('pass');
    expect(claudeSlash!.message).toContain('2 commands, 2 resolvable');
  });

  it('passes MCP check when harness entry exists in .mcp.json', () => {
    mockAllHealthy('/tmp/project');

    const result = runDoctor('/tmp/project');
    const mcpClaude = result.checks.find((c) => c.name === 'mcp-claude');

    expect(mcpClaude!.status).toBe('pass');
    expect(mcpClaude!.message).toContain('Claude Code');
  });

  it('fails MCP check with fix suggestion when not configured', () => {
    const cwd = '/tmp/project';
    // .gemini dir must exist so doctor emits an mcp-gemini check
    mockExistsSync.mockImplementation((p: fs.PathLike) => String(p) === path.join(cwd, '.gemini'));
    mockReaddirSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const result = runDoctor(cwd);
    const mcpClaude = result.checks.find((c) => c.name === 'mcp-claude');
    const mcpGemini = result.checks.find((c) => c.name === 'mcp-gemini');

    expect(mcpClaude!.status).toBe('fail');
    expect(mcpClaude!.fix).toContain('harness setup-mcp --client claude');
    expect(mcpGemini!.status).toBe('fail');
    expect(mcpGemini!.fix).toContain('harness setup-mcp --client gemini');
  });

  it('returns correct check count', () => {
    mockAllHealthy('/tmp/project');

    const result = runDoctor('/tmp/project');

    // node + 2 slash command platforms + 2 MCP platforms + 3 Tier 0
    // integrations = 8 legacy checks. Hermes Phase 3 / A7 adds 8 more:
    // 3 live-pings credentials, 1 hook-validity (info: dir absent),
    // 3 baseline-freshness (info: each absent), 1 session-corruption
    // (info: dir absent) = 16. mcp-catalog-refresh adds 1 catalog-freshness
    // advisory. Total = 17. (Tier 1 dismissed in mock.)
    expect(result.checks).toHaveLength(17);
  });

  it('is read-only — does not call writeFileSync or mkdirSync', () => {
    const writeFileSpy = vi.mocked(fs.writeFileSync);
    const mkdirSpy = vi.mocked(fs.mkdirSync);
    mockAllHealthy('/tmp/project');

    runDoctor('/tmp/project');

    expect(writeFileSpy).not.toHaveBeenCalled();
    expect(mkdirSpy).not.toHaveBeenCalled();
  });

  it('returns allPassed false when any check fails', () => {
    mockReaddirSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const result = runDoctor('/tmp/project');

    expect(result.allPassed).toBe(false);
    const failCount = result.checks.filter((c) => c.status === 'fail').length;
    expect(failCount).toBeGreaterThan(0);
  });

  describe('integration checks', () => {
    it('fails when a Tier 0 integration is missing from .mcp.json', () => {
      const cwd = '/tmp/project';
      // MCP config with harness but WITHOUT context7
      const mcpNoContext7 = JSON.stringify({
        mcpServers: {
          harness: { command: 'harness-mcp' },
          playwright: { command: 'npx', args: ['-y', '@playwright/mcp'] },
        },
      });
      const existsMap: Record<string, boolean> = {
        [path.join(cwd, '.mcp.json')]: true,
        [geminiSettingsForCwd(cwd)]: true,
        [path.join(cwd, 'harness.config.json')]: true,
      };
      mockExistsSync.mockImplementation((p: fs.PathLike) => existsMap[String(p)] ?? false);
      mockReaddirSync.mockImplementation(
        (p: fs.PathOrFileDescriptor) => (readdirMap[String(p)] ?? []) as unknown as fs.Dirent[]
      );
      const readMap: Record<string, string> = {
        [path.join(cwd, '.mcp.json')]: mcpNoContext7,
        [geminiSettingsForCwd(cwd)]: mcpNoContext7,
        [path.join(cwd, 'harness.config.json')]: harnessConfigDismissed,
      };
      mockReadFileSync.mockImplementation(
        (p: fs.PathOrFileDescriptor) => readMap[String(p)] ?? '{}'
      );

      const result = runDoctor(cwd);
      const context7Check = result.checks.find((c) => c.name === 'integration-context7');

      expect(context7Check).toBeDefined();
      expect(context7Check!.status).toBe('fail');
      expect(context7Check!.message).toContain('Context7');
      expect(context7Check!.message).toContain('harness setup');
      expect(result.allPassed).toBe(false);
    });

    it('passes when all Tier 0 integrations are in .mcp.json', () => {
      mockAllHealthy('/tmp/project');

      const result = runDoctor('/tmp/project');
      const tier0Checks = result.checks.filter(
        (c) => c.name.startsWith('integration-') && !c.name.endsWith('-env')
      );

      const tier0Pass = tier0Checks.filter((c) => c.status === 'pass');
      expect(tier0Pass).toHaveLength(3); // context7, playwright, harness
    });

    it('shows info suggestions for non-enabled, non-dismissed Tier 1 integrations', () => {
      const cwd = '/tmp/project';
      // No dismissed integrations — Tier 1 should show as info
      const harnessConfigEmpty = JSON.stringify({
        integrations: { enabled: [], dismissed: [] },
      });
      const existsMap: Record<string, boolean> = {
        [path.join(cwd, '.mcp.json')]: true,
        [geminiSettingsForCwd(cwd)]: true,
        [path.join(cwd, 'harness.config.json')]: true,
      };
      mockExistsSync.mockImplementation((p: fs.PathLike) => existsMap[String(p)] ?? false);
      mockReaddirSync.mockImplementation(
        (p: fs.PathOrFileDescriptor) => (readdirMap[String(p)] ?? []) as unknown as fs.Dirent[]
      );
      const readMap: Record<string, string> = {
        [path.join(cwd, '.mcp.json')]: mcpJsonFull,
        [geminiSettingsForCwd(cwd)]: mcpJsonFull,
        [path.join(cwd, 'harness.config.json')]: harnessConfigEmpty,
      };
      mockReadFileSync.mockImplementation(
        (p: fs.PathOrFileDescriptor) => readMap[String(p)] ?? '{}'
      );

      const result = runDoctor(cwd);
      const exaCheck = result.checks.find((c) => c.name === 'integration-exa');

      expect(exaCheck).toBeDefined();
      expect(exaCheck!.status).toBe('info');
      expect(exaCheck!.message).toContain('Exa');
      expect(exaCheck!.message).toContain('harness integrations add exa');
    });

    it('info status does not cause allPassed to be false', () => {
      const cwd = '/tmp/project';
      const harnessConfigEmpty = JSON.stringify({
        integrations: { enabled: [], dismissed: [] },
      });
      const existsMap: Record<string, boolean> = {
        [path.join(cwd, '.mcp.json')]: true,
        [geminiSettingsForCwd(cwd)]: true,
        [path.join(cwd, 'harness.config.json')]: true,
      };
      mockExistsSync.mockImplementation((p: fs.PathLike) => existsMap[String(p)] ?? false);
      mockReaddirSync.mockImplementation(
        (p: fs.PathOrFileDescriptor) => (readdirMap[String(p)] ?? []) as unknown as fs.Dirent[]
      );
      const readMap: Record<string, string> = {
        [path.join(cwd, '.mcp.json')]: mcpJsonFull,
        [geminiSettingsForCwd(cwd)]: mcpJsonFull,
        [path.join(cwd, 'harness.config.json')]: harnessConfigEmpty,
      };
      mockReadFileSync.mockImplementation(
        (p: fs.PathOrFileDescriptor) => readMap[String(p)] ?? '{}'
      );

      const result = runDoctor(cwd);
      const infoChecks = result.checks.filter((c) => c.status === 'info');

      expect(infoChecks.length).toBeGreaterThan(0);
      expect(result.allPassed).toBe(true);
    });

    it('warns when Tier 0 integration in Claude but missing from Gemini', () => {
      const cwd = '/tmp/project';
      // Gemini config missing context7
      const geminiNoContext7 = JSON.stringify({
        mcpServers: {
          harness: { command: 'harness-mcp' },
          playwright: { command: 'npx', args: ['-y', '@playwright/mcp'] },
        },
      });
      const existsMap: Record<string, boolean> = {
        [path.join(cwd, '.mcp.json')]: true,
        [geminiSettingsForCwd(cwd)]: true,
        [path.join(cwd, '.gemini')]: true,
        [path.join(cwd, 'harness.config.json')]: true,
      };
      mockExistsSync.mockImplementation((p: fs.PathLike) => existsMap[String(p)] ?? false);
      mockReaddirSync.mockImplementation(
        (p: fs.PathOrFileDescriptor) => (readdirMap[String(p)] ?? []) as unknown as fs.Dirent[]
      );
      const readMap: Record<string, string> = {
        [path.join(cwd, '.mcp.json')]: mcpJsonFull,
        [geminiSettingsForCwd(cwd)]: geminiNoContext7,
        [path.join(cwd, 'harness.config.json')]: harnessConfigDismissed,
      };
      mockReadFileSync.mockImplementation(
        (p: fs.PathOrFileDescriptor) => readMap[String(p)] ?? '{}'
      );

      const result = runDoctor(cwd);
      const context7Check = result.checks.find((c) => c.name === 'integration-context7');

      expect(context7Check).toBeDefined();
      expect(context7Check!.status).toBe('warn');
      expect(context7Check!.message).toContain('Gemini CLI');
      // warn should not fail allPassed
      expect(result.allPassed).toBe(true);
    });

    it('does not suggest dismissed Tier 1 integrations', () => {
      mockAllHealthy('/tmp/project');

      const result = runDoctor('/tmp/project');
      const exaCheck = result.checks.find((c) => c.name === 'integration-exa');

      // exa is dismissed in mockAllHealthy, so no check should exist
      expect(exaCheck).toBeUndefined();
    });

    it('warns when enabled Tier 1 integration has missing env var', () => {
      const cwd = '/tmp/project';
      const harnessConfigEnabled = JSON.stringify({
        integrations: { enabled: ['exa'], dismissed: [] },
      });
      const existsMap: Record<string, boolean> = {
        [path.join(cwd, '.mcp.json')]: true,
        [geminiSettingsForCwd(cwd)]: true,
        [path.join(cwd, 'harness.config.json')]: true,
      };
      mockExistsSync.mockImplementation((p: fs.PathLike) => existsMap[String(p)] ?? false);
      mockReaddirSync.mockImplementation(
        (p: fs.PathOrFileDescriptor) => (readdirMap[String(p)] ?? []) as unknown as fs.Dirent[]
      );
      const readMap: Record<string, string> = {
        [path.join(cwd, '.mcp.json')]: mcpJsonFull,
        [geminiSettingsForCwd(cwd)]: mcpJsonFull,
        [path.join(cwd, 'harness.config.json')]: harnessConfigEnabled,
      };
      mockReadFileSync.mockImplementation(
        (p: fs.PathOrFileDescriptor) => readMap[String(p)] ?? '{}'
      );
      // Ensure EXA_API_KEY is not set
      const origEnv = process.env.EXA_API_KEY;
      delete process.env.EXA_API_KEY;

      const result = runDoctor(cwd);
      const envCheck = result.checks.find((c) => c.name === 'integration-exa-env');

      expect(envCheck).toBeDefined();
      expect(envCheck!.status).toBe('warn');
      expect(envCheck!.message).toContain('EXA_API_KEY');
      expect(envCheck!.message).toContain('Exa');
      // warn should not cause allPassed to be false
      expect(result.allPassed).toBe(true);

      // Restore
      if (origEnv !== undefined) process.env.EXA_API_KEY = origEnv;
    });
  });

  describe('catalog freshness advisory (SC4)', () => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const STALE_DAYS = 120;
    const reviewedMs = Date.parse('2026-01-01');

    it('isCatalogStale is false when the catalog is fresh', () => {
      const now = reviewedMs + (STALE_DAYS - 1) * DAY_MS;
      expect(isCatalogStale('2026-01-01', now)).toBe(false);
    });

    it('isCatalogStale is true once the catalog is past the threshold', () => {
      const now = reviewedMs + STALE_DAYS * DAY_MS;
      expect(isCatalogStale('2026-01-01', now)).toBe(true);
    });

    it('isCatalogStale treats an unparseable date as stale', () => {
      expect(isCatalogStale('not-a-date', reviewedMs)).toBe(true);
    });

    it('checkCatalogFreshness emits a non-blocking info advisory when stale', () => {
      const now = Date.parse(CATALOG_LAST_REVIEWED) + (STALE_DAYS + 1) * DAY_MS;
      const [check] = checkCatalogFreshness(now);
      expect(check).toBeDefined();
      expect(check!.name).toBe('catalog-freshness');
      expect(check!.status).toBe('info'); // never 'fail' — non-blocking
      expect(check!.message).toContain('mcp-catalog-refresh');
      // integrations-reconcile: advisory points at the reconcile action
      expect(check!.message).toContain('harness integrations sync');
    });

    it('checkCatalogFreshness passes when fresh', () => {
      const now = Date.parse(CATALOG_LAST_REVIEWED) + 1 * DAY_MS;
      const [check] = checkCatalogFreshness(now);
      expect(check!.status).toBe('pass');
    });

    it('the advisory never changes doctor exit code (only info/pass)', () => {
      for (const now of [
        Date.parse(CATALOG_LAST_REVIEWED) + 1 * DAY_MS,
        Date.parse(CATALOG_LAST_REVIEWED) + (STALE_DAYS + 10) * DAY_MS,
      ]) {
        for (const check of checkCatalogFreshness(now)) {
          expect(check.status).not.toBe('fail');
        }
      }
    });
  });
});
