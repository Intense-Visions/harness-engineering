# Name the artifact being mapped from: `rehearsalTierFor` → `rehearsalTierForScore`

**Issue:** [#2009](https://github.com/Intense-Visions/harness-engineering/issues/2009) — `craft: identifier naming in packages/core/src/rehearsal`
**Route:** feature (ADR 0103 rubric fallback — no pre-existing spec)
**Upstream critique:** `naming-craft` runId `f7927dfb-4051-4e15-93dd-0e3db3e5d05e`, rubric `NAME-R001` (polish / small / medium)

## Overview

`packages/core/src/rehearsal/scoring.ts:24` exports `rehearsalTierFor(score: number): RehearsalTier`. The
name predicts its return type well but leaves its _input_ unnamed — the trailing preposition dangles.
The upstream `naming-craft` critique, verbatim:

> The name mostly predicts well — a stranger reading `rehearsalTierFor(...)` correctly expects a
> RehearsalTier back — but the trailing preposition dangles: `For` what? At a call site like
> `rehearsalTierFor(value)` the reader can't tell whether the input is a score, a run, an attempt
> record, or a config until they open the signature. Naming the artifact closes that gap:
> `rehearsalTierForScore(score)`. If callers may later pass a whole result object,
> `rehearsalTierFromScore` reads slightly better as a pure mapping; either way, name the thing being
> mapped from.

**Goal:** rename the symbol to `rehearsalTierForScore` **without breaking the published package's API**.

This advances the STRATEGY.md `Ceiling-raising via LLM judgment` track — `naming-craft` is one of the six
shipped craft skills, and this is the first of its findings on `packages/core/src/rehearsal` to be applied
[evidence: `STRATEGY.md#tracks`].

### Non-goals (YAGNI)

- Renaming any other identifier in `packages/core/src/rehearsal`. The craft run surfaced exactly **one**
  finding above the noise floor; nothing else in the module is in scope.
- Adopting the critique's secondary suggestion `rehearsalTierFromScore`. The critique itself makes it
  conditional on "callers may later pass a whole result object" — speculative, so cut.
- Removing the deprecated alias. Removal is a MAJOR change and belongs to a future release decision.

## Decisions made

| #   | Decision                                                                                                                                                               | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Rename the real symbol to **`rehearsalTierForScore`** (not `rehearsalTierFromScore`)                                                                                   | Both close the gap the critique names. `For` preserves the existing call-site reading and is the critique's primary recommendation; `From` was conditioned on a speculative future signature change (YAGNI).                                                                                                                                                                                                                                      |
| D2  | **Keep `rehearsalTierFor` as a deprecated alias.** MINOR changeset, not MAJOR                                                                                          | `@harness-engineering/core` is published (v0.48.0, `private` unset) [evidence: `packages/core/package.json`] and `rehearsalTierFor` reaches the public surface via `packages/core/src/index.ts:380` `export * from './rehearsal';`. A bare rename is a breaking change for external consumers. Additive rename + deprecated alias is semver-MINOR.                                                                                                |
| D3  | Implement the alias as a **`const` binding** (`export const rehearsalTierFor = rehearsalTierForScore;`), not a wrapper function                                        | A wrapper would be a _different_ function object, so the reachability test (SC-3) could not assert reference identity, and a consumer doing `fn === core.rehearsalTierForScore` would see behaviour change. A const binding is the same reference.                                                                                                                                                                                                |
| D4  | **`packages/core/src/rehearsal/index.ts` must be edited explicitly.**                                                                                                  | This is the load-bearing constraint. That barrel is a _named_ export list — `export { REHEARSAL_WEIGHTS, rehearsalTierFor, scoreRecovery } from './scoring';` at `packages/core/src/rehearsal/index.ts:10` — **not** `export *`. An alias declared only in `scoring.ts` would compile, pass every existing test, and still be **absent from the package's public surface** — silently converting this MINOR-compatible rename into a MAJOR break. |
| D5  | Prove D4 with a test that imports **both** names from the package public entry (`packages/core/src/index.ts`) and asserts `rehearsalTierFor === rehearsalTierForScore` | Existing `scoring.test.ts` imports from `./scoring` directly, so it can never catch a missing barrel re-export. Only a public-entry import exercises the full chain `scoring.ts → rehearsal/index.ts → core/index.ts`.                                                                                                                                                                                                                            |
| D6  | The alias's JSDoc carries **both** `@deprecated` and `@public`                                                                                                         | `packages/core/src/entropy/detectors/dead-code.ts:405` matches `/@public(Api)?\b/i` in the nearest preceding JSDoc (within 15 lines) to exempt an intentionally-public export from the `PUBLIC_API_UNUSED` finding. The alias will have zero internal callers by construction, so without `@public` it would generate a (non-blocking) entropy finding on every future sweep.                                                                     |
| D7  | No `scripts/generate-core-barrel.mjs` allowlist edit                                                                                                                   | `rehearsal` has its own `index.ts` and is star-exported by core's index; it is **not** a key in that script's `SELECTIVE_EXPORTS` map [evidence: `scripts/generate-core-barrel.mjs:33-123`], so the curated-allowlist silent-no-op trap does not apply. Verified mechanically via `pnpm run generate:barrels:check`.                                                                                                                              |

## Technical design

### `packages/core/src/rehearsal/scoring.ts`

```ts
/** Pass at >= 80, partial at >= 50, fail below. Exported so the boundary is testable. */
export function rehearsalTierForScore(score: number): RehearsalTier { ... }   // was rehearsalTierFor (:24)

/**
 * @deprecated Use `rehearsalTierForScore` instead. ...
 * @public
 */
export const rehearsalTierFor = rehearsalTierForScore;
```

Internal call site at `scoring.ts:120` (`tier: rehearsalTierFor(score)`) moves to `rehearsalTierForScore`.

### `packages/core/src/rehearsal/index.ts:10`

Named list extended with **both** symbols:

```ts
export {
  REHEARSAL_WEIGHTS,
  rehearsalTierForScore,
  rehearsalTierFor,
  scoreRecovery,
} from './scoring';
```

### Tests

- `packages/core/src/rehearsal/scoring.test.ts` — existing `describe('rehearsalTierFor')` block (`:41-48`)
  retargets to `rehearsalTierForScore`.
- **New** public-entry reachability test asserting both names import from `packages/core/src/index.ts`,
  are defined, and are the same function reference.

### Changeset

MINOR for `@harness-engineering/core`, describing the rename and the deprecation.

## Integration points

- **Entry Points:** `@harness-engineering/core` public barrel (`packages/core/src/index.ts:380`, via
  `packages/core/src/rehearsal/index.ts:10`). One new exported name, one existing name retained as an alias.
- **Registrations Required:** `packages/core/src/rehearsal/index.ts` named-export list (D4). No
  `generate-core-barrel.mjs` allowlist change (D7) — confirmed by `generate:barrels:check`.
- **Documentation Updates:** none. No `docs/` page names this symbol. The comprehension shard
  `.harness/comprehension/packages/core/src/rehearsal/_module.md` is a generated artifact, refreshed by the
  normal comprehension tooling, not hand-edited.
- **Architectural Decisions:** None. Small change; D2 (deprecated-alias-over-break) applies an existing
  semver convention rather than establishing a new one.
- **Knowledge Impact:** None.

## Success criteria

- **SC-1** `rehearsalTierForScore` is exported from `packages/core/src/rehearsal/scoring.ts` and is the sole
  implementation; `scoring.ts:120` calls it.
- **SC-2** When a consumer imports `rehearsalTierFor` from `@harness-engineering/core`, the system shall
  still resolve it to a callable — i.e. it is present in `packages/core/src/rehearsal/index.ts`'s named list.
- **SC-3** A test importing **both** names from the package public entry asserts they are the identical
  function reference, and it fails if the alias is dropped from the `rehearsal/index.ts` named list.
- **SC-4** `rehearsalTierFor`'s JSDoc contains `@deprecated` and `@public`.
- **SC-5** A MINOR changeset for `@harness-engineering/core` exists.
- **SC-6** `pnpm run generate:barrels:check` passes with no barrel regeneration required.
- **SC-7** `packages/core` typecheck and the `rehearsal` test suite pass; no new findings relative to the
  ambiently-red baseline.

## Alternatives considered

|          | A) Rename + deprecated alias (**chosen**)                                            | B) Bare rename                                | C) Leave as-is                  |
| -------- | ------------------------------------------------------------------------------------ | --------------------------------------------- | ------------------------------- |
| **How**  | New name is the implementation; old name a `const` alias re-exported from the barrel | Rename everywhere, delete old name            | Close #2009 as won't-fix        |
| **Pros** | Fixes the naming defect; no consumer breakage; semver-MINOR                          | Smallest diff; no lingering alias             | Zero risk                       |
| **Cons** | One extra exported symbol to retire later                                            | **Breaks the published API** — requires MAJOR | Leaves the critique unaddressed |
| **Risk** | Low — the one real risk is the alias not reaching the barrel (D4/D5 mitigate)        | High                                          | —                               |

**[IMPORTANT]** B is only viable if `@harness-engineering/core` were private. It is not (v0.48.0, published),
so B was rejected at the human gate. **Chosen: A.**

## Risks

| Risk                                                                                          | Mitigation                                                                                                                                              |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alias declared but not re-exported → silent MAJOR break disguised as MINOR                    | D4 + SC-3: explicit barrel edit **and** a public-entry reference-identity test that fails if the barrel entry is dropped                                |
| Alias flagged `PUBLIC_API_UNUSED` by the dead-code detector (zero internal callers by design) | D6: `@public` annotation, which `dead-code.ts:405` honours. Advisory-only in CI regardless (`persona-entropy-cleaner.yml:33` is non-blocking)           |
| Importing the full core barrel in a unit test pulls heavy/sqlite-backed modules               | The reachability test only reads two bindings; if the import proves costly, it stays a single narrow test rather than being pushed into every test file |

## Implementation order

1. Rename in `scoring.ts` (declaration + internal call site); add the deprecated `@public` alias.
2. Extend the `rehearsal/index.ts` named-export list with both symbols.
3. Retarget `scoring.test.ts` to the new name; add the public-entry reachability test (SC-3).
4. Add the MINOR changeset.
5. Verify: `generate:barrels:check`, typecheck, rehearsal test suite.
