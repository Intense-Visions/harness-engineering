import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  readMcpConfig,
  writeMcpEntry,
  writeOpencodeMcpEntry,
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

  describe('writeOpencodeMcpEntry', () => {
    it('writes harness entry in OpenCode format (mcp field, command array)', () => {
      const configPath = path.join(tempDir, 'opencode.json');
      writeOpencodeMcpEntry(configPath, 'harness', { command: 'harness', args: ['mcp'] });

      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(config.mcp).toBeDefined();
      expect(config.mcp.harness).toEqual({
        type: 'local',
        command: ['harness', 'mcp'],
        enabled: true,
      });
    });

    it('combines command and args into a single command array', () => {
      const configPath = path.join(tempDir, 'opencode.json');
      writeOpencodeMcpEntry(configPath, 'context7', {
        command: 'npx',
        args: ['-y', '@upstash/context7-mcp'],
      });

      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(config.mcp.context7.command).toEqual(['npx', '-y', '@upstash/context7-mcp']);
    });

    it('translates env to environment field', () => {
      const configPath = path.join(tempDir, 'opencode.json');
      writeOpencodeMcpEntry(configPath, 'perplexity', {
        command: 'npx',
        args: ['-y', 'perplexity-mcp'],
        env: { PERPLEXITY_API_KEY: '${PERPLEXITY_API_KEY}' },
      });

      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(config.mcp.perplexity.environment).toEqual({
        PERPLEXITY_API_KEY: '${PERPLEXITY_API_KEY}',
      });
    });

    it('omits environment when no env is provided', () => {
      const configPath = path.join(tempDir, 'opencode.json');
      writeOpencodeMcpEntry(configPath, 'harness', { command: 'harness', args: ['mcp'] });

      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(config.mcp.harness).not.toHaveProperty('environment');
    });

    it('preserves existing top-level fields like $schema and model', () => {
      const configPath = path.join(tempDir, 'opencode.json');
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          $schema: 'https://opencode.ai/config.json',
          model: 'anthropic/claude-sonnet-4-5',
        })
      );

      writeOpencodeMcpEntry(configPath, 'harness', { command: 'harness', args: ['mcp'] });

      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(config.$schema).toBe('https://opencode.ai/config.json');
      expect(config.model).toBe('anthropic/claude-sonnet-4-5');
      expect(config.mcp.harness).toBeDefined();
    });

    it('preserves existing mcp entries when adding harness', () => {
      const configPath = path.join(tempDir, 'opencode.json');
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          mcp: { other: { type: 'local', command: ['foo'], enabled: true } },
        })
      );

      writeOpencodeMcpEntry(configPath, 'harness', { command: 'harness', args: ['mcp'] });

      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(config.mcp.other).toBeDefined();
      expect(config.mcp.harness).toBeDefined();
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
