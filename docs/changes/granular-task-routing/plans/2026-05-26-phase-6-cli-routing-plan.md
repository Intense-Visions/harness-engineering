# Plan: Spec B Phase 6 — CLI Routing Tools (`harness routing config|trace|decisions`)

**Date:** 2026-05-26
**Spec:** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/docs/changes/granular-task-routing/proposal.md`
**Worktree:** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1`
**Branch:** `feat/spec-b-phase-1` (HEAD `d9960683`, Phase 5 tip + chore docs regen)
**Phase 6 scope:** ~2 days, small-to-medium complexity (CLI surface only — consumes stable Phase 5 routes)
**Tasks:** 10
**Estimated time:** ~38 min of focused work (one context window per task)
**Integration Tier:** medium
**Phase 6 success criteria:** **F4** (`harness skill run … --backend …` invocation override surfaces via CLI help text), **F7** (`harness routing trace --skill <name>` prints resolved backend + `resolutionPath` without dispatching), **F8** (`harness routing decisions … --json` returns recent decisions in JSON suitable for `jq`), **O3** (`harness routing trace` exits non-zero on resolution failure, JSON includes full `RoutingDecision` on `--json`)

---

## Goal

When an operator runs `harness routing config | trace | decisions` against a live orchestrator (`HARNESS_ORCHESTRATOR_URL`, default `http://127.0.0.1:8080`), the CLI issues the Phase-5 HTTP call (`GET /api/v1/routing/config`, `POST /api/v1/routing/trace`, `GET /api/v1/routing/decisions`) with the `HARNESS_API_TOKEN` bearer header (matches `gateway-tools.ts` precedent), renders either a human-readable table or a `--json` blob, and exits **non-zero** when the orchestrator returns a non-2xx status (specifically O3: trace 5xx → exit non-zero so CI gates catch a misconfigured `routing.default`). `harness skill run --backend` is already implemented (Phase 3) — Phase 6 surfaces the flag in `harness skill run --help`, the generated `harness-commands.md` reference, and the four plugin manifests via `pnpm generate:plugin:all`. No orchestrator changes; no Phase 5 route changes.

---

## Observable Truths (Acceptance Criteria)

1. **EARS — Event-driven (F7 / O3):** When the operator runs `harness routing trace --skill harness-debugging` against a running orchestrator with `routing.skills.harness-debugging = 'local-fast'`, the system shall **(a)** issue `POST /api/v1/routing/trace` with body `{ useCase: { kind: 'skill', skillName: 'harness-debugging' } }` and `Authorization: Bearer ${HARNESS_API_TOKEN}` (when set), **(b)** parse the `{ decision, def }` response, **(c)** print to stdout a human-readable summary including `backendName`, `def.type`, and one line per `resolutionPath` step, and **(d)** exit `0`. Verified by unit test against a `vi.fn()`-mocked `fetch`.
2. **EARS — Event-driven (F7 / O3, JSON path):** When the operator runs `harness routing trace --skill harness-debugging --json`, the system shall print the raw `{ decision, def }` response JSON (pretty, 2-space) to stdout and exit `0`. JSON output shall be `jq`-pipable (single top-level object, no leading prose).
3. **EARS — Unwanted (O3 non-zero exit):** If `POST /api/v1/routing/trace` returns a non-2xx status (e.g., `500` from `BackendRouter.resolve()` throwing on `routing.default` referencing unknown backend, or `503` when the router is not available), then the system shall print the error body to stderr and exit **`ExitCode.ERROR` (2)**. Verified by unit test against `fetch` returning `{ ok: false, status: 500, text: () => 'routing.default produced no available backend' }`.
4. **EARS — Event-driven (F8):** When the operator runs `harness routing decisions --skill harness-debugging --last 10`, the system shall issue `GET /api/v1/routing/decisions?skill=harness-debugging&limit=10` with the bearer header, parse `{ decisions: RoutingDecision[] }`, and print a human-readable table (timestamp, useCase summary, backend, durationMs). `--mode <m>` adds `&mode=<m>`. `--backend <name>` adds `&backend=<name>`. All filters are optional and AND-combined per Phase 5's `parseDecisionsQuery`.
5. **EARS — Event-driven (F8 JSON path):** When the operator adds `--json` to `harness routing decisions`, the system shall print the parsed `{ decisions: [...] }` array as pretty JSON (2-space) and exit `0`. Suitable for `harness routing decisions --json | jq '.decisions[0]'`.
6. **EARS — Event-driven (config):** When the operator runs `harness routing config`, the system shall issue `GET /api/v1/routing/config` with the bearer header, parse `{ routing, resolvedChains, backends }`, and print **two sections** to stdout: (a) "Backends:" (one line per backend name), (b) "Resolved Chains:" — one line per `resolvedChains` key showing `<source>:<key> → [c1(ok), c2(MISSING), …]` where `MISSING` flags `exists: false` candidates. `--json` prints the full response payload as pretty JSON.
7. **EARS — Unwanted (network failure):** If the HTTP call throws (orchestrator not running, connection refused, fetch timeout), then the system shall print `Failed to reach orchestrator at <url>: <error>` to stderr and exit **`ExitCode.ERROR` (2)**. Applies to all three subcommands. Verified by unit test against `fetch` throwing `new Error('ECONNREFUSED')`.
8. **EARS — Unwanted (503):** If any route returns `503` (legacy single-backend config with no `BackendRouter`), then the system shall print `Routing observability not available — orchestrator has no BackendRouter (legacy single-backend config)` to stderr and exit **`ExitCode.ERROR` (2)**. Trace 503 is distinguishable from trace 500 (resolution failure) only by status code in the test mock.
9. **EARS — Ubiquitous (F4 surfacing):** `harness skill run --help` shall include the line documenting `--backend <name>` (already present from Phase 3); `harness routing trace --help` shall include `--skill`, `--mode`, `--json`; `harness routing decisions --help` shall include `--skill`, `--mode`, `--backend`, `--last`, `--json`; `harness routing config --help` shall include `--json`. Verified by snapshot of `harness routing trace --help` output.
10. **EARS — Ubiquitous:** After `pnpm generate:plugin:all`, the four plugin manifest directories (Claude, Cursor, Gemini, Codex) shall include slash-command wrappers for `harness routing config`, `harness routing trace`, `harness routing decisions`. Verified by `pnpm generate:plugin:check` returning clean.
11. **EARS — Ubiquitous:** A new acceptance test file at `packages/cli/src/commands/routing/routing.test.ts` shall pin Observable Truths 1, 3, 4, 7, 8 across at least 5 tests with `fetch` mocked via `vi.spyOn(globalThis, 'fetch')`.
12. **EARS — Ubiquitous:** `harness validate`, `harness check-deps`, `pnpm --filter @harness-engineering/cli typecheck`, and `pnpm generate:plugin:check` shall pass.
13. **EARS — Ubiquitous:** New `createRoutingCommand` shall be registered in `packages/cli/src/commands/_registry.ts` (regenerated via `pnpm run generate-barrel-exports`); no manual edit to `_registry.ts` is committed.
14. **EARS — Ubiquitous (N1, no regression):** All existing tests in `packages/cli/src/commands/skill/`, `packages/cli/src/commands/_registry.ts` consumers, and the Phase 5 acceptance test (`packages/orchestrator/tests/integration/spec-b-phase-5-http-ws.test.ts`) shall continue to pass unchanged.

---

## Uncertainties / Concerns for Operator Sign-Off

| #   | Class         | Concern                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | BLOCKING-LITE | **HTTP client shape.** The CLI already has two precedents: (a) `gateway-tools.ts` (MCP-side: `orchestratorBase()` + `authHeader()` helpers reading `HARNESS_ORCHESTRATOR_URL` / `HARNESS_API_TOKEN`, default `http://127.0.0.1:8080`); (b) `proposals.ts` (uses default `http://127.0.0.1:4577` — a different port, almost certainly stale). **Plan defaults to (a)** — replicate the `gateway-tools.ts` shape inside a new shared module `packages/cli/src/commands/routing/http-client.ts` so the three Phase 6 subcommands share `orchestratorBase()` + `authHeader()`. Alternative: extract `gateway-tools.ts`' helpers into `packages/cli/src/utils/orchestrator-http.ts` and consume from both MCP + CLI. Plan picks per-feature local helper for now (smaller blast radius); operator may prefer the shared util refactor. |
| C2  | BLOCKING-LITE | **Trace command UX — `--skill` required vs optional.** Spec line 264 shows `harness routing trace --skill <name> [--mode <m>] [--json]`. But the route accepts any `RoutingUseCase` (tier, intelligence, isolation, maintenance, chat, skill, mode). **Plan defaults to:** `--skill <name>` is required when neither `--mode` nor any future kind flag is set; if `--mode <m>` is supplied without `--skill`, the CLI sends `{ kind: 'mode', cognitiveMode: m }`; if both `--skill` and `--mode` are supplied, the CLI sends `{ kind: 'skill', skillName, cognitiveMode }` (per spec D12, mode is the skill's declared cognitive mode). No CLI surface for tier/intelligence/isolation traces in Phase 6 — operator can hit the route directly via curl. Reject if Phase 6 should also surface tier/intelligence — adds 1 task.   |
| C3  | BLOCKING-LITE | **Exit code for trace 5xx (O3).** Spec O3: "`harness routing trace` exits non-zero if the dry-run resolution would throw." Plan reads this as **any non-2xx exits `ExitCode.ERROR` (2)**. 4xx (e.g., 400 Zod parse failure) and 5xx (500 resolution throw, 503 router not available) both exit 2. Alternative: 4xx exits `ExitCode.VALIDATION_FAILED` (1) and 5xx exits `ExitCode.ERROR` (2) — gives CI gates a finer signal. Plan picks **single non-zero (2)** because spec O3 doesn't differentiate. Operator may prefer the finer split.                                                                                                                                                                                                                                                                                      |
| C4  | BLOCKING-LITE | **`harness routing decisions` ordering when no filters.** Phase 5 route returns newest-first (D-OP-3, F8). Plan: CLI preserves server order (top of table = most recent). `--last <N>` is forwarded as `&limit=<N>`. Alternative: chronological-ascending in the human-readable table (reads top-to-bottom). Plan picks newest-first to match spec line 380 ("10 most recent records") and Phase 5 contract. Operator may prefer chronological for table readability.                                                                                                                                                                                                                                                                                                                                                             |
| C5  | ASSUMPTION    | **Plugin manifest regeneration is included.** Spec line 499 + 323 require `pnpm generate:plugin:all`. Plan runs both `pnpm run generate-barrel-exports` (Task 8) and `pnpm generate:plugin:all` (Task 9), then `pnpm generate:plugin:check` (Task 10 verification) to confirm no drift. Operator may prefer to skip plugin regen if Phase 6 ships before plugin manifests are due for refresh. Plan keeps it because Phase 6 ships in the same PR as the user-facing `harness routing` surface; manifests should stay in lockstep.                                                                                                                                                                                                                                                                                                |
| C6  | ASSUMPTION    | **No `harness routing` MCP tool wrappers in Phase 6.** Spec section "Integration Points" doesn't list MCP tools; `gateway-tools.ts` covers `trigger_maintenance_job` + `list_gateway_tokens` but routing routes are CLI-facing observability, not agent-facing primitives. Operator may want an MCP `trace_routing_decision` tool — defer to a follow-up Phase or include in Phase 7 (dashboard panel + MCP parity).                                                                                                                                                                                                                                                                                                                                                                                                              |
| C7  | ASSUMPTION    | **Human-readable table shape for `decisions`.** Plan: 4-column table `timestamp (ISO short)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | useCase | backend | durationMs (ms)`. `useCase`rendered as`skill:harness-debugging`/`mode:adversarial-reviewer`/`tier:quick-fix`etc. Operator may prefer JSON-by-default +`--pretty`for the table view (inverts the default). Plan picks human-readable default because the spec wording ("dumps recent decisions in JSON for shell pipelines", line 265) treats`--json` as the pipe-mode flag. |
| C8  | DEFERRABLE    | **`--strict` mode for trace (Phase 5 C8 carryover).** Phase 5 handoff notes: "deferred `--strict` mode for trace (C8) is still open". Plan does NOT add `--strict` in Phase 6 (no orchestrator changes scope). Operator may want it now — would require Phase 5 route widening (`?strict=true` → 400 on unknown skill against catalog) and a Phase 6 CLI flag.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| C9  | DEFERRABLE    | **Test file location convention.** `packages/cli/src/commands/routing/routing.test.ts` (sibling to `index.ts`) matches `skill/`-style. Could split per-subcommand (`config.test.ts`, `trace.test.ts`, `decisions.test.ts`) — Plan keeps single file because total test count is ~7 and all three subcommands share the same `fetch` mock harness. Operator may split if suite grows beyond ~15 tests.                                                                                                                                                                                                                                                                                                                                                                                                                             |

**Decision points the operator should confirm before execution:**

- **D-OP-1 (C1):** **Approve per-feature `routing/http-client.ts` helper** (matches `gateway-tools.ts`). If reject (prefer shared util): Task 1 lifts helpers into `packages/cli/src/utils/orchestrator-http.ts` and refactors `gateway-tools.ts` + `webhook-tools.ts` to consume (adds 2 tasks).
- **D-OP-2 (C2):** **Approve CLI surfacing skill + mode only** for `routing trace`. If reject (also expose tier/intelligence/isolation): Task 4 adds `--tier <t>` and `--intelligence <l>` flags + tests.
- **D-OP-3 (C3):** **Approve single non-zero exit (`ExitCode.ERROR`, 2)** for any trace non-2xx. If reject (4xx vs 5xx split): Task 4 uses `ExitCode.VALIDATION_FAILED` (1) on 4xx, `ExitCode.ERROR` (2) on 5xx.
- **D-OP-4 (C4):** **Approve newest-first ordering in `decisions` table.** Matches Phase 5 server order.
- **D-OP-5 (C5):** **Approve plugin manifest regen in Phase 6 PR.** If reject (defer to a release-prep PR): drop Task 9 + Task 10's `generate:plugin:check` step.
- **D-OP-6 (C7):** **Approve human-readable as default, `--json` opt-in.** Matches `search.ts` convention.

---

## File Map

```
CREATE  packages/cli/src/commands/routing/index.ts
CREATE  packages/cli/src/commands/routing/http-client.ts
CREATE  packages/cli/src/commands/routing/config.ts
CREATE  packages/cli/src/commands/routing/trace.ts
CREATE  packages/cli/src/commands/routing/decisions.ts
CREATE  packages/cli/src/commands/routing/routing.test.ts
MODIFY  packages/cli/src/commands/_registry.ts                 (regenerated by generate-barrel-exports)
MODIFY  plugin manifests under .claude/, .cursor/, .gemini/, .codex/  (regenerated by generate:plugin:all)
MODIFY  docs/reference/cli-commands.md                          (regenerated by generate-docs if applicable)
```

**No orchestrator, types, or core changes.** Phase 6 is a pure CLI surface over the stable Phase 5 routes.

---

## Tasks

### Task 1: Create `routing/http-client.ts` shared helper

**Depends on:** none | **Files:** `packages/cli/src/commands/routing/http-client.ts`

1. Create `packages/cli/src/commands/routing/http-client.ts` with:

   ```ts
   /**
    * Spec B Phase 6: shared HTTP helpers for the `harness routing`
    * subcommand group. Mirrors `packages/cli/src/mcp/tools/gateway-tools.ts`
    * — `orchestratorBase()` reads `HARNESS_ORCHESTRATOR_URL` (default
    * `http://127.0.0.1:8080`); `authHeader()` forwards `HARNESS_API_TOKEN`
    * as `Authorization: Bearer ...`. Both Phase 5 routes use
    * `read-telemetry` scope (D-OP-1 of Phase 5); the legacy
    * `HARNESS_API_TOKEN` resolves as admin in dev mode, so no token
    * configuration is required for localhost orchestrators.
    */
   export function orchestratorBase(): string {
     return process.env['HARNESS_ORCHESTRATOR_URL'] ?? 'http://127.0.0.1:8080';
   }

   export function authHeader(): Record<string, string> {
     const tok = process.env['HARNESS_API_TOKEN'];
     return tok ? { Authorization: `Bearer ${tok}` } : {};
   }

   export interface CallResult<T> {
     ok: boolean;
     status: number;
     body: T | null;
     error?: string;
   }

   /**
    * GET helper. Returns parsed JSON on 2xx, `{ ok:false, status, error }`
    * on non-2xx or network failure. Callers map status → exit code.
    */
   export async function getJson<T>(path: string): Promise<CallResult<T>> {
     try {
       const res = await fetch(`${orchestratorBase()}${path}`, {
         headers: { ...authHeader() },
       });
       const text = await res.text();
       if (!res.ok) return { ok: false, status: res.status, body: null, error: text };
       return { ok: true, status: res.status, body: text ? (JSON.parse(text) as T) : null };
     } catch (err) {
       return {
         ok: false,
         status: 0,
         body: null,
         error: err instanceof Error ? err.message : String(err),
       };
     }
   }

   /**
    * POST helper. Same shape as getJson; serializes body as JSON.
    */
   export async function postJson<T>(path: string, body: unknown): Promise<CallResult<T>> {
     try {
       const res = await fetch(`${orchestratorBase()}${path}`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json', ...authHeader() },
         body: JSON.stringify(body),
       });
       const text = await res.text();
       if (!res.ok) return { ok: false, status: res.status, body: null, error: text };
       return { ok: true, status: res.status, body: text ? (JSON.parse(text) as T) : null };
     } catch (err) {
       return {
         ok: false,
         status: 0,
         body: null,
         error: err instanceof Error ? err.message : String(err),
       };
     }
   }
   ```

2. Run: `pnpm --filter @harness-engineering/cli typecheck` — observe pass.
3. Run: `harness validate` — observe pass.
4. Commit: `feat(cli): add shared http helpers for harness routing subcommands (Spec B Phase 6)`

---

### Task 2: Write `routing/routing.test.ts` red — pin Observable Truths 1, 3, 4, 7, 8

**Depends on:** Task 1 | **Files:** `packages/cli/src/commands/routing/routing.test.ts`

1. Create `packages/cli/src/commands/routing/routing.test.ts`. Use the standard vitest pattern (mirrors `gateway-tools.test.ts`). Mock `fetch` via `vi.spyOn(globalThis, 'fetch')`. Capture stdout/stderr by spying on `console.log` and `console.error`. Use `vi.spyOn(process, 'exit')` to assert exit codes without actually exiting.

2. Test cases (5 minimum):
   - **`harness routing trace --skill harness-debugging` happy path (Truth 1):** mock `fetch` to resolve `{ ok: true, status: 200, text: async () => JSON.stringify({ decision: { backendName: 'local-fast', useCase: { kind: 'skill', skillName: 'harness-debugging' }, resolutionPath: [{ source: 'skill', candidate: 'local-fast', outcome: 'chosen' }], timestamp: '2026-05-26T00:00:00Z', durationMs: 0.5, backendType: 'local' }, def: { type: 'local' } }) }`. Invoke the subcommand action. Assert `console.log` was called with text including `local-fast` and `resolution`; assert no `process.exit` non-zero.
   - **`harness routing trace --json` (Truth 2):** same fetch mock; assert stdout includes pretty-JSON containing `"backendName": "local-fast"`.
   - **`harness routing trace` 500 → exit 2 (Truth 3 / O3):** mock fetch to resolve `{ ok: false, status: 500, text: async () => 'routing.default produced no available backend' }`. Assert `process.exit` called with `2`; assert stderr contains the error body.
   - **`harness routing decisions --skill X --last 3` (Truth 4):** mock fetch GET `/api/v1/routing/decisions?skill=X&limit=3` to return `{ decisions: [<3 fixtures, newest-first>] }`. Assert table includes all 3 backend names; assert URL contains both query params.
   - **`harness routing decisions --json` (Truth 5):** assert pretty JSON containing `"decisions"` key.
   - **Network failure → exit 2 (Truth 7):** mock fetch to throw `new Error('ECONNREFUSED')`. Assert `process.exit(2)`; assert stderr contains `Failed to reach orchestrator`.
   - **503 path (Truth 8):** mock fetch to resolve `{ ok: false, status: 503, text: async () => '{"error":"BackendRouter not available"}' }`. Assert `process.exit(2)`; assert stderr contains `Routing observability not available`.

3. Run: `pnpm --filter @harness-engineering/cli test -- routing/routing.test.ts` — observe **all tests FAIL** (subcommand files don't exist yet). The failure mode is "Cannot find module './config'" or equivalent.

4. Commit: `test(cli): pin Spec B Phase 6 harness routing subcommand contracts (red)`

---

### Task 3: Implement `routing/config.ts` (Truth 6, Truth 7, Truth 8)

**Depends on:** Task 2 | **Files:** `packages/cli/src/commands/routing/config.ts`

1. Create `packages/cli/src/commands/routing/config.ts`:

   ```ts
   import { Command } from 'commander';
   import { getJson } from './http-client';
   import { logger } from '../../output/logger';
   import { ExitCode } from '../../utils/errors';

   interface ConfigResponse {
     routing: unknown;
     resolvedChains: Record<string, { candidate: string; exists: boolean }[]>;
     backends: string[];
   }

   function renderHuman(data: ConfigResponse): void {
     console.log('Backends:');
     for (const b of data.backends) console.log(`  - ${b}`);
     console.log('\nResolved Chains:');
     for (const [key, chain] of Object.entries(data.resolvedChains)) {
       const rendered = chain
         .map((c) => (c.exists ? c.candidate : `${c.candidate}(MISSING)`))
         .join(' -> ');
       console.log(`  ${key}: ${rendered}`);
     }
   }

   export function createConfigCommand(): Command {
     return new Command('config')
       .description('Print active routing config and resolved fallback chains')
       .option('--json', 'Emit JSON to stdout instead of human-readable text')
       .action(async (opts: { json?: boolean }) => {
         const r = await getJson<ConfigResponse>('/api/v1/routing/config');
         if (!r.ok) {
           if (r.status === 0) {
             logger.error(
               `Failed to reach orchestrator at ${process.env['HARNESS_ORCHESTRATOR_URL'] ?? 'http://127.0.0.1:8080'}: ${r.error}`
             );
           } else if (r.status === 503) {
             logger.error(
               'Routing observability not available — orchestrator has no BackendRouter (legacy single-backend config)'
             );
           } else {
             logger.error(`Request failed (${r.status}): ${r.error}`);
           }
           process.exit(ExitCode.ERROR);
           return;
         }
         if (opts.json) {
           console.log(JSON.stringify(r.body, null, 2));
           return;
         }
         renderHuman(r.body!);
       });
   }
   ```

2. Run: `pnpm --filter @harness-engineering/cli typecheck` — observe pass.
3. Run: `harness validate` — observe pass.
4. Commit: `feat(cli): harness routing config — GET /api/v1/routing/config consumer (Spec B Phase 6)`

---

### Task 4: Implement `routing/trace.ts` (Truth 1, 2, 3, 7, 8 / O3)

**Depends on:** Task 3 | **Files:** `packages/cli/src/commands/routing/trace.ts`

1. Create `packages/cli/src/commands/routing/trace.ts`:

   ```ts
   import { Command } from 'commander';
   import { postJson } from './http-client';
   import { logger } from '../../output/logger';
   import { ExitCode } from '../../utils/errors';
   import type { RoutingDecision, RoutingUseCase } from '@harness-engineering/types';

   interface TraceResponse {
     decision: RoutingDecision;
     def: { type: string };
   }

   function buildUseCase(opts: { skill?: string; mode?: string }): RoutingUseCase | null {
     if (opts.skill) {
       const uc: RoutingUseCase = opts.mode
         ? { kind: 'skill', skillName: opts.skill, cognitiveMode: opts.mode }
         : { kind: 'skill', skillName: opts.skill };
       return uc;
     }
     if (opts.mode) return { kind: 'mode', cognitiveMode: opts.mode };
     return null;
   }

   function renderHuman(r: TraceResponse): void {
     console.log(`Backend: ${r.decision.backendName} (type: ${r.def.type})`);
     console.log(`Duration: ${r.decision.durationMs.toFixed(2)} ms`);
     console.log('Resolution path:');
     for (const step of r.decision.resolutionPath) {
       console.log(`  ${step.source}:${step.candidate} -> ${step.outcome}`);
     }
   }

   export function createTraceCommand(): Command {
     return new Command('trace')
       .description('Dry-run a routing decision without dispatching (Spec B F7)')
       .option('--skill <name>', 'Skill name to trace')
       .option('--mode <m>', 'Cognitive mode to trace (or attach to --skill per D12)')
       .option('--json', 'Emit JSON to stdout instead of human-readable text')
       .action(async (opts: { skill?: string; mode?: string; json?: boolean }) => {
         const useCase = buildUseCase(opts);
         if (!useCase) {
           logger.error('Either --skill <name> or --mode <m> is required');
           process.exit(ExitCode.ERROR);
           return;
         }
         const r = await postJson<TraceResponse>('/api/v1/routing/trace', { useCase });
         if (!r.ok) {
           if (r.status === 0) {
             logger.error(
               `Failed to reach orchestrator at ${process.env['HARNESS_ORCHESTRATOR_URL'] ?? 'http://127.0.0.1:8080'}: ${r.error}`
             );
           } else if (r.status === 503) {
             logger.error(
               'Routing observability not available — orchestrator has no BackendRouter (legacy single-backend config)'
             );
           } else {
             logger.error(`Trace failed (${r.status}): ${r.error}`);
           }
           process.exit(ExitCode.ERROR);
           return;
         }
         if (opts.json) {
           console.log(JSON.stringify(r.body, null, 2));
           return;
         }
         renderHuman(r.body!);
       });
   }
   ```

2. Run: `pnpm --filter @harness-engineering/cli test -- routing/routing.test.ts` — observe **the trace happy-path, JSON, 500-exit, network-failure, and 503 tests now pass**. The 4 `decisions` tests still fail (next task).
3. Run: `harness validate` — observe pass.
4. Commit: `feat(cli): harness routing trace — POST /api/v1/routing/trace consumer with non-zero exit on failure (Spec B Phase 6, F7, O3)`

---

### Task 5: Implement `routing/decisions.ts` (Truth 4, 5, 7, 8)

**Depends on:** Task 4 | **Files:** `packages/cli/src/commands/routing/decisions.ts`

1. Create `packages/cli/src/commands/routing/decisions.ts`:

   ```ts
   import { Command } from 'commander';
   import { getJson } from './http-client';
   import { logger } from '../../output/logger';
   import { ExitCode } from '../../utils/errors';
   import type { RoutingDecision, RoutingUseCase } from '@harness-engineering/types';

   interface DecisionsResponse {
     decisions: RoutingDecision[];
   }

   function summarizeUseCase(uc: RoutingUseCase): string {
     switch (uc.kind) {
       case 'skill':
         return uc.cognitiveMode
           ? `skill:${uc.skillName}/${uc.cognitiveMode}`
           : `skill:${uc.skillName}`;
       case 'mode':
         return `mode:${uc.cognitiveMode}`;
       case 'tier':
         return `tier:${uc.tier}`;
       case 'intelligence':
         return `intelligence:${uc.layer}`;
       case 'isolation':
         return `isolation:${uc.tier}`;
       case 'maintenance':
         return 'maintenance';
       case 'chat':
         return 'chat';
     }
   }

   function shortIso(iso: string): string {
     // 2026-05-26T12:34:56.789Z -> 12:34:56.789
     const t = iso.split('T')[1] ?? iso;
     return t.replace('Z', '');
   }

   function renderHuman(data: DecisionsResponse): void {
     if (data.decisions.length === 0) {
       console.log('(no decisions in buffer)');
       return;
     }
     console.log('TIMESTAMP     USE-CASE                              BACKEND        DURATION');
     for (const d of data.decisions) {
       const ts = shortIso(d.timestamp).padEnd(13);
       const uc = summarizeUseCase(d.useCase).padEnd(38);
       const be = d.backendName.padEnd(14);
       const dur = `${d.durationMs.toFixed(2)} ms`;
       console.log(`${ts} ${uc} ${be} ${dur}`);
     }
   }

   function buildQuery(opts: {
     skill?: string;
     mode?: string;
     backend?: string;
     last?: string;
   }): string {
     const p = new URLSearchParams();
     if (opts.skill) p.set('skill', opts.skill);
     if (opts.mode) p.set('mode', opts.mode);
     if (opts.backend) p.set('backend', opts.backend);
     if (opts.last) p.set('limit', opts.last);
     const q = p.toString();
     return q ? `?${q}` : '';
   }

   export function createDecisionsCommand(): Command {
     return new Command('decisions')
       .description('List recent routing decisions from the orchestrator ring buffer (Spec B F8)')
       .option('--skill <name>', 'Filter by useCase.skillName')
       .option('--mode <m>', 'Filter by useCase.cognitiveMode')
       .option('--backend <name>', 'Filter by chosen backendName')
       .option('--last <N>', 'Limit to the N most recent decisions')
       .option('--json', 'Emit JSON to stdout instead of human-readable text')
       .action(
         async (opts: {
           skill?: string;
           mode?: string;
           backend?: string;
           last?: string;
           json?: boolean;
         }) => {
           const query = buildQuery(opts);
           const r = await getJson<DecisionsResponse>(`/api/v1/routing/decisions${query}`);
           if (!r.ok) {
             if (r.status === 0) {
               logger.error(
                 `Failed to reach orchestrator at ${process.env['HARNESS_ORCHESTRATOR_URL'] ?? 'http://127.0.0.1:8080'}: ${r.error}`
               );
             } else if (r.status === 503) {
               logger.error(
                 'Routing observability not available — orchestrator has no BackendRouter (legacy single-backend config)'
               );
             } else {
               logger.error(`Request failed (${r.status}): ${r.error}`);
             }
             process.exit(ExitCode.ERROR);
             return;
           }
           if (opts.json) {
             console.log(JSON.stringify(r.body, null, 2));
             return;
           }
           renderHuman(r.body!);
         }
       );
   }
   ```

2. Run: `pnpm --filter @harness-engineering/cli test -- routing/routing.test.ts` — observe **all tests pass**.
3. Run: `harness validate` — observe pass.
4. Commit: `feat(cli): harness routing decisions — GET /api/v1/routing/decisions consumer with filters (Spec B Phase 6, F8)`

---

### Task 6: Create `routing/index.ts` and register subcommands

**Depends on:** Task 5 | **Files:** `packages/cli/src/commands/routing/index.ts`

1. Create `packages/cli/src/commands/routing/index.ts`:

   ```ts
   import { Command } from 'commander';
   import { createConfigCommand } from './config';
   import { createTraceCommand } from './trace';
   import { createDecisionsCommand } from './decisions';

   /**
    * Spec B Phase 6: `harness routing` subcommand group. Operator-facing
    * inspection of routing config, dry-run trace, and recent decisions.
    * Consumes the Phase 5 routes under `/api/v1/routing/{config,trace,decisions}`.
    */
   export function createRoutingCommand(): Command {
     const cmd = new Command('routing').description(
       'Inspect routing config, trace decisions, and read recent dispatches'
     );
     cmd.addCommand(createConfigCommand());
     cmd.addCommand(createTraceCommand());
     cmd.addCommand(createDecisionsCommand());
     return cmd;
   }
   ```

2. Run: `pnpm --filter @harness-engineering/cli typecheck` — observe pass.
3. Run: `harness validate` — observe pass.
4. Commit: `feat(cli): wire harness routing subcommand group (Spec B Phase 6)`

---

### Task 7: Regenerate `_registry.ts` (barrel exports)

**Depends on:** Task 6 | **Files:** `packages/cli/src/commands/_registry.ts`

1. Run: `pnpm run generate-barrel-exports` (or `pnpm --filter @harness-engineering/cli run generate-barrel-exports` if scoped — confirm script name in root `package.json` first; see header note in `_registry.ts`: "Run `pnpm run generate-barrel-exports` to regenerate").
2. Verify `_registry.ts` now imports `createRoutingCommand` from `./routing` and that the alphabetically-correct position is taken (between `createRoadmapCommand` and `createScanCommand` per current alphabetical ordering — line 57-58 region).
3. Run: `pnpm --filter @harness-engineering/cli typecheck` — observe pass.
4. Run: `pnpm --filter @harness-engineering/cli build` — observe pass.
5. Run: `harness validate` — observe pass.
6. Commit: `chore(cli): regenerate _registry.ts with createRoutingCommand (Spec B Phase 6)`

---

### Task 8: `[checkpoint:human-verify]` Smoke-test CLI help text (Truth 9)

**Depends on:** Task 7 | **Files:** none (verification-only)

1. Run: `pnpm --filter @harness-engineering/cli build` to ensure the latest binary is wired.
2. Run from worktree root:
   ```bash
   pnpm exec harness routing --help
   pnpm exec harness routing config --help
   pnpm exec harness routing trace --help
   pnpm exec harness routing decisions --help
   pnpm exec harness skill run --help
   ```
3. **Verify** each prints the expected flags:
   - `routing` group: lists `config`, `trace`, `decisions` subcommands.
   - `config`: `--json`.
   - `trace`: `--skill`, `--mode`, `--json`.
   - `decisions`: `--skill`, `--mode`, `--backend`, `--last`, `--json`.
   - `skill run`: includes the `--backend <name>` line from Phase 3 ("Spec B: one-shot routing override forwarded …").
4. **[checkpoint:human-verify]** Operator confirms help output looks correct (no Commander argument-parse warnings, no missing flags).
5. Commit (verification-only, no file changes): skip commit — this is a checkpoint, not an artifact-producing task.

---

### Task 9: Regenerate plugin manifests for Claude/Cursor/Gemini/Codex (Truth 10)

**Depends on:** Task 8 | **Files:** plugin manifest directories under `.claude/`, `.cursor/`, `.gemini/`, `.codex/` (paths determined by `scripts/lib/plugin-config.mjs`)

1. Run: `pnpm generate:plugin:all` (this runs `generate:plugin:claude && :cursor && :gemini && :codex` per root `package.json:39`).
2. Verify the output directories now contain slash-command wrappers naming `harness routing config`, `harness routing trace`, `harness routing decisions`. The generator reads `harness <subcommand> --help` from the built CLI; if the build is stale, the new commands will be missing.
3. Run: `git status` — observe the four plugin dirs have new/modified files.
4. Run: `pnpm generate:plugin:check` — observe **clean exit** (no drift between regenerated artifacts and what's just been committed).
5. Run: `harness validate` — observe pass.
6. Commit: `chore(plugin-manifests): regenerate Claude/Cursor/Gemini/Codex manifests with harness routing commands (Spec B Phase 6)`

---

### Task 10: Final verification + Phase 6 acceptance gate (Truth 11, 12, 14)

**Depends on:** Task 9 | **Files:** none (verification-only)

1. Run from worktree root:
   ```bash
   pnpm --filter @harness-engineering/cli typecheck
   pnpm --filter @harness-engineering/cli test -- routing/routing.test.ts
   pnpm --filter @harness-engineering/cli test
   pnpm --filter @harness-engineering/orchestrator test -- spec-b-phase-5-http-ws.test.ts
   pnpm generate:plugin:check
   harness validate
   harness check-deps
   ```
2. **Assert** all of the following:
   - `cli typecheck` exits 0
   - `routing/routing.test.ts` all green (≥5 tests)
   - Full `cli` test suite passes with no new failures (baseline: see `verification.fullOrchestratorSuite` from Phase 5 handoff — track CLI-package failures separately)
   - Phase 5 acceptance test (`spec-b-phase-5-http-ws.test.ts`) still 6/6 green (N1)
   - `pnpm generate:plugin:check` exits clean
   - `harness validate` exits 0
   - `harness check-deps` exits 0
3. **Map back to Phase 6 success criteria:**
   - **F4** verified by Task 8 help-text inspection (`harness skill run --help` shows `--backend`).
   - **F7** verified by `routing/routing.test.ts` trace happy-path test (Task 2/Task 4).
   - **F8** verified by `routing/routing.test.ts` decisions happy-path test (Task 2/Task 5).
   - **O3** verified by `routing/routing.test.ts` trace 500-exit test (Task 2/Task 4).
4. Commit (test-update-only if any baseline shifts; verification-only otherwise): if any test fixture needed an update, commit it now with `test(cli): pin Spec B Phase 6 acceptance — F4 F7 F8 O3 verified`.
5. **[checkpoint:human-verify]** Operator confirms all 7 verifications pass and the Phase 6 PR is ready for review.

---

## Sequencing Summary

| Order | Task | Time   | Category      | Parallelizable                  |
| ----- | ---- | ------ | ------------- | ------------------------------- |
| 1     | 1    | ~3 min | impl (helper) | no — root dependency            |
| 2     | 2    | ~5 min | test (red)    | no — depends on Task 1's helper |
| 3     | 3    | ~4 min | impl          | no                              |
| 4     | 4    | ~5 min | impl          | no                              |
| 5     | 5    | ~5 min | impl          | no                              |
| 6     | 6    | ~2 min | impl (wiring) | no                              |
| 7     | 7    | ~2 min | integration   | no                              |
| 8     | 8    | ~3 min | checkpoint    | no                              |
| 9     | 9    | ~4 min | integration   | no                              |
| 10    | 10   | ~5 min | acceptance    | no                              |

**Total:** ~38 minutes of focused work. Tasks 3, 4, 5 could in principle parallelize (independent files, all under `routing/`) but the TDD harness in Task 2 needs the test file present before any of them produces a green test, so the dependency chain is linear (Task 2 → 3 → 4 → 5) under TDD red→green discipline.

---

## Skill Annotations

- **Task 1, 3, 4, 5, 6:** `harness-tdd` (apply) — TDD red/green discipline; small atomic commits.
- **Task 2:** `harness-tdd` (apply) — write failing test before any implementation.
- **Task 7, 9:** `harness-generators` (reference if available) — regenerator pattern for `_registry.ts` and plugin manifests.
- **Task 8, 10:** `harness-soundness-review` (reference) — verification gating before phase completion.

(No `SKILLS.md` recommendation file exists for this spec; annotations inferred from task domain.)

---

## Out of Scope

- **Phase 7:** Dashboard `/routing` panel (`packages/dashboard/src/routes/`). Cards: Resolved Chains, Recent Decisions, Per-Backend Volume, Trace Tool. WS subscription to `routing:decision`. Spec lines 270-279, 503-514.
- **Phase 8:** Docs + ADRs + knowledge-graph enrichment. 5 ADRs, updates to `docs/knowledge/orchestrator/`, new `docs/guides/routing-trace.md`. Spec lines 332-348, 516-529.
- **`--strict` mode for `trace`:** Phase 5 C8 carryover — deferred.
- **MCP wrappers for routing routes:** No `trace_routing_decision` MCP tool in Phase 6 (per C6 assumption).
- **`harness dispatch --backend` CLI ergonomics:** Spec line 267 lists this but it's already wired in Phase 3 (per Phase 5 handoff `outOfScope.Phase6`); no Phase 6 CLI change needed beyond help-text snapshot in Task 8.

---

## Handoff Trigger (after Task 10 verification)

When all Task 10 verifications pass:

1. Write `.harness/sessions/changes--granular-task-routing--proposal/handoff.json` with `phase: "Spec B Phase 6 — CLI Routing Tools"`, `status: "complete"`, the 7-10 commit shas, and `successCriteriaPinned` for F4/F7/F8/O3.
2. Surface Phase 7 (dashboard panel) as the next phase. Phase 7 depends on the Phase 5 WS topic + `/api/v1/routing/config` route, which are stable; the new `harness routing config` CLI command is also useful for dashboard developers to introspect orchestrator state during component dev.
