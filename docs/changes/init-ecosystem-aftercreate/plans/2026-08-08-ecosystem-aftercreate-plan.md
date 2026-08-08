# Plan: Scaffold ecosystem-matched afterCreate install command

**Date:** 2026-08-08 | **Spec:** `docs/changes/init-ecosystem-aftercreate/proposal.md` | **Tasks:** 3 | **Time:** ~14 min | **Integration Tier:** small (WIRE-level; no new ADR)

## Goal

`harness init` derives the scaffolded `hooks.afterCreate` install command from the detected ecosystem (instead of a hardcoded `pnpm install --prefer-offline`), and warns loudly and non-blockingly when no install or verify command is resolvable for the target workspace.

## Observable Truths (Acceptance Criteria)

1. **Event-driven** — When `applyEcosystemAfterCreate(cwd, ['harness.orchestrator.md'])` runs against a node-pnpm workspace (a `pnpm-lock.yaml` at `cwd`) whose written `harness.orchestrator.md` carries an `afterCreate:` line, the system shall rewrite that line to `afterCreate: 'pnpm install'` and return `{ rewritten: true, installCommand: 'pnpm install', ecosystem.id: 'node-pnpm' }`.
2. **Event-driven** — When the same helper runs against a `uv.lock` Python workspace, the system shall rewrite the line to `afterCreate: 'uv sync'` and shall not emit any `pnpm` command.
3. **State-driven** — While the target workspace has no recognized lockfile or manifest at its root, the helper shall return `{ ecosystem: null, rewritten: false }`, and `harness init` shall emit exactly one non-blocking `logger.warn` naming that neither an install nor a verify command could be resolved, and shall still exit successfully.
4. **Unwanted** — If an ecosystem IS detected, then `harness init` shall not emit that warning.
5. **State-driven** — While `harness.orchestrator.md` is not in the write set (or absent on disk), the helper shall return `{ orchestratorConfigWritten: false, rewritten: false }` and shall leave any on-disk config untouched.
6. **Unwanted** — If the `afterCreate:` frontmatter line is missing or malformed, then the helper shall not throw and shall return `{ rewritten: false }` (best-effort scaffold).
7. `pnpm --filter @harness-engineering/cli run typecheck | lint | test` all pass; existing init/post-write tests are unaffected.

## File Map

- MODIFY `packages/cli/src/templates/post-write.ts` — add `applyEcosystemAfterCreate` + `EcosystemAfterCreateResult` and the orchestrator imports.
- MODIFY `packages/cli/src/commands/init.ts` — import and call the helper in `scaffoldProject` after `ensureHarnessGitignore(cwd)`; add info/warn logging.
- MODIFY `packages/cli/tests/templates/post-write.test.ts` — add unit tests for the helper.
- CREATE `.changeset/ecosystem-aftercreate-install.md` — patch changeset for `@harness-engineering/cli`.

## Skeleton

_Not produced — task count (3) is below the standard-mode threshold (8)._

## Key Facts (verified against the tree)

- `detectEcosystem` and the `Ecosystem` type are public exports of `@harness-engineering/orchestrator` (`packages/orchestrator/src/index.ts:31-32`); the CLI already depends on that package (`packages/cli/package.json`).
- `detectEcosystem(cwd)` reads directory entries once and returns `null` when the dir is unreadable or no marker matches (`packages/orchestrator/src/workspace/ecosystem.ts:255`).
- Markers: `pnpm-lock.yaml` → `node-pnpm` (`installCommand: 'pnpm install'`); `uv.lock` → `python-uv` (`installCommand: 'uv sync'`). `package.json` alone matches `node-npm`, so the "unrecognized" fixture must be an **empty** dir.
- `engine.write(...).value.written` holds **relative** paths (`written.push(file.relativePath)`, `engine.ts:361`), so the write-set membership check compares against the bare string `'harness.orchestrator.md'`.
- The scaffolded template line is `  afterCreate: 'pnpm install --prefer-offline'` at `templates/orchestrator/harness.orchestrator.md:16`, sitting under `hooks:` alongside `beforeRun`/`afterRun`/`beforeRemove` — the anchored regex must not touch those siblings.
- Existing relative imports in `post-write.ts` use `.js` extensions; the orchestrator import is a bare package specifier (`@harness-engineering/orchestrator`).

## Tasks

### Task 1: Add `applyEcosystemAfterCreate` helper + unit tests (TDD)

**Depends on:** none | **Files:** `packages/cli/src/templates/post-write.ts`, `packages/cli/tests/templates/post-write.test.ts` | **Owns:** `packages/cli/src/templates/post-write.ts`
**Skills:** `node-testing-patterns` (reference), `ts-type-guards` (reference)

1. **Write tests first.** Append a new `describe('applyEcosystemAfterCreate', ...)` block to `packages/cli/tests/templates/post-write.test.ts`. Add the import at top:

   ```ts
   import { applyEcosystemAfterCreate } from '../../src/templates/post-write';
   ```

   Use a per-test `mkdtempSync` temp dir (mirror the existing `beforeEach`/`afterEach` pattern). A small helper writes a minimal orchestrator config:

   ```ts
   const CONFIG = 'harness.orchestrator.md';
   function writeConfig(dir: string, afterCreateLine = "  afterCreate: 'pnpm install --prefer-offline'") {
     fs.writeFileSync(
       path.join(dir, CONFIG),
       ['---', 'hooks:', afterCreateLine, '  beforeRun: null', '---', ''].join('\n')
     );
   }
   ```

   Add these cases:

   ```ts
   it('rewrites afterCreate to the pnpm install command for a node-pnpm workspace', () => {
     fs.writeFileSync(path.join(tmpDir, 'pnpm-lock.yaml'), '');
     writeConfig(tmpDir);
     const res = applyEcosystemAfterCreate(tmpDir, [CONFIG]);
     expect(res.ecosystem?.id).toBe('node-pnpm');
     expect(res.rewritten).toBe(true);
     expect(res.installCommand).toBe('pnpm install');
     const out = fs.readFileSync(path.join(tmpDir, CONFIG), 'utf-8');
     expect(out).toContain("  afterCreate: 'pnpm install'");
     expect(out).not.toContain('--prefer-offline');
     expect(out).toContain('  beforeRun: null'); // sibling hook untouched
   });

   it('rewrites afterCreate to uv sync for a non-node (uv.lock) workspace', () => {
     fs.writeFileSync(path.join(tmpDir, 'uv.lock'), '');
     writeConfig(tmpDir);
     const res = applyEcosystemAfterCreate(tmpDir, [CONFIG]);
     expect(res.ecosystem?.id).toBe('python-uv');
     expect(res.installCommand).toBe('uv sync');
     const out = fs.readFileSync(path.join(tmpDir, CONFIG), 'utf-8');
     expect(out).toContain("  afterCreate: 'uv sync'");
     expect(out).not.toMatch(/pnpm/);
   });

   it('returns ecosystem null for an unrecognized (empty) workspace and does not rewrite', () => {
     writeConfig(tmpDir); // config present, but no lockfile/manifest markers
     const res = applyEcosystemAfterCreate(tmpDir, [CONFIG]);
     expect(res.ecosystem).toBeNull();
     expect(res.rewritten).toBe(false);
   });

   it('no-ops when the orchestrator config is absent from the write set', () => {
     fs.writeFileSync(path.join(tmpDir, 'pnpm-lock.yaml'), '');
     writeConfig(tmpDir); // file on disk, but NOT passed in writtenFiles
     const res = applyEcosystemAfterCreate(tmpDir, []);
     expect(res.orchestratorConfigWritten).toBe(false);
     expect(res.rewritten).toBe(false);
   });

   it('no-ops without throwing when the afterCreate line is missing/malformed', () => {
     fs.writeFileSync(path.join(tmpDir, 'pnpm-lock.yaml'), '');
     fs.writeFileSync(path.join(tmpDir, CONFIG), ['---', 'hooks:', '  beforeRun: null', '---', ''].join('\n'));
     const res = applyEcosystemAfterCreate(tmpDir, [CONFIG]);
     expect(res.rewritten).toBe(false); // no throw
   });
   ```

2. **Run the tests — observe failure** (helper does not yet exist → import/type error):

   ```
   pnpm --filter @harness-engineering/cli exec vitest run tests/templates/post-write.test.ts
   ```

3. **Implement the helper** in `packages/cli/src/templates/post-write.ts`. Add the import near the top (after the existing imports):

   ```ts
   import { detectEcosystem, type Ecosystem } from '@harness-engineering/orchestrator';
   ```

   Add at the end of the file:

   ```ts
   export interface EcosystemAfterCreateResult {
     ecosystem: Ecosystem | null;
     orchestratorConfigWritten: boolean;
     rewritten: boolean;
     installCommand?: string;
   }

   const ORCHESTRATOR_CONFIG = 'harness.orchestrator.md';

   /**
    * Best-effort post-write step: when the scaffolded orchestrator config is in the
    * write set and an ecosystem is detected at `cwd`, rewrite the single
    * `afterCreate:` frontmatter line to the ecosystem's install command. Never throws
    * — a read/write failure or an absent/malformed `afterCreate:` line degrades to
    * `rewritten: false` so `harness init` never fails on this advisory step.
    */
   export function applyEcosystemAfterCreate(
     cwd: string,
     writtenFiles: string[]
   ): EcosystemAfterCreateResult {
     const ecosystem = detectEcosystem(cwd);
     const configPath = path.join(cwd, ORCHESTRATOR_CONFIG);
     const orchestratorConfigWritten =
       writtenFiles.includes(ORCHESTRATOR_CONFIG) && fs.existsSync(configPath);

     if (!ecosystem || !orchestratorConfigWritten) {
       return { ecosystem, orchestratorConfigWritten, rewritten: false };
     }

     try {
       const content = fs.readFileSync(configPath, 'utf-8');
       // Anchored to the `afterCreate:` key; non-global → first match only. Sibling
       // hook lines and the comment block above are untouched.
       const pattern = /^(\s*)afterCreate:\s.*$/m;
       if (!pattern.test(content)) {
         return { ecosystem, orchestratorConfigWritten, rewritten: false };
       }
       const updated = content.replace(pattern, `$1afterCreate: '${ecosystem.installCommand}'`);
       fs.writeFileSync(configPath, updated);
       return {
         ecosystem,
         orchestratorConfigWritten,
         rewritten: true,
         installCommand: ecosystem.installCommand,
       };
     } catch {
       // Read/write failure — degrade to no-op; init must not fail here.
       return { ecosystem, orchestratorConfigWritten, rewritten: false };
     }
   }
   ```

4. **Run the tests — observe pass:**

   ```
   pnpm --filter @harness-engineering/cli exec vitest run tests/templates/post-write.test.ts
   ```

   > If types for `@harness-engineering/orchestrator` do not resolve, build it first: `pnpm --filter @harness-engineering/orchestrator run build` (see Build/Verify note).

5. Run: `harness validate`
6. Commit: `feat(cli): add applyEcosystemAfterCreate post-write helper`

### Task 2: Wire the helper into `scaffoldProject` with info/warn logging

**Depends on:** Task 1 | **Files:** `packages/cli/src/commands/init.ts` | **Category:** integration | **Owns:** `packages/cli/src/commands/init.ts`

1. Add `applyEcosystemAfterCreate` to the existing destructured import from `'../templates/post-write'` (currently importing `persistToolingConfig`, `appendFrameworkAgents`, `ensureHarnessGitignore`):

   ```ts
   import {
     persistToolingConfig,
     appendFrameworkAgents,
     ensureHarnessGitignore,
     applyEcosystemAfterCreate,
   } from '../templates/post-write';
   ```

2. In `scaffoldProject`, immediately after `ensureHarnessGitignore(cwd);`, insert:

   ```ts
   const eco = applyEcosystemAfterCreate(cwd, writeResult.value.written);
   if (eco.rewritten) {
     logger.info(
       `Scaffolded afterCreate install hook for ${eco.ecosystem!.id}: ${eco.installCommand}`
     );
   } else if (eco.ecosystem === null) {
     logger.warn(
       'No install or verify command could be resolved for this workspace ' +
         '(no recognized lockfile or manifest at the root). The local enforced verify gate ' +
         'has nothing to run and no afterCreate install hook was scaffolded. Configure ' +
         'hooks.afterCreate and the verify command manually for your toolchain.'
     );
   }
   ```

   > Behavioral coverage for both branches lives in the Task 1 helper tests (criterion 5). This wiring is thin glue: it maps the helper result to log calls. Verify it via typecheck + the unchanged init test suite (step 3).

3. Verify wiring and no regression:

   ```
   pnpm --filter @harness-engineering/cli run typecheck
   pnpm --filter @harness-engineering/cli run lint
   pnpm --filter @harness-engineering/cli run test
   ```

4. Run: `harness validate`
5. Commit: `feat(cli): scaffold ecosystem-matched afterCreate + warn on unrecognized workspace`

### Task 3: Add changeset and run full package verify

**Depends on:** Task 2 | **Files:** `.changeset/ecosystem-aftercreate-install.md` | **Category:** integration

1. Create `.changeset/ecosystem-aftercreate-install.md`:

   ```md
   ---
   '@harness-engineering/cli': patch
   ---

   `harness init` now scaffolds `hooks.afterCreate` in the orchestrator config from the
   detected ecosystem's install command (e.g. `uv sync` for a `uv.lock` workspace,
   `pnpm install` for a `pnpm-lock.yaml` workspace) instead of hardcoding
   `pnpm install --prefer-offline` for every adopter. When no lockfile or manifest is
   recognized at the workspace root, init now emits a single loud, non-blocking warning
   that neither an install nor a verify command could be resolved (the same condition
   that silently no-ops the runtime verify gate) and still exits successfully.
   ```

2. Full affected-package verify (build orchestrator+cli first if types are stale — see note):

   ```
   pnpm --filter @harness-engineering/cli run typecheck
   pnpm --filter @harness-engineering/cli run lint
   pnpm --filter @harness-engineering/cli run test
   ```

3. Run: `harness validate`
4. Commit: `chore(cli): changeset for ecosystem-matched afterCreate scaffold`

## Sequencing & Parallelism

Strictly linear: Task 1 (helper + tests) → Task 2 (wiring, imports the helper) → Task 3 (changeset + final verify). No parallel waves — Task 2 depends on Task 1's export and Task 3 gates on the full suite passing.

## Build / Verify Note

- **Affected package:** `cli` (`@harness-engineering/cli`). No changes to `orchestrator` source.
- **Local verify:** `pnpm --filter @harness-engineering/cli run typecheck | lint | test`.
- **Cross-package types:** `post-write.ts` newly imports `detectEcosystem`/`Ecosystem` from `@harness-engineering/orchestrator`. If the orchestrator package's build output/types are stale in this worktree, CLI typecheck may not resolve them — build the dependency first: `pnpm --filter @harness-engineering/orchestrator run build`, then (if needed) `pnpm --filter @harness-engineering/cli run build`.
- **Node 22 required** in this worktree (Node 26 breaks `better-sqlite3`): `export PATH="$HOME/.nvm/versions/node/v22.20.0/bin:$PATH"` before any pnpm/harness command.

## Integration Tier: small (WIRE-level)

Per the spec's Integration Points: no new command, no barrel/CLI/skill registration (`applyEcosystemAfterCreate` is an internal helper; `detectEcosystem` is already exported), no required doc updates, and no standalone ADR. The only integration work is the `init.ts` call site (Task 2) and the changeset (Task 3).

## Uncertainties

- [DEFERRABLE] Exact `logger.warn` wording — taken verbatim from the spec; final copy can be tuned during review without affecting behavior or tests.
- [ASSUMPTION] The orchestrator package's types resolve for CLI typecheck without an extra build step in a clean checkout; if not, the Build/Verify note's dependency-build command covers it. (Does not affect task structure.)
