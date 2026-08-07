# Proposal: Fix `check-docs` / `cleanup` file-discovery blind spots

- Status: accepted (spec-first, autonomous fix)
- Tracking: fixes #1146 (reported by external user bstevenski-capillary)
- Scope: `@harness-engineering/core` discovery + coverage math, `@harness-engineering/cli` `check-docs` command

## Problem

Two independent blind spots in the CLI's file discovery make `check-docs` and
`cleanup` report on a small, unrepresentative slice of a repo — and in the
degenerate case report a confident 100% green over zero files. All three were
confirmed in code:

1. **Discovery is blind to `.mjs` / `.cjs`.**
   `checkDocCoverage` (`packages/core/src/context/doc-coverage.ts`) discovers
   source with the glob `**/*.{ts,js,tsx,jsx}` — no `.mjs` / `.cjs`. Every
   ESM-first repo is invisible to docs coverage. The entropy analyzer already
   gets this right: `DEFAULT_INCLUDE_PATTERNS`
   (`packages/core/src/entropy/snapshot.ts`) lists `**/*.mjs` and `**/*.cjs`.
   Only `checkDocCoverage` disagrees.

2. **Discovery never traverses dot-directories.**
   The shared `findFiles` (`packages/core/src/shared/fs-utils.ts`) calls
   `glob` without `dot: true`, so anything under a dot-directory
   (`.canary/`, `.config/`, `.server/`, …) is never seen. In an ESM overlay
   repo the entire first-party surface can live under a dot-dir. This same
   discovery feeds the entropy snapshot's exports index
   (`packages/core/src/entropy/snapshot.ts`), so `cleanup --type drift`
   reports false `NOT_FOUND` for symbols that plainly exist under a dot-dir.

3. **Zero files scanned reports 100%, not an abstention.**
   The coverage math (`doc-coverage.ts`) is
   `total > 0 ? Math.round(documented/total*100) : 100`. A scan that read
   nothing is indistinguishable from perfect coverage, so the gate goes green.
   This is what makes (1) and (2) dangerous rather than merely wrong: the
   obvious remedy for a fixture-dominated `0.0%` — exclude the fixtures —
   drives the denominator to zero and turns the gate green.

4. **`check-docs` ignores config a parallel path honors.**
   The `check-docs` command (`packages/cli/src/commands/check-docs.ts`)
   hardcodes its excludes, while `runDocsCheck`
   (`packages/core/src/ci/check-orchestrator.ts`) — same underlying
   `checkDocCoverage`, reached through `harness ci check` — reads
   `entropy.excludePatterns`. So `harness.config.json` has no effect on the
   `check-docs` command at all.

## Root-cause locations

| #   | Blind spot                        | Location                                                                             |
| --- | --------------------------------- | ------------------------------------------------------------------------------------ |
| 1   | glob omits `.mjs`/`.cjs`          | `packages/core/src/context/doc-coverage.ts` — `findFiles('**/*.{ts,js,tsx,jsx}', …)` |
| 2   | `dot: false` (dot-dirs invisible) | `packages/core/src/shared/fs-utils.ts` — `findFiles` glob call                       |
| 3   | zero-denominator → 100%           | `packages/core/src/context/doc-coverage.ts` — `total > 0 ? … : 100`                  |
| 4   | hardcoded excludes                | `packages/cli/src/commands/check-docs.ts` — `excludePatterns: [...]`                 |

## Fixes

### Fix 1 — include `.mjs` / `.cjs` in doc-coverage discovery

Change the source glob in `checkDocCoverage` to
`**/*.{ts,js,tsx,jsx,mjs,cjs}`, matching the entropy analyzer's
`DEFAULT_INCLUDE_PATTERNS`.

### Fix 2 — traverse first-party dot-directories, keep the genuine ignore list

Add `dot: true` to the `glob` call in the shared `findFiles`. This is safe
because `findFiles` already excludes the genuine ignore list via
`DEFAULT_FIND_FILES_IGNORE` (= `skipDirGlobs()` over `DEFAULT_SKIP_DIRS`),
and glob propagates `dot` to its ignore matchers — verified empirically:
with `dot: true`, a file under a first-party dot-dir is discovered while
`.git/`, `node_modules/`, and `.harness/` stay excluded.

**Dot-dir policy.** Include first-party dot-dirs (`.canary/`, `.config/`,
`.server/`, …). Keep excluded everything already in `DEFAULT_SKIP_DIRS`:

- VCS metadata: `.git`, `.hg`, `.svn`
- Dependencies / stores: `node_modules`, `.pnpm-store`, `.yarn`, `vendor`
- Build output: `dist`, `build`, `out`, `bin`, `target`, …
- Framework / tooling caches: `.next`, `.nuxt`, `.svelte-kit`, `.turbo`,
  `.vite`, `.cache`, `.parcel-cache`, `.astro`, `.wrangler`, …
- Test / coverage / reporter output: `coverage`, `.nyc_output`,
  `.pytest_cache`, `playwright-report`, `test-results`, …
- Python: `__pycache__`, `.venv`, `venv`, `.tox`, `.mypy_cache`, `.ruff_cache`
- JVM: `.gradle`, `.gradle-home`
- IDE / editor: `.idea`, `.vscode`, `.vs`
- Harness runtime: `.harness`
- AI-agent sandboxes: `.claude`, `.cursor`, `.codex`, `.gemini`, `.aider`, …

The fix is a one-line policy change (do not blanket-exclude all dot-dirs) that
preserves the real ignore list intact. It repairs discovery for both
`checkDocCoverage` and the entropy snapshot (curing the false-`NOT_FOUND`
drift findings), since both call the shared `findFiles`.

### Fix 3 — zero denominator abstains, never reads as 100%

`CoverageReport` and `GraphCoverageData` gain a `scanned` field (the
denominator = documented + undocumented). When `scanned === 0`,
`coveragePercentage` is `0`, not `100`, so the value can never satisfy a
`>= minCoverage` check.

The `check-docs` command surfaces the abstention explicitly, mirroring the
established `check-security` precedent (`scannedNothing` + `ExitCode.ZERO_DENOMINATOR`):

- `CheckDocsResult` gains `scanned: number` and `scannedNothing: boolean`.
- `valid` is false whenever `scanned === 0` (a verified-zero scan is not a pass).
- Exit code is `ExitCode.ZERO_DENOMINATOR` (3) when nothing was scanned —
  distinct from SUCCESS (0) and VALIDATION_FAILED (1).
- Output states the denominator on every run (`x/y files documented`) so a
  collapsed scope is visible, and prints an explicit
  `ABSTAINED: 0 source files scanned — coverage undetermined, not a pass`
  line when the scan read nothing.

### Fix 4 — `check-docs` honors `entropy.excludePatterns`

`runCheckDocs` reads `config.entropy?.excludePatterns` instead of its hardcoded
list, so `harness.config.json` governs both entry points identically. The
fallback (when config sets nothing) is skip-dir globs plus `**/*.test.ts` and
`**/*.spec.ts`. It deliberately does **not** exclude `**/fixtures/**`: baking
fixture-exclusion into the default is exactly the footgun that drives the
denominator to zero and turns the gate green (§3 above). A project that
genuinely wants fixtures excluded opts in via `entropy.excludePatterns`.

## Acceptance

- [ ] `checkDocCoverage` discovery includes `.mjs` / `.cjs`.
- [ ] `findFiles` passes `dot: true`; first-party dot-dirs are scanned while
      `.git` / `node_modules` / `.harness` runtime / build caches stay excluded.
- [ ] Zero files scanned abstains — `scanned === 0`, `coveragePercentage === 0`,
      `valid === false`, distinct exit code, explicit message; never `100.0%`.
- [ ] `check-docs` reads `entropy.excludePatterns` like `runDocsCheck` does.
- [ ] Coverage output states its denominator (`x/y files`).
- [ ] Regression tests: identical content in `.mjs` / `.js` / `.ts` yields the
      same finding; a file under a first-party dot-dir is discovered while
      genuinely-ignored dot-dirs stay excluded; a zero-file scan yields an
      explicit undetermined / non-green result.

## Non-goals

- Rewriting the entropy analyzer's own walker (it already handles `.mjs`/`.cjs`
  via `DEFAULT_INCLUDE_PATTERNS`; the dot-dir cure reaches it through the shared
  `findFiles`).
- Changing default `minCoverage` or the doc-linking heuristics.
