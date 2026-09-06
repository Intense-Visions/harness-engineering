# Debug Session: design.tokenPath declared but never read (#1855)

Status: resolved
Started: 2026-09-06
Resolved: 2026-09-06
Base SHA: c1ca02ba2

Error: No thrown error. A **silent-skip** defect — setting `design.tokenPath` in
`harness.config.json` has no effect; the token-bypass drift rules
(DRIFT-T001/T002/T003) simply do not run, which reads identically to
"no drift found".

## Phase 1 — INVESTIGATE

### Step 1: Entropy analysis

`harness cleanup packages/cli/src/drift` → 5754 entropy issues, **all** of them
repo-wide documentation drift (`docs/knowledge/decisions/**`,
`docs/supply-chain-audit-*.md`, `docs/roadmap.md`). Nothing near the failure
site; no dead code, no pattern violation, no dependency issue implicated in
`packages/cli/src/drift/`. Entropy contributed nothing to this diagnosis —
recorded so the negative result is not re-derived.

### Step 2: Read the error

There is no error. That IS the bug. The failure signature is an **absence**:

- What failed: `loadTokenSet` / `loadTokenPathIndex` return `null`.
- Where: `packages/cli/src/drift/resolvers/tokens.ts` lines 53 and 88.
- Input: a project whose tokens are NOT at `design-system/tokens.json`, with
  `design.tokenPath` pointing at their real location.
- Expected: tokens load; DRIFT-T00x run.
- Actual: `null`; `meta.tokensLoaded: false`; zero findings; **exit 0**.

The issue text names the file as
`packages/cli/src/design-craft/drift/resolvers/tokens.ts` — that path does not
exist. The real path is `packages/cli/src/drift/resolvers/tokens.ts`. The issue
also cites only line 53; there is a **second**, identical hardcoded site at line
88 (`loadTokenPathIndex`, which feeds align-design-system's codemods). Fixing
only the cited site would leave the defect half-live: detect would honour the
config and align would not.

### Step 3: Reproduce consistently

Fixture project (scratchpad `repro-1855/`):

```
harness.config.json         { "design": { "enabled": true,
                                          "tokenPath": "custom/design/my-tokens.json" } }
custom/design/my-tokens.json  { color.brand.primary = #FF6600 }
src/Button.tsx                style={{ color: '#FF6600' }}
```

Driving the real public entry point `runDetectDrift` plus both resolvers:

```
--- site :53 (loadTokenSet) ---
loadTokenSet => null (tokens NOT loaded)
--- site :88 (loadTokenPathIndex) ---
loadTokenPathIndex => null (index NOT loaded)
--- end-to-end runDetectDrift ---
meta.tokensLoaded: false
DRIFT-T001 findings: 0
```

Reproduces every run. Deterministic — no timing or ordering factor.

### Step 4: Check recent changes

Not a recent regression — an original wiring gap, and the history says so:

| commit      | date       | what                                                     |
| ----------- | ---------- | -------------------------------------------------------- |
| `a049b3e51` | 2026-03-19 | design-system Phase 1-2 — declares `tokenPath` in schema |
| `421532820` | 2026-05-24 | detect-design-drift verifier — **hardcodes** the path    |
| `e4134d341` | 2026-05-24 | align-design-system — second **hardcoded** site          |

The config key shipped **two months before** its only consumer existed. The
consumer was then authored against a fixed literal and the loop back to the
pre-existing key was never closed. That ordering is the root cause: a config key
with no consumer at declaration time has nothing to hold it accountable.

The documented intent was explicit all along —
`docs/changes/design-system-skills/plans/2026-03-19-design-system-phase5-implementation-skills-plan.md:150`:

> `design.tokenPath` — custom token path (default: `design-system/tokens.json`).

So this is a plain contract violation, not an ambiguous design call. The fix
restores the documented contract rather than inventing one.

### Step 6: Trace data flow

```
harness.config.json  design.tokenPath
        |
        X   <-- severed here: NOTHING reads the key
        |
runDetectDrift(input)
  -> resolveDriftConfig()            drift/index.ts:79
       loadDesignExclude(root)       <-- config IS read here, for design.exclude
       loadTokenSet(root)            drift/index.ts:97
         -> path.join(root,'design-system','tokens.json')   <-- HARDCODED :53
       -> null -> tokens:null -> rulesApplied omits 'token-bypass'
       -> scanFile() skips runTokenBypassRule entirely

runAlignDesignSystem(input)          align/index.ts:76
  -> loadTokenPathIndex(root)
       -> path.join(root,'design-system','tokens.json')   <-- HARDCODED :88
       -> null -> T001/T002/T003 codemods cannot resolve token references
```

The severed edge is unambiguous: `design.tokenPath` has **zero** readers in the
whole repo (verified by symbol sweep; the `tokenPath` hits in
`packages/graph/src/ingest/DesignIngestor.ts` are an unrelated homonym — a
token's dotted path like `space.md`).

## Phase 2 — ANALYZE

### Working example

`loadDesignExclude` in `packages/cli/src/config/analysis-schema.ts:74`. It reads
one `design.*` key from `harness.config.json` for this exact drift runner, and
its own doc comment states the reason: kept out of `HarnessConfigSchema` so hot
paths do not drag in the full schema's transitive imports. Sibling precedents in
the same file: `loadAnalysisExclude`, `loadDepsExclude`.

Critically, `resolveDriftConfig` **already calls** `loadDesignExclude(projectRoot)`
two lines above its `loadTokenSet(projectRoot)` call. The mechanism to read
config was already present and already in use in the same function — the token
resolver just never used it.

### Differences (working vs failing)

|                                 | `design.exclude` (works)          | `design.tokenPath` (broken)   |
| ------------------------------- | --------------------------------- | ----------------------------- |
| config reader                   | `loadDesignExclude`               | **none**                      |
| default when unset              | `[]`                              | `design-system/tokens.json`   |
| failure mode when misconfigured | patterns ignored, scan still runs | **rules silently do not run** |

Category: **missing setup** — the failing path skips a config read the working
path performs. Not a wrong-argument or timing bug.

### Why the existing tests do not catch it

`packages/cli/tests/config/design-schema.test.ts:83` asserts `tokenPath must be
a string if provided`. That is a test of the **schema shape**, not of the value
being **honoured**. The key is covered by a passing test and still completely
inert — false confidence. Any replacement test must assert behaviour.

## Phase 3 — HYPOTHESIZE

> The rules skip because `loadTokenSet` and `loadTokenPathIndex` build the tokens
> path from a hardcoded literal and never consult `design.tokenPath`.
> If correct, routing both through a config-aware resolver will make the SAME
> fixture report `tokensLoaded: true` and emit a DRIFT-T001 finding for `#FF6600`.
> Falsifiable by: one variable — replace only the path expression at :53 and :88.

**Confirmed.** One variable changed (the path expression, via a single shared
helper). Same fixture, after:

```
loadTokenSet => TokenSet loaded
loadTokenPathIndex => TokenPathIndex loaded
meta.tokensLoaded: true
DRIFT-T001 findings: 1
```

### Uncertainty ledger

- **Assumption (recorded, not blocking):** a configured `tokenPath` that escapes
  `projectRoot` (`../../elsewhere.json`) is honoured. It is the project's own
  config file naming its own tokens — same trust boundary as `projectRoot`
  itself — so no traversal guard was added.
- **Assumption:** `tokenPath` may name a `.css` file per the schema's doc
  comment, but the resolver only parses DTCG JSON. Behaviour there is unchanged
  (parse fails -> `null`). Not widened here.
- **Deferrable (filed as PR follow-ups, not built):** three adjacent hardcoded
  `design-system/tokens.json` sites outside this defect's scope.

## Phase 4 — FIX

### Regression test (written BEFORE the fix)

`packages/cli/src/drift/resolvers/tokens.tokenpath-1855.test.ts` — 11 tests.
Colocated in `src/` because `packages/cli/tests/**` is region-locked by a
concurrent PR; `src/**/*.test.ts` is an established include in this package's
vitest config.

Asserts behaviour, not shape: both call sites read a configured path, the
DRIFT-T00x rules genuinely run against custom-path tokens (checked via
`meta.tokensLoaded` **and** `catalog.rulesApplied` **and** the palette-aware
finding message — a silent skip and a clean scan are otherwise
indistinguishable), the unset-key fallback is intact, and the deliberately
unchanged missing-file contract is pinned.

### Fix

Root cause, minimal, one concept:

- `loadDesignTokenPath()` added to `config/analysis-schema.ts`, mirroring the
  `loadDesignExclude` sibling exactly. Blank/whitespace-only is treated as unset
  (it cannot name a file, and honouring it literally would resolve to the
  project root and silently disable the rules again).
- `resolveTokensFilePath()` added to `tokens.ts` and used at **both** :53 and
  :88, so the configured path cannot be honoured by one loader and ignored by
  the other.

No new config-plumbing mechanism, no widened signatures, no special-case branch.

### Verify (Phase 4 Step 4 — revert-and-fail protocol)

Identical test file, fix reverted then restored:

|        | fix reverted                  | fix applied        |
| ------ | ----------------------------- | ------------------ |
| result | **5 failed** \| 6 passed (11) | **11 passed** (11) |

The 6 that pass without the fix are precisely the unchanged-behaviour guards
(unset-key fallback, missing-file `null`) — they are meant to pass in both
states. Every custom-path assertion fails without the fix. The test provably
catches the bug.

Wider suites: `tests/drift tests/align tests/config src/drift src/align
src/design-pipeline` → 38 files, 398 tests, all pass. `tsc --noEmit` clean.
ESLint clean on all three changed files.

## Resolution

**Root cause:** `design.tokenPath` was declared in the config schema on
2026-03-19, two months before its only consumer existed. When the drift token
resolver was authored (2026-05-24) it hardcoded `design-system/tokens.json` at
two sites and was never wired back to the pre-existing key. Schema validation
gave the key the appearance of support; nothing read it.

**Fix:** route both resolver sites through `resolveTokensFilePath`, which reads
`design.tokenPath` via a new `loadDesignTokenPath` config reader (modelled on
the `loadDesignExclude` sibling) and falls back to `design-system/tokens.json`
only when the key is unset.

**Regression test:** `packages/cli/src/drift/resolvers/tokens.tokenpath-1855.test.ts`

**Deliberately NOT changed (F2):** an explicitly-configured-but-missing tokens
file still returns `null` rather than failing loudly. The issue raises that
"separately"; it is an adopter-visible behaviour change and belongs in its own
change. The current contract is now pinned by a test so a future change to it is
a visible, deliberate edit.

**Out of scope (named as PR follow-ups):**
`packages/cli/src/brand/resolvers/token-extensions.ts:31`,
`packages/cli/src/design-pipeline/phases/fill.ts:92`,
`packages/cli/src/design-pipeline/phases/freshen.ts:27`.

## Learnings

- **A config key declared before its consumer exists has nothing holding it
  accountable.** Zod validation makes an inert key look supported. When adding a
  schema key ahead of its reader, the schema test is not coverage — a behaviour
  test that the value is honoured is.
- **A silent skip and a clean result are indistinguishable from the finding list
  alone.** Any test for a resource-gated rule must assert the rule _ran_
  (`tokensLoaded` / `rulesApplied`), not just what it found. Same class as #1838.
- **A fix scoped to the cited line can be half a fix.** The issue cited one
  hardcoded site; there were two, feeding two different skills. Sweep for the
  literal before scoping.
