# Plan: `harness setup` Command (Phase 2)

**Date:** 2026-03-28
**Spec:** docs/changes/onboarding-funnel/proposal.md
**Estimated tasks:** 3
**Estimated time:** 12 minutes

## Goal

Add a `harness setup` command that chains environment configuration (Node check, global slash commands, MCP for detected AI clients) and writes the setup-complete marker on success.

## Observable Truths (Acceptance Criteria)

1. When `harness setup` is run with Node >= 22, the command prints a checkmark line for the Node version.
2. When `harness setup` is run, it calls `generateSlashCommands` with `{ global: true, platforms: ['claude-code', 'gemini-cli'], yes: true }` and prints a checkmark line for slash command generation.
3. When `harness setup` is run and `~/.claude/` exists, it calls `setupMcp(cwd, 'claude')` and prints a checkmark line for Claude Code MCP configuration.
4. When `harness setup` is run and `~/.gemini/` does not exist, it prints a warning line for Gemini CLI and does not call `setupMcp` for gemini.
5. When all required steps pass, `harness setup` calls `markSetupComplete()` and exits with code 0.
6. When the Node version check fails (< 22), `harness setup` prints a failure line and exits with code 1 without running subsequent steps.
7. When `harness setup` is run, the command is registered in `index.ts` and accessible via `harness setup`.
8. The command is idempotent -- running it twice produces the same output without errors.
9. `npx vitest run tests/commands/setup.test.ts` passes with tests covering: Node check pass/fail, slash command generation, MCP client detection (present/absent), marker write, exit codes.

## File Map

- CREATE `packages/cli/src/commands/setup.ts`
- MODIFY `packages/cli/src/index.ts` (add import and register command)
- CREATE `packages/cli/tests/commands/setup.test.ts`

## Tasks

### Task 1: Create `setup.ts` command implementation

**Depends on:** none (Phase 1 `first-run.ts` already exists)
**Files:** `packages/cli/src/commands/setup.ts`

1. Create `packages/cli/src/commands/setup.ts` with the following implementation:

```typescript
import { Command } from 'commander';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import chalk from 'chalk';
import semver from 'semver';
import { generateSlashCommands } from './generate-slash-commands';
import { setupMcp } from './setup-mcp';
import { markSetupComplete } from '../utils/first-run';
import { ExitCode } from '../utils/errors';

const REQUIRED_NODE_VERSION = '>=22.0.0';

interface StepResult {
  status: 'pass' | 'warn' | 'fail';
  message: string;
}

function checkNodeVersion(): StepResult {
  const version = process.version;
  if (semver.satisfies(version, REQUIRED_NODE_VERSION)) {
    return { status: 'pass', message: `Node.js ${version} (requires >=22)` };
  }
  return { status: 'fail', message: `Node.js ${version} — requires >=22` };
}

function runSlashCommandGeneration(): StepResult {
  try {
    const results = generateSlashCommands({
      global: true,
      platforms: ['claude-code', 'gemini-cli'],
      yes: true,
      includeGlobal: false,
      skillsDir: '',
      dryRun: false,
    });
    const outputDirs = results.map((r) => r.outputDir).join(', ');
    return { status: 'pass', message: `Generated global slash commands -> ${outputDirs}` };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { status: 'fail', message: `Slash command generation failed — ${msg}` };
  }
}

function detectClient(name: string, dirName: string): boolean {
  return fs.existsSync(path.join(os.homedir(), dirName));
}

function runMcpSetup(cwd: string): StepResult[] {
  const results: StepResult[] = [];

  const clients: Array<{ name: string; dir: string; client: string; configTarget: string }> = [
    { name: 'Claude Code', dir: '.claude', client: 'claude', configTarget: '.mcp.json' },
    { name: 'Gemini CLI', dir: '.gemini', client: 'gemini', configTarget: '.gemini/settings.json' },
  ];

  for (const { name, dir, client, configTarget } of clients) {
    if (!detectClient(name, dir)) {
      results.push({ status: 'warn', message: `${name} not detected — skipped MCP configuration` });
      continue;
    }
    try {
      setupMcp(cwd, client);
      results.push({ status: 'pass', message: `Configured MCP for ${name} -> ${configTarget}` });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      results.push({ status: 'fail', message: `MCP configuration failed for ${name} — ${msg}` });
    }
  }

  return results;
}

function formatStep(result: StepResult): string {
  const icon =
    result.status === 'pass'
      ? chalk.green('✓')
      : result.status === 'warn'
        ? chalk.yellow('⚠')
        : chalk.red('✗');
  return `  ${icon} ${result.message}`;
}

export function runSetup(cwd: string): { steps: StepResult[]; success: boolean } {
  const steps: StepResult[] = [];

  // Step 1: Node version check
  const nodeResult = checkNodeVersion();
  steps.push(nodeResult);
  if (nodeResult.status === 'fail') {
    return { steps, success: false };
  }

  // Step 2: Generate global slash commands
  const slashResult = runSlashCommandGeneration();
  steps.push(slashResult);

  // Step 3: MCP setup for detected clients
  const mcpResults = runMcpSetup(cwd);
  steps.push(...mcpResults);

  // Determine success: no 'fail' status in any step
  const success = steps.every((s) => s.status !== 'fail');

  if (success) {
    markSetupComplete();
  }

  return { steps, success };
}

export function createSetupCommand(): Command {
  return new Command('setup')
    .description('Configure harness environment: slash commands, MCP, and more')
    .action(() => {
      const cwd = process.cwd();

      console.log('');
      console.log(`  ${chalk.bold('harness setup')}`);
      console.log('');

      const { steps, success } = runSetup(cwd);

      for (const step of steps) {
        console.log(formatStep(step));
      }

      console.log('');

      if (success) {
        console.log('  Setup complete. Next steps:');
        console.log('    - Open a project directory and run /harness:initialize-project');
        console.log('    - Or run harness init --name my-project to scaffold a new one');
        console.log('    - Run harness doctor anytime to check your environment');
        console.log('');
      }

      process.exit(success ? ExitCode.SUCCESS : ExitCode.VALIDATION_FAILED);
    });
}
```

2. Verify the file compiles:
   ```
   npx tsc --noEmit src/commands/setup.ts
   ```
3. Run: `harness validate`
4. Commit: `feat(setup): add harness setup command implementation`

---

### Task 2: Register `setup` command in `index.ts`

**Depends on:** Task 1
**Files:** `packages/cli/src/index.ts`

1. Add import at line 31 (after the `setup-mcp` import):

   ```typescript
   import { createSetupCommand } from './commands/setup';
   ```

2. Add command registration after line 88 (after `createSetupMcpCommand()`):

   ```typescript
   program.addCommand(createSetupCommand());
   ```

3. Verify compilation:
   ```
   npx tsc --noEmit
   ```
4. Run: `harness validate`
5. Commit: `feat(setup): register setup command in CLI index`

---

### Task 3: Add tests for `harness setup`

**Depends on:** Task 1
**Files:** `packages/cli/tests/commands/setup.test.ts`

1. Create `packages/cli/tests/commands/setup.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Mock dependencies before importing the module under test
vi.mock('../../src/commands/generate-slash-commands', () => ({
  generateSlashCommands: vi.fn(() => [
    {
      platform: 'claude-code',
      added: [],
      updated: [],
      removed: [],
      unchanged: ['foo.md'],
      outputDir: '/home/.claude/commands/harness',
    },
    {
      platform: 'gemini-cli',
      added: [],
      updated: [],
      removed: [],
      unchanged: [],
      outputDir: '/home/.gemini/commands/harness',
    },
  ]),
}));

vi.mock('../../src/commands/setup-mcp', () => ({
  setupMcp: vi.fn(() => ({ configured: ['Claude Code'], skipped: [], trustedFolder: false })),
}));

vi.mock('../../src/utils/first-run', () => ({
  markSetupComplete: vi.fn(),
}));

import { runSetup } from '../../src/commands/setup';
import { generateSlashCommands } from '../../src/commands/generate-slash-commands';
import { setupMcp } from '../../src/commands/setup-mcp';
import { markSetupComplete } from '../../src/utils/first-run';

describe('runSetup', () => {
  let existsSyncSpy: ReturnType<typeof vi.spyOn>;
  const originalVersion = process.version;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: both ~/.claude/ and ~/.gemini/ exist
    existsSyncSpy = vi.spyOn(fs, 'existsSync').mockImplementation((p: fs.PathLike) => {
      const s = String(p);
      if (s === path.join(os.homedir(), '.claude')) return true;
      if (s === path.join(os.homedir(), '.gemini')) return true;
      return false;
    });
  });

  afterEach(() => {
    existsSyncSpy.mockRestore();
    Object.defineProperty(process, 'version', { value: originalVersion, writable: true });
  });

  it('passes all steps when Node >= 22 and both clients detected', () => {
    Object.defineProperty(process, 'version', { value: 'v22.4.0', writable: true });

    const { steps, success } = runSetup('/tmp/test');

    expect(success).toBe(true);
    expect(steps).toHaveLength(4); // node + slash + claude mcp + gemini mcp
    expect(steps[0].status).toBe('pass');
    expect(steps[0].message).toContain('Node.js');
    expect(steps[1].status).toBe('pass');
    expect(steps[1].message).toContain('slash commands');
    expect(generateSlashCommands).toHaveBeenCalledWith(
      expect.objectContaining({ global: true, platforms: ['claude-code', 'gemini-cli'], yes: true })
    );
    expect(setupMcp).toHaveBeenCalledTimes(2);
    expect(markSetupComplete).toHaveBeenCalled();
  });

  it('fails immediately when Node < 22', () => {
    Object.defineProperty(process, 'version', { value: 'v20.11.0', writable: true });

    const { steps, success } = runSetup('/tmp/test');

    expect(success).toBe(false);
    expect(steps).toHaveLength(1); // only node check
    expect(steps[0].status).toBe('fail');
    expect(steps[0].message).toContain('requires >=22');
    expect(generateSlashCommands).not.toHaveBeenCalled();
    expect(markSetupComplete).not.toHaveBeenCalled();
  });

  it('warns when a client directory is not detected', () => {
    Object.defineProperty(process, 'version', { value: 'v22.4.0', writable: true });
    existsSyncSpy.mockImplementation((p: fs.PathLike) => {
      const s = String(p);
      if (s === path.join(os.homedir(), '.claude')) return true;
      if (s === path.join(os.homedir(), '.gemini')) return false;
      return false;
    });

    const { steps, success } = runSetup('/tmp/test');

    expect(success).toBe(true);
    expect(steps).toHaveLength(4); // node + slash + claude mcp + gemini warn
    const geminiStep = steps[3];
    expect(geminiStep.status).toBe('warn');
    expect(geminiStep.message).toContain('Gemini CLI not detected');
    expect(setupMcp).toHaveBeenCalledTimes(1);
    expect(setupMcp).toHaveBeenCalledWith('/tmp/test', 'claude');
    expect(markSetupComplete).toHaveBeenCalled();
  });

  it('warns when no clients are detected', () => {
    Object.defineProperty(process, 'version', { value: 'v22.4.0', writable: true });
    existsSyncSpy.mockReturnValue(false);

    const { steps, success } = runSetup('/tmp/test');

    expect(success).toBe(true);
    expect(setupMcp).not.toHaveBeenCalled();
    // Both MCP steps should be warnings
    const mcpSteps = steps.filter((s) => s.message.includes('not detected'));
    expect(mcpSteps).toHaveLength(2);
    expect(markSetupComplete).toHaveBeenCalled();
  });

  it('does not call markSetupComplete when slash generation fails', () => {
    Object.defineProperty(process, 'version', { value: 'v22.4.0', writable: true });
    (generateSlashCommands as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('skills dir missing');
    });

    const { steps, success } = runSetup('/tmp/test');

    expect(success).toBe(false);
    expect(steps[1].status).toBe('fail');
    expect(steps[1].message).toContain('skills dir missing');
    expect(markSetupComplete).not.toHaveBeenCalled();
  });

  it('is idempotent — produces same results on second run', () => {
    Object.defineProperty(process, 'version', { value: 'v22.4.0', writable: true });

    const first = runSetup('/tmp/test');
    vi.clearAllMocks();
    // Re-mock existsSync since clearAllMocks clears it
    existsSyncSpy = vi.spyOn(fs, 'existsSync').mockImplementation((p: fs.PathLike) => {
      const s = String(p);
      if (s === path.join(os.homedir(), '.claude')) return true;
      if (s === path.join(os.homedir(), '.gemini')) return true;
      return false;
    });
    const second = runSetup('/tmp/test');

    expect(first.success).toBe(second.success);
    expect(first.steps.length).toBe(second.steps.length);
  });
});
```

2. Run tests:
   ```
   npx vitest run tests/commands/setup.test.ts
   ```
3. Observe: all 6 tests pass.
4. Run: `harness validate`
5. Commit: `test(setup): add unit tests for harness setup command`
