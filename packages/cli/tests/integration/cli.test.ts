// packages/cli/tests/integration/cli.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const CLI_PATH = path.join(__dirname, '../../dist/bin/harness.js');

function runCLI(args: string[], cwd?: string) {
  return spawnSync('node', [CLI_PATH, ...args], {
    cwd,
    encoding: 'utf-8',
  });
}

describe('CLI Integration', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-cli-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Windows may hold file locks briefly after process exit
    }
  });

  describe('harness --version', () => {
    it('outputs version', () => {
      const result = runCLI(['--version']);
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    });
  });

  describe('harness --help', () => {
    it('outputs help', () => {
      const result = runCLI(['--help']);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('harness');
      expect(result.stdout).toContain('validate');
    });
  });

  describe('harness init', () => {
    it('creates config files', () => {
      const result = runCLI(['init', '--name', 'test-project'], tempDir);
      expect(result.status).toBe(0);
      expect(fs.existsSync(path.join(tempDir, 'harness.config.json'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'AGENTS.md'))).toBe(true);
    });
  });

  describe('harness validate', () => {
    it('validates initialized project', { timeout: 15000 }, () => {
      // Initialize first
      runCLI(['init', '--name', 'test'], tempDir);

      // Then validate
      const result = runCLI(['validate'], tempDir);
      expect(result.status).toBe(0);
    });

    it('outputs JSON when --json flag used', () => {
      runCLI(['init', '--name', 'test'], tempDir);
      const result = runCLI(['validate', '--json'], tempDir);
      expect(result.status).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output).toHaveProperty('valid');
    });
  });

  describe('harness add', () => {
    it('adds layer to project', () => {
      runCLI(['init', '--name', 'test'], tempDir);
      fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });

      const result = runCLI(['add', 'layer', 'services'], tempDir);
      expect(result.status).toBe(0);
      expect(fs.existsSync(path.join(tempDir, 'src/services/index.ts'))).toBe(true);
    });
  });
});
