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
  rank: number; // tokenCount * members.length -- the SIZE, never scaled by the signal
  priority: number; // the ORDERING key: rank, x2 when signal === 'partial-extraction'
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

A clone class is labelled `partial-extraction` when **every member's unit BODY CALLS INTO one
common FIRST-PARTY module through a VALUE binding**; `sharedImport` names that module by its
repo-relative extensionless key. Five conditions, each earned separately by measurement over this
repository's 96 reported classes (full ladder in "Phase 4 — the measured derivation"):

1. **Module IDENTITY, not specifier strings.** Ten craft `phases/critique.ts` files sit at equal
   depth, so `../findings/schema.js` is the same STRING in all of them while naming a different
   file per package. Intersecting raw specifiers both over-reports (89 of 96) and mis-reports
   (three "shared" modules for the `parseFencedJson` class, two of which are not shared at all).
2. **Inside the unit BODY, not anywhere in the file.** This is the condition that turns a label
   into a signal: 88 of 96 at file level versus 37 at body level, and all 38 platform-mirror
   classes are labelled at file level because four copies of one file share an import list by
   construction.
3. **Value imports only**, excluded per DECLARATION and per SPECIFIER (`import { type X, y }`).
   Two classes turn on the per-specifier arm alone. A shared `import type` IS criterion 2's
   "structurally forced by an interface contract" false positive; a shared helper the duplicated
   bodies CALL is the half-done extraction this decision was earned by.
4. **First-party modules only.** Nobody extracts a wrapper into a Node builtin or an installed
   dependency; "every member calls `node:path`" labelled 17 further plain duplicates.
5. **A CALL position, not a mention.** The binding must appear as a call callee
   (`extract(x)`, `new Formatter(m)`), a method-call receiver (`fmt.format(x)`) or a JSX element
   name (`<Row />`). 10 of 96 at "referenced", 7 at "called" — and the three that drop are the
   reason this condition exists rather than a rounding of the label rate: each named
   `packages/cli/src/output/formatter` because every member body MENTIONS the `OutputMode`
   constant, while that module exports no such wrapper, so the row's promised delete-and-import
   repair had nothing to import. Sharing a project-local constant is the first-party analogue of
   condition 4's `node:path` case. The same condition removes four of five known mislabel shapes
   by construction; see "Phase 4 gate fixes".

**Correction to this section's original text,** which said "roughly ten lines over the import
lists the snapshot already carries". That is wrong twice. `buildCloneIndex` never receives a
snapshot — D7 has it re-parse every file itself — so the imports come from its own parse, not
from a carried list. And three of the four conditions above are what separate a signal from a
92.7% label rate; the one-condition version is not a cheaper implementation of this derivation,
it is a different and refuted one. The shipped module is
`packages/core/src/duplication/imports.ts`.

Ordering: a labelled class carries `priority = rank * PARTIAL_EXTRACTION_PRIORITY_BOOST` while
`rank` stays exactly `tokenCount * members.length`. See "Phase 4 — the ranking decision".

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
  `priority` and record the number dropped in `classesTruncated`.
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
and a nested arrow already collided that way, resolved first-writer-wins in priority-descending order.
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
   **Phase 4 note, re-measured after the gate-fix batch.** This is a REPORTING claim — all 96
   classes remain in `--json` — not a printed-page claim. Both classes' ranks are unchanged
   (`sumCosts` 980, the JSON-response class 704); their by-`priority` POSITIONS moved twice, both
   times as planned movement recorded rather than discovered later. `sumCosts` #6 -> #11 -> **#10**
   and the JSON-response class #11 -> #15 -> **#15** (unchanged by the second move). The second
   move is the predicate tightening in "Phase 4 gate fixes": three classes stopped being labelled,
   so three boosts were withdrawn and everything below them rose. The printed top ten is the CLI's
   presentation cap, not this criterion — and `sumCosts` is back on it at #10.
2. A manual audit of the top 20 classes by rank shall be performed and its verdicts recorded in this
   change's verification notes, targeting ≥90% genuine extractable duplication. If precision falls
   below 90%, exclusions shall be tightened before the detector leaves experimental status. The gate
   is that the audit is performed and recorded; "a human agrees" cannot itself be automated — so the
   audit's rejection criteria are fixed in advance to make the judgment reproducible. A class counts
   as a **false positive** when any of the following holds: extraction would require one distinct
   parameter per member (the members share shape but not behavior); the members are structurally
   forced by a framework or interface contract and could not differ; or the shared body is a
   type-only or re-export construct carrying no logic. Every other class counts as genuine.
3. **(Restated in Phase 4, then tightened in Phase 4's gate-fix batch; the original file-level
   wording was REFUTED by measurement, and so was the first restatement's "references" — see
   "Phase 4 — the measured derivation" and "Phase 4 gate fixes".)** When every member of a clone
   class CALLS INTO one common FIRST-PARTY module from inside its own unit body — the module's
   value binding appearing as a call callee, a method-call receiver or a JSX element name — the
   system shall label the class `partial-extraction` and populate `sharedImport` with that
   module's repo-relative extensionless key. Verified against the `parseFencedJson` case
   (6 members; all 10 craft packages that have a `phases/critique.ts` import
   `shared/craft/fenced-json` and all 10 declare their own wrapper). All five conditions are
   load-bearing: measured over this repository's 96 reported classes, the ladder of candidate
   predicates labels **89 / 88 / 37 / 27 / 10 / 7** (raw specifier strings / resolved module
   identity / plus body-referenced / minus type-only / minus bare specifiers / plus a CALL
   position rather than a mention). The original wording is the first rung: 92.7% of classes,
   including all 38 platform-mirror classes by construction. The sixth rung is what makes the
   label's CLAIM true — "every member CALLS INTO this module" — which is a strictly weaker claim
   than the one four documents originally shipped: at rung five, three classes named a module that
   exported no such helper at all, so the label's promise of a delete-and-import repair was false.
   Rung six drops those three. It does NOT make a delete-and-import promise true, and the label
   must not be read as one: measured over the 7 surviving labels (Scope C, 2026-10-21), the
   duplicated wrapper is among the named module's exports in **0 of 7**. Even `parseFencedJson`
   fails it — `shared/craft/fenced-json` exports `extractFencedJsonPayload`, not the wrapper. That
   the wrapper was never extracted IS the finding; it is not something a reader can import. Every
   operator-facing surface therefore says "calls into" and instructs the reader to open the module
   and confirm what it exports.
4. **(Restated in Phase 5 as rubric-scoped; see "Phase 5 — the measured extractor agreement".)**
   When `code-craft` critiques a unit belonging to a clone class, the prompt for a rubric in
   `SIBLING_AWARE_RUBRIC_IDS` (seeded `CODE-R004`) shall include the sibling members' locations; and
   when the unit belongs to no clone class, or the rubric is outside that set, the rendered prompt
   shall be byte-identical to the pre-change prompt. Rendering for all seven seed rubrics would cost
   7x the tokens for six rubrics with no clause that can use the evidence. The second half had **no
   guard at all** before Phase 5 and is now anchored on literals captured against unmodified `src/`.
5. **(Restated in Phase 5 against measurement; the `kind` half is REFUTED — see "Phase 5 — the
   measured extractor agreement".)** The estree and `typescript` unit extractors shall agree on
   every unit's `startLine` and `endLine` in a shared fixture, within ±2 lines; and the only `kind`
   disagreement shall be the object-literal-property function/arrow case, asserted by name. `kind`
   disagrees for **139 of 7,880** units at Scope D (1.76%), all `code-craft` `method` vs estree
   `function`, so matching on `(file, kind, startLine)` as originally written would silently drop
   1.76% of lookups. The shipped matcher never consults `kind`.
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
    `priority` and record the dropped count in `classesTruncated`. `priority` is `rank` for every
    plain duplicate and `rank * PARTIAL_EXTRACTION_PRIORITY_BOOST` for a `partial-extraction`
    class, so the pre-Phase-4 truncation semantics are unchanged for any project with no labelled
    class. (Reworded in Phase 4; it read "by `rank`" through Phases 1-3, when every class was a
    plain duplicate and the two keys were the same number.)
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

Derive the `partial-extraction` label and `sharedImport` from the modules every member's BODY
references, and order those classes above plain duplicates via a published `CloneClass.priority`.
Verifiable alone: the `parseFencedJson` class (6 members, all 10 craft packages importing
`shared/craft/fenced-json`) is labelled `partial-extraction`; criterion 3.
**Shipped.** Criteria 3 and 13 were restated against the predicate that actually ships; see
"Phase 4 — the measured derivation, the ranking decision, and what moved".

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
- **`duplication-report-grouping` — group the structurally-concentrated classes on the printed
  page.** Named here with its reason rather than deferred a third time to "Phase 4/5": Phase 4
  measurably does not aggravate the 38/96 platform-mirror concentration (0 of 38 mirror classes
  are labelled) and measurably improves it for free (mirror rows on the printed top ten fall 4 ->
  2). Grouping itself is a distinct presentation feature needing a grouping key
  (mirrors-of-each-other? same owning skill?), a presentation form, and a decision on whether a
  group counts as ONE class against `maxClasses` — which would move criterion 13's semantics a
  SECOND time in one release. Phase 5 is `code-craft` prompt wiring, a different subsystem, so it
  is not Phase 5's either.
- **`code-craft` sibling-evidence incidence in the run summary.** Phase 5's index build degrades to
  `undefined` on `Err` and on an empty discovery, and the reason is DROPPED — so a failed index
  build is invisible to an operator, who sees a normal run with no sibling evidence in it. Deferred
  rather than smuggled in because surfacing it changes `CodeCraftOutput`'s shape, the `code_craft`
  MCP response and the printed page, and it traces to no criterion. What stands in for it meanwhile
  is Phase 5's end-to-end assertion over the real
  `collectCodeCraftPrompts(...).pendingPrompts[].userPrompt` string, which makes the wiring
  falsifiable with no schema change; what it does NOT give is operator visibility into a build that
  failed.
- **Knowledge-graph concept nodes for `partial-extraction` and `CloneClass`.** Phase 4 is where
  `partial-extraction` became real, so this was its natural home. Blocked on #1507:
  `manage_adr` / graph enrichment is not worktree-aware, and writing to the main checkout from
  this phase's worktree is worse than not writing.

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
- Grouping or noting repeated structural causes in the output (the 38/96 concentration) — **no
  longer "Phase 4/5"**. Phase 4 measured that its signal does not aggravate the concentration
  (0 of 38 mirror classes labelled) and improves it for free (mirror rows on the printed top ten
  4 -> 2), and recorded the rest as the NAMED deferred follow-up
  `duplication-report-grouping` with its reason. See "Deferred follow-ups (filed, not phases)".
- `loadEntropyGraphOptions` type-awareness so the MCP surface can report duplication on a
  graph-bearing project.
- A vendored-build-cache glob for `DEFAULT_DUPLICATION_CONFIG.ignorePatterns`, generalized
  beyond vitepress.

### Phase 4 — the measured derivation, the ranking decision, and what moved

Every figure below was measured in the worktree `hd-dry-concept` on 2026-10-20. The Scope C
figures come from the SHIPPED build (`pnpm --filter ... run build` for both packages, then
`node packages/cli/dist/bin/harness.js cleanup -t duplication --json`), not from a plan-time
probe.

#### The spec's original file-level D8 reading is refuted

Five candidate predicates, each one condition stricter than the last, over the **96 Scope C
reported classes**:

| #   | predicate                                                                   | labelled / 96 |      % | mirror classes labelled / 38 |
| --- | --------------------------------------------------------------------------- | ------------: | -----: | ---------------------------: |
| A   | raw import-specifier strings intersect (the literal "import lists" reading) |        **89** | 92.7 % |                           38 |
| B   | A, but specifiers resolved to a module identity                             |        **88** | 91.7 % |                           38 |
| C   | B, and the binding is referenced inside every member's unit body            |        **37** | 38.5 % |                            5 |
| D   | C, minus type-only imports                                                  |        **27** | 28.1 % |                            5 |
| E   | D, minus bare specifiers (builtins and installed dependencies)              |        **10** | 10.4 % |                        **0** |
| F   | E, and the binding is CALLED, not merely mentioned — **SHIPPED**            |         **7** |  7.3 % |                        **0** |

Three findings, each load-bearing:

1. **A is not merely noisy, it is WRONG.** The ten craft `phases/critique.ts` files sit at equal
   depth, so `../catalog/rubrics/index.js` and `../findings/schema.js` match as STRINGS across
   them while resolving to different files per package. A reports three common modules for the
   `parseFencedJson` class, two of which are not shared at all. B reports exactly one. Resolution
   is a correctness requirement, not hygiene.
2. **B would make the known presentation problem worse.** All 38 platform-mirror classes (the
   39.6% concentration the Phase-3 record names) are four copies of one file, so their import
   lists are identical by construction and B labels every one. Boosting them would put the mirror
   block at the HEAD of the operator's page. E labels **0 of 38**.
3. **The type-only exclusion is criterion 2's own false-positive clause,** not a convenience, and
   it must be per SPECIFIER rather than per declaration: two classes (`critiqueSurface`,
   `buildSummary`) drop between D and E on a single inline `import { type LlmProvider }`
   specifier. An earlier pass of this phase measured **12 / 96** with filesystem-resolved keys
   and a declaration-level type filter; rung E is FS-free with a per-specifier filter and
   measures **10 / 96**. Those two classes are the entire difference.
4. **Rung E was shipped, reviewed, and refuted — rung F is what ships.** E's "referenced"
   predicate was a token-spelling match, and it made the label's operator-facing PROMISE false
   for 3 of its 10 classes. Rung F requires a call position and lands at 7 / 96, dropping exactly
   those three. Added here as a rung rather than as an erratum because it is the same ladder: each
   rung is one condition stricter, and this one is the condition that makes the label mean what
   four documents say it means. Full account in "Phase 4 gate fixes".

#### The ranking decision

D8 says "rank `partial-extraction` above plain duplication". Three mechanisms, measured over the
96 Scope C classes; positions are by resulting sort order and the printed page is the CLI's top
ten:

| ordering                           | `sumCosts` (rank 980) | JSON-response (704) | `parseFencedJson` (522) | labelled on printed page | mirror rows on printed page |
| ---------------------------------- | --------------------: | ------------------: | ----------------------: | -----------------------: | --------------------------: |
| Phase 3 (by `rank`)                |                    #6 |                 #11 |                     #21 |                   3 / 10 |                  **4 / 10** |
| `priority = rank x 1.5`            |                    #8 |                 #14 |                     #12 |                   4 / 10 |                      3 / 10 |
| `priority = rank x 2`, 10 labelled |                   #11 |                 #15 |                      #9 |                   6 / 10 |                      2 / 10 |
| **x 2, 7 labelled** (SHIPPED)      |               **#10** |             **#15** |                  **#8** |               **5 / 10** |                  **2 / 10** |
| strict tier (all labelled first)   |                   #15 |                 #18 |                      #6 |                  10 / 10 |                      0 / 10 |

The last two rows differ only in the PREDICATE, not the multiplier: the shipped row is the same
`x 2` boost over the 7 classes rung F labels. Three withdrawn boosts move everything below them
up one to three places, and the row that benefits most is `sumCosts` — back onto the printed page
at #10. The mirror concentration is unmoved at 2 / 10, so the free improvement the boost was
chosen for survives the tightening.

**Shipped: a separate `priority` key, `PARTIAL_EXTRACTION_PRIORITY_BOOST = 2`, `rank`
untouched.**

Why a separate key rather than folding the multiplier into `rank`: `rank` is documented as
`tokenCount * members.length`, pinned by `packages/core/tests/duplication/clone-index.test.ts`,
published by the CLI's `--json`, and is the magnitude #1612/#1646 are specified to bind to.
Folding a policy constant into it would make a consumer's "tokens x copies" arithmetic silently
2x wrong for exactly the classes it most wants to act on. Publishing `priority` instead keeps the
ordering policy inspectable: one named exported constant and one published field, so a `--json`
consumer can reproduce the order from the payload. Handing a consumer a reordered list whose
order cannot be derived from the published fields is the same defect one layer out.

Why 2 and not a strict tier: the strict tier fills all ten printed rows with labelled classes and
pushes the largest clone in the repository (4 x 648 tokens) off the page entirely. It replaces one
presentation problem with another. Why 2 and not 1.5: 2 is the smallest round multiplier that
brings criterion 3's named class onto the default printed page (#8 vs #12) and it halves the
mirror rows there (4 -> 2) — a measured, free improvement to the 38/96 concentration without
implementing grouping. At rung E its cost was that `sumCosts` left the printed page (#6 -> #11);
at rung F that cost is gone (#10) and the multiplier's only remaining cost is the three
plain rows it displaces. Nothing ever left `--json` or the 96, so criterion 1's "shall report"
held throughout.

Determinism is unchanged, and the comparator gained a term in the gate-fix batch:
`b.priority - a.priority || SIGNAL_ORDER[a.signal] - SIGNAL_ORDER[b.signal] || a.fingerprint.localeCompare(b.fingerprint) || a.tokenCount - b.tokenCount`.
The boost scales both sides of the collision case the fingerprint tiebreak exists for
(10 tokens x 6 members = 20 x 3), so it does not remove the possibility and that tiebreak stays.
It also CREATES a tie family this section originally missed — a labelled rank r ties a plain
rank 2r — which is why `signal` is now a term of its own; see "Phase 4 gate fixes".

#### Scope C, from the shipped build

Two measurements, both from a rebuilt dist, because the predicate changed mid-phase. Scope C is
`node packages/cli/dist/bin/harness.js cleanup -t duplication --json` over this repository.

```
AT RUNG E (reviewed, refuted)
labelled 10 of 96 = 10.4 %   mirror classes labelled 0 of 38
parseFencedJson #9   sumCosts #11   JSON-response #15
labelled on printed page 6 / 10   mirror rows 2 / 10

AT RUNG F (SHIPPED)
filesScanned 2145, classesReported 96, members 382, classesSuppressed 162,
classesTruncated 0, filesSkipped 0, exit 0, 15.4 s wall clock
labelled 7 of 96 = 7.3 %   mirror classes labelled 0 of 38
13 priority ties, 0 of them mixed-signal (rung E: 12 ties, 1 mixed)

parseFencedJson   6 members / 87 tokens / rank 522 / priority 1044 / position #8
                  sharedImport 'packages/cli/src/shared/craft/fenced-json'
sumCosts          10 members / 98 tokens / rank 980 / priority 980 / position #10
JSON-response     rank 704 / position #15   (16x44 sendJSON)
largest by rank   4 x 648 runGates / rank 2592 / position #2
labelled on printed page 5 / 10   mirror rows 2 / 10
```

Every counter outside the label set is IDENTICAL between the two: 2145 scanned, 96 classes, 382
members, 162 suppressed, 0 truncated, 0 skipped, and the same 38 mirror classes holding the same
152 members. The tightening changed which classes are labelled and therefore where they sort; it
changed nothing about what is detected.

`filesScanned` is **2145**, not the 2144 recorded for Phase 3. The delta is exactly the one
source file this phase adds, `packages/core/src/duplication/imports.ts`; the new fixture project
lives under `packages/cli/tests/fixtures/`, which
`DEFAULT_DUPLICATION_CONFIG.ignorePatterns` excludes. Every other counter is unchanged, and so
is every predicted position.

The seven labelled classes, by position, with the three rung E labelled and rung F does not:

| pos | rank | shape   | unit                     | sharedImport                                     | rung   |
| --: | ---: | ------- | ------------------------ | ------------------------------------------------ | ------ |
|  #1 | 1320 | 3 x 440 | `collectApiCraftPrompts` | `packages/cli/src/mcp/utils/sanitize-path`       | F      |
|  #3 |  916 | 4 x 229 | `runAction`              | `packages/cli/src/output/formatter`              | F      |
|  #5 |  630 | 3 x 210 | `parseFindingFromRaw`    | `packages/cli/src/shared/craft/findings/derived` | F      |
|  #7 |  525 | 5 x 105 | `<anon>`                 | `packages/core/src/review/constants`             | F      |
|  #8 |  522 | 6 x 87  | **`parseFencedJson`**    | **`packages/cli/src/shared/craft/fenced-json`**  | F      |
| #13 |  417 | 3 x 139 | `detectTsIgnore`         | `packages/core/src/review/constants`             | F      |
| #23 |  265 | 5 x 53  | `getRules`               | `packages/core/src/architecture/collectors/hash` | F      |
|   — |  846 | 3 x 282 | `printResult`            | ~~`packages/cli/src/output/formatter`~~          | E only |
|   — |  216 | 4 x 54  | `resolveOutputMode`      | ~~`packages/cli/src/output/formatter`~~          | E only |
|   — |  147 | 3 x 49  | `resolveOutputMode`      | ~~`packages/cli/src/output/formatter`~~          | E only |

The three dropped classes now report as plain duplicates at #12 (`printResult`, priority 846),
#62 (`resolveOutputMode` 4 x 54, priority 216) and #82 (`resolveOutputMode` 3 x 49, priority 147),
and are unchanged in every other field. They fall further than the label count alone suggests
because losing the label means losing the doubling: each now sorts on `rank` against 95 classes
that always did.

All seven were re-verified by grep against the claim the label makes — "the named module exports
a helper these bodies call" — and all seven hold: `sanitizePath`, `OutputFormatter` (via
`new OutputFormatter(mode)`), `derivePriority`, `makeFindingId` (twice), the fenced-JSON
extractor, and `constraintRuleId`. Note that two of them name a module called `constants`, which
is exactly the shape rung F was added to reject — and they survive because `review/constants`
also exports the FUNCTION `makeFindingId`, which both bodies call. The predicate is about the
call, not about the module's name. Two classes have more than one common module, which is why
`sharedImport` picks the lexicographically smallest key by a stated rule rather than by discovery
order.

#### Criterion 6 re-measured (truth 10)

`collectFileImports` adds one pass over every token of every scanned file, so the 10-second bar
was re-measured rather than assumed. Scope B (criterion 6's own scope: this repository's non-test
sources, 2,403 files discovered / 2,155 scanned / 9,732 units), three runs of `detectDuplication`
alone, median reported:

```
with    collectFileImports:  3.16 / 2.60 / 2.49 s   median 2.60 s
without collectFileImports:  2.74 / 2.52 / 2.78 s   median 2.74 s   (stubbed to an empty map)
```

The instrumented median is LOWER than the stubbed one, so the extra pass costs less than this
machine's run-to-run variance (load average 16-18 during both triples; a single triple swings
0.3-0.7 s). Phase 2 recorded 2.4-3.0 s at this scope and the figure is unmoved. Criterion 6 holds
with roughly 3.8x headroom. The wall clock remains load-sensitive evidence, not a gate — the
reason named in "Phase 2 — ACCEPTED GAP" still stands, and no fallback (lazy `positions`
construction) was needed.

#### Carried-forward items, judged

1. **Grouping the 38/96 concentration** — deferred out of BOTH Phase 4 and Phase 5, as the NAMED
   follow-up `duplication-report-grouping` carrying its reason. See "Deferred follow-ups".
2. **`filesSkipped` unobservable in MCP summary mode** — CLOSED here as a declared ride-along
   (one key in `summarizeDuplication`, one assertion, one mutant). Summary mode was the one
   duplication surface with no skip counter, so a partial scan read as a complete one.
3. **ADR 0111 `skipUnlessBin` only partly adopted** (`comprehend-smoke.e2e.test.ts`'s local
   `HAS_BIN`) — NOT this phase's business: different subsystem, no interaction with the
   duplication surfaces, already filed by the Phase-3 executor. Agreed with that judgment.
4. **Knowledge-graph concept nodes** — still deferred, now WITH the blocking reason (#1507) in
   "Deferred follow-ups" rather than as an unowned line.

#### Mutation coverage, and a sixth vacuous test caught

Every mutant this phase named was planted, observed, and reverted. Three results worth recording:

- **The comparator's `fingerprint` tiebreak was untested across the whole feature.** Deleting
  `a.fingerprint.localeCompare(b.fingerprint)` passed all 506 duplication and entropy tests. The
  existing "sorts classes deterministically" case builds three identical files, which make ONE
  class, so no tiebreak is reachable from it. Closed with a fixture of two structurally distinct
  bodies measured to the same 82 normalized tokens, three copies each, which ties both classes at
  rank and priority 246. This is the sixth vacuous test this feature has produced and the pattern
  is consistent: the fixture could not reach the branch the test was named for.

  **Never claim a tiebreak is covered without asserting the tie exists.** That rule generalizes
  well past this feature: a comparator's second key decides nothing unless its first key ties, so
  a test over a fixture that cannot produce a tie is asserting nothing about the tiebreak,
  however carefully it is titled.

- **The final `tokenCount` tiebreak is reachable only by INJECTING a digest collision, and is
  closable with a mocked-digest fixture.** This entry originally read "unreachable by
  construction … recorded as a known-unkillable mutant rather than as coverage". Production-
  unreachable was right; UNTESTABLE was wrong, and the correction was found by the next reviewer
  in ~40 lines: `collision.test.ts` already mocks `fingerprintStream` to a constant, so the tie
  is constructible — two structurally distinct bodies at 60 and 80 normalized tokens, four and
  three copies, giving 60 x 4 === 80 x 3 === 240. Priority ties, both are plain so `signal` ties,
  the mock ties `fingerprint`, and reversing the last key fails with `[80, 60]` against
  `[60, 80]`. Shipped as coverage in the gate-fix batch.

  Note the irony for whoever reads this next. A tiebreak was recorded as uncoverable in the SAME
  release whose headline lesson is "never claim a tiebreak is covered without asserting the tie
  exists" — the inverse error with the identical root cause: in neither case was the question
  "can the tie be MADE?" asked. The first error accepted a fixture that could not produce a tie;
  the second accepted an argument that no fixture could. The discipline that catches both is the
  same one: construct the tie, assert it is real, then assert the tiebreak.

- **One named mutant was mis-specified in the plan, and that classification STANDS:** turning
  `usedImportKeys`' `offset > end` early `return false` into a `continue` is an EQUIVALENT mutant.
  Positions ascend, so once one offset exceeds `end` every later one does, each then
  `> end >= start`, which makes the `>= start` return unreachable and leaves the loop able only to
  fall through. No test can kill it; it is a performance change only. Independently confirmed in
  review. The behaviour-changing form, deleting the guard, is killed by the intended case.

#### Two defects in this phase's own plan, corrected in flight

- `sharedImportKey`'s "lexicographically smallest" guarantee held only for pre-sorted input:
  `[['z','a'],['a','z']]` answered `'z'` while the same two members in the other order answered
  `'a'` — the order-dependence the function exists to remove, on an exported API. Fixed by
  sorting the first member's keys inside the function.
- `collectFileImports` as planned measured cyclomaticComplexity **17** against a bar of 15 and
  blocked its own commit. Split over `valueImportOf` and `bindingPositions`. Two further
  threshold breaches appeared the same way and were refactored, never allowanced:
  `summarizeDuplication` (complexity 12 vs the hook's 10) and the `duplicationReport` test factory
  (54 lines vs 50).

### Phase 4 gate fixes

A combined gate pass over Phase 4 returned Request Changes — 0 critical, 6 important, 7
suggestions — from 24 planted mutants, 11 killed on the named set and 3 survivors (1 provably
equivalent, 2 real gaps). What follows is what changed, what was re-measured, and the three
places a reviewed claim did not survive contact.

#### I1 — the label's operator-facing promise was FALSE for 3 of 10 classes

`AGENTS.md`, the refactoring SKILL, the changeset and criterion 3 all promised that a labelled
row means the shared helper already exists, so the repair is delete-and-import rather than
design. `imports.ts` matched identifier TOKENS by spelling — `program.tokens` filtered to
Identifier/JSXIdentifier whose text equalled an import local — with no role and no scope
analysis. Measured against the shipped build, `printResult` (#4) and two `resolveOutputMode`
classes (#32, #50) carried `sharedImport: packages/cli/src/output/formatter` because every member
body MENTIONS the `OutputMode` constant. That module exports exactly `OutputMode`,
`OutputModeType`, `OutputFormatter`, `ConventionalMarkdownEntry` and `parseConventionalMarkdown`
— and no `resolveOutputMode`. The duplicated unit at `check-arch.ts:718` is a four-line
flag-to-enum mapper. Delete-and-import was not merely expensive, it was impossible: there was
nothing to import.

The predicate now requires the binding to be EXERCISED in the member body, in one of three AST
positions — a call callee (`extract(x)`, `new Formatter(m)`), a method-call receiver
(`fmt.format(x)`, the leftmost identifier of a callee's member chain), or a JSX element name
(`<Row />`, `<Ui.Row />`). Rung F of the ladder; 10 -> 7 labels, dropping exactly those three.
`runAction` keeps its label because it calls `new OutputFormatter(outputMode)`, which is the
distinction the whole condition rests on.

The claim was corrected in the four places this pass looked at, and not by softening one word. A
labelled row now says the members CALL into the named module and instructs the reader to open it
and confirm the export before planning the repair — because the tag means "they share a called
module", not "the exact wrapper already lives there". Where it does not, the repair is "extract
into that module", which is still cheaper than greenfield but is not a delete.

**That correction was incomplete, and the FINAL_REVIEW pass found out how.** The same false claim
was still live in six further places — `core/src/duplication/index.ts` twice (both shipping in
`dist/index.d.ts`), `cli/src/mcp/tools/entropy.ts` twice, `cli/src/commands/cleanup.ts`, and the
changeset itself, which would have shipped it in the release notes — plus a surviving "usually
delete-and-import" in the refactoring SKILL. All are now rewritten to the hedged form. Two
lessons, both now mechanised:

1. **It is worse than this pass measured: the delete-and-import promise is false for 7 of 7
   labelled classes, not 3 of 10.** Rung F dropped the three classes whose named module exported
   nothing matching, but in every one of the 7 survivors the duplicated wrapper is likewise absent
   from the named module's exports (Scope C, 2026-10-21). Rung F made the "calls into" claim true;
   it never made a delete-and-import claim true, and this pass over-read its own fix.
2. **Pinning a correction's PRESENCE is not pinning the false claim's ABSENCE.** The repo's only
   absence-assertion was `cli/tests/code-craft/sibling-evidence.test.ts`, scoped to one rendered
   prompt string — which is exactly why six sites survived a pass that recorded them fixed.
   Presence-assertions failed to catch this four times. `cli/tests/duplication-claim-guard.test.ts`
   now asserts the ABSENCE of both phrasings across `packages/*/src` and `.changeset/`, so the
   next writer who reaches for "the shared helper already exists" fails a test instead of shipping
   it. This is the general form of Phase 5's N2 lesson.

#### I2 — `referencedIn` was a token-spelling match; four of five shapes close by construction

Five mislabel shapes were reproduced against the shipped build, each a three-member Type-2 class
whose import is referenced only OUTSIDE the cloned body: a member property (`item.extract()`), a
shadowing parameter, an object-literal key (`{ extract: item }`), a value import used only as a
TYPE, and a method named like the import — the last labelled TWICE, class unit and method unit,
because a non-computed method's own name token starts exactly at its unit's start offset.

Rung F removes four of them by construction rather than by a second filter: a member property is
not a receiver, a key is in no callee position, and a type annotation holds no call. The fifth,
shadowing, is the one thing this module refuses to guess — deciding it correctly is scope
analysis, and `@typescript-eslint/scope-manager` is not a dependency of `@harness-engineering/core`
(adding one to a published package's runtime deps is a larger decision than this predicate). So
it is closed CONSERVATIVELY: a name also introduced as a binding anywhere in the file — parameter,
destructured parameter, variable declarator, function or class id, `catch` parameter — is dropped
from `byKey` with its key. The residual is therefore a false NEGATIVE, never a false positive,
and the cost is measured rather than hoped: **0 of the 7** labels over Scope C.

**Mutant M9 (`>= start` -> `> start`) now dies**, and the honest account of how matters. It
survived 509 tests because the method-name token was its only witness, and rung F removed that
witness — from `fingerprintFile`'s own path the `offset === start` case is now UNREACHABLE, which
would have made M9 an equivalent mutant had it been left there. It is killed instead on the
EXPORTED contract: `usedImportKeys` is a published API (criterion 11) taking a caller-supplied
`FileImports` and range, so both ends of `[start, end]` are pinned directly with hand-built
positions. That is a contract test, not a reachability dodge, and the comment says which it is.

#### I3 — the seventh vacuous test, guarding the Phase 5 seam

`index.ts` claims, at the `byMember` construction, that "a labelled class therefore wins such a
key over a larger plain duplicate". That sentence is the seam Phase 5's `code-craft` wiring binds
to, and nothing checked it. The case named for it drove a fixture whose two classes live in
DISJOINT files, so no `${file}:${startLine}` key was ever ambiguous and first-writer-wins never
fired. Verified rather than asserted: reversing the ownership iteration left that file 12/12
green. Phase 1's real-collision case pins RANK precedence only — both its classes are plain.

The replacement builds a genuine contest. Three one-line outer functions call the shared helper
OUTSIDE their inline arrow, so outer and arrow share the key `src/oN.ts:2` while only the outer is
labelled; the same arrow appears standalone in three further files, which makes the PLAIN class
the larger one (6 x 63, rank 378) against the labelled one (3 x 94, rank 282). Nine members
collapse onto six keys, the labelled class owns all three contested keys, and the plain class
still owns the three nobody contests. The reversal mutant now dies.

#### I5 — the boost created a tie family the decision did not cover

A labelled class of rank r ties a plain class of rank 2r, and at that tie D8's ordering sentence
was being decided by `fingerprint.localeCompare` — by sha1 hex. It was LIVE at rung E: three
plain classes at rank 432 (`computeDiff`, `extractJson`, `pickHotspots`) and one labelled class
at rank 216 (`resolveOutputMode`) all at priority 432, with the labelled one sorting last of the
four. `signal` is now a comparator term ahead of `fingerprint`.

**And the honest part: at rung F no such tie is live on this repository.** 13 priority ties, 0 of
them mixed-signal, because the tightening dropped the only labelled class that was in one. The
term is load-bearing for the next project that produces a tie, not for this page — which is
stated plainly rather than left for a reader to discover that the measured instance is gone. The
test constructs the tie instead of hoping for one, and is built so it cannot be vacuous: the
plain body's statement mix is chosen to land on exactly 93 normalized tokens so 62 x 3 x 2 ===
93 x 4 is a real tie, AND to digest BELOW the wrapper's, so the fingerprint tiebreak left to
itself would put the plain class first. Both facts are asserted.

#### I6 — the JSX arm had zero coverage in a detector that parses JSX

`index.ts` enables `jsx: true` for `.tsx`, `.jsx`, `.js`, `.mjs` and `.cjs`, and a component
referenced only as `<Row />` appears in no other position — yet no duplication fixture anywhere
in this feature used `.tsx` or `.jsx`, and dropping the JSX arm survived 509 tests. Closed with
three `.tsx` wrappers at three import depths whose ONLY reference to the shared import is a JSX
element, plus a companion case that feeds the same sources named `.ts` and asserts all three are
skipped `unparseable` — the other half of why `isJsxCapable` is load-bearing. Dropping the arm
now fails both the unit case and the end-to-end one.

**A finding that came out of building that fixture, recorded because it affects what this feature
claims about `.tsx`:** inside a JSX expression container, typescript-estree tokenizes a DOTTED
expression's parts as `JSXIdentifier`. `total={out.length}` yields `JSXIdentifier "out"` and
`JSXIdentifier "length"`, while `data={out}` and `flag={out[0]}` yield plain `Identifier "out"`.
`tokens.ts` keeps `JSXIdentifier` verbatim on the argument that a TAG name is structural, so a
VARIABLE rename inside a dotted JSX attribute defeats Type-2 clustering: the three fixture panels
differed only in identifier names and produced three fingerprints until the dotted form was
lifted into a local. `tokens.ts` documents the attribute-NAME cost of that decision and not this
one; this is strictly wider than what is written there.

#### Suggestions, and two premises that did not survive re-measurement

- **S1 (rationale, corrected and RE-MEASURED).** `moduleKey`'s FS-free rationale claimed the keys
  "are only ever COMPARED, so proving the file exists buys nothing". Wrong in the general case:
  extension stripping is not module resolution, so `'./sub'` keys as `src/a/sub` while
  `'./sub/index.js'` keys as `src/a/sub/index`. The reviewer's figures (2,299 files / 5,860
  specifiers / 1,829 targets / **6** split targets) did NOT reproduce at either scope measured
  here. At the scope the detector runs — tracked TS/JS sources minus `node_modules`, `dist`,
  `build`, `coverage`, `.turbo`, tests, fixtures, `.d.ts` and the vitepress cache: 2,174 files,
  4,344 relative specifiers, 1,635 distinct resolved targets — exactly **1** target is reached
  under two keys (`packages/cli/src/docs-publish/index.ts`). Over every tracked non-build source
  (4,324 files, 8,194 specifiers, 2,001 targets) it is **35**, every one the same
  directory-versus-`index` shape. Cost in labels: **zero at both scopes**. The scope difference is
  the whole discrepancy, which is why the comment now names both scopes and both denominators.
- **S2 (four test titles).** Four cases claimed priority semantics their fixtures cannot prove —
  every class behind them is a plain duplicate where `priority === rank`. Retitled to what they
  prove (size precedence; determinism of the reported set under input reordering), each with the
  reason inline and a pointer to `partial-extraction.test.ts`.
- **S3 (actionable rows and a labelled COUNT).** Every printed row and every `topClasses` line now
  reads `unit (file:line, +N more sites)` — the row names one site and the job is collapsing all
  N. Both surfaces publish a labelled count: `N labelled partial-extraction` on the CLI advisory
  line, `labelledClasses` on `advisory.duplication`.
- **S4 (a line the cap cannot push off) — PREMISE REFUTED, suggestion kept.** S4 observed that
  `sumCosts`, the most-duplicated unit in the repository, had left the printed page. At rung F it
  is back, at #10. The `largest by rank` footer ships anyway, emitted only when the printed rows
  do NOT already carry the biggest class, because its value does not depend on this repository's
  current numbers: a project with eleven labelled classes loses its largest row, which is the
  fixture the test builds.
- **S5 (stale sibling changeset).** `duplication-cli-mcp-surface.md` still said classes are
  "ranked `tokenCount x members`". Both entries ship in one release, so it now states the
  `priority` ordering its sibling defines and says that it does.
- **S6 (an impossible second condition).** `signalSuffix` and `topClassLine` both required
  `signal === 'partial-extraction'` AND `sharedImport !== undefined`; the first implies the second
  in the core, so the conjunct could never fire — and had the invariant broken, a labelled class
  would have printed UNTAGGED, which is the one outcome that leaves the published order
  unexplained. Keyed on `signal` alone; a missing key prints
  `-> (no shared module recorded)`, loudly.
- **S7 (producers, not consumers).** `priority` on `CloneClass` and `importKeys` on
  `FingerprintedUnit` are REQUIRED fields on published types (both present in
  `packages/core/dist/index.d.ts`). Readers gain fields; any external code that CONSTRUCTS either
  type — a test double, a fixture factory, a mock analyzer — stops typechecking until it supplies
  them. Named in the changeset as the release's whole breaking surface for core.

#### A gate finding this batch introduced, and did not hide

`harness check-arch` under `HARNESS_ARCH_BASE_REF=c83ec3620` goes from **12 findings to 13**. The
thirteenth is `Regression in module-size: 272433 -> 275454 (+3021)`. It is an AGGREGATE regression,
not a threshold violation — no module exceeds `maxLoc` or `maxFiles`, and the twelve pre-existing
complexity findings are byte-identical, with none in a Phase-4 file.

The arithmetic, since a bare "a gate moved" is not actionable: `module-size` counts every
non-blank line, comments included, of every non-test `.ts`/`.tsx` in the repository.
`regressionTolerance` is 0.01, so the allowance over the 272,433-line baseline is
272,433 + floor(2,724.33) = **275,157**. At `eaca39ba0` — this branch's HEAD before the batch —
the aggregate was 275,143: Phases 1 through 4 had already consumed 2,710 of the 2,724-line
allowance, leaving **14 lines of headroom** for anything further. This batch adds 311 lines of
non-test source, which puts the aggregate 297 over the allowance. Rung F's role filter is a
~100-line AST walk where rung E was a ~15-line token scan, so the batch cannot be implemented
inside 14 lines however terse its prose; its own comments were trimmed by 23 non-blank lines
before the figure above was taken.

Three ways out, and why this one: `--update-baseline` was out of scope for this batch;
offsetting by deleting earned documentation elsewhere to satisfy a line-count aggregate is the
wrong incentive and was not done silently or at all; so the finding is reported with its
attribution. It is a baseline-FRESHNESS artifact of a 100-commit feature branch measured against
a baseline captured on `main`, and the standing refresh chore on `main` is where it clears. The
pre-commit arch hook treats it as a warning and reports exactly the three pre-existing NEW
complexity lines, so no hook was bypassed and no threshold was allowanced.

### Phase 5 — the measured extractor agreement, and two criteria restated

Phase 5 gives CODE-R004 the cross-file evidence its own text demands. The rubric names the Rule of
Three verbatim — "the same five lines copied in three places crying out for one named home" — while
`CritiqueInput` carried ONE unit's source span and no cross-file channel. Asking a model whether
five lines appear in three places while showing it one place is not a hard judgment call; it is an
impossible one.

#### Scope D is a FOURTH scope

Every Phase 5 figure below is over **Scope D**: the corpus `code-craft`'s own
`discoverSourceFiles(projectRoot)` walks — `packages/*/src`, minus
`tests`/`test`/`__tests__`/`fixtures`/`dist`/`coverage`/`__mocks__`/`__snapshots__` and
`*.{test,spec}.*` — which is **2,066 files**. It is not Scope A (`packages/`, 2,065 files via
`findFiles` + `isEligibleFile`), not Scope B (repo non-test sources, 2,153), and not Scope C (the
product scope, 96 classes). **Figures do not transfer between scopes.** Scope D is deliberately
`code-craft`'s own discovery function rather than core's `findFiles` + `isEligibleFile`, so every
unit `code-craft` critiques is provably inside the indexed corpus and a miss always means "no clone
class" and never "different scope".

The denominator for every incidence figure is **7,880 `code-craft` substantive units** over those
2,066 files.

| Figure                                                    | Value                            | Denominator / scope             |
| --------------------------------------------------------- | -------------------------------- | ------------------------------- |
| `buildCloneIndex` wall clock at Scope D                   | 2,894 / 2,386 / 2,142 / 2,075 ms | 2,066 files, idle, Node 24.15.0 |
| Classes reported at Scope D                               | 58                               | 2,066 files                     |
| `byMember.size`                                           | 230                              | = the 230 members of 58 classes |
| Units fingerprinted                                       | 8,221                            | 2,066 files                     |
| `partial-extraction` classes at Scope D                   | 7                                | 58 classes                      |
| Units whose `${file}:${line}` key hits `byMember` exactly | **153** (1.94%)                  | 7,880 units                     |
| Units that hit **only** via the ±2 start tolerance        | **2** — and **both are FALSE**   | 7,880 units                     |
| Units whose owning class is `partial-extraction`          | **16**                           | 7,880 units                     |
| Extractor `startLine` agreement (`typescript` vs estree)  | **7,880 / 7,880 exact**          | 7,880 units; 0 needed tolerance |
| Extractor `endLine` agreement                             | **7,880 / 7,880 exact**          | 7,880 units                     |
| Extractor **`kind`** agreement                            | **7,741 / 7,880 (98.24%)**       | 139 disagree — see below        |

Every figure in this table was measured twice by two separate probes and reproduced.

#### The spec's named line-divergence risk: HALF REFUTED, and half CONFIRMED

> **This subsection was rewritten after Task 8.** Its first version said decorators agree in both
> directions. The agreement fixture disproved that within the hour, and the correction is recorded
> here rather than the original quietly edited away.

"Named risk: extractor line-number agreement" predicts the divergence is in LINE numbers and names
**decorators and leading comments** as the likely points.

**Leading comments: refuted.** JSDoc and `//` comments agree exactly, because `typescript`'s
`node.getStart(sf)` skips trivia and estree's `loc.start` never included it.

**Decorators: CONFIRMED for a class, refuted for a method.** On a 13-unit fixture holding both:

| Construct                | `code-craft` (`typescript`) | core (estree)        | Agree? |
| ------------------------ | --------------------------- | -------------------- | ------ |
| `@Dec() export class C`  | line 3 (the `@Dec()` line)  | line 4 (the `class`) | **NO** |
| `@Dec() run() {}` method | line 5 (its `@Dec()` line)  | line 5               | yes    |

`ClassDeclaration.getStart(sf)` returns the `@` position (verified: `pos=57`, `getStart=59`, both on
the decorator's line), while `typescript-estree` keeps class decorators OUT of
`ClassDeclaration.loc.start` — `decorators[0].loc.start.line` is 3 and the node's own
`loc.start.line` is 4. For a `MethodDefinition` estree DOES include the decorator. **The asymmetry
is inside estree, between node types — not a uniform difference between the two libraries.**
`endLine` agrees exactly in both cases.

**So why did 7,880 / 7,880 hold at Scope D?** Because **this repository contains zero TS/TSX
decorators.** The only `^@` match under the packages source roots is a CSS `@import`. The repo-scale
scan is a real measurement and it is **vacuous with respect to the construct the named risk is
about**: it could not have found this, and it did not. Clearing a named risk requires a corpus that
contains the named construct — a hand-built fixture found in one run what 2,066 files could not.

Criterion 5's restated claim (agreement within ±2) **holds**: the divergence is exactly 1 line.
What does NOT hold is the stronger "13/13 exact" the plan predicted; measured exact agreement is
**12 of 13**, and the thirteenth is the decorated class.

**The measurement has a precondition worth naming, because getting it wrong moves the figure.** The
agreement above holds only when each file is parsed with core's own per-extension rule —
`jsx: true` for every supported extension EXCEPT `.ts` (`JSX_CAPABLE_EXTENSIONS`). A first probe
that passed `jsx: true` uniformly made
`packages/dashboard/src/client/hooks/useLocalModelsPanel.ts` unparseable (`TSError: Unexpected
token. Did you mean '{">"}' or '&gt;'?`), dropping its one `code-craft` unit from the pairing and
reporting 7,879 / 7,880. That 7,879 was the probe's defect, not a divergence: core's
`fingerprintFile` parses that file with `jsx: false` and skips nothing (`stats.filesSkipped: 0`).
An agreement claim between two parsers is only as good as the parser options it was taken under.

#### The real divergence is `kind`, and the spec's match key would have been broken by it

**139 of 7,880 (1.76%)** `code-craft` units carry a `kind` estree disagrees with — all one shape and
all one direction: `code-craft` reports `method`, estree reports `function`, for an object-literal
property whose value is a function or arrow (`{ propArrow: (a) => {…} }`,
`{ propFn: function (a) {…} }`). `code-craft`'s `asFunctionLike` promotes a
`ts.isPropertyAssignment` parent to `'method'` (`extract/units.ts`); core's `UNIT_KINDS` maps
`ArrowFunctionExpression` and `FunctionExpression` to `'function'` unconditionally.

**Matching on `(file, kind, startLine)` as criterion 5 and the Technical Design both mandate would
therefore have silently dropped 1.76% of lookups.** The shipped matcher ignores `kind`.

#### Criterion 5, restated

> While both extractors run over one shared fixture, they shall agree on every unit's `startLine`
> and `endLine` within ±2 lines; and the only `kind` disagreement shall be the
> object-literal-property function/arrow case, asserted by name.

`tests/code-craft/extractor-agreement.test.ts` asserts, over a 13-unit fixture: 13/13 within ±2 on
`startLine`, 13/13 EXACT on `endLine`, **12/13 exact on `startLine`** with the one exception pinned
by name and literal line (the decorated class, `typescript` 3 vs estree 4), and the kind divergence
set pinned to exactly `propArrow` / `propFn`. A change to either extractor's mapping — or a parser
upgrade that shifts a line — goes red instead of silently widening the gap. The test asserts
`units.length === 13` from BOTH extractors up front: without that guard the agreement could hold
vacuously over a shrinking fixture, and that guard is itself verified by deleting the decorated
method from the fixture and observing it fail by number.

#### Criterion 4, restated

> When `code-craft` critiques a unit that belongs to a clone class, the prompt for a rubric in
> `SIBLING_AWARE_RUBRIC_IDS` shall list the sibling members' `file:line` locations; and for a unit
> that belongs to no clone class, or for a rubric outside that set, the rendered prompt shall be
> byte-identical to the pre-change prompt.

`SIBLING_AWARE_RUBRIC_IDS` is seeded `{'CODE-R004'}`. `code-craft` sends one prompt per
(unit, rubric) pair and 7 seed rubrics apply to a function, so rendering the evidence for all 7
costs 7x the tokens for six rubrics with no clause that can use it. The literal reading of the
original criterion ("the rendered prompt") appears in the "Repairing CODE-R004" section and reads
naturally as CODE-R004's prompt; it is restated rather than left to a reviewer. Widening the set to
`simplest-it-could-be` or the naming rubrics is one line plus a test, and is a decision someone
should make deliberately rather than inherit.

**Criterion 4's second half had no guard at all before this phase** — no test in
`packages/cli/tests/code-craft/` called `buildPrompt`, so "byte-identical to the pre-change prompt"
was unfalsifiable. `tests/code-craft/critique-prompt.test.ts` freezes the pre-change prompt for one
sibling-aware and one non-sibling-aware rubric as literal anchors, captured against unmodified
`src/` BEFORE `critique.ts` was touched. Editing an anchor to make a test pass defeats the criterion
it exists for.

#### The ±2 tolerance: an honest account

The spec mandates a "±2-line tolerance" on the start line. Measured at Scope D it contributes
**0 of the 153 true hits**, and the **2** candidates it does produce are **both wrong**:

- `packages/cli/src/brand/index.ts:167` — a one-line arrow (`endLine` 167) matched `collectFiles` at
  line 165 (`endLine` 172, 88 tokens).
- `packages/cli/src/naming-craft/index.ts:392` — the same shape against `collectFiles` at line 390
  (`endLine` 397).

Both are different units entirely.

**But the tolerance is NOT inert, and Task 8 is what showed it.** A decorated class diverges by
exactly 1 line (above), so an exact-only matcher misses a decorated class OUTRIGHT. The agreement
test asserts both halves of that: `byMember.get('fixture.ts:3')` is `undefined` while
`resolveSiblingEvidence` resolves the unit anyway, via the ±1 probe plus the `endLine` co-check. The
"0 true positives at Scope D" figure is true and it is a statement about THIS corpus, which has no
decorators — not about the tolerance's value. Any adopter using Angular, NestJS, TypeORM or MobX
decorators relies on it from the first run.

The tolerance is implemented only **behind a mandatory span co-check**: a candidate is accepted only when the owning class holds a member at
that key whose `endLine` is within ±2 of the unit's `endLine`. The co-check costs **0 of 153** true
hits (`endLine` agrees 7,880/7,880) and rejects **2 of 2** false ones. Both real cases are the
fixture basis for the matcher's rejection test — reproduced, not invented. The agreement test is the
alarm that would tell a future maintainer the tolerance has started earning its keep.

#### One more Phase 5 figure that did NOT reproduce

The planning record claimed "keys where ≥2 estree units share one `${file}:${line}`: **2**, both
`function|function`". That does not reproduce at Scope D under either reading:

- Over **all** estree units: **84** such keys (83 pairs plus one triple), and every one of them is
  `function|function` — so the SHAPE claim holds and the count is off by ~40x.
- Over the units that actually reach a clone class: **0**. `byMember.size` is 230 and the 58 classes
  hold 230 members total, so `byMember`'s first-writer-wins ownership discards nothing at this
  scope.

This matters for how truth 8 is justified, not for what the code does: the key's lossiness is real
by construction (`${file}:${startLine}` cannot separate a one-line arrow from its enclosing
function), the span co-check is what handles it, and `siblings` excludes EVERY member at the matched
key rather than only the queried unit — two units at one location are ONE location to a reader
following a `file:line` pointer. But the justifying count was wrong and is corrected here rather
than repeated.

#### Design decisions, with their rejected alternatives

**D-P5-1 — `code-craft` builds its own index, once per run, over the FULL project.**
`buildCodeCraftCloneIndex(projectRoot)` calls `discoverSourceFiles(projectRoot)` uncapped —
deliberately ignoring `input.files`, `input.packages` and `input.maxFiles` — and hands the result to
`buildCloneIndex(files, { rootDir: projectRoot })`. Siblings live in OTHER files by definition and
`DEFAULT_MAX_FILES` is 100, so an index over the critiqued set alone could never form a 3-member
class for a targeted `--files one.ts` run, which is the most common invocation: the feature would
have shipped dead. Default ON — 2.1-2.9 s against a run that makes up to 100 LLM calls — with
`CodeCraftInput.siblings: false` as a programmatic opt-out.

_Rejected: inject-only_ (`CodeCraftInput.cloneIndex`, nobody wires it). That is the
"zero callers = not wired" shape this repository has shipped before; the field would exist and the
rubric would still be blind. _Rejected: read a persisted artifact_ from a prior
`harness cleanup -t duplication` run — no such artifact exists, and inventing one is a new surface,
a new staleness question, and traces to no criterion.

**The honest cost of the failure path.** On `Err` — or on an empty discovery —
`buildCodeCraftCloneIndex` returns `undefined` and **the reason is dropped**: `CodeCraftSummary` has
no channel for it and the spec requires the critique to degrade to current behaviour rather than
fail. So a failed index build is invisible to an operator. What makes the wiring falsifiable instead
is an end-to-end assertion on the REAL rendered prompt:
`collectCodeCraftPrompts(...).pendingPrompts[].userPrompt` carries the sibling block for a planted
3-copy fixture, with no schema change at all.

**D-P5-2 — match on `(file, startLine)` with a span co-check; never on `kind`.** Exact key first,
then ±1, ±2, each candidate gated by `|member.endLine - unit.endLine| <= 2`. A
`relative(root, file).replaceAll('\\', '/')` normalisation mirrors core's `relativePosix`, which is
not barrel-exported — approximating it with `path.posix.relative` would not convert separators and
would be a 100% miss rate on Windows rather than a subtle one.

**D-P5-3 — the prompt carries locations, the token count, and Phase 4's signal.** The minimum per
criterion 4 is the locations; `tokenCount`, `signal` and `sharedImport` come off the same
`CloneClass` at zero extra cost and change the ADVICE the rubric can give. The `partial-extraction`
wording holds Phase 4's gate-fix correction (I1) verbatim in spirit: the copies share a **CALLED**
module, NOT "the wrapper already lives there". That distinction is not pedantic — before the
predicate was tightened, three classes named a module that exported no such helper at all, and the
operator-facing promise was false for 3 of 10 classes. Telling a model "the helper exists, just
import it" where it does not is the same false promise with a larger blast radius. Both
`CALLS INTO` and `confirm what it exports` are pinned by assertion. Locations are capped at 10 with
a `(+N more)` line so a 16-member class cannot dominate the prompt.

**D-P5-4 — only CODE-R004 renders the block.** See criterion 4, restated.

**D-P5-5 — criterion 5's `kind` half is restated against measurement.** See above.

**Assumption, recorded rather than widened into scope.** `buildCodeCraftCloneIndex` hard-wires
`DEFAULT_DUPLICATION_CONFIG` (`minInstances: 3`, `minTokens: 40`); `harness.config.json`'s
`analyze.duplication` block is NOT read, so an adopter who tunes the detector will not see
`code-craft` follow. This traces to no criterion, so it is an assumption rather than a task. If it
is wrong, the fix is one option object in `buildCodeCraftCloneIndex`.

**Assumption.** The 2.1-2.9 s index build is acceptable in every entry point that inherits it (the
CLI command and the MCP `code_craft` tool). `critiqueCodeInFile` is explicitly excluded — a
single-file cross-cutting entry should not pay 2.1-2.9 s uninvited, and its callers already hold a
project root they can pass.

#### Incidence, with its denominator

**153 of 7,880** substantive units at Scope D (1.94%) belong to a clone class, **16** of them to a
`partial-extraction` class. With `DEFAULT_MAX_FILES` at 100 a default run critiques a small slice of
that corpus, so a typical run attaches siblings to single digits of units. **The feature is quiet by
design.** That is the measured rate of whole-unit Type-2 clones among substantive units, not a
wiring defect — and anyone judging this feature by "how often did it fire" needs that denominator.
