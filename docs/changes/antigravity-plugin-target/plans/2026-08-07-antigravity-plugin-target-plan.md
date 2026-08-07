# Plan: `antigravity` (agy) plugin-generator target — Phase 1

**Date:** 2026-08-07 | **Spec:** `docs/changes/antigravity-plugin-target/proposal.md` | **Tasks:** 6 | **Time:** ~28 min | **Integration Tier:** medium

## Goal

Add an `antigravity` target to the plugin generator so agy users get harness skills, `/harness:*` slash commands, persona agents, and the harness MCP server — produced by the same generator that serves claude/cursor/gemini/codex, and wired into `harness setup` per ADR 0073.

## Observable Truths (Acceptance Criteria)

1. When `pnpm generate:plugin --target antigravity` runs, the system emits `commands/*.toml` and `agents/*.md` under `.antigravity-extension/`, and leaves the hand-maintained `config/mcp_config.json` + `plugin.json` + `marketplace.json` in place. (Truth for Tasks 1-3.)
2. When `pnpm generate:plugin:check` runs, it exits 0 with the antigravity target wired into `:all` and `:check`. (Task 1 + 3.)
3. Existing targets' artifacts remain intact (`.claude-plugin/`, `.cursor-plugin/`, `.gemini-extension/`, `.codex-plugin/` not emptied) — the change is purely additive. (Task 3 + 5.)
4. `node --test tests/scripts/plugin-antigravity-target.test.mjs` passes: it asserts the antigravity config shape and that the emitted `commands/`+`agents/` structure exists and siblings are intact. (Task 5.)
5. The pin-sync test (`tests/scripts/plugin-pin-sync.test.mjs`) covers the new `config/mcp_config.json` pin; the clients parity test (`clients.test.ts`) and setup tests (`setup.test.ts`) cover the new `antigravity` client with updated counts. (Tasks 1, 2, 4.)
6. `pnpm exec harness generate-docs --check` is clean (regenerated `docs/agent-setup/prompt.md` + `docs/reference/cli-commands.md`). (Task 6.)

## Change Specification (deltas to existing behavior)

- **[ADDED]** `PLUGIN_CONFIGS.antigravity` target in `scripts/lib/plugin-config.mjs`.
- **[ADDED]** `pnpm generate:plugin:antigravity` script; **[MODIFIED]** `generate:plugin:all` and `generate:plugin:check` to include it.
- **[MODIFIED]** `MANIFEST_PATHS` in `scripts/sync-plugin-pin.mjs` gains `.antigravity-extension/config/mcp_config.json`.
- **[ADDED]** hand-authored `.antigravity-extension/{config/mcp_config.json, plugin.json, marketplace.json}`.
- **[ADDED]** generated `.antigravity-extension/commands/*.toml` + `.antigravity-extension/agents/*.md`.
- **[ADDED]** `antigravity` entry in `SETUP_CLIENTS` (`packages/cli/src/setup/clients.ts`); **[MODIFIED]** `setupMcp()` gains an `antigravity` branch + `--client` option help string.
- **[MODIFIED]** `clients.test.ts` (parity list + allowed-plugin set) and `setup.test.ts` (step counts, setupMcp call counts, mock detection).
- **[ADDED]** `tests/scripts/plugin-antigravity-target.test.mjs`.
- **[MODIFIED]** (regenerated, not hand-edited) `docs/agent-setup/prompt.md`, `docs/reference/cli-commands.md`; **[ADDED]** a changeset.

## File Map

- MODIFY `scripts/lib/plugin-config.mjs` — add `antigravity` key to `PLUGIN_CONFIGS`
- MODIFY `package.json` — add `generate:plugin:antigravity`; wire into `:all` + `:check`
- MODIFY `scripts/sync-plugin-pin.mjs` — add `.antigravity-extension/config/mcp_config.json` to `MANIFEST_PATHS`
- CREATE `.antigravity-extension/config/mcp_config.json` (hand-authored)
- CREATE `.antigravity-extension/plugin.json` (hand-authored)
- CREATE `.antigravity-extension/marketplace.json` (hand-authored)
- CREATE `.antigravity-extension/commands/*.toml` (generated — ~53 files)
- CREATE `.antigravity-extension/agents/*.md` (generated — ~16 files)
- MODIFY `packages/cli/src/setup/clients.ts` — add `antigravity` SetupClient
- MODIFY `packages/cli/src/commands/setup-mcp.ts` — add `antigravity` branch + `--client` help string
- MODIFY `packages/cli/src/setup/clients.test.ts` — parity keys + allowed plugin names
- MODIFY `packages/cli/tests/commands/setup.test.ts` — step counts, setupMcp call counts, mock dirs
- CREATE `tests/scripts/plugin-antigravity-target.test.mjs`
- MODIFY `docs/agent-setup/prompt.md` (regenerated)
- MODIFY `docs/reference/cli-commands.md` (regenerated)
- CREATE `.changeset/antigravity-plugin-target.md`

## Grounding evidence (verified `file:line`)

- `scripts/lib/plugin-config.mjs:54-75` — the `gemini` entry that `antigravity` mirrors; the one divergence is `agentPlatform` (`undefined` → `'gemini-cli'`) and `generateAgents` (`false` → `true`).
- `scripts/generate-plugin.mjs:171` — agent output staging dir is `join(stagingDir, config.agentPlatform)`; with `agentPlatform: 'gemini-cli'` the gemini-cli renderer emits `.md`. `:156-201` — `generateAgents()` writes to `<pluginDir>/agents/`.
- `scripts/generate-plugin.mjs:95-152` — `generateCommands()` writes `.toml` (no prettier for TOML) to `<pluginDir>/commands/`.
- `scripts/sync-plugin-pin.mjs:37-42` — `MANIFEST_PATHS` array. `:59-73` — `findPinnedVersion` reads `manifest.mcpServers.harness.args` and prefers the token after `-p`; the hand-authored `mcp_config.json` must carry that exact shape.
- CLI version is **10.2.0** (`packages/cli/package.json`), so the hand-authored pin must be `@harness-engineering/cli@10.2.0` or `tests/scripts/plugin-pin-sync.test.mjs:40-45` fails.
- `packages/cli/src/setup/clients.ts:34-86` — `SETUP_CLIENTS` array (order: claude, gemini, codex, cursor, opencode). Append `antigravity` **at the end** to minimize step-index churn (see Task 4 note).
- `packages/cli/src/commands/setup-mcp.ts:246-260` — `configureMcpServer(configPath)` writes `{ mcpServers: { harness: HARNESS_MCP_ENTRY } }` (idempotent). `:275-344` — `setupMcp()` per-client branches. `:400-404` — `--client` help string lists the valid clients.
- `packages/cli/src/setup/clients.test.ts:11` — `SETUP_DETECTED_CLIENT_KEYS`; `:28-33` — allowed marketplace plugin-name set.
- `packages/cli/tests/commands/setup.test.ts:84-94` — `mockAllClientsExist`; `:112,124,155` — `toHaveLength(12)` / `setupMcp … Times(5)`; `:181-182` — `mcpSteps` length 5.
- `packages/cli/src/commands/setup.ts:55-86` — `runMcpSetup` iterates `SETUP_CLIENTS` in array order; detection is `fs.existsSync(path.join(os.homedir(), detectDir))`, so `.gemini/antigravity-cli` resolves to `~/.gemini/antigravity-cli`.
- `scripts/generate-agent-setup-prompt.mjs:44,84-104` — prompt lists every client name and one `/plugin` pair per plugin client, sourced from `clients.ts`; adding antigravity changes `docs/agent-setup/prompt.md`.
- Sibling manifests for shape reference: `.gemini-extension/gemini-extension.json`, `.gemini-extension/marketplace.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`.
- `harness validate` and `harness check-deps` both pass on the worktree at plan time.

## Skeleton

Standard rigor, 6 tasks (< 8 threshold) — skeleton not required. Ordered groups:
1. Config + generator wiring (Task 1)
2. Hand-authored manifests (Task 2)
3. Generate artifacts (Task 3)
4. Setup client wiring + test updates (Task 4)
5. Target test (Task 5)
6. Docs regen + changeset (Task 6)

## Task ownership / parallelization

Tasks are almost entirely **serial**: Task 1 and Task 3 both touch generator config; Task 3 depends on Tasks 1+2; Task 6 depends on Task 4 (prompt reads `clients.ts`). Task 5 could technically run after Task 3 but asserts the generated tree, so keep it after Task 4 to avoid churn. No two tasks safely parallelize — `plugin-config.mjs`, `package.json`, and `clients.ts`/`setup-mcp.ts` chains create ordering edges. Execute in numeric order.

---

## Tasks

### Task 1: Add `PLUGIN_CONFIGS.antigravity` + wire pnpm scripts + MANIFEST_PATHS

**Depends on:** none | **Files:** `scripts/lib/plugin-config.mjs`, `package.json`, `scripts/sync-plugin-pin.mjs` | **Category:** implementation

1. In `scripts/lib/plugin-config.mjs`, add a new key to `PLUGIN_CONFIGS` immediately after the `gemini` block (before `codex`). It mirrors `gemini` except `agentPlatform` and `generateAgents`:

   ```js
   antigravity: {
     label: 'Antigravity CLI',
     pluginDir: '.antigravity-extension',
     slashCommandsPlatform: 'gemini-cli',
     // KEY divergence from the gemini extension: agy reads persona agents from
     // ~/.gemini/agents/*.md, so we DO render agents (the gemini-cli agent
     // renderer emits .md). The gemini extension target sets this to undefined.
     agentPlatform: 'gemini-cli',
     // Reuse the gemini-cli skill tree so generated command TOMLs embed
     // gemini-cli-relative reference paths; agy shares ~/.gemini/.
     skillsDir: 'agents/skills/gemini-cli',
     // Hooks deferred to Phase 2 — agy's stdin/stdout decision contract differs
     // fundamentally from Claude Code's exit-code contract.
     hooksCommandTemplate: undefined,
     cursorMode: undefined,
     commandExt: '.toml',
     generateCommands: true,
     generateAgents: true,
     generateHooks: false,
   },
   ```

2. In `package.json` `scripts`, add after `generate:plugin:codex`:

   ```json
   "generate:plugin:antigravity": "node scripts/generate-plugin.mjs --target antigravity",
   ```

   Then update the two aggregate scripts to append antigravity:

   ```json
   "generate:plugin:all": "pnpm generate:plugin:claude && pnpm generate:plugin:cursor && pnpm generate:plugin:gemini && pnpm generate:plugin:codex && pnpm generate:plugin:antigravity",
   "generate:plugin:check": "node scripts/generate-plugin.mjs --target claude --check && node scripts/generate-plugin.mjs --target cursor --check && node scripts/generate-plugin.mjs --target gemini --check && node scripts/generate-plugin.mjs --target codex --check && node scripts/generate-plugin.mjs --target antigravity --check",
   ```

3. In `scripts/sync-plugin-pin.mjs`, add to `MANIFEST_PATHS` (keep it in the existing order — this is the empirically-verified agy MCP file, not the manifest):

   ```js
   '.antigravity-extension/config/mcp_config.json',
   ```

4. Verify config loads and the script is present (does not yet run the generator — manifests do not exist until Task 2):

   ```bash
   source ~/.nvm/nvm.sh && nvm use 22
   node -e "import('./scripts/lib/plugin-config.mjs').then(m => { const c = m.getConfig('antigravity'); if (c.agentPlatform !== 'gemini-cli' || c.generateAgents !== true) throw new Error('bad config'); console.log('OK antigravity config'); })"
   node -e "import('./scripts/sync-plugin-pin.mjs').then(m => { if (!m.MANIFEST_PATHS.includes('.antigravity-extension/config/mcp_config.json')) throw new Error('missing pin path'); console.log('OK pin path'); })"
   ```

5. Run: `pnpm exec harness validate`
6. Commit: `feat(plugin): register antigravity generator target + pnpm scripts + pin path`

---

### Task 2: Hand-author `.antigravity-extension/{config/mcp_config.json, plugin.json, marketplace.json}`

**Depends on:** Task 1 | **Files:** `.antigravity-extension/config/mcp_config.json`, `.antigravity-extension/plugin.json`, `.antigravity-extension/marketplace.json` | **Category:** implementation

1. Create `.antigravity-extension/config/mcp_config.json` — the empirically-verified agy MCP location, shaped `{ mcpServers: { harness: … } }`, using the repo's pinned npx form (matches every sibling; pin must equal current CLI version **10.2.0** so `plugin-pin-sync.test.mjs` passes):

   ```json
   {
     "mcpServers": {
       "harness": {
         "command": "npx",
         "args": ["-y", "-p", "@harness-engineering/cli@10.2.0", "harness-mcp"]
       }
     }
   }
   ```

2. Create `.antigravity-extension/plugin.json` mirroring `.gemini-extension/gemini-extension.json` but named `harness-antigravity`, declaring the agents surface agy supports. Do NOT put `mcpServers` here (agy ignores MCP in the manifest — it lives in `config/mcp_config.json`):

   ```json
   {
     "name": "harness-antigravity",
     "version": "0.1.0",
     "description": "Harness for Antigravity CLI (agy) — /harness:* slash commands, persona agents (~/.gemini/agents/*.md), and the harness MCP server. Shares the ~/.gemini/ root with Gemini CLI but is a distinct target: agy reads persona agents and MCP from locations gemini-cli does not. Sibling plugins exist for Claude Code, Cursor, Gemini CLI, and Codex.",
     "contextFileName": "GEMINI.md",
     "commands": "./commands/",
     "agents": "./agents/"
   }
   ```

   Note: keep `commands`/`agents` as directory references (agy reads `~/.gemini/commands/**` and `~/.gemini/agents/*.md`). If the reviewer prefers the explicit per-file `agents` array form used by `.claude-plugin/plugin.json`, that is acceptable — but the directory form avoids re-listing all 16 generated files here. Flag this shape choice for review at commit time.

3. Create `.antigravity-extension/marketplace.json` mirroring `.gemini-extension/marketplace.json`, adding the `harness-antigravity` plugin entry and mentioning it in the description:

   ```json
   {
     "name": "harness",
     "owner": {
       "name": "Intense Visions",
       "url": "https://github.com/Intense-Visions"
     },
     "description": "Harness — agent-first development toolkit. The `harness-antigravity` extension ships /harness:* slash commands, persona agents, and the harness MCP server for the Antigravity CLI (agy). Sibling plugins (`harness-claude`, `harness-cursor`, `harness-gemini`, `harness-codex`) target the other major AI coding tools.",
     "plugins": [
       {
         "name": "harness-antigravity",
         "source": ".",
         "description": "Harness for Antigravity CLI (agy): every /harness:* slash command, persona agents (agy reads ~/.gemini/agents/*.md), and the harness MCP server (declared in config/mcp_config.json — agy ignores MCP in the manifest). Lifecycle hooks are deferred to a follow-up phase.",
         "version": "0.1.0",
         "author": {
           "name": "Intense Visions",
           "url": "https://github.com/Intense-Visions"
         },
         "homepage": "https://github.com/Intense-Visions/harness-engineering",
         "license": "MIT",
         "keywords": [
           "harness",
           "agent-first",
           "skills",
           "slash-commands",
           "agents",
           "mcp",
           "antigravity",
           "agy",
           "gemini-cli",
           "validation",
           "scaffolding"
         ]
       }
     ]
   }
   ```

4. Verify JSON validity and that the pin-sync helper finds the pin at the current CLI version:

   ```bash
   source ~/.nvm/nvm.sh && nvm use 22
   node -e "for (const f of ['.antigravity-extension/config/mcp_config.json','.antigravity-extension/plugin.json','.antigravity-extension/marketplace.json']) { JSON.parse(require('fs').readFileSync(f,'utf8')); console.log('valid', f); }"
   node --test tests/scripts/plugin-pin-sync.test.mjs
   ```

5. Run: `pnpm exec harness validate`
6. Commit: `feat(plugin): hand-author antigravity manifests + mcp_config`

---

### Task 3: Run the generator to emit `commands/*.toml` + `agents/*.md`

**Depends on:** Task 2 | **Files:** `.antigravity-extension/commands/*.toml`, `.antigravity-extension/agents/*.md` | **Category:** implementation

`[checkpoint:human-verify]` — This emits a large generated tree (~53 command TOMLs + ~16 agent `.md`). Pause after generation, show `git status --short .antigravity-extension/` and confirm the diff is **additive only** and the sibling target dirs (`.claude-plugin/`, `.cursor-plugin/`, `.gemini-extension/`, `.codex-plugin/`) are untouched.

1. Run the generator (write mode):

   ```bash
   source ~/.nvm/nvm.sh && nvm use 22
   pnpm generate:plugin --target antigravity
   ```

   Expected output: `Wrote N commands to …/.antigravity-extension/commands` and `Wrote N agents to …/.antigravity-extension/agents`.

2. Verify the emitted tree exists and siblings are intact:

   ```bash
   test -d .antigravity-extension/commands && ls .antigravity-extension/commands/*.toml >/dev/null && echo "OK commands"
   test -d .antigravity-extension/agents && ls .antigravity-extension/agents/*.md >/dev/null && echo "OK agents"
   git status --short .claude-plugin .cursor-plugin .gemini-extension .codex-plugin
   ```

   The `git status` for the four sibling dirs must be empty (no modifications).

3. Confirm check mode is clean and the target is wired into the aggregate check:

   ```bash
   pnpm generate:plugin --target antigravity --check
   pnpm generate:plugin:check
   ```

   Both must exit 0.

4. `[checkpoint:human-verify]` Present `git status --short` for `.antigravity-extension/` and the empty sibling status; wait for confirmation the generated tree is expected and additive-only.
5. Run: `pnpm exec harness validate`
6. Commit: `feat(plugin): generate antigravity commands + agents`

---

### Task 4: Register the `antigravity` setup client + `setupMcp` branch + update parity/setup tests

**Depends on:** Task 1 | **Files:** `packages/cli/src/setup/clients.ts`, `packages/cli/src/commands/setup-mcp.ts`, `packages/cli/src/setup/clients.test.ts`, `packages/cli/tests/commands/setup.test.ts` | **Category:** implementation

**Ordering note:** Append the antigravity client at the **END** of `SETUP_CLIENTS` (after `opencode`). `runMcpSetup` iterates in array order and `setup.test.ts` asserts specific step indices; appending last means only the trailing `tier0`/`hooks` step indices shift by one, and existing `steps[3..6]` assertions stay valid.

1. In `packages/cli/src/setup/clients.ts`, append to `SETUP_CLIENTS` after the `OpenCode` entry:

   ```ts
   {
     name: 'Antigravity CLI',
     // agy-specific marker under the shared ~/.gemini/ root — distinct from
     // gemini's ".gemini" so a plain gemini install is not misdetected as agy.
     detectDir: '.gemini/antigravity-cli',
     client: 'antigravity',
     // Empirically-verified agy MCP location — NOT settings.json (agy ignores it).
     configTarget: '.gemini/config/mcp_config.json',
     install: {
       kind: 'plugin',
       marketplace: 'Intense-Visions/harness-engineering',
       plugin: 'harness-antigravity',
     },
   },
   ```

2. In `packages/cli/src/commands/setup-mcp.ts`, add an `antigravity` branch inside `setupMcp()`. Place it after the `gemini` branch (it reuses the shared `configureMcpServer` helper, which writes `{ mcpServers: { harness: HARNESS_MCP_ENTRY } }`):

   ```ts
   if (client === 'all' || client === 'antigravity') {
     const configPath = path.join(cwd, '.gemini', 'config', 'mcp_config.json');
     if (configureMcpServer(configPath)) {
       configured.push('Antigravity CLI');
     } else {
       skipped.push('Antigravity CLI');
     }
   }
   ```

   Also update the `--client` option help string in `createSetupMcpCommand()` to include `antigravity`:

   ```ts
   'Client to configure (claude, gemini, codex, cursor, opencode, antigravity, all)',
   ```

3. In `packages/cli/src/setup/clients.test.ts`:
   - Add `'antigravity'` to `SETUP_DETECTED_CLIENT_KEYS`:
     ```ts
     const SETUP_DETECTED_CLIENT_KEYS = ['claude', 'cursor', 'gemini', 'codex', 'opencode', 'antigravity'];
     ```
   - Add `'harness-antigravity'` to the `allowed` set in the "references only real marketplace plugin names" test:
     ```ts
     const allowed = new Set([
       'harness-claude',
       'harness-cursor',
       'harness-gemini',
       'harness-codex',
       'harness-antigravity',
     ]);
     ```

4. In `packages/cli/tests/commands/setup.test.ts`, update the counts that grow by one client:
   - `mockAllClientsExist()` — add antigravity's marker dir:
     ```ts
     if (s === path.join(os.homedir(), '.gemini', 'antigravity-cli')) return true;
     ```
   - "passes all steps …" test: `expect(steps).toHaveLength(12)` → `13`; `expect(setupMcp).toHaveBeenCalledTimes(5)` → `6`; the `steps[7]` MCP-integrations assertion moves to `steps[8]` (one extra client step pushes `tier0Result` down by one).
   - "warns when a client directory is not detected" test: `expect(steps).toHaveLength(12)` → `13`. (Existing `steps[3..6]` assertions stay; antigravity is a new trailing warn at `steps[7]`. `setupMcp` still called once for claude.)
   - "warns when no clients are detected" test: `expect(mcpSteps).toHaveLength(5)` → `6`.
   - "is idempotent" test needs no change (compares lengths symmetrically).

   > Before hardcoding the shifted index in the "passes all steps" test, run the file once and read the actual failure to confirm the MCP-integrations step lands at index 8 (the step order is node, slash, then one step per SETUP_CLIENTS entry, then tier0). Adjust to the observed index rather than assuming.

5. Verify:

   ```bash
   source ~/.nvm/nvm.sh && nvm use 22
   pnpm --filter @harness-engineering/cli exec vitest run src/setup/clients.test.ts tests/commands/setup.test.ts
   ```

6. Run: `pnpm exec harness validate`
7. Commit: `feat(setup): register antigravity client + setupMcp branch`

---

### Task 5: Add `tests/scripts/plugin-antigravity-target.test.mjs`

**Depends on:** Task 4 | **Files:** `tests/scripts/plugin-antigravity-target.test.mjs` | **Category:** implementation

1. Create `tests/scripts/plugin-antigravity-target.test.mjs` (Node test runner, matching the style of the other `tests/scripts/*.test.mjs`). It asserts (a) the config shape, (b) the emitted tree exists, (c) the hand-authored manifests are present, and (d) siblings are intact:

   ```js
   import { test } from 'node:test';
   import assert from 'node:assert/strict';
   import { readFileSync, existsSync, readdirSync } from 'node:fs';
   import path from 'node:path';
   import { fileURLToPath } from 'node:url';
   import { getConfig } from '../../scripts/lib/plugin-config.mjs';
   import { MANIFEST_PATHS } from '../../scripts/sync-plugin-pin.mjs';

   const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
   const EXT = path.join(ROOT, '.antigravity-extension');

   test('antigravity config mirrors gemini but renders agents', () => {
     const c = getConfig('antigravity');
     assert.equal(c.pluginDir, '.antigravity-extension');
     assert.equal(c.slashCommandsPlatform, 'gemini-cli');
     assert.equal(c.agentPlatform, 'gemini-cli'); // the KEY divergence from gemini
     assert.equal(c.skillsDir, 'agents/skills/gemini-cli');
     assert.equal(c.commandExt, '.toml');
     assert.equal(c.generateCommands, true);
     assert.equal(c.generateAgents, true);
     assert.equal(c.generateHooks, false);
     assert.equal(c.hooksCommandTemplate, undefined);
   });

   test('hand-authored manifests exist with the verified MCP location + shape', () => {
     const mcp = JSON.parse(readFileSync(path.join(EXT, 'config', 'mcp_config.json'), 'utf8'));
     assert.ok(mcp.mcpServers?.harness?.args?.some((a) => String(a).startsWith('@harness-engineering/cli@')),
       'mcp_config.json must carry the pinned npx form');
     const plugin = JSON.parse(readFileSync(path.join(EXT, 'plugin.json'), 'utf8'));
     assert.equal(plugin.name, 'harness-antigravity');
     assert.equal(plugin.mcpServers, undefined, 'MCP must not live in the manifest (agy ignores it)');
     const market = JSON.parse(readFileSync(path.join(EXT, 'marketplace.json'), 'utf8'));
     assert.ok(market.plugins?.some((p) => p.name === 'harness-antigravity'));
   });

   test('mcp_config.json is registered for pin-sync', () => {
     assert.ok(MANIFEST_PATHS.includes('.antigravity-extension/config/mcp_config.json'));
   });

   test('generated commands + agents trees exist', () => {
     const cmds = readdirSync(path.join(EXT, 'commands')).filter((f) => f.endsWith('.toml'));
     assert.ok(cmds.length > 0, 'expected commands/*.toml');
     const agents = readdirSync(path.join(EXT, 'agents')).filter((f) => f.endsWith('.md'));
     assert.ok(agents.length > 0, 'expected agents/*.md');
   });

   test('sibling target dirs remain present (additive-only change)', () => {
     for (const dir of ['.claude-plugin', '.cursor-plugin', '.gemini-extension', '.codex-plugin']) {
       assert.ok(existsSync(path.join(ROOT, dir)), `${dir} must still exist`);
     }
   });
   ```

2. Verify:

   ```bash
   source ~/.nvm/nvm.sh && nvm use 22
   node --test tests/scripts/plugin-antigravity-target.test.mjs
   ```

3. Run: `pnpm exec harness validate`
4. Commit: `test(plugin): assert antigravity target config + emitted tree`

---

### Task 6: Regenerate drift-gated docs + add changeset

**Depends on:** Task 4 | **Files:** `docs/agent-setup/prompt.md`, `docs/reference/cli-commands.md`, `.changeset/antigravity-plugin-target.md` | **Category:** integration

1. Regenerate the drift-gated docs (both read from `clients.ts` / CLI command definitions — do NOT hand-edit):

   ```bash
   source ~/.nvm/nvm.sh && nvm use 22
   pnpm generate:agent-setup-prompt
   pnpm generate-docs
   ```

2. Confirm the regenerated docs are clean under the drift gate:

   ```bash
   pnpm exec harness generate-docs --check
   ```

   Must exit 0. (This gate also validates `docs/agent-setup/prompt.md` via `scripts/generate-agent-setup-prompt.mjs --check`.)

3. Verify the antigravity client now appears in the regenerated prompt:

   ```bash
   grep -q "Antigravity CLI" docs/agent-setup/prompt.md && grep -q "harness-antigravity" docs/agent-setup/prompt.md && echo "OK prompt updated"
   ```

4. Create `.changeset/antigravity-plugin-target.md`:

   ```md
   ---
   '@harness-engineering/cli': minor
   ---

   Add an `antigravity` plugin-generator target (agy / Antigravity CLI). The
   plugin generator now emits `/harness:*` slash commands, persona agents, and a
   pinned MCP declaration for agy alongside the existing claude/cursor/gemini/codex
   targets, and `harness setup` detects and configures the Antigravity CLI client.

   agy shares the `~/.gemini/` root with Gemini CLI but is a distinct target: it
   reads persona agents from `~/.gemini/agents/*.md` and MCP from
   `~/.gemini/config/mcp_config.json` (declaring MCP in `settings.json` is silently
   ignored). Lifecycle hooks are deferred to a follow-up phase because agy's
   stdin/stdout decision contract differs from Claude Code's exit-code contract.
   ```

   > If the change should not bump the published CLI minor, downgrade to `patch`. `minor` is recommended because this adds a new user-visible surface (a new setup client + generator target).

5. Verify the changeset is well-formed:

   ```bash
   node --test tests/scripts/check-changesets.test.mjs
   ```

6. Run: `pnpm exec harness validate`
7. Commit: `docs(plugin): regenerate agent-setup prompt + cli reference for antigravity; add changeset`

---

## Uncertainties

- **[ASSUMPTION]** The gemini-cli agent renderer (`generate-agent-definitions --platforms gemini-cli`) emits `.md` files usable by agy. Grounded in the spec's contract table and `generate-plugin.mjs:171`, but not executed at plan time — Task 3's checkpoint verifies the actual emitted tree. If the renderer produces zero agents, Task 3 fails fast at the `existsSync` guard (`generate-plugin.mjs:172`) and the config/renderer assumption must be revisited.
- **[ASSUMPTION]** `plugin.json` uses directory references (`"agents": "./agents/"`) rather than the explicit per-file array `.claude-plugin/plugin.json` uses. Flagged for reviewer preference in Task 2; either shape satisfies the tests.
- **[ASSUMPTION]** Appending antigravity **last** in `SETUP_CLIENTS` shifts the `setup.test.ts` MCP-integrations step index from 7 to 8. Task 4 instructs running the test first to confirm the exact index rather than blind-editing.
- **[DEFERRABLE]** Changeset bump level (`minor` vs `patch`) — recommended `minor`; final call at review.
- **[DEFERRABLE]** Whether `.antigravity-extension/` needs a `GEMINI.md` context doc like `.gemini-extension/GEMINI.md`. The spec's surface map (Phase 1) lists only commands/agents/MCP/marketplace, so this plan omits it; add in a follow-up if agy surfaces a context file. `plugin.json` references `contextFileName: "GEMINI.md"` for parity but the file is not required for the Phase-1 surfaces.

## Deferred (out of scope — Phase 2)

Lifecycle hooks (`generateHooks: false`). agy's hook contract (stdin JSON payload → stdout decision object, different tool matchers and events, no `PreCompact`) needs dual-contract hook scripts. Not planned here.
