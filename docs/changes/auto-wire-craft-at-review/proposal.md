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
| `docs-craft`            | PROSE under `docs/**`, or `*.md`, outside `docs/changes/**`     | `'any'` (surface-bound)   |
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

**`docs-craft` owns PROSE, not every file under `docs/`.** `docs/**` holds images, fixtures and data
as well as writing, and a writing critic handed `diagram.png` or `data.json` is a dispatch with
nothing to read — the same failure the capability gate exists to prevent. It is restricted to prose
extensions and carries the `!isTestFile` guard every other surface predicate already had (without
it, `tests/fixtures/README.md` was a docs-craft surface). Relatedly, `.harness/**` joins the
excluded paths: it is machine-generated harness state in every adopter, and without the exclusion
each regeneration of this repo's own comprehension shards (`_module.md`) activated docs-craft on
harness's bookkeeping on literally every review.

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

**The host reads `CraftReviewPlan.files`, and must not re-derive the subset.** `files` is a map from
skill name to that domain's owned, already-normalized file subset, carried on the plan precisely so
criterion 4 is implementable without calling back into the table. Calling `rule.owns()` directly is
unsafe, because the path normalizer is module-private and `owns` is only correct on repo-relative
POSIX paths. Measured on raw VCS output in both directions: `spec-craft.owns(['docs\changes\x\proposal.md'])`
returns `[]` (a false negative — the pattern is `/`-anchored), and worse,
`harness-design-craft.owns(['dist\ui\Button.tsx'])` returns the file (a false **positive**, because
the exclusion patterns are `/`-anchored too) — so a build artifact leaks into a craft run. The plan
normalizes first and excludes it.

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
critique class declarations and skip every method. **Rust emits the same type twice**, once for the `struct` and once for the `impl` block, so Phase 2
must de-duplicate — **by `(kind, qualifiedName)`, with NO line component**. An earlier draft of this
spec said `(kind, name, line)`; that key does not dedup, because the two emissions sit at different
lines. Measured: `class:Cart L5-5` (struct) and `class:Cart L7-9` (impl) give 3 survivors under a
line-bearing key and 2 under `(kind, name)`. The name must be qualified, or `Cart.add` and `Bag.add`
in one file collapse into a single unit.

**The rubric catalogs ARE language-neutral — checked, not assumed.** All seven `code-craft` rubrics
are prose about design, with no TypeScript syntax: `CODE-R001` asks whether a unit speaks in the
domain's vocabulary or in incidental machinery, and cites Beck and Fowler rather than a language.
The two apparent TS hits in a grep are the word "interface" used in its ordinary design sense.
They carry over unchanged.

**But their `appliesToKinds` does not carry over, and this is a real gap.** All seven rubrics
declare `['function','method','class']` or `['function','method']`, and selection is
`rubric.appliesToKinds.includes(kind)`. Go emits `type` for a struct, not `class` (measured above),
so **every Go struct silently receives zero rubrics** — a unit that is extracted, counted and then
critiqued by nothing. That is the exact silent-zero shape this design exists to prevent, arriving
through the rubric selector rather than the language gate.

Phase 2 must therefore normalize symbol kinds across languages (Go `type` -> `class`) or widen
`appliesToKinds`, and must assert the mapping with a per-language fixture that fails when a
language's units select zero rubrics. A count of extracted units is NOT evidence of critique.

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
`already-run` → `project-declared` → `over-budget`

Surface comes first because it is the cheapest and most informative. Capability precedes
availability because D8 is about dispatchability, not installation. Budget is last so a domain that
would have been skipped anyway never consumes a slot — otherwise a not-installed domain silently
displaces an installed one. Every link in this chain is pinned by a test.

**`project-declared` is a planning stage, not a post-filter — and this is load-bearing.** A project
that declares a craft domain in its own `skillHooks` suppresses the default for that domain. The
obvious implementation resolves the plan first and filters the declared domains out of the result,
which is what the canary twin does safely — canary has no budget, so removing a hook afterwards
cannot change which other hooks were chosen. **Here it can.** Slots are scarce, so a domain filtered
out after the loop has already consumed one: the review silently drops to two domains, a third
domain is reported `over-budget` while a slot was in fact free, and the plan claims the declared
domain was `wired` when it never attached. The denominator then lies in both directions. Declared
domains are therefore fed into the resolution as an input, and the budget is the last stage in the
loop.

### Budget

`maxDomains` caps activated domains per review (default 3) in the deterministic `priority` order
declared in `CRAFT_REVIEW_DOMAINS` — not a vague "highest signal first". Each wired hook carries a
`promptBudget`, and craft's own `maxFiles` (default 100) bounds a pathologically large diff.

**The implemented priority order** is: 1 `harness-design-craft`, 2 `code-craft`, 3 `test-craft`,
4 `security-craft`, 5 `naming-craft`, 6 `cli-ergonomics-craft`, 7 `api-craft`, 8 `spec-craft`,
9 `docs-craft`, 10 `knowledge-craft`.

**The cap is PER RESOLUTION, not per diff.** Decided deliberately. Autopilot resolves at two review
moments, so a phase can dispatch up to **2 × `maxDomains`** — measured at 5 on one unchanged diff
(`after:REVIEW` wires design, code, test; `after:FINAL_REVIEW` wires security, naming). An earlier
draft's "never more than 3 domains" was true per call and false per phase; this is the correction.
A host that wants the per-phase guarantee passes the first moment's wired domains as `alreadyRanFor`
at the second (D10 / criterion 11). Per-diff was rejected: this module is pure and cannot carry
state between calls to enforce it, and a per-diff budget would make the second review moment blind
to a domain that genuinely should re-run after the first one's fixes landed.

**The cost is bounded, but WHICH domains run is emergent.** An earlier draft of this section claimed
the worst case was "stated rather than emergent". That is false as written and is corrected here:
`maxDomains` bounds the cost, but which domains you get is a function of the diff shape, and the cap
is binding on ordinary diffs — not only pathological ones. The measured activation matrix at the
default cap of 3, with every craft skill installed:

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
  `claude-code`) **for the two HOST skills only**; the gemini `.toml` regenerates in pre-commit.
  **Measured, correcting this spec's original wording:** `harness-autopilot` and
  `harness-code-review` are symlinks, but all 30 craft mirror directories are REAL COPIES, so a
  craft SKILL.md is edited FOUR times, not once. Phase 4 edited all four copies per skill and added
  a mirror-parity law; the structural fix is in the deferred list below.

### Documentation updates

- `docs/reference/configuration.md` — the `skillHooks` contract page gains a craft auto-wire
  subsection. **Measured, correcting this spec's original wording:** there is no canary detector
  note on that page to sit parallel to. The "Canary detectors auto-wire" note lives in
  `agents/skills/claude-code/harness-autopilot/SKILL.md:91`, and before this phase `configuration.md`
  mentioned canary only as an example config value. The craft subsection is therefore written as the
  FIRST auto-wire note on that page, and says so, rather than claiming a parallel that does not
  exist; its own parenthetical is now the only other mention of canary there.
- `AGENTS.md` — one line: craft fires at review automatically, advisory. **Measured, correcting
  this spec's original wording:** `AGENTS.md` had no craft-family section. Before this phase,
  `grep -i craft AGENTS.md` returned exactly two hits, both the word "Handcrafted" in unrelated
  doc-structure lines (`:121`, `:981`). The line lands in `### Skill Tier System` after the tier
  list, which is where the family is named on that page for the first time — so that grep now
  returns three.
- `harness-autopilot/SKILL.md` — extend the existing denominator-reporting rule to craft domains
  ("craft domains: 2/3 activated, 1 skipped: unsupported-language").

### Architectural decisions

- **D6 (mirror the canary resolver rather than extend the review fan-out)** warrants a standalone
  ADR: it sets the precedent for how every future advisory skill family attaches to a review
  moment, and the rejected alternative mutates a core type union consumed by three modules.
- **D9 (route craft extraction through `code-nav` rather than the TS Compiler API)** warrants a
  standalone ADR: it makes `code-nav` the single language-support seam for the craft family and
  determines where future language support lands.
- **D5 (multi-host resolver)** is recorded as a named note inside the D6 ADR rather than as its own
  record — it generalizes a single host constant to a set. **Measured, correcting this spec's
  original wording ("an amendment paragraph to the canary-hook ADR"): there is no canary-hook ADR to
  amend.** No ADR body names `resolveReviewHooksWithCanary`; the three ADRs that mention canary are
  0039 (cross-ecosystem adapter), 0086 (results artifact) and 0111 (e2e framework), none of them
  about review-hook wiring — 0111 names the file `canary-review-hooks.ts` (`:42`, `:172`) only as an
  inventory item in a list of what canary already integrates. And `docs/changes/canary-review-detectors/`
  holds `plans/` and `provenance.json` but no `proposal.md`. **The canary detector wiring shipped
  with no spec and no ADR**, which is a finding about this repository worth preserving, not merely a
  correction to one sentence: the shape craft mirrors was never itself recorded, and ADR 0136 is the
  first record of it. The in-record-note form follows the precedent of ADR 0135.
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

**Two upstream defects in `packages/core/src/code-nav/` must be fixed first; the parser does NOT
ship working for two of the six languages.** Both were measured, and both sit one layer below where
this spec originally placed its guards — so no `packages/cli` adapter can compensate, because the
node is already gone before `getOutline` returns.

- **Every decorated Python definition is dropped.** tree-sitter-python wraps a decorated `def` or
  `class` in `decorated_definition`, while `TOP_LEVEL_TYPES.python` and `METHOD_TYPES.python` key on
  `function_definition`, now a grandchild. Measured: `class:Decorated` returns `children = 0` with
  its `@staticmethod` method missing, and an `@app.route`-decorated function is absent from
  `symbols` entirely. In idiomatic Python — `@property`, `@dataclass`, `@app.route`,
  `@pytest.fixture` — that is most of the file. **A Flask module whose handlers are all decorated
  extracts zero units and reports a clean pass.** Unwrap via `childForFieldName('definition')`.
- **A Rust `mod` body is never walked.** `mod_item` maps to `variable` and nothing recurses.
  Measured: `variable:tests` with `children = 0`, losing every item inside. `#[test]` is also a
  SIBLING `attribute_item` rather than a child of `function_item`, which is why **test-craft cannot
  support Rust through this seam at all**.

**The phase splits into 2a / 2b / 2c**, because the four skills are not one job:

- **2a (this phase):** the two core gaps, the shared extraction seam, and `code-craft` across all
  six languages.
- **2b:** `naming-craft` and `test-craft`. Both need a semantic layer the structural outline does
  not provide — test-craft must decide which units are _tests_ (Go's `*_test.go` + `func TestX`, and
  Java's `@Test` readable from the method node's `modifiers` child are both tractable; Rust is
  blocked by the attribute measurement above).
- **2c:** `security-craft`, which **is not a seam adopter at all**. It does not extract units: its
  `detectSignals` matches CALL EXPRESSIONS (`child_process.exec`, `jwt.sign`, SQL template
  literals), while `extractSymbols` walks only declaration types. Routing it through the outline
  yields zero signals per non-TS file, and its zero-signal path is skip — **a confident clean
  security report for a Python file**. Real support means per-language signal catalogs plus a
  call-site walk.

**Consequence for the declaration table, decided rather than deferred:** after 2a only `code-craft`
is genuinely multi-language, so `naming-craft`, `security-craft` and `test-craft` narrow to
`['typescript','javascript']` in `CRAFT_REVIEW_DOMAINS`. That makes each declaration honest, which
is the whole point of the Phase 3 subset law; 2b and 2c widen them again as part of their own work.
Blocking Phase 3 until all three land would gate the feature on roughly thirty further tasks for no
gain in correctness.

**A gap in neither the original spec nor the brief: there is no substantiveness filter outside TS.**
The TypeScript extractor bars sub-three-statement bodies; the outline exposes no statement count, so
a one-line function is emitted in all four other languages and seven rubrics fire against it inside
a 100-prompt budget. 2a uses a line-span proxy (`MIN_UNIT_LINES`), which is a proxy and not an
equivalent, and is labelled as such.

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

ADRs for D6 (mirror-the-resolver) and D9 (`code-nav` as the craft language seam), carrying D5 as a
named note inside the D6 record — there is no canary-hook ADR to amend, and the measurement that
established that is in Integration points above. Update `docs/reference/configuration.md`'s
`skillHooks` contract page (as the first auto-wire note there) and add one `AGENTS.md` line under
`### Skill Tier System`. Records the precedent once the shape has survived two hosts and six
languages.

Phases 1 through 4 each land as their own PR; Phase 5 may ride with Phase 4.

## Deferred follow-ups

Everything Phases 1-4 deliberately did not do, parked here so it survives this feature's PR.
Each item carries the measurement that already exists; none is re-derived.

### Craft multi-language extraction

- **Phase 2b — `naming-craft` + `test-craft`** (~14 tasks). Both need a semantic layer the
  structural outline does not provide: test-craft must decide which units are TESTS. Go
  (`*_test.go` + `func TestX`) and Java (`@Test`, readable from the method node's `modifiers`
  child) are tractable; **Rust is blocked at the parser** — `#[test]` is a SIBLING
  `attribute_item`, not a child of `function_item`, so test-craft cannot support Rust through
  this seam at all.
- **Phase 2c — `security-craft`** (~16 tasks). It is **not a seam adopter**. `detectSignals`
  matches CALL EXPRESSIONS (`child_process.exec`, `jwt.sign`, SQL template literals) while
  `extractSymbols` walks only declaration types, so routing it through the outline yields zero
  signals per non-TS file — and its zero-signal path is SKIP, i.e. **a confident clean security
  report for a Python file**. Real support means per-language signal catalogs plus a call-site
  walk.
- Until 2b and 2c land, `naming-craft`, `security-craft` and `test-craft` declare
  `['typescript','javascript']` in `CRAFT_REVIEW_DOMAINS`. That narrow declaration is deliberate;
  widening it belongs to 2b/2c.

### code-nav extraction gaps (measured in the Phase 2a plan)

- **FU-1 — Python nested classes are invisible.** `METHOD_TYPES.python` is
  `['function_definition']` only, so a `class` nested in a class body is never walked. Measured:
  `class Article` containing `class Meta` yields `class:Article[save]` with `Meta` absent
  entirely. That is Django `class Meta` and Pydantic `class Config` — most Django/Pydantic models.
- **FU-2 — Java inner and static nested classes are invisible.** Same shape in
  `TOP_LEVEL_TYPES.java` / `extractMethods`. Measured: `public static class Builder { qty();
build(); }` contributes **zero** units — the Builder pattern, so the most convention-heavy code
  in the file is never critiqued.
- **FU-3 — Python definitions under a conditional produce zero symbols, with NO error.**
  `extractSymbols` walks `rootNode.children` for declaration types; an `if_statement` or
  `try_statement` is neither and nothing recurses into it. Measured with a positive control:
  `if TYPE_CHECKING: def helper(x)` yields no symbols and no error, while the same `def` at top
  level yields `function:helper`. A clean parse returning nothing is the silent-zero shape this
  feature exists to remove, one nesting level deeper than the two gaps Phase 2a fixed.
- **FU-4 — the capability claim is per-LANGUAGE, the capability is per-EXTENSION.**
  `CraftDomainRule.supportedLanguages` is `readonly SupportedLanguage[]` (or the
  `CRAFT_ANY_LANGUAGE` sentinel, for the surface-bound domains that parse no source), but
  extraction is gated per file extension. The `.mts`/`.cts` instance was fixed in Phase 2a and is
  pinned by a law derived from `EXTENSION_MAP`; the granularity mismatch itself remains.
- **FU-5 — surviving units are correct but their names are ambiguous.** A consequence of Phase
  2a's dedup fix, not a regression: two Go methods both report `name=Add`, two Rust functions in
  sibling mods both report `name=f`. The disambiguators exist (the receiver is in
  `symbol.signature`, the mod name is available at the recursion site) but qualifying the NAME
  changes finding identity and prompt text, so it belongs with Phase 2b's naming work.

### Seams that Phases 3 and 4 both recommended

- **Derive `OUTLINE_LANGUAGES` from `ALL_SOURCE_LANGUAGES`.**
  `packages/cli/src/shared/craft/extract/outline-units.ts:45` hand-lists the languages the outline
  seam handles; `packages/core/src/hooks/craft-review-hooks.ts:265` hand-lists the languages a
  domain may declare. A seventh language added to `EXTENSION_MAP` would be auto-declared by the
  second and extract nothing through the first. The Phase 3 subset law **does** catch that — it is
  extension-granular by construction and says so at its own head — and an earlier draft of this
  section claimed the opposite. Measured: adding `'ruby'` + `'.rb'` and rebuilding core reddens it
  with `code-craft declares .rb but the probe has no fixture for it` (1 failed | 46 passed). The
  granularity mismatch is still worth closing, which is why FU-4 stays; it would just not ship
  silently. This is FU-4's fix, and it is Phase 2's seam.
- **Convert the 30 craft platform mirror directories to symlinks.**
  `agents/skills/{cursor,codex,gemini-cli}/<craft-skill>/` are REAL COPIES, while
  `harness-autopilot` and `harness-code-review` are symlinks. `scripts/lib/plugin-config.mjs:38-40`
  still asserts in a comment that the per-platform directories ARE symlink mirrors, which is false
  for the whole craft family. Phase 4 measured that the craft mirrors feed **no generated
  artifact**, so drift there is invisible to `generate:plugin:check` too — the mirror-parity law in
  `packages/cli/tests/integration/craft-skill-review-hook-sections.test.ts` is the only check in
  the repository that can see it. The structural fix belongs in its own change.

### Out of this feature's scope entirely

- **`_wt/` is absent from the graph walker's skip set.**
  `packages/graph/src/ingest/skip-dirs.ts` lists `.git-worktrees` and `.worktrees` (`:108-109`)
  but not `_wt`, which is this repository's own worktree-pool directory. The walker ignores
  `.gitignore`, so a populated pool is walked as if it were first-party source: 292,202 files
  against the repo's own 9,407. It crashes `check-arch`, dominates `harness validate`'s issue
  count, and stack-overflows `duplication.perf` — three checkers, one cause. The fix is one entry
  in `DEFAULT_SKIP_DIRS` beside the two already there; consumers can work around it today via
  `ingest.skipDirs` / `ingest.additionalSkipDirs`, but the repo's own convention should not
  require a workaround. Recorded here rather than filed: it is out of this feature's scope, and
  raising it as an issue is an outward-facing action left to the feature's owner.
