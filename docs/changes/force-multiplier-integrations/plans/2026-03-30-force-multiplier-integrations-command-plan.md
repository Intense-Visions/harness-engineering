# Plan: Force-Multiplier Integrations Command (Phase 2)

**Date:** 2026-03-30
**Spec:** docs/changes/force-multiplier-integrations/proposal.md
**Phase:** 2 of 6 (harness integrations command)
**Estimated tasks:** 8
**Estimated time:** 30 minutes

## Goal

Implement the `harness integrations` command group with `add`, `list`, `remove`, and `dismiss` subcommands that manage MCP integration enablement via `.mcp.json` and `harness.config.json`.

## Observable Truths (Acceptance Criteria)

1. When `harness integrations list` runs, the system shall display all 5 integrations from the registry grouped by tier, with status indicators (configured / available / dismissed) and env var status for Tier 1 entries.
2. When `harness integrations add perplexity` runs, the system shall write the MCP entry to `.mcp.json`, add `perplexity` to the `enabled` array in `harness.config.json`, remove it from `dismissed` if present, and print an env var hint if `PERPLEXITY_API_KEY` is not set.
3. When `harness integrations add context7` runs (a Tier 0 integration), the system shall print a message directing the user to `harness setup` and shall not modify `.mcp.json`.
4. When `harness integrations add nonexistent` runs, the system shall exit with an error: "Integration 'nonexistent' not found in registry."
5. When `harness integrations remove perplexity` runs, the system shall remove the MCP entry from `.mcp.json` and remove `perplexity` from the `enabled` array in `harness.config.json`.
6. When `harness integrations dismiss augment-code` runs, the system shall add `augment-code` to the `dismissed` array in `harness.config.json`.
7. If `.mcp.json` contains other entries, then the system shall not remove or modify those entries during add or remove operations.
8. `npx vitest run packages/cli/tests/integrations/config.test.ts` passes.
9. `npx vitest run packages/cli/tests/commands/integrations.test.ts` passes.
10. `harness validate` passes after all changes.

## File Map

```
CREATE packages/cli/src/integrations/config.ts
CREATE packages/cli/tests/integrations/config.test.ts
CREATE packages/cli/src/commands/integrations/index.ts
CREATE packages/cli/src/commands/integrations/add.ts
CREATE packages/cli/src/commands/integrations/list.ts
CREATE packages/cli/src/commands/integrations/remove.ts
CREATE packages/cli/src/commands/integrations/dismiss.ts
CREATE packages/cli/tests/commands/integrations.test.ts
MODIFY packages/cli/src/index.ts (register integrations command)
```

## Tasks

### Task 1: Create integrations config read/write module (TDD)

**Depends on:** none (Phase 1 registry/types already exist)
**Files:** `packages/cli/src/integrations/config.ts`, `packages/cli/tests/integrations/config.test.ts`

1. Create test file `packages/cli/tests/integrations/config.test.ts`:

```typescript
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
```

2. Run test: `cd packages/cli && npx vitest run tests/integrations/config.test.ts`
3. Observe failure: module `../../src/integrations/config` does not exist.
4. Create implementation `packages/cli/src/integrations/config.ts`:

```typescript
import * as fs from 'fs';
import * as path from 'path';

interface McpConfig {
  mcpServers?: Record<string, { command: string; args?: string[]; env?: Record<string, string> }>;
  [key: string]: unknown;
}

interface IntegrationsSection {
  enabled: string[];
  dismissed: string[];
}

function readJsonSafe<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function writeJson(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

/**
 * Read .mcp.json (or similar MCP config file).
 * Returns a valid object with mcpServers even if the file is missing or corrupt.
 */
export function readMcpConfig(filePath: string): McpConfig {
  const config = readJsonSafe<McpConfig>(filePath);
  if (!config) return { mcpServers: {} };
  if (!config.mcpServers) config.mcpServers = {};
  return config;
}

/**
 * Write an MCP server entry to an MCP config file.
 * Preserves all existing entries.
 */
export function writeMcpEntry(
  filePath: string,
  name: string,
  entry: { command: string; args?: string[]; env?: Record<string, string> }
): void {
  const config = readMcpConfig(filePath);
  config.mcpServers![name] = entry;
  writeJson(filePath, config);
}

/**
 * Remove an MCP server entry from an MCP config file.
 * Preserves all other entries. No-op if the file or entry doesn't exist.
 */
export function removeMcpEntry(filePath: string, name: string): void {
  if (!fs.existsSync(filePath)) return;
  const config = readMcpConfig(filePath);
  delete config.mcpServers![name];
  writeJson(filePath, config);
}

/**
 * Read the integrations section from harness.config.json.
 * Returns defaults if the file or section is missing.
 */
export function readIntegrationsConfig(configPath: string): IntegrationsSection {
  const raw = readJsonSafe<Record<string, unknown>>(configPath);
  if (!raw || !raw.integrations) return { enabled: [], dismissed: [] };
  const integ = raw.integrations as Partial<IntegrationsSection>;
  return {
    enabled: Array.isArray(integ.enabled) ? integ.enabled : [],
    dismissed: Array.isArray(integ.dismissed) ? integ.dismissed : [],
  };
}

/**
 * Write the integrations section to harness.config.json.
 * Preserves all other config fields. Creates the file if it doesn't exist.
 */
export function writeIntegrationsConfig(
  configPath: string,
  integrations: IntegrationsSection
): void {
  const raw = readJsonSafe<Record<string, unknown>>(configPath) ?? {};
  raw.integrations = integrations;
  writeJson(configPath, raw);
}
```

5. Run test: `cd packages/cli && npx vitest run tests/integrations/config.test.ts`
6. Observe: all tests pass.
7. Run: `harness validate`
8. Commit: `feat(integrations): add config read/write module for MCP and harness.config.json`

---

### Task 2: Create integrations command group (index.ts)

**Depends on:** none
**Files:** `packages/cli/src/commands/integrations/index.ts`

1. Create `packages/cli/src/commands/integrations/index.ts`:

```typescript
import { Command } from 'commander';
import { createAddIntegrationCommand } from './add';
import { createListIntegrationsCommand } from './list';
import { createRemoveIntegrationCommand } from './remove';
import { createDismissIntegrationCommand } from './dismiss';

/**
 * Creates the 'integrations' command group for managing MCP peer integrations.
 */
export function createIntegrationsCommand(): Command {
  const command = new Command('integrations').description(
    'Manage MCP peer integrations (add, list, remove, dismiss)'
  );
  command.addCommand(createListIntegrationsCommand());
  command.addCommand(createAddIntegrationCommand());
  command.addCommand(createRemoveIntegrationCommand());
  command.addCommand(createDismissIntegrationCommand());
  return command;
}
```

2. Run: `harness validate`
3. Commit: `feat(integrations): add command group index with subcommand registration`

Note: This file will not compile until the subcommand files exist. It will be committed alongside or after Tasks 3-6. If needed, create placeholder exports first.

---

### Task 3: Implement `harness integrations list` subcommand (TDD)

**Depends on:** Task 1
**Files:** `packages/cli/src/commands/integrations/list.ts`, `packages/cli/tests/commands/integrations.test.ts` (started)

1. Create `packages/cli/src/commands/integrations/list.ts`:

```typescript
import { Command } from 'commander';
import * as path from 'path';
import chalk from 'chalk';
import { INTEGRATION_REGISTRY } from '../../integrations/registry';
import { readMcpConfig, readIntegrationsConfig } from '../../integrations/config';
import { ExitCode } from '../../utils/errors';

/**
 * Creates the 'integrations list' subcommand.
 * Shows all integrations with status (configured/available/dismissed).
 */
export function createListIntegrationsCommand(): Command {
  return new Command('list')
    .description('Show all MCP integrations with status')
    .action(async (_opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const cwd = process.cwd();
      const mcpPath = path.join(cwd, '.mcp.json');
      const configPath = path.join(cwd, 'harness.config.json');

      const mcpConfig = readMcpConfig(mcpPath);
      const integConfig = readIntegrationsConfig(configPath);
      const mcpServers = mcpConfig.mcpServers ?? {};

      const tier0 = INTEGRATION_REGISTRY.filter((i) => i.tier === 0);
      const tier1 = INTEGRATION_REGISTRY.filter((i) => i.tier === 1);

      if (globalOpts.json) {
        const entries = INTEGRATION_REGISTRY.map((i) => ({
          name: i.name,
          tier: i.tier,
          configured: i.name in mcpServers,
          enabled: integConfig.enabled.includes(i.name),
          dismissed: integConfig.dismissed.includes(i.name),
          envVar: i.envVar ?? null,
          envVarSet: i.envVar ? !!process.env[i.envVar] : null,
        }));
        console.log(JSON.stringify(entries, null, 2));
        process.exit(ExitCode.SUCCESS);
        return;
      }

      console.log('');
      console.log('MCP Integrations:');
      console.log('');
      console.log('  Tier 0 (zero-config):');
      for (const i of tier0) {
        const configured = i.name in mcpServers;
        const icon = configured ? chalk.green('\u2713') : chalk.dim('\u25CB');
        console.log(`    ${icon} ${i.name.padEnd(22)} ${i.description}`);
      }

      console.log('');
      console.log('  Tier 1 (API key required):');
      for (const i of tier1) {
        const configured = i.name in mcpServers;
        const dismissed = integConfig.dismissed.includes(i.name);
        const icon = configured ? chalk.green('\u2713') : chalk.dim('\u25CB');
        let suffix = '';
        if (dismissed) {
          suffix = chalk.dim('[dismissed]');
        } else if (i.envVar) {
          const envSet = !!process.env[i.envVar];
          suffix = `${i.envVar} ${envSet ? chalk.green('\u2713') : chalk.yellow('not set')}`;
        }
        console.log(`    ${icon} ${i.name.padEnd(22)} ${i.description.padEnd(35)} ${suffix}`);
      }

      console.log('');
      console.log(
        `  Run '${chalk.cyan('harness integrations add <name>')}' to enable a Tier 1 integration.`
      );
      console.log('');
      process.exit(ExitCode.SUCCESS);
    });
}
```

2. Add list tests to `packages/cli/tests/commands/integrations.test.ts`:

```typescript
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
```

3. Run test: `cd packages/cli && npx vitest run tests/commands/integrations.test.ts`
4. Observe failure: modules do not exist yet.
5. Proceed to Tasks 4-6 which implement the subcommands.
6. Run: `harness validate`
7. Commit: `test(integrations): add comprehensive tests for add, list, remove, dismiss commands`

---

### Task 4: Implement `harness integrations add` subcommand

**Depends on:** Task 1
**Files:** `packages/cli/src/commands/integrations/add.ts`

1. Create `packages/cli/src/commands/integrations/add.ts`:

```typescript
import { Command } from 'commander';
import * as path from 'path';
import chalk from 'chalk';
import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import { INTEGRATION_REGISTRY } from '../../integrations/registry';
import {
  writeMcpEntry,
  readIntegrationsConfig,
  writeIntegrationsConfig,
} from '../../integrations/config';
import { CLIError, ExitCode } from '../../utils/errors';
import { logger } from '../../output/logger';

interface AddResult {
  name: string;
  displayName: string;
  envVarMissing: boolean;
  envVar?: string;
  installHint?: string;
}

/**
 * Core logic for adding an integration. Separated from Commander for testability.
 */
export function addIntegration(cwd: string, name: string): Result<AddResult, CLIError> {
  const def = INTEGRATION_REGISTRY.find((i) => i.name === name);
  if (!def) {
    return Err(
      new CLIError(
        `Integration '${name}' not found in registry. Run 'harness integrations list' to see available integrations.`,
        ExitCode.ERROR
      )
    );
  }

  if (def.tier === 0) {
    return Err(
      new CLIError(
        `${def.displayName} is a Tier 0 integration, already configured by 'harness setup'. Run 'harness setup' if missing.`,
        ExitCode.ERROR
      )
    );
  }

  // Write MCP entry to .mcp.json
  const mcpPath = path.join(cwd, '.mcp.json');
  const mcpEntry: { command: string; args?: string[]; env?: Record<string, string> } = {
    command: def.mcpConfig.command,
  };
  if (def.mcpConfig.args.length > 0) mcpEntry.args = def.mcpConfig.args;
  if (def.mcpConfig.env) mcpEntry.env = def.mcpConfig.env;
  writeMcpEntry(mcpPath, def.name, mcpEntry);

  // Update harness.config.json
  const configPath = path.join(cwd, 'harness.config.json');
  const integConfig = readIntegrationsConfig(configPath);

  // Add to enabled (if not already)
  if (!integConfig.enabled.includes(def.name)) {
    integConfig.enabled.push(def.name);
  }

  // Remove from dismissed (if present)
  integConfig.dismissed = integConfig.dismissed.filter((d) => d !== def.name);

  writeIntegrationsConfig(configPath, integConfig);

  // Check env var
  const envVarMissing = !!def.envVar && !process.env[def.envVar];

  return Ok({
    name: def.name,
    displayName: def.displayName,
    envVarMissing,
    envVar: def.envVar,
    installHint: def.installHint,
  });
}

/**
 * Creates the 'integrations add' subcommand.
 */
export function createAddIntegrationCommand(): Command {
  return new Command('add')
    .description('Enable an MCP integration')
    .argument('<name>', 'Integration name (e.g. perplexity, augment-code)')
    .action(async (name: string, _opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const cwd = process.cwd();
      const result = addIntegration(cwd, name);

      if (!result.ok) {
        if (!globalOpts.quiet) {
          logger.error(result.error.message);
        }
        process.exit(result.error.exitCode);
        return;
      }

      const { displayName, envVarMissing, envVar, installHint } = result.value;

      if (!globalOpts.quiet) {
        console.log('');
        logger.success(`${displayName} integration enabled.`);
        console.log('');
        if (envVarMissing && envVar) {
          logger.warn(`Set ${chalk.bold(envVar)} in your environment to activate.`);
          if (installHint) {
            console.log(`  ${chalk.dim(installHint)}`);
          }
          console.log('');
        }
      }

      process.exit(ExitCode.SUCCESS);
    });
}
```

2. Run: `harness validate`
3. Commit: `feat(integrations): implement 'harness integrations add' subcommand`

---

### Task 5: Implement `harness integrations remove` subcommand

**Depends on:** Task 1
**Files:** `packages/cli/src/commands/integrations/remove.ts`

1. Create `packages/cli/src/commands/integrations/remove.ts`:

```typescript
import { Command } from 'commander';
import * as path from 'path';
import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import { INTEGRATION_REGISTRY } from '../../integrations/registry';
import {
  removeMcpEntry,
  readIntegrationsConfig,
  writeIntegrationsConfig,
} from '../../integrations/config';
import { CLIError, ExitCode } from '../../utils/errors';
import { logger } from '../../output/logger';

/**
 * Core logic for removing an integration. Separated from Commander for testability.
 */
export function removeIntegration(cwd: string, name: string): Result<string, CLIError> {
  const def = INTEGRATION_REGISTRY.find((i) => i.name === name);
  if (!def) {
    return Err(
      new CLIError(
        `Integration '${name}' not found in registry. Run 'harness integrations list' to see available integrations.`,
        ExitCode.ERROR
      )
    );
  }

  // Remove MCP entry from .mcp.json
  const mcpPath = path.join(cwd, '.mcp.json');
  removeMcpEntry(mcpPath, def.name);

  // Update harness.config.json
  const configPath = path.join(cwd, 'harness.config.json');
  const integConfig = readIntegrationsConfig(configPath);
  integConfig.enabled = integConfig.enabled.filter((e) => e !== def.name);
  writeIntegrationsConfig(configPath, integConfig);

  return Ok(def.displayName);
}

/**
 * Creates the 'integrations remove' subcommand.
 */
export function createRemoveIntegrationCommand(): Command {
  return new Command('remove')
    .description('Remove an MCP integration')
    .argument('<name>', 'Integration name (e.g. perplexity, augment-code)')
    .action(async (name: string, _opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const cwd = process.cwd();
      const result = removeIntegration(cwd, name);

      if (!result.ok) {
        if (!globalOpts.quiet) {
          logger.error(result.error.message);
        }
        process.exit(result.error.exitCode);
        return;
      }

      if (!globalOpts.quiet) {
        console.log('');
        logger.success(`${result.value} integration removed.`);
        console.log('');
      }

      process.exit(ExitCode.SUCCESS);
    });
}
```

2. Run: `harness validate`
3. Commit: `feat(integrations): implement 'harness integrations remove' subcommand`

---

### Task 6: Implement `harness integrations dismiss` subcommand

**Depends on:** Task 1
**Files:** `packages/cli/src/commands/integrations/dismiss.ts`

1. Create `packages/cli/src/commands/integrations/dismiss.ts`:

```typescript
import { Command } from 'commander';
import * as path from 'path';
import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import { INTEGRATION_REGISTRY } from '../../integrations/registry';
import { readIntegrationsConfig, writeIntegrationsConfig } from '../../integrations/config';
import { CLIError, ExitCode } from '../../utils/errors';
import { logger } from '../../output/logger';

/**
 * Core logic for dismissing an integration. Separated from Commander for testability.
 */
export function dismissIntegration(cwd: string, name: string): Result<string, CLIError> {
  const def = INTEGRATION_REGISTRY.find((i) => i.name === name);
  if (!def) {
    return Err(
      new CLIError(
        `Integration '${name}' not found in registry. Run 'harness integrations list' to see available integrations.`,
        ExitCode.ERROR
      )
    );
  }

  const configPath = path.join(cwd, 'harness.config.json');
  const integConfig = readIntegrationsConfig(configPath);

  if (!integConfig.dismissed.includes(def.name)) {
    integConfig.dismissed.push(def.name);
  }

  writeIntegrationsConfig(configPath, integConfig);

  return Ok(def.displayName);
}

/**
 * Creates the 'integrations dismiss' subcommand.
 */
export function createDismissIntegrationCommand(): Command {
  return new Command('dismiss')
    .description('Suppress doctor recommendations for an integration')
    .argument('<name>', 'Integration name (e.g. perplexity, augment-code)')
    .action(async (name: string, _opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const cwd = process.cwd();
      const result = dismissIntegration(cwd, name);

      if (!result.ok) {
        if (!globalOpts.quiet) {
          logger.error(result.error.message);
        }
        process.exit(result.error.exitCode);
        return;
      }

      if (!globalOpts.quiet) {
        console.log('');
        logger.info(
          `${result.value} dismissed. It will no longer appear in 'harness doctor' suggestions.`
        );
        console.log('');
      }

      process.exit(ExitCode.SUCCESS);
    });
}
```

2. Run: `harness validate`
3. Commit: `feat(integrations): implement 'harness integrations dismiss' subcommand`

---

### Task 7: Register integrations command in CLI entrypoint

**Depends on:** Tasks 2-6
**Files:** `packages/cli/src/index.ts`

1. Add import to `packages/cli/src/index.ts`:

   After the line:

   ```typescript
   import { createLearningsCommand } from './commands/learnings';
   ```

   Add:

   ```typescript
   import { createIntegrationsCommand } from './commands/integrations/index';
   ```

2. Add command registration in `createProgram()`:

   After the line:

   ```typescript
   program.addCommand(createOrchestratorCommand());
   ```

   Add:

   ```typescript
   program.addCommand(createIntegrationsCommand());
   ```

3. Run all tests: `cd packages/cli && npx vitest run tests/commands/integrations.test.ts && npx vitest run tests/integrations/config.test.ts`
4. Observe: all tests pass.
5. Run: `harness validate`
6. Commit: `feat(integrations): register integrations command group in CLI entrypoint`

---

### Task 8: End-to-end verification and test run

**Depends on:** Tasks 1-7

[checkpoint:human-verify]

1. Run the full test suite for integration files:
   ```
   cd packages/cli && npx vitest run tests/integrations/config.test.ts tests/commands/integrations.test.ts
   ```
2. Observe: all tests pass.
3. Run: `harness validate`
4. Verify CLI help output: `npx harness integrations --help`
5. Verify subcommand help: `npx harness integrations add --help`
6. Commit (if any fixes needed): `fix(integrations): address verification feedback`

## Traceability

| Observable Truth                               | Delivered By                         |
| ---------------------------------------------- | ------------------------------------ |
| 1. `list` shows all 5 integrations with status | Task 3                               |
| 2. `add perplexity` writes .mcp.json + config  | Task 4                               |
| 3. `add context7` rejects with setup hint      | Task 4                               |
| 4. `add nonexistent` errors                    | Task 4                               |
| 5. `remove perplexity` cleans up both files    | Task 5                               |
| 6. `dismiss augment-code` updates config       | Task 6                               |
| 7. Non-destructive .mcp.json operations        | Task 1 (config module)               |
| 8. config.test.ts passes                       | Task 1                               |
| 9. integrations.test.ts passes                 | Task 3 (tests cover all subcommands) |
| 10. `harness validate` passes                  | All tasks                            |
