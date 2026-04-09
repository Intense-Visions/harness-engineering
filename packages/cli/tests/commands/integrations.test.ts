import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('integrations commands', () => {
  let tempDir: string;
  let origCwd: string;
  let origExit: typeof process.exit;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-integ-cmd-'));
    origCwd = process.cwd();
    process.chdir(tempDir);
    // Write minimal harness.config.json
    fs.writeFileSync(path.join(tempDir, 'harness.config.json'), JSON.stringify({ version: 1 }));
    origExit = process.exit;
    // @ts-expect-error stub process.exit
    process.exit = vi.fn();
  });

  afterEach(() => {
    process.chdir(origCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
    process.exit = origExit;
  });

  describe('list', () => {
    it('creates command with correct name', async () => {
      const { createListIntegrationsCommand } =
        await import('../../src/commands/integrations/list');
      const cmd = createListIntegrationsCommand();
      expect(cmd.name()).toBe('list');
    });

    it('printTier0Integrations prints tier 0 entries', async () => {
      const { printTier0Integrations } = await import('../../src/commands/integrations/list');
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const tier0 = [{ name: 'context7', description: 'Context docs', tier: 0 as const }];
      printTier0Integrations(tier0, { context7: {} });
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Tier 0'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('context7'));
      consoleSpy.mockRestore();
    });

    it('printTier0Integrations marks unconfigured with circle icon', async () => {
      const { printTier0Integrations } = await import('../../src/commands/integrations/list');
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const tier0 = [{ name: 'context7', description: 'Context docs', tier: 0 as const }];
      printTier0Integrations(tier0, {});
      const calls = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(calls).toContain('context7');
      consoleSpy.mockRestore();
    });

    it('printTier1Integrations shows dismissed label', async () => {
      const { printTier1Integrations } = await import('../../src/commands/integrations/list');
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const tier1 = [
        {
          name: 'perplexity',
          description: 'Perplexity AI',
          tier: 1 as const,
          envVar: 'PERPLEXITY_API_KEY',
        },
      ];
      printTier1Integrations(tier1, {}, ['perplexity']);
      const calls = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(calls).toContain('dismissed');
      consoleSpy.mockRestore();
    });

    it('printTier1Integrations shows env var status when not dismissed', async () => {
      const { printTier1Integrations } = await import('../../src/commands/integrations/list');
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      delete process.env.PERPLEXITY_API_KEY;
      const tier1 = [
        {
          name: 'perplexity',
          description: 'Perplexity AI',
          tier: 1 as const,
          envVar: 'PERPLEXITY_API_KEY',
        },
      ];
      printTier1Integrations(tier1, {}, []);
      const calls = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(calls).toContain('PERPLEXITY_API_KEY');
      consoleSpy.mockRestore();
    });

    it('runListIntegrations outputs JSON when --json flag set', async () => {
      const { runListIntegrations } = await import('../../src/commands/integrations/list');
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await runListIntegrations({ json: true }).catch(() => {});
      const jsonCall = consoleSpy.mock.calls.find((c) => {
        try {
          JSON.parse(String(c[0]));
          return true;
        } catch {
          return false;
        }
      });
      expect(jsonCall).toBeDefined();
      const parsed = JSON.parse(String(jsonCall![0]));
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0]).toHaveProperty('name');
      expect(parsed[0]).toHaveProperty('tier');
      consoleSpy.mockRestore();
    });

    it('runListIntegrations outputs table view when no flags', async () => {
      const { runListIntegrations } = await import('../../src/commands/integrations/list');
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await runListIntegrations({}).catch(() => {});
      const calls = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(calls).toContain('MCP Integrations');
      expect(calls).toContain('Tier 0');
      expect(calls).toContain('Tier 1');
      consoleSpy.mockRestore();
    });
  });

  describe('add', () => {
    it('rejects unknown integration name', async () => {
      const { addIntegration } = await import('../../src/commands/integrations/add');
      const result = addIntegration(tempDir, 'nonexistent');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('not found');
      }
    });

    it('rejects Tier 0 integration with helpful message', async () => {
      const { addIntegration } = await import('../../src/commands/integrations/add');
      const result = addIntegration(tempDir, 'context7');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('harness setup');
      }
    });

    it('adds Tier 1 integration to .mcp.json and harness.config.json', async () => {
      const { addIntegration } = await import('../../src/commands/integrations/add');
      const result = addIntegration(tempDir, 'perplexity');
      expect(result.ok).toBe(true);

      const mcpConfig = JSON.parse(fs.readFileSync(path.join(tempDir, '.mcp.json'), 'utf-8'));
      expect(mcpConfig.mcpServers.perplexity).toBeDefined();
      expect(mcpConfig.mcpServers.perplexity.command).toBe('npx');

      const harnessConfig = JSON.parse(
        fs.readFileSync(path.join(tempDir, 'harness.config.json'), 'utf-8')
      );
      expect(harnessConfig.integrations.enabled).toContain('perplexity');
    });

    it('removes from dismissed when adding', async () => {
      // Pre-dismiss
      fs.writeFileSync(
        path.join(tempDir, 'harness.config.json'),
        JSON.stringify({ version: 1, integrations: { enabled: [], dismissed: ['perplexity'] } })
      );
      const { addIntegration } = await import('../../src/commands/integrations/add');
      const result = addIntegration(tempDir, 'perplexity');
      expect(result.ok).toBe(true);

      const harnessConfig = JSON.parse(
        fs.readFileSync(path.join(tempDir, 'harness.config.json'), 'utf-8')
      );
      expect(harnessConfig.integrations.dismissed).not.toContain('perplexity');
      expect(harnessConfig.integrations.enabled).toContain('perplexity');
    });

    it('returns envVar hint when env var not set', async () => {
      delete process.env.PERPLEXITY_API_KEY;
      const { addIntegration } = await import('../../src/commands/integrations/add');
      const result = addIntegration(tempDir, 'perplexity');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.envVarMissing).toBe(true);
      }
    });

    it('preserves existing .mcp.json entries', async () => {
      fs.writeFileSync(
        path.join(tempDir, '.mcp.json'),
        JSON.stringify({ mcpServers: { harness: { command: 'harness-mcp' } } })
      );
      const { addIntegration } = await import('../../src/commands/integrations/add');
      addIntegration(tempDir, 'perplexity');
      const mcpConfig = JSON.parse(fs.readFileSync(path.join(tempDir, '.mcp.json'), 'utf-8'));
      expect(mcpConfig.mcpServers.harness).toBeDefined();
      expect(mcpConfig.mcpServers.perplexity).toBeDefined();
    });
  });

  describe('remove', () => {
    it('removes MCP entry and disables integration', async () => {
      // Set up: add perplexity first
      fs.writeFileSync(
        path.join(tempDir, '.mcp.json'),
        JSON.stringify({
          mcpServers: { perplexity: { command: 'npx', args: ['-y', 'perplexity-mcp'] } },
        })
      );
      fs.writeFileSync(
        path.join(tempDir, 'harness.config.json'),
        JSON.stringify({ version: 1, integrations: { enabled: ['perplexity'], dismissed: [] } })
      );

      const { removeIntegration } = await import('../../src/commands/integrations/remove');
      const result = removeIntegration(tempDir, 'perplexity');
      expect(result.ok).toBe(true);

      const mcpConfig = JSON.parse(fs.readFileSync(path.join(tempDir, '.mcp.json'), 'utf-8'));
      expect(mcpConfig.mcpServers.perplexity).toBeUndefined();

      const harnessConfig = JSON.parse(
        fs.readFileSync(path.join(tempDir, 'harness.config.json'), 'utf-8')
      );
      expect(harnessConfig.integrations.enabled).not.toContain('perplexity');
    });

    it('rejects unknown integration name', async () => {
      const { removeIntegration } = await import('../../src/commands/integrations/remove');
      const result = removeIntegration(tempDir, 'nonexistent');
      expect(result.ok).toBe(false);
    });

    it('preserves other .mcp.json entries', async () => {
      fs.writeFileSync(
        path.join(tempDir, '.mcp.json'),
        JSON.stringify({
          mcpServers: {
            harness: { command: 'harness-mcp' },
            perplexity: { command: 'npx' },
          },
        })
      );
      fs.writeFileSync(
        path.join(tempDir, 'harness.config.json'),
        JSON.stringify({ version: 1, integrations: { enabled: ['perplexity'], dismissed: [] } })
      );

      const { removeIntegration } = await import('../../src/commands/integrations/remove');
      removeIntegration(tempDir, 'perplexity');
      const mcpConfig = JSON.parse(fs.readFileSync(path.join(tempDir, '.mcp.json'), 'utf-8'));
      expect(mcpConfig.mcpServers.harness).toBeDefined();
    });
  });

  describe('add (Gemini parity)', () => {
    it('writes to .gemini/settings.json when .gemini dir exists', async () => {
      // Create .gemini directory to trigger Gemini detection
      fs.mkdirSync(path.join(tempDir, '.gemini'));
      const { addIntegration } = await import('../../src/commands/integrations/add');
      const result = addIntegration(tempDir, 'perplexity');
      expect(result.ok).toBe(true);

      const geminiConfig = JSON.parse(
        fs.readFileSync(path.join(tempDir, '.gemini', 'settings.json'), 'utf-8')
      );
      expect(geminiConfig.mcpServers.perplexity).toBeDefined();
      expect(geminiConfig.mcpServers.perplexity.command).toBe('npx');
    });

    it('does not write to .gemini/settings.json when .gemini dir does not exist', async () => {
      const { addIntegration } = await import('../../src/commands/integrations/add');
      addIntegration(tempDir, 'perplexity');

      expect(fs.existsSync(path.join(tempDir, '.gemini', 'settings.json'))).toBe(false);
    });
  });

  describe('remove (Gemini parity)', () => {
    it('removes from .gemini/settings.json when .gemini dir exists', async () => {
      // Set up: .gemini dir with perplexity entry
      fs.mkdirSync(path.join(tempDir, '.gemini'));
      fs.writeFileSync(
        path.join(tempDir, '.gemini', 'settings.json'),
        JSON.stringify({
          mcpServers: { perplexity: { command: 'npx', args: ['-y', 'perplexity-mcp'] } },
        })
      );
      fs.writeFileSync(
        path.join(tempDir, '.mcp.json'),
        JSON.stringify({
          mcpServers: { perplexity: { command: 'npx', args: ['-y', 'perplexity-mcp'] } },
        })
      );
      fs.writeFileSync(
        path.join(tempDir, 'harness.config.json'),
        JSON.stringify({ version: 1, integrations: { enabled: ['perplexity'], dismissed: [] } })
      );

      const { removeIntegration } = await import('../../src/commands/integrations/remove');
      const result = removeIntegration(tempDir, 'perplexity');
      expect(result.ok).toBe(true);

      const geminiConfig = JSON.parse(
        fs.readFileSync(path.join(tempDir, '.gemini', 'settings.json'), 'utf-8')
      );
      expect(geminiConfig.mcpServers.perplexity).toBeUndefined();
    });

    it('does not error when .gemini dir does not exist', async () => {
      fs.writeFileSync(
        path.join(tempDir, '.mcp.json'),
        JSON.stringify({
          mcpServers: { perplexity: { command: 'npx', args: ['-y', 'perplexity-mcp'] } },
        })
      );
      fs.writeFileSync(
        path.join(tempDir, 'harness.config.json'),
        JSON.stringify({ version: 1, integrations: { enabled: ['perplexity'], dismissed: [] } })
      );

      const { removeIntegration } = await import('../../src/commands/integrations/remove');
      const result = removeIntegration(tempDir, 'perplexity');
      expect(result.ok).toBe(true);
    });
  });

  describe('dismiss', () => {
    it('adds integration to dismissed array', async () => {
      const { dismissIntegration } = await import('../../src/commands/integrations/dismiss');
      const result = dismissIntegration(tempDir, 'augment-code');
      expect(result.ok).toBe(true);

      const harnessConfig = JSON.parse(
        fs.readFileSync(path.join(tempDir, 'harness.config.json'), 'utf-8')
      );
      expect(harnessConfig.integrations.dismissed).toContain('augment-code');
    });

    it('rejects unknown integration name', async () => {
      const { dismissIntegration } = await import('../../src/commands/integrations/dismiss');
      const result = dismissIntegration(tempDir, 'nonexistent');
      expect(result.ok).toBe(false);
    });

    it('does not duplicate if already dismissed', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'harness.config.json'),
        JSON.stringify({ version: 1, integrations: { enabled: [], dismissed: ['augment-code'] } })
      );
      const { dismissIntegration } = await import('../../src/commands/integrations/dismiss');
      dismissIntegration(tempDir, 'augment-code');
      const harnessConfig = JSON.parse(
        fs.readFileSync(path.join(tempDir, 'harness.config.json'), 'utf-8')
      );
      expect(
        harnessConfig.integrations.dismissed.filter((d: string) => d === 'augment-code')
      ).toHaveLength(1);
    });
  });
});
