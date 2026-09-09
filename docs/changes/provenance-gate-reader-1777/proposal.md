# Provenance trailer: shape gate + `harness provenance` reader CLI

> Issue #1777 — follow-up slice of epic #1531. Core primitive shipped in #1776.

## Overview and Goals

#1776 shipped the governed `Harness-*` commit trailer: a schema, a formatter, an
idempotent appender and a parser
(`packages/core/src/provenance/commit-trailer.ts`), emitted on the orchestrator
ship path (`packages/orchestrator/src/workspace/manager.ts:749` into the commit
message, `:794` mirrored into the PR body for squash survival).

Nothing **reads** it. #1777 closes that half with two surfaces:

1. A CI check that the trailer is **present and well-shaped** on agent-authored
   commits.
2. A `harness provenance <sha>` reader CLI that parses and prints the trailer.

### Goals

- An adopter (or a human auditing a fleet PR) can ask one commit "who made you,
  under which run, with which model?" and get a straight answer.
- A malformed trailer — one that the emitter could never have produced, i.e.
  evidence of drift, hand-editing, or a rebase that mangled the block — is
  caught mechanically instead of silently degrading every downstream consumer
  that joins provenance to cost.
- No consumer re-implements the trailer grammar. There is exactly one scanner.

### Out of scope (see **Parked fork**)

- Enforcing that agent-authored commits _carry_ a trailer. That requires a
  mechanical definition of "agent-authored", which this repo does not have.

---

## Parked fork (NOT decided in this slice)

Recorded verbatim, unanswered, for the human:

> **what counts as an "agent-authored" commit for the PRESENCE half, and should
> presence be enforced (block) or advisory (warn) during adoption?**

Why it is parked rather than guessed:

- There is no established mechanical "agent-authored" oracle in this repo. The
  two candidate signals are both partial. `Claude-Session:` is appended by the
  interactive client, so it identifies _interactive_ AI assistance, which
  `commit-trailer.ts:13-16` deliberately refuses to conflate with the autonomous
  tier. `Harness-Run` is emitted by the orchestrator ship path only — using it to
  decide which commits _must_ carry `Harness-Run` is circular.
- A presence gate switched on hard goes red across the whole of existing history
  and every open PR the moment it lands, because almost no commit carries the
  trailer yet. That is a repo-wide policy decision with an adoption ramp, not an
  implementation detail.

Consequence: this slice ships the half that is unambiguous (shape), and the
issue stays open. Closing keyword is `Refs #1777`, not `Closes`.

---

## EXPLORE — context gathered

| Finding                                                                                                                                                                                                      | Evidence                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| The trailer primitive is complete and already barrel-exported; `provenance` is auto-discovered as `export * from './provenance'`.                                                                            | `packages/core/src/index.ts:365`; `scripts/generate-core-barrel.mjs` `SELECTIVE_EXPORTS` has no `provenance` key |
| `parseProvenanceTrailer` returns `null` when no `Harness-Run` key is present — it deliberately leaves non-fleet commits **unclaimed**.                                                                       | `packages/core/src/provenance/commit-trailer.ts:150-193`                                                         |
| The parser is lossy about duplicates: it accumulates into a `Map`, so a repeated `Harness-*` key silently keeps the last occurrence.                                                                         | `commit-trailer.ts:160-166`                                                                                      |
| The parser is lenient about the schema version: an absent or unparseable `Harness-Provenance-Version` silently falls back to the current.                                                                    | `commit-trailer.ts:175-176`                                                                                      |
| The CLI registry is generated, not hand-maintained.                                                                                                                                                          | `packages/cli/src/commands/_registry.ts:1`; `pnpm run generate-barrel-exports`                                   |
| The root program declares `--json`, so a subcommand's own `--json` never reaches its action opts (issue #2069). Working idiom: declare the local flag for parse acceptance, read it via `optsWithGlobals()`. | `packages/cli/src/index.ts:75`; `packages/cli/src/commands/proposals.ts:203-205`; `rules/provenance.ts`          |
| `harness rules provenance` already exists — a _different_ concept (ADR-0100 rule-to-failure reporter).                                                                                                       | `packages/cli/src/commands/rules/provenance.ts:9-19`                                                             |
| The repo already has an advisory-by-construction PR workflow whose every step is `continue-on-error: true`.                                                                                                  | `.github/workflows/pr-advisory-checks.yml`                                                                       |
| `ExitCode.ZERO_DENOMINATOR` (3) already means "the command ran but examined NOTHING — abstained, not passed, and must never read as green".                                                                  | `packages/cli/src/utils/errors.ts:11-19`                                                                         |

---

## EVALUATE / PRIORITIZE — approaches considered

### Decision 1 — where the shape validator lives

|          | A) `packages/core/src/provenance/validate-trailer.ts`                                                                                | B) inside the CLI command                                                    |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| **Pros** | Sits beside the emitter it must not drift from; auto-exported through the existing star barrel; reusable by the orchestrator on emit | Smallest blast radius                                                        |
| **Cons** | Adds a core export                                                                                                                   | Domain rule in the presentation layer; the orchestrator can never self-check |
| **Risk** | Low — no barrel-script edit needed (verified above)                                                                                  | Medium — invites a second copy later                                         |

**Chosen: A.** The whole point of #1777 is that emitter and validator must agree;
co-locating them is what keeps that true.

### Decision 2 — detecting duplicate keys without writing a second parser

|          | A) validator re-scans lines with its own regex                                | B) export the existing scan from `commit-trailer.ts` and have `parseProvenanceTrailer` consume it too |
| -------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Pros** | Zero change to shipped code                                                   | One scanner, two consumers — drift is impossible by construction                                      |
| **Cons** | Two grammars that will drift — the exact failure this issue exists to prevent | Touches a file shipped 24h ago                                                                        |
| **Risk** | High                                                                          | Low — a pure extraction; `Map`-from-ordered-pairs is byte-identical to today's behaviour              |

**Chosen: B.** `collectProvenanceTrailerEntries(message): Array<[string, string]>`
is extracted from the body of `parseProvenanceTrailer`, which then consumes it.
The validator consumes the same ordered list and can therefore see duplicates
that the `Map` collapses.

### Decision 3 — command surface

|          | A) `harness provenance [commitish]` with `--range` / `--check` on the same command | B) `harness provenance read <sha>` + `harness provenance check` subcommands                                 |
| -------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Pros** | Matches the issue's literal `harness provenance <sha>`; one command to document    | Tidier separation of modes                                                                                  |
| **Cons** | Two modes on one command                                                           | A command cannot cleanly take both a positional arg and subcommands; `harness provenance <sha>` would break |
| **Risk** | Low                                                                                | Medium — changes the requested surface                                                                      |

**Chosen: A.**

### Decision 4 — what `--check` does with a commit that carries no trailer

**Chosen: skip it, and say so.** A trailer-less commit is _unclaimed_, exactly as
`parseProvenanceTrailer` documents. Failing on it would be the presence gate —
the parked policy — smuggled in through the back door, and it would turn every
human PR red. `--check` prints `examined N · carried a trailer M · unclaimed K`
so a reader can never mistake "nothing to validate" for "validated everything".

### Decision 5 — CI wiring

**Chosen: an advisory job in `.github/workflows/pr-advisory-checks.yml`**, whose
every existing step is already `continue-on-error: true`. Promoting the shape
gate to a blocking required check is part of the same block-vs-warn policy
question that is parked, so it is not decided here. The job writes its summary
to `$GITHUB_STEP_SUMMARY` so an advisory result is still visible without opening
the log.

---

## Technical Design

### `packages/core/src/provenance/commit-trailer.ts` (modified)

```ts
/** Every `Harness-*` trailer line, in document order, duplicates included. */
export function collectProvenanceTrailerEntries(message: string): Array<[string, string]>;
```

`parseProvenanceTrailer` is refactored to build its `Map` from this list. No
behavioural change: `new Map(entries)` keeps the last occurrence, which is what
the sequential `map.set` loop did.

### `packages/core/src/provenance/validate-trailer.ts` (new)

```ts
export type ProvenanceShapeIssueCode =
  | 'missing-version'
  | 'invalid-version'
  | 'unknown-version'
  | 'empty-skill'
  | 'missing-skill-version'
  | 'duplicate-key';

export type ProvenanceShapeWarningCode = 'unknown-key' | 'empty-value';

export interface ProvenanceShapeFinding {
  code: string;
  key: string;
  detail: string;
}

export interface ProvenanceShapeResult {
  /** `absent` = no `Harness-Run` key: unclaimed, NOT a failure. */
  status: 'absent' | 'valid' | 'malformed';
  trailer: ProvenanceTrailer | null;
  issues: ProvenanceShapeFinding[];
  warnings: ProvenanceShapeFinding[];
}

export function validateProvenanceTrailer(message: string): ProvenanceShapeResult;
```

A three-state `status` rather than a `valid: boolean`, deliberately: a boolean
would let a caller write `if (!valid) fail()` and thereby enforce presence by
accident — the parked policy, smuggled in through a type.

**Malformed (issue):**

| Code                    | Condition                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `duplicate-key`         | the same `Harness-*` key appears more than once                                     |
| `missing-version`       | `Harness-Provenance-Version` absent (the parser silently defaults; a gate must not) |
| `invalid-version`       | present but not a base-10 integer                                                   |
| `unknown-version`       | an integer outside `1..PROVENANCE_TRAILER_VERSION`                                  |
| `empty-skill`           | `Harness-Run` value is empty left of the final `@`                                  |
| `missing-skill-version` | `Harness-Run` has no `@`, or nothing after it                                       |

**Advisory (warning), never a failure:**

| Code          | Condition                                                                      |
| ------------- | ------------------------------------------------------------------------------ |
| `unknown-key` | a `Harness-*` key not in `PROVENANCE_TRAILER_KEYS` — forward compatibility     |
| `empty-value` | a known optional key present with an empty value (the formatter omits empties) |

### `packages/cli/src/commands/provenance.ts` (new)

```
harness provenance [commitish]        read one commit's trailer (default HEAD)
harness provenance --check [commitish]      shape-gate one commit
harness provenance --check --range <range>  shape-gate every commit in a range
  --json                              machine-readable output (read via optsWithGlobals, #2069)
  --cwd <path>                        repository root
```

Exit codes:

| Code | Meaning                                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------ |
| `0`  | trailer read successfully / shape gate passed                                                                      |
| `1`  | `VALIDATION_FAILED` — at least one commit in scope carries a **malformed** trailer                                 |
| `2`  | `ERROR` — not a git repository, or `<commitish>`/`<range>` does not resolve                                        |
| `3`  | `ZERO_DENOMINATOR` — reader mode: the commit carries **no** trailer; `--check`: the range resolved to zero commits |

Reader mode on a trailer-less commit prints `no provenance trailer on <sha>` and
exits 3. It is neither a silent success nor an error: nothing was found to
report, and `ExitCode.ZERO_DENOMINATOR` is the repo's existing word for a result
that must never read as green.

Git access goes through one injected `runGit(args): string` seam so the command
is testable without a repo; the shipped default is `execFileSync('git', ...)`.
Range reads use a single `git log --format=%H%x1f%B%x1e <range>` call rather than
N `git show`s.

### `.github/workflows/pr-advisory-checks.yml` (modified)

A `provenance-shape` job mirroring the existing two: checkout with
`fetch-depth: 0`, pnpm + Node 22, `pnpm install --frozen-lockfile`, `pnpm build`,
then

```
node packages/cli/dist/bin/harness.js provenance --check \
  --range "origin/${{ github.base_ref }}...HEAD"
```

under `continue-on-error: true`.

---

## Integration Points

- **Entry Points** — new top-level CLI command `harness provenance`; two new
  `@harness-engineering/core` exports; one new job in `pr-advisory-checks.yml`.
- **Registrations Required** — `pnpm run generate-barrel-exports` regenerates
  `packages/cli/src/commands/_registry.ts`; `packages/core/src/provenance/index.ts`
  gains the two re-exports. `scripts/generate-core-barrel.mjs` needs **no** edit:
  `provenance` is auto-discovered (`export * from './provenance'`), it is not in
  `SELECTIVE_EXPORTS`.
- **Documentation Updates** — `pnpm run generate-docs` regenerates
  `docs/reference/cli-commands.md` and `docs/reference/cli.md`.
- **Architectural Decisions** — none rise to an ADR. Decision 2 (single scanner)
  is a code-structure choice inside one module; the block-vs-warn presence policy
  _would_ warrant one, and is exactly what is parked.
- **Knowledge Impact** — "unclaimed commit" as a first-class state: absence of a
  provenance trailer is a deliberate non-assertion, not a violation.

---

## Success Criteria

1. When a commit carries a well-formed trailer, `harness provenance <sha>` shall
   print every populated key and exit 0.
2. When a commit carries no `Harness-Run` trailer, the command shall print
   `no provenance trailer on <sha>` and exit 3 — never 0.
3. If `<commitish>` does not resolve, the command shall print an actionable
   message naming the ref and exit 2, and shall not surface a raw git stack trace.
4. When `--json` is passed in either flag position, the command shall emit a
   single JSON document and no human-formatted lines — verified by running the
   **built binary**, not by unit test alone.
5. When any commit in `--range` carries a malformed trailer, `--check` shall name
   the commit, name each issue code, and exit 1.
6. When every commit in `--range` is unclaimed, `--check` shall exit 0 and state
   the counts it examined.
7. `validateProvenanceTrailer` shall report a duplicated `Harness-*` key, which
   `parseProvenanceTrailer` alone cannot see.
8. `parseProvenanceTrailer`'s existing behaviour shall be unchanged by the
   scanner extraction (its existing tests pass untouched).

## Implementation Order

1. Core: extract `collectProvenanceTrailerEntries`, add `validate-trailer.ts`,
   re-export both. Tests.
2. CLI: `provenance.ts`, regenerate the registry. Tests, including a real
   temp-git-repo path and a built-binary `--json` check.
3. CI: advisory `provenance-shape` job.
4. `pnpm run generate-docs`, changeset, format.
