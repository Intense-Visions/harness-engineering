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
