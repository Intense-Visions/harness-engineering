# Knowledge Pipeline Correctness — coverage abstention + extractor test/fixture excludes

Status: Proposed
Track: bug-fix
Related: #1110 (coverage grades F on a zero denominator), #1111 (test fixtures extracted as business knowledge)

## Problem

Two external user reports (from the same pipeline run against an overlay repo)
describe the `harness knowledge-pipeline` command producing confident,
unactionable verdicts:

### #1110 — coverage grades F on 0/0 linked code

`harness knowledge-pipeline --coverage` grades a domain **F** when the graph
contains nothing to link. "No graph / no data" and "genuinely bad coverage"
render identically:

- Before `graph scan` (empty graph): `Coverage: F (19/100)` with every domain
  showing `0/0 code linked` — a zero denominator.
- After `graph scan`: `Coverage: D (24/100)` with real `31/93`, `35/234` ratios.

The empty run produces a numeric score and letter grade indistinguishable from
a measured one — and a _worse_ grade than the measured result, so the honest
answer looks like a regression. The pipeline's own escalation rule
(`SKILL.md`) already states the missing-graph case must be handled explicitly:
"When no graph is available: run extractors and diagram parsers only … report
extraction results as gap analysis." The coverage grader does not implement it.

Root cause is in `packages/graph/src/ingest/CoverageScorer.ts`:

- `computeDomainScore` returns `0` for the code-coverage component whenever
  `codeEntities === 0` (there is no denominator to divide by).
- `scoreDomain` then passes that `0` through `toGrade`, which maps `< 20` to
  `F`. A domain with nothing to link is indistinguishable from a domain that
  was measured and scored terribly.
- `score()` averages every domain's number — including these
  no-denominator zeros — into the aggregate, and an entirely empty graph yields
  `overallGrade: 'F'`.

### #1111 — extracts test files/fixtures as business knowledge

`harness knowledge-pipeline` extracts "business knowledge" from test files and
test **fixtures** (golden files), then reports them as documentation gaps. In
the repro, all 37 "undocumented knowledge" signals traced to `tests/`:
test titles from `*.test.ts` (via `test-descriptions`) and generator
golden-file fixtures under `.../fixtures/.../expected/**` (via
`validation-rules` and `enum-constants`), each staged as
`nodeType: business_rule/business_term, confidence: 0.7`.

Root cause is in `packages/graph/src/ingest/extractors/ExtractionRunner.ts`:
`findSourceFiles` skips only directory _names_ in `DEFAULT_SKIP_DIRS`. It has
no test-file or fixture-tree exclusion, so `tests/`, `fixtures/`, `expected/`,
and snapshot trees are all walked and fed to the extractors. Every other
harness gate already excludes these — `harness.config.json` carries
`**/*.test.ts`, `**/tests/fixtures/**`, `**/rehearsal-fixtures/**` in both the
`security.exclude` and `entropy.excludePatterns` sets — but the knowledge
extractors do not mirror that intent.

A secondary provenance gap: a staged entry
(`KnowledgeStagingAggregator.StagedEntry`) carries no source path, so a
reviewer cannot tell a fixture-derived finding from a real one without grepping
the repo for the name string.

## Goals

1. Coverage abstains rather than grading when there is no denominator:
   distinguish "no data" from "bad ratio".
2. Test files and fixture trees are excluded from knowledge extraction, so the
   gap report's undocumented count reflects real first-party knowledge — while
   legitimate first-party source is untouched.
3. Staged entries carry their source path so provenance is attributable.

## Non-goals

- Rewriting the scoring weights, the drift classifier, or the gap-report
  format beyond what the two behaviours above require.
- Auto-running `graph scan` from inside the pipeline (the report points the
  operator at it; running it implicitly is out of scope).

## Design

### Fix #1110 — coverage abstention (`CoverageScorer.ts` + command output)

Introduce an explicit _unmeasured_ state keyed off the denominator, never a
confident grade:

- Add `'N/A'` to the grade union (new exported `Grade` type).
- `DomainCoverageScore` gains `readonly measured: boolean`. A domain is
  `measured` when `codeEntities > 0` (there is a linkable-code denominator).
  When `!measured`, its `grade` is `'N/A'`. Its score is still computed (for the
  knowledge-depth / source-diversity components) but never surfaced as a letter.
- `CoverageReport` gains `readonly graphPresent: boolean` (any code _or_
  knowledge node exists) and `readonly measuredDomainCount: number`.
  `overallScore` is the rounded average of **measured** domains only —
  unmeasured domains are excluded from the aggregate rather than averaging a
  zero into it. When no domain is measured, `overallGrade` is `'N/A'`.
- Unmeasured domains still appear in `domains[]` (visible as `N/A`), so a domain
  with nothing to link reads as "not scanned", not "not applicable".

Command output (`knowledge-pipeline.ts`):

- When `!graphPresent`, print one loud line pointing at the escalation the
  SKILL already specifies (run the graph scan command) instead of a grade.
- The overall line renders `N/A` (not a `/100` score) when `overallGrade` is
  `'N/A'`.
- Per-domain unmeasured lines render `N/A — <k> knowledge, no code to link`
  instead of `F (0/100) — … 0/0 code linked`.
- Drift-score label: on a first run where every finding is `new` (no
  `stale`/`drifted`/`contradicting`), annotate the drift score as a first-run
  value so `1.00` is not misread as "everything drifted". This matches the
  verdict beneath it (correctly `WARN`).

### Fix #1111 — extractor test/fixture excludes + staged provenance

- Add `DEFAULT_EXTRACTION_EXCLUDE` (minimatch globs, POSIX-relative) mirroring
  the repo's existing security/entropy exclusion intent. The set:
  - Test files: `**/*.test.*`, `**/*.spec.*`, `**/*_test.go`, `**/test_*.py`,
    `**/*_test.py`
  - Test directories: `**/tests/**`, `**/__tests__/**`, `**/test/**`
  - Fixture / golden-file / snapshot trees: `**/fixtures/**`,
    `**/__fixtures__/**`, `**/expected/**`, `**/__snapshots__/**`,
    `**/rehearsal-fixtures/**`

- `ExtractionRunner` accepts an `{ excludeGlobs }` option (defaulting to
  `DEFAULT_EXTRACTION_EXCLUDE`). `findSourceFiles` matches each candidate file's
  project-relative POSIX path against the globs (using the same `minimatch`
  matcher already used by `CodeIngestor`), and prunes excluded directories
  during the walk. First-party source that is not a test/fixture is untouched.
- The exclude list is configurable and additive via a new
  `knowledge.extractionExclude` config field, threaded
  CLI → `KnowledgePipelineOptions` → `createExtractionRunner`. Caller globs
  extend (not replace) the built-in defaults, matching the existing
  `knowledge.domainPatterns` / `knowledge.domainBlocklist` convention.
- `StagedEntry` gains `readonly path?: string`; `stageNewFindings` populates it
  from the graph node's `path`, so a staged finding is attributable to its
  source file without grepping.

## Acceptance criteria

- A domain with `0` linkable code entities (0/0) is reported `measured: false` /
  grade `N/A` and is excluded from the aggregate — NOT graded `F`.
- A domain with real linkage (code entities > 0) still grades normally
  (A–F unchanged).
- An entirely empty graph yields `graphPresent: false` and `overallGrade: 'N/A'`,
  and the command prints the run-the-graph-scan escalation.
- Files under `tests/` and fixture trees are not extracted as
  business-knowledge signals; a genuine first-party source signal still is.
- `knowledge.extractionExclude` extends the default exclude set.
- Staged entries carry a `path` for extractor-sourced findings.

## Test plan

- `CoverageScorer`: 0/0 domain → `measured:false`, grade `N/A`, excluded from
  aggregate; measured domain grades normally; empty graph → `graphPresent:false`,
  `overallGrade:'N/A'`; mixed measured + unmeasured → aggregate over measured
  only.
- `ExtractionRunner`: a temp project tree with a first-party source file, a
  `*.test.ts` file, and a `fixtures/expected/**` golden file → only the
  first-party signal is extracted; caller-supplied `excludeGlobs` also honored.
- `KnowledgePipelineRunner`: staged entries carry `path`.
- Existing `CoverageScorer` empty-graph test updated from `F` to `N/A`
  (intentional behaviour change — the crux of #1110).
