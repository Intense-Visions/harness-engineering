# Plan: Phase 5 — Decision records and documentation

**Date:** 2026-11-13 | **Spec:** `docs/changes/auto-wire-craft-at-review/proposal.md` (Phase 5) |
**Tasks:** 9 | **Time:** ~40 min | **Integration Tier:** medium | **Rigor:** standard |
**Branch:** `feat/auto-wire-craft-at-review` @ `948daddf5`

## Goal

Record the two architectural decisions this feature set, correct the two measured over-promising
sentences under laws that can fail, document the craft auto-wire on the two pages that describe it
to adopters, and park every deferred item where the next reader will find it — so the branch can
go to FINAL_REVIEW with nothing in the spec silently unsatisfied.

## Four findings that changed this plan

Each is a claim about **this repository** that the spec (or the brief) asserts and the repo
refutes. Phases 1-4 produced fifteen of these and not one changed a design decision; these four
are the same shape.

- **F1 — there is no canary-hook ADR.** D5 directs "an amendment paragraph to the canary-hook ADR".
  No such record exists. Verified three ways: no ADR body names `resolveReviewHooksWithCanary` or
  `canary-review-hooks`; the only canary ADRs are 0039 (cross-ecosystem adapter), 0086 (results
  artifact) and 0111 (e2e framework), none about review-hook wiring; and
  `docs/changes/canary-review-detectors/` contains `plans/` and `provenance.json` but **no
  `proposal.md`** — the detector wiring shipped with no spec and no ADR.
  **Resolution:** D5 becomes a named note inside the new D6 ADR, and the D6 ADR records F1 itself.
  Precedent: ADR 0135 documents "the axis-type relocation the spec deliberately records **as a note
  here** rather than as a second ADR."
- **F2 — `docs/reference` has no canary detector note to sit parallel to.** The "Canary detectors
  auto-wire" note lives in `agents/skills/claude-code/harness-autopilot/SKILL.md:91`.
  `docs/reference/configuration.md`'s `skillHooks` section (`:714-822`) mentions canary only as an
  example config value at `:738`. **Resolution:** the craft subsection is written as the _first_
  auto-wire note on that page, and says so, rather than claiming a parallel that does not exist.
- **F3 — `AGENTS.md` has no craft-family section.** `grep -i craft AGENTS.md` returns exactly two
  hits, both the word "Handcrafted" in unrelated doc-structure lines (`:121`, `:981`).
  **Resolution:** the line lands in `### Skill Tier System` after the tier list (`:914`).
- **F4 — the design_craft silent-zero claim is refuted, and the honest defect is different.** The
  brief states that following `files.description` ("a path relative to project root") makes relative
  paths "collect ZERO prompts and report a clean pass". Not for `design_craft`.
  `files -> buildTargetsFromFiles` (`packages/cli/src/mcp/tools/design-craft.ts:287-290`) builds one
  target per entry, and `readSource` (`packages/cli/src/design-craft/phases/critique.ts:155-162`)
  takes the `path.isAbsolute` branch **or** resolves against `process.cwd()`. `runCritique`
  (`:238-252`) has **no try/catch** around it. So a relative entry either works (cwd == project
  root) or throws **ENOENT and fails the call loudly** — it is not a silent zero.
  **Resolution:** the description is still wrong and still dangerous, but by _omission_: it names
  only the form the hosts no longer forward, and says nothing about the absolute form that all 40
  craft SKILL.md sections now instruct hosts to send. Task 4 fixes the description under a derived
  doc law; Task 5 encodes the measurement as a behavioral law instead of asserting a failure mode
  the code does not have.

A fifth, smaller one, which is a plan input rather than a correction: of the ten auto-wired craft
tools, **`design_craft` is the only one whose `files` description makes a path-form claim at all**.
The other nine read "Optional file scope (overrides … discovery)". That asymmetry is what makes
Task 4's law a derived denominator rather than a single-string assertion.

## Observable Truths (Acceptance Criteria)

EARS form. Each names what makes it falsifiable; a green that cannot fail is the failure mode this
feature has now caught five times.

1. The system shall contain an ADR recording D6 at `status: accepted` whose `## Decision` section
   is non-empty when **read back from disk**. _Falsifiable by:_ the read-back itself — `manage_adr
create` has dropped the `decision` field in this repo's history, so trusting the tool's return
   is the known failure. _Positive control:_ the same read asserts `## Consequences` is also
   non-empty, so an empty-file write cannot pass as success.
2. The system shall record D5 as a named note inside that same ADR, together with the F1
   measurement that explains why it is not an amendment. _Falsifiable by:_ the note names
   `CANARY_REVIEW_HOST_SKILL` and `CRAFT_REVIEW_EVENTS_BY_HOST`, the two symbols the
   generalization is about.
3. The system shall contain an ADR recording D9 at `status: accepted`, read back the same way.
4. **Where** `harness-autopilot/SKILL.md` states the `promptBudget` forwarding contract, the system
   shall qualify it with the condition under which a domain accepts one. _Falsifiable by:_ a law
   that reads **every** `promptBudget` occurrence in that file, asserts the cardinality (exactly 2
   — a third unqualified mention reddens it), and derives "which domain accepts none" from
   `getToolDefinitions()`. _Pre-edit control:_ the qualifying clause appears nowhere in that file
   today (it exists only in `harness-code-review/SKILL.md:236`), so the law fails at **both** sites
   on the pre-edit document. Task 3 records that RED output.
5. **If** an auto-wired craft tool's `files` description instructs a path form, **then** the system
   shall not instruct a repo-relative one. _Falsifiable by:_ a law over all ten
   `CRAFT_REVIEW_DOMAINS`, whose denominator is the published table and whose per-domain case reads
   the live `inputSchema`. _Pre-edit control:_ `design_craft`'s case is RED and the other nine are
   GREEN before the fix — written first, so the asymmetry is measured, not asserted.
6. **When** `runCritique` is given an absolute `files` entry, the system shall read the file;
   **when** it is given a relative entry from a working directory that does not contain it, the
   system shall throw rather than return an empty finding set. _Falsifiable by:_ the throw
   assertion — an implementation that swallowed the error would make the first case
   indistinguishable from the second. _Positive control:_ the absolute case asserts a non-zero
   finding count from the same fixture, so "threw for both" cannot pass.
7. The system shall describe the craft auto-wire in `docs/reference/configuration.md`'s `skillHooks`
   section and in one `AGENTS.md` line. _Falsifiable by:_ nothing mechanical — these are prose on
   hand-written pages with no law over them, and this plan says so rather than implying coverage.
8. The changeset shall name `harness-code-review` as a wired host. _Falsifiable by:_ a grep in the
   close-out audit; the file currently names only `harness-autopilot`.
9. The spec shall carry a `## Deferred follow-ups` section listing every item Phases 1-4 deferred,
   each with the measurement that already exists and its exact file path.
10. `harness validate` shall remain byte-identical: **29642 lines, md5
    `4c0efe7709e813065698502570193753`, exit 1** (captured unpiped). _Positive control:_ the line
    count and the md5 are asserted together; a truncated capture changes the count, a changed
    finding changes the md5.

## Pre-phase baseline (measured at planning time, this tree, `948daddf5`)

| Gate                  | Result                                                            |
| --------------------- | ----------------------------------------------------------------- |
| `harness validate`    | 29642 lines, md5 `4c0efe7709e813065698502570193753`, **exit 1**   |
| `harness check-deps`  | 2707 modules, 10 layers, validation passed                        |
| ADR max (local)       | `0135`                                                            |
| ADR max (origin/main) | `0135` — **equal**, so `0136`/`0137` are free as of planning time |

## Uncertainties

- **[ASSUMPTION]** `0136` and `0137` are still free at execution time. ADR numbers race against
  `origin/main` (repo history). Task 1 step 1 re-checks `git ls-tree origin/main` and lets
  `manage_adr` allocate; the numbers in this plan are the expected values, not hard-coded ones.
- **[ASSUMPTION]** `manage_adr create` is worktree-unaware (#1507) but this is the main checkout,
  not a worktree, so the write lands in the right tree. Task 1 step 3 verifies the path anyway.
- **[DEFERRABLE]** Whether `pnpm generate:plugin:all` produces a diff in Task 3. The autopilot
  SKILL.md body IS embedded in `.gemini-extension/commands/autopilot.toml` and
  `.antigravity-extension/commands/autopilot.toml` (measured: both contain `promptBudget`), so a
  diff is expected — unlike the craft SKILL.md files in Phase 4, which regenerated nothing. The
  task does not assert which; it runs the generator and commits whatever it produces, or records
  "no-op" if there is none. **No commit is manufactured for a no-op.**
- **[DEFERRABLE]** `docs/roadmap.md`'s `auto-wire-craft-at-review` row is still `Status: planned`,
  `Assignee: —`. Phases 1-4 all left it that way and it is not in this File Map either. Flagged in
  the handoff for the caller rather than written, because `docs/roadmap.md` live-drifts and a
  format:check failure on it would block a push for reasons unrelated to this phase.

## Four decisions taken, each caller-overridable before execution

| #    | Decision                                                                                                                 | Alternative considered                                      | Why                                                                                                                                   |
| ---- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| P5-a | D5 becomes a named note inside the D6 ADR (F1)                                                                           | A standalone ADR for D5                                     | A one-paragraph record of generalizing one constant to a set is thin; ADR 0135 sets the in-record-note precedent.                     |
| P5-b | The craft section goes in `docs/reference/configuration.md` under `skillHooks`, written as the first auto-wire note (F2) | Also add the missing canary note, to make the parallel real | Adding canary's note is scope creep into another feature's documentation debt.                                                        |
| P5-c | Deferred items go in a `## Deferred follow-ups` section of the spec                                                      | `docs/roadmap.md`                                           | The roadmap live-drifts and trips format:check; the spec is the feature's own durable record and is already the index for Phases 1-4. |
| P5-d | The `_wt/` walker problem is filed as one GitHub issue                                                                   | Deferred-list entry only                                    | It crashes three checkers for one cause and is out of this feature's scope entirely; a list entry inside a craft spec would bury it.  |

## File Map

Every file this phase touches. Task 9 audits the working tree against this list and fails on
anything outside it.

**Hand-edited:**

- CREATE `docs/knowledge/decisions/0136-<slug>.md` (D6 + the D5 note)
- CREATE `docs/knowledge/decisions/0137-<slug>.md` (D9)
- MODIFY `agents/skills/claude-code/harness-autopilot/SKILL.md` (two sites: `:118`, `:334`)
- MODIFY `packages/cli/tests/integration/autopilot-skill-hooks.test.ts` (one new law + record)
- MODIFY `packages/cli/src/mcp/tools/design-craft.ts` (`:189` description)
- MODIFY `packages/cli/tests/integration/craft-skill-review-hook-sections.test.ts` (one new describe + record)
- CREATE `packages/cli/tests/design-craft/phases/files-path-form.test.ts`
- MODIFY `docs/reference/configuration.md` (new `### Craft domains auto-wire` subsection)
- MODIFY `AGENTS.md` (one line in `### Skill Tier System`)
- MODIFY `.changeset/auto-wire-craft-at-review.md` (one paragraph)
- MODIFY `docs/changes/auto-wire-craft-at-review/proposal.md` (new `## Deferred follow-ups` section)
- CREATE `docs/changes/auto-wire-craft-at-review/plans/2026-11-13-decision-records-and-documentation-plan.md` (this plan)

**Generated — never hand-edited; produced by the named command and committed with its task:**

- `.gemini-extension/commands/autopilot.toml`, `.antigravity-extension/commands/autopilot.toml`
  and any sibling the generator touches (Task 3, `pnpm generate:plugin:all`)
- `docs/reference/mcp-tools.md` (Task 4, `pnpm run generate-docs` — `:613` mirrors the
  `design_craft` `files` description verbatim, so the edit is stale-docs-blocking at pre-push
  without this)

**Not touched, deliberately:** `docs/roadmap.md`; `packages/core/src/hooks/craft-review-hooks.ts`
and every other production module — this phase ships **no production code except one MCP schema
description string**.

## Environment constraints (carried, non-negotiable)

- `pnpm turbo build --filter=@harness-engineering/cli...` fails at `dashboard`/`@tailwindcss/oxide`.
  Build `core` and `cli` individually when a build is needed. This phase needs **no** build: the
  only source change is a schema description string, and the tests that read it do so through
  `getToolDefinitions()` from `src`, not `dist`.
- **NEVER** run `harness check-arch --update-baseline`.
- A SKILL.md edit regenerates plugin artifacts (pre-commit also does this and re-stages). The craft
  SKILL.md files regenerate nothing; `harness-autopilot`'s does.
- `harness validate` takes ~5m45s. Prove it **once**, at Task 9.

## Skeleton

1. ADRs — D6 (with the D5 note and the F1 record) and D9 (~2 tasks, ~10 min)
2. Over-promise 1 — autopilot `promptBudget` at two sites, under a derived cardinality law (~1 task, ~5 min)
3. Over-promise 2 — `design_craft` `files` description, under a ten-domain derived law, plus the
   behavioral law that replaces the refuted silent-zero claim (~2 tasks, ~9 min)
4. Documentation — `configuration.md` subsection + one `AGENTS.md` line (~1 task, ~4 min)
5. Changeset — one paragraph (~1 task, ~2 min)
6. Deferred items — spec section + one filed issue (~1 task, ~5 min)
7. Close-out — mutation record, byte-identity proof, file-map audit (~1 task, ~6 min)

**Estimated total:** 9 tasks, ~41 minutes. _Skeleton produced per standard rigor (>= 8 tasks).
Presented to the caller with the four decisions above; expanded on the recommended defaults, each
of which is reversible before execution._

## Tasks

### Task 1: ADR for D6 — mirror the resolver — carrying the D5 note and the F1 record

**Depends on:** none | **Files:** `docs/knowledge/decisions/0136-<slug>.md` | **Owns:** `docs/knowledge/decisions/**`

1. Re-check the number is still free (it races against `origin/main`):

   ```bash
   git fetch origin main -q
   git ls-tree origin/main --name-only docs/knowledge/decisions/ | grep -oE '^docs/knowledge/decisions/[0-9]{4}' | sort | tail -1
   ls docs/knowledge/decisions/ | grep -oE '^[0-9]{4}' | sort | tail -1
   ```

   Both printed `0135` at planning time. If either is higher, do **not** hard-code a number —
   `manage_adr create` allocates `max(existing)+1` itself. Record the number it returns.

2. Call `manage_adr` with:
   - `path`: the repo root
   - `action`: `create`
   - `title`: `Advisory skill families attach at a review moment by mirroring the review-hook resolver, not by extending the review fan-out`
   - `status`: `accepted`
   - `tier`: `medium`
   - `date`: `2026-11-13`
   - `source`: `docs/changes/auto-wire-craft-at-review/proposal.md`
   - `slug`: `advisory-families-mirror-the-review-hook-resolver`
   - `context`:

     ```
     Harness had exactly one way to add a reviewer at a review moment: the `skillHooks` framework,
     plus the canary detector resolver (`packages/core/src/hooks/canary-review-hooks.ts`) layered
     on top of it as a zero-config default. The eleven `-craft` skills needed the same attachment,
     and there were two ways to build it.

     The rejected alternative was to extend the existing review fan-out. `ConditionalSubagent`
     (`packages/core/src/review/depth-calibrator.ts:16`) is the union of conditionally-activated
     reviewers — today `'adversarial' | 'typescript-strict' | 'frontend-races'`. It is consumed by
     `fan-out.ts`, by `pipeline-orchestrator.ts:311`, and by the review finding schema. Adding ten
     craft domains to it would have mutated a type that gates every review in the product, and
     every consumer of that type would have had to learn that some members of the union do not
     count toward severity. Craft output is ADVISORY — surfaced, never blocking, never counted
     (spec D2). Advisory output does not justify mutating the code that gates every review.

     Measured while writing this record, and worth stating because the spec assumed otherwise: NO
     ADR documents the canary resolver this decision mirrors. No ADR body names
     `resolveReviewHooksWithCanary` or `canary-review-hooks`; the three canary ADRs are 0039
     (cross-ecosystem adapter), 0086 (results from a documented artifact) and 0111 (e2e framework),
     none about review-hook wiring; and `docs/changes/canary-review-detectors/` holds `plans/` and
     `provenance.json` but no `proposal.md`. The shape being mirrored here was therefore never
     recorded. This record is the first, which is also why the D5 note below lands here rather
     than as the amendment the spec directed.
     ```

   - `decision`: (see the exact text in step 2b below — pass it as one string)
   - `consequences`:

     ```
     - Every future advisory skill family attaches the same way: a sibling module in
       `packages/core/src/hooks/`, a resolver that returns exactly `resolveSkillHooks(...)` when
       nothing activates, and a host that calls it alongside the hooks it already resolves. The
       review fan-out and its severity accounting are untouched, so adding a family cannot change
       what a review blocks on.
     - The cost is two resolvers with parallel structure that must not drift. Phase 4 already paid
       down the first instance of that drift by extracting the shared skill-availability module
       both resolvers now use, removing a byte-identical triple of private helpers and an
       unreachable predicate clause.
     - Because craft never enters `ConditionalSubagent`, a craft finding can never be mistaken for
       a blocking reviewer finding by a consumer that only knows the union. The corollary obligation
       is on the hosts: `harness-code-review`'s SKILL.md states that craft findings must never enter
       the mechanical exclusion set, because a craft taste judgment at `file:line` discarding a real
       reviewer finding at the same `file:line` would be a false green manufactured by this wiring.
     - A third host is now a map entry rather than a code change, which is the point of the D5 note.
     ```

2b. The `decision` string, verbatim:

```
Mirror the canary resolver. `packages/core/src/hooks/craft-review-hooks.ts` is a direct sibling
of `canary-review-hooks.ts`: pure, IO-free, inert until a host calls it. It publishes
`CRAFT_REVIEW_DOMAINS` (the domain table), `planCraftReviewDomains` (the diff-driven,
capability-gated activation plan) and `resolveReviewHooksWithCraft` (the resolver a host calls
in place of `resolveSkillHooks`). Dispatch stays in the consuming skills' prose; the module only
normalizes and resolves.

The no-regression guarantee is the contract that makes the mirror safe:
`resolveReviewHooksWithCraft` with no craft domain activated returns exactly
`resolveSkillHooks(...)`. A project that installs no craft skill, or whose diff touches nothing
a domain owns, gets byte-identical behaviour to before this feature existed.

NOTE — D5, the multi-host generalization, recorded here rather than as its own record. The
canary twin hardcodes a single host: `CANARY_REVIEW_HOST_SKILL = 'harness-autopilot'`
(`canary-review-hooks.ts:79`), consulted at `:214` as `if (skillName !== CANARY_REVIEW_HOST_SKILL)
return configured;`. Craft generalizes that constant to a set: `CRAFT_REVIEW_EVENTS_BY_HOST`
(`craft-review-hooks.ts:141`), a host -> events map, so `harness-autopilot` (at `after:REVIEW`
and `after:FINAL_REVIEW`) and `harness-code-review` (at `after:mechanical`) are both first-class
and a third host is a map entry. Autopilot-only would have missed interactive and CI review —
and UI work, the motivating case, often does not run through autopilot.

The spec (D5) directed this as an amendment paragraph to "the canary-hook ADR". There is no such
ADR; see the measurement in Context. Recording it as a named note inside the record that DOES
describe the resolver shape follows the precedent set by ADR 0135, which documents a relocation
"as a note here rather than as a second ADR".
```

3. **Read the record back from disk.** Do not trust the tool's return — `manage_adr create` has
   dropped the `decision` field in this repo's history:

   ```bash
   N=<the number manage_adr allocated>
   F=$(ls docs/knowledge/decisions/${N}-*.md)
   echo "FILE=$F"
   head -10 "$F"
   for S in Context Decision Consequences; do
     printf '%s: %s lines\n' "$S" "$(awk -v s="## $S" 'index($0,s)==1{f=1;next} /^## /{f=0} f&&NF' "$F" | wc -l)"
   done
   grep -c 'CANARY_REVIEW_HOST_SKILL\|CRAFT_REVIEW_EVENTS_BY_HOST' "$F"
   ```

   **Gate:** all three section line-counts > 0 (the Consequences count is the positive control — an
   empty write would show `0` for all three, which is distinguishable from a dropped `Decision`
   only because all three are printed), and the symbol grep >= 2. If `## Decision` is empty, recover
   with `manage_adr` `action: update`, `ref: <N>`, `body: <the whole markdown body verbatim>` and
   re-run this step.

4. `npx prettier --write "$F" && npx prettier --check "$F"`
5. Commit: `docs(adr): record that advisory skill families mirror the review-hook resolver (D6, D5)`

### Task 2: ADR for D9 — code-nav is the craft family's language-support seam

**Depends on:** Task 1 | **Files:** `docs/knowledge/decisions/0137-<slug>.md` | **Owns:** `docs/knowledge/decisions/**`

1. Call `manage_adr` with:
   - `action`: `create`, `status`: `accepted`, `tier`: `medium`, `date`: `2026-11-13`
   - `source`: `docs/changes/auto-wire-craft-at-review/proposal.md`
   - `slug`: `code-nav-is-the-craft-language-support-seam`
   - `title`: `Craft unit extraction routes through code-nav, making it the craft family's single language-support seam`
   - `context`:

     ```
     Craft reached for the TypeScript Compiler API directly, so every craft domain was a
     TypeScript-only critic in a product whose parsing stack already shipped six languages:
     `SupportedLanguage` is `typescript | javascript | python | go | rust | java`
     (`packages/core/src/code-nav/types.ts:4`). Auto-wiring craft at the review moment made that
     anomaly load-bearing. A domain that cannot read the changed files returns an empty finding
     set, and an empty finding set is indistinguishable from "this code is fine" — the exact
     silent-zero shape this feature exists to remove. Five of six languages would have gone quiet.

     The alternative was to widen craft's own TS-Compiler-API extractor per language. That means
     craft owning a parser per language, duplicating what `code-nav` already does, and diverging
     from `code_outline` / `code_search` / `code_unfold` on what a "unit" is.

     Routing through `code-nav` also surfaced two defects one layer BELOW where the spec had placed
     its guards, which is itself an argument for the seam: no `packages/cli` adapter could have
     compensated, because the node was already gone before `getOutline` returned. Every decorated
     Python definition was dropped (tree-sitter wraps a decorated `def`/`class` in
     `decorated_definition`, while `TOP_LEVEL_TYPES.python` keyed on `function_definition`, now a
     grandchild) — a Flask module whose handlers are all `@app.route`-decorated extracted ZERO
     units and reported a clean pass. And a Rust `mod` body was never walked. Both are fixed, and
     the fixes benefit `code_outline` and `code_search` as well, which a craft-local parser would
     not have.
     ```

   - `decision`:

     ```
     `code-nav` is the craft family's single language-support seam. The shared extraction path
     (`packages/cli/src/shared/craft/extract/outline-units.ts`) routes a craft domain through
     `code-nav`'s outline when `detectLanguage(file)` is not `typescript`/`javascript`, and a new
     language is added by teaching `code-nav`, not by teaching craft.

     The seam is not free and the record states its two known edges rather than implying parity
     with the TypeScript extractor:

     - There is no substantiveness filter outside TypeScript. The TS extractor bars
       sub-three-statement bodies; the outline exposes no statement count. The shared seam uses a
       line-span proxy (`MIN_UNIT_LINES`), which is a proxy and not an equivalent.
     - Not every craft domain is a seam adopter. `security-craft` does NOT extract units: its
       `detectSignals` matches CALL EXPRESSIONS while `extractSymbols` walks only declaration
       types, so routing it through the outline yields zero signals per non-TS file — and its
       zero-signal path is SKIP, i.e. a confident clean security report for a Python file. Real
       support means per-language signal catalogs plus a call-site walk, which is why 2c is a
       separate piece of work and why `security-craft` narrowed its declared languages to
       `['typescript','javascript']` rather than claiming six.

     Declared capability must track actual capability: a domain declares only the languages it can
     genuinely extract from, and a law derived from `EXTENSION_MAP` pins the TS/JS extension set.
     After 2a only `code-craft` is genuinely multi-language, so `naming-craft`, `security-craft`
     and `test-craft` narrowed their declarations. An honest narrow declaration is the point; an
     optimistic wide one reintroduces the silent zero this seam exists to remove.
     ```

   - `consequences`:

     ```
     - A seventh language added to `code-nav`'s `EXTENSION_MAP` reaches every seam-adopting craft
       domain at once, instead of six separate parser additions.
     - The granularity mismatch is now the known weak point and is recorded as a follow-up rather
       than claimed as solved: `CraftDomainRule.supportedLanguages` is per-LANGUAGE while
       extraction is gated per EXTENSION, so a seventh language would be auto-declared by
       `ALL_SOURCE_LANGUAGES` (`packages/core/src/hooks/craft-review-hooks.ts:265`) and extract
       nothing, and the subset law compares at language granularity so it would not catch that.
       Deriving `OUTLINE_LANGUAGES` (`packages/cli/src/shared/craft/extract/outline-units.ts:45`)
       from `ALL_SOURCE_LANGUAGES` closes it; Phases 3 and 4 both recommended it.
     - `code_unfold` sees strictly more symbols, but it is not a pure gain and the change log says
       so: lookup is first-match-wins over the outline, so in a Rust file where a `mod`-nested name
       shadows a top-level one, `code_unfold` now resolves to whichever is EARLIER IN THE FILE.
       That resolution rule is pinned by a test rather than left incidental.
     - Craft inherits `code-nav`'s blind spots. Python nested classes (`class Meta`, `class
       Config`), Java inner and static nested classes (the whole Builder pattern), and Python
       definitions under `if TYPE_CHECKING:` are all invisible today — the last producing zero
       symbols with NO error. They are recorded as FU-1, FU-2 and FU-3 in the spec's deferred list.
     ```

2. Read the record back from disk exactly as in Task 1 step 3 (same three-section gate; symbol grep
   is `code-nav\|MIN_UNIT_LINES` instead).
3. `npx prettier --write` + `--check` the new file.
4. Commit: `docs(adr): record code-nav as the craft family's language-support seam (D9)`

### Task 3: Qualify both `promptBudget` over-promises in harness-autopilot, under a derived cardinality law

**Depends on:** none | **Files:** `packages/cli/tests/integration/autopilot-skill-hooks.test.ts`, `agents/skills/claude-code/harness-autopilot/SKILL.md` | **Owns:** `agents/skills/claude-code/harness-autopilot/**`

The law is written and run FIRST, against the unedited document, because "would this assertion have
failed before the fix?" is the only thing that separates a law from a fixture — and Phase 4 found a
craft assertion that could not fail precisely because it was never evaluated that way.

1. Widen the imports at the top of `packages/cli/tests/integration/autopilot-skill-hooks.test.ts`:

   ```ts
   import { CRAFT_REVIEW_EVENTS_BY_HOST, CRAFT_REVIEW_DOMAINS } from '@harness-engineering/core';
   import { getToolDefinitions } from '../../src/mcp/server';
   ```

2. Append this case inside the **first** describe block (`harness-autopilot documents the general
skillHooks framework (#1481)`), immediately after `it('names craft in both review steps, …')`,
   so it shares that block's `md`:

   ```ts
   it('qualifies EVERY promptBudget forwarding claim — design_craft accepts none', () => {
     // DERIVED from the schemas, never a hand table: the domain that accepts no
     // promptBudget is read from the live tool definitions, so adding one to
     // design_craft's schema reddens this and forces the prose to follow.
     const TOOLS = new Map(getToolDefinitions().map((t) => [t.name, t]));
     const without = CRAFT_REVIEW_DOMAINS.map((d) =>
       d.skill.replace(/^harness-/, '').replace(/-/g, '_')
     ).filter((name) => {
       const schema = TOOLS.get(name)!.inputSchema as { properties?: Record<string, unknown> };
       return !Object.prototype.hasOwnProperty.call(schema.properties ?? {}, 'promptBudget');
     });
     expect(without).toEqual(['design_craft']);

     const lines = md.split('\n');
     const sites = lines
       .map((line, i) => ({ line, n: i + 1 }))
       .filter(({ line }) => line.includes('promptBudget'));
     // CARDINALITY CONTROL. A per-site loop only visits what it finds, so a
     // THIRD unqualified mention added later would slip past it silently.
     expect(sites.map((s) => s.n)).toHaveLength(2);

     for (const { n } of sites) {
       // The claim's own sentence. This file wraps prose at ~100 cols, so a
       // clause can land on an adjacent line. VACUITY CHECKED: the qualifier
       // appears NOWHERE in this file pre-edit (it exists only in
       // harness-code-review/SKILL.md:236), so no surrounding prose can
       // satisfy a window of this width.
       const window = lines.slice(Math.max(0, n - 2), n + 3).join(' ');
       expect(window, `harness-autopilot/SKILL.md:${n} states promptBudget unqualified`).toMatch(
         /where that domain(?:'|’)s MCP tool accepts one/
       );
       expect(window, `harness-autopilot/SKILL.md:${n} does not name the exception`).toMatch(
         /design_craft/
       );
     }
   });
   ```

3. **Record the pre-edit vacuity control** — run the law against the unedited SKILL.md and keep the
   output:

   ```bash
   grep -c "where that domain" agents/skills/claude-code/harness-autopilot/SKILL.md   # expect 0
   npx vitest run packages/cli/tests/integration/autopilot-skill-hooks.test.ts 2>&1 | tail -30
   ```

   **Gate:** this new case is RED, and the failure message names one of the two line numbers. If it
   is GREEN, the window is being satisfied by prose that was already there — stop and narrow it.
   Everything else in the file (24 cases) must stay GREEN; a wider failure means the import change
   broke something unrelated.

4. Apply both edits with an exact-string replacement (not `sed` — the text contains backticks and
   `**`):

   ```bash
   python3 - <<'PY'
   import pathlib
   p = pathlib.Path('agents/skills/claude-code/harness-autopilot/SKILL.md')
   s = p.read_text()

   old1 = "  argument together with a `promptBudget`. `plan.files` holds **repo-relative POSIX** paths; the\n"
   new1 = ("  argument, together with a `promptBudget` where that domain's MCP tool accepts one (see each\n"
           "  craft skill's \"Invoked as a review hook\" section; `mcp__harness__design_craft` does not).\n"
           "  `plan.files` holds **repo-relative POSIX** paths; the\n")
   assert s.count(old1) == 1, f"site 1 anchor matched {s.count(old1)} times"
   s = s.replace(old1, new1)

   old2 = "reviewer with its own `plan.files[skill]` **resolved to absolute paths** plus a `promptBudget`, and\n"
   new2 = ("reviewer with its own `plan.files[skill]` **resolved to absolute paths**, plus a `promptBudget`\n"
           "where that domain's MCP tool accepts one (`mcp__harness__design_craft` does not), and\n")
   assert s.count(old2) == 1, f"site 2 anchor matched {s.count(old2)} times"
   s = s.replace(old2, new2)

   p.write_text(s)
   print("both sites rewritten")
   PY
   ```

   The two `assert … == 1` lines are the point: an anchor that matches zero or two times means the
   document moved under the plan, and the script refuses rather than silently editing the wrong
   place.

5. Re-run the law — expect **25 passed**:

   ```bash
   npx vitest run packages/cli/tests/integration/autopilot-skill-hooks.test.ts 2>&1 | tail -10
   grep -n "promptBudget" agents/skills/claude-code/harness-autopilot/SKILL.md
   ```

   **Gate:** exactly two `promptBudget` lines remain, and the file is 25/25.

6. Regenerate the plugin artifacts that embed this SKILL.md body:

   ```bash
   pnpm generate:plugin:all
   pnpm generate:plugin:check
   git status --short
   ```

   A diff **is expected** here (measured at planning time: `.gemini-extension/commands/autopilot.toml`
   and `.antigravity-extension/commands/autopilot.toml` both contain `promptBudget`), unlike the
   craft SKILL.md files in Phase 4 which regenerated nothing. Record what actually changed. If it is
   a no-op, say so — **do not manufacture a commit for a no-op**.

7. `npx prettier --write` then `--check` on the two hand-edited files.
8. Commit: `docs(autopilot): qualify the promptBudget forwarding claim at both sites`

### Task 4: Correct design_craft's `files` description, under a ten-domain derived law

**Depends on:** none | **Files:** `packages/cli/tests/integration/craft-skill-review-hook-sections.test.ts`, `packages/cli/src/mcp/tools/design-craft.ts` | **Owns:** `packages/cli/src/mcp/tools/design-craft.ts`

Measured input: of the ten auto-wired craft tools, `design_craft` is the **only** one whose `files`
description makes a path-form claim at all. The other nine read "Optional file scope (overrides …
discovery)". That asymmetry is what makes this a denominator law instead of one string assertion.

1. Append this describe block to the **end** of
   `packages/cli/tests/integration/craft-skill-review-hook-sections.test.ts` (it reuses that file's
   module-scope `DOMAINS`, `TOOLS` and `toolNameFor`, all already defined there):

   ```ts
   // Phase 5. Every review host is now documented to forward ABSOLUTE paths —
   // Phase 3 and Phase 4 wrote that into both hosts' SKILL.md and into all 40
   // craft "Invoked as a review hook" sections. A tool schema that still
   // instructs "relative to project root" contradicts the instruction its own
   // callers are given, inside the schema the caller reads.
   describe('no auto-wired craft tool instructs a repo-relative `files` path form', () => {
     it('[denominator] every auto-wired domain exposes a `files` property with a description', () => {
       // Without this, a domain whose schema lost `files` would make its case
       // below throw on undefined rather than report a missing contract — and a
       // zero-length DOMAINS would make the whole block vacuously green.
       expect(DOMAINS.length).toBeGreaterThan(0);
       for (const skill of DOMAINS) {
         const name = toolNameFor(skill);
         const props = (TOOLS.get(name)!.inputSchema as { properties?: Record<string, unknown> })
           .properties;
         expect(Object.keys(props ?? {}), `${name} must expose a files property`).toContain(
           'files'
         );
       }
     });

     for (const skill of DOMAINS) {
       it(`${skill}: its \`files\` description does not instruct a repo-relative path`, () => {
         const props = (
           TOOLS.get(toolNameFor(skill))!.inputSchema as {
             properties?: Record<string, { description?: string }>;
           }
         ).properties!;
         const description = props.files.description ?? '';
         // VACUITY CONTROL: an empty description trivially satisfies a
         // `not.toMatch`, so the absence assertion needs a presence one beside it.
         expect(
           description.length,
           `${toolNameFor(skill)}: files has no description`
         ).toBeGreaterThan(0);
         expect(description).not.toMatch(/relative to (?:the )?project root/i);
       });
     }
   });
   ```

2. **Record the pre-edit control** — run it before touching the schema:

   ```bash
   npx vitest run packages/cli/tests/integration/craft-skill-review-hook-sections.test.ts 2>&1 | tail -25
   ```

   **Gate:** exactly **one** new case RED (`harness-design-craft`), the other nine new cases and the
   new denominator GREEN, and all 31 pre-existing cases GREEN. One RED out of ten is the
   measurement; ten RED would mean the regex is wrong, zero RED would mean the law cannot fail.

3. Edit `packages/cli/src/mcp/tools/design-craft.ts:189`. Replace:

   ```ts
         description: 'Optional file scoping. Each entry is a path relative to project root.',
   ```

   with:

   ```ts
         description:
           'Optional file scoping. Absolute paths are accepted and are what the review hosts ' +
           'forward; a relative entry is resolved against the process working directory.',
   ```

   The new wording states what Task 5 measures, and nothing it does not: `readSource` takes the
   `path.isAbsolute` branch, else resolves against `process.cwd()`. It deliberately does **not**
   claim a silent-zero failure mode, because `runCritique` has no try/catch and therefore throws.

4. Re-run the law — expect **41 passed** (31 pre-existing + 10 new + 1 denominator = 42; confirm the
   actual total from the runner output rather than this arithmetic and record it).

5. Regenerate the reference docs — `docs/reference/mcp-tools.md:613` mirrors this description
   verbatim, and pre-push blocks on stale reference docs:

   ```bash
   pnpm run generate-docs
   git diff --stat docs/reference/
   grep -n "Optional file scoping" docs/reference/mcp-tools.md
   ```

   **Gate:** `mcp-tools.md` now carries the new wording. If `generate-docs` produced nothing, the
   doc is stale by a different mechanism — stop and investigate rather than committing.

6. `npx prettier --write` then `--check` on the three changed files.
7. Commit: `fix(mcp): design_craft files description names the absolute form hosts forward`

### Task 5: Encode the path-form measurement as a behavioral law

**Depends on:** Task 4 | **Files:** `packages/cli/tests/design-craft/phases/files-path-form.test.ts` | **Owns:** `packages/cli/tests/design-craft/**`

This is the honest replacement for the refuted silent-zero claim (F4). The brief asserted that a
relative entry "collects ZERO prompts and reports a clean pass"; `design_craft` throws instead. The
law asserts **both** halves, because asserting only the throw would be satisfied by an
implementation that threw for every input.

1. Create `packages/cli/tests/design-craft/phases/files-path-form.test.ts`:

   ```ts
   // packages/cli/tests/design-craft/phases/files-path-form.test.ts
   //
   // Phase 5. The MEASUREMENT behind the design_craft `files` description
   // change, encoded as a law rather than relayed as a claim.
   //
   // The brief asserted that following the old description ("a path relative to
   // project root") makes a run collect ZERO prompts and report a clean pass.
   // That is the measured behaviour of OTHER craft collectors; it is not what
   // design_craft does. `files` becomes one CritiqueTarget per entry
   // (src/mcp/tools/design-craft.ts:287-290); readSource
   // (src/design-craft/phases/critique.ts:155-162) takes the path.isAbsolute
   // branch, else resolves against process.cwd(); and runCritique (:238-252)
   // has NO try/catch around it. So a relative entry either works (cwd ==
   // project root) or THROWS. The description was wrong by omission, not by
   // silent zero, and this file is why that sentence can be trusted.
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'node:fs';
   import * as os from 'node:os';
   import * as path from 'node:path';
   import { runCritique } from '../../../src/design-craft/phases/critique.js';
   import { hierarchyClarityRubric } from '../../../src/design-craft/catalog/rubrics/hierarchy-clarity.js';
   import { MockLlmProvider } from '../../../src/shared/craft/llm/provider.js';

   describe('design_craft `files` path forms', () => {
     let dir: string;
     let absolute: string;

     beforeEach(() => {
       dir = fs.mkdtempSync(path.join(os.tmpdir(), 'design-craft-path-form-'));
       absolute = path.join(dir, 'Button.tsx');
       fs.writeFileSync(absolute, 'export const Button = () => <button>Go</button>;\n', 'utf8');
     });

     afterEach(() => {
       fs.rmSync(dir, { recursive: true, force: true });
     });

     it('reads an ABSOLUTE entry — the form every review host is documented to forward', async () => {
       const findings = await runCritique({
         targets: [{ file: absolute }],
         rubrics: [hierarchyClarityRubric],
         provider: new MockLlmProvider(),
       });
       // POSITIVE CONTROL for the throw below. Without it, "it threw" is
       // satisfied by an implementation that throws for BOTH path forms.
       expect(findings).toHaveLength(1);
     });

     it('THROWS on an entry relative to a root that is not the process cwd — it does not return an empty finding set', async () => {
       const relativeToAnotherRoot = path.relative(os.tmpdir(), absolute);
       // The probe is genuinely relative...
       expect(path.isAbsolute(relativeToAnotherRoot)).toBe(false);
       // ...and genuinely unresolvable from here, so the throw below is about
       // the path form and not about a file that happens to be missing.
       expect(fs.existsSync(path.resolve(process.cwd(), relativeToAnotherRoot))).toBe(false);

       await expect(
         runCritique({
           targets: [{ file: relativeToAnotherRoot }],
           rubrics: [hierarchyClarityRubric],
           provider: new MockLlmProvider(),
         })
       ).rejects.toThrow(/ENOENT/);
     });
   });
   ```

2. Run it:

   ```bash
   npx vitest run packages/cli/tests/design-craft/phases/files-path-form.test.ts 2>&1 | tail -15
   ```

   **Gate:** 2 passed. If the second case passes with an empty finding array instead of a throw, the
   brief was right and F4 is wrong — **stop and report**, because the description wording from
   Task 4 would then be understating the hazard.

3. `npx prettier --write` then `--check` the new file.
4. Commit: `test(design-craft): pin the files path-form contract (absolute reads, relative throws)`

### Task 6: Document the craft auto-wire in the configuration reference and AGENTS.md

**Depends on:** none | **Files:** `docs/reference/configuration.md`, `AGENTS.md` | **Owns:** `docs/reference/configuration.md`

**No law covers this task.** These are prose additions to two hand-written pages with no executable
contract over either, and this plan says so rather than implying coverage. The only mechanical
check is `prettier --check` and the `git diff --exit-code docs/reference/` freshness gate inside
`generate-docs`, neither of which can see whether the prose is true.

`docs/reference/configuration.md` is **hand-written** despite its directory: `scripts/generate-docs.mjs`
writes only `skills-catalog.md`, `cli-commands.md` and `mcp-tools.md`, then runs
`prettier --write docs/reference/*.md` across the directory. So editing it is safe, but it must be
prettier-clean or the freshness gate fails on an unrelated file.

1. Insert this subsection into `docs/reference/configuration.md` immediately **after** the
   `### Reference consumers` block (which ends at `:822`) and **before** `## \`integrations\``
(`:823`):

   ````markdown
   ### Craft domains auto-wire (default, zero-config, advisory)

   The `-craft` skills are the project's ceiling layer, and both wired consumers resolve
   them automatically at their review moments — `harness-autopilot` at `after:REVIEW` and
   `after:FINAL_REVIEW`, `harness-code-review` at `after:mechanical`. This needs **no
   `skillHooks` entry**: it is an additional default layer resolved by
   `resolveReviewHooksWithCraft` from `@harness-engineering/core`, and a project in which
   nothing activates gets byte-identical behaviour to `resolveSkillHooks` alone.

   (Canary's deterministic test detectors auto-wire the same way at autopilot's two review
   events. That layer is documented in `harness-autopilot`'s SKILL.md rather than here, so
   this is the first auto-wire note on this page rather than a second one.)

   - **Activation reads the DIFF, never a discovery walk.** A domain activates when the
     changed files include a surface it owns **and** — for the domains that parse source
     into units — a language it can actually extract from. A domain that cannot read the
     changed files is reported as an explicit skip, never as an empty finding set, because
     an empty finding set is indistinguishable from "this code is fine".
   - **Findings are ADVISORY.** They are surfaced in the review report and never contribute
     to the `error`/`warn` severity counts, never gate a phase, and never enter
     `harness-code-review`'s mechanical exclusion set.
   - **A missing craft skill is a SKIP, not a hard halt.** The hard-halt rule above is
     reserved for hooks a project declared. A harness-supplied default that is not installed
     is reported in `skipped` with reason `not-installed`, and the review continues.
   - **The denominator is always reported** — `craft domains: 2/3 activated, 1 skipped:
   unsupported-language` — so a surprising `0/M` renders as `0/M` rather than as silence.
   - **Parking a domain uses the existing switch.** Declaring a domain explicitly also
     suppresses the default for it, so a domain is never wired twice:

   ```jsonc
   {
     "skillHooks": {
       "harness-code-review": {
         "after:mechanical": [{ "type": "skill", "skill": "docs-craft", "enabled": false }],
       },
     },
   }
   ```
   ````

2. Insert this bullet into `AGENTS.md` immediately after the `- **Internal (6 skills):** …` line
   (`:914`), inside `### Skill Tier System`. Measured: `AGENTS.md` has no craft-family section at
   all — `grep -i craft AGENTS.md` returns two hits, both the word "Handcrafted" in unrelated
   doc-structure lines — so this is where the family gets named for the first time:

   ```markdown
   - **The `-craft` family (11 skills, Tier 3):** the ceiling layer — LLM-judgment critique above the rule-based floor. Ten of them **auto-wire at the review moment** (`harness-autopilot` at `after:REVIEW` / `after:FINAL_REVIEW`, `harness-code-review` at `after:mechanical`) through `resolveReviewHooksWithCraft` (`packages/core/src/hooks/craft-review-hooks.ts`). Activation is diff-driven and capability-gated; findings are **advisory** — never blocking, never counted toward review severity. Zero config; park a domain with `skillHooks` + `"enabled": false`. See [`docs/reference/configuration.md`](./docs/reference/configuration.md) → `skillHooks` → "Craft domains auto-wire".
   ```

3. Verify the insertion points landed where intended and the reference-doc freshness gate still
   passes:

   ```bash
   sed -n '/^### Craft domains auto-wire/,/^## /p' docs/reference/configuration.md | head -5
   grep -n "craft" AGENTS.md | head
   npx prettier --write docs/reference/configuration.md AGENTS.md
   npx prettier --check docs/reference/configuration.md AGENTS.md
   pnpm run generate-docs && git status --short docs/reference/
   ```

   **Gate:** `generate-docs` leaves `configuration.md` unchanged beyond the edit (it only
   prettier-formats this file), and `git status` shows no OTHER `docs/reference/` file dirty. A
   dirty sibling means the generated docs were already stale and that is a separate problem.

4. Commit: `docs(craft): document the review-moment auto-wire in the configuration reference and AGENTS.md`

### Task 7: Name harness-code-review as the second wired host in the changeset

**Depends on:** none | **Files:** `.changeset/auto-wire-craft-at-review.md` | **Owns:** `.changeset/**`

The changeset currently describes `harness-autopilot` as the wired host. Phase 4 wired
`harness-code-review` too, and the changeset is the only artifact an adopter reads at upgrade time.

1. Insert this paragraph immediately **after** the existing `harness-autopilot now resolves those
domains…` paragraph and **before** the `security-craft` paragraph:

   ```markdown
   `harness-code-review` is the second wired host, at its `after:mechanical` event, so craft reaches
   interactive and CI review and not only autopilot runs. Its SKILL.md records the four claims an
   implementer cannot infer from the resolver: the timing asymmetry (craft resolves BEFORE the AI
   fan-out here, AFTER the review under autopilot), the hard-halt EXCEPTION that keeps a missing craft
   default a skip rather than the halt this skill's own contract would otherwise impose, the rule that
   craft findings must never enter the mechanical exclusion set — a craft taste judgment at `file:line`
   discarding a reviewer's real finding at the same `file:line` would be a false green manufactured by
   this very wiring — and the same ABSOLUTE-path forwarding requirement. All ten auto-wired craft
   skills now carry an "Invoked as a review hook" section stating the contract they are invoked under,
   including whether their own MCP tool accepts a `promptBudget`: `design_craft` does not, so the
   uniform "files plus promptBudget" claim was false for the priority-1 domain and is now qualified
   wherever it appears.
   ```

2. `npx prettier --write .changeset/auto-wire-craft-at-review.md && npx prettier --check .changeset/auto-wire-craft-at-review.md`

   The changeset frontmatter is unchanged — both packages are already `minor` and this phase adds no
   new package.

3. Verify:

   ```bash
   grep -c "harness-code-review" .changeset/auto-wire-craft-at-review.md   # expect >= 1
   head -5 .changeset/auto-wire-craft-at-review.md                          # frontmatter intact
   ```

4. Commit: `docs(changeset): name harness-code-review as the second wired craft host`

### Task 8: Park every deferred item in the spec, and file the `_wt/` walker defect

**Depends on:** none | **Files:** `docs/changes/auto-wire-craft-at-review/proposal.md` | **Owns:** `docs/changes/auto-wire-craft-at-review/proposal.md`

Append a `## Deferred follow-ups` section at the **end** of the spec (currently 646 lines, last
line: `Phases 1 through 4 each land as their own PR; Phase 5 may ride with Phase 4.`). Every item
below already has a measurement from Phases 1-4; none is re-derived here.

1. Append:

   ```markdown
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
     `CraftDomainRule.supportedLanguages` is `readonly SupportedLanguage[]`, but extraction is gated
     per file extension. The `.mts`/`.cts` instance was fixed in Phase 2a and is pinned by a law
     derived from `EXTENSION_MAP`; the granularity mismatch itself remains.
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
     second and extract nothing through the first, and the Phase 3 subset law compares at language
     granularity so it would not catch that. This is FU-4's fix, and it is Phase 2's seam.
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
     but not `_wt`, which is this repository's own worktree-pool directory. A populated pool makes
     the walker see 292,202 files against the repo's 9,407: it crashes `check-arch`, dominates
     `harness validate`'s issue count, and stack-overflows `duplication.perf`. Three checkers, one
     cause. Filed as issue #<N> (see below).
   ```

2. File the `_wt/` issue. **Bare create only** — `gh issue create --milestone` and `--type` hang in
   this environment:

   ```bash
   cat > /tmp/wt-skip-dirs.md <<'BODY'
   `packages/graph/src/ingest/skip-dirs.ts` lists `.git-worktrees` and `.worktrees` (`:108-109`)
   among the "Plain-git worktree containers" it skips, but NOT `_wt` — which is this repository's
   own worktree-pool directory name. The walker ignores `.gitignore`, so a populated pool is walked
   as if it were first-party source.

   Measured: 292,202 files walked against the repository's own 9,407. Three consequences, one cause:

   - `harness check-arch` crashes (and reports false REGRESSIONs on untouched files when it does not)
   - `harness validate`'s issue count is dominated by findings attributed to paths under `_wt/<branch>/`
   - `duplication.perf` stack-overflows

   The fix is one entry in `DEFAULT_SKIP_DIRS` beside the two that are already there. Consumers can
   already work around it via `ingest.skipDirs` / `ingest.additionalSkipDirs`, but the repo's own
   convention should not require a workaround.

   Found while planning Phase 5 of `docs/changes/auto-wire-craft-at-review/proposal.md`; out of that
   feature's scope.
   BODY
   env -u GITHUB_TOKEN gh issue create \
     --title "graph walker: DEFAULT_SKIP_DIRS omits _wt, the repo's own worktree pool" \
     --body-file /tmp/wt-skip-dirs.md
   ```

   Record the issue number. If `gh` hangs or fails, **do not retry with extra flags** — leave the
   section text as `Filed as issue #<N> (see below)` → replace with
   `Not yet filed; see the Phase 5 handoff.` and report it in the handoff. Filing is not a gate.

3. Replace `#<N>` in the spec with the real number, then:

   ```bash
   npx prettier --write docs/changes/auto-wire-craft-at-review/proposal.md
   npx prettier --check docs/changes/auto-wire-craft-at-review/proposal.md
   grep -n "^## Deferred follow-ups" docs/changes/auto-wire-craft-at-review/proposal.md
   ```

4. Commit: `docs(craft): park the deferred follow-ups from phases 1-4 in the spec`

### Task 9: Close-out — mutation record, byte-identity proof, file-map audit

**Depends on:** Tasks 1-8 | **Files:** `packages/cli/tests/integration/autopilot-skill-hooks.test.ts`, `packages/cli/tests/integration/craft-skill-review-hook-sections.test.ts`, `packages/cli/tests/design-craft/phases/files-path-form.test.ts`

Every assertion added in Tasks 3-5 gets a mutant AND the pre-edit evaluation recorded at its site.
Phase 4 found a law that could never fail because the surrounding document already contained the
phrase it asserted; the only defence is to run the mutation and print its diff in the same command
as the test result.

1. Run each mutation, printing the diff alongside the result in ONE command. Register these six:

   | ID                   | Mutation                                                                            | Expected                                                                                                                                                                     |
   | -------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `M-AP-BUDGET-118`    | Strip the qualifying clause from the `:118` bullet only                             | Task 3's law RED naming line 118; the other site's assertion GREEN; other 24 cases GREEN                                                                                     |
   | `M-AP-BUDGET-334`    | Strip it from the `:334` sentence only                                              | RED naming line 334; same isolation                                                                                                                                          |
   | `M-AP-BUDGET-COUNT`  | Add a THIRD line mentioning `promptBudget` without the qualifier                    | RED on the cardinality control (`expected length 3 to be 2`) — proves the loop alone is blind                                                                                |
   | `M-AP-BUDGET-SCHEMA` | Add `promptBudget: { type: 'number' }` to `design_craft`'s `inputSchema.properties` | RED on `expect(without).toEqual(['design_craft'])` — proves derivation, not a hand table                                                                                     |
   | `M-DC-SWALLOW`       | Wrap `readSource`'s `readFileSync` in `try { … } catch { return '' }`               | Task 5's relative case RED (no throw, 1 finding) while the absolute case stays GREEN — this is the "silent zero" the brief claimed, measured NOT to be the current behaviour |
   | `M-DC-ALWAYS-THROW`  | Make `readSource` throw unconditionally                                             | Task 5's ABSOLUTE case RED — proves the positive control is load-bearing and that "it threw" alone would not be evidence                                                     |

   Example shape (one command, diff and result together):

   ```bash
   python3 - <<'PY'
   import pathlib; p=pathlib.Path('agents/skills/claude-code/harness-autopilot/SKILL.md'); s=p.read_text()
   p.write_text(s.replace(" where that domain's MCP tool accepts one (see each\n  craft skill's \"Invoked as a review hook\" section; `mcp__harness__design_craft` does not).", "."))
   PY
   git --no-pager diff --stat agents/skills/claude-code/harness-autopilot/SKILL.md
   npx vitest run packages/cli/tests/integration/autopilot-skill-hooks.test.ts 2>&1 | tail -8
   git checkout -- agents/skills/claude-code/harness-autopilot/SKILL.md
   ```

   Task 4's pre-edit RED run (step 2 of that task) IS the `M-DCDESC-REVERT` mutation and is recorded
   as such — do not run it a second time. Add two more there:

   | ID               | Mutation                                                      | Expected                                                                                                                  |
   | ---------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
   | `M-DCDESC-EMPTY` | Set `design_craft`'s `files.description` to `''`              | RED on the **vacuity control** (`files has no description`), not on the `not.toMatch` — which would have passed vacuously |
   | `M-DCDESC-DENOM` | Delete `files` from one craft tool's `inputSchema.properties` | RED on the denominator case, proving it is not decorative                                                                 |

   **Gate:** eight registered mutants, zero survivors. **A survivor is a finding, not a nuisance** —
   record it and fix the law.

2. Append a `// MUTATION RESULTS (2026-11-13, …)` block to each of the three test files, in the
   shape `craft-skill-review-hook-sections.test.ts` already uses: the mutation, the diff it made,
   the exact pass/fail counts, and which sibling cases stayed GREEN. Also record, at the site of
   Task 3's law, the pre-edit evaluation: _the qualifier appeared zero times in the file before the
   edit, so both sites failed._

3. Prove `harness validate` is byte-identical — **once**, unpiped, ~5m45s:

   ```bash
   harness validate > /tmp/validate-phase5.txt 2>&1; echo "EXIT=$?"
   wc -l < /tmp/validate-phase5.txt
   md5 -q /tmp/validate-phase5.txt
   ```

   **Gate:** `29642`, `4c0efe7709e813065698502570193753`, `EXIT=1`. The line count and the md5 are
   checked together: a truncated capture changes the count, a changed finding changes the md5.
   Any drift is a finding — report it, do not re-run until it looks right.

4. `harness check-deps` — expect `2707 modules, 10 layers, validation passed`.

5. Run the full affected test set once:

   ```bash
   npx vitest run packages/cli/tests/integration/autopilot-skill-hooks.test.ts \
     packages/cli/tests/integration/craft-skill-review-hook-sections.test.ts \
     packages/cli/tests/design-craft/phases/files-path-form.test.ts \
     packages/cli/tests/integration/craft-hooks-export.test.ts \
     packages/cli/tests/integration/craft-diff-scope.test.ts 2>&1 | tail -15
   ```

6. **File-map audit.** Every path in the working tree must appear in this plan's File Map:

   ```bash
   git diff --name-only 28ae558f4..HEAD   # the whole branch, for the PR body
   git diff --name-only HEAD~8..HEAD      # this phase (adjust N to the commits actually made)
   git status --short                      # must be empty
   ```

   **Gate:** `git status --short` is empty, and every file in this phase's diff is in the File Map
   (hand-edited or generated). Anything outside it is a finding.

7. `npx prettier --check` across every file this phase touched.
8. Commit (only if steps 1-2 changed the test files): `test(craft): record the mutation results for the phase 5 documentation laws`

## Dependency graph and parallel opportunities

- **Wave 1 (no dependencies, fully parallel):** Tasks 1, 3, 4, 6, 7, 8 — six disjoint file sets.
- **Wave 2:** Task 2 (after Task 1, same ADR directory — the number allocation serializes them),
  Task 5 (after Task 4, same subject so the schema wording is settled first).
- **Wave 3:** Task 9 — depends on everything.

In practice this phase is small enough to run serially; the waves are recorded because
`plan_parallelization` consumes `Depends on` + `Files` + `Owns`, and a wrong edge there is worse
than no edge.

## Traceability — every observable truth to its task

| Truth | Task(s) | What makes it falsifiable                                            |
| ----- | ------- | -------------------------------------------------------------------- |
| 1     | 1       | Read-back from disk; three section line-counts printed together      |
| 2     | 1       | Symbol grep for both host constants                                  |
| 3     | 2       | Same read-back shape                                                 |
| 4     | 3, 9    | Pre-edit RED at both sites; cardinality control; schema-derived list |
| 5     | 4, 9    | Pre-edit: 1 of 10 RED; vacuity control; denominator case             |
| 6     | 5, 9    | Both halves asserted; `M-DC-ALWAYS-THROW` proves the control         |
| 7     | 6       | **Nothing mechanical** — stated plainly rather than implied          |
| 8     | 7, 9    | Grep in the close-out audit                                          |
| 9     | 8       | Section heading grep + prettier                                      |
| 10    | 9       | Line count + md5 + exit code, asserted together                      |

## Links

- Spec: `docs/changes/auto-wire-craft-at-review/proposal.md` (Phase 5; Integration points → Architectural decisions)
- Phase 1: `plans/2026-11-12-craft-review-hooks-resolver-plan.md`
- Phase 2a: `plans/2026-11-13-multi-language-craft-extraction-plan.md` (FU-1..FU-5)
- Phase 3: `plans/2026-11-13-autopilot-host-wiring-plan.md`
- Phase 4: `plans/2026-11-13-code-review-host-wiring-plan.md`
- Session: `.harness/sessions/changes--auto-wire-craft-at-review--proposal/`
