import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { writeTomlMcpEntry } from '../../src/integrations/toml';

describe('writeTomlMcpEntry', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-toml-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates config.toml with mcp_servers entry when file does not exist', () => {
    const filePath = path.join(tempDir, '.codex', 'config.toml');
    writeTomlMcpEntry(filePath, 'harness', { command: 'harness', args: ['mcp'], enabled: true });

    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('[mcp_servers.harness]');
    expect(content).toContain('command = "harness"');
    expect(content).toContain('args = ["mcp"]');
    expect(content).toContain('enabled = true');
  });

  it('creates parent directory if it does not exist', () => {
    const filePath = path.join(tempDir, 'nested', 'dir', 'config.toml');
    writeTomlMcpEntry(filePath, 'harness', { command: 'harness', args: ['mcp'], enabled: true });
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('preserves existing TOML entries when adding new mcp_servers block', () => {
    const filePath = path.join(tempDir, 'config.toml');
    fs.writeFileSync(filePath, '[model]\nname = "o3"\n\n[other_section]\nfoo = "bar"\n');

    writeTomlMcpEntry(filePath, 'harness', { command: 'harness', args: ['mcp'], enabled: true });

    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('[model]');
    expect(content).toContain('name = "o3"');
    expect(content).toContain('[other_section]');
    expect(content).toContain('foo = "bar"');
    expect(content).toContain('[mcp_servers.harness]');
  });

  it('updates existing mcp_servers.harness block without duplicating it', () => {
    const filePath = path.join(tempDir, 'config.toml');
    // Write an initial entry
    writeTomlMcpEntry(filePath, 'harness', { command: 'harness', args: ['mcp'], enabled: true });
    // Write again (idempotent)
    writeTomlMcpEntry(filePath, 'harness', { command: 'harness', args: ['mcp'], enabled: true });

    const content = fs.readFileSync(filePath, 'utf-8');
    const matches = content.match(/\[mcp_servers\.harness\]/g);
    expect(matches).toHaveLength(1);
  });

  it('preserves existing mcp_servers entries for other servers', () => {
    const filePath = path.join(tempDir, 'config.toml');
    fs.writeFileSync(
      filePath,
      '[mcp_servers.other]\ncommand = "other-server"\nargs = []\nenabled = true\n'
    );

    writeTomlMcpEntry(filePath, 'harness', { command: 'harness', args: ['mcp'], enabled: true });

    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('[mcp_servers.other]');
    expect(content).toContain('command = "other-server"');
    expect(content).toContain('[mcp_servers.harness]');
  });

  it('uses atomic write (no partial file on interrupt)', () => {
    const filePath = path.join(tempDir, 'config.toml');
    writeTomlMcpEntry(filePath, 'harness', { command: 'harness', args: ['mcp'], enabled: true });
    // Verify no .tmp file remains
    expect(fs.existsSync(filePath + '.tmp')).toBe(false);
  });
});
