# Plan: Phase 2 -- Hook Scripts

**Date:** 2026-03-30
**Spec:** docs/changes/runtime-enforcement-extensions/proposal.md
**Estimated tasks:** 8
**Estimated time:** 30 minutes

## Goal

Implement 5 standalone hook scripts and a profile model so that Claude Code can enforce safety, quality, and cost policies at runtime via the hooks protocol.

## Observable Truths (Acceptance Criteria)

1. When `block-no-verify.js` receives stdin with a bash command containing `--no-verify`, it exits with code 2 and prints a block reason to stderr.
2. When `block-no-verify.js` receives stdin with a bash command not containing `--no-verify`, it exits with code 0.
3. When `block-no-verify.js` receives malformed JSON on stdin, it exits with code 0 (fail-open).
4. When `protect-config.js` receives stdin indicating a write to `.eslintrc.json`, it exits with code 2.
5. When `protect-config.js` receives stdin indicating a write to `src/app.ts`, it exits with code 0.
6. When `protect-config.js` receives truncated/malformed stdin, it exits with code 2 (security hook blocks on parse error).
7. When `quality-gate.js` runs and detects a formatter config (e.g., `biome.json`), it spawns the formatter and exits with code 0 regardless of formatter output.
8. When `quality-gate.js` receives malformed stdin, it exits with code 0 (fail-open).
9. When `pre-compact-state.js` runs, it writes session state to `.harness/` and exits with code 0.
10. When `pre-compact-state.js` receives malformed stdin, it exits with code 0 (fail-open).
11. When `cost-tracker.js` runs, it appends a JSON line to `.harness/metrics/costs.jsonl` and exits with code 0.
12. When `cost-tracker.js` receives malformed stdin, it exits with code 0 (fail-open).
13. The `profiles.ts` module exports a `PROFILES` object mapping `minimal`, `standard`, and `strict` to their hook lists. Profiles are additive (each tier includes all hooks from lower tiers).
14. `npx vitest run tests/hooks/` passes with all hook tests green.
15. All hook scripts are plain `.js` files using only Node.js stdlib (no external imports).

## File Map

- CREATE `packages/cli/src/hooks/profiles.ts`
- CREATE `packages/cli/src/hooks/block-no-verify.js`
- CREATE `packages/cli/src/hooks/protect-config.js`
- CREATE `packages/cli/src/hooks/quality-gate.js`
- CREATE `packages/cli/src/hooks/pre-compact-state.js`
- CREATE `packages/cli/src/hooks/cost-tracker.js`
- CREATE `packages/cli/tests/hooks/profiles.test.ts`
- CREATE `packages/cli/tests/hooks/block-no-verify.test.ts`
- CREATE `packages/cli/tests/hooks/protect-config.test.ts`
- CREATE `packages/cli/tests/hooks/quality-gate.test.ts`
- CREATE `packages/cli/tests/hooks/pre-compact-state.test.ts`
- CREATE `packages/cli/tests/hooks/cost-tracker.test.ts`

## Tasks

### Task 1: Define profile model in profiles.ts (TDD)

**Depends on:** none
**Files:** `packages/cli/src/hooks/profiles.ts`, `packages/cli/tests/hooks/profiles.test.ts`

1. Create test file `packages/cli/tests/hooks/profiles.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { PROFILES, type HookProfile, HOOK_SCRIPTS } from '../../src/hooks/profiles';

   describe('profiles', () => {
     it('exports minimal, standard, and strict profiles', () => {
       expect(PROFILES).toHaveProperty('minimal');
       expect(PROFILES).toHaveProperty('standard');
       expect(PROFILES).toHaveProperty('strict');
     });

     it('minimal includes only block-no-verify', () => {
       expect(PROFILES.minimal).toEqual(['block-no-verify']);
     });

     it('standard includes minimal plus protect-config, quality-gate, pre-compact-state', () => {
       expect(PROFILES.standard).toContain('block-no-verify');
       expect(PROFILES.standard).toContain('protect-config');
       expect(PROFILES.standard).toContain('quality-gate');
       expect(PROFILES.standard).toContain('pre-compact-state');
       expect(PROFILES.standard).not.toContain('cost-tracker');
     });

     it('strict includes all hooks', () => {
       expect(PROFILES.strict).toContain('block-no-verify');
       expect(PROFILES.strict).toContain('protect-config');
       expect(PROFILES.strict).toContain('quality-gate');
       expect(PROFILES.strict).toContain('pre-compact-state');
       expect(PROFILES.strict).toContain('cost-tracker');
     });

     it('profiles are additive (each tier is superset of previous)', () => {
       for (const hook of PROFILES.minimal) {
         expect(PROFILES.standard).toContain(hook);
       }
       for (const hook of PROFILES.standard) {
         expect(PROFILES.strict).toContain(hook);
       }
     });

     it('HOOK_SCRIPTS defines event, matcher, and profile for each hook', () => {
       expect(HOOK_SCRIPTS).toHaveLength(5);
       const blockNoVerify = HOOK_SCRIPTS.find((h) => h.name === 'block-no-verify');
       expect(blockNoVerify).toBeDefined();
       expect(blockNoVerify!.event).toBe('PreToolUse');
       expect(blockNoVerify!.matcher).toBe('Bash');
     });
   });
   ```

2. Run test: `cd packages/cli && npx vitest run tests/hooks/profiles.test.ts`
3. Observe failure: cannot resolve `../../src/hooks/profiles`
4. Create implementation `packages/cli/src/hooks/profiles.ts`:

   ```typescript
   /**
    * Hook profile definitions.
    *
    * Profiles are additive: each higher tier includes all hooks from lower tiers.
    * - minimal: safety floor (block-no-verify only)
    * - standard: + protect-config, quality-gate, pre-compact-state (default)
    * - strict: + cost-tracker
    */

   export type HookProfile = 'minimal' | 'standard' | 'strict';

   export interface HookScript {
     /** Script filename without .js extension */
     name: string;
     /** Claude Code hook event */
     event: 'PreToolUse' | 'PostToolUse' | 'PreCompact' | 'Stop';
     /** Tool matcher pattern */
     matcher: string;
     /** Minimum profile tier that includes this hook */
     minProfile: HookProfile;
   }

   export const HOOK_SCRIPTS: HookScript[] = [
     { name: 'block-no-verify', event: 'PreToolUse', matcher: 'Bash', minProfile: 'minimal' },
     { name: 'protect-config', event: 'PreToolUse', matcher: 'Write|Edit', minProfile: 'standard' },
     { name: 'quality-gate', event: 'PostToolUse', matcher: 'Edit|Write', minProfile: 'standard' },
     { name: 'pre-compact-state', event: 'PreCompact', matcher: '*', minProfile: 'standard' },
     { name: 'cost-tracker', event: 'Stop', matcher: '*', minProfile: 'strict' },
   ];

   const PROFILE_ORDER: HookProfile[] = ['minimal', 'standard', 'strict'];

   function hooksForProfile(profile: HookProfile): string[] {
     const profileIndex = PROFILE_ORDER.indexOf(profile);
     return HOOK_SCRIPTS.filter((h) => PROFILE_ORDER.indexOf(h.minProfile) <= profileIndex).map(
       (h) => h.name
     );
   }

   export const PROFILES: Record<HookProfile, string[]> = {
     minimal: hooksForProfile('minimal'),
     standard: hooksForProfile('standard'),
     strict: hooksForProfile('strict'),
   };
   ```

5. Run test: `cd packages/cli && npx vitest run tests/hooks/profiles.test.ts`
6. Observe: all tests pass
7. Commit: `feat(hooks): define profile model with minimal/standard/strict tiers`

---

### Task 2: Implement block-no-verify.js hook (TDD)

**Depends on:** none
**Files:** `packages/cli/src/hooks/block-no-verify.js`, `packages/cli/tests/hooks/block-no-verify.test.ts`

1. Create test file `packages/cli/tests/hooks/block-no-verify.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { execFileSync } from 'node:child_process';
   import { resolve } from 'node:path';

   const HOOK_PATH = resolve(__dirname, '../../src/hooks/block-no-verify.js');

   function runHook(stdinData: string): { exitCode: number; stderr: string } {
     try {
       const result = execFileSync('node', [HOOK_PATH], {
         input: stdinData,
         encoding: 'utf-8',
         stdio: ['pipe', 'pipe', 'pipe'],
       });
       return { exitCode: 0, stderr: '' };
     } catch (err: any) {
       return { exitCode: err.status ?? 1, stderr: err.stderr ?? '' };
     }
   }

   describe('block-no-verify', () => {
     it('blocks git commit --no-verify', () => {
       const input = JSON.stringify({
         tool_name: 'Bash',
         tool_input: { command: 'git commit --no-verify -m "test"' },
       });
       const { exitCode, stderr } = runHook(input);
       expect(exitCode).toBe(2);
       expect(stderr).toContain('--no-verify');
     });

     it('blocks git push --no-verify', () => {
       const input = JSON.stringify({
         tool_name: 'Bash',
         tool_input: { command: 'git push --no-verify' },
       });
       const { exitCode } = runHook(input);
       expect(exitCode).toBe(2);
     });

     it('allows normal git commit', () => {
       const input = JSON.stringify({
         tool_name: 'Bash',
         tool_input: { command: 'git commit -m "normal commit"' },
       });
       const { exitCode } = runHook(input);
       expect(exitCode).toBe(0);
     });

     it('allows non-git commands', () => {
       const input = JSON.stringify({
         tool_name: 'Bash',
         tool_input: { command: 'npm test' },
       });
       const { exitCode } = runHook(input);
       expect(exitCode).toBe(0);
     });

     it('fails open on malformed JSON', () => {
       const { exitCode } = runHook('not json at all');
       expect(exitCode).toBe(0);
     });

     it('fails open on missing tool_input', () => {
       const input = JSON.stringify({ tool_name: 'Bash' });
       const { exitCode } = runHook(input);
       expect(exitCode).toBe(0);
     });

     it('fails open on empty stdin', () => {
       const { exitCode } = runHook('');
       expect(exitCode).toBe(0);
     });
   });
   ```

2. Run test: `cd packages/cli && npx vitest run tests/hooks/block-no-verify.test.ts`
3. Observe failure: hook script does not exist
4. Create `packages/cli/src/hooks/block-no-verify.js`:

   ```javascript
   #!/usr/bin/env node
   // block-no-verify.js — PreToolUse:Bash hook
   // Blocks git commands that use --no-verify to skip hooks.
   // Exit codes: 0 = allow, 2 = block
   'use strict';

   function main() {
     let raw = '';
     try {
       raw = require('fs').readFileSync('/dev/stdin', 'utf-8');
     } catch {
       // No stdin or read error — fail open
       process.exit(0);
     }

     if (!raw.trim()) {
       process.exit(0);
     }

     let input;
     try {
       input = JSON.parse(raw);
     } catch {
       // Malformed JSON — fail open
       process.exit(0);
     }

     try {
       const command = input?.tool_input?.command ?? '';
       if (typeof command !== 'string') {
         process.exit(0);
       }

       if (/--no-verify/.test(command)) {
         process.stderr.write('BLOCKED: --no-verify flag detected. Hooks must not be bypassed.\n');
         process.exit(2);
       }

       process.exit(0);
     } catch {
       // Unexpected error — fail open
       process.exit(0);
     }
   }

   main();
   ```

5. Run test: `cd packages/cli && npx vitest run tests/hooks/block-no-verify.test.ts`
6. Observe: all tests pass
7. Commit: `feat(hooks): add block-no-verify hook script`

---

### Task 3: Implement protect-config.js hook (TDD)

**Depends on:** none
**Files:** `packages/cli/src/hooks/protect-config.js`, `packages/cli/tests/hooks/protect-config.test.ts`

1. Create test file `packages/cli/tests/hooks/protect-config.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { execFileSync } from 'node:child_process';
   import { resolve } from 'node:path';

   const HOOK_PATH = resolve(__dirname, '../../src/hooks/protect-config.js');

   function runHook(stdinData: string): { exitCode: number; stderr: string } {
     try {
       execFileSync('node', [HOOK_PATH], {
         input: stdinData,
         encoding: 'utf-8',
         stdio: ['pipe', 'pipe', 'pipe'],
       });
       return { exitCode: 0, stderr: '' };
     } catch (err: any) {
       return { exitCode: err.status ?? 1, stderr: err.stderr ?? '' };
     }
   }

   describe('protect-config', () => {
     const protectedFiles = [
       '.eslintrc.json',
       '.eslintrc.js',
       'eslint.config.mjs',
       '.prettierrc',
       '.prettierrc.json',
       'prettier.config.js',
       'biome.json',
       'biome.jsonc',
       '.ruff.toml',
       'ruff.toml',
       '.stylelintrc.json',
       '.markdownlint.json',
       'deno.json',
     ];

     for (const file of protectedFiles) {
       it(`blocks write to ${file}`, () => {
         const input = JSON.stringify({
           tool_name: 'Write',
           tool_input: { file_path: file, content: '{}' },
         });
         const { exitCode, stderr } = runHook(input);
         expect(exitCode).toBe(2);
         expect(stderr).toContain('protected');
       });
     }

     it('blocks Edit to protected config', () => {
       const input = JSON.stringify({
         tool_name: 'Edit',
         tool_input: { file_path: '.eslintrc.json', old_string: 'a', new_string: 'b' },
       });
       const { exitCode } = runHook(input);
       expect(exitCode).toBe(2);
     });

     it('allows write to normal source file', () => {
       const input = JSON.stringify({
         tool_name: 'Write',
         tool_input: { file_path: 'src/app.ts', content: 'code' },
       });
       const { exitCode } = runHook(input);
       expect(exitCode).toBe(0);
     });

     it('allows write to tsconfig.json (not protected)', () => {
       const input = JSON.stringify({
         tool_name: 'Write',
         tool_input: { file_path: 'tsconfig.json', content: '{}' },
       });
       const { exitCode } = runHook(input);
       expect(exitCode).toBe(0);
     });

     it('allows write to pyproject.toml (not protected)', () => {
       const input = JSON.stringify({
         tool_name: 'Write',
         tool_input: { file_path: 'pyproject.toml', content: '' },
       });
       const { exitCode } = runHook(input);
       expect(exitCode).toBe(0);
     });

     it('blocks on malformed JSON (security hook)', () => {
       const { exitCode, stderr } = runHook('not json');
       expect(exitCode).toBe(2);
       expect(stderr).toContain('parse');
     });

     it('blocks on empty stdin (security hook)', () => {
       const { exitCode } = runHook('');
       expect(exitCode).toBe(2);
     });

     it('blocks on missing file_path (security hook)', () => {
       const input = JSON.stringify({
         tool_name: 'Write',
         tool_input: { content: '{}' },
       });
       const { exitCode } = runHook(input);
       expect(exitCode).toBe(2);
     });

     it('handles nested paths correctly', () => {
       const input = JSON.stringify({
         tool_name: 'Write',
         tool_input: { file_path: 'config/.eslintrc.json', content: '{}' },
       });
       const { exitCode } = runHook(input);
       expect(exitCode).toBe(2);
     });
   });
   ```

2. Run test: `cd packages/cli && npx vitest run tests/hooks/protect-config.test.ts`
3. Observe failure: hook script does not exist
4. Create `packages/cli/src/hooks/protect-config.js`:

   ```javascript
   #!/usr/bin/env node
   // protect-config.js — PreToolUse:Write/Edit hook
   // Blocks modifications to linter/formatter config files.
   // Security hook: blocks on parse errors (exit 2) rather than failing open.
   // Exit codes: 0 = allow, 2 = block
   'use strict';

   const path = require('path');

   // Protected config file patterns
   const PROTECTED_PATTERNS = [
     /^\.eslintrc/,
     /^eslint\.config\./,
     /^\.prettierrc/,
     /^prettier\.config\./,
     /^biome\.json$/,
     /^biome\.jsonc$/,
     /^\.ruff\.toml$/,
     /^ruff\.toml$/,
     /^\.stylelintrc/,
     /^\.markdownlint/,
     /^deno\.json$/,
   ];

   function isProtected(filePath) {
     const basename = path.basename(filePath);
     return PROTECTED_PATTERNS.some((pattern) => pattern.test(basename));
   }

   function block(reason) {
     process.stderr.write(`BLOCKED: ${reason}\n`);
     process.exit(2);
   }

   function main() {
     let raw = '';
     try {
       raw = require('fs').readFileSync('/dev/stdin', 'utf-8');
     } catch {
       block('Could not read stdin — blocking for safety (security hook).');
       return;
     }

     if (!raw.trim()) {
       block('Empty stdin — blocking for safety (security hook).');
       return;
     }

     let input;
     try {
       input = JSON.parse(raw);
     } catch {
       block('Could not parse stdin JSON — blocking for safety (security hook).');
       return;
     }

     try {
       const filePath = input?.tool_input?.file_path;
       if (typeof filePath !== 'string' || !filePath) {
         block('Missing file_path in tool input — blocking for safety (security hook).');
         return;
       }

       if (isProtected(filePath)) {
         block(
           `Modification to protected config file: ${path.basename(filePath)}. Linter/formatter configs must not be weakened.`
         );
         return;
       }

       process.exit(0);
     } catch {
       block('Unexpected error — blocking for safety (security hook).');
     }
   }

   main();
   ```

5. Run test: `cd packages/cli && npx vitest run tests/hooks/protect-config.test.ts`
6. Observe: all tests pass
7. Commit: `feat(hooks): add protect-config hook script`

---

### Task 4: Implement quality-gate.js hook (TDD)

**Depends on:** none
**Files:** `packages/cli/src/hooks/quality-gate.js`, `packages/cli/tests/hooks/quality-gate.test.ts`

1. Create test file `packages/cli/tests/hooks/quality-gate.test.ts`:

   ```typescript
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import { execFileSync } from 'node:child_process';
   import { resolve, join } from 'node:path';
   import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
   import { tmpdir } from 'node:os';

   const HOOK_PATH = resolve(__dirname, '../../src/hooks/quality-gate.js');

   function runHook(stdinData: string, cwd?: string): { exitCode: number; stderr: string } {
     try {
       const result = execFileSync('node', [HOOK_PATH], {
         input: stdinData,
         encoding: 'utf-8',
         stdio: ['pipe', 'pipe', 'pipe'],
         cwd: cwd ?? process.cwd(),
       });
       return { exitCode: 0, stderr: '' };
     } catch (err: any) {
       return { exitCode: err.status ?? 1, stderr: err.stderr ?? '' };
     }
   }

   describe('quality-gate', () => {
     let tmpDir: string;

     beforeEach(() => {
       tmpDir = mkdtempSync(join(tmpdir(), 'quality-gate-'));
     });

     afterEach(() => {
       rmSync(tmpDir, { recursive: true, force: true });
     });

     it('always exits 0 even when formatter is not found', () => {
       const input = JSON.stringify({
         tool_name: 'Write',
         tool_input: { file_path: 'src/app.ts' },
         tool_output: 'wrote file',
       });
       const { exitCode } = runHook(input, tmpDir);
       expect(exitCode).toBe(0);
     });

     it('detects biome.json and reports on stderr', () => {
       writeFileSync(join(tmpDir, 'biome.json'), '{}');
       const input = JSON.stringify({
         tool_name: 'Edit',
         tool_input: { file_path: 'src/app.ts' },
         tool_output: 'edited file',
       });
       // Will fail to run biome (not installed in tmpDir) but should still exit 0
       const { exitCode } = runHook(input, tmpDir);
       expect(exitCode).toBe(0);
     });

     it('detects biome.jsonc', () => {
       writeFileSync(join(tmpDir, 'biome.jsonc'), '{}');
       const input = JSON.stringify({
         tool_name: 'Write',
         tool_input: { file_path: 'src/app.ts' },
         tool_output: 'wrote file',
       });
       const { exitCode } = runHook(input, tmpDir);
       expect(exitCode).toBe(0);
     });

     it('detects prettierrc when no biome config', () => {
       writeFileSync(join(tmpDir, '.prettierrc'), '{}');
       const input = JSON.stringify({
         tool_name: 'Write',
         tool_input: { file_path: 'src/app.ts' },
         tool_output: 'wrote file',
       });
       const { exitCode } = runHook(input, tmpDir);
       expect(exitCode).toBe(0);
     });

     it('fails open on malformed JSON', () => {
       const { exitCode } = runHook('not json');
       expect(exitCode).toBe(0);
     });

     it('fails open on empty stdin', () => {
       const { exitCode } = runHook('');
       expect(exitCode).toBe(0);
     });

     it('never exits with code 2 (warn-only hook)', () => {
       writeFileSync(join(tmpDir, 'biome.json'), '{}');
       const input = JSON.stringify({
         tool_name: 'Edit',
         tool_input: { file_path: 'src/app.ts' },
         tool_output: 'edited file',
       });
       const { exitCode } = runHook(input, tmpDir);
       expect(exitCode).not.toBe(2);
     });
   });
   ```

2. Run test: `cd packages/cli && npx vitest run tests/hooks/quality-gate.test.ts`
3. Observe failure: hook script does not exist
4. Create `packages/cli/src/hooks/quality-gate.js`:

   ```javascript
   #!/usr/bin/env node
   // quality-gate.js — PostToolUse:Edit/Write hook
   // Runs project formatter/linter after edits and warns on violations.
   // Never blocks (always exits 0). Warnings go to stderr.
   // Exit codes: 0 = allow (always)
   'use strict';

   const fs = require('fs');
   const path = require('path');
   const { execSync } = require('child_process');

   // Detection order: first match wins
   const DETECTORS = [
     {
       configs: ['biome.json', 'biome.jsonc'],
       command: 'npx biome check',
       name: 'Biome',
     },
     {
       configs: [
         '.prettierrc',
         '.prettierrc.json',
         '.prettierrc.yml',
         '.prettierrc.yaml',
         '.prettierrc.js',
         '.prettierrc.cjs',
         '.prettierrc.mjs',
         'prettier.config.js',
         'prettier.config.cjs',
         'prettier.config.mjs',
       ],
       command: 'npx prettier --check',
       name: 'Prettier',
     },
     {
       configs: ['.ruff.toml', 'ruff.toml'],
       command: 'ruff check',
       name: 'Ruff',
     },
   ];

   function detectFormatter(cwd) {
     for (const detector of DETECTORS) {
       for (const config of detector.configs) {
         try {
           fs.accessSync(path.join(cwd, config));
           return detector;
         } catch {
           // Config not found, try next
         }
       }
     }
     return null;
   }

   function main() {
     let raw = '';
     try {
       raw = fs.readFileSync('/dev/stdin', 'utf-8');
     } catch {
       process.exit(0);
     }

     if (!raw.trim()) {
       process.exit(0);
     }

     let input;
     try {
       input = JSON.parse(raw);
     } catch {
       process.exit(0);
     }

     try {
       const filePath = input?.tool_input?.file_path ?? '';
       const cwd = process.cwd();

       // Special case: .go files use gofmt
       if (typeof filePath === 'string' && filePath.endsWith('.go')) {
         try {
           const result = execSync(`gofmt -l ${JSON.stringify(filePath)}`, {
             encoding: 'utf-8',
             cwd,
             timeout: 10000,
           });
           if (result.trim()) {
             process.stderr.write(
               `[quality-gate] gofmt found formatting issues in: ${result.trim()}\n`
             );
           }
         } catch {
           // gofmt not available or failed — warn and continue
           process.stderr.write('[quality-gate] gofmt check failed (tool may not be installed)\n');
         }
         process.exit(0);
       }

       const detector = detectFormatter(cwd);
       if (!detector) {
         // No formatter detected — nothing to check
         process.exit(0);
       }

       try {
         execSync(detector.command, {
           encoding: 'utf-8',
           cwd,
           timeout: 30000,
           stdio: ['pipe', 'pipe', 'pipe'],
         });
         process.stderr.write(`[quality-gate] ${detector.name} check passed\n`);
       } catch (err) {
         // Formatter found violations or failed to run — warn only
         const output = err.stdout || err.stderr || '';
         process.stderr.write(
           `[quality-gate] ${detector.name} check reported issues:\n${output.slice(0, 500)}\n`
         );
       }

       process.exit(0);
     } catch {
       // Unexpected error — fail open
       process.exit(0);
     }
   }

   main();
   ```

5. Run test: `cd packages/cli && npx vitest run tests/hooks/quality-gate.test.ts`
6. Observe: all tests pass
7. Commit: `feat(hooks): add quality-gate hook script`

---

### Task 5: Implement pre-compact-state.js hook (TDD)

**Depends on:** none
**Files:** `packages/cli/src/hooks/pre-compact-state.js`, `packages/cli/tests/hooks/pre-compact-state.test.ts`

1. Create test file `packages/cli/tests/hooks/pre-compact-state.test.ts`:

   ```typescript
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import { execFileSync } from 'node:child_process';
   import { resolve, join } from 'node:path';
   import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
   import { tmpdir } from 'node:os';

   const HOOK_PATH = resolve(__dirname, '../../src/hooks/pre-compact-state.js');

   function runHook(stdinData: string, cwd?: string): { exitCode: number; stderr: string } {
     try {
       execFileSync('node', [HOOK_PATH], {
         input: stdinData,
         encoding: 'utf-8',
         stdio: ['pipe', 'pipe', 'pipe'],
         cwd: cwd ?? process.cwd(),
       });
       return { exitCode: 0, stderr: '' };
     } catch (err: any) {
       return { exitCode: err.status ?? 1, stderr: err.stderr ?? '' };
     }
   }

   describe('pre-compact-state', () => {
     let tmpDir: string;

     beforeEach(() => {
       tmpDir = mkdtempSync(join(tmpdir(), 'pre-compact-'));
     });

     afterEach(() => {
       rmSync(tmpDir, { recursive: true, force: true });
     });

     it('creates .harness/compact-snapshots/ directory and writes snapshot', () => {
       const input = JSON.stringify({
         hook_type: 'PreCompact',
         session_id: 'test-session-123',
       });
       const { exitCode } = runHook(input, tmpDir);
       expect(exitCode).toBe(0);

       const snapshotsDir = join(tmpDir, '.harness', 'compact-snapshots');
       expect(existsSync(snapshotsDir)).toBe(true);

       // Should have created a snapshot file
       const files = require('fs').readdirSync(snapshotsDir);
       expect(files.length).toBeGreaterThan(0);
       expect(files[0]).toMatch(/\.json$/);
     });

     it('snapshot contains timestamp and input data', () => {
       const input = JSON.stringify({
         hook_type: 'PreCompact',
         session_id: 'test-session-456',
       });
       runHook(input, tmpDir);

       const snapshotsDir = join(tmpDir, '.harness', 'compact-snapshots');
       const files = require('fs').readdirSync(snapshotsDir);
       const snapshot = JSON.parse(readFileSync(join(snapshotsDir, files[0]), 'utf-8'));

       expect(snapshot).toHaveProperty('timestamp');
       expect(snapshot).toHaveProperty('hookInput');
       expect(snapshot.hookInput.session_id).toBe('test-session-456');
     });

     it('preserves existing .harness directory', () => {
       mkdirSync(join(tmpDir, '.harness'), { recursive: true });
       require('fs').writeFileSync(join(tmpDir, '.harness', 'existing.txt'), 'keep me');

       const input = JSON.stringify({ hook_type: 'PreCompact' });
       runHook(input, tmpDir);

       expect(existsSync(join(tmpDir, '.harness', 'existing.txt'))).toBe(true);
     });

     it('fails open on malformed JSON', () => {
       const { exitCode } = runHook('not json', tmpDir);
       expect(exitCode).toBe(0);
     });

     it('fails open on empty stdin', () => {
       const { exitCode } = runHook('', tmpDir);
       expect(exitCode).toBe(0);
     });

     it('always exits 0', () => {
       const input = JSON.stringify({ hook_type: 'PreCompact' });
       const { exitCode } = runHook(input, tmpDir);
       expect(exitCode).toBe(0);
     });
   });
   ```

2. Run test: `cd packages/cli && npx vitest run tests/hooks/pre-compact-state.test.ts`
3. Observe failure: hook script does not exist
4. Create `packages/cli/src/hooks/pre-compact-state.js`:

   ```javascript
   #!/usr/bin/env node
   // pre-compact-state.js — PreCompact:* hook
   // Saves harness session state before context compaction.
   // Exit codes: 0 = allow (always, log-only hook)
   'use strict';

   const fs = require('fs');
   const path = require('path');

   function main() {
     let raw = '';
     try {
       raw = fs.readFileSync('/dev/stdin', 'utf-8');
     } catch {
       process.exit(0);
     }

     if (!raw.trim()) {
       process.exit(0);
     }

     let input;
     try {
       input = JSON.parse(raw);
     } catch {
       process.stderr.write('[pre-compact-state] Could not parse stdin — skipping snapshot\n');
       process.exit(0);
     }

     try {
       const cwd = process.cwd();
       const snapshotsDir = path.join(cwd, '.harness', 'compact-snapshots');

       fs.mkdirSync(snapshotsDir, { recursive: true });

       const timestamp = new Date().toISOString();
       const filename = `snapshot-${timestamp.replace(/[:.]/g, '-')}.json`;
       const snapshot = {
         timestamp,
         hookInput: input,
       };

       fs.writeFileSync(
         path.join(snapshotsDir, filename),
         JSON.stringify(snapshot, null, 2) + '\n'
       );

       process.stderr.write(`[pre-compact-state] Saved snapshot: ${filename}\n`);
       process.exit(0);
     } catch (err) {
       process.stderr.write(`[pre-compact-state] Failed to save snapshot: ${err.message}\n`);
       process.exit(0);
     }
   }

   main();
   ```

5. Run test: `cd packages/cli && npx vitest run tests/hooks/pre-compact-state.test.ts`
6. Observe: all tests pass
7. Commit: `feat(hooks): add pre-compact-state hook script`

---

### Task 6: Implement cost-tracker.js hook (TDD)

**Depends on:** none
**Files:** `packages/cli/src/hooks/cost-tracker.js`, `packages/cli/tests/hooks/cost-tracker.test.ts`

1. Create test file `packages/cli/tests/hooks/cost-tracker.test.ts`:

   ```typescript
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import { execFileSync } from 'node:child_process';
   import { resolve, join } from 'node:path';
   import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
   import { tmpdir } from 'node:os';

   const HOOK_PATH = resolve(__dirname, '../../src/hooks/cost-tracker.js');

   function runHook(stdinData: string, cwd?: string): { exitCode: number; stderr: string } {
     try {
       execFileSync('node', [HOOK_PATH], {
         input: stdinData,
         encoding: 'utf-8',
         stdio: ['pipe', 'pipe', 'pipe'],
         cwd: cwd ?? process.cwd(),
       });
       return { exitCode: 0, stderr: '' };
     } catch (err: any) {
       return { exitCode: err.status ?? 1, stderr: err.stderr ?? '' };
     }
   }

   describe('cost-tracker', () => {
     let tmpDir: string;

     beforeEach(() => {
       tmpDir = mkdtempSync(join(tmpdir(), 'cost-tracker-'));
     });

     afterEach(() => {
       rmSync(tmpDir, { recursive: true, force: true });
     });

     it('creates .harness/metrics/costs.jsonl and appends entry', () => {
       const input = JSON.stringify({
         session_id: 'session-001',
         token_usage: { input_tokens: 1000, output_tokens: 500 },
       });
       const { exitCode } = runHook(input, tmpDir);
       expect(exitCode).toBe(0);

       const costsFile = join(tmpDir, '.harness', 'metrics', 'costs.jsonl');
       expect(existsSync(costsFile)).toBe(true);

       const line = readFileSync(costsFile, 'utf-8').trim();
       const entry = JSON.parse(line);
       expect(entry).toHaveProperty('timestamp');
       expect(entry).toHaveProperty('session_id', 'session-001');
       expect(entry).toHaveProperty('token_usage');
     });

     it('appends to existing costs.jsonl', () => {
       const input1 = JSON.stringify({
         session_id: 'session-001',
         token_usage: { input_tokens: 100, output_tokens: 50 },
       });
       const input2 = JSON.stringify({
         session_id: 'session-002',
         token_usage: { input_tokens: 200, output_tokens: 100 },
       });

       runHook(input1, tmpDir);
       runHook(input2, tmpDir);

       const costsFile = join(tmpDir, '.harness', 'metrics', 'costs.jsonl');
       const lines = readFileSync(costsFile, 'utf-8').trim().split('\n');
       expect(lines).toHaveLength(2);

       const entry1 = JSON.parse(lines[0]);
       const entry2 = JSON.parse(lines[1]);
       expect(entry1.session_id).toBe('session-001');
       expect(entry2.session_id).toBe('session-002');
     });

     it('fails open on malformed JSON', () => {
       const { exitCode } = runHook('not json', tmpDir);
       expect(exitCode).toBe(0);
     });

     it('fails open on empty stdin', () => {
       const { exitCode } = runHook('', tmpDir);
       expect(exitCode).toBe(0);
     });

     it('always exits 0', () => {
       const input = JSON.stringify({ session_id: 'test' });
       const { exitCode } = runHook(input, tmpDir);
       expect(exitCode).toBe(0);
     });
   });
   ```

2. Run test: `cd packages/cli && npx vitest run tests/hooks/cost-tracker.test.ts`
3. Observe failure: hook script does not exist
4. Create `packages/cli/src/hooks/cost-tracker.js`:

   ```javascript
   #!/usr/bin/env node
   // cost-tracker.js — Stop:* hook
   // Appends token usage to .harness/metrics/costs.jsonl.
   // Exit codes: 0 = allow (always, log-only hook)
   'use strict';

   const fs = require('fs');
   const path = require('path');

   function main() {
     let raw = '';
     try {
       raw = fs.readFileSync('/dev/stdin', 'utf-8');
     } catch {
       process.exit(0);
     }

     if (!raw.trim()) {
       process.exit(0);
     }

     let input;
     try {
       input = JSON.parse(raw);
     } catch {
       process.stderr.write('[cost-tracker] Could not parse stdin — skipping\n');
       process.exit(0);
     }

     try {
       const cwd = process.cwd();
       const metricsDir = path.join(cwd, '.harness', 'metrics');

       fs.mkdirSync(metricsDir, { recursive: true });

       const entry = {
         timestamp: new Date().toISOString(),
         session_id: input.session_id ?? null,
         token_usage: input.token_usage ?? null,
       };

       const costsFile = path.join(metricsDir, 'costs.jsonl');
       fs.appendFileSync(costsFile, JSON.stringify(entry) + '\n');

       process.stderr.write(`[cost-tracker] Logged cost entry for session ${entry.session_id}\n`);
       process.exit(0);
     } catch (err) {
       process.stderr.write(`[cost-tracker] Failed to log costs: ${err.message}\n`);
       process.exit(0);
     }
   }

   main();
   ```

5. Run test: `cd packages/cli && npx vitest run tests/hooks/cost-tracker.test.ts`
6. Observe: all tests pass
7. Commit: `feat(hooks): add cost-tracker hook script`

---

### Task 7: Cross-hook integration test

**Depends on:** Task 1, Task 2, Task 3, Task 4, Task 5, Task 6
**Files:** `packages/cli/tests/hooks/integration.test.ts`

[checkpoint:human-verify] -- Verify Tasks 1-6 output before running integration test

1. Create test file `packages/cli/tests/hooks/integration.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { execFileSync } from 'node:child_process';
   import { resolve, join } from 'node:path';
   import { existsSync } from 'node:fs';
   import { PROFILES, HOOK_SCRIPTS } from '../../src/hooks/profiles';

   const HOOKS_DIR = resolve(__dirname, '../../src/hooks');

   describe('hook scripts integration', () => {
     it('all hook scripts referenced in profiles exist as .js files', () => {
       for (const hookName of PROFILES.strict) {
         const hookPath = join(HOOKS_DIR, `${hookName}.js`);
         expect(existsSync(hookPath), `Missing hook script: ${hookPath}`).toBe(true);
       }
     });

     it('all hook scripts are valid Node.js (no syntax errors)', () => {
       for (const hookName of PROFILES.strict) {
         const hookPath = join(HOOKS_DIR, `${hookName}.js`);
         // node --check validates syntax without executing
         expect(() => {
           execFileSync('node', ['--check', hookPath], { encoding: 'utf-8' });
         }).not.toThrow();
       }
     });

     it('all hook scripts exit 0 on empty stdin (fail-open or security-block)', () => {
       // block-no-verify: fail-open (exit 0)
       // protect-config: security hook (exit 2 on empty)
       // quality-gate, pre-compact-state, cost-tracker: fail-open (exit 0)
       const failOpenHooks = [
         'block-no-verify',
         'quality-gate',
         'pre-compact-state',
         'cost-tracker',
       ];
       for (const hookName of failOpenHooks) {
         const hookPath = join(HOOKS_DIR, `${hookName}.js`);
         try {
           execFileSync('node', [hookPath], {
             input: '',
             encoding: 'utf-8',
             stdio: ['pipe', 'pipe', 'pipe'],
           });
         } catch (err: any) {
           throw new Error(`${hookName} should exit 0 on empty stdin but exited ${err.status}`);
         }
       }
     });

     it('protect-config blocks on empty stdin (security hook)', () => {
       const hookPath = join(HOOKS_DIR, 'protect-config.js');
       try {
         execFileSync('node', [hookPath], {
           input: '',
           encoding: 'utf-8',
           stdio: ['pipe', 'pipe', 'pipe'],
         });
         throw new Error('protect-config should have exited with code 2');
       } catch (err: any) {
         expect(err.status).toBe(2);
       }
     });

     it('HOOK_SCRIPTS count matches profile strict count', () => {
       expect(HOOK_SCRIPTS).toHaveLength(PROFILES.strict.length);
     });

     it('each HOOK_SCRIPT name appears in at least one profile', () => {
       for (const script of HOOK_SCRIPTS) {
         const inSomeProfile = Object.values(PROFILES).some((hooks) => hooks.includes(script.name));
         expect(inSomeProfile, `${script.name} not in any profile`).toBe(true);
       }
     });
   });
   ```

2. Run test: `cd packages/cli && npx vitest run tests/hooks/integration.test.ts`
3. Observe: all tests pass
4. Commit: `test(hooks): add cross-hook integration tests`

---

### Task 8: Full test suite verification

**Depends on:** Task 7
**Files:** none (verification only)

1. Run all hook tests: `cd packages/cli && npx vitest run tests/hooks/`
2. Observe: all tests pass (profiles, 5 hook scripts, integration)
3. Run full CLI test suite: `cd packages/cli && npx vitest run`
4. Observe: no regressions (test count should be previous 1891 + new hook tests)
5. Verify all hook scripts have no external imports: `grep -r "require(" packages/cli/src/hooks/*.js | grep -v "require('fs')" | grep -v "require('path')" | grep -v "require('child_process')" | grep -v "require('os')"` should return nothing
6. Commit: `test(hooks): verify full test suite passes with hook scripts`
