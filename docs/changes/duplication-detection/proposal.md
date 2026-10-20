# Mechanical Duplication Detection (DRY Floor)

**Status:** proposed
**Slug:** `duplication-detection`
**Keywords:** duplication, DRY, clone-detection, entropy, rule-of-three, code-craft, token-fingerprint, type-2-clone, partial-extraction, abstraction

## Overview & Goals

### Problem

DRY is the only major quality axis in this project with **zero mechanical enforcement**. It is
_described_ in two places and enforced in none:

- `agents/skills/claude-code/harness-refactoring/SKILL.md:8,66` lists "reducing duplication (DRY
  refactoring)" as a use case and "Remove one instance of duplication" as a step type — a
  procedure with no detector upstream. The agent must already know where the duplication is;
  nothing tells it.
- `packages/cli/src/code-craft/catalog/rubrics/abstraction-earns-keep.ts` (CODE-R004) names the
  Rule of Three verbatim: "the same five lines copied in three places crying out for one named
  home". But the rubric declares `appliesToKinds: ['function', 'method', 'class']` and
  `packages/cli/src/code-craft/phases/critique.ts:8` states the prompt "carries the unit's OWN
  source span (not the whole file)"; `CritiqueInput` is `{ file, source, unit, rubric, provider }`.
  One unit, one rubric, **no cross-file channel**. Asking a model whether five lines appear in
  three places while showing it one place is not a hard judgment call — it is an impossible one.

A third surface compounds it: `harness-brainstorming/SKILL.md:62` instructs "Check for prior art.
Has this been partially solved elsewhere?" with no tool behind it, and `spec-craft`'s seven rubrics
contain no reuse/prior-art rubric.

Meanwhile two planned roadmap rows are explicitly predicated on clone detection that nothing plans
to build, which is a dependency inversion in the roadmap:

- `idiom-contagion-epidemiology` (#1612): R0 per idiom measured "from **clone/similarity
  detection** joined with commit provenance".
- `semantic-canonicalization-entropy-floor` (#1646): "**clone detection sharpens** (idiom
  epidemiology depends on it)".

Both are `Status: planned`, `Spec: —`. The other two duplication-flavored rows
(`semantic-duplicate-detection-at-backlog-scale`, #1549) concern issues and pull requests, not code.

### Goal

1. A deterministic, offline duplication index over TS/JS source, exposed as a reusable core module.
2. An entropy detector that reports clone classes, advisory-first, ranked so a human reads all of them.
3. Repair CODE-R004 by feeding `code-craft` the sibling copies, making its DRY clause answerable.
4. Leave a stable `CloneClass` interface that #1612 and #1646 can build on.

### Strategy grounding

`STRATEGY.md#our-approach` — the central bet is "**constraints-as-code outperforms
prompts-and-conventions**", on the reasoning that "agents drift back to bad patterns the moment a
session forgets the prompt". DRY is currently a convention without enforcement, which is precisely
the failure mode the thesis names.

`STRATEGY.md#key-metrics` — **Harness Coverage** is defined as the "ratio of documented
architectural rules that carry mechanical enforcement (ESLint rule, validator, schema, hook) to
total documented rules". DRY is documented twice and enforced zero times, so this feature moves that
ratio by construction rather than by estimate.

### Evidence

A Type-2 fingerprint probe over this worktree (2,046 non-test source files, 8,004 units of ≥40
tokens, 2.4s wall):

| Granularity                            | Clone classes @ ≥2 | @ ≥3               |
| -------------------------------------- | ------------------ | ------------------ |
| Whole-unit (function / method / class) | 202 (522 units)    | **60 (238 units)** |
| Sliding 50-token window, ≥N files      | 17,271             | 6,173              |

Named instances, all verified by direct grep:

- `sumCosts` — **10 copies**, one per craft package (`api`, `cli-ergonomics`, `code`, `copy`, `docs`,
  `knowledge`, `naming`, `security`, `spec`, `test`).
- A JSON-response helper — **16 copies** in `packages/orchestrator/src/server/routes/`, identical
  signature `(res: ServerResponse, status: number, body: unknown): void`, under **three different
  names** (`sendJSON` ×13, `sendJson` ×1, `jsonResponse` ×2), with **no shared module in existence**.
- `handle*Craft` ×8, `handle*CraftFinalize` ×9, `finalizeInputError` ×9, `parseFencedJson` ×6,
  `extractJson` ×3 within `design-craft` alone, and 5 identical 87-token anonymous functions inside
  `packages/core/src/review/agents/typescript-strict-agent.ts`.

### Non-goals (YAGNI)

- **No sub-unit / partial duplication** (the CPD sliding-window approach). Measured at 6,173 raw
  classes here; deferred as a follow-up to be justified by what this ships _fails_ to catch.
- **No semantic / Type-4 equivalence.** That is the substrate design-time reuse discovery needs;
  building it here would prejudge that design.
- **No non-TS/JS languages.** `tree-sitter-wasms` would permit it; nobody has asked.
- **No auto-fix.** Deduplication is a human judgment about where a concept belongs, and
  `harness-refactoring` already owns the procedure.
- **No baseline ratchet in this spec** (see D4) — follow-up.
- **This spec does not fix the 60 clone classes it finds.** That backlog is `cleanup-fleet` /
  `craft-fleet` work against the detector's output. Bundling it would turn a focused spec into an
  open-ended refactor.

### Key assumption

That whole-unit granularity is where extractable duplication lives in this codebase. This is
measured, not assumed: 60 concrete classes including a 16× and a 10×. The assumption that could
still be wrong is about the **steady state** — the 60 are a one-time backlog, and the per-PR find
rate is unknown until the detector runs in anger. D4's advisory-first posture is the hedge.

### Assumptions

- **Runtime:** Node.js (the detector uses filesystem reads and the existing core parser stack).
- **Encoding:** source files are UTF-8. Non-UTF-8 files fail the parse path and are handled by the
  skip behavior below.
- **Fingerprint collisions are negligible but not impossible.** `fingerprint` is sha1 truncated to
  16 hex characters (64 bits). At this repository's scale (8,004 units) the expected number of
  collisions is `n^2 / (2 * 2^64)` ≈ 1.7e-12. A collision would manifest as a single false clone
  class, not as corruption. Stated because the truncation is a deliberate choice for log and report
  readability, not an oversight; widen to the full digest if a collision is ever observed.
- **Discovery root is configuration, not a constant.** The detector scans whatever
  `EntropyConfig.include` / `EntropyConfig.exclude` resolve to — the fields already exist on the
  config and are shared with the sibling detectors. Nothing in the design assumes this
  repository's `packages/*/src` layout. Harness features ship to adopter projects, so the
  repo-shaped numbers in this spec are _this change's acceptance evidence_, never shipped
  product behavior; see Success Criteria 1 and 15.

## Decisions Made

| #   | Decision                                                                            | Rationale                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Type-1/2 only — normalized token-stream fingerprints, identifiers→`I`, literals→`L` | Deterministic and offline. **Load-bearing, not incidental:** the 16 JSON-response copies cluster _only_ because identifiers normalize away; spanning three names, no grep, symbol index, or name-based search would ever group them. Verified: two functions differing in name and parameter names produced identical fingerprint `170fb29396e3`.                                                                |
| D2  | Whole-unit granularity (function / method / class)                                  | The probe decided this: 60 readable classes versus 6,173. For sub-unit, the suppression list rather than the algorithm becomes the product.                                                                                                                                                                                                                                                                      |
| D3  | Report at **≥3 instances** (Rule of Three), above a minimum token count             | The bar CODE-R004 itself states, cited to Fowler. Also the false-positive control: prior sweeps in this repo ran at roughly 95% false positives, which is why this is a decision rather than a default.                                                                                                                                                                                                          |
| D4  | Advisory first; baseline ratchet later; never fail-closed                           | The fail-closed pre-commit architecture gate (#855) is the standing cautionary precedent — a red baseline there blocks _all_ commits until `--update-baseline`.                                                                                                                                                                                                                                                  |
| D5  | Shared `packages/core/src/duplication/` module, not logic buried in the detector    | Three consumers: the detector, `code-craft` (goal 3), and #1612/#1646. Burying it would force `code-craft` to re-run the index.                                                                                                                                                                                                                                                                                  |
| D6  | `@typescript-eslint/typescript-estree` with `tokens: true` — **not** `typescript`   | `packages/core/package.json` has no `typescript` dependency and core imports it nowhere; estree is already a core dependency and yields a token array directly. The probe used `ts.createScanner`, which core cannot do — "zero new dependencies" holds only on this substrate.                                                                                                                                  |
| D7  | The detector parses files itself rather than consuming `snapshot.files[].ast`       | `AST` is a lossy `{ type, body: unknown, language }` wrapper and the parser registry defaults to tree-sitter (`shared/parsers/registry.ts:3`), so estree tokens would not survive the snapshot. Precedent: `entropy/detectors/complexity.ts:1` already reads files directly. Cost: re-parsing, measured at 2.4s for 2,046 files including a dropped pass. Benefit: zero change to the shared parser or registry. |
| D8  | Rank `partial-extraction` above plain duplication                                   | Earned by an observed instance: `packages/cli/src/shared/craft/fenced-json.ts` exports `extractFencedJsonPayload`, **10 craft packages import it, and those same 10 also declare their own local `parseFencedJson`** — 6 byte-identical. Half the refactor was done and the wrapper layer stayed duplicated. The subtlest class here and the cheapest to detect.                                                 |
| D9  | TS/JS only — exactly `STATIC_SUPPORTED_EXTENSIONS`                                  | `.ts/.tsx/.js/.jsx/.mjs/.cjs`, matching the existing static-analysis surface.                                                                                                                                                                                                                                                                                                                                    |

## Technical Design

### New module: `packages/core/src/duplication/`

- **`tokens.ts`** — `normalizeTokens(tokens, range): string[]`. `Identifier` / `PrivateIdentifier`
  → `I`; `String` / `Numeric` / `Template` → `L`; `Keyword` / `Punctuator` kept verbatim.
- **`units.ts`** — `extractUnits(ast): DupUnit[]` over ESTree `FunctionDeclaration`,
  `FunctionExpression`, `ArrowFunctionExpression`, `MethodDefinition`, `ClassDeclaration`;
  records `{ kind, name, startLine, endLine, range }`, with `name: '<anon>'` when absent.
- **`index.ts`** — `buildCloneIndex(files, config): Result<CloneIndex, EntropyError>`.

```ts
export type CloneUnitKind = 'function' | 'method' | 'class';

export interface CloneMember {
  file: string; // repo-relative, posix-normalized
  unit: string; // identifier, or '<anon>'
  kind: CloneUnitKind;
  startLine: number;
  endLine: number;
}

export interface CloneClass {
  fingerprint: string; // sha1 of the normalized token stream, 16 hex chars
  tokenCount: number;
  members: CloneMember[]; // length >= minInstances
  rank: number; // tokenCount * members.length
  signal: 'duplicate' | 'partial-extraction';
  sharedImport?: string; // set only when signal === 'partial-extraction'
}

export interface SkippedFile {
  file: string; // repo-relative, posix-normalized
  reason: 'unreadable' | 'unparseable' | 'unextractable';
  message: string; // the underlying read, parse, or extraction error
}

export interface CloneIndex {
  classes: CloneClass[];
  byMember: Map<string, CloneClass>; // `${file}:${startLine}` -> owning class
  skipped: SkippedFile[]; // one entry per filesSkipped increment — the evidence Phase 2 raises
  stats: {
    filesScanned: number;
    filesSkipped: number; // count of `skipped` — see Failure behavior
    unitsFingerprinted: number;
    unitsBelowMinTokens: number; // excluded BEFORE grouping — never fingerprinted
    classesReported: number;
    classesSuppressed: number; // formed, then dropped for falling below minInstances
    classesTruncated: number; // dropped by the maxClasses report cap
  };
}
```

`byMember` is the seam for goal 3: an O(1) lookup from a `code-craft` unit target to its clone class.

### `partial-extraction` derivation (D8)

A clone class is labelled `partial-extraction` when every member's file imports a common module;
`sharedImport` names that module. Roughly ten lines over the import lists the snapshot already
carries.

### Failure behavior

Following the `Result` / `AnalysisError` convention already used by the sibling detectors:

- If a source file cannot be read, the detector shall skip that file, increment `filesSkipped`,
  record a `SkippedFile` entry on `CloneIndex.skipped`, and continue.
- If a source file fails to parse, or its units cannot be extracted, normalized, or fingerprinted,
  the detector shall skip that file, increment `filesSkipped`, record a `SkippedFile` entry, and
  record an `AnalysisError` with `analyzer: 'duplication'` — it shall not fail the entropy run. The
  reason and message are carried on the index rather than collapsed into a count, because Phase 2
  cannot raise a per-file `AnalysisError` from a bare counter.
- If EVERY eligible file is skipped, the detector shall report that explicitly rather than
  returning an index with zero classes. At 100% skip the result is indistinguishable from the
  zero-discovery case below; a partial skip (1 of N) still returns `Ok`, because that is a scan that
  happened.
- If two units with the same fingerprint disagree on `tokenCount`, the detector shall report that as
  an error rather than reporting a class. Equal digests must mean equal streams, so a disagreement is
  the observed digest collision that justifies widening the 16-hex truncation; without this check the
  module had no mechanism to detect one. Measured clean over 7,887 units.
- If a unit yields fewer than `minTokens` tokens, it shall be excluded from fingerprinting
  **before grouping** and counted in `unitsBelowMinTokens`. Such a unit can never form or join a
  clone class, so it is never counted in `classesSuppressed` — that counter is only for classes
  that actually formed and were then dropped for falling below `minInstances`. It deliberately
  does NOT cover `ignorePatterns`: those are applied as a file-level filter before any file is
  read, so a class whose members match an ignore glob can never form in the first place. (An
  earlier revision listed `ignorePatterns` here, which made that limb of the counter
  unreachable.) (The earlier wording conflated the two, which is incoherent: a unit that was
  never fingerprinted cannot become a suppressed class.)
- If more than `maxClasses` classes qualify, the detector shall report the top `maxClasses` by
  `rank` and record the number dropped in `classesTruncated`.
- If zero source files are discovered, the detector shall report that explicitly rather than
  reporting zero duplication. This follows the established convention at
  `packages/cli/src/commands/cleanup.ts:88` — "Refusing to report a pass over zero rules" — and
  guards the failure class where an empty scan is indistinguishable from a clean one.

### Configuration

```ts
export interface DuplicationConfig {
  minTokens: number; // default 40
  minInstances: number; // default 3 (Rule of Three)
  ignorePatterns: string[]; // default: tests, fixtures, generated files, build output
  maxClasses: number; // default 100 (report cap)
}
```

The defaults deliberately do **not** ignore `index.*`. A true barrel is pure re-exports, so it
yields no units and cannot produce a false positive — ignoring it buys nothing — while in this repo
`index.ts` is routinely a package's main implementation module. Measured over the package sources:
ignoring it dropped the reported classes from 58 to 48, suppressing 10 classes composed entirely of
`index.*` files, `sumCosts` x10 among them — the first named item in the Evidence section above.
`node_modules`, `dist`, `build`, and `coverage` are ignored instead, since those are copies of
source by construction.

Wired as `EntropyConfig.analyze.duplication?: boolean | Partial<DuplicationConfig>`, alongside the
existing six analyzers in `packages/core/src/entropy/types/config.ts`.

### Detector

`packages/core/src/entropy/detectors/duplication.ts` exports
`detectDuplication(snapshot, config): Promise<Result<DuplicationReport, EntropyError>>`, registered
in `entropy/detectors/index.ts`. `DuplicationReport` is added as `EntropyReport.duplication?`, and
`'duplication'` is added to the `AnalysisError['analyzer']` union in `entropy/types/report.ts`.

### Repairing CODE-R004

`BuildPromptInput` and `CritiqueInput` in `packages/cli/src/code-craft/phases/critique.ts` gain an
optional `siblings?: CloneMember[]`, populated via `CloneIndex.byMember`. When present, `buildPrompt`
appends the sibling locations so the rubric's Rule-of-Three clause has evidence to reason over. When
absent, behavior is byte-identical to today — the field is additive and the critique degrades to
current behavior rather than failing.

### Named risk: extractor line-number agreement

`code-craft` extracts units with `typescript` (`code-craft/extract/units.ts:42`, via
`n.getStart(sf)`), while core will use estree `loc.start.line`. The two must agree on a unit's start
line for `byMember` to hit. Decorators and leading comments are the likely divergence points.
Mitigation: match on `(file, kind, startLine)` with a ±2-line tolerance, plus a test asserting both
extractors agree on a shared fixture. Carried as a named risk with a test rather than an asserted
invariant.

### Caveat on the "60" figure

It was measured with `ts.createScanner`; the estree token stream differs slightly in granularity
(template literals, type annotations). Success criteria re-baseline against the shipped
implementation rather than hard-coding 60 — the repo has an eslint rule (`no-hardcoded-test-count`)
for exactly this failure.

## Integration Points

### Entry Points

- New core module `packages/core/src/duplication/`, public via the barrel.
- New detector `detectDuplication` at `packages/core/src/entropy/detectors/duplication.ts`.
- `harness cleanup -t duplication` — new value in `CleanupType` (`commands/cleanup.ts:13`), its
  option help text (`commands/cleanup.ts:192`), and the command `.description()` at
  `commands/cleanup.ts:191`, which enumerates the issue types ("doc drift, dead code, patterns").
  The command is detect-only — no `--fix` flag and no fix wiring — which is what makes the
  "no auto-fix" non-goal coherent with routing through it.
- `detect_entropy` MCP tool — new value in the type enum (`mcp/tools/entropy.ts:63`).
- Additive optional `siblings?: CloneMember[]` on `code-craft`'s `BuildPromptInput` / `CritiqueInput`.

### Registrations Required

- `entropy/detectors/index.ts` — export `detectDuplication` alongside the existing six.
- `entropy/types/config.ts` — `DuplicationConfig` and `EntropyConfig.analyze.duplication?`.
- `entropy/types/report.ts` — `EntropyReport.duplication?` and `'duplication'` in the
  `AnalysisError['analyzer']` union.
- **Barrel:** `duplication/index.ts` is **auto-discovered** by `scripts/generate-core-barrel.mjs`
  (`discoverStarModules()`, with `SKIP_DIRS = new Set(Object.keys(SELECTIVE_EXPORTS))` at line 123),
  so **no allowlist edit is required** — the allowlist rule applies to adding exports to an already
  selective module such as `shared`, not to a new star-exported directory. Add a
  `DIR_COMMENTS.duplication` entry for the description and canonical ordering; without one the module
  sorts last with a generated `"Duplication module."` comment. Run `pnpm run generate:barrels` and
  commit the result; CI verifies freshness via `--check`.

### Documentation Updates

- `docs/reference/cli-commands.md:181` (`-t, --type — Issue type: drift, dead-code, patterns, all`)
  is **generated** — regenerate via `pnpm run generate-docs`. Pre-push blocks on stale reference
  docs, so this is a hard step.
- `docs/reference/mcp-tools.md` for the `detect_entropy` enum.
- AGENTS.md entropy section.
- `harness-refactoring/SKILL.md` — point its DRY use case at the new detector, closing the loop where
  a procedure had no detector upstream.
- CODE-R004's rubric text needs **no** change; the point is that its existing clause becomes
  answerable.

### Architectural Decisions

One ADR covering **D2, D3, and D4**. It warrants a standalone record because it fixes the project's
operative definition of duplication, which #1612 and #1646 inherit, and because it deliberately
rejects the industry-standard CPD/sliding-window approach on measured evidence — without the record,
a future contributor re-litigates it from first principles. D6 and D7 are implementation choices and
do not rise to an ADR.

### Knowledge Impact

Two concepts enter the knowledge graph: `partial-extraction` (a shared helper extracted while the
wrapper layer stayed duplicated), which generalizes beyond this feature; and `CloneClass` as the
named substrate that #1612 and #1646 depend on.

## Success Criteria

1. **(Acceptance evidence for this change, not portable product behavior.)** When
   `harness cleanup -t duplication` runs on this repository, the system shall report clone classes
   of ≥3 members and ≥40 tokens, including the `sumCosts` class (10 members) and the orchestrator
   JSON-response class (16 members spanning names `sendJSON`, `sendJson`, `jsonResponse`). These
   two are named because they were verified by direct grep before the spec was written; criterion
   15 carries the equivalent claim in a form an adopter project can verify.
2. A manual audit of the top 20 classes by rank shall be performed and its verdicts recorded in this
   change's verification notes, targeting ≥90% genuine extractable duplication. If precision falls
   below 90%, exclusions shall be tightened before the detector leaves experimental status. The gate
   is that the audit is performed and recorded; "a human agrees" cannot itself be automated — so the
   audit's rejection criteria are fixed in advance to make the judgment reproducible. A class counts
   as a **false positive** when any of the following holds: extraction would require one distinct
   parameter per member (the members share shape but not behavior); the members are structurally
   forced by a framework or interface contract and could not differ; or the shared body is a
   type-only or re-export construct carrying no logic. Every other class counts as genuine.
3. When every member of a clone class imports a common module, the system shall label the class
   `partial-extraction` and populate `sharedImport` — verified against the `parseFencedJson` case
   (6 identical members, all importing `shared/craft/fenced-json`).
4. When `code-craft` critiques a unit belonging to a clone class, the rendered prompt shall include
   the sibling members' locations; and when the unit belongs to no clone class, the rendered prompt
   shall be byte-identical to the pre-change prompt.
5. The estree and `typescript` unit extractors shall agree on `(kind, startLine)` for every unit in a
   shared fixture, within ±2 lines.
6. `detectDuplication` shall complete over this repository's non-test sources in under 10 seconds
   (probe baseline: 2.4s including a pass this spec drops).
7. If `analyze.duplication` is absent or `false`, the system shall not parse for duplication and
   `EntropyReport.duplication` shall be `undefined`.
8. `node scripts/generate-core-barrel.mjs --check` shall pass, and `pnpm run generate-docs` shall
   leave no diff.
9. No existing entropy detector's output shall change.
10. No test shall hardcode the clone-class count produced by a scan of this repository. (A
    controlled fixture with a known planted set, per criterion 15, may assert its exact expected
    classes — that is a fixture assertion, not a hardcoded count.)
11. `buildCloneIndex`, `CloneIndex`, `CloneClass`, `CloneMember`, and `CloneUnitKind` shall be
    importable from `@harness-engineering/core` — covering goal 1 (reusable module) and goal 4
    (a stable interface for #1612 and #1646).
12. If a source file cannot be read or fails to parse, the system shall skip it, increment
    `filesSkipped`, record an `AnalysisError` with `analyzer: 'duplication'`, and complete the run
    successfully.
13. When more than `maxClasses` classes qualify, the system shall report the top `maxClasses` by
    `rank` and record the dropped count in `classesTruncated`.
14. If zero source files are discovered, the system shall report that condition explicitly and
    shall not report a zero-duplication pass.
15. **(Portable product behavior.)** Given a fixture project containing a known set of planted
    clone classes, the system shall report every class meeting the configured `minInstances` and
    `minTokens` thresholds and no others, with discovery driven solely by
    `EntropyConfig.include` / `exclude` — no path in the detector may assume this repository's
    layout.

## Implementation Order

Each phase is independently verifiable and lands on its own.

### Phase 1: Core duplication module

<!-- complexity: medium -->

Create `packages/core/src/duplication/` — `tokens.ts` (Type-2 normalization over
`@typescript-eslint/typescript-estree` tokens), `units.ts` (ESTree unit extraction), `index.ts`
(`buildCloneIndex`). Fixture-based tests only; no wiring into the entropy pipeline yet.

**Includes barrel registration** — the `DIR_COMMENTS.duplication` entry plus
`pnpm run generate:barrels`. This is NOT deferrable to Phase 2: `discoverStarModules()` in
`scripts/generate-core-barrel.mjs` keys purely on `<dir>/index.ts` existing and `duplication` is
not in `SKIP_DIRS`, so `generate-core-barrel.mjs --check` (green today) goes red the moment this
module's `index.ts` lands. Phase 1 also owns criterion 11, which is unreachable without it.

Verifiable alone: `buildCloneIndex` returns the expected clone classes for a fixture project
with a planted known set (criterion 15), and the types are importable from
`@harness-engineering/core` (criterion 11).

### Phase 2: Entropy detector and registration

<!-- complexity: medium -->

Add `entropy/detectors/duplication.ts` (`detectDuplication`), the `DuplicationConfig` and
`DuplicationReport` types, `EntropyConfig.analyze.duplication?`, `EntropyReport.duplication?`,
the `'duplication'` member of the `AnalysisError['analyzer']` union, and the
`detectors/index.ts` export. (Barrel registration moved to Phase 1 — see above.)
Includes the Failure behavior contract (skip-and-record on unreadable/unparseable files, the
`maxClasses` cap, and the zero-discovery guard).
Verifiable alone: duplication findings appear in `EntropyReport`; criteria 7, 12, 13, 14
(criterion 8's barrel half is satisfied in Phase 1; its `generate-docs` half lands in Phase 3).

### Phase 3: CLI and MCP surface

<!-- complexity: medium -->

Add `duplication` to `CleanupType`, the `-t` option help, and the `cleanup` command
`.description()`; add the value to the `detect_entropy` MCP type enum; regenerate
`docs/reference/cli-commands.md` and `docs/reference/mcp-tools.md` via `pnpm run generate-docs`.
**This phase carries the top-20 precision audit (criterion 2) as a human-verify checkpoint** —
the planner must emit it as `[checkpoint:human-verify]`, because its outcome decides whether
exclusions need tightening before the detector leaves experimental status.
Verifiable alone: `harness cleanup -t duplication` runs end to end; criteria 1 and 2.

### Phase 4: partial-extraction signal

<!-- complexity: low -->

Derive the `partial-extraction` label and `sharedImport` from the members' common imports, and
rank those classes above plain duplicates.
Verifiable alone: the `parseFencedJson` class (6 members, all 10 craft packages importing
`shared/craft/fenced-json`) is labelled `partial-extraction`; criterion 3.

### Phase 5: Repair CODE-R004 in code-craft

<!-- complexity: medium -->

Add the optional `siblings?: CloneMember[]` field to `BuildPromptInput` / `CritiqueInput`,
populate it from `CloneIndex.byMember`, and append sibling locations to the rendered prompt.
Includes the extractor-agreement test for the named line-number risk (estree `loc.start.line`
vs `typescript` `n.getStart(sf)`, ±2 lines).
Verifiable alone: criteria 4 and 5.

### Deferred follow-ups (filed, not phases)

- Baseline ratchet for duplication (per D4).
- Sub-unit / CPD tier (to be justified by what this ships fails to catch).
- `design-time-reuse-discovery` — surface existing implementations of what a spec proposes, at spec
  time, giving `harness-brainstorming` step 4 the mechanical backing it currently lacks.
