# Plan: Phase 3 -- `harness hooks` CLI Command

**Date:** 2026-03-30
**Spec:** docs/changes/runtime-enforcement-extensions/proposal.md
**Estimated tasks:** 7
**Estimated time:** 30 minutes

## Goal

Users can run `harness hooks init`, `harness hooks list`, and `harness hooks remove` to install, inspect, and remove Claude Code hook configurations in their project.

## Observable Truths (Acceptance Criteria)

1. When `harness hooks init` is run in a project directory, the system shall copy all 5 hook scripts to `.harness/hooks/`, create `.harness/hooks/profile.json` with `{"profile":"standard"}`, and merge hook entries into `.claude/settings.json`.
2. When `harness hooks init --profile minimal` is run, the system shall write `{"profile":"minimal"}` to `.harness/hooks/profile.json` and only include `block-no-verify` entries in `.claude/settings.json`.
3. When `harness hooks init --profile strict` is run, the system shall write `{"profile":"strict"}` to `.harness/hooks/profile.json` and include all 5 hook entries in `.claude/settings.json`.
4. When `harness hooks init` is run twice, the result shall be identical to running it once (idempotent -- no duplicate entries in `settings.json`, scripts overwritten cleanly).
5. When `harness hooks init` is run on a project that already has non-hook entries in `.claude/settings.json`, those entries shall be preserved.
6. When `harness hooks list` is run after `init`, the system shall print the active profile and each installed hook with its event, matcher, and script path.
7. When `harness hooks list` is run with no hooks installed, the system shall print a message indicating no hooks are installed.
8. When `harness hooks remove` is run after `init`, the system shall delete `.harness/hooks/` directory and remove all harness-managed hook entries from `.claude/settings.json`, preserving non-harness entries.
9. When `harness hooks remove` is run with no hooks installed, the system shall print a message indicating nothing to remove and exit 0.
10. The `createHooksCommand()` function shall register the `hooks` command with `init`, `list`, and `remove` subcommands on the main CLI program.
11. `npx vitest run packages/cli/tests/commands/hooks.test.ts` passes.
12. `npx vitest run packages/cli/tests/hooks/hooks-cli-integration.test.ts` passes with a full init-list-remove cycle.

## File Map

- CREATE `packages/cli/src/commands/hooks/index.ts`
- CREATE `packages/cli/src/commands/hooks/init.ts`
- CREATE `packages/cli/src/commands/hooks/list.ts`
- CREATE `packages/cli/src/commands/hooks/remove.ts`
- MODIFY `packages/cli/src/index.ts` (add import and `program.addCommand(createHooksCommand())`)
- CREATE `packages/cli/tests/commands/hooks.test.ts`
- CREATE `packages/cli/tests/hooks/hooks-cli-integration.test.ts`

## Tasks

### Task 1: Create `packages/cli/src/commands/hooks/index.ts`

**Depends on:** none (Phase 2 must be complete -- hook scripts and profiles.ts must exist)
**Files:** `packages/cli/src/commands/hooks/index.ts`

1. Create `packages/cli/src/commands/hooks/index.ts`:

```typescript
import { Command } from 'commander';
import { createInitCommand } from './init';
import { createListCommand } from './list';
import { createRemoveCommand } from './remove';

export function createHooksCommand(): Command {
  const command = new Command('hooks').description('Manage Claude Code hook configurations');

  command.addCommand(createInitCommand());
  command.addCommand(createListCommand());
  command.addCommand(createRemoveCommand());

  return command;
}
```

2. Run: `cd packages/cli && npx tsc --noEmit 2>&1 | head -5` -- expect error (init/list/remove don't exist yet, that's OK -- this task creates the shell)
3. Commit: `feat(hooks): add hooks command group shell`

---

### Task 2: Create `init` subcommand

**Depends on:** Task 1
**Files:** `packages/cli/src/commands/hooks/init.ts`

1. Create `packages/cli/src/commands/hooks/init.ts`:

```typescript
import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOOK_SCRIPTS, PROFILES, type HookProfile } from '../../hooks/profiles';
import { logger } from '../../output/logger';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VALID_PROFILES: HookProfile[] = ['minimal', 'standard', 'strict'];

/**
 * Resolve the source directory containing hook .js scripts.
 * Works from both src/ (dev/vitest) and dist/ (compiled).
 */
function resolveHookSourceDir(): string {
  // Walk up from this file to find the hooks/ directory containing .js files
  // In src: ../../hooks/ (from commands/hooks/)
  // In dist: ../../hooks/ (same relative path after build)
  const candidate = path.resolve(__dirname, '..', '..', 'hooks');
  if (fs.existsSync(candidate)) {
    return candidate;
  }
  // Fallback: from cwd (should not happen in practice)
  return path.join(process.cwd(), 'packages', 'cli', 'src', 'hooks');
}

/**
 * Build the hooks object for .claude/settings.json based on profile.
 */
export function buildSettingsHooks(
  profile: HookProfile
): Record<string, Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>> {
  const activeHookNames = PROFILES[profile];
  const activeScripts = HOOK_SCRIPTS.filter((h) => activeHookNames.includes(h.name));

  const hooks: Record<
    string,
    Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>
  > = {};

  for (const script of activeScripts) {
    if (!hooks[script.event]) {
      hooks[script.event] = [];
    }
    hooks[script.event].push({
      matcher: script.matcher,
      hooks: [{ type: 'command', command: `node .harness/hooks/${script.name}.js` }],
    });
  }

  return hooks;
}

/**
 * Merge harness hook entries into existing settings.json content.
 * Preserves non-hooks keys. Replaces the hooks key entirely (harness owns it).
 */
export function mergeSettings(
  existing: Record<string, unknown>,
  hooksConfig: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...existing,
    hooks: hooksConfig,
  };
}

/**
 * Core init logic, extracted for testing.
 */
export function initHooks(options: { profile: HookProfile; projectDir: string }): {
  copiedScripts: string[];
  settingsPath: string;
  profilePath: string;
} {
  const { profile, projectDir } = options;

  // 1. Copy all hook scripts to .harness/hooks/
  const hooksDestDir = path.join(projectDir, '.harness', 'hooks');
  fs.mkdirSync(hooksDestDir, { recursive: true });

  const sourceDir = resolveHookSourceDir();
  const copiedScripts: string[] = [];

  for (const script of HOOK_SCRIPTS) {
    const srcFile = path.join(sourceDir, `${script.name}.js`);
    const destFile = path.join(hooksDestDir, `${script.name}.js`);
    if (fs.existsSync(srcFile)) {
      fs.copyFileSync(srcFile, destFile);
      copiedScripts.push(script.name);
    }
  }

  // 2. Write profile.json
  const profilePath = path.join(hooksDestDir, 'profile.json');
  fs.writeFileSync(profilePath, JSON.stringify({ profile }, null, 2) + '\n');

  // 3. Read or create .claude/settings.json and merge hooks
  const claudeDir = path.join(projectDir, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });

  const settingsPath = path.join(claudeDir, 'settings.json');
  let existing: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch {
      // Malformed settings.json -- start fresh but warn
      existing = {};
    }
  }

  const hooksConfig = buildSettingsHooks(profile);
  const merged = mergeSettings(existing, hooksConfig);
  fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2) + '\n');

  return { copiedScripts, settingsPath, profilePath };
}

export function createInitCommand(): Command {
  return new Command('init')
    .description('Install Claude Code hook configurations into the current project')
    .option('--profile <profile>', 'Hook profile: minimal, standard, or strict', 'standard')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const profile = opts.profile as HookProfile;

      if (!VALID_PROFILES.includes(profile)) {
        logger.error(`Invalid profile: ${profile}. Must be one of: ${VALID_PROFILES.join(', ')}`);
        process.exit(2);
      }

      const projectDir = process.cwd();

      try {
        const result = initHooks({ profile, projectDir });

        if (globalOpts.json) {
          console.log(
            JSON.stringify({
              profile,
              copiedScripts: result.copiedScripts,
              settingsPath: result.settingsPath,
              profilePath: result.profilePath,
            })
          );
        } else {
          logger.success(
            `Installed ${result.copiedScripts.length} hook scripts to .harness/hooks/`
          );
          logger.info(`Profile: ${profile}`);
          logger.info(`Settings: ${path.relative(projectDir, result.settingsPath)}`);
          logger.dim("Run 'harness hooks list' to see installed hooks");
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`Failed to initialize hooks: ${message}`);
        process.exit(2);
      }
    });
}
```

2. Run: `cd packages/cli && npx tsc --noEmit 2>&1 | head -10` -- verify no type errors in this file
3. Commit: `feat(hooks): implement init subcommand with settings.json merge`

---

### Task 3: Create `list` subcommand

**Depends on:** Task 1
**Files:** `packages/cli/src/commands/hooks/list.ts`

1. Create `packages/cli/src/commands/hooks/list.ts`:

```typescript
import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { HOOK_SCRIPTS, PROFILES, type HookProfile } from '../../hooks/profiles';
import { logger } from '../../output/logger';

export interface ListResult {
  installed: boolean;
  profile: HookProfile | null;
  hooks: Array<{ name: string; event: string; matcher: string; scriptPath: string }>;
}

/**
 * Core list logic, extracted for testing.
 */
export function listHooks(projectDir: string): ListResult {
  const hooksDir = path.join(projectDir, '.harness', 'hooks');
  const profilePath = path.join(hooksDir, 'profile.json');

  if (!fs.existsSync(profilePath)) {
    return { installed: false, profile: null, hooks: [] };
  }

  let profile: HookProfile = 'standard';
  try {
    const data = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
    if (data.profile && ['minimal', 'standard', 'strict'].includes(data.profile)) {
      profile = data.profile;
    }
  } catch {
    // Malformed profile.json -- assume standard
  }

  const activeNames = PROFILES[profile];
  const hooks = HOOK_SCRIPTS.filter((h) => activeNames.includes(h.name)).map((h) => ({
    name: h.name,
    event: h.event,
    matcher: h.matcher,
    scriptPath: path.join('.harness', 'hooks', `${h.name}.js`),
  }));

  return { installed: true, profile, hooks };
}

export function createListCommand(): Command {
  return new Command('list')
    .description('Show installed hooks and active profile')
    .action(async (_opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const projectDir = process.cwd();
      const result = listHooks(projectDir);

      if (globalOpts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      if (!result.installed) {
        logger.info("No harness hooks installed. Run 'harness hooks init' to set up hooks.");
        return;
      }

      logger.info(`Profile: ${result.profile}`);
      logger.info(`Hooks (${result.hooks.length}):`);
      for (const hook of result.hooks) {
        console.log(`  ${hook.name}  ${hook.event}:${hook.matcher}  ${hook.scriptPath}`);
      }
    });
}
```

2. Run: `cd packages/cli && npx tsc --noEmit 2>&1 | head -10`
3. Commit: `feat(hooks): implement list subcommand`

---

### Task 4: Create `remove` subcommand

**Depends on:** Task 1
**Files:** `packages/cli/src/commands/hooks/remove.ts`

1. Create `packages/cli/src/commands/hooks/remove.ts`:

```typescript
import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { logger } from '../../output/logger';

export interface RemoveResult {
  removed: boolean;
  hooksDir: string;
  settingsCleaned: boolean;
}

/**
 * Core remove logic, extracted for testing.
 */
export function removeHooks(projectDir: string): RemoveResult {
  const hooksDir = path.join(projectDir, '.harness', 'hooks');
  const settingsPath = path.join(projectDir, '.claude', 'settings.json');
  let removed = false;
  let settingsCleaned = false;

  // 1. Remove .harness/hooks/ directory
  if (fs.existsSync(hooksDir)) {
    fs.rmSync(hooksDir, { recursive: true, force: true });
    removed = true;
  }

  // 2. Clean hooks entries from .claude/settings.json
  if (fs.existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      if (settings.hooks !== undefined) {
        delete settings.hooks;
        settingsCleaned = true;

        // If settings is now empty (only had hooks), remove the file
        if (Object.keys(settings).length === 0) {
          fs.unlinkSync(settingsPath);
        } else {
          fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
        }
      }
    } catch {
      // Malformed settings.json -- leave it alone
    }
  }

  return { removed, hooksDir, settingsCleaned };
}

export function createRemoveCommand(): Command {
  return new Command('remove')
    .description('Remove harness-managed hooks from the current project')
    .action(async (_opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const projectDir = process.cwd();
      const result = removeHooks(projectDir);

      if (globalOpts.json) {
        console.log(JSON.stringify(result));
        return;
      }

      if (!result.removed && !result.settingsCleaned) {
        logger.info('No harness hooks found to remove.');
        return;
      }

      if (result.removed) {
        logger.success('Removed .harness/hooks/ directory');
      }
      if (result.settingsCleaned) {
        logger.success('Cleaned hook entries from .claude/settings.json');
      }
    });
}
```

2. Run: `cd packages/cli && npx tsc --noEmit 2>&1 | head -10`
3. Commit: `feat(hooks): implement remove subcommand`

---

### Task 5: Register `hooks` command in main CLI

**Depends on:** Tasks 1-4
**Files:** `packages/cli/src/index.ts`

1. Add import to `packages/cli/src/index.ts` after the existing `createCICommand` import (line 34):

```typescript
import { createHooksCommand } from './commands/hooks';
```

2. Add command registration after the `createCICommand()` line (after line 96):

```typescript
program.addCommand(createHooksCommand());
```

3. Run: `cd packages/cli && npx tsc --noEmit 2>&1 | head -10` -- expect no errors
4. Run: `cd packages/cli && npx vitest run tests/commands/state.test.ts` -- verify existing tests still pass (sanity check)
5. Commit: `feat(hooks): register hooks command in main CLI program`

---

### Task 6: Unit tests for hooks command

**Depends on:** Tasks 1-5
**Files:** `packages/cli/tests/commands/hooks.test.ts`

1. Create `packages/cli/tests/commands/hooks.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createHooksCommand } from '../../src/commands/hooks/index';
import { initHooks, buildSettingsHooks, mergeSettings } from '../../src/commands/hooks/init';
import { listHooks } from '../../src/commands/hooks/list';
import { removeHooks } from '../../src/commands/hooks/remove';

describe('createHooksCommand', () => {
  it('creates hooks command with init, list, remove subcommands', () => {
    const cmd = createHooksCommand();
    expect(cmd.name()).toBe('hooks');
    const subcommands = cmd.commands.map((c) => c.name());
    expect(subcommands).toContain('init');
    expect(subcommands).toContain('list');
    expect(subcommands).toContain('remove');
  });
});

describe('buildSettingsHooks', () => {
  it('builds minimal profile with only block-no-verify', () => {
    const hooks = buildSettingsHooks('minimal');
    expect(hooks.PreToolUse).toHaveLength(1);
    expect(hooks.PreToolUse[0].matcher).toBe('Bash');
    expect(hooks.PreToolUse[0].hooks[0].command).toContain('block-no-verify.js');
    expect(hooks.PostToolUse).toBeUndefined();
    expect(hooks.PreCompact).toBeUndefined();
    expect(hooks.Stop).toBeUndefined();
  });

  it('builds standard profile with 4 hooks across 3 events', () => {
    const hooks = buildSettingsHooks('standard');
    expect(hooks.PreToolUse).toHaveLength(2);
    expect(hooks.PostToolUse).toHaveLength(1);
    expect(hooks.PreCompact).toHaveLength(1);
    expect(hooks.Stop).toBeUndefined();
  });

  it('builds strict profile with all 5 hooks across 4 events', () => {
    const hooks = buildSettingsHooks('strict');
    expect(hooks.PreToolUse).toHaveLength(2);
    expect(hooks.PostToolUse).toHaveLength(1);
    expect(hooks.PreCompact).toHaveLength(1);
    expect(hooks.Stop).toHaveLength(1);
    expect(hooks.Stop[0].hooks[0].command).toContain('cost-tracker.js');
  });
});

describe('mergeSettings', () => {
  it('preserves existing non-hook keys', () => {
    const existing = { permissions: { allow: ['Bash'] }, customKey: 'value' };
    const result = mergeSettings(existing, { PreToolUse: [] });
    expect(result.permissions).toEqual({ allow: ['Bash'] });
    expect(result.customKey).toBe('value');
    expect(result.hooks).toEqual({ PreToolUse: [] });
  });

  it('replaces existing hooks key', () => {
    const existing = { hooks: { OldEvent: [] } };
    const result = mergeSettings(existing, { PreToolUse: [] });
    expect(result.hooks).toEqual({ PreToolUse: [] });
  });
});

describe('initHooks', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-hooks-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates .harness/hooks/ directory with profile.json', () => {
    const result = initHooks({ profile: 'standard', projectDir: tmpDir });
    const profilePath = path.join(tmpDir, '.harness', 'hooks', 'profile.json');
    expect(fs.existsSync(profilePath)).toBe(true);
    const profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
    expect(profile).toEqual({ profile: 'standard' });
    expect(result.profilePath).toBe(profilePath);
  });

  it('creates .claude/settings.json with hooks entries', () => {
    initHooks({ profile: 'minimal', projectDir: tmpDir });
    const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
    expect(fs.existsSync(settingsPath)).toBe(true);
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    expect(settings.hooks).toBeDefined();
    expect(settings.hooks.PreToolUse).toHaveLength(1);
  });

  it('preserves existing settings.json content', () => {
    const claudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, 'settings.json'),
      JSON.stringify({ permissions: { allow: ['Read'] } })
    );
    initHooks({ profile: 'minimal', projectDir: tmpDir });
    const settings = JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf-8'));
    expect(settings.permissions).toEqual({ allow: ['Read'] });
    expect(settings.hooks).toBeDefined();
  });

  it('is idempotent -- running twice produces same result', () => {
    initHooks({ profile: 'standard', projectDir: tmpDir });
    const first = fs.readFileSync(path.join(tmpDir, '.claude', 'settings.json'), 'utf-8');
    initHooks({ profile: 'standard', projectDir: tmpDir });
    const second = fs.readFileSync(path.join(tmpDir, '.claude', 'settings.json'), 'utf-8');
    expect(second).toBe(first);
  });
});

describe('listHooks', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-hooks-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns installed: false when no hooks are present', () => {
    const result = listHooks(tmpDir);
    expect(result.installed).toBe(false);
    expect(result.profile).toBeNull();
    expect(result.hooks).toHaveLength(0);
  });

  it('returns installed hooks after init', () => {
    initHooks({ profile: 'strict', projectDir: tmpDir });
    const result = listHooks(tmpDir);
    expect(result.installed).toBe(true);
    expect(result.profile).toBe('strict');
    expect(result.hooks).toHaveLength(5);
  });

  it('returns correct hook metadata', () => {
    initHooks({ profile: 'minimal', projectDir: tmpDir });
    const result = listHooks(tmpDir);
    expect(result.hooks).toHaveLength(1);
    expect(result.hooks[0].name).toBe('block-no-verify');
    expect(result.hooks[0].event).toBe('PreToolUse');
    expect(result.hooks[0].matcher).toBe('Bash');
  });
});

describe('removeHooks', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-hooks-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns removed: false when no hooks are present', () => {
    const result = removeHooks(tmpDir);
    expect(result.removed).toBe(false);
    expect(result.settingsCleaned).toBe(false);
  });

  it('removes .harness/hooks/ directory after init', () => {
    initHooks({ profile: 'standard', projectDir: tmpDir });
    expect(fs.existsSync(path.join(tmpDir, '.harness', 'hooks'))).toBe(true);
    const result = removeHooks(tmpDir);
    expect(result.removed).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.harness', 'hooks'))).toBe(false);
  });

  it('removes hooks key from settings.json preserving other keys', () => {
    // Set up settings with both hooks and other content
    const claudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, 'settings.json'),
      JSON.stringify({ permissions: { allow: ['Read'] }, hooks: { PreToolUse: [] } })
    );
    fs.mkdirSync(path.join(tmpDir, '.harness', 'hooks'), { recursive: true });

    const result = removeHooks(tmpDir);
    expect(result.settingsCleaned).toBe(true);

    const settings = JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf-8'));
    expect(settings.hooks).toBeUndefined();
    expect(settings.permissions).toEqual({ allow: ['Read'] });
  });

  it('deletes settings.json if hooks was the only key', () => {
    initHooks({ profile: 'minimal', projectDir: tmpDir });
    const result = removeHooks(tmpDir);
    expect(result.settingsCleaned).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'settings.json'))).toBe(false);
  });
});
```

2. Run: `cd packages/cli && npx vitest run tests/commands/hooks.test.ts`
3. Observe: all tests pass
4. Commit: `test(hooks): add unit tests for hooks CLI command`

---

### Task 7: Integration test -- init, list, remove cycle

**Depends on:** Task 6
**Files:** `packages/cli/tests/hooks/hooks-cli-integration.test.ts`

[checkpoint:human-verify] -- verify Tasks 1-6 output before continuing

1. Create `packages/cli/tests/hooks/hooks-cli-integration.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { initHooks } from '../../src/commands/hooks/init';
import { listHooks } from '../../src/commands/hooks/list';
import { removeHooks } from '../../src/commands/hooks/remove';

describe('hooks CLI integration: init -> list -> remove cycle', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-hooks-integration-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('full lifecycle: init -> list -> remove -> list', () => {
    // 1. Init with standard profile
    const initResult = initHooks({ profile: 'standard', projectDir: tmpDir });
    expect(initResult.copiedScripts.length).toBeGreaterThan(0);

    // 2. Verify files on disk
    expect(fs.existsSync(path.join(tmpDir, '.harness', 'hooks', 'profile.json'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'settings.json'))).toBe(true);

    // 3. Verify settings.json structure
    const settings = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.claude', 'settings.json'), 'utf-8')
    );
    expect(settings.hooks).toBeDefined();
    expect(settings.hooks.PreToolUse).toHaveLength(2); // block-no-verify + protect-config
    expect(settings.hooks.PostToolUse).toHaveLength(1); // quality-gate
    expect(settings.hooks.PreCompact).toHaveLength(1); // pre-compact-state

    // 4. List shows correct state
    const listResult = listHooks(tmpDir);
    expect(listResult.installed).toBe(true);
    expect(listResult.profile).toBe('standard');
    expect(listResult.hooks).toHaveLength(4);

    // 5. Remove cleans everything
    const removeResult = removeHooks(tmpDir);
    expect(removeResult.removed).toBe(true);
    expect(removeResult.settingsCleaned).toBe(true);

    // 6. List shows nothing
    const listAfterRemove = listHooks(tmpDir);
    expect(listAfterRemove.installed).toBe(false);
    expect(listAfterRemove.hooks).toHaveLength(0);
  });

  it('idempotency: init twice produces same result', () => {
    initHooks({ profile: 'strict', projectDir: tmpDir });
    const settingsAfterFirst = fs.readFileSync(
      path.join(tmpDir, '.claude', 'settings.json'),
      'utf-8'
    );

    initHooks({ profile: 'strict', projectDir: tmpDir });
    const settingsAfterSecond = fs.readFileSync(
      path.join(tmpDir, '.claude', 'settings.json'),
      'utf-8'
    );

    expect(settingsAfterSecond).toBe(settingsAfterFirst);
  });

  it('profile switch: init minimal then init strict upgrades', () => {
    initHooks({ profile: 'minimal', projectDir: tmpDir });
    const minList = listHooks(tmpDir);
    expect(minList.hooks).toHaveLength(1);

    initHooks({ profile: 'strict', projectDir: tmpDir });
    const strictList = listHooks(tmpDir);
    expect(strictList.profile).toBe('strict');
    expect(strictList.hooks).toHaveLength(5);

    // Verify settings.json reflects strict
    const settings = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.claude', 'settings.json'), 'utf-8')
    );
    expect(settings.hooks.Stop).toHaveLength(1);
  });

  it('preserves existing .claude/settings.json content through full cycle', () => {
    // Set up pre-existing settings
    const claudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, 'settings.json'),
      JSON.stringify({ permissions: { allow: ['Read', 'Bash'] }, mcpServers: {} }, null, 2)
    );

    // Init
    initHooks({ profile: 'standard', projectDir: tmpDir });
    let settings = JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf-8'));
    expect(settings.permissions).toEqual({ allow: ['Read', 'Bash'] });
    expect(settings.mcpServers).toEqual({});
    expect(settings.hooks).toBeDefined();

    // Remove
    removeHooks(tmpDir);
    settings = JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf-8'));
    expect(settings.permissions).toEqual({ allow: ['Read', 'Bash'] });
    expect(settings.mcpServers).toEqual({});
    expect(settings.hooks).toBeUndefined();
  });
});
```

2. Run: `cd packages/cli && npx vitest run tests/hooks/hooks-cli-integration.test.ts`
3. Observe: all tests pass
4. Run: `cd packages/cli && npx vitest run tests/commands/hooks.test.ts tests/hooks/hooks-cli-integration.test.ts` -- both pass
5. Commit: `test(hooks): add integration test for init-list-remove lifecycle`
