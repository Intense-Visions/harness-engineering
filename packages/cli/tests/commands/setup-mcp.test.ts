import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { setupMcp, createSetupMcpCommand } from '../../src/commands/setup-mcp';

describe('setup-mcp command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-setup-mcp-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('createSetupMcpCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createSetupMcpCommand();
      expect(cmd.name()).toBe('setup-mcp');
    });

    it('has --client option with default all', () => {
      const cmd = createSetupMcpCommand();
      const opt = cmd.options.find((o) => o.long === '--client');
      expect(opt).toBeDefined();
      expect(opt!.defaultValue).toBe('all');
    });
  });

  describe('setupMcp', () => {
    it('configures Claude Code MCP server', () => {
      const result = setupMcp(tempDir, 'claude');
      expect(result.configured).toContain('Claude Code');
      expect(result.skipped).toHaveLength(0);

      const configPath = path.join(tempDir, '.mcp.json');
      expect(fs.existsSync(configPath)).toBe(true);
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(config.mcpServers.harness).toBeDefined();
      expect(config.mcpServers.harness.command).toBe('harness-mcp');
    });

    it('configures Gemini CLI MCP server', () => {
      const result = setupMcp(tempDir, 'gemini');
      expect(result.configured).toContain('Gemini CLI');

      const configPath = path.join(tempDir, '.gemini', 'settings.json');
      expect(fs.existsSync(configPath)).toBe(true);
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(config.mcpServers.harness).toBeDefined();
    });

    it('configures both clients when client is all', () => {
      const result = setupMcp(tempDir, 'all');
      expect(result.configured).toContain('Claude Code');
      expect(result.configured).toContain('Gemini CLI');
    });

    it('skips Claude Code if already configured', () => {
      // First run configures
      setupMcp(tempDir, 'claude');
      // Second run skips
      const result = setupMcp(tempDir, 'claude');
      expect(result.skipped).toContain('Claude Code');
      expect(result.configured).toHaveLength(0);
    });

    it('skips Gemini CLI if already configured', () => {
      setupMcp(tempDir, 'gemini');
      const result = setupMcp(tempDir, 'gemini');
      expect(result.skipped).toContain('Gemini CLI');
      expect(result.configured).toHaveLength(0);
    });

    it('preserves existing config keys when adding harness', () => {
      const configPath = path.join(tempDir, '.mcp.json');
      fs.writeFileSync(
        configPath,
        JSON.stringify({ mcpServers: { other: { command: 'foo', args: [] } } })
      );

      setupMcp(tempDir, 'claude');

      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(config.mcpServers.other).toBeDefined();
      expect(config.mcpServers.harness).toBeDefined();
    });

    it('handles missing config file gracefully', () => {
      const result = setupMcp(tempDir, 'claude');
      expect(result.configured).toContain('Claude Code');
    });

    it('handles corrupted config file by creating backup', () => {
      const configPath = path.join(tempDir, '.mcp.json');
      fs.writeFileSync(configPath, 'not valid json{{{');

      const result = setupMcp(tempDir, 'claude');
      expect(result.configured).toContain('Claude Code');
      expect(fs.existsSync(configPath + '.bak')).toBe(true);
    });

    it('returns trustedFolder status for gemini', () => {
      const result = setupMcp(tempDir, 'gemini');
      expect(typeof result.trustedFolder).toBe('boolean');
    });

    it('does not set trustedFolder for claude-only', () => {
      const result = setupMcp(tempDir, 'claude');
      expect(result.trustedFolder).toBe(false);
    });

    it('configures Codex CLI MCP server', () => {
      const result = setupMcp(tempDir, 'codex');
      expect(result.configured).toContain('Codex CLI');
      expect(result.skipped).not.toContain('Codex CLI');

      const configPath = path.join(tempDir, '.codex', 'config.toml');
      expect(fs.existsSync(configPath)).toBe(true);
      const content = fs.readFileSync(configPath, 'utf-8');
      expect(content).toContain('[mcp_servers.harness]');
      expect(content).toContain('command = "harness"');
    });

    it('configures Cursor MCP server', () => {
      const result = setupMcp(tempDir, 'cursor');
      expect(result.configured).toContain('Cursor');
      expect(result.skipped).not.toContain('Cursor');

      const configPath = path.join(tempDir, '.cursor', 'mcp.json');
      expect(fs.existsSync(configPath)).toBe(true);
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(config.mcpServers.harness).toBeDefined();
      expect(config.mcpServers.harness.command).toBe('harness');
    });

    it('configures all four clients when client is all', () => {
      const result = setupMcp(tempDir, 'all');
      expect(result.configured).toContain('Claude Code');
      expect(result.configured).toContain('Gemini CLI');
      expect(result.configured).toContain('Codex CLI');
      expect(result.configured).toContain('Cursor');
    });

    it('skips Codex CLI if already configured', () => {
      setupMcp(tempDir, 'codex');
      const result = setupMcp(tempDir, 'codex');
      expect(result.skipped).toContain('Codex CLI');
      expect(result.configured).not.toContain('Codex CLI');
    });

    it('skips Cursor if already configured', () => {
      setupMcp(tempDir, 'cursor');
      const result = setupMcp(tempDir, 'cursor');
      expect(result.skipped).toContain('Cursor');
      expect(result.configured).not.toContain('Cursor');
    });

    it('does not set trustedFolder for codex-only', () => {
      const result = setupMcp(tempDir, 'codex');
      expect(result.trustedFolder).toBe(false);
    });
  });

  describe('--pick flag stub', () => {
    it('createSetupMcpCommand accepts --pick flag without error', () => {
      const cmd = createSetupMcpCommand();
      const opt = cmd.options.find((o) => o.long === '--pick');
      expect(opt).toBeDefined();
    });
  });
});
