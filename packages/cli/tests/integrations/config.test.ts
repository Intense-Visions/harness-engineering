import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  readMcpConfig,
  writeMcpEntry,
  removeMcpEntry,
  readIntegrationsConfig,
  writeIntegrationsConfig,
} from '../../src/integrations/config';

describe('integrations config', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-integ-config-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('readMcpConfig', () => {
    it('returns empty mcpServers when file does not exist', () => {
      const config = readMcpConfig(path.join(tempDir, '.mcp.json'));
      expect(config).toEqual({ mcpServers: {} });
    });

    it('reads existing .mcp.json', () => {
      const mcpPath = path.join(tempDir, '.mcp.json');
      fs.writeFileSync(
        mcpPath,
        JSON.stringify({ mcpServers: { harness: { command: 'harness-mcp' } } })
      );
      const config = readMcpConfig(mcpPath);
      expect(config.mcpServers?.harness).toBeDefined();
    });

    it('returns empty object for corrupted JSON', () => {
      const mcpPath = path.join(tempDir, '.mcp.json');
      fs.writeFileSync(mcpPath, 'not json{{{');
      const config = readMcpConfig(mcpPath);
      expect(config).toEqual({ mcpServers: {} });
    });
  });

  describe('writeMcpEntry', () => {
    it('adds MCP entry to .mcp.json', () => {
      const mcpPath = path.join(tempDir, '.mcp.json');
      writeMcpEntry(mcpPath, 'perplexity', {
        command: 'npx',
        args: ['-y', 'perplexity-mcp'],
        env: { PERPLEXITY_API_KEY: '${PERPLEXITY_API_KEY}' },
      });
      const config = JSON.parse(fs.readFileSync(mcpPath, 'utf-8'));
      expect(config.mcpServers.perplexity.command).toBe('npx');
      expect(config.mcpServers.perplexity.args).toEqual(['-y', 'perplexity-mcp']);
      expect(config.mcpServers.perplexity.env).toEqual({
        PERPLEXITY_API_KEY: '${PERPLEXITY_API_KEY}',
      });
    });

    it('preserves existing entries', () => {
      const mcpPath = path.join(tempDir, '.mcp.json');
      fs.writeFileSync(
        mcpPath,
        JSON.stringify({ mcpServers: { harness: { command: 'harness-mcp' } } })
      );
      writeMcpEntry(mcpPath, 'perplexity', { command: 'npx', args: ['-y', 'perplexity-mcp'] });
      const config = JSON.parse(fs.readFileSync(mcpPath, 'utf-8'));
      expect(config.mcpServers.harness).toBeDefined();
      expect(config.mcpServers.perplexity).toBeDefined();
    });
  });

  describe('removeMcpEntry', () => {
    it('removes MCP entry from .mcp.json', () => {
      const mcpPath = path.join(tempDir, '.mcp.json');
      fs.writeFileSync(
        mcpPath,
        JSON.stringify({
          mcpServers: { harness: { command: 'harness-mcp' }, perplexity: { command: 'npx' } },
        })
      );
      removeMcpEntry(mcpPath, 'perplexity');
      const config = JSON.parse(fs.readFileSync(mcpPath, 'utf-8'));
      expect(config.mcpServers.perplexity).toBeUndefined();
      expect(config.mcpServers.harness).toBeDefined();
    });

    it('does nothing if entry does not exist', () => {
      const mcpPath = path.join(tempDir, '.mcp.json');
      fs.writeFileSync(
        mcpPath,
        JSON.stringify({ mcpServers: { harness: { command: 'harness-mcp' } } })
      );
      removeMcpEntry(mcpPath, 'nonexistent');
      const config = JSON.parse(fs.readFileSync(mcpPath, 'utf-8'));
      expect(config.mcpServers.harness).toBeDefined();
    });

    it('does nothing if file does not exist', () => {
      const mcpPath = path.join(tempDir, '.mcp.json');
      expect(() => removeMcpEntry(mcpPath, 'perplexity')).not.toThrow();
    });
  });

  describe('readIntegrationsConfig', () => {
    it('returns defaults when no integrations section', () => {
      const configPath = path.join(tempDir, 'harness.config.json');
      fs.writeFileSync(configPath, JSON.stringify({ version: 1 }));
      const config = readIntegrationsConfig(configPath);
      expect(config).toEqual({ enabled: [], dismissed: [] });
    });

    it('reads existing integrations section', () => {
      const configPath = path.join(tempDir, 'harness.config.json');
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          version: 1,
          integrations: { enabled: ['perplexity'], dismissed: ['augment-code'] },
        })
      );
      const config = readIntegrationsConfig(configPath);
      expect(config.enabled).toEqual(['perplexity']);
      expect(config.dismissed).toEqual(['augment-code']);
    });

    it('returns defaults when file does not exist', () => {
      const config = readIntegrationsConfig(path.join(tempDir, 'harness.config.json'));
      expect(config).toEqual({ enabled: [], dismissed: [] });
    });
  });

  describe('writeIntegrationsConfig', () => {
    it('writes integrations section to config', () => {
      const configPath = path.join(tempDir, 'harness.config.json');
      fs.writeFileSync(configPath, JSON.stringify({ version: 1, name: 'test' }));
      writeIntegrationsConfig(configPath, { enabled: ['perplexity'], dismissed: [] });
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(raw.integrations.enabled).toEqual(['perplexity']);
      expect(raw.name).toBe('test'); // preserves other fields
    });

    it('creates file if it does not exist', () => {
      const configPath = path.join(tempDir, 'harness.config.json');
      writeIntegrationsConfig(configPath, { enabled: ['perplexity'], dismissed: [] });
      expect(fs.existsSync(configPath)).toBe(true);
    });
  });
});
