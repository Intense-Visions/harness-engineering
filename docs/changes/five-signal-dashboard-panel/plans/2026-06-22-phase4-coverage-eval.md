# Plan: Phase 4 — Coverage-Trend + Eval-Fail-Rate Signal Providers

**Date:** 2026-06-22 | **Spec:** docs/changes/five-signal-dashboard-panel/proposal.md (Implementation Order item 4) | **Tasks:** 8 | **Time:** ~36 min | **Integration Tier:** medium | **Rigor:** standard | **Validate policy:** no-regression (baseline 290; zero new findings; no `#NNN` hex false-positives in test literals)

## Goal

Ship the final two signal providers — `coverage-trend-down-30d` (`coverage-trend.ts`, derived from the git history of `coverage-baselines.json`, degrading to `error` when no coverage source exists) and `eval-fail-rate` (`eval-fail-rate.ts`, derived from graph `execution_outcome` nodes, returning `pending` when none exist) — with full unit tests that feed data in the REAL production shapes. No gatherer/route/client (Phases 5–6).

## Observable Truths (Acceptance Criteria)

1. The system shall expose `coverageTrendProvider` with `id: 'coverage-trend-down-30d'`, `betterDirection: 'up'`, `threshold: { warn: -1, alert: -5 }`, `unit: '%'`.
2. When the git history of `coverage-baselines.json` over the last 30 days yields ≥1 commit, the provider shall read each commit's file content (`git show <sha>:coverage-baselines.json`), compute the mean `lines` percentage across packages per commit, bucket by `YYYY-MM-DD`, and report the latest mean as `value`.
3. When ≥2 distinct daily points exist, the provider shall compute the 30-day delta `latest − earliest` (percentage points) and set status: `delta <= alert(-5) → 'alert'`, `delta <= warn(-1) → 'warn'`, else `'ok'`; trend is `down` when latest < earliest, `up` when latest > earliest, else `flat`.
4. If no coverage source is usable (git rejects, the file was never tracked, or zero parseable commits in the window), then `coverageTrendProvider` shall return `status: 'error'`, `value: null`, `history: []`, and a `detail` explaining how to enable coverage tracking (run the test suite with coverage + `node scripts/coverage-ratchet.mjs --update`) — and shall NOT throw.
5. The system shall expose `evalFailRateProvider` with `id: 'eval-fail-rate'`, `betterDirection: 'down'`, `threshold: { warn: 5, alert: 10 }`, `unit: '%'`.
6. When the graph contains `execution_outcome` nodes whose `metadata.timestamp` falls in the last 30 days, the provider shall compute the fail fraction `failures / (failures + successes) × 100` (verdict read from `metadata.result === 'failure'` vs `'success'`), report it as `value`, and set status `value > alert(10) → 'alert'`, `value > warn(5) → 'warn'`, else `'ok'`.
7. When ZERO `execution_outcome` nodes exist in the graph (outcome-eval not yet shipped), `evalFailRateProvider` shall return `status: 'pending'`, `value: null`, `history: []`, and a `detail` noting the `harness:outcome-eval` graph dependency — with NO import of any outcome-eval code.
8. If `ctx.graphStore` is absent or `findNodes` throws (graph missing/unloadable), then `evalFailRateProvider` shall return `status: 'error'`, `value: null`, and shall NOT throw.
9. `harness validate` shall report no more than 290 issues (no new findings) after the change, with no `#NNN` hardcoded-color false-positives introduced by node-ID or coverage-percentage test literals.

## Discovery (verified against the live repo)

### (a) Coverage data source and shape — VERIFIED

- **[VERIFIED] The only coverage artifact in the repo is `coverage-baselines.json` at the repo ROOT.** No `coverage-summary.json` is committed (it is a per-package CI-only build artifact under `packages/*/coverage/`, git-ignored). Confirmed by `find -name coverage-summary.json` → none tracked; `find -iname '*coverage*.json'` → only `./coverage-baselines.json`.
- **[VERIFIED] Shape of `coverage-baselines.json`** (`coverage-baselines.json:1-44`) — a flat object keyed by package path, each value an object of metric percentages:
  ```jsonc
  {
    "packages/core": { "lines": 91.17, "branches": 75.8, "functions": 92.44, "statements": 88.73 },
    "packages/graph": { "lines": 96.34, "branches": 82.03, "functions": 96.9, "statements": 94.59 },
    // ... 7 packages total
  }
  ```
  **There is NO timestamp and NO history in the file** — it is a point-in-time snapshot, overwritten in place by `scripts/coverage-ratchet.mjs --update` (`scripts/coverage-ratchet.mjs:112-126`, `writeFileSync(BASELINES_PATH, ...)`).
- **[VERIFIED] The file IS git-tracked and CI commits it.** `.github/workflows/ci.yml` (refresh-baselines job, line ~137 `node scripts/coverage-ratchet.mjs --update`, line ~151 `git add ... coverage-baselines.json`) commits it as `github-actions[bot]` with message `chore: refresh baselines after merge [skip ci]`. `git log --since=30.days -- coverage-baselines.json` → **44 commits** in the window (100 all-time). Each commit's historical content is recoverable via `git show <sha>:coverage-baselines.json`.
- **DERIVATION DECISION:** Because there is no native coverage time-series, the 30-day trend is derived from the **git history of `coverage-baselines.json`** — exactly the hybrid-derive pattern already used by `baseline-updates.ts`, using the same injectable `CommandRunner`. One `git log` call lists `<sha> <YYYY-MM-DD>` over the window (file-scoped); then per commit `git show <sha>:coverage-baselines.json` reads the snapshot, from which the provider computes the **mean `lines%` across all packages** as that commit's coverage value. Derived daily points are backfilled into `SignalTimelineStore` and the current day mirrored, matching the established providers. If git rejects or no commit yields a parseable snapshot, the provider degrades to `status: 'error'` per truth #4 — never crashes.
- **[VERIFIED] `git show <sha>:coverage-baselines.json` returns historical file content** (confirmed against a real SHA; the revspec is `<sha>:coverage-baselines.json` — no `--` needed when the path is part of the `rev:path` token).

### (b) execution_outcome node shape — VERIFIED (where verdict + timestamp live)

- **[VERIFIED] `execution_outcome` is a registered node type** (`packages/graph/src/types.ts:28`).
- **[VERIFIED] Node is created by `ExecutionOutcomeConnector.ingest`** (`packages/intelligence/src/outcome/connector.ts:21-41`) as:
  ```ts
  store.addNode({
    id: outcome.id, // e.g. 'outcome:<issueId>:<attempt>'
    type: 'execution_outcome',
    name: `${outcome.result}: ${outcome.identifier}`,
    metadata: {
      issueId,
      identifier,
      result: outcome.result, // 'success' | 'failure'   ← VERDICT lives here
      retryCount,
      failureReasons,
      durationMs,
      linkedSpecId,
      timestamp: outcome.timestamp, // ISO string             ← TIMESTAMP lives here
      // optional: agentPersona, taskType
    },
  });
  ```
- **[VERIFIED] Verdict = `node.metadata.result`** (`'success' | 'failure'`, source type `packages/intelligence/src/outcome/types.ts:16`). **Timestamp = `node.metadata.timestamp`** (ISO string, `types.ts:27-28`). Because `GraphNode.metadata` is typed `Record<string, unknown>` (`packages/graph/src/types.ts:127`), the provider must narrow both fields defensively (skip nodes whose `result` is not `'success'|'failure'` or whose `timestamp` is not a parseable ISO string) — mirroring `effectiveness/scorer.ts:60-64`.
- **[VERIFIED] Read path:** `graphStore.findNodes({ type: 'execution_outcome' })` returns `GraphNode[]` (`packages/graph/src/store/GraphStore.ts:90`). This is the exact call used by `effectiveness/scorer.ts:59` and `specialization/persistence.ts:64`. NO outcome-eval import — only the node-shape contract is shared (spec Decision #2).
- **[VERIFIED] In-memory graph for tests:** `GraphStore` has a no-arg constructor and a public `addNode({ id, type, name, metadata })` (`GraphStore.ts:69`). The eval test builds a `new GraphStore()`, adds `execution_outcome` nodes directly, and passes it as `ctx.graphStore` — no disk save/load needed. The dashboard's real load path is `new GraphStore()` + `store.load(join(projectPath, '.harness/graph'))` (`gather/graph.ts`), wired in Phase 5; Phase 4 keeps the provider pure over the injected store.

### Conventions reused (VERIFIED)

- **[VERIFIED] Provider shape:** `SignalProvider` `{ id, label, compute(ctx) }` with module-level `SIGNAL_ID/LABEL/SOURCE/UNIT/THRESHOLD/WINDOW_DAYS` consts, a local `errorResult(detail)` helper, `toDate(iso)` truncating to `YYYY-MM-DD`, status laddering, and `try/catch` returning `errorResult` — established by `complexity-trend.ts`, `baseline-updates.ts`, `pr-review.ts`.
- **[VERIFIED] CommandRunner injection:** `ctx.runCommand ?? defaultCommandRunner` (`command-runner.ts`); tests pass a mock `CommandRunner`.
- **[VERIFIED] Timeline caching:** `ctx.timeline.backfill(id, points)` then `ctx.timeline.appendPoint(id, toDate(ctx.now.toISOString()), value)`.
- **[VERIFIED] Test layout:** `packages/dashboard/tests/server/signals/providers/*.test.ts`, vitest, fs-tmpdir per test, `ctx(root, now, runCommand?)` helper. Runner: `pnpm --filter @harness-engineering/dashboard test` (= `vitest run`).
- **[VERIFIED] Baseline:** `harness validate` = exactly **290** issues pre-change (all pre-existing design-token/hardcoded-color findings, including `#NNN`-style graph-ID/test-literal false-positives unrelated to signals).

## File Map

- CREATE `packages/dashboard/src/server/signals/providers/coverage-trend.ts`
- CREATE `packages/dashboard/src/server/signals/providers/eval-fail-rate.ts`
- CREATE `packages/dashboard/tests/server/signals/providers/coverage-trend.test.ts`
- CREATE `packages/dashboard/tests/server/signals/providers/eval-fail-rate.test.ts`

(No `types.ts` change required — `SignalContext` already carries optional `runCommand` and optional `graphStore`. No registry change — `registry.ts` is Phase 5.)

## Skeleton

1. `coverage-trend` provider with TDD (derive from git history of `coverage-baselines.json`; graceful `error`) (~2 tasks, ~11 min)
2. `eval-fail-rate` provider with TDD (graph `execution_outcome`; `pending` + `error` paths) (~2 tasks, ~11 min)
3. Coverage degradation + window edge tests (~1 task, ~5 min)
4. Eval pending/error + window edge tests (~1 task, ~5 min)
5. Full-suite validation + handoff (~2 tasks, ~4 min)

**Estimated total:** 8 tasks, ~36 minutes. _Skeleton approved: pending sign-off._

## Uncertainties

- [ASSUMPTION] The single coverage scalar per commit is the **mean of `lines%` across all packages** in that commit's `coverage-baselines.json`. Rationale: `lines` is the metric `coverage-ratchet.mjs` reports first and is the most intuitive aggregate; the spec only requires "a coverage trend." If the team later prefers weighted-by-LOC or `statements`, it is a one-line change in a single `aggregateCoverage()` helper. Documented in `coverage-trend.ts`.
- [ASSUMPTION] Coverage history granularity is per-commit bucketed to per-day (last write per day wins via `appendPoint` idempotency + sort). Multiple refresh commits on one day collapse to one daily point; acceptable for a 30-day sparkline.
- [ASSUMPTION] `eval-fail-rate` history is bucketed by the UTC day of `metadata.timestamp`; each day's point is that day's fail-rate. The reported `value` is the **overall 30-day fail fraction** (all windowed outcomes), not the last day's — matching truth #6.
- [DEFERRABLE] `git show` is invoked once per in-window commit (≤44 today; bounded by the 30-day file-scoped `git log`). If this ever proves slow, Phase 5 can add gh/git caching via `gather-cache.ts`; Phase 4 keeps the provider pure over the injected runner.
- [DEFERRABLE] Exact `detail` wording.

## Tasks

### Task 1: TDD red — coverage-trend test feeding REAL coverage-baselines.json shape + real git wire format

**Depends on:** none | **Files:** `packages/dashboard/tests/server/signals/providers/coverage-trend.test.ts`

1. Create the test file. Mirror `baseline-updates.test.ts` structure (fs-tmpdir `__test-tmp-coverage-trend__`, `beforeEach/afterEach`, `ctx(root, now, runCommand)` helper building `{ projectPath, now, timeline: new SignalTimelineStore(root), runCommand }`).
2. The mock `CommandRunner` must reproduce BOTH real shapes:
   - For `git log` (args contain `'log'`): return git's REAL wire format — records joined by `'\n'`, NO trailing terminator. Each record is `<sha>\x1f<YYYY-MM-DD>` (matching the `--pretty=format:%H\x1f%cd --date=short` the provider will request). Helper `gitLog(records: [sha,date][]) => records.map(([s,d]) => `${s}\x1f${d}`).join('\n')`.
   - For `git show` (args contain `'show'`): return a JSON string in the REAL `coverage-baselines.json` shape, keyed per package with `{lines,branches,functions,statements}` numbers. Helper `covSnapshot(lines: number)` returns `JSON.stringify({ 'packages/core': { lines, branches: 70, functions: 90, statements: 85 }, 'packages/graph': { lines, branches: 80, functions: 95, statements: 92 } })` (mean lines = `lines`). The runner dispatches on `args[0]`/whether `args` includes `'show'` and returns the snapshot for the SHA encoded in the `rev:path` arg.
   - IMPORTANT: use clean numeric coverage values and `outcome`/`packages/...` string literals only — NO bare 3-hex tokens like `#abc` that the validator flags as hardcoded colors.
3. Write the first three test cases (all currently failing — provider does not exist):
   - `'exposes the correct static contract'` → `id === 'coverage-trend-down-30d'`, `label.length > 0`.
   - `'computes latest mean-lines value and a down/alert trend over 30d'`: `now = 2026-06-22`; git log returns `[['s1','2026-06-01'],['s2','2026-06-22']]`; `git show s1:...` → mean lines 90, `git show s2:...` → mean lines 84 (delta −6 ⇒ alert). Assert `value===84`, `unit==='%'`, `betterDirection==='up'`, `threshold==={warn:-1,alert:-5}`, `trend==='down'`, `status==='alert'`, and `history` has two points with mean-lines values 90 then 84.
   - `'reports warn at −1..−5 delta and ok above −1'`: two scenarios (delta −2 ⇒ warn; delta 0 ⇒ ok).
4. Run: `pnpm --filter @harness-engineering/dashboard exec vitest run tests/server/signals/providers/coverage-trend.test.ts` — observe failure (module not found).

### Task 2: TDD green — implement coverage-trend.ts

**Depends on:** Task 1 | **Files:** `packages/dashboard/src/server/signals/providers/coverage-trend.ts`

1. Create the provider mirroring `baseline-updates.ts`. Consts: `SIGNAL_ID='coverage-trend-down-30d'`, `LABEL='Coverage trend (30d)'`, `SOURCE="git history of coverage-baselines.json"`, `UNIT='%'`, `THRESHOLD={warn:-1,alert:-5}`, `WINDOW_DAYS=30`, `COVERAGE_FILE='coverage-baselines.json'`, `US='\x1f'`.
2. `errorResult(detail)` helper (betterDirection `'up'`, status `'error'`, value `null`, history `[]`).
3. A `z` schema `CoverageBaselinesSchema = z.record(z.string(), z.object({ lines: z.number(), branches: z.number(), functions: z.number(), statements: z.number() }))` and `aggregateCoverage(parsed): number` returning the mean of all packages' `lines` (documented as the chosen scalar; single place to change the metric).
4. `compute(ctx)`:
   - `const runCommand = ctx.runCommand ?? defaultCommandRunner;`
   - `git log --since=30.days --pretty=format:%H${US}%cd --date=short -- coverage-baselines.json`; split on `'\n'`, trim, drop empties, split each on `US` → `[sha, date]`.
   - If zero records → `errorResult('No coverage history found in git for coverage-baselines.json over the last 30 days. Run the test suite with coverage and `node scripts/coverage-ratchet.mjs --update`, then commit, to start tracking.')`.
   - For each `[sha, date]`: `const raw = await runCommand('git', ['show', `${sha}:${COVERAGE_FILE}`]);` parse JSON → `CoverageBaselinesSchema.safeParse`; on failure skip that commit (defensive). Compute `aggregateCoverage`; bucket by `date` (last write per day wins).
   - If zero parseable buckets → `errorResult(...)` (same enable-tracking detail).
   - Build sorted `history: SignalPoint[]`. `latest = last`, `earliest = first`. `delta = latest − earliest` (pp). `value = round2(latest)`. `trend`: `<2 points || latest===earliest → 'flat'`, else `latest > earliest ? 'up' : 'down'`. `status`: `delta <= alert ? 'alert' : delta <= warn ? 'warn' : 'ok'`.
   - `ctx.timeline.backfill(SIGNAL_ID, history)`; `ctx.timeline.appendPoint(SIGNAL_ID, toDate(ctx.now.toISOString()), value)`.
   - `detail`: `<2 points` → `Coverage is ${value}%; no prior 30-day snapshot to trend against.` else `Coverage ${value}% (${delta>=0?'+':''}${delta.toFixed(1)}pp over 30d).`
   - Wrap in `try/catch` → `errorResult(\`Failed to read coverage history: ${message}\`)`.
5. Add the `@internal` + design docstring (source, chosen scalar = mean lines%, degradation contract).
6. Run the Task-1 test file — observe pass.
7. Run: `harness validate` — confirm ≤290, no new `#NNN` findings.
8. Commit: `feat(dashboard): add coverage-trend-down-30d signal provider`

### Task 3: TDD red — eval-fail-rate test feeding REAL execution_outcome node shape via in-memory GraphStore

**Depends on:** Task 2 | **Files:** `packages/dashboard/tests/server/signals/providers/eval-fail-rate.test.ts`

1. Create the test file. Import `{ GraphStore } from '@harness-engineering/graph'`. Helper `outcomeNode(id: string, result: 'success'|'failure', timestamp: string)` returns the REAL node shape:
   ```ts
   { id, type: 'execution_outcome' as const, name: `${result}: ${id}`,
     metadata: { issueId: id, identifier: id, result, retryCount: 0, failureReasons: [], durationMs: 1, linkedSpecId: null, timestamp } }
   ```
   Use IDs like `'outcome:issue-1:0'` — NEVER bare hex tokens.
2. Helper `buildGraph(nodes)` → `const g = new GraphStore(); for (const n of nodes) g.addNode(n); return g;`. `ctx(graphStore, now)` → `{ projectPath: '/unused', now, timeline: new SignalTimelineStore(tmpRoot), graphStore }`.
3. Write the first cases (failing — provider absent):
   - `'exposes the correct static contract'` → `id==='eval-fail-rate'`, `label.length>0`.
   - `'computes fail-rate % from execution_outcome verdicts in the 30d window'`: `now=2026-06-22`; nodes: 1 failure + 3 success all dated `2026-06-15` ⇒ fail fraction 25% ⇒ alert. Assert `value===25`, `unit==='%'`, `betterDirection==='down'`, `threshold==={warn:5,alert:10}`, `status==='alert'`.
   - `'returns ok below 5% and warn between 5 and 10'`: build counts giving ~4% (ok) and ~8% (warn).
4. Run: `pnpm --filter @harness-engineering/dashboard exec vitest run tests/server/signals/providers/eval-fail-rate.test.ts` — observe failure.

### Task 4: TDD green — implement eval-fail-rate.ts

**Depends on:** Task 3 | **Files:** `packages/dashboard/src/server/signals/providers/eval-fail-rate.ts`

1. Create provider. Consts: `SIGNAL_ID='eval-fail-rate'`, `LABEL='Post-merge eval fail rate (30d)'`, `SOURCE='graph execution_outcome nodes'`, `UNIT='%'`, `THRESHOLD={warn:5,alert:10}`, `WINDOW_DAYS=30`. `errorResult(detail)` (betterDirection `'down'`). A `pendingResult(detail)` helper (status `'pending'`, value `null`, history `[]`, betterDirection `'down'`).
2. `compute(ctx)`:
   - If `!ctx.graphStore` → `errorResult('Knowledge graph not loaded; run "harness scan" to build .harness/graph.')`.
   - `try { nodes = ctx.graphStore.findNodes({ type: 'execution_outcome' }); } catch (err) { return errorResult(\`Failed to query graph: ${message}\`); }`
   - If `nodes.length === 0` → `pendingResult('No execution_outcome nodes yet — eval-fail-rate activates once harness:outcome-eval publishes outcomes to the graph.')` (the documented graph contract; NO outcome-eval import).
   - `cutoffMs = ctx.now.getTime() − 30d`. For each node, narrow `metadata.result` (must be `'success'|'failure'`) and `metadata.timestamp` (string, `Date.parse` not NaN, `>= cutoffMs`); skip otherwise. Bucket per day: track `{fail, total}` per `toDate(timestamp)`.
   - If zero windowed outcomes → `pendingResult('No execution_outcome nodes in the last 30 days.')` (still pending, not error — the dependency exists but is quiet).
   - `totalFail`/`totalAll` across the window. `value = round2(totalFail / totalAll * 100)`. Per-day `history` point value = day fail-rate %. `status`: `value > alert ? 'alert' : value > warn ? 'warn' : 'ok'` (strict `>` per spec). `trend` from first vs last daily fail-rate.
   - `ctx.timeline.backfill(SIGNAL_ID, history)`; `ctx.timeline.appendPoint(SIGNAL_ID, toDate(ctx.now.toISOString()), value)`.
   - `detail`: `${value}% of ${totalAll} post-merge eval${totalAll===1?'':'s'} failed in the last 30 days.`
3. Add `@internal` + docstring: reads `metadata.result` (verdict) and `metadata.timestamp` from `execution_outcome` nodes; pending when none; no outcome-eval import (spec Decision #2).
4. Run the Task-3 test file — observe pass.
5. Run: `harness validate` — confirm ≤290, no new `#NNN` findings.
6. Commit: `feat(dashboard): add eval-fail-rate signal provider`

### Task 5: Coverage degradation + 30-day window edge cases

**Depends on:** Task 2 | **Files:** `packages/dashboard/tests/server/signals/providers/coverage-trend.test.ts`

1. Add cases:
   - `'degrades to error (no throw) when git is unavailable'`: runner throws on `git log` → `status==='error'`, `value===null`, `history===[]`, `detail` mentions enabling coverage tracking.
   - `'degrades to error when coverage-baselines.json was never tracked (empty git log)'`: `git log` returns `''` → `error` + enable-tracking detail.
   - `'skips commits whose snapshot is unparseable and still degrades gracefully when none parse'`: `git show` returns `'not json'` for the only commit → `error`, no throw.
   - `'requests git log scoped to a 30-day window over coverage-baselines.json'`: capture args; assert contains `--since=30.days` and `coverage-baselines.json`.
   - `'backfills daily buckets and mirrors the current day into the timeline store'`: assert `store.has('coverage-trend-down-30d', <commit date>)` and `store.has(..., '2026-06-22')`.
2. Run the coverage test file — observe pass.
3. Commit: `test(dashboard): cover coverage-trend degradation and 30-day window`

### Task 6: Eval pending/error paths + window edge cases

**Depends on:** Task 4 | **Files:** `packages/dashboard/tests/server/signals/providers/eval-fail-rate.test.ts`

1. Add cases (the critical contract paths from truths #7, #8):
   - `'returns pending with null value when zero execution_outcome nodes exist'`: empty `GraphStore` → `status==='pending'`, `value===null`, `history===[]`, `detail` mentions `outcome-eval`.
   - `'returns pending when nodes exist but none fall in the 30-day window'`: a single outcome dated 60 days before `now` → `pending`.
   - `'returns error when graphStore is absent'`: `ctx` with `graphStore: undefined` → `status==='error'`, `value===null`.
   - `'returns error (no throw) when findNodes throws'`: pass a stub `{ findNodes() { throw new Error('graph corrupt'); } }` cast as the store → `error`.
   - `'ignores nodes with malformed result or timestamp'`: include a node with `result:'unknown'` and one with `timestamp:'not-a-date'` alongside valid ones; assert they are excluded from the computation.
   - `'excludes outcomes older than 30 days from the window'`: one in-window failure + one out-of-window failure; assert only the in-window one counts.
2. Run the eval test file — observe pass.
3. Commit: `test(dashboard): cover eval-fail-rate pending, error, and window paths`

### Task 7: Full dashboard suite + validate gate

**Depends on:** Task 5, Task 6 | **Files:** none (verification)

1. Run: `pnpm --filter @harness-engineering/dashboard test` — observe all green (prior 448 + new coverage/eval cases).
2. Run: `pnpm --filter @harness-engineering/dashboard exec tsc --noEmit` — clean.
3. Run: `pnpm --filter @harness-engineering/dashboard exec eslint src` — clean.
4. Run: `harness validate` — confirm exactly ≤290 (no-regression), and grep the output to confirm no NEW `#NNN` hardcoded-color findings originate from the two new test files (node-ID/coverage literals must not look like 3-hex colors).
5. No commit (verification only). If any gate fails, fix in a follow-up atomic commit before proceeding.

### Task 8: Write handoff + session summary

**Depends on:** Task 7 | **Files:** `.harness/sessions/changes-five-signal-dashboard-panel-proposal/handoff.json` | **Category:** integration

1. Write `handoff.json` with `fromSkill: 'harness-execution'`, `phase: 'phase4-coverage-eval-complete'`, `planPath`, `taskCount: 8`, `checkpointCount: 0`, `summary`, `completed`, `pending` (Phase 5 gatherer/route/registry + serve.ts; Phase 6 client; Phase 7 docs + eval-fail-rate ADR; refresh arch baseline for new providers' compute() complexity), `concerns`, `decisions` (coverage scalar = mean lines% from git history of coverage-baselines.json; eval verdict/timestamp from execution_outcome metadata; pending vs error distinction), `integrationTier: 'medium'`, `contextKeywords`.
2. Call `writeSessionSummary` (skill, status, planPath, keyContext, nextStep = Phase 5).
3. Commit: `chore(dashboard): handoff after phase 4 coverage + eval providers`

## Integration Points (deferred to later phases — NOT in scope here)

- **Registrations:** both providers join the `registry.ts` ordered array in **Phase 5** (not now).
- **Route/gatherer:** `gather/signals.ts` constructs `SignalContext` with a best-effort `GraphStore` load (`new GraphStore()` + `store.load('.harness/graph')`) and passes `runCommand`/`graphStore`/`timeline` — **Phase 5**.
- **ADR:** the `execution_outcome` graph-contract ADR (spec Decision #2) is authored in **Phase 7**.
- **Knowledge graph:** the curated-signal / graph-contract concepts enter the graph during the integration phases.
