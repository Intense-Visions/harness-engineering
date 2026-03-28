# Plan: `harness doctor` Command

**Date:** 2026-03-28
**Spec:** docs/changes/onboarding-funnel/proposal.md (Phase 3)
**Estimated tasks:** 3
**Estimated time:** 12 minutes

## Goal

Add a read-only `harness doctor` command that validates the environment (Node version, slash commands, MCP config) and reports pass/fail with fix suggestions and `--json` support.

## Observable Truths (Acceptance Criteria)

1. When `harness doctor` is run with Node >= 22, slash commands present, and MCP configured for Claude Code, the output shows all checks passing and the process exits with code 0.
2. When `harness doctor` is run with MCP not configured for Gemini CLI, the output shows the failing check with a fix suggestion `-> Run: harness setup-mcp --client gemini` and the process exits with code 1.
3. When `harness doctor --json` is run, the output is valid JSON with `{ checks: [...], allPassed: boolean }` structure and no decorative text.
4. When `harness doctor` is run, it does not modify any files (read-only).
5. When `npx vitest run tests/commands/doctor.test.ts` is run, all tests pass.
6. The summary line reports `N/M checks passed` where N is the count of passing checks and M is total checks.

## File Map

- CREATE `packages/cli/src/commands/doctor.ts`
- CREATE `packages/cli/tests/commands/doctor.test.ts`
- MODIFY `packages/cli/src/index.ts` (add import and register command)

## Tasks

### Task 1: Create `doctor.ts` with `runDoctor()` and `createDoctorCommand()`

**Depends on:** none
**Files:** `packages/cli/src/commands/doctor.ts`

1. Create `packages/cli/src/commands/doctor.ts`:

```typescript
import { Command } from 'commander';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import chalk from 'chalk';
import semver from 'semver';
import { ExitCode } from '../utils/errors';

const REQUIRED_NODE_VERSION = '>=22.0.0';

export interface CheckResult {
  name: string;
  status: 'pass' | 'fail';
  message: string;
  fix?: string;
}

export interface DoctorResult {
  checks: CheckResult[];
  allPassed: boolean;
}

function checkNodeVersion(): CheckResult {
  const version = process.version;
  if (semver.satisfies(version, REQUIRED_NODE_VERSION)) {
    return { name: 'node', status: 'pass', message: `Node.js ${version} (requires >=22)` };
  }
  return {
    name: 'node',
    status: 'fail',
    message: `Node.js ${version} (requires >=22)`,
    fix: 'Install Node.js >= 22: https://nodejs.org/',
  };
}

function checkSlashCommands(): CheckResult[] {
  const results: CheckResult[] = [];

  const platforms: Array<{ name: string; dir: string; ext: string; client: string }> = [
    {
      name: 'Claude Code',
      dir: path.join(os.homedir(), '.claude', 'commands', 'harness'),
      ext: '.md',
      client: 'claude-code',
    },
    {
      name: 'Gemini CLI',
      dir: path.join(os.homedir(), '.gemini', 'commands', 'harness'),
      ext: '.toml',
      client: 'gemini-cli',
    },
  ];

  for (const { name, dir, ext, client } of platforms) {
    try {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith(ext));
      if (files.length > 0) {
        results.push({
          name: `slash-commands-${client}`,
          status: 'pass',
          message: `Slash commands installed -> ${dir} (${files.length} commands)`,
        });
      } else {
        results.push({
          name: `slash-commands-${client}`,
          status: 'fail',
          message: `No slash commands found for ${name}`,
          fix: 'Run: harness setup',
        });
      }
    } catch {
      results.push({
        name: `slash-commands-${client}`,
        status: 'fail',
        message: `No slash commands found for ${name}`,
        fix: 'Run: harness setup',
      });
    }
  }

  return results;
}

function readJsonSafe<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

interface McpConfig {
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
}

function checkMcpConfig(cwd: string): CheckResult[] {
  const results: CheckResult[] = [];

  // Claude Code: check cwd/.mcp.json
  const claudeConfigPath = path.join(cwd, '.mcp.json');
  const claudeConfig = readJsonSafe<McpConfig>(claudeConfigPath);
  if (claudeConfig?.mcpServers?.['harness']) {
    results.push({
      name: 'mcp-claude',
      status: 'pass',
      message: 'MCP configured for Claude Code',
    });
  } else {
    results.push({
      name: 'mcp-claude',
      status: 'fail',
      message: 'MCP not configured for Claude Code',
      fix: 'Run: harness setup-mcp --client claude',
    });
  }

  // Gemini CLI: check ~/.gemini/settings.json
  const geminiConfigPath = path.join(os.homedir(), '.gemini', 'settings.json');
  const geminiConfig = readJsonSafe<McpConfig>(geminiConfigPath);
  if (geminiConfig?.mcpServers?.['harness']) {
    results.push({
      name: 'mcp-gemini',
      status: 'pass',
      message: 'MCP configured for Gemini CLI',
    });
  } else {
    results.push({
      name: 'mcp-gemini',
      status: 'fail',
      message: 'MCP not configured for Gemini CLI',
      fix: 'Run: harness setup-mcp --client gemini',
    });
  }

  return results;
}

export function runDoctor(cwd: string): DoctorResult {
  const checks: CheckResult[] = [];

  checks.push(checkNodeVersion());
  checks.push(...checkSlashCommands());
  checks.push(...checkMcpConfig(cwd));

  const allPassed = checks.every((c) => c.status === 'pass');

  return { checks, allPassed };
}

function formatCheck(check: CheckResult): string {
  const icon = check.status === 'pass' ? chalk.green('\u2713') : chalk.red('\u2717');
  let line = `  ${icon} ${check.message}`;
  if (check.status === 'fail' && check.fix) {
    line += `\n    -> ${check.fix}`;
  }
  return line;
}

export function createDoctorCommand(): Command {
  return new Command('doctor')
    .description('Check environment health: Node version, slash commands, MCP configuration')
    .option('--json', 'Output results as JSON')
    .action((opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const cwd = process.cwd();
      const useJson = opts.json || globalOpts.json;

      const result = runDoctor(cwd);

      if (useJson) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log('');
        console.log(`  ${chalk.bold('harness doctor')}`);
        console.log('');

        for (const check of result.checks) {
          console.log(formatCheck(check));
        }

        console.log('');
        const passed = result.checks.filter((c) => c.status === 'pass').length;
        const total = result.checks.length;
        console.log(`  ${passed}/${total} checks passed`);
        console.log('');
      }

      process.exit(result.allPassed ? ExitCode.SUCCESS : ExitCode.VALIDATION_FAILED);
    });
}
```

2. Run: `npx tsc --noEmit` (type-check only)
3. Run: `harness validate`
4. Commit: `feat(doctor): add harness doctor command with environment checks`

### Task 2: Register doctor command in `index.ts`

**Depends on:** Task 1
**Files:** `packages/cli/src/index.ts`

1. Add import at the top of `packages/cli/src/index.ts`, after the `createSetupCommand` import:

```typescript
import { createDoctorCommand } from './commands/doctor';
```

2. Add registration in `createProgram()`, after `program.addCommand(createSetupCommand())`:

```typescript
program.addCommand(createDoctorCommand());
```

3. Run: `npx tsc --noEmit`
4. Run: `harness validate`
5. Commit: `feat(doctor): register doctor command in CLI program`

### Task 3: Add unit tests for doctor command

**Depends on:** Task 1
**Files:** `packages/cli/tests/commands/doctor.test.ts`

1. Create `packages/cli/tests/commands/doctor.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';

// Mock fs before importing doctor
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readdirSync: vi.fn(() => []),
    readFileSync: vi.fn(() => '{}'),
  };
});

import * as fs from 'fs';
import { runDoctor } from '../../src/commands/doctor';

const mockExistsSync = vi.mocked(fs.existsSync);
const mockReaddirSync = vi.mocked(fs.readdirSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);

function mockAllHealthy(cwd: string) {
  mockExistsSync.mockImplementation((p: fs.PathLike) => {
    const s = String(p);
    // MCP config files exist
    if (s === path.join(cwd, '.mcp.json')) return true;
    if (s === path.join(os.homedir(), '.gemini', 'settings.json')) return true;
    return false;
  });

  mockReaddirSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
    const s = String(p);
    const claudeDir = path.join(os.homedir(), '.claude', 'commands', 'harness');
    const geminiDir = path.join(os.homedir(), '.gemini', 'commands', 'harness');
    if (s === claudeDir) return ['init.md', 'validate.md'] as unknown as fs.Dirent[];
    if (s === geminiDir) return ['init.toml'] as unknown as fs.Dirent[];
    return [] as unknown as fs.Dirent[];
  });

  mockReadFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
    const s = String(p);
    if (s === path.join(cwd, '.mcp.json')) {
      return JSON.stringify({ mcpServers: { harness: { command: 'harness-mcp' } } });
    }
    if (s === path.join(os.homedir(), '.gemini', 'settings.json')) {
      return JSON.stringify({ mcpServers: { harness: { command: 'harness-mcp' } } });
    }
    return '{}';
  });
}

describe('runDoctor', () => {
  const originalVersion = process.version;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(process, 'version', { value: 'v22.4.0', writable: true });
  });

  afterEach(() => {
    Object.defineProperty(process, 'version', { value: originalVersion, writable: true });
  });

  it('returns allPassed true when all checks pass', () => {
    mockAllHealthy('/tmp/project');

    const result = runDoctor('/tmp/project');

    expect(result.allPassed).toBe(true);
    expect(result.checks.every((c) => c.status === 'pass')).toBe(true);
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

  it('passes MCP check when harness entry exists in .mcp.json', () => {
    mockAllHealthy('/tmp/project');

    const result = runDoctor('/tmp/project');
    const mcpClaude = result.checks.find((c) => c.name === 'mcp-claude');

    expect(mcpClaude!.status).toBe('pass');
    expect(mcpClaude!.message).toContain('Claude Code');
  });

  it('fails MCP check with fix suggestion when not configured', () => {
    // Default mocks: existsSync returns false, so no MCP config found
    mockReaddirSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const result = runDoctor('/tmp/project');
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

    // node + 2 slash command platforms + 2 MCP platforms = 5 checks
    expect(result.checks).toHaveLength(5);
  });

  it('is read-only — does not call writeFileSync or mkdirSync', () => {
    const writeFileSpy = vi.spyOn(fs, 'writeFileSync');
    const mkdirSpy = vi.spyOn(fs, 'mkdirSync');
    mockAllHealthy('/tmp/project');

    runDoctor('/tmp/project');

    expect(writeFileSpy).not.toHaveBeenCalled();
    expect(mkdirSpy).not.toHaveBeenCalled();
  });

  it('returns allPassed false when any check fails', () => {
    // Only node passes, everything else fails (default mocks)
    mockReaddirSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const result = runDoctor('/tmp/project');

    expect(result.allPassed).toBe(false);
    const failCount = result.checks.filter((c) => c.status === 'fail').length;
    expect(failCount).toBeGreaterThan(0);
  });
});
```

2. Run test: `npx vitest run tests/commands/doctor.test.ts`
3. Observe: all tests pass
4. Run: `harness validate`
5. Commit: `test(doctor): add unit tests for harness doctor command`
