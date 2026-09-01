# Plan — Content-addressed gate memoization (#1639)

Route: FEATURE (brainstorming → autopilot). Base: fresh `origin/main` (incl. #1673 GateMeasurement).

## Tasks

1. **Types** (`packages/types/src/ci.ts`)
   - Add `VerdictCacheStats` (`enabled`, `hits`, `misses`, `entries: {check,outcome,key}[]`).
   - Add optional `cacheStats?: VerdictCacheStats` to `CICheckReport` (absent when disabled → byte-stable default).

2. **Cache module** (`packages/core/src/ci/verdict-cache.ts`)
   - `parseVerdictCacheConfig(config, projectRoot)` → `{ enabled, dir }` (default off, `.harness/cache/verdicts`).
   - `GATE_VERSIONS: Record<CICheckName, number>` — per-check invalidation lever.
   - `computeConfigHash(config)` — canonical JSON sha256, excludes the `cache` subtree.
   - `computeProjectInputHash(projectRoot, extraExcludes)` — glob source/config/docs tree
     (excl. skipDirGlobs + `.harness` + cache dir), read contents, reuse `computeSourceHash`.
   - `computeVerdictKey({check,gateVersion,configHash,inputHash})` — sha256 hex.
   - `class VerdictCache` — `get(key)`, `set(key,result)`, safe JSON round-trip, corrupt-entry tolerance.
   - `class VerdictCacheStatsCollector` — records hit/miss per check, `toStats()`.
   - `shouldCacheResult(result)` — false when a check threw (transient-error guard).

3. **Wire orchestrator** (`packages/core/src/ci/check-orchestrator.ts`)
   - In `runCIChecks`: build cache + stats when enabled; compute shared `inputHash`, `configHash` once.
   - Thread through `runAllChecks`; wrap `runSingleCheck` in `runSingleCheckMemoized`.
   - Attach `cacheStats` to report only when enabled.

4. **Exports** (`packages/core/src/ci/index.ts`) — export cache surface + types.

5. **Config schema** (`packages/cli/src/config/schema.ts`) — add `cache.verdicts` section so the
   key survives config resolution (top-level schema strips unknown keys).

6. **CLI output** (`packages/cli/src/commands/ci/check.ts`) — print cache hit/miss summary in human mode.

7. **Tests** (`packages/core/tests/ci/verdict-cache.test.ts`)
   - hit on unchanged inputs; miss on changed closure file; miss on config change; miss on gateVersion bump.
   - errored result not cached; corrupt cache entry → miss (no throw).
   - key determinism / canonicalization.
   - orchestrator integration: enabled → second run hits; disabled → no `cacheStats`, byte-stable.

## Verify

- `pnpm turbo build`, targeted `vitest run` on new tests, `tsc` typecheck, lint, full pre-push gates.
- Behavioral: run `harness ci check` twice with cache enabled on a temp project; confirm 2nd run reports hits.
