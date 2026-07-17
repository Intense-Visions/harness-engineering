import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runSyncIntegrations } from '../../src/commands/integrations/sync';
import type { SyncIO } from '../../src/commands/integrations/sync';

// A project configured with the now-deprecated servers and none of the new ones.
const DEPRECATED_MCP = {
  mcpServers: {
    perplexity: { command: 'npx', args: ['-y', 'perplexity-mcp'] },
    'augment-code': { command: 'npx', args: ['-y', 'augment-code-mcp'] },
    'sequential-thinking': { command: 'npx', args: ['-y', 'sequential-thinking-mcp'] },
  },
};

function makeIO(overrides: Partial<SyncIO> = {}): SyncIO {
  return {
    isTTY: false,
    confirm: vi.fn(async () => false),
    log: vi.fn(),
    ...overrides,
  };
}

function readMcp(dir: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(dir, '.mcp.json'), 'utf-8')).mcpServers;
}
function readHarness(dir: string): { enabled: string[]; dismissed: string[] } {
  const raw = JSON.parse(fs.readFileSync(path.join(dir, 'harness.config.json'), 'utf-8'));
  return raw.integrations ?? { enabled: [], dismissed: [] };
}

describe('integrations sync', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-sync-'));
    fs.writeFileSync(path.join(tempDir, 'harness.config.json'), JSON.stringify({ version: 1 }));
    fs.writeFileSync(path.join(tempDir, '.mcp.json'), JSON.stringify(DEPRECATED_MCP));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('SC1 — report-only default mutates nothing', () => {
    it('no flags: reports deprecated + newly-suggested and leaves config byte-identical', async () => {
      const mcpBefore = fs.readFileSync(path.join(tempDir, '.mcp.json'), 'utf-8');
      const cfgBefore = fs.readFileSync(path.join(tempDir, 'harness.config.json'), 'utf-8');
      const lines: string[] = [];
      const io = makeIO({ log: (m = '') => lines.push(m) });

      await runSyncIntegrations(tempDir, {}, io);

      // byte-identical
      expect(fs.readFileSync(path.join(tempDir, '.mcp.json'), 'utf-8')).toBe(mcpBefore);
      expect(fs.readFileSync(path.join(tempDir, 'harness.config.json'), 'utf-8')).toBe(cfgBefore);
      // reported both directions
      const out = lines.join('\n');
      expect(out).toContain('perplexity');
      expect(out).toContain('harness');
      expect(out).toContain('exa');
      // never prompted in report-only mode
      expect(io.confirm).not.toHaveBeenCalled();
    });
  });

  describe('SC2 — --yes applies the plan via shared helpers', () => {
    it('adds Tier-0 harness, surfaces Tier-1 env need, removes deprecated', async () => {
      const io = makeIO(); // isTTY false but --yes forces apply, no prompts
      await runSyncIntegrations(tempDir, { yes: true }, io);

      const mcp = readMcp(tempDir);
      const cfg = readHarness(tempDir);

      // Tier-0 harness added directly
      expect(mcp.harness).toBeDefined();
      expect(cfg.enabled).toContain('harness');

      // Tier-1 github/exa added with env placeholder surfaced
      expect(mcp.github).toBeDefined();
      expect(mcp.exa).toBeDefined();
      expect(cfg.enabled).toContain('exa');
      expect(cfg.enabled).toContain('github');

      // deprecated removed from .mcp.json
      expect(mcp.perplexity).toBeUndefined();
      expect(mcp['augment-code']).toBeUndefined();
      expect(mcp['sequential-thinking']).toBeUndefined();

      // --yes never prompts
      expect(io.confirm).not.toHaveBeenCalled();
    });

    it('surfaces the required env var for a Tier-1 add when unset', async () => {
      delete process.env.EXA_API_KEY;
      delete process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
      const lines: string[] = [];
      const io = makeIO({ log: (m = '') => lines.push(m) });
      // capture logger output too
      const logSpy = vi
        .spyOn(console, 'log')
        .mockImplementation((...args: unknown[]) =>
          lines.push(args.map((a) => String(a ?? '')).join(' '))
        );
      await runSyncIntegrations(tempDir, { yes: true }, io);
      logSpy.mockRestore();
      const out = lines.join('\n');
      expect(out).toContain('EXA_API_KEY');
      expect(out).toContain('GITHUB_PERSONAL_ACCESS_TOKEN');
    });
  });

  describe('SC3 — consent gating', () => {
    it('non-TTY WITHOUT --yes never mutates even with --apply', async () => {
      const mcpBefore = fs.readFileSync(path.join(tempDir, '.mcp.json'), 'utf-8');
      const cfgBefore = fs.readFileSync(path.join(tempDir, 'harness.config.json'), 'utf-8');
      const io = makeIO({ isTTY: false });

      await runSyncIntegrations(tempDir, { apply: true }, io);

      expect(fs.readFileSync(path.join(tempDir, '.mcp.json'), 'utf-8')).toBe(mcpBefore);
      expect(fs.readFileSync(path.join(tempDir, 'harness.config.json'), 'utf-8')).toBe(cfgBefore);
      expect(io.confirm).not.toHaveBeenCalled();
    });

    it('interactive --apply: declined add prompt skips exactly that change; removals still offered', async () => {
      // confirm: first call (adds) => false, second call (removes) => true
      const confirm = vi
        .fn<(q: string) => Promise<boolean>>()
        .mockResolvedValueOnce(false) // decline adds
        .mockResolvedValueOnce(true); // accept removes
      const io = makeIO({ isTTY: true, confirm });

      await runSyncIntegrations(tempDir, { apply: true }, io);

      const mcp = readMcp(tempDir);
      // adds declined -> harness NOT added
      expect(mcp.harness).toBeUndefined();
      expect(mcp.exa).toBeUndefined();
      // removes accepted -> deprecated gone
      expect(mcp.perplexity).toBeUndefined();
      expect(confirm).toHaveBeenCalledTimes(2);
    });

    it('interactive --apply: declining removals dismisses instead of removing', async () => {
      const confirm = vi
        .fn<(q: string) => Promise<boolean>>()
        .mockResolvedValueOnce(false) // decline adds
        .mockResolvedValueOnce(false); // decline removes -> dismiss
      const io = makeIO({ isTTY: true, confirm });

      await runSyncIntegrations(tempDir, { apply: true }, io);

      const mcp = readMcp(tempDir);
      const cfg = readHarness(tempDir);
      // still present in mcp (dismiss keeps the server)
      expect(mcp.perplexity).toBeDefined();
      // but dismissed in harness.config.json
      expect(cfg.dismissed).toContain('perplexity');
      expect(cfg.dismissed).toContain('augment-code');
    });
  });

  describe('SC4 — idempotency', () => {
    it('a second sync after --yes reports "In sync" with an empty plan', async () => {
      await runSyncIntegrations(tempDir, { yes: true }, makeIO());

      const lines: string[] = [];
      const io = makeIO({ log: (m = '') => lines.push(m) });
      const logSpy = vi
        .spyOn(console, 'log')
        .mockImplementation((...args: unknown[]) =>
          lines.push(args.map((a) => String(a ?? '')).join(' '))
        );
      await runSyncIntegrations(tempDir, {}, io);
      logSpy.mockRestore();

      const out = lines.join('\n');
      expect(out).toContain('In sync');
      // no further prompts
      expect(io.confirm).not.toHaveBeenCalled();
    });
  });
});
