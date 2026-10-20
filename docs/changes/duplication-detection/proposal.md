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

| #   | Decision                                                                            | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Type-1/2 only — normalized token-stream fingerprints, identifiers→`I`, literals→`L` | Deterministic and offline. **Load-bearing, not incidental:** the 16 JSON-response copies cluster _only_ because identifiers normalize away; spanning three names, no grep, symbol index, or name-based search would ever group them. Verified: two functions differing in name and parameter names produced identical fingerprint `170fb29396e3`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| D1a | Within D1, `JSXIdentifier` is kept VERBATIM and `JSXText` collapses to `L`          | An ELEMENT name is structural, closer to a keyword than to a variable name: `<input>` versus `<button>` is different behavior, not a rename. **That argument does not extend to ATTRIBUTE names, which this also keeps verbatim:** `<div className="x" tabIndex={1}>` tokenizes `div`, `className` AND `tabIndex` all as `JSXIdentifier`, so a prop rename (`onClick` to `onPress`) defeats clustering — precisely the rename case identifier normalization exists to absorb. Because `normalizeTokens` is token-level, it has no element/attribute distinction to branch on, so this cost is accepted rather than solved; it is recorded here so the `<input>`-versus-`<button>` argument is not read as covering attributes. Collapsing it to `I` made `() => <div className="x">hi</div>` and `() => <span className="x">hi</span>` share the fingerprint `213c70b88dc1f373`. Live, not hypothetical: `.tsx` is in `SUPPORTED_EXTENSIONS`, `jsx` is enabled for it, and real `.tsx` classes are reported. `JSXIdentifier` covers element and attribute names only — an identifier inside an expression container is a plain `Identifier` token and still normalizes, so `<div id={userName}>` and `<div id={other}>` still cluster. `JSXText` covers element text and attribute string values, which are literals and collapse accordingly. |
| D1b | Within D1, `Boolean` and `Null` are kept VERBATIM rather than collapsing to `L`     | A flag flip usually IS different logic: `if (x === true)` and `if (x === null)` are not the same function with a different constant in it, so they should not alias. This was previously recorded only in a test parenthetical.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| D2  | Whole-unit granularity (function / method / class)                                  | The probe decided this: 60 readable classes versus 6,173. For sub-unit, the suppression list rather than the algorithm becomes the product.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D3  | Report at **≥3 instances** (Rule of Three), above a minimum token count             | The bar CODE-R004 itself states, cited to Fowler. Also the false-positive control: prior sweeps in this repo ran at roughly 95% false positives, which is why this is a decision rather than a default.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| D4  | Advisory first; baseline ratchet later; never fail-closed                           | The fail-closed pre-commit architecture gate (#855) is the standing cautionary precedent — a red baseline there blocks _all_ commits until `--update-baseline`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| D5  | Shared `packages/core/src/duplication/` module, not logic buried in the detector    | Three consumers: the detector, `code-craft` (goal 3), and #1612/#1646. Burying it would force `code-craft` to re-run the index.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| D6  | `@typescript-eslint/typescript-estree` with `tokens: true` — **not** `typescript`   | `packages/core/package.json` has no `typescript` dependency and core imports it nowhere; estree is already a core dependency and yields a token array directly. The probe used `ts.createScanner`, which core cannot do — "zero new dependencies" holds only on this substrate.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| D7  | The detector parses files itself rather than consuming `snapshot.files[].ast`       | `AST` is a lossy `{ type, body: unknown, language }` wrapper and the parser registry defaults to tree-sitter (`shared/parsers/registry.ts:3`), so estree tokens would not survive the snapshot. Precedent: `entropy/detectors/complexity.ts:1` already reads files directly. Cost: re-parsing, measured at 2.4s for 2,046 files including a dropped pass. Benefit: zero change to the shared parser or registry.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| D8  | Rank `partial-extraction` above plain duplication                                   | Earned by an observed instance: `packages/cli/src/shared/craft/fenced-json.ts` exports `extractFencedJsonPayload`, **10 craft packages import it, and those same 10 also declare their own local `parseFencedJson`** — 6 byte-identical. Half the refactor was done and the wrapper layer stayed duplicated. The subtlest class here and the cheapest to detect.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| D9  | TS/JS only — exactly `STATIC_SUPPORTED_EXTENSIONS`                                  | `.ts/.tsx/.js/.jsx/.mjs/.cjs`, matching the existing static-analysis surface.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## Technical Design

### New module: `packages/core/src/duplication/`

- **`tokens.ts`** — `normalizeTokens(tokens, range): string[]`. `Identifier` / `PrivateIdentifier`
  → `I`; `String` / `Numeric` / `Template` / `RegularExpression` / `JSXText` → `L`; `Keyword` /
  `Punctuator` / `Boolean` / `Null` / `JSXIdentifier` kept verbatim — see D1.
- **`units.ts`** — `extractUnits(ast): DupUnit[]` over ESTree `FunctionDeclaration`,
  `FunctionExpression`, `ArrowFunctionExpression`, `MethodDefinition`, `ClassDeclaration`, and
  `ClassExpression`; records `{ kind, name, startLine, endLine, range }`, with `name: '<anon>'` when
  no name is reachable. `ClassExpression` is included for symmetry — `const K = class { m() {} }`
  otherwise reported only its method. `StaticBlock` is excluded: it has no name and no call site, so
  it is not a unit anyone can extract. Naming looks one hop up when the node itself carries no `id`
  or `key` — `VariableDeclarator.id`, `Property.key`, `PropertyDefinition.key` — so
  `const sendJSON = (res, status, body) => {…}` reports `sendJSON` rather than `<anon>`; re-measured
  at HEAD over the **measured scope** (defined below) that named 647 of 13,394 extracted units
  (anonymous units fell from 36.1% to 31.2%).

  > **Measured scope.** Every figure in this spec that says "measured" or "re-measured at HEAD" is
  > over the 2,063 files that `findFiles('**/*.{ts,tsx,js,jsx,mjs,cjs}', '<repo>/packages')`
  > discovers and `isEligibleFile` admits under `DEFAULT_DUPLICATION_CONFIG`, holding 13,394
  > extracted units, of which 8,165 clear `minTokens` and are fingerprinted into 58 reported
  > classes (161 suppressed, 0 skipped, 0 collisions observed). Figures carried over from the
  > pre-implementation probes (the "60", the 2.4s) are labelled as such and are NOT over this
  > scope. A figure without a scope is not a measurement. A callback argument (`scan(bundle, (line) => …)`) has no name one hop up and stays
  > `<anon>`. A decorator is INSIDE the unit range, so `@dec class A` reports the decorator's line as
  > `startLine` and the decorator's tokens count toward `minTokens`.

- `extractUnits` requires an AST parsed with `{ loc: true, range: true }` and raises
  `MissingNodeLocationError` otherwise; it is a public export, so the precondition is enforced rather
  than assumed of the internal caller.
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
  // the first three blame the FILE; 'internal-error' blames our own
  // normalization or digest stage (or the runtime), not the file
  reason: 'unreadable' | 'unparseable' | 'unextractable' | 'internal-error';
  message: string; // the underlying read, parse, or extraction error
  errorName: string; // the Error's `name` — the class of failure
  originalError: Error; // for Phase 2's EntropyError.details.originalError; NOT serializable
}

export interface FingerprintCollision {
  fingerprint: string; // the digest both units share
  members: [CloneMember, CloneMember]; // first-seen, then the disagreeing unit
  tokenCounts: [number, number]; // positionally matching `members`
}

export interface CloneIndex {
  classes: CloneClass[];
  byMember: Map<string, CloneClass>; // `${file}:${startLine}` -> owning class
  skipped: SkippedFile[]; // one entry per filesSkipped increment — the evidence Phase 2 raises
  collisions: FingerprintCollision[]; // one entry per observed length-differing digest collision
  stats: {
    filesScanned: number;
    filesIgnored: number; // dropped by isEligibleFile before any read
    filesSkipped: number; // exact total; `skipped` is a capped sample of it
    skippedTruncated: number; // skips beyond the evidence cap
    unitsFingerprinted: number;
    unitsBelowMinTokens: number; // excluded BEFORE grouping — never fingerprinted
    classesReported: number;
    classesSuppressed: number; // formed, then dropped for falling below minInstances
    classesTruncated: number; // dropped by the maxClasses report cap
    collisionsObserved: number; // exact total; `collisions` is a capped sample of it
    collisionsTruncated: number; // collisions beyond the evidence cap
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

- If a candidate path is ineligible — unsupported extension, `.d.ts`, absolute, outside `rootDir`,
  or matched by `ignorePatterns` — the detector shall drop it before any read and count it in
  `stats.filesIgnored`. An ineligible file must not be invisible: counted in neither `filesScanned`
  nor `filesSkipped`, a silently dropped file reads exactly like a file that was scanned and held no
  duplication. An ABSOLUTE path is ineligible because `path.relative` returns one across Windows
  drives, where it would neither start with `../` nor fail the extension test, and
  `CloneMember.file` would then contradict its own repo-relative contract.
- If a source file cannot be read, the detector shall skip that file, increment `filesSkipped`,
  record a `SkippedFile` entry on `CloneIndex.skipped`, and continue.
- If a source file fails to parse, or its units cannot be extracted, normalized, or fingerprinted,
  the detector shall skip that file, increment `filesSkipped`, record a `SkippedFile` entry, and
  record an `AnalysisError` with `analyzer: 'duplication'` — it shall not fail the entropy run. The
  reason, message, error name and the `Error` itself are carried on the index rather than collapsed
  into a count, because Phase 2 cannot raise a per-file `AnalysisError` from a bare counter.
- A failure of the detector's OWN post-parse stages — normalization or the digest — shall be
  recorded as `reason: 'internal-error'`, distinctly from the file-blaming reasons, and the
  all-files-skipped advice shall be keyed to the reasons observed. Otherwise a FIPS-mode Node where
  `createHash('sha1')` throws turns every file into a file-blaming skip and the error advises
  "Check file permissions" and "Check that the discovered files are valid TS/JS", which is actively
  misleading for an environment failure.
- If EVERY eligible file is skipped, the detector shall report that explicitly rather than
  returning an index with zero classes. At 100% skip the result is indistinguishable from the
  zero-discovery case below; a partial skip (1 of N) still returns `Ok`, because that is a scan that
  happened.
- Units group on `${fingerprint}:${tokenCount}`, not on `fingerprint` alone, so two units whose
  digests collide while their normalized streams differ in length physically cannot form a class
  together. Such a pair shall be RECORDED — one `CloneIndex.collisions` entry, counted in
  `stats.collisionsObserved` — and shall not fail the scan: failing would discard every other valid
  class, the stats and the `byMember` seam to avoid one spurious member in an advisory-first
  detector (D4), and a deliberate 64-bit collision with attacker-chosen token counts is only ~2^32
  work, which would make the analyzer's availability the easier target than its accuracy. (An
  earlier revision grouped on the digest alone and returned `Err` on a token-count disagreement.
  That check also sat after the `minInstances` bar, so the likeliest shape — a collision between
  two otherwise-singleton units, forming a 2-member group — never reached it at all.)
- The record is a PARTIAL detector and is documented as one: a collision between two EQUAL-length
  streams agrees on `tokenCount`, so it groups normally and is invisible to any such check. Zero
  observed collisions means "no length-differing collision was seen over the measured scope", not
  "no collision occurred". Measured at HEAD: 0 observed over the 8,165 fingerprinted units of the
  measured scope.
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
- Each EVIDENCE array on the index — `skipped` and `collisions` — is capped at
  `MAX_EVIDENCE_ENTRIES` (100), with the overflow in `stats.skippedTruncated` /
  `stats.collisionsTruncated`, mirroring `maxClasses` / `classesTruncated`. `classes` was the only
  bounded array: a repo with thousands of unparseable files otherwise yielded one `skipped` entry
  per file, each carrying a full parse message and the `Error` behind it, every one of which Phase 2
  is specified to serialize into an `AnalysisError`. The COUNTS stay exact and the reason breakdown
  is tallied as skips happen, so a capped array never understates the damage. The cap is a module
  constant, not a fifth `DuplicationConfig` field: it is an internal guard rail, not a reporting
  threshold an operator tunes.
- If zero source files are discovered, the detector shall report that explicitly rather than
  reporting zero duplication. This follows the established convention at
  `packages/cli/src/commands/cleanup.ts:88` — "Refusing to report a pass over zero rules" — and
  guards the failure class where an empty scan is indistinguishable from a clean one.

### Configuration

```ts
export interface DuplicationConfig {
  minTokens: number; // default 40
  minInstances: number; // default 3 (Rule of Three)
  ignorePatterns: readonly string[]; // default: tests, fixtures, generated, build output
  // minimatch with { dot: true, nocase: true } — NOT the regex language
  // DriftConfig.ignorePatterns uses. See the field's JSDoc.
  maxClasses: number; // default 100 (report cap)
}
```

`DEFAULT_DUPLICATION_CONFIG` is deep-frozen (the object and its `ignorePatterns` array), since it
is a process-wide singleton on a public API; `resolveDuplicationConfig` returns a fresh mutable
config with its own array, so a consumer tunes only its own copy.

The defaults deliberately do **not** ignore `index.*`. A true barrel is pure re-exports, so it
yields no units and cannot produce a false positive — ignoring it buys nothing — while in this repo
`index.ts` is routinely a package's main implementation module. Re-measured at HEAD over the
measured scope: ignoring it drops the reported classes from 58 to 48, suppressing 10 classes
composed entirely of `index.*` files, `sumCosts` x10 among them — the first named item in the
Evidence section above.
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

### Known lossiness: the `byMember` key

`${file}:${startLine}` is spec-mandated (it is the O(1) seam `code-craft` can compute from a unit
target) and is deliberately not changed. It is lossy where two units start on one line: a function
and a nested arrow already collided that way, resolved first-writer-wins in rank-descending order.
`ClassExpression` widens it slightly — a one-line `const K = class { m() {} }` puts the class and
its method on the same key. Measured a non-issue at HEAD: over the measured scope `byMember.size`
is 230, exactly the 230 members of the 58 reported classes, so no reported member is currently
displaced.

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

**`AnalysisError['analyzer']` does not include `'duplication'` today**
(`entropy/types/report.ts:12`). The JSDoc on `CloneIndex.skipped` already describes Phase 2
converting each skip into an `AnalysisError` with `analyzer: 'duplication'`, so that binding does
not typecheck until this phase adds the union member. Naming it here so it is not discovered late,
mid-implementation, as a surprise type error in the detector.

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

**Four things Phase 2 hands forward — the first two are decisions Phase 3 must make consciously
rather than inherit; the last two are properties it must not ship without checking:**

1. **Whether `harness cleanup -t duplication` may exit non-zero — a D4 question, not a CLI
   question.** Phase 2 counts clone classes in `EntropyReport.summary.totalIssues` (so a summary
   cannot report a clean run over a scan that found classes) and in neither `summary.errors` nor
   `summary.warnings`. But `packages/cli/src/commands/cleanup.ts` maintains its **own**
   `totalIssues` field and ends with
   `process.exit(result.value.totalIssues === 0 ? ExitCode.SUCCESS : ExitCode.VALIDATION_FAILED)`
   (`cleanup.ts:150` populates it, `:230` gates on it). If Phase 3 adds `duplication` to
   `CleanupType` and lets clone classes flow into that field unchanged, then `harness cleanup -t
duplication` exits non-zero on advisory-only findings — **violating D4 ("advisory first; never
   fail-closed") as a downstream consequence of a Phase-2 choice, with nobody having decided it.**
   Phase 3 must either keep duplication out of the CLI's exit-code arithmetic or record an explicit
   decision to change D4. ADR 0134 names this as a consequence; it is not resolved there.

2. **Whether the default `ignorePatterns` should exclude vendored build caches.** Measured during
   Phase 2 at criterion 6's scope: **2 of the 98 reported classes (6 of 388 reported members) are
   composed of `docs/.vitepress/cache/deps_temp_*/vitepress___@vueuse_core.js`** — a Vite
   dependency pre-bundle, i.e. vendored generated output nobody will ever refactor. They are false
   positives by construction, and that one file is also 1,509 units over 61,904 tokens, which made
   it the single largest contributor to the pre-optimization token-visit cost. The defaults ignore
   `dist`, `build`, `coverage`, `generated` and `node_modules` but not `**/.vitepress/cache/**`.
   This is left to Phase 3 deliberately, because it belongs to the **top-20 precision audit
   (criterion 2)** that Phase 3 already owns, and because changing `DEFAULT_DUPLICATION_CONFIG`
   would move the class counts Phase 1 and Phase 2 recorded as evidence. Phase 3's audit should
   expect to find these two and decide the exclusion then.

   **Audit instruction:** before recording any precision verdict, run
   `git ls-files docs/.vitepress/cache | wc -l` and record the result beside it. That directory is
   TRACKED today (9 files, 2.2 MB, `git check-ignore` exits 1), which is why the recorded figures
   reproduce on a clean checkout — but a docs dev server regenerating or clearing it moves the
   class, member and fingerprint counts without any code changing. An audit that does not say
   which state it ran in is not reproducible. See Verification notes.

3. **Phase 3 owns the config surface, and that surface is what made two defects reachable.**
   Exposing `analyze.duplication` through `harness cleanup -t duplication` and the
   `detect_entropy` MCP enum is precisely what turns an in-repo type into an operator-supplied
   value parsed from **untyped `harness.config.json`**. Two defects found in Phase 2's review were
   reachable only through that surface and are fixed in core, but the surface is Phase 3's:
   - A non-string `duplication.ignorePatterns` entry made `minimatch` throw out of a loop that no
     `try` covered, through `detectDuplication` and through `EntropyAnalyzer.analyze()`, taking
     the entire entropy run down — drift, dead code, patterns, complexity, coupling and size
     budget with it. `buildCloneIndex` now returns `Err INVALID_CONFIG` with
     `details.reason: 'invalid-ignore-pattern'`. Phase 3 must still validate what it threads from
     JSON rather than assume the type: `minTokens`, `minInstances` and `maxClasses` are numbers in
     the type and strings in a hand-edited config, and none of them is validated anywhere today.
   - Supplying both graph drift and graph dead-code data makes `analyze()` bypass the snapshot
     (`files: []`), which tripped duplication's zero-discovery refusal and blamed
     `EntropyConfig.include`. `loadEntropyGraphOptions` in `packages/cli/src/mcp/tools/entropy.ts`
     returns both keys whenever a graph exists, so this is the live MCP path. Duplication now
     reports `details.reason: 'snapshot-bypassed'` and does not run. Phase 3 should surface that
     reason rather than swallow it — "duplication did not run" must not render as "no duplication
     found".

   **And Phase 3's verification must re-test WIRED at the product level.** Phase 2's VERIFY
   recorded that no production call site sets `analyze.duplication` today: the detector is wired
   to the analyzer, which is not the same as being reachable by a user. Phase 1's lesson was that
   export != wiring; this is the same lesson one layer out. "Wired" for Phase 3 means a real
   `harness cleanup -t duplication` invocation and a real `detect_entropy` call produce
   duplication findings, traced from the entry point.

4. **`DuplicationReport.byMember` is a `Map` on a report that `detect_entropy` JSON-stringifies,
   so it serializes to `{}`.** Not a new hazard — `snapshot.exportMap.byFile` is already a `Map`
   on the same report and already serializes away — but Phase 3 owns the serialization surface and
   should not ship a `byMember` nobody can read. The options are to omit it from the serialized
   payload (honest: it is an in-process index, and `CloneClass.members` already carries every
   member), or to convert it to an array of entries at the boundary. Either is a decision; shipping
   `{}` is not.

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

## Verification notes

Where each phase's verification evidence and accepted gaps are recorded. Criterion 2's top-20
audit verdicts land here when Phase 3 performs them (see Phase 3's audit instruction above).

### Phase 2 — ACCEPTED GAP: criterion 6's wall-clock bar has no automated guard

Criterion 6 is an absolute wall-clock bar — `detectDuplication` under 10 seconds over this
repository's non-test sources. It is **met**, and it is **unguarded**. That combination is
recorded here deliberately rather than left as a silent omission.

**Measured met, at both scopes, by three independent runs:**

| Scope                                                                     | Measured                                                                       | Bar       |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------- |
| B — criterion 6's own scope (repo non-test sources, 2,153 eligible files) | 1,997 / 2,053 / 2,327 ms (execution); 2,449-3,047 ms (re-measured post-review) | 10,000 ms |
| A — the Evidence section's scope (`packages/` only, 2,065 files)          | 1,729 / 1,746 / 1,770 ms (execution); 2,088-2,253 ms (re-measured post-review) | 10,000 ms |

**What IS guarded.** `tests/entropy/detectors/duplication.perf.test.ts` asserts a deterministic
token-visit bound instead of a duration, so it cannot flake. It is mutation-verified: reverting
the binary search in `normalizeTokens` costs 496,800 visits against a 6,480 bound (exactly
120 units x 4,140 tokens) while all token-equivalence tests still pass. That guards a
**reversion of the binary search** — the one regression anybody has a concrete reason to expect.

**What is NOT guarded.** The literal `<10s` bar. A 4x slowdown from a slower parser release, a
materially larger repository, or an added pass over the token stream would be caught by nothing
in CI. Nothing would go red; the criterion would simply stop being true. The visit bound is a
proxy for one cause, not for the property.

**Why the bar is not asserted.** The same code measured 3.0 s and then 8-9 s on this machine
minutes apart under a load average of 39, and a reference implementation timed in the same
process slowed by the identical factor — load, not regression. The post-review re-measurement
above moved 25% on an idle machine for the same reason. A 10 s bar over a ~2.5 s run leaves
~4x headroom, and a 3x machine swing eats most of it, so a timing assertion would go red when
the machine is busy and green when a real regression lands on a quiet one. If criterion 6 ever
needs a real guard, the honest form is a tracked measurement with a trend, not an assertion.

### Phase 2 — the Scope-B evidence figures depend on a TRANSIENT directory

Scope B's figures (98 classes, 388 members, 9,708 units fingerprinted at Phase 2's HEAD;
9,710 after the post-review batch added two units to `duplication/index.ts`) include
`docs/.vitepress/cache/deps_temp_*`. That directory is **tracked in git today** — 9 files,
2.2 MB, `git check-ignore` exits 1 — so the figures reproduce on a clean checkout. But it is a
Vite dependency pre-bundle cache: a docs dev server regenerating or clearing it moves the class,
member and fingerprint counts with no code change at all.

No test breaks when that happens, by design — criterion 10 forbids asserting this repository's
class count. The exposure is that this spec and ADR 0134 pin **evidence** to a cache directory's
contents. Two of the 98 classes are composed of that cache's files (Phase 3 forward note 2), and
two of its bundles accounted for 81.7% of the pre-optimization token-visit cost.

### Phase 2 — cost figures carry a scope AND a denominator

Recorded because this one figure was wrong in three places at once, in two different ways.

The pre-optimization per-file cost was quoted as "26.0M token visits against 1.40M tokens —
18.6x". Both halves were measured correctly and both were mislabelled:

- **Scope.** 26.0M is Scope A (`packages/` only). At the detector's own scope the same method
  measures 214,130,152 visits — an 8x understatement, because the quadratic term is dominated by
  whichever pathological file is in scope (two `docs/.vitepress/cache/` bundles are 43.6% and
  38.1% of Scope B's pre-fix cost; `orchestrator/src/orchestrator.ts` is 19.2% of Scope A's).
- **Denominator.** "1.40M tokens" counts all eligible files; Phase 2's notes counted 1,315,964,
  which is the tokens in files yielding at least one unit. Both are right, 6% apart, and the gap
  is the 507 eligible files that parse but contain no extractable unit. All-files gives 18.6x pre
  / 1.16x post at Scope A; unit-bearing files gives 19.8x / 1.23x. Post-review re-measurement at
  HEAD: Scope A 1,400,920 vs 1,316,878 tokens, 26,055,026 -> 1,625,558 visits; Scope B
  1,605,885 vs 1,519,596 tokens, 214,130,152 -> 1,976,826 visits (108x).

Both module comments now state scope and denominator on every figure. The standing rule for this
change: a count without its discovery scope is not a measurement, and a ratio without its
denominator is not one either.

### Phase 3 — criterion 2: the top-20 precision audit (one round, ≥90% on the first pass)

Audited at HEAD `62d6a81aa` on the product scope as it ships (no exclusion tightening).
Reproducibility state, per this spec's audit instruction:
`git ls-files docs/.vitepress/cache | wc -l` = **9**, `git check-ignore docs/.vitepress/cache`
exit **1** (tracked, not ignored). Evidence came from the REAL command,
`harness cleanup -t duplication --json`, which exited **0** over 96 advisory classes.

Counters: filesScanned **2,144**, classesReported **96**, members **382**, classesSuppressed
**162**, classesTruncated **0**.

Rejection clauses (fixed): (a) extraction would need one distinct parameter per member;
(b) structurally forced by a framework or interface contract and could not differ; (c) the
shared body is type-only or a re-export.

| #   | rank | tok | n   | class                                                        | verdict           |
| --- | ---- | --- | --- | ------------------------------------------------------------ | ----------------- |
| 1   | 2592 | 648 | 4   | `runGates` ×4 platform mirrors                               | genuine           |
| 2   | 1320 | 440 | 3   | `collect{Api,CliErgonomics,Docs}CraftPrompts`                | genuine           |
| 3   | 1288 | 161 | 8   | `handle*Craft` ×8 MCP tools                                  | genuine           |
| 4   | 1224 | 306 | 4   | `renderReport` ×4 platform mirrors                           | genuine           |
| 5   | 990  | 110 | 9   | `handle*CraftFinalize` ×9                                    | genuine           |
| 6   | 980  | 98  | 10  | `sumCosts` ×10                                               | genuine           |
| 7   | 916  | 229 | 4   | `runAction` ×4 craft commands                                | genuine           |
| 8   | 876  | 219 | 4   | `extractConflictHunks` ×4 platform mirrors                   | genuine           |
| 9   | 846  | 282 | 3   | `printResult` ×3 craft commands                              | genuine           |
| 10  | 716  | 179 | 4   | `parseVitestJson` ×4 platform mirrors                        | genuine           |
| 11  | 704  | 44  | 16  | `sendJSON` / `sendJson` / `jsonResponse` ×16 routes          | genuine           |
| 12  | 704  | 176 | 4   | `dedupeFindings` ×4 platform mirrors                         | genuine           |
| 13  | 693  | 77  | 9   | `finalizeInputError` ×9                                      | genuine           |
| 14  | 630  | 210 | 3   | `parseFindingFromRaw` ×3 critique phases                     | genuine           |
| 15  | 604  | 151 | 4   | `renderFinding` ×4 platform mirrors                          | genuine           |
| 16  | 596  | 149 | 4   | `renderFixes` ×4 platform mirrors                            | genuine           |
| 17  | 584  | 146 | 4   | `parseEslintJson` ×4 platform mirrors                        | genuine           |
| 18  | 568  | 142 | 4   | `summarize` ×4 platform mirrors                              | genuine           |
| 19  | 560  | 140 | 4   | `parseTscOutput` ×4 platform mirrors                         | genuine           |
| 20  | 525  | 105 | 5   | 5 anonymous `.map` callbacks in `typescript-strict-agent.ts` | genuine (weakest) |

**Precision: 20/20 = 100%.** Every class was judged by opening at least two members and
reading the code, not by the name. The craft-family rows (#2, #3, #5, #6, #7, #9, #13, #14)
differ only in a tool-name string, an injected function or a type parameter; `sumCosts` ×10 and
the 16 JSON-response helpers have byte-identical bodies and need no parameterization at all.
Row #20 is the one judgment call: five `ReviewFinding` literals differing in four string
fields, extractable as `buildStrictFinding(match, tag, title, rationale, suggestion)` — four
parameters SHARED by all five members, so clause (a) ("one distinct parameter per member")
does not fire, though the helper is only modestly shorter than the literals.

#### The platform mirrors are TRUE POSITIVES

The Phase 3 plan proposed rejecting the 10 mirror classes under clause (b) and tightening the
exclusions from 96 classes to 58. That reading was **overruled**, and the overrule's evidence
was re-verified first-hand before the verdicts were written:

- `md5 -q` over the four `harness-branch-buster/scripts/run-gates.mjs` copies:
  `aa091f0eb1e00147120d0fe0b9aa2f7f` ×4; four distinct inodes; all four
  `harness-branch-buster` directories are real directories, not symlinks.
- **There is no mirror generator.** No `scripts/*mirror*` and no package script that emits the
  copies; the only related script is `test:platform-parity`, which ASSERTS they match. The
  files carry no generated-file marker (only an `eslint-disable` for vendored tooling).
- All four copies landed in one commit, `32815504d` (#2134).
- `agents/skills/codex/` holds 793 entries: **101 symlinks and 692 real directories**
  (`harness-refactoring` IS a symlink; `harness-branch-buster` is not).

Clause (b) does not apply: the parity test forces the copies to be IDENTICAL, but nothing
forces them to be SEPARATE FILES. "Could not differ" is false — they could be one file, as 101
sibling skills already are, and the extraction is a one-line `ln -s` this repository already
performs elsewhere. **No exclusion tightening was applied, and `harness.config.json` was not
modified.**

#### The 38/96 concentration is a RANKING / GROUPING problem, not a precision problem

Over all 96 classes: **38 (39.6%)** are composed exclusively of `agents/skills/` files,
carrying **152 of 382 members (39.8%)**; **every one has exactly 4 members** (one per
platform); **zero** classes span the skills tree and the rest of the repo, so the 96 partition
into 38 mirror + **58 non-mirror classes / 230 members**; and all 38 come from **one** skill,
`harness-branch-buster`, over 20 files (5 scripts × 4 platforms).

One repeated structural cause producing 40% of the rows is a presentation problem — the
operator reads 38 rows of the same finding. The honest remedy is grouping or a note in the
output, never silencing. **Recorded as a Phase 4/5 follow-up; not implemented in Phase 3.**

Sizing the exposure with its denominator: the 4×-copy convention reaches 692 of 793 mirror
entries per platform (~87% of the skill tree), but only one skill carries executable code —
exactly **11 code files per platform mirror, all in `harness-branch-buster`** (44 across four
platforms). Everything else in the mirrors is markdown, which a code-unit detector does not
parse. So the duplication the detector can SEE is 38 classes / 152 members / 20 files from one
skill; the 692 figure is the convention's reach, not a count of findings, and the two must not
be conflated.

#### Arm B's open question, resolved without a second scan

The plan recorded an ASSUMPTION that excluding the three non-canonical mirror trees leaves 58
classes / 230 members. Because no class spans the skills boundary, that follows from this run:
the 58 non-mirror classes / 230 members are exactly the complement of the 38.

**Set identity with Scope A is PROVEN** (corrected in the review-fix batch; it was first
recorded as unproven, on a subset digest computed with a different formula). The formula is
recorded here so the figure is reproducible rather than merely asserted:

```
digest(classes) = sha1( sorted( `${fingerprint}:${memberCount}` ).join(',') ).slice(0, 16)
```

Applied to a fresh Scope C run at HEAD `a3de61b21` — reproduced from `git archive` into a
clean tree so the review-fix batch's own source changes could not move the index — it
re-measures 96 classes / 382 members / 2,144 scanned / 162 suppressed / 0 truncated / 0
skipped, partitions into 38 skills-touching + 58 non-skills classes (152 + 230 members), and
yields:

| subset                         | digest             |
| ------------------------------ | ------------------ |
| all 96 classes (Scope C)       | `82238daa001b8e1a` |
| the 58 non-mirror classes      | `7e0f1622fb75abbc` |
| the 38 platform-mirror classes | `8f51cf3b34d3c412` |

`7e0f1622fb75abbc` is byte-for-byte the Scope A whole-index digest recorded in the **Phase 2
gate-fix handoff** (`.harness/sessions/.../handoff.phase-2-gate-fix.json`, "scope A
7e0f1622fb75abbc (2,065 / 8,170 / 58 / 230 / 161)") — NOT "recorded above" in this document,
as an earlier revision of this section claimed; it never appeared here. Equal digests over
`(fingerprint, memberCount)` with equal cardinality is set identity for this index, so Scope
C's non-mirror complement and Scope A's whole index are the same 58 classes.

The previously recorded subset digest `0d538cfc9c99c0c2` is **irreproducible** — 14
serialization variants across two algorithms failed to reproduce it — and is superseded by
the table above. The partition predicate used here is "any member file path contains
`agents/skills/`", which is unambiguous because zero classes span that boundary and all 38
come from one skill (`harness-branch-buster`).

### Phase 3 — Scope C: the product scope is a THIRD scope

`harness cleanup -t duplication` builds `EntropyConfig` from this repository's config:
`rootDir` = repo root, this repo's 62 configured entry points, this repo's 12
`entropy.excludePatterns`, `DEFAULT_DUPLICATION_CONFIG` otherwise.

| counter            | Scope C (product) | Scope B (detector's own) | Scope A (`packages/` only) |
| ------------------ | ----------------- | ------------------------ | -------------------------- |
| filesScanned       | **2,144**         | 2,153                    | 2,065                      |
| classesReported    | **96**            | 98                       | 58                         |
| members            | **382**           | 388                      | 230                        |
| classesSuppressed  | **162**           | 174                      | 161                        |
| classesTruncated   | **0**             | 0                        | 0                          |
| vitepress-composed | **0**             | 2                        | 0                          |

96 vs 98 vs 58 is **scope, not regression**. Scope C = Scope B minus this repo's
`excludePatterns` (chiefly `**/.vitepress/cache/**`). Scope C's filesScanned is 2,144 rather
than the 2,143 measured at plan time because Phase 3 adds one source file
(`packages/cli/src/shared/duplication-request.ts`).

### Phase 3 — criterion 1 evidence

`harness cleanup -t duplication --json` on this repository, exit **0**:

- `sumCosts`: one class, **10 members**, 98 tokens, rank 980 (#6 by rank).
- The orchestrator JSON-response class: **16 members**, 44 tokens, spanning `sendJSON`,
  `sendJson` and `jsonResponse` (#11 by rank).
- Across all 96 classes: min members **3**, min tokens **41** — the Rule of Three and the
  40-token floor both hold at the product scope.

### Phase 3 — the command's wall clock is snapshot-dominated

`harness cleanup -t duplication` on this repository: **12.2 s / 13.2 s warm, 44.6 s cold**
(plan time measured `analyze()` alone at Scope C: 23.8-24.1 s warm, 58.7 s cold — same shape,
a warmer machine). Criterion 6's bar is `detectDuplication` ALONE, which Phase 2 measured at
2.4-3.0 s at Scope B. That criterion is unchanged and still unguarded (Phase 2's accepted
gap). **The command's cost is not the detector's figure, and the detector's figure must never
be presented as the command's runtime.**

### Phase 3 — answers to Phase 2's four forward notes

1. **Exit code.** Clone classes are excluded from `CleanupResult.totalIssues` — the field
   `process.exit` gates on (`cleanup.ts`) AND the field `--findings-json` publishes as the
   #691 maintenance contract. The plan found that second channel; both are covered, and both
   are proved by a spawned-process test against the mutant (folding
   `duplication.classes.length` into the sum turns the real process's status to 1 and the
   contract line to `{ findings: 1 }`). Observed on this repository: exit **0** over 96
   classes, `{"findings":0,"v":1,"check":"cleanup"}`. ADR 0134's open consequence is resolved,
   not amended.
2. **Vitepress false positives.** Moot at the product scope: this repository's
   `entropy.excludePatterns` already carries `**/.vitepress/cache/**` and `cleanup.ts` threads
   it, so the CLI reports **0** vitepress-composed classes among the 96. At the detector's own
   default scope the two known false-positive classes (6 members) remain.
   `DEFAULT_DUPLICATION_CONFIG` is **unchanged** in Phase 3: the product scope is already
   clean, changing the default would move Phase 1's and Phase 2's recorded evidence for a case
   this repository cannot observe, and the honest generalization (vendored dependency
   pre-bundles of any bundler, not just vitepress) deserves its own follow-up.
3. **Config surface.** `entropy.duplication` did not exist as a validated key:
   `EntropyConfigSchema` had no such member, so zod stripped it —
   `collectStrippedKeys(HarnessConfigSchema, { entropy: { duplication: { minTokens: 50 } } })`
   returned `[{ path: 'entropy.duplication' }]` and the loader printed
   `ignored unknown key 'entropy.duplication'` (measured before the change; `[]` after).
   `DuplicationConfigSchema` now bounds `minTokens` (int, positive), `minInstances` (int, ≥2 —
   `buildCloneIndex` hard-skips groups below 2, so 1/0/negative silently mean "report every
   pair"), `maxClasses` (int, positive — `0` reports ZERO classes while counting every
   qualifying one in `classesTruncated`, a pass over findings that were found) and
   `ignorePatterns` (string array, documented as REPLACING the shipped 21 globs because
   `resolveDuplicationConfig` merges by key). Measured zod-3 detail worth knowing: a wrong
   TYPE fails both arms of the `boolean | object` union, so the field-qualified path lands
   inside `invalid_union`'s `unionErrors` while the top-level issue path stops at
   `entropy.duplication`; a wrong RANGE reports the field path at the top level.
4. **`byMember`.** Omitted from the `detect_entropy` payload rather than converted. Measured
   before the change, the detailed response carried
   `duplication: { classes, byMember, collisions, skipErrors, stats }` with `byMember: {}` —
   a `Map` rendered by `JSON.stringify` as an empty object, indistinguishable from an empty
   index. `skipErrors[].details.originalError` (an `Error`, `{}` for the same reason) is
   dropped by the same projection. `snapshot.exportMap.byFile` has the same defect, predates
   this change, and is named rather than silently inherited. Summary mode gained
   `advisory.duplication` (counters, member total, top three classes) strictly outside
   `totalIssues`.

### Phase 3 — two surfaces, one asymmetry worth naming

On a project that HAS a knowledge graph, `detect_entropy type: "duplication"` can only return
the did-not-run refusal: `loadEntropyGraphOptions` supplies BOTH graph keys unconditionally
whenever a graph exists, which makes `analyze()` bypass the snapshot the detector discovers
through. Observed on this worktree, which has no `.harness/graph` of its own —
`resolveGraphDir` resolves to the main checkout's
`/Users/cwarner/Projects/iv/harness-engineering/.harness/graph`, so the tool returned
`isError: true` with the analyzer's own `snapshot-bypassed` reason in 3.5 s. That is the
guard working on real data rather than on a fixture, and it is why "did not run" must never
render as "found nothing". The CLI path passes no graph data and is unaffected (96 classes).
Making `loadEntropyGraphOptions` conditional on the requested type is a **follow-up**, not
Phase 3's scope.

### Phase 3 — the review-fix batch, and six corrections to this record

Applied after VERIFY passed at all three tiers and REVIEW returned REQUEST CHANGES (0
critical, 6 important, 4 suggestions; 11 mutants planted, 2 surviving). Both reviewers
corrected the record in several places, and so does this section — including a claim of the
operator's own.

**The `detect_entropy` detailed payload delivered nothing actionable.** Measured on the
`duplication-cli-project` fixture: 51,333 payload bytes of which `snapshot` was 50,460
(98.3%) and `snapshot.files[].ast` alone 41,289 (80.4%), while everything a caller acts on
(`summary` + `analysisErrors` + `timestamp` + `duration` + `duplication`) was 865 bytes
(1.7%), beginning at byte 50,409. The compaction middleware truncates by PREFIX at a
4,000-token budget, so the delivered 16,261 bytes were pure AST. Absolute byte totals are
path-length-sensitive (absolute fixture paths are embedded in the payload), and so, slightly,
are the shares — publish the shares, and name the fixture. Fixed inside `toJsonSafeReport` by
emitting the actionable keys BEFORE `snapshot` and dropping the per-file ASTs; NOT by making
the generic compaction middleware payload-aware.

Two corrections to how that truncation was characterized:

1. **It is not a silent absence.** The response carries
   `[truncated — prioritized truncation applied]` and a `[harness spill] ... locator:` line
   that preserves the full payload on disk. The delivered text is UNPARSEABLE (`JSON.parse`
   threw at position 15954), not misleadingly empty — a reader gets an error, not a false
   clean.
2. **The defect was broader than duplication.** `summary` and `analysisErrors` truncated away
   too, so every detailed consumer of `detect_entropy` was affected, not only the duplication
   one. That is why the fix is the key order and not a duplication-specific carve-out. The
   residual, named and MEASURED: reordering guarantees the actionable keys are inside the
   delivered prefix, not that the delivered text parses — on a project whose post-AST-strip
   payload still exceeds the budget, the prefix is cut mid-value. At Scope C (96 classes / 382
   members) the duplication block ALONE serializes to 61,179 bytes ≈ 15,295 estimated tokens,
   nearly 4x the 4,000-token budget, measured on the CLI's projection (which drops `byMember`,
   `collisions` and `skipErrors`, so the MCP payload is at least that large). The claim that
   the reorder makes "100% of the actionable payload survive" therefore holds only while the
   actionable payload is itself small — true on the fixture, false on this repository.
   `compact: false` plus the spill locator remains the only way to get a whole report at
   product scale. (This repository cannot exercise that path through MCP today anyway: it has
   a knowledge graph, so `detect_entropy type: "duplication"` can only return the
   snapshot-bypassed refusal — which is why the figure is taken from the CLI projection at the
   same scope.)

**`filesSkipped` IS observable — the earlier "not observable through either shipped surface"
was wrong.** `detect_entropy { type: "duplication", compact: false }` returns the full
parseable report with all 13 `stats` keys, and the spill file preserves it. As of this batch
it is observable in three more places: the CLI's `--json` (`duplication.filesSkipped`), the
CLI's printed advisory line (`; N file(s) skipped`, only when non-zero), and MCP detailed mode
at the DEFAULT compaction setting whenever the duplication block fits the budget — which the
key reorder is what makes true. It remains UNOBSERVABLE in MCP **summary** mode, whose
`advisory.duplication` carries `classesReported` / `classesSuppressed` / `classesTruncated` /
`membersReported` / `topClasses` and no skip counter. Recorded as the remaining gap, not
closed here.

**The two surfaces had opposite config-failure policies, and this phase created the trap.**
`cleanup.ts` goes through `resolveConfig` and exits 2 on an invalid config; the MCP tool's
`loadEntropyConfig` did `if (!loaded.ok) return undefined`, silently discarding the WHOLE
`entropy` block — `entryPoints` and `excludePatterns` included — and scanning on built-in
defaults. Proven on identical input (`entropy.duplication: { minInstances: 1 }`, the exact
mistake the new bound exists to catch). The silent fallback is pre-existing, but a validation
error inside `entropy.duplication` was IMPOSSIBLE before this phase (zod stripped the key), so
the phase is what made it reachable. The MCP surface now refuses, naming the field.

**An unknown `-t` / `type` value was a green pass on both surfaces**, including the #691
contract (`harness cleanup -t bogus --findings-json` → `{"findings":0,...}`, exit 0) and the
MCP wire (the JSON-schema `enum` is advertisement; the SDK does not enforce it). One shared
`ENTROPY_ISSUE_TYPES` list now backs the CLI's `.choices`, the MCP enum and a membership check
on both.

**The `skipIf(!CLI_BUILT)` guard DOES have precedent in this repo** — correcting a false
non-existence claim made to the reviewer. `packages/cli/tests/e2e/support/tiers.ts:34` exports
`skipUnlessBin` (from `HAS_HARNESS_BIN`) as the ADR 0111 vocabulary created so gated tests stop
inventing their own predicate and stay greppable; `tests/comprehension/comprehend-smoke.e2e.test.ts`
uses the same dist-existence pattern at 6 sites; and `.github/workflows/main-health.yml` states
verbatim that "a silently-skipped suite must not read as a pass", with a grep-based reachability
assertion. The guard is therefore ADR-sanctioned and is NOT made to fail loudly (ADR 0111
already rejected that trade — it breaks a contributor who runs vitest before `build`). What
this phase got wrong was keeping the guard and dropping the mitigation: the D4 suite now gates
on the shared predicate and `main-health.yml` gained a sibling assertion covering gated suites
outside `tests/e2e/`.

**Mutation coverage.** Two surviving mutants closed and re-verified by re-planting: M14 (the
MCP did-not-run guard — deleting the whole branch had left 49/49 green, because the fixture has
no `.harness/graph` so `snapshot-bypassed` never fired, while on any graph-bearing project that
refusal is the ONLY outcome the surface can produce) and M6 (the
`skipErrors[].details.originalError` strip — the fixture yields `skipErrors: []`, so the
`.map()` never executed).

### Phase 3 — deferred, with owners

- Knowledge-graph concept nodes (`partial-extraction`, `CloneClass`) remain unclaimed by any
  phase and are **deferred**; `manage_adr`/graph enrichment is also not worktree-aware
  (#1507), so half-doing it here would write to the wrong checkout.
- Grouping or noting repeated structural causes in the output (the 38/96 concentration) —
  Phase 4/5.
- `loadEntropyGraphOptions` type-awareness so the MCP surface can report duplication on a
  graph-bearing project.
- A vendored-build-cache glob for `DEFAULT_DUPLICATION_CONFIG.ignorePatterns`, generalized
  beyond vitepress.
