# Plan: MCP Codex/Cursor Integration — Phase 1: Foundation

**Date:** 2026-04-01
**Spec:** docs/changes/mcp-codex-cursor/proposal.md
**Estimated tasks:** 2
**Estimated time:** 10 minutes

## Goal

Implement the TOML writer utility for `.codex/config.toml` and extend `setupMcp()` with `codex` and `cursor` client cases, including a `--pick` flag stub on the CLI command.

## Observable Truths (Acceptance Criteria)

1. When `writeTomlMcpEntry(filePath, 'harness', { command: 'harness', args: ['mcp'], enabled: true })` is called on a non-existent file, the system shall create a valid TOML file containing `[mcp_servers.harness]` with `command`, `args`, and `enabled` fields.
2. When `writeTomlMcpEntry` is called on an existing `.codex/config.toml` that has other TOML entries, the system shall preserve all existing entries and only add/update `[mcp_servers.harness]`.
3. When `setupMcp(cwd, 'codex')` is called, the system shall write a `[mcp_servers.harness]` entry to `<cwd>/.codex/config.toml`.
4. When `setupMcp(cwd, 'cursor')` is called, the system shall write a `mcpServers.harness` entry to `<cwd>/.cursor/mcp.json`.
5. When `setupMcp(cwd, 'all')` is called, the system shall configure codex and cursor alongside the existing claude and gemini clients.
6. When `harness setup-mcp --pick` is passed, the system shall accept the flag without error (no-op stub).
7. The system shall not alter Claude Code or Gemini CLI behavior — existing tests pass unchanged.

## File Map

- CREATE `packages/cli/src/integrations/toml.ts`
- CREATE `packages/cli/tests/integrations/toml.test.ts`
- MODIFY `packages/cli/src/commands/setup-mcp.ts` (add codex/cursor cases, --pick flag stub)
- MODIFY `packages/cli/tests/commands/setup-mcp.test.ts` (add codex/cursor test cases)

## Tasks

### Task 1: Implement writeTomlMcpEntry utility (TDD)

**Depends on:** none
**Files:** `packages/cli/src/integrations/toml.ts`, `packages/cli/tests/integrations/toml.test.ts`

1. Create test file `packages/cli/tests/integrations/toml.test.ts`:

   ```typescript
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
   ```

2. Run test: `cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx vitest run tests/integrations/toml.test.ts`

3. Observe failure: `Cannot find module '../../src/integrations/toml'`

4. Create implementation `packages/cli/src/integrations/toml.ts`:

   ```typescript
   import * as fs from 'fs';
   import * as path from 'path';

   export interface TomlMcpServerEntry {
     command: string;
     args?: string[];
     enabled?: boolean;
   }

   /**
    * Write an MCP server entry to a TOML config file (e.g. .codex/config.toml).
    * Uses read-then-merge pattern: preserves all existing TOML content, only
    * adds/replaces the [mcp_servers.<name>] block. Inline serializer — no toml
    * parser dependency.
    *
    * Atomic write: writes to .tmp then renames to avoid corruption on interrupt.
    */
   export function writeTomlMcpEntry(
     filePath: string,
     name: string,
     entry: TomlMcpServerEntry
   ): void {
     const dir = path.dirname(filePath);
     if (!fs.existsSync(dir)) {
       fs.mkdirSync(dir, { recursive: true });
     }

     const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';

     const blockHeader = `[mcp_servers.${name}]`;
     const newBlock = serializeTomlMcpBlock(name, entry);

     let updated: string;

     if (existing.includes(blockHeader)) {
       // Replace the existing block
       updated = replaceTomlBlock(existing, blockHeader, newBlock);
     } else {
       // Append a blank line separator if file is non-empty, then add block
       const separator = existing.length > 0 && !existing.endsWith('\n\n') ? '\n' : '';
       updated = existing + separator + newBlock;
     }

     const tmp = filePath + '.tmp';
     fs.writeFileSync(tmp, updated);
     fs.renameSync(tmp, filePath);
   }

   /**
    * Serialize a single [mcp_servers.<name>] TOML block.
    */
   function serializeTomlMcpBlock(name: string, entry: TomlMcpServerEntry): string {
     const lines: string[] = [`[mcp_servers.${name}]`];
     lines.push(`command = ${JSON.stringify(entry.command)}`);
     if (entry.args !== undefined) {
       const argsLiteral = '[' + entry.args.map((a) => JSON.stringify(a)).join(', ') + ']';
       lines.push(`args = ${argsLiteral}`);
     }
     if (entry.enabled !== undefined) {
       lines.push(`enabled = ${entry.enabled}`);
     }
     return lines.join('\n') + '\n';
   }

   /**
    * Replace an existing TOML block (from blockHeader to the next top-level
    * section header or end-of-file) with newBlock.
    */
   function replaceTomlBlock(content: string, blockHeader: string, newBlock: string): string {
     const lines = content.split('\n');
     const startIdx = lines.findIndex((l) => l.trim() === blockHeader);
     if (startIdx === -1) return content + newBlock;

     // Find where the block ends: next top-level [section] or end of file
     let endIdx = lines.length;
     for (let i = startIdx + 1; i < lines.length; i++) {
       if (lines[i].match(/^\[(?!\[)/)) {
         endIdx = i;
         break;
       }
     }

     // Drop any trailing blank lines before the next section
     while (endIdx > startIdx + 1 && lines[endIdx - 1].trim() === '') {
       endIdx--;
     }

     const newBlockLines = newBlock.trimEnd().split('\n');
     const result = [
       ...lines.slice(0, startIdx),
       ...newBlockLines,
       ...(endIdx < lines.length ? ['', ...lines.slice(endIdx)] : []),
     ];
     return result.join('\n') + (content.endsWith('\n') ? '\n' : '');
   }
   ```

5. Run test: `cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx vitest run tests/integrations/toml.test.ts`

6. Observe: all 6 tests pass

7. Run: `harness validate`

8. Commit: `feat(toml): add writeTomlMcpEntry utility for .codex/config.toml`

---

### Task 2: Extend setupMcp with codex and cursor client cases (TDD)

**Depends on:** Task 1
**Files:** `packages/cli/src/commands/setup-mcp.ts`, `packages/cli/tests/commands/setup-mcp.test.ts`

1. Add new test cases to `packages/cli/tests/commands/setup-mcp.test.ts` — append inside the `describe('setupMcp', ...)` block (after the existing `it('does not set trustedFolder for claude-only', ...)` test at line 111) and add a new `describe` block for the `--pick` flag:

   ```typescript
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
   ```

   Also add a new describe block at the end of the outer describe block to test the `--pick` flag:

   ```typescript
   describe('--pick flag stub', () => {
     it('createSetupMcpCommand accepts --pick flag without error', () => {
       const cmd = createSetupMcpCommand();
       const opt = cmd.options.find((o) => o.long === '--pick');
       expect(opt).toBeDefined();
     });
   });
   ```

2. Run test: `cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx vitest run tests/commands/setup-mcp.test.ts`

3. Observe failures: `Codex CLI` and `Cursor` cases fail — `configured` does not contain them.

4. Modify `packages/cli/src/commands/setup-mcp.ts`:

   a. Add import for `writeTomlMcpEntry` at the top of the file (after the existing imports):

   ```typescript
   import { writeTomlMcpEntry } from '../integrations/toml';
   import { writeMcpEntry } from '../integrations/config';
   ```

   b. Replace the `setupMcp` function body — add the two new client cases after the existing `gemini` block, before the `return` statement:

   ```typescript
   if (client === 'all' || client === 'codex') {
     const configPath = path.join(cwd, '.codex', 'config.toml');
     const alreadyConfigured = (() => {
       if (!fs.existsSync(configPath)) return false;
       const content = fs.readFileSync(configPath, 'utf-8');
       return content.includes('[mcp_servers.harness]');
     })();
     if (alreadyConfigured) {
       skipped.push('Codex CLI');
     } else {
       writeTomlMcpEntry(configPath, 'harness', {
         command: 'harness',
         args: ['mcp'],
         enabled: true,
       });
       configured.push('Codex CLI');
     }
   }

   if (client === 'all' || client === 'cursor') {
     const configPath = path.join(cwd, '.cursor', 'mcp.json');
     const existing = readJsonFile<McpConfig>(configPath);
     if (existing?.mcpServers?.['harness']) {
       skipped.push('Cursor');
     } else {
       writeMcpEntry(configPath, 'harness', { command: 'harness', args: ['mcp'] });
       configured.push('Cursor');
     }
   }
   ```

   c. Add `--pick` flag stub to `createSetupMcpCommand()` — insert after the `--client` option line:

   ```typescript
   .option('--pick', 'Launch interactive tool picker (Cursor only; no-op in Phase 1)')
   ```

   d. Add import at the top of the file for `writeMcpEntry` and `readJsonFile` (note: `readJsonFile` already exists locally in the file — no new import needed for it; only `writeTomlMcpEntry` and `writeMcpEntry` need adding).

   The final import block at the top of `setup-mcp.ts` should be:

   ```typescript
   import { Command } from 'commander';
   import * as fs from 'fs';
   import * as path from 'path';
   import * as os from 'os';
   import chalk from 'chalk';
   import { logger } from '../output/logger';
   import { ExitCode } from '../utils/errors';
   import { writeMcpEntry } from '../integrations/config';
   import { writeTomlMcpEntry } from '../integrations/toml';
   ```

5. Run test: `cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx vitest run tests/commands/setup-mcp.test.ts`

6. Observe: all tests pass (existing 10 tests + 7 new tests = 17 tests)

7. Run full test suite to verify no regressions: `cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx vitest run tests/integrations/toml.test.ts tests/commands/setup-mcp.test.ts`

8. Run: `harness validate`

9. Commit: `feat(setup-mcp): add codex and cursor client cases; add --pick flag stub`

---

## Traceability Matrix

| Observable Truth                                      | Task(s)                      |
| ----------------------------------------------------- | ---------------------------- |
| OT1: writeTomlMcpEntry creates valid TOML on new file | Task 1                       |
| OT2: writeTomlMcpEntry preserves existing entries     | Task 1                       |
| OT3: setupMcp('codex') writes .codex/config.toml      | Task 2                       |
| OT4: setupMcp('cursor') writes .cursor/mcp.json       | Task 2                       |
| OT5: setupMcp('all') configures all four clients      | Task 2                       |
| OT6: --pick flag accepted as no-op stub               | Task 2                       |
| OT7: Claude Code and Gemini CLI behavior unchanged    | Task 2 (regression test run) |
