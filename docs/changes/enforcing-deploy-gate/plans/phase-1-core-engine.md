# Plan: Enforcing Deploy Gate — Phase 1 (Core Engine + Config + Tests)

**Date:** 2026-08-07 | **Spec:** `docs/changes/enforcing-deploy-gate/proposal.md` (Implementation Order → Phase 1) | **Tasks:** 8 | **Time:** ~34 min | **Integration Tier:** large

## Goal

Ship a pure, injected-IO `packages/core/src/deployment/` module — `detectDeploymentSurface` (discovery), `evaluateDeploymentGate` (block/advise/abstain classifier reusing the security secret-scanner), and `deriveExitCode` (four-value `ExitCode` mapping) — plus the `DeploymentGateConfigSchema` wired onto `HarnessConfigSchema`, with unit tests over fixtures for every criterion. No CLI command, no skill edits (those are Phases 2 and 3).

## Scope Guards (do NOT do in this plan)

- **No CLI command.** `packages/cli/src/commands/check-deployment.ts`, `_registry.ts` registration, `--json`/`--findings-json` wiring, docs regen, and the changeset are **Phase 2**. This plan produces the engine the command will call and nothing that imports commander.
- **No skill edits.** `skill.yaml` / `SKILL.md` / ADR are **Phase 3**.
- **No Half (B) ops-signal work.** No incident/monitoring ingestion, no production-signal sources, no knowledge-graph writes. The engine only reads config + repo files.
- **No new secret regexes.** DEPLOY-SEC001 reuses `SecurityScanner` (`packages/core/src/security/scanner.ts`); do not add or fork secret patterns.
- **No deploy/rollback execution.** DEPLOY-RB001 verifies a rollback path *exists*; it never runs a deploy or a revert.

## Observable Truths (Acceptance Criteria)

Traces to spec Success Criteria (SC) 2, 3, 4, 5, 6, 7, 8.

1. **SC6 (abstain).** *When a repo has no CI/CD files, no deploy scripts, and no `deployment` config, `evaluateDeploymentGate` shall return `status: 'abstained'` and `deriveExitCode` shall return `ExitCode.ZERO_DENOMINATOR` (3)* — never `pass`, never `blocked`.
2. **SC7 (opt-out).** *When `deployment.enabled === false`, the gate shall short-circuit to `status: 'disabled'` and `deriveExitCode` → `ExitCode.SUCCESS` (0)* with a distinct note (not abstention).
3. **SC2 (secret leak, non-waivable).** *If a pipeline or committed env file contains a hardcoded secret literal, the gate shall emit `DEPLOY-SEC001` at `severity: 'hard'` and `deriveExitCode` → `1`; a value that is only an env-var/CI reference (`${{ secrets.X }}`, `process.env.X`, `$VAR`) shall NOT trip it, and `rules: { "DEPLOY-SEC001": "off" }` shall be ignored.*
4. **SC4 (rollback path).** *If a deploy target is detected but no rollback path exists (no `rollback` config, no revert/rollback workflow or `deploy/rollback` script, no runbook), the gate shall emit `DEPLOY-RB001` (hard) whose `remediation` names `harness-rollback`, and `deriveExitCode` → `1`.*
5. **SC3 (promotion gate).** *If a production deploy is reachable with no environment protection, no manual approval, and no prior staging/promotion job, the gate shall emit `DEPLOY-ENV001` (hard) and `deriveExitCode` → `1`.*
6. **SC8 (override).** *`rules: { "DEPLOY-ENV001": "off" }` shall downgrade `DEPLOY-ENV001` to `severity: 'soft'` (advisory) so it no longer blocks; the same override on `DEPLOY-SEC001` shall be ignored.*
7. **SC5 (soft-only).** *When a repo has deployment config and only soft findings (`DEPLOY-STAGE001` / `DEPLOY-ENV002` / `DEPLOY-HC001` / `DEPLOY-PERF001`), the gate shall return `status: 'pass'` with the advisories listed, and `deriveExitCode` → `0`.*
8. **Edge cases.** An unparseable pipeline file still counts as a detected deployment surface (repo does not abstain) and yields a `DEPLOY-STAGE001`-class advisory; the engine never throws on one bad file. A repo with `deployment` config present but no CI/CD files still evaluates rules it can (does not abstain).
9. `DeploymentGateConfigSchema` parses `{ enabled?, rules? }`; `deployment` is optional on `HarnessConfigSchema`; `harness validate` passes and the core barrel stays in sync (`pnpm generate:barrels:check`).

## Grounding (evidence: file:line)

- **Mirror target** — `packages/core/src/architecture/`: pure functions with a config type in `types.ts`, barrel `index.ts` (explicit re-exports, `packages/core/src/architecture/index.ts:1-151`), `config.ts` helper (`packages/core/src/architecture/config.ts:41`). The core top barrel is **auto-generated** — `packages/core/src/index.ts:1` (`// AUTO-GENERATED — do not edit. Run \`pnpm run generate:barrels\``); `:92` `export * from './architecture';`. A new `deployment/index.ts` is picked up by `pnpm generate:barrels`.
- **Secret scanner to reuse (D8)** — `packages/core/src/security/scanner.ts`: `class SecurityScanner` (`:46`), `new SecurityScanner()` registers `secretRules` (`:57`), `scanFileContent(content, filePath, startLine?)` (`:107`) applies fileGlob filtering to in-memory content (no disk read). The leak-vs-reference guard is automatic inside `matchRuleLine` (`:168-171`): for `category === 'secrets'` it calls `extractQuotedSecretValue` + `isReferenceOnlySecretValue` (`packages/core/src/security/secret-reference.ts:63`, `:101`) and `continue`s on a reference. Findings carry `category: 'secrets'`, `ruleId` (e.g. `SEC-SEC-002`), `severity`, `file`, `line`, `message` (`SecurityFinding`, exported from `packages/core/src/security/index.ts:92-102`). `SecurityScanner` is exported from the security barrel (`packages/core/src/security/index.ts:8`).
- **Exit-code contract (D2)** — `packages/cli/src/utils/errors.ts:4-20`: `ExitCode.SUCCESS=0`, `VALIDATION_FAILED=1`, `ERROR=2`, `ZERO_DENOMINATOR=3`. `ExitCode` lives in the **CLI** package; core must NOT import from CLI. Therefore `deriveExitCode` returns a plain `0 | 1 | 2 | 3` numeric literal (documented to equal the `ExitCode` values); the CLI (Phase 2) maps that number through `process.exit`. The `ZERO_DENOMINATOR` doctrine ("examined NOTHING — abstained, not passed") is quoted verbatim at `errors.ts:11-18`.
- **Config schema pattern** — `packages/cli/src/config/schema.ts`: `VocabularyConfigSchema` is defined inline in this file (`:509`) and wired onto `HarnessConfigSchema` (`:908`) as `vocabulary: VocabularyConfigSchema.optional()` (`:966`); `rollback: RollbackConfigSchema.optional()` (`:1018`, schema at `:631`); `architecture: ArchConfigSchema.optional()` (`:976`, schema imported from core). Type exports use `z.infer` (e.g. `RollbackConfig`, `schema.ts:~1130`). The spec (Technical Design → Config) directs `DeploymentGateConfigSchema` to be defined **in `schema.ts`** (Vocabulary/Rollback pattern, not the core-defined Arch pattern).
- **Test locations** — core unit tests live under `packages/core/tests/<module>/` mirroring src (e.g. `packages/core/tests/architecture/diff.test.ts`, `packages/core/tests/security/scanner-fileglob.test.ts`). New tests go in `packages/core/tests/deployment/`.
- **Detection catalog** — spec Technical Design (`proposal.md:166-169`) + the skill's existing DETECT list (`agents/skills/claude-code/harness-deployment/SKILL.md:18-42`): `.github/workflows/*.yml`, `.gitlab-ci.yml`, `Jenkinsfile`, `.circleci/config.yml`, `bitbucket-pipelines.yml`, `azure-pipelines.yml`, `deploy/`, `scripts/deploy*`; env files `.env.production` / `.env.staging`.

## File Map

- CREATE `packages/core/src/deployment/types.ts` — `DeploymentFinding`, `DeploymentGateResult`, `DeploymentSurface`, `DeploymentGateConfig`, `DeploymentExitCode`.
- CREATE `packages/core/src/deployment/detect.ts` — `detectDeploymentSurface(root, fsPort)`.
- CREATE `packages/core/src/deployment/evaluate.ts` — `evaluateDeploymentGate(surface, config)` (all rules).
- CREATE `packages/core/src/deployment/exit-code.ts` — `deriveExitCode(result)`.
- CREATE `packages/core/src/deployment/index.ts` — module barrel (explicit re-exports).
- CREATE `packages/core/tests/deployment/fixtures.ts` — in-memory `DeploymentFsPort` + surface builders.
- CREATE `packages/core/tests/deployment/detect.test.ts`
- CREATE `packages/core/tests/deployment/evaluate.test.ts`
- CREATE `packages/core/tests/deployment/exit-code.test.ts`
- CREATE `packages/core/tests/deployment/schema.test.ts` — `DeploymentGateConfigSchema` parse cases.
- MODIFY `packages/cli/src/config/schema.ts` — add `DeploymentGateConfigSchema`, wire `deployment` onto `HarnessConfigSchema`, export `DeploymentGateConfig` type.
- MODIFY `packages/core/src/index.ts` — regenerated by `pnpm generate:barrels` (not hand-edited) to add `export * from './deployment';`.

## Skeleton

1. Types + fixtures foundation (~1 task, ~4 min)
2. Detection over fixtures with TDD (~1 task, ~5 min)
3. Evaluate classifier — hard rules, soft rules, exit-code with TDD (~4 tasks, ~18 min)
4. Config schema wiring + barrel/validate (~2 tasks, ~7 min)

**Estimated total:** 8 tasks, ~34 minutes. _Skeleton approved: pending._

## Uncertainties

- [ASSUMPTION] The core engine cannot import `ExitCode` from `@harness-engineering/cli` (layer direction: CLI depends on core, not the reverse). `deriveExitCode` therefore returns a numeric literal `0 | 1 | 2 | 3` typed as `DeploymentExitCode`, documented to equal the `ExitCode` values; the CLI maps it in Phase 2. If a shared `ExitCode` constant already lives in `@harness-engineering/types`, prefer importing that — Task 6 checks `git grep -n "ZERO_DENOMINATOR" packages/types/src` first and uses it if present.
- [ASSUMPTION] `SecurityScanner.scanFileContent(content, filePath)` is synchronous and applies fileGlob filtering to in-memory content (verified `scanner.ts:107-128`), so `evaluateDeploymentGate` stays pure by running it over file contents captured into `DeploymentSurface` during `detect`. If `scanFileContent` were async, DEPLOY-SEC001 evaluation would move into `detect` (which already reads files) instead — Task 3 verifies the sync signature before wiring.
- [ASSUMPTION] `DeploymentGateConfigSchema` belongs in `packages/cli/src/config/schema.ts` (spec Technical Design + the Vocabulary/Rollback in-file pattern), while the core `DeploymentGateConfig` is a plain structurally-compatible TS interface. If a reviewer prefers the Arch pattern (schema in core, imported by CLI), that is a one-file move and does not change the engine.
- [DEFERRABLE] Exact soft-rule detection heuristics (which missing stages count as `DEPLOY-STAGE001`, what "serial stages that could parallelize" means for `DEPLOY-PERF001`) are advisory-only and never block; Task 5 implements a defensible first cut over the fixtures and leaves refinement to execution.

---

## Tasks

### Task 1: Define deployment types + in-memory fsPort test fixtures

**Depends on:** none | **Files:** `packages/core/src/deployment/types.ts`, `packages/core/tests/deployment/fixtures.ts`

1. Create `packages/core/src/deployment/types.ts` with the shapes from the spec (Technical Design → Core engine), plus the injected-IO port, surface, config, and exit-code types:

   ```ts
   /** Injected IO port so the engine is pure (mirrors architecture/'s no-direct-process rule). */
   export interface DeploymentFsPort {
     /** True when a path (file or dir) exists under root. */
     exists(relPath: string): boolean;
     /** File contents, or null when absent/unreadable (never throws). */
     readFile(relPath: string): string | null;
     /** Shallow list of entries directly under a relative dir (files + dirs); [] when absent. */
     listDir(relPath: string): string[];
   }

   export type DeploymentSeverity = 'hard' | 'soft';

   export interface DeploymentFinding {
     code: string; // e.g. "DEPLOY-SEC001"
     severity: DeploymentSeverity;
     file?: string;
     detail: string;
     /** Human-facing fix; DEPLOY-RB001 references harness-rollback. */
     remediation: string;
   }

   /** A captured deployment file: path relative to root + its raw contents. */
   export interface DeploymentFile {
     path: string;
     content: string;
     /** True when the file was found but could not be parsed (still counts as a surface). */
     unparseable?: boolean;
   }

   export interface DeploymentSurface {
     /** CI/CD pipeline files (workflows, .gitlab-ci.yml, Jenkinsfile, ...) with contents. */
     pipelineFiles: DeploymentFile[];
     /** Deploy scripts (deploy/, scripts/deploy*) with contents. */
     deployScripts: DeploymentFile[];
     /** Committed environment files (.env.production, .env.staging, ...) with contents. */
     envFiles: DeploymentFile[];
     /** Environment names detected (dev, staging, production, ...). */
     detectedEnvironments: string[];
     /** A production deploy target is reachable. */
     hasProductionTarget: boolean;
     /** A production deploy is reachable with NO promotion/approval/protection gate. */
     productionUngated: boolean;
     /** Any rollback signal found in files (revert/rollback workflow or script, runbook). */
     rollbackSignalInFiles: boolean;
     /** Post-deploy health check wired for a deploy target. */
     hasHealthCheck: boolean;
     /** Recommended pre-deploy stages that are present (security scan, smoke test, ...). */
     presentStages: string[];
   }

   /** Structurally compatible with the CLI's DeploymentGateConfigSchema (Phase 1 schema task). */
   export interface DeploymentGateConfig {
     enabled?: boolean;
     /** Per-code severity override. 'off' downgrades a HARD rule to advisory (except DEPLOY-SEC001). */
     rules?: Record<string, 'error' | 'warn' | 'off'>;
   }

   export interface DeploymentGateResult {
     status: 'pass' | 'blocked' | 'abstained' | 'disabled';
     findings: DeploymentFinding[];
     hardViolations: DeploymentFinding[];
     softViolations: DeploymentFinding[];
     detectedEnvironments: string[];
     rollbackPathPresent: boolean;
   }

   /** Equals the CLI ExitCode values (SUCCESS=0, VALIDATION_FAILED=1, ERROR=2, ZERO_DENOMINATOR=3). */
   export type DeploymentExitCode = 0 | 1 | 2 | 3;
   ```

2. Create `packages/core/tests/deployment/fixtures.ts` — an in-memory `DeploymentFsPort` over a `Record<string, string>` file map, plus a `surface(partial)` builder that returns a fully-defaulted `DeploymentSurface`:

   ```ts
   import type { DeploymentFsPort, DeploymentSurface } from '../../src/deployment/types';

   export function memFs(files: Record<string, string>): DeploymentFsPort {
     const keys = Object.keys(files);
     return {
       exists: (p) => keys.some((k) => k === p || k.startsWith(p.replace(/\/$/, '') + '/')),
       readFile: (p) => (p in files ? files[p]! : null),
       listDir: (p) => {
         const prefix = p === '.' || p === '' ? '' : p.replace(/\/$/, '') + '/';
         const seen = new Set<string>();
         for (const k of keys) {
           if (!k.startsWith(prefix)) continue;
           const rest = k.slice(prefix.length).split('/')[0];
           if (rest) seen.add(rest);
         }
         return [...seen];
       },
     };
   }

   export function surface(p: Partial<DeploymentSurface> = {}): DeploymentSurface {
     return {
       pipelineFiles: [], deployScripts: [], envFiles: [],
       detectedEnvironments: [], hasProductionTarget: false, productionUngated: false,
       rollbackSignalInFiles: false, hasHealthCheck: false, presentStages: [],
       ...p,
     };
   }
   ```

3. Run: `npx tsc --noEmit -p packages/core/tsconfig.json` (or `pnpm --filter @harness-engineering/core build`) — expect clean.
4. Run: `harness validate`
5. Commit: `feat(core): add deployment gate types + fsPort test fixtures`

### Task 2 (TDD): `detectDeploymentSurface` over fixtures

**Depends on:** Task 1 | **Files:** `packages/core/src/deployment/detect.ts`, `packages/core/tests/deployment/detect.test.ts`

1. Create `packages/core/tests/deployment/detect.test.ts` covering:
   - **Empty repo** → `pipelineFiles/deployScripts/envFiles` all empty (drives the abstain path in Task 3).
   - **GitHub Actions deploy workflow** in `.github/workflows/deploy.yml` (on: push to main, a deploy step to production, no `environment:` / no approval) → `pipelineFiles.length === 1`, `hasProductionTarget === true`, `productionUngated === true`, `detectedEnvironments` includes `production`.
   - **Env file** `.env.production` present → captured in `envFiles`.
   - **Rollback signal** — a `.github/workflows/rollback.yml` OR `deploy/rollback.sh` OR `docs/ROLLBACK.md` → `rollbackSignalInFiles === true`.
   - **Unparseable YAML** — a workflow whose content is `:\n  - [garbage` → the file still appears in `pipelineFiles` with `unparseable: true` (repo does not silently abstain), and `detect` does not throw.
   - **Gated prod** — a workflow with `environment: production` protection OR a prior `staging`/`deploy-staging` job → `productionUngated === false`.

   ```ts
   import { describe, it, expect } from 'vitest';
   import { detectDeploymentSurface } from '../../src/deployment/detect';
   import { memFs } from './fixtures';

   const ghDeployProd = `name: deploy
   on:
     push:
       branches: [main]
   jobs:
     deploy:
       runs-on: ubuntu-latest
       steps:
         - run: kubectl apply -f k8s/production
   `;

   describe('detectDeploymentSurface', () => {
     it('abstains structurally on an empty repo (no surfaces)', () => {
       const s = detectDeploymentSurface('.', memFs({}));
       expect(s.pipelineFiles).toHaveLength(0);
       expect(s.deployScripts).toHaveLength(0);
       expect(s.envFiles).toHaveLength(0);
     });
     it('detects a GitHub Actions ungated production deploy', () => {
       const s = detectDeploymentSurface('.', memFs({ '.github/workflows/deploy.yml': ghDeployProd }));
       expect(s.pipelineFiles).toHaveLength(1);
       expect(s.hasProductionTarget).toBe(true);
       expect(s.productionUngated).toBe(true);
       expect(s.detectedEnvironments).toContain('production');
     });
     it('captures committed env files', () => {
       const s = detectDeploymentSurface('.', memFs({ '.env.production': 'API_URL=https://x' }));
       expect(s.envFiles.map((f) => f.path)).toContain('.env.production');
     });
     it('finds a rollback signal from a rollback workflow', () => {
       const s = detectDeploymentSurface('.', memFs({ '.github/workflows/rollback.yml': 'name: rollback' }));
       expect(s.rollbackSignalInFiles).toBe(true);
     });
     it('counts an unparseable pipeline file as a surface without throwing', () => {
       const s = detectDeploymentSurface('.', memFs({ '.github/workflows/bad.yml': ':\n  - [garbage' }));
       expect(s.pipelineFiles).toHaveLength(1);
       expect(s.pipelineFiles[0]!.unparseable).toBe(true);
     });
     it('treats environment-protected prod as gated', () => {
       const gated = ghDeployProd.replace('    steps:', '    environment: production\n    steps:');
       const s = detectDeploymentSurface('.', memFs({ '.github/workflows/deploy.yml': gated }));
       expect(s.productionUngated).toBe(false);
     });
   });
   ```

2. Run: `npx vitest run packages/core/tests/deployment/detect.test.ts` — observe failures (module missing).
3. Create `packages/core/src/deployment/detect.ts` implementing `detectDeploymentSurface(root, fsPort)`:
   - Discover CI/CD files via `fsPort.listDir('.github/workflows')` (`.yml`/`.yaml`) and the fixed set `.gitlab-ci.yml`, `Jenkinsfile`, `.circleci/config.yml`, `bitbucket-pipelines.yml`, `azure-pipelines.yml`; read each via `fsPort.readFile`.
   - Discover deploy scripts under `deploy/` (`fsPort.listDir`) and `scripts/deploy*`.
   - Discover env files `.env.production`, `.env.staging` (and any `.env.*` the fsPort lists at root).
   - Parse each pipeline file **defensively**: wrap any structured parse in try/catch; on failure mark `unparseable: true` but keep the file. Extract environment names by scanning for `production|prod|staging|dev` tokens and `environment:` keys.
   - `hasProductionTarget` = any pipeline/script mentions a prod deploy step. `productionUngated` = `hasProductionTarget` AND no `environment:` protection AND no manual-approval/`workflow_dispatch` gate AND no prior staging/promotion job in the same file.
   - `rollbackSignalInFiles` = any file path matches `/rollback|revert/i` OR any content mentions a rollback step OR a runbook file exists (`fsPort.exists` on `docs/ROLLBACK.md` / `**/runbook*` — check a small fixed candidate list).
   - `hasHealthCheck` / `presentStages` = scan content for `health|smoke|readiness` and stage keywords (`security scan|trivy|codeql`, `smoke`, `post-deploy`).
4. Run: `npx vitest run packages/core/tests/deployment/detect.test.ts` — expect all pass.
5. Run: `harness validate`
6. Commit: `feat(core): detect deployment surface (CI/CD, env, rollback signals)`

### Task 3 (TDD): `evaluateDeploymentGate` — status routing + DEPLOY-SEC001 (non-waivable)

**Depends on:** Task 2 | **Files:** `packages/core/src/deployment/evaluate.ts`, `packages/core/tests/deployment/evaluate.test.ts`

1. Create `packages/core/tests/deployment/evaluate.test.ts` covering the status machine + the secret rule:
   - **Disabled (SC7):** `config.enabled === false` → `status: 'disabled'`, no findings.
   - **Abstain (SC6):** empty surface + no config → `status: 'abstained'`.
   - **Config-present-no-files:** `config.enabled === true` but empty surface → NOT abstained; evaluates rollback-path presence (a `rollback` config makes `rollbackPathPresent` true).
   - **SEC001 leak (SC2):** a pipeline file whose content has a hardcoded secret (e.g. `api_key: "AKIAIOSFODNN7EXAMPLE"` or `password: "hunter2xyz"`) → a `DEPLOY-SEC001` finding at `severity: 'hard'`; `status: 'blocked'`.
   - **SEC001 reference (SC2):** a pipeline with `token: ${{ secrets.NPM_TOKEN }}` or `TOKEN: "$AUTOAPPROVE_PAT"` → NO `DEPLOY-SEC001`.
   - **SEC001 non-waivable (SC8):** `rules: { 'DEPLOY-SEC001': 'off' }` with a leak → still hard, still `blocked`.

   Use `memFs`/`surface` from `fixtures.ts`; construct surfaces whose `pipelineFiles` carry the secret-bearing content directly.

   ```ts
   import { describe, it, expect } from 'vitest';
   import { evaluateDeploymentGate } from '../../src/deployment/evaluate';
   import { surface } from './fixtures';

   const withPipeline = (content: string) =>
     surface({ pipelineFiles: [{ path: '.github/workflows/deploy.yml', content }], hasProductionTarget: true });

   describe('evaluateDeploymentGate — status + DEPLOY-SEC001', () => {
     it('disabled short-circuits (SC7)', () => {
       expect(evaluateDeploymentGate(surface(), { enabled: false }).status).toBe('disabled');
     });
     it('abstains on an empty surface with no config (SC6)', () => {
       expect(evaluateDeploymentGate(surface(), undefined).status).toBe('abstained');
     });
     it('does not abstain when deployment config is present (SC edge)', () => {
       const r = evaluateDeploymentGate(surface(), { enabled: true });
       expect(r.status).not.toBe('abstained');
     });
     it('flags a hardcoded secret in a pipeline (SC2)', () => {
       const r = withPipeline('env:\n  AWS: "AKIAIOSFODNN7EXAMPLE"') as never;
       const res = evaluateDeploymentGate(r, { enabled: true });
       const sec = res.findings.find((f) => f.code === 'DEPLOY-SEC001');
       expect(sec?.severity).toBe('hard');
       expect(res.status).toBe('blocked');
     });
     it('does NOT flag an env-var/CI reference (SC2, D8)', () => {
       const res = evaluateDeploymentGate(withPipeline('env:\n  TOKEN: ${{ secrets.NPM_TOKEN }}'), { enabled: true });
       expect(res.findings.some((f) => f.code === 'DEPLOY-SEC001')).toBe(false);
     });
     it('ignores an override on DEPLOY-SEC001 (SC8, non-waivable)', () => {
       const res = evaluateDeploymentGate(withPipeline('env:\n  AWS: "AKIAIOSFODNN7EXAMPLE"'), {
         enabled: true, rules: { 'DEPLOY-SEC001': 'off' },
       });
       expect(res.findings.find((f) => f.code === 'DEPLOY-SEC001')?.severity).toBe('hard');
     });
   });
   ```

2. Run: `npx vitest run packages/core/tests/deployment/evaluate.test.ts` — observe failures.
3. Create `packages/core/src/deployment/evaluate.ts`:
   - `import { SecurityScanner } from '../security';` and confirm `scanFileContent` is synchronous (`scanner.ts:107`). Build one `new SecurityScanner()` per call.
   - **Status routing first:** if `config?.enabled === false` → return `{ status: 'disabled', findings: [], hardViolations: [], softViolations: [], detectedEnvironments: surface.detectedEnvironments, rollbackPathPresent }`. If the surface is empty (no pipeline/deploy/env files) AND no `deployment` config present → `status: 'abstained'`.
   - **DEPLOY-SEC001:** for each `pipelineFiles` + `envFiles` content, run `scanner.scanFileContent(content, file.path)`, filter to `finding.category === 'secrets'`, and emit one `DEPLOY-SEC001` per file with a leak. Severity is ALWAYS `'hard'` — the `rules` override is not consulted for this code (D4).
   - **Severity resolver helper** `resolveSeverity(code, base, rules)` that returns `'soft'` when `rules?.[code] === 'off'` for waivable codes, else `base`; DEPLOY-SEC001 bypasses it.
   - Assemble `hardViolations`/`softViolations` from `findings`; `status = hardViolations.length > 0 ? 'blocked' : 'pass'` (unless already disabled/abstained). `rollbackPathPresent` computed here (config `rollback` seam is passed via a second config channel in Task 4 — for now `surface.rollbackSignalInFiles`).
4. Run: `npx vitest run packages/core/tests/deployment/evaluate.test.ts` — expect all pass.
5. Run: `harness validate`
6. Commit: `feat(core): deployment gate status routing + DEPLOY-SEC001 (non-waivable)`

### Task 4 (TDD): DEPLOY-RB001 (rollback path) + DEPLOY-ENV001 (promotion gate)

**Depends on:** Task 3 | **Files:** `packages/core/src/deployment/evaluate.ts`, `packages/core/tests/deployment/evaluate.test.ts`

1. Append tests to `evaluate.test.ts`:
   - **RB001 (SC4):** a surface with `hasProductionTarget: true` and no rollback signal, config with no `rollback` → `DEPLOY-RB001` hard; its `remediation` includes the string `harness-rollback`; `status: 'blocked'`.
   - **RB001 satisfied by config seam (D5):** same surface but config carries a truthy `rollback` seam flag → no `DEPLOY-RB001`, `rollbackPathPresent: true`.
   - **RB001 satisfied by file signal:** `surface.rollbackSignalInFiles: true` → no `DEPLOY-RB001`.
   - **RB001 waivable (SC8):** `rules: { 'DEPLOY-RB001': 'off' }` → the finding is emitted at `severity: 'soft'` (advisory), `status: 'pass'` if it is the only issue.
   - **ENV001 (SC3):** `hasProductionTarget: true`, `productionUngated: true` → `DEPLOY-ENV001` hard; `blocked`.
   - **ENV001 waivable (SC8):** `rules: { 'DEPLOY-ENV001': 'off' }` → soft, non-blocking.

   Decide how the `rollback` config seam reaches the engine: extend `DeploymentGateConfig` with an optional passthrough `rollbackConfigured?: boolean` set by the CLI (Phase 2) from `config.rollback != null`. Document it in `types.ts`.

2. Run: `npx vitest run packages/core/tests/deployment/evaluate.test.ts` — observe the new failures.
3. Extend `evaluate.ts`:
   - `rollbackPathPresent = surface.rollbackSignalInFiles || config?.rollbackConfigured === true`.
   - **DEPLOY-RB001:** when `surface.hasProductionTarget` (or any pipeline/deploy surface exists) AND `!rollbackPathPresent` → emit `DEPLOY-RB001` with `remediation` naming `harness-rollback` and the pre-ship/post-ship complementarity (D5). Severity via `resolveSeverity('DEPLOY-RB001', 'hard', rules)`.
   - **DEPLOY-ENV001:** when `surface.productionUngated` → emit `DEPLOY-ENV001`, severity via `resolveSeverity`.
   - Add `DeploymentGateConfig.rollbackConfigured?: boolean` to `types.ts`.
4. Run: `npx vitest run packages/core/tests/deployment/evaluate.test.ts` — expect all pass.
5. Run: `harness validate`
6. Commit: `feat(core): DEPLOY-RB001 rollback-path + DEPLOY-ENV001 promotion-gate rules`

### Task 5 (TDD): Soft advisory rules (STAGE001 / ENV002 / HC001 / PERF001)

**Depends on:** Task 4 | **Files:** `packages/core/src/deployment/evaluate.ts`, `packages/core/tests/deployment/evaluate.test.ts`

1. Append tests to `evaluate.test.ts`:
   - **SC5 soft-only:** a surface with a deploy target, a rollback signal, a gated prod, but missing stages (`presentStages` lacks `security-scan`/`smoke`) and no health check → findings include `DEPLOY-STAGE001` and `DEPLOY-HC001` at `severity: 'soft'`, `status: 'pass'`, zero `hardViolations`.
   - **Unparseable file (edge):** a `pipelineFiles` entry with `unparseable: true` → a `DEPLOY-STAGE001`-class advisory noting the unparseable file; still `status: 'pass'` (no hard).
   - **ENV002 / PERF001:** a surface with shared non-secret config across envs → `DEPLOY-ENV002` soft; a serial-stages/no-cache smell → `DEPLOY-PERF001` soft.

2. Run: `npx vitest run packages/core/tests/deployment/evaluate.test.ts` — observe failures.
3. Extend `evaluate.ts` with the four soft emitters (all `severity: 'soft'`, never block):
   - `DEPLOY-STAGE001` — missing recommended stages, or an unparseable pipeline file.
   - `DEPLOY-ENV002` — weak env separation (shared non-secret config), distinct from a leak.
   - `DEPLOY-HC001` — no post-deploy health check for a deploy target.
   - `DEPLOY-PERF001` — pipeline structure smells (serial stages, missing caching).
4. Run: `npx vitest run packages/core/tests/deployment/evaluate.test.ts` — expect all pass.
5. Run: `harness validate`
6. Commit: `feat(core): deployment soft advisories (STAGE/ENV002/HC/PERF)`

### Task 6 (TDD): `deriveExitCode` — four-value contract (D2)

**Depends on:** Task 5 | **Files:** `packages/core/src/deployment/exit-code.ts`, `packages/core/tests/deployment/exit-code.test.ts`

1. First run `git grep -n "ZERO_DENOMINATOR" packages/types/src` — if a shared exit-code constant lives in `@harness-engineering/types`, import and reuse it; otherwise return numeric literals typed `DeploymentExitCode` (per Uncertainties).
2. Create `packages/core/tests/deployment/exit-code.test.ts`:
   - `status: 'pass'` → `0`; `status: 'disabled'` → `0`; `status: 'blocked'` → `1`; `status: 'abstained'` → `3`.
   ```ts
   import { describe, it, expect } from 'vitest';
   import { deriveExitCode } from '../../src/deployment/exit-code';
   const r = (status: 'pass' | 'blocked' | 'abstained' | 'disabled') =>
     ({ status, findings: [], hardViolations: [], softViolations: [], detectedEnvironments: [], rollbackPathPresent: false });
   describe('deriveExitCode (D2)', () => {
     it('pass → 0', () => expect(deriveExitCode(r('pass'))).toBe(0));
     it('disabled → 0', () => expect(deriveExitCode(r('disabled'))).toBe(0));
     it('blocked → 1', () => expect(deriveExitCode(r('blocked'))).toBe(1));
     it('abstained → 3 (ZERO_DENOMINATOR)', () => expect(deriveExitCode(r('abstained'))).toBe(3));
   });
   ```
3. Run: `npx vitest run packages/core/tests/deployment/exit-code.test.ts` — observe failure.
4. Create `packages/core/src/deployment/exit-code.ts` — `deriveExitCode(result): DeploymentExitCode` mapping `pass|disabled → 0`, `blocked → 1`, `abstained → 3`. (ERROR=2 is raised by the CLI on config-parse failure, not here — document that.)
5. Run: `npx vitest run packages/core/tests/deployment/exit-code.test.ts` — expect pass.
6. Run: `harness validate`
7. Commit: `feat(core): deriveExitCode maps deployment status to ExitCode contract`

### Task 7: `DeploymentGateConfigSchema` + wire onto `HarnessConfigSchema`

**Depends on:** Task 1 | **Files:** `packages/cli/src/config/schema.ts`, `packages/core/tests/deployment/schema.test.ts`

> Independent of Tasks 2-6 (touches the CLI schema file, not the engine). Sequence after Task 1 so the core `DeploymentGateConfig` interface exists to compare against.

1. In `packages/cli/src/config/schema.ts`, add near the other gate schemas (e.g. after `VocabularyConfigSchema`, `:509`):
   ```ts
   export const DeploymentGateConfigSchema = z.object({
     /** Master switch. Default true; `false` short-circuits the gate to SUCCESS with an opt-out note. */
     enabled: z.boolean().default(true),
     /** Per-code severity override. 'off' downgrades a HARD rule to advisory.
      *  DEPLOY-SEC001 ignores 'off' (non-waivable, D4). */
     rules: z.record(z.string(), z.enum(['error', 'warn', 'off'])).optional(),
   });
   ```
2. Wire onto `HarnessConfigSchema` (`:908`) alongside `rollback` (`:1018`):
   ```ts
   /** Enforcing pre/post-deploy gate settings (`harness check-deployment`). */
   deployment: DeploymentGateConfigSchema.optional(),
   ```
3. Add the type export next to `RollbackConfig` (`schema.ts:~1130`):
   ```ts
   /** Type for the enforcing deployment-gate configuration. */
   export type DeploymentGateConfig = z.infer<typeof DeploymentGateConfigSchema>;
   ```
4. Create `packages/core/tests/deployment/schema.test.ts` importing `DeploymentGateConfigSchema` from `@harness-engineering/cli` (or its published path) and asserting: `{}` → `{ enabled: true }`; `{ enabled: false }` parses; `{ rules: { 'DEPLOY-ENV001': 'off' } }` parses; an unknown severity value fails. If a cross-package import is awkward, place this test under `packages/cli/tests/config/` instead and adjust the path.
5. Run: `npx vitest run packages/core/tests/deployment/schema.test.ts` (or the cli-tests path) — expect pass. Then `npx tsc --noEmit -p packages/cli/tsconfig.json`.
6. Run: `harness validate`
7. Commit: `feat(cli): add DeploymentGateConfigSchema + wire deployment onto config`

### Task 8: `[checkpoint:human-verify]` — barrel export + full-suite verification

**Depends on:** Tasks 6, 7 | **Files:** `packages/core/src/deployment/index.ts`, `packages/core/src/index.ts` (regenerated) | **Category:** integration

1. Create `packages/core/src/deployment/index.ts` with explicit re-exports (mirror `architecture/index.ts`):
   ```ts
   export { detectDeploymentSurface } from './detect';
   export { evaluateDeploymentGate } from './evaluate';
   export { deriveExitCode } from './exit-code';
   export type {
     DeploymentFsPort, DeploymentSurface, DeploymentFile, DeploymentFinding,
     DeploymentSeverity, DeploymentGateResult, DeploymentGateConfig, DeploymentExitCode,
   } from './types';
   ```
2. Regenerate the auto-generated core top barrel: `pnpm generate:barrels`, then `pnpm generate:barrels:check` — expect no diff and confirm `export * from './deployment';` is present in `packages/core/src/index.ts`.
3. Run the full new suite: `npx vitest run packages/core/tests/deployment/` — all green.
4. Confirm no core→CLI layer break: `git grep -n "@harness-engineering/cli" packages/core/src/deployment` — expect **no matches** (the engine imports only from within core / types).
5. Run: `harness validate` and `harness check-deps` — expect pass.
6. `[checkpoint:human-verify]` — Present: the `deployment/` public surface (`detectDeploymentSurface`, `evaluateDeploymentGate`, `deriveExitCode` + types), green tests for SC2/SC3/SC4/SC5/SC6/SC7/SC8 and the two edge cases, and confirmation the barrel is in sync and no core→CLI import exists. Wait for confirmation before considering Phase 1 complete.
7. Commit (if any barrel/format churn): `chore(core): finalize deployment gate barrel export`

---

## Sequencing

- Task 1 (types + fixtures) gates everything.
- Task 2 → Task 3 → Task 4 → Task 5 are strict sequential TDD on `evaluate.ts` (shared file — do NOT parallelize).
- Task 6 depends on Task 5 (uses `DeploymentGateResult`).
- Task 7 (CLI schema) depends only on Task 1 and touches a different package — may run in parallel with Tasks 2-6.
- Task 8 (barrel + checkpoint) depends on Task 6 and Task 7.

## Traceability

| Observable truth (SC)              | Delivered by      |
| ---------------------------------- | ----------------- |
| SC6 abstain / SC7 disabled         | Task 3            |
| SC2 secret leak (non-waivable, D8) | Task 3            |
| SC4 rollback path (D5)             | Task 4            |
| SC3 promotion gate                 | Task 4            |
| SC8 severity override              | Tasks 3, 4        |
| SC5 soft-only + edge cases         | Task 5            |
| Exit-code contract (D2)            | Task 6            |
| Config schema + wiring             | Task 7            |
| Barrel / validate / layer guard    | Task 8            |

## Concerns

- The core engine cannot import the CLI `ExitCode` enum (layer direction). `deriveExitCode` returns a documented numeric literal; the Phase 2 command owns the `process.exit` mapping and the `ExitCode.ERROR` (2) path for config-parse failures. Flag if the team prefers promoting `ExitCode` into `@harness-engineering/types` for a single source of truth.
- The `rollback` config seam reaches the engine via a `DeploymentGateConfig.rollbackConfigured` passthrough set by the CLI (Phase 2) from `config.rollback != null`. This keeps the engine pure (no re-reading config) and honors D5's "config seam both already read." Phase 2 must wire it.
- Soft-rule heuristics (STAGE001/ENV002/HC001/PERF001) are advisory and never block; they are a defensible first cut over fixtures. Refinement is safe post-Phase-1 because they cannot change an exit code.
