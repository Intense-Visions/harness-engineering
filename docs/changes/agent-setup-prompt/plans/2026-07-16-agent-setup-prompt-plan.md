# Plan: Agent Setup Prompt (`prompt.md`)

**Date:** 2026-07-16 | **Spec:** `docs/changes/agent-setup-prompt/proposal.md` | **Tasks:** 11 | **Time:** ~42 min | **Integration Tier:** medium

## Goal

Ship a committed, generated `docs/agent-setup/prompt.md` — a fetchable, autonomous "install + init harness" instruction file — generated from a shared `SETUP_CLIENTS` descriptor that `harness setup` also consumes, and drift-gated by the existing `generate-docs --check` mechanism.

## Observable Truths (Acceptance Criteria)

Mapped to the spec's 7 success criteria (SC#):

1. **(SC1, SC5, SC7)** `docs/agent-setup/prompt.md` exists, references only real commands (`harness setup`/`init`/`validate`/`doctor`) and real plugin names (`harness-claude`/`harness-cursor`/`harness-gemini`/`harness-codex`), and contains an install branch for every client in `SETUP_CLIENTS` (Claude Code, Cursor, Gemini CLI, Codex, OpenCode, plain CLI) plus an explicit fallback path for unknown clients.
2. **(SC2)** The system shall present autonomous steps (install → `harness setup` → `harness init`) with no step asking the user to run a command, except the permitted `harness init` pause. Observable: grep of `prompt.md` shows "Complete every step yourself" framing and no "ask the user to run".
3. **(SC3)** When the generator runs, it produces the committed file byte-for-byte; `node scripts/generate-agent-setup-prompt.mjs --check` exits 0 on a fresh tree and exits 1 when `prompt.md` is stale.
4. **(SC4)** If a client is added to `SETUP_CLIENTS`, then `pnpm run generate-docs --check` (which now includes the prompt generator) shall exit non-zero until `prompt.md` is regenerated.
5. **(SC6)** The parity test passes: `SETUP_CLIENTS` covers exactly the clients `setup.ts` detects — `npx vitest run packages/cli/src/setup/clients.test.ts` is green.
6. **(D4 ADR)** `docs/knowledge/decisions/0073-setup-steps-generated-from-descriptor.md` exists and states setup-step docs are generated-from-code; new clients extend the descriptor.
7. **(README)** README "Quick Start" contains a one-line pointer to the raw-GitHub `prompt.md` URL.
8. **No behavior change to `harness setup`** — existing setup flow still detects the same 5 clients and configures MCP identically. Observable: `harness setup` test suite (if any) plus manual code review that `runMcpSetup` iterates the same client set.
9. `harness validate` passes (modulo pre-existing unrelated roadmap failures).

## File Map

- CREATE `packages/cli/src/setup/clients.ts` (shared `SETUP_CLIENTS` descriptor + `SetupClient` type)
- CREATE `packages/cli/src/setup/clients.test.ts` (parity + shape tests)
- MODIFY `packages/cli/src/commands/setup.ts` (consume `SETUP_CLIENTS` in `runMcpSetup`; ~lines 54-70)
- CREATE `scripts/generate-agent-setup-prompt.mjs` (generator with `--check`)
- CREATE `docs/agent-setup/prompt.md` (generated output — committed)
- MODIFY `package.json` (add `generate:agent-setup-prompt` script; wire into `generate-docs`)
- MODIFY `scripts/generate-docs.mjs` (invoke the prompt generator so `--check` covers it) **OR** MODIFY `.husky/pre-push` + `.github/workflows/ci.yml` (add a sibling `--check` step) — plan uses the `generate-docs.mjs` orchestration path (see Task 8)
- MODIFY `.prettierignore` (add `docs/agent-setup/prompt.md` if AUTO-GENERATED format trips prettier)
- MODIFY `README.md` (one-line Quick Start pointer)
- CREATE `docs/knowledge/decisions/0073-setup-steps-generated-from-descriptor.md` (ADR for D4)

## Key Technical Decision (spec left open)

**Descriptor loading from `.mjs`:** the spec offers (A) co-located `clients.json` re-exported by `clients.ts`, or (B) run the generator via `tsx` importing `clients.ts`. **This plan chooses (B).**

Justification (evidence `scripts/generate-plugin.mjs:33,52,60` — it invokes `node_modules/.bin/tsx` to run TS from mjs-land):

- Matches the established repo convention (`generate-plugin.mjs` already spawns `tsx`).
- Keeps a single authored source (the `.ts` module). Option A adds a `clients.json` that must stay in sync with the `.ts` re-export — reintroducing the exact drift D4 fights.
- `tsx` is already a devDependency (`package.json:61`); CI runs `pnpm build` before the docs check, so no new tooling.

Mechanism: the `.mjs` generator spawns `tsx` on a tiny inline loader (`packages/cli/src/setup/print-clients.ts`, created in Task 4) that `console.log(JSON.stringify(SETUP_CLIENTS))`. The generator parses that JSON and renders `prompt.md`. This keeps `prompt.md` truthful to the same module `setup.ts` imports.

## Skeleton

1. Shared descriptor + refactor + parity test (SC5, SC6, no-behavior-change) — 3 tasks, ~13 min
2. Generator + generated `prompt.md` (SC1, SC2, SC3, SC5, SC7) — 3 tasks, ~15 min
3. Pipeline wiring + prettierignore + drift gate (SC3, SC4) — 2 tasks, ~7 min
4. README pointer + ADR (D4, README) — 2 tasks, ~7 min

**Estimated total:** 11 tasks (10 core + 1 final validate), ~42 minutes.
_Skeleton approved: pending._

## Uncertainties

- [ASSUMPTION] `prompt.md`'s AUTO-GENERATED header may need a `.prettierignore` entry. The generator normalizes through prettier itself (like `generate-docs.mjs:495`), so ideally no ignore is needed. Task 8 tests both; Task 9 adds the ignore only if prettier and the generator disagree. If they agree, Task 9 is a no-op documented in the plan.
- [ASSUMPTION] No existing `setup.ts` test file (confirmed: none matches `setup*.test.ts`). "No behavior change" is verified by the new parity test + code review, not by a pre-existing setup suite.
- [DEFERRABLE] Exact prose wording of `prompt.md` is fixed by the generator template; minor copy can be tuned later without changing the drift contract.
- [DEFERRABLE] ADR number 0073 assumes no concurrent ADR lands first; the executor picks the next free number at write time.

---

## Tasks

### Task 1: Create the `SetupClient` type and `SETUP_CLIENTS` descriptor

**Depends on:** none | **Files:** `packages/cli/src/setup/clients.ts`

1. Create `packages/cli/src/setup/clients.ts` with the enriched descriptor. It must carry every field `setup.ts` needs (`name`, `detectDir`, `client`, `configTarget`) **plus** the install metadata (plugin names / npm path) that today lives only in `README.md`:

   ```ts
   /**
    * Single source of truth for per-client harness install + MCP-setup steps.
    * Consumed by `harness setup` (packages/cli/src/commands/setup.ts) AND by the
    * agent-setup prompt generator (scripts/generate-agent-setup-prompt.mjs).
    * Adding a client here is the ONLY place a new client must be registered —
    * the parity test and the prompt drift-gate enforce that both consumers stay
    * in sync. See ADR 0073.
    */
   export interface SetupClient {
     /** Human-readable client name, e.g. "Claude Code". */
     name: string;
     /** Home-relative dir whose presence detects the client, e.g. ".claude". */
     detectDir: string;
     /** Internal client key passed to setupMcp(), e.g. "claude". */
     client: string;
     /** Project-relative MCP config file this client writes, e.g. ".mcp.json". */
     configTarget: string;
     /** How this client installs harness. */
     install:
       | {
           kind: 'plugin';
           marketplace: 'Intense-Visions/harness-engineering';
           plugin: string;
         }
       | { kind: 'npm'; pkg: '@harness-engineering/cli'; setup: 'harness setup' };
   }

   const NPM_INSTALL = {
     kind: 'npm',
     pkg: '@harness-engineering/cli',
     setup: 'harness setup',
   } as const;

   export const SETUP_CLIENTS: SetupClient[] = [
     {
       name: 'Claude Code',
       detectDir: '.claude',
       client: 'claude',
       configTarget: '.mcp.json',
       install: {
         kind: 'plugin',
         marketplace: 'Intense-Visions/harness-engineering',
         plugin: 'harness-claude',
       },
     },
     {
       name: 'Cursor',
       detectDir: '.cursor',
       client: 'cursor',
       configTarget: '.cursor/mcp.json',
       install: {
         kind: 'plugin',
         marketplace: 'Intense-Visions/harness-engineering',
         plugin: 'harness-cursor',
       },
     },
     {
       name: 'Gemini CLI',
       detectDir: '.gemini',
       client: 'gemini',
       configTarget: '.gemini/settings.json',
       install: {
         kind: 'plugin',
         marketplace: 'Intense-Visions/harness-engineering',
         plugin: 'harness-gemini',
       },
     },
     {
       name: 'Codex CLI',
       detectDir: '.codex',
       client: 'codex',
       configTarget: '.codex/config.toml',
       install: {
         kind: 'plugin',
         marketplace: 'Intense-Visions/harness-engineering',
         plugin: 'harness-codex',
       },
     },
     {
       name: 'OpenCode',
       detectDir: '.config/opencode',
       client: 'opencode',
       configTarget: 'opencode.json',
       install: NPM_INSTALL,
     },
   ];
   ```

   > NOTE on `detectDir` for OpenCode: `setup.ts` currently builds this with `path.join('.config', 'opencode')`. Store it here as the POSIX string `'.config/opencode'` and have `setup.ts` split on `/` and re-join with `path.join` (Task 3) so behavior is identical cross-platform. The descriptor stays platform-neutral (it is also read by the generator).

2. Run: `npx tsc --noEmit -p packages/cli/tsconfig.json` (or `pnpm --filter @harness-engineering/cli typecheck`) — observe it compiles.
3. Run: `harness validate`
4. Commit: `feat(setup): add shared SETUP_CLIENTS descriptor`

---

### Task 2: Write the parity + shape test for `SETUP_CLIENTS` (TDD — write first, fail)

**Depends on:** Task 1 | **Files:** `packages/cli/src/setup/clients.test.ts`

1. Create `packages/cli/src/setup/clients.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { SETUP_CLIENTS, type SetupClient } from './clients';

   /**
    * These clients are the ones `harness setup` (runMcpSetup in
    * packages/cli/src/commands/setup.ts) detects and configures MCP for.
    * The parity test asserts SETUP_CLIENTS is exactly this set, so a client
    * added in one place cannot silently miss the other. If you add/remove a
    * detected client in setup.ts, update this list in the SAME commit.
    */
   const SETUP_DETECTED_CLIENT_KEYS = ['claude', 'cursor', 'gemini', 'codex', 'opencode'];

   describe('SETUP_CLIENTS', () => {
     it('covers exactly the clients harness setup detects', () => {
       const keys = SETUP_CLIENTS.map((c) => c.client).sort();
       expect(keys).toEqual([...SETUP_DETECTED_CLIENT_KEYS].sort());
     });

     it('gives every client a non-empty detectDir, name, and configTarget', () => {
       for (const c of SETUP_CLIENTS) {
         expect(c.name.length).toBeGreaterThan(0);
         expect(c.detectDir.length).toBeGreaterThan(0);
         expect(c.configTarget.length).toBeGreaterThan(0);
       }
     });

     it('references only real marketplace plugin names for plugin clients', () => {
       const allowed = new Set([
         'harness-claude',
         'harness-cursor',
         'harness-gemini',
         'harness-codex',
       ]);
       for (const c of SETUP_CLIENTS) {
         if (c.install.kind === 'plugin') {
           expect(c.install.marketplace).toBe('Intense-Visions/harness-engineering');
           expect(allowed.has(c.install.plugin)).toBe(true);
         } else {
           expect(c.install.pkg).toBe('@harness-engineering/cli');
           expect(c.install.setup).toBe('harness setup');
         }
       }
     });

     it('uses POSIX-style detectDir strings (no backslashes)', () => {
       for (const c of SETUP_CLIENTS) {
         expect(c.detectDir).not.toContain('\\');
       }
     });
   });
   ```

2. Run: `npx vitest run packages/cli/src/setup/clients.test.ts` — observe PASS (the descriptor from Task 1 already satisfies these). If any assertion fails, fix the descriptor, not the test.

   > This is a validation-style test (Task 1 authored the data); it is written immediately after and must be green before proceeding. It is the SC6 parity guarantee.

3. Run: `harness validate`
4. Commit: `test(setup): add SETUP_CLIENTS parity and shape tests`

---

### Task 3: Refactor `setup.ts` to consume `SETUP_CLIENTS` (no behavior change)

**Depends on:** Task 1, Task 2 | **Files:** `packages/cli/src/commands/setup.ts`

1. In `packages/cli/src/commands/setup.ts`, add the import near the other setup imports (after line 17):

   ```ts
   import { SETUP_CLIENTS } from '../setup/clients';
   ```

2. Replace the inline `clients` array declaration in `runMcpSetup` (current lines 54-70, the `const clients: Array<...> = [ ... ];` block) with a mapping from the shared descriptor that reconstructs the exact runtime shape (including the platform-correct `dir`):

   ```ts
   const clients: Array<{ name: string; dir: string; client: string; configTarget: string }> =
     SETUP_CLIENTS.map((c) => ({
       name: c.name,
       // detectDir is authored POSIX-style (e.g. ".config/opencode"); rebuild it
       // with path.join so detection is identical cross-platform to the old inline array.
       dir: path.join(...c.detectDir.split('/')),
       client: c.client,
       configTarget: c.configTarget,
     }));
   ```

   Leave the `for (const { name, dir, client, configTarget } of clients)` loop and everything below it unchanged.

3. Run: `npx vitest run packages/cli/src/setup/` and `pnpm --filter @harness-engineering/cli typecheck` — observe green.
4. Sanity-check no behavior change: confirm the 5 mapped entries (`Claude Code/.claude`, `Cursor/.cursor`, `Gemini CLI/.gemini`, `Codex CLI/.codex`, `OpenCode/.config/opencode`) match the original array exactly.
5. Run: `harness validate` and `harness check-deps`
6. Commit: `refactor(setup): consume SETUP_CLIENTS in runMcpSetup`

---

### Task 4: Add the tsx descriptor loader

**Depends on:** Task 1 | **Files:** `packages/cli/src/setup/print-clients.ts`

1. Create `packages/cli/src/setup/print-clients.ts` — a tiny stdout emitter the `.mjs` generator runs under `tsx` (mirrors how `generate-plugin.mjs` shells out to `tsx`):

   ```ts
   /**
    * Emits SETUP_CLIENTS as JSON on stdout. Run under tsx by the agent-setup
    * prompt generator (scripts/generate-agent-setup-prompt.mjs), which cannot
    * import a .ts module directly. Keeps clients.ts the single source of truth
    * (no duplicated clients.json). See ADR 0073.
    */
   import { SETUP_CLIENTS } from './clients';

   process.stdout.write(JSON.stringify(SETUP_CLIENTS, null, 2));
   ```

2. Verify it runs: `node_modules/.bin/tsx packages/cli/src/setup/print-clients.ts` — observe it prints the JSON array of 5 clients.
3. Run: `harness validate`
4. Commit: `feat(setup): add tsx JSON emitter for SETUP_CLIENTS`

---

### Task 5: Write the generator `scripts/generate-agent-setup-prompt.mjs`

**Depends on:** Task 4 | **Files:** `scripts/generate-agent-setup-prompt.mjs`

1. Create `scripts/generate-agent-setup-prompt.mjs`, styled after `scripts/generate-docs.mjs` (same AUTO-GENERATED header contract, same `--check` freshness mode, same prettier normalization). Full content:

   ````js
   #!/usr/bin/env node

   /**
    * Agent-setup prompt generator — emits docs/agent-setup/prompt.md from the
    * shared SETUP_CLIENTS descriptor (packages/cli/src/setup/clients.ts), so a
    * fetchable "install + init harness" instruction file cannot drift from what
    * `harness setup` actually does. See ADR 0073 and
    * docs/changes/agent-setup-prompt/proposal.md.
    *
    * Usage:
    *   node scripts/generate-agent-setup-prompt.mjs           # write prompt.md
    *   node scripts/generate-agent-setup-prompt.mjs --check    # fail if stale
    */

   import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
   import { resolve, join } from 'node:path';
   import { execFileSync } from 'node:child_process';

   const ROOT = resolve(import.meta.dirname, '..');
   const OUT_DIR = join(ROOT, 'docs', 'agent-setup');
   const OUT_FILE = join(OUT_DIR, 'prompt.md');
   const RAW_URL =
     'https://raw.githubusercontent.com/Intense-Visions/harness-engineering/main/docs/agent-setup/prompt.md';
   const HEADER =
     '<!-- AUTO-GENERATED — do not edit. Run `pnpm run generate-docs` to regenerate. -->\n\n';

   /** Load SETUP_CLIENTS by running the tsx emitter (mjs cannot import .ts). */
   function loadClients() {
     const tsx = join(ROOT, 'node_modules', '.bin', 'tsx');
     if (!existsSync(tsx)) {
       console.error(`Missing tsx at ${tsx}. Run \`pnpm install\` first.`);
       process.exit(1);
     }
     const emitter = join(ROOT, 'packages', 'cli', 'src', 'setup', 'print-clients.ts');
     const json = execFileSync(tsx, [emitter], { cwd: ROOT, encoding: 'utf-8' });
     return JSON.parse(json);
   }

   function renderPrompt(clients) {
     const pluginClients = clients.filter((c) => c.install.kind === 'plugin');
     const npmClients = clients.filter((c) => c.install.kind === 'npm');

     const lines = [];
     lines.push(HEADER);
     lines.push('# Set up Harness Engineering\n\n');
     lines.push(
       'Official instructions to install and initialize harness in this project. ' +
         'Complete every step yourself by running the commands directly. Do not ask ' +
         'the user to run them. These instructions are published at ' +
         `<${RAW_URL}>.\n\n`
     );

     lines.push('## 1. Install for your agent\n\n');
     for (const c of pluginClients) {
       lines.push(`### ${c.name}\n\n`);
       lines.push('```\n');
       lines.push(`/plugin marketplace add ${c.install.marketplace}\n`);
       lines.push(`/plugin install ${c.install.plugin}\n`);
       lines.push('```\n\n');
     }

     lines.push('### OpenCode / any other CLI\n\n');
     lines.push('```bash\n');
     lines.push('npm install -g @harness-engineering/cli && harness setup\n');
     lines.push('```\n\n');
     lines.push(
       'If the plugin marketplace is unavailable, fall back to the npm path above. ' +
         'If you cannot identify your client, use the npm + `harness setup` path — it ' +
         'auto-detects every supported client (' +
         clients.map((c) => c.name).join(', ') +
         ').\n\n'
     );

     lines.push('## 2. Initialize harness in the project\n\n');
     lines.push('```bash\n');
     lines.push('harness init\n');
     lines.push('```\n\n');
     lines.push(
       'Scaffolds harness into the project; skips cleanly if already initialized. ' +
         'This is the one place you may pause and ask the user — only if scaffolding ' +
         'needs a human decision.\n\n'
     );

     lines.push('## 3. Verify\n\n');
     lines.push('```bash\n');
     lines.push('harness validate\n');
     lines.push('harness doctor\n');
     lines.push('```\n\n');

     lines.push('## Success\n\n');
     lines.push(
       'Harness is installed and initialized. Try `/harness:onboarding` to get ' +
         'oriented. See the project README for full documentation.\n'
     );

     return lines.join('');
   }

   function main() {
     const isCheck = process.argv.includes('--check');
     const clients = loadClients();
     const content = renderPrompt(clients);

     if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
     writeFileSync(OUT_FILE, content);

     // Normalize through prettier so the --check is stable across environments
     // (same contract as generate-docs.mjs). If prettier reformats generated
     // output, the committed file already reflects that, so --check stays green.
     try {
       execFileSync('npx', ['prettier', '--write', 'docs/agent-setup/prompt.md'], {
         cwd: ROOT,
         stdio: 'pipe',
       });
     } catch {
       // prettier unavailable — skip normalization
     }

     if (isCheck) {
       try {
         execFileSync('git', ['diff', '--exit-code', 'docs/agent-setup/prompt.md'], {
           cwd: ROOT,
           stdio: 'pipe',
         });
         console.log('✓ docs/agent-setup/prompt.md is fresh.');
       } catch {
         console.error(
           '✗ docs/agent-setup/prompt.md is stale. Run `pnpm run generate-docs` to update.'
         );
         process.exit(1);
       }
     } else {
       console.log('✓ Wrote docs/agent-setup/prompt.md');
     }
   }

   main();
   ````

2. Run: `node scripts/generate-agent-setup-prompt.mjs` — observe it writes `docs/agent-setup/prompt.md` and prints the success line.
3. Run: `harness validate`
4. Commit: `feat(docs): add agent-setup prompt generator`

---

### Task 6: Verify and commit the generated `prompt.md`

**Depends on:** Task 5 | **Files:** `docs/agent-setup/prompt.md`

1. Read `docs/agent-setup/prompt.md` (written by Task 5) and verify against SC1/SC2/SC5/SC7:
   - Contains an install branch for Claude Code, Cursor, Gemini CLI, Codex CLI (plugin blocks) and an "OpenCode / any other CLI" npm branch.
   - Plugin names are exactly `harness-claude`, `harness-cursor`, `harness-gemini`, `harness-codex`.
   - Contains the fallback sentence for unknown clients ("If you cannot identify your client…").
   - Contains "Complete every step yourself" and the `harness init` pause caveat; no "ask the user to run".
   - Section 3 references `harness validate` and `harness doctor`.
2. Confirm idempotency: `node scripts/generate-agent-setup-prompt.mjs --check` — observe exit 0 (fresh).
3. Run: `harness validate`
4. Commit: `docs(agent-setup): add generated prompt.md`

   [checkpoint:human-verify] — Pause and show the rendered `prompt.md` to the human for copy/tone review before wiring the drift gate. Confirm the branching content reads well for a consuming agent.

---

### Task 7: Add the `generate:agent-setup-prompt` npm script

**Depends on:** Task 5 | **Files:** `package.json`

1. In `package.json` scripts, add alongside `generate-docs` (after line 30):

   ```json
   "generate:agent-setup-prompt": "node scripts/generate-agent-setup-prompt.mjs",
   ```

2. Run: `pnpm run generate:agent-setup-prompt` — observe it regenerates cleanly.
3. Run: `harness validate`
4. Commit: `chore(scripts): add generate:agent-setup-prompt script`

---

### Task 8: Wire the prompt generator into the `generate-docs` pipeline

**Depends on:** Task 5, Task 7 | **Files:** `scripts/generate-docs.mjs` | **Category:** integration

1. In `scripts/generate-docs.mjs`, at the end of `main()` (after the MCP tools block, before the `execSync('npx prettier --write docs/reference/*.md' ...)` normalization at ~line 493), invoke the prompt generator so `pnpm run generate-docs` and `pnpm run generate-docs --check` cover `prompt.md` too:

   ```js
   // Agent-setup prompt (generated from SETUP_CLIENTS; own --check contract).
   console.log('  Agent-setup prompt...');
   try {
     const promptArgs = isCheck
       ? ['scripts/generate-agent-setup-prompt.mjs', '--check']
       : ['scripts/generate-agent-setup-prompt.mjs'];
     execSync(`node ${promptArgs.join(' ')}`, { cwd: ROOT, stdio: 'inherit' });
     console.log('    ✓ docs/agent-setup/prompt.md');
   } catch (err) {
     if (isCheck) {
       // In --check mode the child already printed the staleness message and
       // exited non-zero; propagate the failure to fail the pre-push/CI gate.
       process.exit(1);
     }
     console.log(`    ⚠ Agent-setup prompt skipped: ${err.message}`);
   }
   ```

   Add `import { execSync }` — already imported at `generate-docs.mjs:18`. Place this block where `isCheck` is in scope (inside `main()`, which already declares `const isCheck` at line 459).

   > This satisfies D6/SC3/SC4: the existing `.husky/pre-push:17` (`pnpm run generate-docs --check`) and `.github/workflows/ci.yml:78` now transitively drift-gate `prompt.md` with zero new hook/CI edits.

2. Verify the wiring end-to-end:
   - `pnpm run generate-docs` — observe it prints the "Agent-setup prompt... ✓" line.
   - `pnpm run generate-docs --check` — observe exit 0 on a fresh tree.
   - Staleness proof: temporarily append a stray char to `docs/agent-setup/prompt.md`, run `pnpm run generate-docs --check`, observe exit 1, then restore with `git checkout docs/agent-setup/prompt.md`.
3. Run: `harness validate`
4. Commit: `chore(docs): drift-gate agent-setup prompt via generate-docs`

---

### Task 9: Add `prompt.md` to `.prettierignore` only if the format trips prettier

**Depends on:** Task 8 | **Files:** `.prettierignore` | **Category:** integration

1. Determine whether prettier and the generator disagree on `docs/agent-setup/prompt.md`:
   - Run `npx prettier --check docs/agent-setup/prompt.md`.
   - If it reports the file is already formatted (exit 0), the generator's own prettier normalization (Task 5) is sufficient — **this task is a no-op**; record "no prettierignore entry needed" in the commit message and skip to step 3 with a docs-only note (no file change), or omit the commit entirely.
2. If prettier reports a diff it cannot reconcile with the generator (exit non-zero and re-running the generator does not converge), add to `.prettierignore` under a comment mirroring the existing generated-file entries:

   ```
   # Generated agent-setup prompt: the generator owns the AUTO-GENERATED format
   # and normalizes it; keep repo-wide prettier from re-touching it.
   docs/agent-setup/prompt.md
   ```

   Then confirm `pnpm run format:check` passes.

3. Run: `harness validate`
4. Commit (only if `.prettierignore` changed): `chore(prettier): ignore generated agent-setup prompt`

---

### Task 10: Add README Quick Start pointer

**Depends on:** Task 6 | **Files:** `README.md` | **Category:** integration

1. In `README.md`, inside the `## Quick Start` section (starts at line 36, before the "Pick the install path…" bullets at line 38-45), add a one-line pointer to the agent-driven setup file:

   ```markdown
   > **Using a coding agent?** Point it at the autonomous setup prompt and let it install + initialize harness for you: `https://raw.githubusercontent.com/Intense-Visions/harness-engineering/main/docs/agent-setup/prompt.md` — "follow the instructions at this URL".
   ```

   Insert it as the first line under `## Quick Start` (line 37 area), above "Pick the install path that matches how you use harness:".

2. Run: `pnpm run format:check` (README is prettier-managed) — observe it passes, or run `pnpm run format` to normalize.
3. Run: `harness validate`
4. Commit: `docs(readme): link agent-setup prompt from Quick Start`

---

### Task 11: Write the D4 ADR

**Depends on:** Task 1 | **Files:** `docs/knowledge/decisions/0073-setup-steps-generated-from-descriptor.md` | **Category:** integration

1. Confirm the next free ADR number: `ls docs/knowledge/decisions/ | sort | tail -3`. Use the next integer (expected `0073`; bump if a concurrent ADR landed).
2. Create `docs/knowledge/decisions/0073-setup-steps-generated-from-descriptor.md`, matching the repo ADR frontmatter shape (evidence `0072-autonomous-local-decisions.md:1-8`):

   ```markdown
   ---
   number: 0073
   title: Setup-step docs are generated from a shared client descriptor
   date: 2026-07-16
   status: accepted
   tier: medium
   source: docs/changes/agent-setup-prompt/proposal.md
   ---

   ## Context

   Two consumers describe how a client installs harness: `harness setup`
   (`packages/cli/src/commands/setup.ts`, which detects clients and wires MCP)
   and human-facing install prose (`README.md`, and now the agent-setup
   `prompt.md`). Historically the `setup.ts` client array carried
   `name`/`dir`/`client`/`configTarget` but **no** plugin names — those lived
   only in `README.md`, so the two representations could drift. The agent-setup
   prompt (`docs/agent-setup/prompt.md`) is a fetchable, agent-executable
   installer; if it misdescribes what `harness setup` does, an agent installs
   the wrong thing.

   ## Decision

   Setup-step documentation is **generated from code**, not hand-maintained in
   prose. A single enriched descriptor, `SETUP_CLIENTS` in
   `packages/cli/src/setup/clients.ts`, is the sole source of truth for
   per-client install + MCP-setup steps. `harness setup` consumes it (via the
   subset of fields it needs), and the generator
   `scripts/generate-agent-setup-prompt.mjs` reads it (via a `tsx` JSON emitter,
   `print-clients.ts`) to produce `docs/agent-setup/prompt.md`. The generated
   file is drift-gated by the existing `generate-docs --check` mechanism, and a
   vitest parity test asserts `SETUP_CLIENTS` matches the clients `setup.ts`
   detects.

   **Consequence for contributors:** to add or change a supported client, edit
   `SETUP_CLIENTS` — never hand-edit `prompt.md` or duplicate install steps in
   prose. The freshness gate blocks any push whose `prompt.md` was not
   regenerated after a descriptor change.

   ## Consequences

   **Positive:** one source of truth; the prompt cannot misdescribe `harness
   setup`; new clients are a one-place edit enforced by the parity test + drift
   gate.

   **Negative:** the generator depends on `tsx` to read a `.ts` module from an
   `.mjs` script (mirrors `scripts/generate-plugin.mjs`); `prompt.md` is a
   generated artifact and must not be hand-edited.

   **Neutral:** an alternative (a co-located `clients.json` re-exported by
   `clients.ts`) was rejected because it reintroduces a second file that must
   stay in sync — the exact drift this decision removes.

   ## Related

   - Spec: `docs/changes/agent-setup-prompt/proposal.md` (decisions D1–D6)
   - Generator convention: `scripts/generate-plugin.mjs` (tsx invocation)
   - Drift gate: `scripts/generate-docs.mjs`, `.husky/pre-push`, `.github/workflows/ci.yml`
   ```

3. Run: `pnpm run format:check` (ADRs are prettier-managed) — observe pass or `pnpm run format`.
4. Run: `harness validate`
5. Commit: `docs(adr): setup-step docs generated from SETUP_CLIENTS (0073)`

---

### Final validation (folded into last task)

After Task 11, run the full local gate before handing off to a push:

1. `pnpm run generate-docs --check` — prompt.md fresh (exit 0).
2. `npx vitest run packages/cli/src/setup/` — parity green.
3. `pnpm --filter @harness-engineering/cli typecheck` — clean.
4. `pnpm run format:check` — clean.
5. `harness validate` — passes (pre-existing roadmap failures are unrelated and out of scope).

## Change Specifications

- **[ADDED]** `SETUP_CLIENTS` shared descriptor + `SetupClient` type (`packages/cli/src/setup/clients.ts`).
- **[ADDED]** Agent-setup prompt generator + generated `docs/agent-setup/prompt.md`, drift-gated.
- **[ADDED]** ADR 0073 (setup-steps-generated-from-descriptor).
- **[MODIFIED]** `runMcpSetup` in `setup.ts` sources its client list from `SETUP_CLIENTS` (no behavior change).
- **[MODIFIED]** `scripts/generate-docs.mjs` orchestrates the prompt generator so pre-push/CI `--check` covers it.
- **[MODIFIED]** `README.md` Quick Start gains an agent-setup pointer.

## Notes for the Executor

- Fresh worktree: run `pnpm install && pnpm build` (or `turbo build`) before Task 2/Task 3 tests and any `tsx`/typecheck step resolve workspace packages (see MEMORY: fresh-worktree-build-and-validate).
- Commit after every task — concurrent automation may reset the worktree HEAD (see MEMORY: worktree-head-reset-and-dist-wipe).
- Do NOT hand-edit `docs/agent-setup/prompt.md`; always regenerate.
- Pre-push runs `format:check` on the whole tree; stash unrelated WIP (`.harness/e2e/` is untracked) if it trips the gate.
