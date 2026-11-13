# Auto-wire craft critique at the review moment

**Keywords:** craft, skillHooks, review-hooks, activation, diff-scope, advisory-findings, multi-language, tree-sitter, code-nav

## Overview and Goals

### Problem

The eleven `-craft` skills are the project's ceiling layer, but nothing in the build path invokes
them. Verified: zero craft references across all eight build-pipeline skills (`harness-execution`,
`harness-integration`, `harness-autopilot`, `harness-tdd`, `harness-refactoring`,
`harness-code-review`, `harness-planning`, `harness-verification`). Craft is reached only by
standing sweeps (`craft-fleet`, `harness-design-pipeline`, `docs-fleet`, `test-fleet`,
`security-fleet`, `harness-audit`) and by `harness-brainstorming` for spec-craft. The ceiling is
therefore applied only when a human remembers to apply it.

The declarations that look like they would fix this do not. All eleven craft skills declare `on_pr`
and `on_new_feature` triggers (`agents/skills/claude-code/code-craft/skill.yaml`), but the sole
consumer of that field is `dispatch_skills`, which uses it as a result _filter_
(`packages/cli/src/mcp/tools/dispatch-skills.ts:107-136`). Nothing fires them. This is the same
dead-declaration shape that issue #663 closed for persona triggers.

### Goals

1. When a change touches a surface a craft domain owns, that domain's critique runs automatically at
   the review moment — no human invocation.
2. Runs are diff-scoped and budget-capped, so automation does not multiply review cost.
3. Findings are advisory: surfaced, never blocking, never counted toward review severity.
4. The _absence_ of a domain is reported, never silent — including the case where a domain cannot
   read the language in the diff.
5. Zero new configuration for adopters; craft activates where it can help in any supported
   language, not only in a TypeScript monorepo.

### Non-goals

- No auto-application of craft findings. `craft-fleet` owns elevation and requires net-better
  re-critique machinery that this change does not build.
- No blocking gate on a taste judgment.
- No new sweep orchestrator. Roadmap #374 `harness:craft-pipeline` is a standing sweep that
  `craft-fleet` already covers, and it stays out of scope.
- No wiring of autopilot's `after:EXECUTE` boundary (a separate roadmap row).

## Decisions made

| #   | Decision                                                                    | Rationale                                                                                                                                                                                                                        |
| --- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Mechanism is `skillHooks`, not CI                                           | The gap is session-time: findings are actionable while the code is still in the author's head. `skillHooks` already exists (`packages/core/src/hooks/skill-lifecycle.ts`) and this repo configures none of it.                   |
| D2  | Advisory only — never blocking, never a severity count                      | Follows `harness-design-pipeline`, where design-craft findings "are surfaced in REPORT but do NOT contribute to the `error`/`warn` severity counts — they're ceiling-layer suggestions, not violations" (`SKILL.md:176`).        |
| D3  | Diff-scoped with a hard prompt cap                                          | All eleven craft MCP tools accept `files` and `promptBudget` (`packages/cli/src/mcp/tools/code-craft.ts:57-78`). Unscoped craft is up to 100 prompts answered by the calling agent — not viable per review.                      |
| D4  | Wire only at events each host actually wires                                | Autopilot wires exactly four events; every other boundary is a silent no-op (`harness-autopilot/SKILL.md:50`). Code-review's only declared event is `after:mechanical` (`SKILL.md:200-204`). Event sets are therefore per-host.  |
| D5  | Host **both** `harness-autopilot` and `harness-code-review`                 | Canary hardcodes a single host (`CANARY_REVIEW_HOST_SKILL`, `canary-review-hooks.ts:73`). Autopilot-only would miss interactive and CI review — and UI work, the motivating case, often does not run through autopilot.          |
| D6  | Mirror the canary resolver rather than extend the review fan-out            | `ConditionalSubagent` (`depth-calibrator.ts:16`) is consumed by `fan-out.ts`, `pipeline-orchestrator.ts:311` and the finding schema. Advisory output does not justify mutating code that gates every review.                     |
| D7  | Unknown skill availability means _skipped_, never optimistically wired      | Inherited deliberately from `SkillAvailability` (`canary-review-hooks.ts:80-83`): `undefined` ⇒ treated as not installed.                                                                                                        |
| D8  | Activation is capability-gated by declared language, computed from the diff | Prevents dispatching a domain that cannot read the changed files, which would return an empty finding set indistinguishable from "this code is fine".                                                                            |
| D9  | Extend craft unit extraction to every language harness already supports     | `SupportedLanguage` is `typescript \| javascript \| python \| go \| rust \| java` (`code-nav/types.ts:4`) and the parsing stack already ships. Craft reaching for the TS Compiler API directly is the anomaly, not the baseline. |
| D10 | Craft resolves once per phase per diff                                      | Autopilot has two review moments on substantially the same diff; resolving at both would double cost against D3.                                                                                                                 |

## Technical design

### Module

`packages/core/src/hooks/craft-review-hooks.ts`, a direct sibling of `canary-review-hooks.ts`
(294 lines — the size reference). Pure and IO-free like the rest of `core/hooks`: it normalizes and
resolves; dispatch stays in the consuming skills.

### Activation

Activation reads the **diff**, never a discovery walk — so the `packages/*/src` assumption baked
into craft's own file discovery (`packages/cli/src/security-craft/extract/discover.ts:38-39`
returns `[]` when there is no `packages/` directory) never reaches this path.

Each domain declares the languages it can extract and the surface it owns:

```ts
interface CraftDomainRule {
  skill: string; // canonical skill name
  supportedLanguages: readonly SupportedLanguage[] | 'any';
  owns(changedFiles: readonly string[]): string[]; // the OWNED SUBSET, not a boolean
  priority: number; // deterministic cap ordering
}
```

A domain activates when `owns(changedFiles)` returns a non-empty subset **and**, for a domain whose
`supportedLanguages` is not `'any'`, at least one file _in that subset_ has a `detectLanguage(path)`
(`code-nav/types.ts:78`, `EXTENSION_MAP`) within it.

**`owns` returns the subset rather than a boolean** because the capability gate has to run over the
files a domain actually owns. With a boolean, an unrelated `.ts` anywhere in the diff satisfies the
language gate for a `.py` file the domain owns — precisely the mis-dispatch D8 exists to prevent.
The subset is also what Phase 3 forwards as `files`, which criterion 4 asserts against.

**The language gate applies only to domains that need unit extraction.** `code-craft`,
`naming-craft`, `security-craft` and `test-craft` parse source into units, so a language they cannot
parse is a real incapacity. Every other domain is surface-bound — its `owns` predicate already names
the exact files it critiques — and is therefore `'any'`. This matters mechanically, not merely
descriptively: `EXTENSION_MAP` maps no `.css`, `.scss`, `.md` or `.yaml`, and `detectLanguage`
returns `null` for them. Without `'any'`, every prose domain and every CSS-only design change would
be skipped forever as `unsupported-language` — a silent total failure dressed as a correct report.

| Domain (canonical name) | Owns                                                            | Languages (post Phase 1b) |
| ----------------------- | --------------------------------------------------------------- | ------------------------- |
| `harness-design-craft`  | non-excluded, non-TEST `.tsx`, design-token or stylesheet paths | `'any'` (surface-bound)   |
| `code-craft`            | any production source file                                      | all six                   |
| `naming-craft`          | any production source file (cross-cutting)                      | all six                   |
| `test-craft`            | test files                                                      | all six                   |
| `docs-craft`            | `docs/**` or `*.md` outside `docs/changes/**`                   | `'any'` (surface-bound)   |
| `spec-craft`            | `docs/changes/**/proposal.md`                                   | `'any'` (surface-bound)   |
| `cli-ergonomics-craft`  | CLI command modules                                             | `'any'` (surface-bound)   |
| `api-craft`             | OpenAPI documents                                               | `'any'` (surface-bound)   |
| `security-craft`        | any production source file                                      | all six                   |
| `knowledge-craft`       | `docs/knowledge/**`                                             | `'any'` (surface-bound)   |
| `copy-craft`            | **not activated in v1** — see YAGNI note below                  | —                         |

**`harness-design-craft` excludes test files.** A changed `Button.test.tsx` is a test, not a design
surface — it is `test-craft`'s to critique, and design-craft reviewing a test's markup would be
noise. The same exclusion applies to `cli-ergonomics-craft`: a test under `commands/` is not a
command module.

**`cli-ergonomics-craft` must NOT use the production-source predicate.** Its `owns` is
`!isExcludedPath && !isTestFile && CLI_COMMAND_PATTERN`. The obvious implementation —
`isProductionSource(f) && CLI_COMMAND_PATTERN.test(f)` — is wrong, because `isProductionSource`
requires `detectLanguage(f) !== null`, which re-imposes the language gate on the _back door_:
`cmd/root.sh` and `bin/tool.rb` would report `not-activated` while the domain advertises `'any'`. A
shell or Ruby CLI is the obvious adopter case. The cost of the looser predicate is that any file
type under `cli/`, `commands/`, `cmd/` or `bin/` is owned, including `.md`/`.json`/`.yaml` that
merely live there; if that proves noisy, intersect with a command-ish extension set rather than
restoring `isProductionSource`.

`copy-craft` is cut from v1 activation: its surface (a changed string literal in an error or log
message) cannot be computed from a changed-file list without content analysis. It stays manual
until a predicate exists that actually works.

> **[IMPORTANT]** `harness-design-craft` is the only craft skill whose canonical `name:` carries the
> `harness-` prefix; the other ten are bare. Dedup is by raw declared name, so the table must use
> canonical names or a project's explicit override silently fails to suppress the default.

### Exported API

```ts
export const CRAFT_REVIEW_DOMAINS: readonly CraftDomainRule[];

// Per-host, because the two hosts wire different events (D4).
export const CRAFT_REVIEW_EVENTS_BY_HOST: {
  'harness-autopilot': readonly ['after:REVIEW', 'after:FINAL_REVIEW'];
  'harness-code-review': readonly ['after:mechanical'];
};

export type CraftSkipReason =
  | 'not-installed'
  | 'not-activated'
  | 'unsupported-language'
  | 'no-diff-context'
  | 'over-budget'
  | 'already-run';

export interface CraftReviewPlan {
  wired: NormalizedHook[]; // NON-blocking
  skipped: Array<{ skill: string; reason: CraftSkipReason }>;
  expected: readonly string[]; // the denominator
}

export function planCraftReviewDomains(
  hostSkill: string,
  event: string,
  changedFiles: readonly string[] | undefined,
  availableSkills?: SkillAvailability,
  opts?: { maxDomains?: number; alreadyRanFor?: readonly string[] }
): CraftReviewPlan;

export function resolveReviewHooksWithCraft(
  config: SkillHooksConfigHolder | null | undefined,
  skillName: string,
  event: string,
  opts: {
    changedFiles?: readonly string[];
    availableSkills?: SkillAvailability;
    maxDomains?: number;
    alreadyRanFor?: readonly string[];
  }
): NormalizedHook[];
```

### Three deliberate divergences from the canary twin

1. **Non-blocking.** Canary's `defaultBlocking(event)` makes wired detectors blocking at review
   moments, matching the built-in gate (`canary-review-hooks.ts:64-70`). Craft hooks are emitted
   non-blocking per D2. This is stated at the call site because a future reader will otherwise
   "fix" it toward the canary default.
2. **Per-host event sets.** Canary has one host and two events; craft has two hosts with
   different event vocabularies (D4). Under `harness-code-review` the event is `after:mechanical`,
   which fires **before** the AI fan-out — so craft runs _pre_-review there and _post_-review under
   autopilot. The asymmetry is intentional (a reviewer seeing craft's findings is an improvement,
   not a problem) and is named here so it is not discovered later.
3. **Once per phase per diff.** Craft is resolved once and the second review moment reuses the
   first run's findings unless the changed-file set differs (D10).

### Forward-wired in both hosts

Code-review's contract says "An unresolvable hooked skill is a hard halt" (`SKILL.md:204`). Craft
defaults enter **both** hosts as _forward-wired defaults_, not user-declared hooks, so the canary
intent distinction applies unchanged: harness-optimistically-defaulted-but-not-installed is
**skipped**; user-declared-but-unresolvable still **hard-halts**
(`harness-autopilot/SKILL.md:98-99`). The code-review SKILL.md edit states this at the call site.

### No diff context means no activation

`HookContext.changedFiles` is optional (`packages/core/src/hooks/hook-context.ts:39-40`). When it
is `undefined`, activation yields nothing with reason `no-diff-context`. Falling back to a
repository walk would silently reintroduce the unscoped cost D3 exists to prevent.

### Diff scope is checkable, not asserted

A `skill` hook entry (`SkillHookEntry`, `skill-lifecycle.ts`) carries no argument field, so the
resolver cannot _pass_ a scope. It does not need to: `HookContext.changedFiles` is already threaded
into every hook brief ("`skill` hooks receive the same context (event, session dir, changed files,
plan path) in the subagent brief" — `harness-autopilot/SKILL.md:78`). The craft host sections
mandate forwarding them as `files` plus a `promptBudget`.

That is an instruction, and an instruction is not a guarantee — so the guarantee is encoded as an
executable law. Craft run state persists the exact file per queued prompt
(`CodeRunMeta.prompts[].file`, `packages/cli/src/code-craft/index.ts:122-134`, saved by
`saveRunState` to `.harness/craft/runs/<runId>.json`). The acceptance test asserts every
`prompts[].file` of a hook-triggered run is a member of the diff's changed-file set, and a mutation
dropping the `files` forwarding must turn that test red. Without this, "it ran diff-scoped" would be
a claim with no way to fail.

### Craft unit extraction across the six supported languages (Phase 1b)

Craft's unit extraction currently reaches for the TS Compiler API directly
(`packages/cli/src/mcp/tools/code-craft.ts:44-46`), and file discovery hardcodes
`SOURCE_EXTENSIONS = {.ts,.tsx,.js,.jsx,.mjs,.cjs}`
(`packages/cli/src/security-craft/extract/discover.ts:14`). Meanwhile harness already ships a
complete multi-language stack:

- `SupportedLanguage = 'typescript' | 'javascript' | 'python' | 'go' | 'rust' | 'java'`
  (`packages/core/src/code-nav/types.ts:4`).
- `packages/core/src/code-nav/outline.ts:10-75` declares per-language node-type maps for **all
  six**, including function / class / method kinds — substantive-unit extraction by another name.
- `packages/core/src/shared/parsers/tree-sitter.ts` has import/export strategies for Python
  (`:56`), Go (`:192`), Rust (`:259`), Java (`:317`).
- Grammars ship and resolve at runtime: `tree-sitter-wasms@0.1.13` provides
  `tree-sitter-{python,go,rust,java,typescript,javascript}.wasm`, loaded by `getParser`
  (`code-nav/parser.ts:45-60`).

So this is a routing change, not new infrastructure. `code-craft`, `naming-craft` and
`security-craft` gain a second extraction path: when `detectLanguage(file)` is not
`typescript`/`javascript`, route through `extractOutlineFromTree` (`code-nav/outline.ts:283`) to
obtain `CodeSymbol[]` (`kind`, `line`, `endLine`) and critique those as units. `test-craft` already
does exactly this for Python (`test-craft/index.ts:142`, `extractPythonTests`) and extends the same
way for the remaining three.

**Extraction across all six languages is VERIFIED, not assumed.** Probed directly against the
built `getOutline` (exported from `@harness-engineering/core`) with a fixture per language:

```
s.py    -> function:compute_total, class:Cart > method:add
s.go    -> function:ComputeTotal, type:Cart, method:Add
s.rs    -> function:compute_total, class:Cart, class:Cart > method:add
s.java  -> class:Cart > method:computeTotal
*.ts    -> 34 symbols
```

Two things this measurement settles that reasoning would not have. **Methods are nested as
`children`, not emitted flat** — a flat read of `symbols` shows only `class:Cart` for Java and reads
as broken extraction, so Phase 2's unit walk MUST recurse into `children` or it will silently
critique class declarations and skip every method. **Rust emits the same type twice**, once for the
`struct` and once for the `impl` block, so Phase 2 must de-duplicate by (kind, name, line) or every
Rust type costs two prompts and yields two copies of each finding.

`[UNVERIFIED]` The rubric catalogs are assumed language-neutral — they critique whether a function
tells one story at one altitude, not TypeScript syntax. No fixture proves this yet; Phase 1b's
per-language fixtures are what will establish it. If a rubric turns out to be TS-specific it is
marked per-language rather than silently misapplied.

`[UNVERIFIED]` Async wasm parsing per file is assumed an acceptable cost against craft's current
synchronous TS-Compiler path. The collect path is already async (`collectCodeCraftPrompts` awaits
`resolveSiblingContext`), so this is a throughput question, not a feasibility one.

### Phase-ordering invariant: extraction must land before wiring

Phase 1 established that the capability gate is **structurally unreachable** for `code-craft`,
`naming-craft` and `security-craft`. Their `owns` predicate is `isProductionSource`, which already
requires `detectLanguage(file) !== null`, so every file they can own is a language they declare.
Only `test-craft` can reach the gate, because its `owns` is path-based and can match a file with no
mapped language (`tests/fixtures/data.json`).

That is correct **after** Phase 2 lands multi-language extraction, and a trap before it. Between
Phase 1 and Phase 2 those three domains declare all six languages while the craft skills behind them
can still only extract TS/JS. If wiring (Phase 3) were to land before extraction (Phase 2),
`code-craft` would dispatch on a `.py` file, extract zero units, and return an empty finding set —
the exact silent-zero that D8 and criterion 9 exist to prevent, with the gate structurally unable to
catch it because the language is _declared_ supported.

The resolver is inert until Phase 3 (zero importers), so the spec's phase order is what protects
this. Because an ordering invariant held only in prose is the kind of safety claim this project has
learned not to trust, **Phase 3 must encode it as an executable law**: a test asserting that each
gated domain's declared `supportedLanguages` is a subset of the languages its craft skill can
actually extract, so wiring ahead of extraction turns a test red rather than shipping silent
empties.

### Skip-reason precedence

Exactly one reason is reported per expected domain, and the order is fixed so a reorder is a
deliberate change rather than an accident:

`not-activated` (surface) → `unsupported-language` (capability) → `not-installed` (availability) →
`already-run` → `over-budget`

Surface comes first because it is the cheapest and most informative. Capability precedes
availability because D8 is about dispatchability, not installation. Budget is last so a domain that
would have been skipped anyway never consumes a slot — otherwise a not-installed domain silently
displaces an installed one. Every link in this chain is pinned by a test.

### Budget

`maxDomains` caps activated domains per review (default 3) in the deterministic `priority` order
declared in `CRAFT_REVIEW_DOMAINS` — not a vague "highest signal first". Each wired hook carries a
`promptBudget`, and craft's own `maxFiles` (default 100) bounds a pathologically large diff.

**The implemented priority order** is: 1 `harness-design-craft`, 2 `code-craft`, 3 `test-craft`,
4 `security-craft`, 5 `naming-craft`, 6 `cli-ergonomics-craft`, 7 `api-craft`, 8 `spec-craft`,
9 `docs-craft`, 10 `knowledge-craft`.

**The cost is bounded, but WHICH domains run is emergent.** An earlier draft of this section claimed
the worst case was "stated rather than emergent". That is false as written and is corrected here:
`maxDomains` bounds the cost (never more than 3 domains), but which three you get is a function of
the diff shape, and the cap is binding on ordinary diffs — not only pathological ones. The measured
activation matrix at the default cap of 3, with every craft skill installed:

| Diff shape                               | Wired (priority order) | Over budget      |
| ---------------------------------------- | ---------------------- | ---------------- |
| source only (`src/a.ts`)                 | code, security, naming | —                |
| source + tests (`src/a.ts`, `a.test.ts`) | code, test, security   | naming           |
| UI (`Button.tsx`)                        | design, code, security | naming           |
| UI + source + tests                      | design, code, test     | security, naming |
| docs only (`docs/guide.md`)              | docs                   | —                |

`security-craft` is deliberately ahead of `naming-craft`. With the two reversed, `security-craft`
fell outside the budget on a plain source+tests diff — the most common shape there is — so it would
effectively never run. A missed security-posture finding costs more than a missed naming nit, and
that single swap is what makes `security-craft` reachable. The remaining gap is the
UI+source+tests row, where both are displaced; that is a known consequence of a cap of 3, and it is
visible in `skipped` as `over-budget` rather than silent.

## Integration points

### Entry points

- `packages/core/src/hooks/craft-review-hooks.ts` — new module. No new CLI command, no new MCP tool.
- `harness-autopilot/SKILL.md` — REVIEW / FINAL_REVIEW (`SKILL.md:380`) resolve craft hooks
  alongside canary's.
- `harness-code-review/SKILL.md` — craft resolution at its declared `after:mechanical` event.
- The craft `SKILL.md` files gain a short "invoked as a review hook" section stating the `files` +
  `promptBudget` forwarding contract.
- `packages/cli/src/{code-craft,naming-craft,security-craft,test-craft}/extract/` — the `code-nav`
  extraction path (Phase 1b).

### Registrations required

- Export the new symbols from `packages/core/src/hooks/index.ts` (which already re-exports the
  canary twin).
- Regenerate the root core barrel via `scripts/generate-core-barrel.mjs`. `packages/core/src/index.ts`
  is generated and star-exports `./hooks` (`:276`), so no `SELECTIVE_EXPORTS` allowlist edit is
  needed — but a hand-edit of the generated barrel drifts.
- Regenerate plugin artifacts after any `SKILL.md` edit (`pnpm generate:plugin:all`). The pre-commit
  hook does this and re-stages; a push without it drifts.
- No `harness.config.json` schema change and no `SkillHookEntry` change. Projects park a domain with
  the existing `enabled: false`.
- Platform skill mirrors are symlinks (`agents/skills/{cursor,codex,gemini-cli}/<skill>` →
  `claude-code`), so each SKILL.md is edited once; the gemini `.toml` regenerates in pre-commit.

### Documentation updates

- `docs/reference/` — the skillHooks contract page gains a craft auto-wire section parallel to the
  canary detector note.
- `AGENTS.md` — one line in the craft-family section: craft fires at review automatically, advisory.
- `harness-autopilot/SKILL.md` — extend the existing denominator-reporting rule to craft domains
  ("craft domains: 2/3 activated, 1 skipped: unsupported-language").

### Architectural decisions

- **D6 (mirror the canary resolver rather than extend the review fan-out)** warrants a standalone
  ADR: it sets the precedent for how every future advisory skill family attaches to a review
  moment, and the rejected alternative mutates a core type union consumed by three modules.
- **D9 (route craft extraction through `code-nav` rather than the TS Compiler API)** warrants a
  standalone ADR: it makes `code-nav` the single language-support seam for the craft family and
  determines where future language support lands.
- **D5 (multi-host resolver)** is an amendment paragraph to the canary-hook ADR rather than its own
  record — it generalizes a single host constant to a set.
- D1-D4, D7, D8, D10 are implementation choices documented here.

### Knowledge impact

- _Ceiling-layer advisory finding_ — a finding surfaced but never counted toward severity. Currently
  implicit in `harness-design-pipeline` prose; becomes a named, reusable concept.
- _Craft domain → surface it owns → languages it can read_ — new graph content, and the part most
  likely to need tuning from experience.
- _`code-nav` as the craft family's language-support seam_ — the relationship D9 establishes.

## Success criteria

Each is observable, and each names what makes it falsifiable. A green that cannot fail is the
failure mode this repository keeps relearning.

1. **When** a diff contains a non-excluded `.tsx` and `harness-design-craft` is installed, **the
   system shall** include it in the resolved hooks at `after:REVIEW`. _Positive control:_ the same
   test with an empty diff yields zero craft hooks, so the assertion distinguishes "activated" from
   "resolver never ran".
2. **When** a craft domain's skill is not installed, **the system shall** record it in `skipped`
   with reason `not-installed` and **shall not** fail or halt the review. _Falsifiable by:_ an
   assertion that review status is unchanged, not merely that no error was thrown.
3. **When** craft hooks are resolved, **the system shall** emit them non-blocking. _Falsifiable by:_
   a mutation flipping them to `defaultBlocking(event)` turns a test red.
4. **When** a craft domain runs as a review hook, **the system shall** critique only files present in
   the diff. _Verified by:_ every `prompts[].file` in the persisted
   `.harness/craft/runs/<runId>.json` is a member of the changed-file set; dropping the `files`
   forwarding turns this red.
5. **When** any craft domain is skipped, **the system shall** report the denominator
   (`N of M activated`) with each skip reason. _Falsifiable by:_ a test asserting a surprising `0/M`
   renders as `0/M`, never as silence.
6. **If** a project declares a craft domain explicitly in `skillHooks`, **then the system shall not**
   also wire the default for that domain. _Falsifiable by:_ a dedup test using canonical names,
   including the `harness-design-craft` prefix asymmetry.
7. **When** a review resolves craft hooks, **the system shall** activate at most `maxDomains`
   (default 3) in the declared `priority` order.
8. `resolveReviewHooksWithCraft` with no craft domain activated returns exactly
   `resolveSkillHooks(...)` — a byte-identical no-regression guarantee, mirroring the canary contract.
9. **When** a diff contains only files no installed craft domain can extract, **the system shall**
   report each as `skipped: 'unsupported-language'` and **shall not** dispatch it. _Falsifiable by:_
   a single-language fixture diff fails the test if any domain returns an empty finding set instead
   of an explicit skip.
10. **When** `code-craft` critiques a Python, Go, Rust or Java file, **the system shall** extract at
    least one unit for a fixture containing a named function. _Falsifiable by:_ one fixture per
    language — a regression to TS-only turns four assertions red, not zero. This is the positive
    control that stops "no findings" from passing as success.
11. **When** autopilot resolves craft at both `after:REVIEW` and `after:FINAL_REVIEW` on an unchanged
    changed-file set, **the system shall** run each domain once. _Falsifiable by:_ asserting exactly
    one persisted run record per domain across both events.
12. **If** `HookContext.changedFiles` is undefined, **then the system shall** activate nothing and
    report `skipped: 'no-diff-context'`. _Falsifiable by:_ a test asserting zero dispatches and a
    non-empty `skipped` list — an empty `skipped` list would mean the gate never ran.
13. **When** `skillHooks` is entirely absent from `harness.config.json`, **the system shall** still
    wire an activated, installed domain. Zero-config is the adopter default.
14. **If** a craft hook fails at runtime, **then the system shall** record the failure and **shall
    not** fail the review.

## Implementation order

**Phase 0 (optional, not a prerequisite, not an autopilot phase).** A config-only probe: a
`skillHooks` block at `after:REVIEW` naming 2-3 craft domains, this repo only, deliberately
throwaway. It answers the question engineering cannot — are auto-surfaced craft findings acted on,
or scrolled past? It is deliberately excluded from the numbered phases below because it is a
disposable experiment, not work to be planned, executed and reviewed.

### Phase 1: Craft review-hooks resolver

<!-- complexity: medium -->

`packages/core/src/hooks/craft-review-hooks.ts` — the `CRAFT_REVIEW_DOMAINS` table, the
capability-gated activation function, `planCraftReviewDomains`, and `resolveReviewHooksWithCraft`.
Pure core, no LLM in the loop, inert until a host calls it. Mirrors the structure of the existing
`canary-review-hooks.ts` (294 lines).

Satisfies criteria 1, 3, 6, 7, 8, 9, 12, 13.

### Phase 2: Multi-language craft unit extraction

<!-- complexity: high -->

Route `code-craft`, `naming-craft`, `security-craft` and `test-craft` through `code-nav`'s
`extractOutlineFromTree` when `detectLanguage(file)` is not `typescript`/`javascript`, with one
fixture per language proving a named function yields at least one unit. Craft must be
language-capable **before** it auto-fires, or auto-wiring goes quiet on five of the six languages
harness supports.

Marked `high` deliberately: four skills × six languages, and it is the phase that determines
whether the `[UNVERIFIED]` language-neutral-rubric assumption holds. Per autopilot's ASSESS
routing, `high` pauses for interactive planning rather than auto-planning.

Satisfies criterion 10.

### Phase 3: Autopilot host wiring

<!-- carried from Phase 1 verification -->

**Three verification traps in this phase, found during Phase 1 integration.** Each one makes a
green signal mean less than it appears to:

1. **The barrel check cannot confirm this phase's export.** The root barrel's text is
   `export * from './hooks';` whatever `hooks/index.ts` contains, so adding craft symbols changes
   nothing and `node scripts/generate-core-barrel.mjs --check` keeps printing "up to date". That
   green is not evidence the export landed. Verify through `packages/core/dist/index.d.ts` or a
   root-level import test instead.
2. **`packages/core/src/craft/` IS a `SELECTIVE_EXPORTS` directory; `hooks/` is not.** The repo rule
   "a new core export needs a generator allowlist edit" holds only for selective directories.
   Because this feature is called _craft_, it is easy to apply the `craft/` rule to a file that
   actually lives in `hooks/` and conclude an edit is needed when it is not. Verified: `SKIP_DIRS`
   is `shared, blueprint, craft, adoption, telemetry, parallelization`, and `hooks` is absent, so
   `hooks` is auto-discovered as a star module.
3. **An existing executable doc-contract test will fail, and that failure is correct.**
   `packages/cli/tests/integration/autopilot-skill-hooks.test.ts:171-182` asserts the SKILL.md
   "wired today" set EQUALS the concrete call sites, via a regex alternation matching only
   `resolveSkillHooks|resolveReviewHooksWithCanary`. Adding a craft resolver call site means that
   regex no longer matches and the equality assertion fails. Update the alternation deliberately —
   it is this phase's work, not a flake.

**Required in this phase, carried from Phase 1:** `cli-ergonomics-craft`'s `owns` currently admits
any file type under `cli|commands|cmd|bin`, because `CLI_COMMAND_PATTERN` is a directory pattern
(`/(^|\/)(cli|commands|cmd|bin)\//`) with no extension constraint. Phase 1 removed the
`isProductionSource` filter deliberately — it required `detectLanguage(f) !== null` and so excluded
the `.sh`/`.rb` CLIs that `'any'` exists to serve — but the replacement admits `messages.json` and
`data.yaml`, which are data, not commands. Dispatching a critique at a JSON data file spends prompts
to produce noise, which is exactly the cost this design is budgeting against. Narrow it with a
**data/markup denylist** (`.json`, `.yaml`, `.yml`, `.toml`, `.ini`, `.lock`, `.csv`, `.xml`, plus
assets), never with a language allowlist — an allowlist re-breaks every language outside
`EXTENSION_MAP`, which is the defect this replaced. The widening is pinned by a test today, so the
narrowing must update that test rather than silently satisfy it.

<!-- complexity: medium -->

Export the new symbols from `packages/core/src/hooks/index.ts` and regenerate the root core barrel
via `scripts/generate-core-barrel.mjs`. Wire `harness-autopilot` at `after:REVIEW` and
`after:FINAL_REVIEW`, including the once-per-phase-per-diff rule and the extended denominator
report. Autopilot is the proven host — it already resolves the canary twin at these exact events.

Satisfies criteria 2, 4, 5, 11, 14.

### Phase 4: Code-review host wiring

<!-- complexity: medium -->

Wire `harness-code-review` at `after:mechanical`, including the forward-wired-default note that
keeps a missing craft skill a skip rather than the hard halt that skill's own contract would
otherwise impose. Add the "invoked as a review hook" forwarding sections to the craft SKILL.md
files. Broadens coverage to interactive and CI review; needs Phase 3's dispatch contract settled
first.

### Phase 5: Decision records and documentation

<!-- complexity: low -->

ADRs for D6 (mirror-the-resolver) and D9 (`code-nav` as the craft language seam), plus the D5
amendment paragraph on the canary-hook ADR. Update `docs/reference/`'s skillHooks contract page and
the `AGENTS.md` craft-family section. Records the precedent once the shape has survived two hosts
and six languages.

Phases 1 through 4 each land as their own PR; Phase 5 may ride with Phase 4.
