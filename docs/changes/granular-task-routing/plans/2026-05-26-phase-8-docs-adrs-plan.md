# Plan: Spec B Phase 8 — Docs + ADRs + Plugin Regeneration

**Date:** 2026-05-26 | **Spec:** `docs/changes/granular-task-routing/proposal.md` (Phase 8, lines 516–529) | **Tasks:** 14 | **Time:** ~70 min | **Integration Tier:** medium (docs-only with regen) | **Session:** `changes--granular-task-routing--proposal`

**Worktree:** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1` at HEAD `cff5b318` (Phase 7 tip).
**Spec criteria pinned:** Phase 8 checkpoint — `harness validate` + `harness check-docs` pass; `pnpm generate:barrels:check && pnpm generate:plugin:check` clean (per spec line 529).
**Upstream context (Phases 0–7, frozen):** all production code shipped. Phase 7 closed F9 + O2 + O4 + Q2; full Phases 1–6 surface (resolver, validator, dispatch wiring, decision bus, HTTP + WS, CLI) is in place. This phase is durable knowledge surface only — no `packages/**/src/**` edits.

---

## Goal

After this phase, the durable knowledge surface accurately describes Spec B's granular routing world: 5 ADRs codify the architectural decisions the spec deferred to planning (D1, D2, D4, D8, D6); the two operator-facing routing knowledge docs (`issue-routing.md` updated, `routing-resolution.md` new) cover the per-skill + per-mode axes, the resolution order, fallback semantics, and decision telemetry; the multi-backend routing operator guide gains a "Per-skill and per-mode routing" section with the spec's example config; a new `routing-trace.md` operator guide covers the dashboard panel + `harness routing trace` CLI debugging surface; AGENTS.md + README.md acknowledge the new routing axes; CHANGELOG flags the `RoutingValue` widening as additive / non-breaking; plugin manifests regenerate cleanly (or are confirmed no-op per Phase 6 recurring lesson — see U-OP-4); roadmap entry moves from `in-progress` → `done`. `harness validate` + `harness check-docs` stay green and the two regen `:check` scripts exit zero relative to a phase-scoped baseline.

## Observable Truths (Acceptance Criteria)

These map to the spec's Phase 8 checkpoint and Integration Points §§ Documentation Updates / Architectural Decisions.

1. **Phase-8 Exit (spec line 529)** — `harness validate` exits 0 AND `harness check-docs` documentation-coverage report does not regress below the Phase 7 baseline of **84.0%** (measured at HEAD `cff5b318`) after every commit in this phase.
2. **OT-ADR-D1** — `docs/knowledge/decisions/0028-per-skill-and-per-mode-routing-axes.md` exists. Frontmatter: `number: 0028`, `title: Per-skill and per-cognitive-mode routing axes`, `date: 2026-05-26`, `status: accepted`, `tier: medium`, `source: docs/changes/granular-task-routing/proposal.md`. Three required sections (`## Context`, `## Decision`, `## Consequences`) present. Decision section transcribes spec Decision **D1** (lines 51).
3. **OT-ADR-D2** — `docs/knowledge/decisions/0029-routing-resolution-order.md` exists with `number: 0029`, `title: Routing resolution order — invocation, skill, mode, tier, default`. Transcribes spec Decision **D2** (line 52). Consequences section names the resolution-order invariant pinned by Phase 1's `BackendRouter.resolve()` rewrite and the Phase 3 acceptance suite (F3 + F4).
4. **OT-ADR-D4** — `docs/knowledge/decisions/0030-fallback-chains-shared-routing-primitive.md` exists with `number: 0030`, `title: Fallback chains as a shared routing primitive`. Transcribes spec Decision **D4** (line 54) plus the byte-compatibility note (S1 / F5 from spec § Success Criteria).
5. **OT-ADR-D8** — `docs/knowledge/decisions/0031-routing-decision-telemetry-ring-buffer.md` exists with `number: 0031`, `title: Routing-decision telemetry via in-memory ring buffer`. Transcribes spec Decision **D8** (line 58). Consequences section names the bounded-memory + no-persistence-in-v1 trade-off (per spec assumption "No persistent decision storage in v1", line 43) and the future-work hook (D8 follow-up).
6. **OT-ADR-D6** — `docs/knowledge/decisions/0032-skill-authors-do-not-declare-backend-preferences.md` exists with `number: 0032`, `title: Skill authors do not declare backend preferences`. Transcribes spec Decision **D6** (line 56). Consequences section names skill portability across deployments and the operator-authority invariant.
7. **OT-Knowledge-IssueRouting** — `docs/knowledge/orchestrator/issue-routing.md` gains four substantive additions: (a) "Backend Routing" section names per-skill + per-cognitive-mode as new axes alongside per-tier + per-intelligence-layer; (b) "Resolution Order" subsection documents the deterministic walk (invocation → skill → mode → tier → default; first match wins); (c) "Fallback Chains" subsection notes that every routing value accepts a scalar OR ordered array; (d) "See also" footer cross-links the new `routing-resolution.md` knowledge doc + the LMLM (Spec A) `local-model-resolution.md`. Frontmatter `tags` adds `per-skill`, `per-cognitive-mode`, `fallback-chain`, `routing-resolution`.
8. **OT-Knowledge-RoutingResolution-NEW** — `docs/knowledge/orchestrator/routing-resolution.md` exists. Frontmatter: `type: business_process`, `domain: orchestrator`, `tags: [routing, resolution, fallback-chain, decision-bus, ring-buffer, telemetry]`. Sections (at minimum): Overview, Resolution Order (invocation → skill → mode → tier → default), Fallback Semantics (scalar normalization to one-element array; ordered walk; unknown-backend skip), Decision Telemetry (`RoutingDecision` shape + `resolutionPath` outcomes `chosen`/`unknown-backend`/`considered`), Ring Buffer Behavior (default capacity 500 — configurable; per-orchestrator-process; cleared on restart). References Phase 1's `BackendRouter.resolve()` and Phase 4's `RoutingDecisionBus`.
9. **OT-Guide-MultiBackend** — `docs/guides/multi-backend-routing.md` gains a "Per-skill and per-mode routing" section that includes the spec's worked YAML example verbatim (spec lines 197–218) plus a walkthrough of two common patterns: (a) "route reviewers to local, route architects to cloud" using `routing.modes`; (b) "absorb cloud rate caps by pinning a specific skill local" using `routing.skills`. Existing legacy-schema migration section is unchanged. "Related" footer adds links to `docs/guides/routing-trace.md` and `docs/knowledge/orchestrator/routing-resolution.md`.
10. **OT-Guide-RoutingTrace-NEW** — `docs/guides/routing-trace.md` exists. Sections: (a) one-paragraph overview of the operator-debugging use case; (b) `harness routing trace --skill <name> [--mode <m>] [--json]` walkthrough with sample output transcribing the `RoutingDecision` JSON shape (per Phase 6 contract); (c) `harness routing decisions --skill <name> --last <N>` walkthrough; (d) dashboard `/routing` panel walkthrough (Resolved Chains, Recent Decisions, Per-Backend Volume, Trace Tool cards — per Phase 7 contract); (e) "Debugging routing decisions" recipe section with two scenarios (typo-in-backend-name → resolution-path shows `outcome: unknown-backend`; skill not routing where expected → check resolution order via `trace`).
11. **OT-AGENTS-MD** — `AGENTS.md` orchestrator section (line 118) gains a single sentence: routing supports per-skill + per-cognitive-mode axes with fallback chains; dashboard `/routing` panel and `harness routing {trace,decisions,config}` CLI surface decision telemetry. Single additive sentence; no rewrite of existing prose.
12. **OT-README** — `README.md` orchestrator capabilities section gains a single sentence + link to `docs/guides/multi-backend-routing.md` (or `routing-trace.md` if the latter is the more discoverable entry point — planner default: link to the existing guide section so the README points at one already-discoverable doc).
13. **OT-CHANGELOG** — `CHANGELOG.md` `[Unreleased]` section gains a single `### Added` entry titled **"Granular Task→Backend Routing (Spec B)"** under `(@harness-engineering/orchestrator, @harness-engineering/types, @harness-engineering/cli, @harness-engineering/dashboard)` covering Phases 0–7 aggregate. Entry names: the two new `RoutingUseCase` variants (skill, mode), the widened `RoutingValue = string | readonly [string, ...string[]]`, the `routing.skills` / `routing.modes` maps, the `--backend` invocation override, the `RoutingDecisionBus` ring buffer, three HTTP routes (`/api/v1/routing/{config,decisions,trace}`), the `routing:decision` WS topic, the `harness routing {config,trace,decisions}` CLI, the `/routing` dashboard panel, and the ADR numbers 0028–0032. **Explicitly flags the `RoutingValue` schema widening as additive and scalar-compatible (non-breaking) per spec D4.** No `### Changed` entry (Phase 8 changes nothing for legacy configs).
14. **OT-Roadmap** — Roadmap entry "Granular Task→Backend Routing" (`docs/roadmap.md` lines 1141–1150) moves from status `planned` → `done`. (Spec note "Spec B already at in-progress status (was bumped after Phase 0); now bump to done" — see U-OP-5 below for status delta; current on-disk shows `planned`, plan resolves to `done` regardless of intermediate state.) Edit is a single status-line replacement; preserves all other roadmap fields verbatim. Plan name field stays `—` (no public-link convention for plan paths in this repo's roadmap.md).
15. **OT-Regen-Barrels** — `pnpm generate:barrels:check` exits 0 against a phase-scoped baseline. **U-OP-1 below documents that the on-disk baseline is dirty pre-Phase-8** (`packages/core/src/index.ts` has pre-existing drift from `insights`, `validateBranchName`, `invalidateCheckState` exports — same drift the Phase 0/2/3/4/7 learnings reverted from each phase's commits). Phase 8 confirms this drift is unrelated to Spec B's symbol additions (verified via `grep -E 'Routing(Decision|Value|UseCase|Step|Source)' packages/core/src/index.ts` returning empty before and after regen) and surfaces a one-line carry-forward in the handoff rather than absorbing the unrelated diff. (`generate:plugin:check` is already clean; see OT-Regen-Plugin.)
16. **OT-Regen-Plugin** — `pnpm generate:plugin:check` exits 0. Per Phase 6 learning (line 102), the plugin generator emits one wrapper per skill (compound.md, autopilot.md, …), NOT per CLI subcommand. Spec B adds `harness routing config|trace|decisions` subcommands and a `--backend` flag, none of which template per-skill. Expected outcome: zero in-scope diffs; `:check` is clean. If the regen produces any in-scope artifacts, plan absorbs them in Task 12.
17. **OT-No-Code-Change** — `git diff <phase-base>..HEAD -- 'packages/**/src/**' 'packages/**/tests/**'` is empty after the phase. Only `docs/`, `AGENTS.md`, `README.md`, and `CHANGELOG.md` are touched. (Verifies docs-only scope.)
18. **OT-Mechanical** — `pnpm typecheck` (no-op smoke since no code changes), `harness validate`, and `harness check-deps` all green at every commit boundary.

## Skills (from `docs/changes/granular-task-routing/SKILLS.md`)

Advisor-recommended skills are TypeScript/Zod patterns optimized for implementation phases (`ts-zod-integration`, `gof-chain-of-responsibility`, `ts-template-literal-types`, etc.). This is a docs-only phase — none of the listed skills move the needle on doc writing or ADR authoring. No per-task skill annotations below.

**Process gate:** `harness-soundness-review --mode plan` invoked once at the end of VALIDATE before writing this plan, per harness-planning Phase 4 step 6.

## Uncertainties

### Blocking

- _(none — every ADR decision content is transcribed from the spec's Decisions table; every doc edit is mechanical addition or in-place update; numbering, paths, and regen surfaces are all verified.)_

### Assumptions

- **[ASSUMPTION] ADR numbering 0028–0032 is the next sequential block.** Verified at planning time: `ls docs/knowledge/decisions/` shows highest existing as `0027-learnings-md-deprecation-scope.md`. If a concurrent spec lands ADRs between plan-write and plan-execute, executor re-scans and increments at write time (per `docs/knowledge/decisions/README.md` rule). Re-numbering is mechanical, no content change.
- **[ASSUMPTION] CHANGELOG entry lands in `[Unreleased]`, single combined entry covering Phases 0–7.** Verified by `grep -n '^## ' CHANGELOG.md | head -3` showing `[Unreleased]` is the top section. Matches the established Spec 2 / Hermes precedent (combined-spec entry, not per-phase). If a release ships before this phase commits, the entry moves to that release section.
- **[ASSUMPTION] `harness check-docs` baseline is 84.0%** as observed at HEAD `cff5b318` during planning. Coverage may rise slightly when Phase 8 adds the two new knowledge docs (they're additive). Phase 8 cannot regress _below_ 84.0% (Phase-7-baseline floor). If the on-disk baseline at execution time differs, executor uses the live measurement, not 84.0%, as the floor.
- **[ASSUMPTION] AGENTS.md and README.md changes are single-sentence additions, not rewrites.** Verified by reading AGENTS.md line 118 (orchestrator description already mentions `agent.backends` / `agent.routing` from Spec 2 — extending it with one Spec-B sentence is additive). If executor finds the existing line already rewritten by an intervening commit, the edit adjusts to preserve any newer wording.
- **[ASSUMPTION] Roadmap entry has not been bumped to `in-progress` on disk.** Spec note line says "Spec B already at in-progress status (was bumped after Phase 0)" but on-disk `docs/roadmap.md:1143` reads `Status: planned`. The bump may have been to a separate state surface (graph, dashboard) rather than the markdown. Plan moves it `planned` → `done` directly. If executor finds `in-progress` on-disk, the edit is `in-progress` → `done`. Same single-line replacement.

### Deferrable

- **Exact tags-list ordering on the new knowledge doc's frontmatter.** Plan specifies the tag set; ordering is irrelevant to harness's knowledge ingest (verified by grepping `docs/knowledge/orchestrator/*.md` — order varies). Executor uses any reasonable order.
- **Whether to add a top-of-file "See also" section to the new ADRs that cross-links the other four ADRs in the 0028–0032 block.** Not pinned by ADR template conventions; some ADRs do, most don't. Defer to writer judgment; not load-bearing.
- **Knowledge graph reindex.** Surface as carry-forward for autopilot DONE phase (matches Spec 2 Phase 6 precedent). Phase 8 does not run `harness scan` + `harness ingest`. The new ADRs and knowledge docs land as files; the graph picks them up on next ingest.

## Operator Decisions to Confirm Before Execution

| ID     | Question                                                                                                                                                                           | Default (use unless operator overrides)                                                                                                                                                                                                                                           | Alternative                                                                                                                                          |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| U-OP-1 | Pre-existing `packages/core/src/index.ts` barrel drift from `insights`, `validateBranchName`, `invalidateCheckState`. Already reverted by Phases 0, 2, 3, 4, 7. Phase 8 does what? | **Revert from Phase 8 scope** (precedent from 5 prior phases). Phase 8 only touches docs; absorbing this drift would muddy a docs-only commit. Surface as recurring carry-forward in the handoff for a dedicated cleanup PR.                                                      | Absorb the drift into Phase 8 as a "cleanup" commit. Reject — different scope, different commit-message intent, makes the docs-only narrative noisy. |
| U-OP-2 | Five ADRs (one per spec Decisions row D1, D2, D4, D8, D6) vs folding into fewer ADRs (e.g., combine D2 + D4 into one "routing resolution mechanics" ADR).                          | **Five ADRs as specified by spec § Architectural Decisions (lines 343–349).** The spec explicitly lists five and assigns each to a single Decision. Spec authority binds the plan.                                                                                                | Fold related decisions. Reject — spec is explicit; deviating requires spec amendment, not plan-time license.                                         |
| U-OP-3 | New ADR statuses on first commit: `accepted` vs `proposed`.                                                                                                                        | **`accepted`.** All five decisions are already implemented end-to-end through Phases 0–7. Marking them `proposed` would misrepresent their state. Matches ADR-0005, 0006, 0007 precedent (Spec 2's ADRs landed as `accepted` in the docs-phase that closed the spec).             | `proposed` until a separate review. Reject — implementation is the proof; the ADRs codify what already ships.                                        |
| U-OP-4 | `generate:plugin:check` produced no in-scope diffs at planning time. Should Task 12 (regen) still attempt a no-op commit, or skip the regen?                                       | **Run the regen, confirm clean, skip the commit.** Same outcome as Phase 6 Task 14 (decision recorded in learnings line 78). The `:check` script run during VALIDATE proves cleanliness; an explicit no-op commit adds nothing.                                                   | Force a commit (empty or trivial) to signal intent. Reject — empty commits are noise; the validate-stage `:check` exit code is the proof.            |
| U-OP-5 | Roadmap status delta: `planned` (current on-disk) → `done`, OR `in-progress` (per spec planner note) → `done`?                                                                     | **Use whichever the executor finds on-disk at execute time, move to `done` either way.** The change is a single status-line replacement; the source-state mismatch between spec note and on-disk file is documented as ASSUMPTION above. No semantic difference in the end state. | Investigate the source-state mismatch first. Reject — both source states are valid; either way, end-state is `done`. The diff is one line.           |
| U-OP-6 | README.md target paragraph: orchestrator capabilities section already references multi-backend routing (Spec 2). Add a new sentence or extend the existing sentence?               | **Add a new single sentence after the existing multi-backend reference.** Preserves the existing Spec 2 wording. Single-sentence cohabitation with Spec 2's sentence makes the README's evolution traceable.                                                                      | Rewrite the existing sentence to combine both specs. Reject — touches Spec-2-authored prose without need.                                            |

If any default is rejected, executor pauses and re-issues the plan diff with the corrective edit before Task 1.

## File Map

```
CREATE  docs/knowledge/decisions/0028-per-skill-and-per-mode-routing-axes.md
CREATE  docs/knowledge/decisions/0029-routing-resolution-order.md
CREATE  docs/knowledge/decisions/0030-fallback-chains-shared-routing-primitive.md
CREATE  docs/knowledge/decisions/0031-routing-decision-telemetry-ring-buffer.md
CREATE  docs/knowledge/decisions/0032-skill-authors-do-not-declare-backend-preferences.md
CREATE  docs/knowledge/orchestrator/routing-resolution.md
CREATE  docs/guides/routing-trace.md
MODIFY  docs/knowledge/orchestrator/issue-routing.md      (Backend Routing + Resolution Order + Fallback Chains additions; tags update)
MODIFY  docs/guides/multi-backend-routing.md              (Per-skill/per-mode section; related-links footer)
MODIFY  AGENTS.md                                          (orchestrator section: +1 sentence)
MODIFY  README.md                                          (orchestrator capabilities: +1 sentence + link)
MODIFY  CHANGELOG.md                                       ([Unreleased] § Added: combined Spec B entry)
MODIFY  docs/roadmap.md                                    (Granular Task→Backend Routing: status planned|in-progress → done)
```

13 file touches across 7 CREATE + 6 MODIFY.

## Skeleton

1. **ADR block** — five ADRs, 0028–0032 (5 tasks, ~25 min)
2. **Knowledge docs** — routing-resolution.md NEW + issue-routing.md UPDATE (2 tasks, ~12 min)
3. **Operator guides** — multi-backend-routing.md UPDATE + routing-trace.md NEW (2 tasks, ~12 min)
4. **Top-level prose** — AGENTS.md + README.md + CHANGELOG (3 tasks, ~10 min)
5. **Roadmap + regen + final validate** — roadmap line, regen checks, harness validate/check-docs (2 tasks, ~10 min)

**Total:** 14 tasks. _Skeleton approved at standard rigor (≥8 tasks)._ Operator confirms via `emit_interaction` before Task 1.

---

## Tasks

### Task 1: ADR 0028 — Per-skill and per-cognitive-mode routing axes (D1)

**Depends on:** none | **Files:** `docs/knowledge/decisions/0028-per-skill-and-per-mode-routing-axes.md` (CREATE)

Transcribes spec Decision **D1** (line 51) into the ADR template.

1. Create `docs/knowledge/decisions/0028-per-skill-and-per-mode-routing-axes.md` with exact content:

   ```markdown
   ---
   number: 0028
   title: Per-skill and per-cognitive-mode routing axes
   date: 2026-05-26
   status: accepted
   tier: medium
   source: docs/changes/granular-task-routing/proposal.md
   ---

   ## Context

   Pre-Spec-B orchestrator routing keyed on a small fixed set of use cases: scope tier (`quick-fix`, `guided-change`, `full-exploration`, `diagnostic`), intelligence layer (`sel`, `pesl`), and isolation tier. Every skill at the same scope tier dispatched to the same backend. Two emerging needs broke this assumption:

   1. **Cost insurance.** Cloud LLM rate caps and pricing pressure require selectively re-routing specific skills (e.g., `harness-debugging`, `harness-soundness-review`) to local backends without rerouting all skills at the same tier.
   2. **Task fitness.** Skills carry wildly different cognitive demands. An adversarial reviewer benefits from a cheap fast model; a constructive architect benefits from a more capable model. The orchestrator already labels skills with `cognitive_mode` in skill.yaml; that label can drive routing if the schema admits a per-mode axis.

   The pre-Spec-B schema could express neither.

   ## Decision

   Extend `RoutingUseCase` and `RoutingConfig` with two new axes:

   - **Per-skill:** `RoutingUseCase` gains `{ kind: 'skill'; skillName: string; cognitiveMode?: string }`; `RoutingConfig.skills?: Record<string, RoutingValue>` maps skill names to backend names or fallback chains.
   - **Per-cognitive-mode:** `RoutingUseCase` gains `{ kind: 'mode'; cognitiveMode: string }`; `RoutingConfig.modes?: Record<string, RoutingValue>` maps cognitive-mode identifiers to backend names or fallback chains.

   Both axes are optional. Configs that omit `routing.skills` and `routing.modes` continue to behave identically to pre-Spec-B (S1 in spec § Success Criteria).

   ## Consequences

   **Positive:**

   - Operators can pin individual skills to specific backends (cost insurance) without affecting other skills at the same scope tier.
   - Cognitive mode (6 standard values) provides a coarser semantic layer that handles common cases ("all reviewer work goes cheap") without per-skill config bloat.
   - Hybrid coverage: per-skill handles the precise case, per-mode handles the cross-cutting case, operators pick the granularity per route.

   **Negative:**

   - Two new axes increase the routing-schema surface; operators must understand the resolution order (see ADR 0029) to predict which axis wins for a given dispatch.
   - Skill catalog must be enumerable at orchestrator startup for validation warnings (spec assumption line 40).

   **Neutral:**

   - Validation extension: every name referenced under `routing.skills.*` and `routing.modes.*` must exist in `agent.backends` (hard error); unknown skill names produce a startup warning (decision D10).
   - LMLM (Spec A) composes cleanly: routing entries reference backend names, LMLM auto-populates the model within each backend. Spec B requires no LMLM-specific code (spec § Integration with LMLM).
   ```

2. Run: `harness validate`
3. Commit: `docs(adr): 0028 — per-skill and per-cognitive-mode routing axes (Spec B D1)`

### Task 2: ADR 0029 — Routing resolution order (D2)

**Depends on:** Task 1 | **Files:** `docs/knowledge/decisions/0029-routing-resolution-order.md` (CREATE)

Transcribes spec Decision **D2** (line 52).

1. Create `docs/knowledge/decisions/0029-routing-resolution-order.md` with exact content:

   ```markdown
   ---
   number: 0029
   title: Routing resolution order — invocation, skill, mode, tier, default
   date: 2026-05-26
   status: accepted
   tier: medium
   source: docs/changes/granular-task-routing/proposal.md
   ---

   ## Context

   With per-skill and per-cognitive-mode routing added as new axes (ADR 0028), and with the pre-existing per-tier, per-intelligence-layer, per-isolation, maintenance, and chat use cases retained, a single dispatch can match multiple routing entries. Without a deterministic resolution order, operators cannot predict which backend will run a given dispatch when, say, both `routing.skills.harness-debugging` and `routing.modes.diagnostic-investigator` are configured for a skill that matches both.

   The orchestrator also supports an invocation-level escape hatch (`harness skill run <name> --backend <name>` and `harness dispatch --backend <name>`) for one-off overrides during testing.

   ## Decision

   `BackendRouter.resolve()` walks routing sources in a fixed deterministic order, returning the first source that yields an available backend:

   1. **Invocation override** — `opts.invocationOverride` if set (from `--backend <name>` flag, ADR-0028 D7 in spec).
   2. **Per-skill** — `routing.skills[useCase.skillName]` if `useCase.kind === 'skill'`.
   3. **Per-cognitive-mode** — `routing.modes[useCase.cognitiveMode]` if `useCase.kind in {'skill', 'mode'}` and a mode is present.
   4. **Per-tier / per-intelligence-layer / per-isolation / maintenance / chat** — the pre-Spec-B resolution preserved unchanged.
   5. **`routing.default`** — required fallback; throws at construction time (via `validateReferences`) if it names an unknown backend.

   First match wins. Within a source, chain entries (ADR 0030) are tried in declared order; the first chain entry whose backend exists in `agent.backends` is chosen.

   ## Consequences

   **Positive:**

   - Operator authority over skill author (skills cannot override; ADR 0032) and over scope tier (tier remains as the documented fallback when no skill/mode entry matches).
   - Invocation override at the top of the chain provides an authoritative one-off escape hatch for testing and debugging.
   - Deterministic: identical config + identical use-case input produces identical resolution; verified by Phase 1's unit-test suite (F3 + F4 + F11 in spec § Success Criteria).

   **Negative:**

   - Five-step resolution chain has more surface to teach than the pre-Spec-B two-step (per-use-case → default). The "Backend Routing" knowledge doc and `harness routing trace` CLI mitigate this.

   **Neutral:**

   - Tier is preserved as the fallback path for skills/modes that aren't explicitly configured — pre-Spec-B configs (no `routing.skills`, no `routing.modes`) walk directly from step 4 to step 5 (S1 invariant).
   - Resolution path is captured in the `RoutingDecision.resolutionPath` array (ADR 0031), making the walk inspectable post-dispatch.
   ```

2. Run: `harness validate`
3. Commit: `docs(adr): 0029 — routing resolution order (Spec B D2)`

### Task 3: ADR 0030 — Fallback chains as a shared routing primitive (D4)

**Depends on:** Task 2 | **Files:** `docs/knowledge/decisions/0030-fallback-chains-shared-routing-primitive.md` (CREATE)

Transcribes spec Decision **D4** (line 54).

1. Create `docs/knowledge/decisions/0030-fallback-chains-shared-routing-primitive.md` with exact content:

   ```markdown
   ---
   number: 0030
   title: Fallback chains as a shared routing primitive
   date: 2026-05-26
   status: accepted
   tier: medium
   source: docs/changes/granular-task-routing/proposal.md
   ---

   ## Context

   Routing entries pre-Spec-B were always a single backend name: `routing.default: 'claude-opus'`, `routing.quick-fix: 'local-fast'`, etc. Spec B introduces new axes (ADR 0028) and operators have begun asking for resilience semantics: "try local-fast first, then fall back to claude-sonnet if local-fast is misconfigured or unavailable." Duplicating routing config to express resilience (e.g., two near-identical configs for retry) is error-prone.

   The fallback semantics could live as a Spec-B-only construct (`RoutingChain` type only valid under `routing.skills` and `routing.modes`), but that creates schema inconsistency between old and new axes.

   ## Decision

   Every routing value becomes `RoutingValue = string | readonly [string, ...string[]]`. Scalar form is byte-compatible with pre-Spec-B configs; array form expresses an ordered fallback chain. Applies uniformly to all routing axes:

   - `routing.default`
   - `routing.<tier>` (quick-fix, guided-change, full-exploration, diagnostic)
   - `routing.intelligence.{sel,pesl}`
   - `routing.isolation.<tier>`
   - `routing.skills.<skill-name>` (new)
   - `routing.modes.<cognitive-mode>` (new)

   `BackendRouter.resolve()` walks chain entries in declared order; the first entry whose backend exists in `agent.backends` is chosen. Scalar form is normalized internally to a one-element array via `toArray(value)`.

   ## Consequences

   **Positive:**

   - Operators express resilience uniformly: `routing.skills.harness-soundness-review: [local-reasoning, claude-opus]` says "try local-reasoning, fall back to claude-opus if the former is unknown to `agent.backends`."
   - Schema consistency: one mental model across all routing axes, not "chains here, scalars there."
   - Backward compatibility: existing scalar configs are byte-compatible (S1 + F5 in spec § Success Criteria).

   **Negative:**

   - Validation surface widens: every chain entry (not just the routing root) must reference a backend in `agent.backends`. The validator was extended in Phase 2 to traverse chains.
   - No health-aware fallback skip in v1 (spec D11). Chain entries are tried in order; if the first chain entry exists in `agent.backends` but its backend is unhealthy at dispatch time, the dispatch attempts it and falls through only on the existing per-backend timeout / error handling — not on a health pre-check.

   **Neutral:**

   - LMLM (Spec A) composes naturally: an operator can write `routing.skills.harness-soundness-review: [local-reasoning, claude-opus]` knowing LMLM may not yet have pulled `deepseek-r1:32b`; the chain falls through to Claude. Once LMLM installs the local model, future dispatches start staying local. No LMLM-specific code in Spec B's chain semantics.
   - `unknown-backend` outcomes are recorded in `RoutingDecision.resolutionPath` (ADR 0031) for telemetry, so operator typos surface in the dashboard `/routing` panel and `harness routing decisions` CLI.
   ```

2. Run: `harness validate`
3. Commit: `docs(adr): 0030 — fallback chains as shared routing primitive (Spec B D4)`

### Task 4: ADR 0031 — Routing-decision telemetry via in-memory ring buffer (D8)

**Depends on:** Task 3 | **Files:** `docs/knowledge/decisions/0031-routing-decision-telemetry-ring-buffer.md` (CREATE)

Transcribes spec Decision **D8** (line 58).

1. Create `docs/knowledge/decisions/0031-routing-decision-telemetry-ring-buffer.md` with exact content:

   ```markdown
   ---
   number: 0031
   title: Routing-decision telemetry via in-memory ring buffer
   date: 2026-05-26
   status: accepted
   tier: medium
   source: docs/changes/granular-task-routing/proposal.md
   ---

   ## Context

   Routing legibility is a Spec B goal (§ Why now #3): with routing about to become significantly more configurable (per-skill + per-mode axes, fallback chains, invocation override), operators need a first-class way to inspect routing decisions before and after they happen. Without decision telemetry, granular routing is opaque — operators cannot tell what their config changes did.

   Persistent storage of every routing decision would offer the richest inspection surface but introduces operational complexity (storage location, retention policy, cleanup, disk pressure) disproportionate to the v1 use case (live debugging + recent-history inspection over the last few hundred decisions).

   ## Decision

   Every `BackendRouter.resolve()` call constructs a `RoutingDecision` record (timestamp, useCase, resolutionPath, backendName, backendType, durationMs) and emits it on the internal `RoutingDecisionBus`. The bus:

   1. **Holds a per-orchestrator in-memory ring buffer** of the last N decisions (default `capacity = 500`, constructor-configurable).
   2. **Re-broadcasts on the WebSocket topic `routing:decision`** for live dashboard subscribers (`/routing` panel).
   3. **Emits a structured `routing-decision` log line** for orchestrator-log consumers (O1 in spec § Success Criteria).
   4. **Is synchronous-but-non-throwing**: subscriber errors are caught and isolated (S6); ring-buffer push + listener fan-out never block dispatch.

   The buffer is process-memory only. Orchestrator restart clears the buffer. No persistent decision history in v1.

   ## Consequences

   **Positive:**

   - Routing legibility: dashboard `/routing` panel, `harness routing trace` (dry-run), and `harness routing decisions` (recent-history dump) all read from the same source — no source-of-truth drift.
   - Bounded memory: capacity bound (S5) ensures the buffer cannot grow without limit even under sustained dispatch load.
   - Zero new persistence surface: no disk format, no retention policy, no migration path.

   **Negative:**

   - **Restart loses history.** Orchestrators that crash mid-investigation lose all decisions made before the crash. Operators investigating a flaky route should `harness routing decisions --last <N>` periodically or rely on the structured `routing-decision` log line as the durable backstop.
   - **Multi-orchestrator deployments have per-instance views.** Federated or HA orchestrators each carry their own ring buffer; aggregation across instances is out of scope for v1 (spec assumption line 44). If multi-instance becomes a real use case, persistent storage is the natural next step.

   **Neutral:**

   - Capacity is configurable per orchestrator (e.g., for memory-constrained Pi deployments — lower; for high-throughput cloud deployments — higher). Default 500 is the spec recommendation.
   - Future work (D8 follow-up): adding persistent storage is purely additive — the `RoutingDecisionBus` API contract (`emit`, `recent`, `subscribe`) survives unchanged; persistence becomes a new subscriber that writes to disk.
   ```

2. Run: `harness validate`
3. Commit: `docs(adr): 0031 — routing-decision telemetry via ring buffer (Spec B D8)`

### Task 5: ADR 0032 — Skill authors do not declare backend preferences (D6)

**Depends on:** Task 4 | **Files:** `docs/knowledge/decisions/0032-skill-authors-do-not-declare-backend-preferences.md` (CREATE)

Transcribes spec Decision **D6** (line 56).

1. Create `docs/knowledge/decisions/0032-skill-authors-do-not-declare-backend-preferences.md` with exact content:

   ```markdown
   ---
   number: 0032
   title: Skill authors do not declare backend preferences
   date: 2026-05-26
   status: accepted
   tier: medium
   source: docs/changes/granular-task-routing/proposal.md
   ---

   ## Context

   Per-skill routing (ADR 0028) opens the door to a natural-feeling but ultimately corrosive extension: letting `skill.yaml` declare a preferred backend (e.g., `preferredBackend: claude-opus` or `preferredBackend: any-reasoning-model`). This would let skill authors signal "this skill needs Opus" or "this skill prefers a reasoning model" without operator config.

   The cost: skills become non-portable. A skill authored against a deployment with `claude-opus` named in `agent.backends` breaks in a deployment that names the same model `cloud-primary`. Multiple deployments cannot share a skill catalog without reconciling backend-name conventions.

   ## Decision

   `skill.yaml` is **not** extended with a `preferredBackend` field. Routing is purely operator-controlled via `harness.config.json`'s `agent.routing` map. Skill authors describe skill requirements (e.g., "this skill benefits from a reasoning model with at least 32k context") in skill documentation prose — `SKILL.md` body — not in machine-readable fields that the router consults.

   ## Consequences

   **Positive:**

   - Skills are portable across deployments. A skill catalog can be shared between an enterprise (`agent.backends: { claude-opus, claude-sonnet }`) and a personal (`agent.backends: { primary, local-fast }`) deployment without reconciliation.
   - Operator authority is absolute. Every routing decision goes through `agent.routing`; no "but the skill said it wanted X" surprise.
   - Schema surface stays narrow. `skill.yaml` already carries `cognitive_mode`, which is a portable semantic attribute (cognitive-mode-to-backend mapping is operator-defined via `routing.modes`). That covers the legitimate "this kind of skill prefers this kind of backend" pattern.

   **Negative:**

   - Skill authors who genuinely know their skill needs a specific class of backend (e.g., long-context reasoning) must communicate that via documentation, not via schema. The operator must read the docs and configure `routing.skills.<name>` or `routing.modes.<mode>` accordingly. Mitigated by the standard `cognitive_mode` axis — most "class of backend" cases land in one of the six standard modes.

   **Neutral:**

   - The cognitive-mode axis (ADR 0028) absorbs the legitimate generic-preference case without requiring per-skill schema. A skill author labels the skill `cognitive_mode: adversarial-reviewer`; the operator decides which backend runs adversarial reviewers via `routing.modes.adversarial-reviewer`.
   ```

2. Run: `harness validate`
3. Commit: `docs(adr): 0032 — skill authors do not declare backend preferences (Spec B D6)`

### Task 6: Knowledge doc — NEW `routing-resolution.md`

**Depends on:** Task 5 | **Files:** `docs/knowledge/orchestrator/routing-resolution.md` (CREATE)

Creates the domain-knowledge doc for the resolution chain.

1. Create `docs/knowledge/orchestrator/routing-resolution.md` with this exact content:

   ````markdown
   ---
   type: business_process
   domain: orchestrator
   tags:
     [
       routing,
       resolution,
       fallback-chain,
       decision-bus,
       ring-buffer,
       telemetry,
       per-skill,
       per-cognitive-mode,
     ]
   ---

   # Routing Resolution

   The orchestrator's `BackendRouter.resolve()` walks a deterministic chain of routing sources to choose the backend for a single dispatch. This document describes the resolution order, fallback semantics, and the decision telemetry that captures every walk.

   ## Resolution Order

   `BackendRouter.resolve(useCase, opts?)` tries sources in this fixed order; the first source that yields an available backend wins:

   1. **Invocation override** — `opts.invocationOverride` if set (typically from `--backend <name>` CLI flag).
   2. **Per-skill** — `routing.skills[useCase.skillName]` when `useCase.kind === 'skill'`.
   3. **Per-cognitive-mode** — `routing.modes[useCase.cognitiveMode]` when a mode is present (either on a `kind: 'skill'` use case carrying `cognitiveMode`, or on a `kind: 'mode'` use case).
   4. **Per-tier / per-intelligence-layer / per-isolation / maintenance / chat** — pre-Spec-B resolution preserved.
   5. **`routing.default`** — required; throws at construction time if it names an unknown backend.

   Within a source, chain entries (see Fallback Semantics below) are tried in declared order; the first chain entry whose backend exists in `agent.backends` is chosen. See [ADR 0029](../decisions/0029-routing-resolution-order.md).

   ## Fallback Semantics

   Every routing value is `RoutingValue = string | readonly [string, ...string[]]`.

   - **Scalar form** (`'claude-opus'`) — pre-Spec-B-compatible. Normalized internally to a one-element array.
   - **Array form** (`['local-fast', 'claude-sonnet']`) — ordered fallback chain. Resolver walks the chain; the first entry whose name appears in `agent.backends` is chosen.

   Entries that fail the existence check are recorded in `RoutingDecision.resolutionPath` with `outcome: 'unknown-backend'` for operator visibility (e.g., typos surface in the dashboard `/routing` panel without breaking the dispatch).

   Fallback chains in v1 do **not** consult health signals. The first chain entry whose backend exists is attempted; if dispatch fails, the orchestrator's existing per-backend timeout / error handling takes over. Health-aware fallback skip is reserved for a future spec. See [ADR 0030](../decisions/0030-fallback-chains-shared-routing-primitive.md).

   ## Decision Telemetry

   Every `resolve()` call constructs a `RoutingDecision`:

   ```ts
   interface RoutingDecision {
     timestamp: string; // ISO
     useCase: RoutingUseCase;
     resolutionPath: ResolutionStep[];
     backendName: string;
     backendType: BackendDef['type'];
     durationMs: number;
   }

   interface ResolutionStep {
     source: 'invocation' | 'skill' | 'mode' | 'tier' | 'default';
     candidate: string;
     outcome: 'chosen' | 'unknown-backend' | 'considered';
   }
   ```

   `resolutionPath` records every chain entry considered. Only `chosen` exits the walk; `unknown-backend` and `considered` entries are preserved for telemetry. See [ADR 0031](../decisions/0031-routing-decision-telemetry-ring-buffer.md).

   ## Ring Buffer Behavior

   `RoutingDecisionBus` holds the last N decisions in a per-orchestrator-process in-memory ring buffer:

   - **Default capacity:** 500 decisions. Constructor-configurable.
   - **Eviction:** oldest-first when capacity is reached (FIFO).
   - **Persistence:** none in v1. Orchestrator restart clears the buffer.
   - **Re-broadcast:** every emission is published on the WebSocket topic `routing:decision` for live dashboard subscribers (`/routing` panel).
   - **Logging:** every emission produces a structured `routing-decision` log line for orchestrator-log consumers.
   - **Subscriber isolation:** errors from subscribers are caught and logged; they never propagate to dispatch.

   ## Surfaces

   | Surface                     | Source              | Purpose                                                  |
   | --------------------------- | ------------------- | -------------------------------------------------------- |
   | `harness routing trace`     | Dry-run `resolve()` | Predict what backend a given use case would route to     |
   | `harness routing decisions` | Ring buffer         | Recent decisions, filterable by skill / mode / backend   |
   | `harness routing config`    | Live config         | Current `RoutingConfig` plus resolved chains             |
   | Dashboard `/routing` panel  | Ring buffer + WS    | Live decisions + per-backend volume + inline trace       |
   | `routing-decision` log line | Orchestrator log    | Durable per-dispatch record (independent of ring buffer) |

   ## See also

   - [Issue Routing](./issue-routing.md) — scope-tier detection, triage rules, and the broader routing context
   - [Local Model Resolution](./local-model-resolution.md) — LMLM (Spec A) auto-populates model entries within each backend; routing references those backend names
   - [Multi-Backend Routing](../../guides/multi-backend-routing.md) — operator-facing guide
   - [Routing Trace](../../guides/routing-trace.md) — operator debugging recipes
   - [ADR 0028](../decisions/0028-per-skill-and-per-mode-routing-axes.md) · [ADR 0029](../decisions/0029-routing-resolution-order.md) · [ADR 0030](../decisions/0030-fallback-chains-shared-routing-primitive.md) · [ADR 0031](../decisions/0031-routing-decision-telemetry-ring-buffer.md) · [ADR 0032](../decisions/0032-skill-authors-do-not-declare-backend-preferences.md)
   ````

2. Run: `harness validate`
3. Commit: `docs(knowledge): add routing-resolution domain doc (Spec B)`

### Task 7: Knowledge doc — UPDATE `issue-routing.md`

**Depends on:** Task 6 | **Files:** `docs/knowledge/orchestrator/issue-routing.md` (MODIFY)

Add per-skill + per-mode axes, resolution order, fallback semantics, and cross-links.

1. Open `docs/knowledge/orchestrator/issue-routing.md`. Use **Edit** tool, not full rewrite (preserves existing sections).

2. Replace the frontmatter `tags` line:
   - **old:** `tags: [routing, triage, scope-tier, escalation, model-router, multi-backend, routing-config]`
   - **new:** `tags: [routing, triage, scope-tier, escalation, model-router, multi-backend, routing-config, per-skill, per-cognitive-mode, fallback-chain, routing-resolution]`

3. Replace the existing "Backend Routing" section content (between the `## Backend Routing` heading and the closing `See [ADR 0005...](../../guides/multi-backend-routing.md) for the schema and operator-facing semantics.` line) with this expanded content:

   ```markdown
   ## Backend Routing

   Once a tier is permitted to dispatch (i.e. it's not blocked by `escalation.alwaysHuman` and is allowed by `escalation.autoExecute`), `agent.routing` selects _which_ backend handles it. Routing is orthogonal to escalation:

   - **Escalation** answers "should this tier dispatch at all?" — gates on `alwaysHuman`, `autoExecute`, `signalGated`, and concern signals from the intelligence pipeline.
   - **Routing** answers "where does this tier dispatch when permitted?" — selects an `agent.backends.<name>` entry by use case.

   The routing map is keyed by use case across five axes:

   - **`default`** (required) — fallback for any unmapped use case
   - **Per-tier**: `quick-fix`, `guided-change`, `full-exploration`, `diagnostic` — scope-tier dispatch
   - **Per-intelligence-layer**: `intelligence.sel`, `intelligence.pesl` — analysis-provider selection
   - **Per-isolation-tier**: `isolation.<tier>` — isolation-tier dispatch
   - **Per-skill** (Spec B): `skills.<skill-name>` — pins a specific skill to a backend regardless of scope tier
   - **Per-cognitive-mode** (Spec B): `modes.<cognitive-mode>` — pins all skills of a given cognitive mode to a backend

   Maintenance and dashboard chat both use `routing.default`. Unknown routing keys are validation errors.

   ### Resolution Order

   The orchestrator's `BackendRouter.resolve()` walks routing sources in a deterministic order; the first match wins:

   1. Invocation override (e.g., `--backend <name>` from CLI)
   2. Per-skill (`routing.skills.<name>`)
   3. Per-cognitive-mode (`routing.modes.<mode>`)
   4. Per-tier / per-intelligence-layer / per-isolation / maintenance / chat (pre-Spec-B)
   5. `routing.default`

   See [Routing Resolution](./routing-resolution.md) for the full walk and the `RoutingDecision` telemetry shape.

   ### Fallback Chains

   Every routing value accepts a single backend name (`'claude-opus'`) or an ordered fallback chain (`['local-fast', 'claude-sonnet']`). The resolver walks the chain in declared order and picks the first entry whose backend exists in `agent.backends`. Scalar form is byte-compatible with pre-Spec-B configs.

   ## See also

   - [Routing Resolution](./routing-resolution.md) — full resolution chain + decision telemetry (Spec B)
   - [Local Model Resolution](./local-model-resolution.md) — LMLM (Spec A) auto-populates models within each backend; routing references backend names
   - [Multi-Backend Routing guide](../../guides/multi-backend-routing.md) — operator-facing schema
   - [Routing Trace guide](../../guides/routing-trace.md) — debugging routing decisions
   - [ADR 0005: Named backends map](../decisions/0005-named-backends-map.md)
   - [ADR 0028: Per-skill and per-cognitive-mode routing axes](../decisions/0028-per-skill-and-per-mode-routing-axes.md)
   ```

4. Run: `harness validate`
5. Commit: `docs(knowledge): extend issue-routing with per-skill, per-mode, resolution order (Spec B)`

### Task 8: Operator guide — UPDATE `multi-backend-routing.md`

**Depends on:** Task 7 | **Files:** `docs/guides/multi-backend-routing.md` (MODIFY)

Add a "Per-skill and per-mode routing" section + related-links footer entries.

1. Open `docs/guides/multi-backend-routing.md`. Use **Edit** to add the new section between the existing "`agent.routing`" section (ends at line 53) and the "Multi-local example" section (starts at line 55-56).

2. Insert this content as a new top-level section after the `agent.routing` table:

   ````markdown
   ## Per-skill and per-mode routing (Spec B)

   Spec B extends `agent.routing` with two new axes for finer-grained backend selection:

   - **`routing.skills.<skill-name>`** — pins a specific skill to a backend regardless of scope tier
   - **`routing.modes.<cognitive-mode>`** — pins all skills of a given cognitive mode (declared via `cognitive_mode:` in skill.yaml) to a backend

   Both axes are optional. Resolution order is deterministic (see [Routing Resolution](../knowledge/orchestrator/routing-resolution.md)):

   1. Invocation override (`--backend <name>`)
   2. Per-skill (`routing.skills.<name>`)
   3. Per-cognitive-mode (`routing.modes.<mode>`)
   4. Per-tier / per-intelligence-layer / per-isolation (pre-Spec-B)
   5. `routing.default`

   First match wins.

   ### Fallback chains

   Every routing value (old and new) accepts either a single backend name or an ordered fallback chain. The resolver picks the first chain entry whose backend exists in `agent.backends`:

   ```yaml
   routing:
     default: claude-opus
     quick-fix: [local-fast, claude-sonnet] # try local-fast, fall back to claude-sonnet
   ```
   ````

   Scalar form is byte-compatible with pre-Spec-B configs — no migration required.

   ### Worked example

   ```yaml
   agent:
     backends:
       claude-opus: { type: anthropic, model: claude-opus-4-7 }
       claude-sonnet: { type: anthropic, model: claude-sonnet-4-6 }
       local-fast: { type: local, endpoint: http://localhost:1234/v1, model: qwen3:8b }
       local-reasoning: { type: local, endpoint: http://localhost:1234/v1, model: deepseek-r1:32b }
     routing:
       default: claude-opus
       quick-fix: [local-fast, claude-sonnet] # fallback chain
       intelligence:
         sel: local-fast
         pesl: local-reasoning
       skills: # per-skill
         harness-debugging: [local-fast, claude-sonnet]
         harness-soundness-review: claude-opus
         harness-brainstorming: claude-opus
       modes: # per-cognitive-mode
         adversarial-reviewer: [local-fast, claude-sonnet]
         constructive-architect: claude-opus
         meticulous-implementer: claude-sonnet
   ```

   ### Common patterns

   **Route reviewers to local, route architects to cloud** — use `routing.modes`:

   ```yaml
   routing:
     default: claude-opus
     modes:
       adversarial-reviewer: local-fast
       constructive-architect: claude-opus
   ```

   Every skill whose `cognitive_mode: adversarial-reviewer` lives in skill.yaml dispatches to `local-fast`. Architects keep running on Opus. No per-skill listing required.

   **Absorb cloud rate caps by pinning a specific skill local** — use `routing.skills` with a fallback chain:

   ```yaml
   routing:
     default: claude-opus
     skills:
       harness-debugging: [local-fast, claude-sonnet]
   ```

   Only `harness-debugging` is affected — every other dispatch keeps its prior routing. If `local-fast` is misconfigured or missing from `agent.backends`, the chain falls through to `claude-sonnet`.

   See [Routing Trace](./routing-trace.md) for debugging routing decisions.

   ```

   ```

3. In the existing "## Related" section at the bottom of the file, add two new bullets between the existing entries (after the `[Intelligence Pipeline]` line, before `[Hybrid Orchestrator Quick Start]`):

   ```markdown
   - [Routing Resolution](../knowledge/orchestrator/routing-resolution.md) — Spec B resolution chain + decision telemetry
   - [Routing Trace](./routing-trace.md) — Spec B operator-debugging guide
   ```

4. Run: `harness validate`
5. Commit: `docs(guide): per-skill and per-mode section in multi-backend-routing (Spec B)`

### Task 9: Operator guide — NEW `routing-trace.md`

**Depends on:** Task 8 | **Files:** `docs/guides/routing-trace.md` (CREATE)

Short operator guide for debugging routing decisions via the CLI and dashboard panel.

1. Create `docs/guides/routing-trace.md` with this exact content:

   ````markdown
   # Routing Trace

   Operator debugging surface for routing decisions. Use this guide when a dispatch routed somewhere unexpected, or to validate a config change before it goes live.

   ## Overview

   Spec B's granular routing introduces five sources (`invocation`, `skill`, `mode`, `tier`, `default`) and fallback chains; the resolution order is deterministic but the surface is larger than pre-Spec-B routing. The orchestrator emits a `RoutingDecision` for every dispatch (kept in a 500-entry ring buffer) and offers a dry-run path so operators can predict a decision without dispatching.

   Three surfaces share one source of truth (the orchestrator's `BackendRouter` + `RoutingDecisionBus`):

   - **`harness routing trace`** — dry-run a resolution for a hypothetical use case
   - **`harness routing decisions`** — dump recent decisions in JSON for shell pipelines
   - **Dashboard `/routing` panel** — live UI with the same data, plus per-backend volume

   ## `harness routing trace`

   Dry-runs `BackendRouter.resolve()` for a given skill or mode without dispatching:

   ```bash
   harness routing trace --skill harness-debugging
   ```

   Output (human-readable):

   ```
   Resolved backend: local-fast (type: local)
   Resolution path:
     1. skill   local-fast       chosen
   Duration: 0.4ms
   ```

   With `--json` for machine consumption:

   ```bash
   harness routing trace --skill harness-debugging --json
   ```

   Returns the full `RoutingDecision` JSON:

   ```json
   {
     "timestamp": "2026-05-26T17:34:21.412Z",
     "useCase": { "kind": "skill", "skillName": "harness-debugging" },
     "resolutionPath": [{ "source": "skill", "candidate": "local-fast", "outcome": "chosen" }],
     "backendName": "local-fast",
     "backendType": "local",
     "durationMs": 0.4
   }
   ```

   Trace exits non-zero if resolution would throw (e.g., `routing.default` references an unknown backend) — suitable for CI config-change validation.

   ### Combining skill and mode

   ```bash
   harness routing trace --skill harness-soundness-review --mode adversarial-reviewer
   ```

   Lets you predict per-skill and per-mode interaction without changing skill.yaml.

   ## `harness routing decisions`

   Recent decisions from the orchestrator's ring buffer, JSON by default. Suitable for `jq` piping:

   ```bash
   harness routing decisions --skill harness-debugging --last 10
   harness routing decisions --backend local-fast --last 50 | jq '.[].timestamp'
   harness routing decisions --mode adversarial-reviewer --last 100 | jq 'group_by(.backendName)'
   ```

   The ring buffer holds up to 500 decisions per orchestrator process; the buffer clears on restart. If recent history is missing, the dispatch happened before the current orchestrator process started.

   ## Dashboard `/routing` panel

   Four cards on the dashboard `/routing` route (also reachable at `/s/routing`):

   - **Resolved Chains** — current `RoutingConfig` rendered as resolved fallback chains, with currently-chosen backend per use case
   - **Recent Decisions** — last decisions from the ring buffer, filterable by skill / mode / backend; each row expands to show the full `resolutionPath`
   - **Per-Backend Volume** — dispatch count + success rate over the last 24 h, per backend
   - **Trace Tool** — inline form (skill + mode inputs) that POSTs to `/api/v1/routing/trace`; renders the same `RoutingDecision` shape as the CLI

   The panel subscribes to the `routing:decision` WebSocket topic for live updates. When the WS is disconnected, it falls back to HTTP polling every 5 s.

   ## Debugging routing decisions

   ### Scenario 1 — typo in backend name

   `routing.skills.harness-debugging` is set to `lcoal-fast` (typo). At startup, validation would catch this (hard error per spec D10), but in a chain `[lcoal-fast, claude-opus]` the dispatch falls through to `claude-opus` while leaving the typo silently. Both `harness routing trace --skill harness-debugging` and the dashboard's Recent Decisions row show the typo:

   ```
   Resolution path:
     1. skill   lcoal-fast       unknown-backend
     2. skill   claude-opus      chosen
   ```

   The `unknown-backend` outcome on the first chain entry is the actionable signal.

   ### Scenario 2 — skill not routing where expected

   You configured `routing.skills.harness-debugging: local-fast` but `harness routing decisions --skill harness-debugging --last 5` shows recent dispatches all hitting `claude-opus`. Run `harness routing trace --skill harness-debugging` to see which source actually won the walk. If the trace shows `source: invocation` with `claude-opus`, an upstream `--backend` flag is overriding the per-skill route. If the trace shows `source: default`, the per-skill config didn't load — verify `harness routing config` shows `skills.harness-debugging` populated.

   ## See also

   - [Multi-Backend Routing](./multi-backend-routing.md) — operator schema
   - [Routing Resolution](../knowledge/orchestrator/routing-resolution.md) — domain knowledge
   - [ADR 0029](../knowledge/decisions/0029-routing-resolution-order.md) — resolution order rationale
   - [ADR 0031](../knowledge/decisions/0031-routing-decision-telemetry-ring-buffer.md) — telemetry rationale
   ````

2. Run: `harness validate`
3. Commit: `docs(guide): add routing-trace operator guide (Spec B)`

### Task 10: Update AGENTS.md orchestrator section

**Depends on:** Task 9 | **Files:** `AGENTS.md` (MODIFY)

Add a single sentence to the orchestrator package description.

1. Open `AGENTS.md`. Locate line 118 — the orchestrator package description. Use **Edit** to extend exactly:
   - **old:** `- **orchestrator**: Agent orchestration daemon for dispatching coding agents to issues. Modern config surface is `agent.backends`(named-map) +`agent.routing`(per-use-case). Legacy`agent.backend`/`agent.localBackend` accepted via in-memory migration shim with deprecation warning. (depends on types, core, intelligence)`
   - **new:** `- **orchestrator**: Agent orchestration daemon for dispatching coding agents to issues. Modern config surface is `agent.backends`(named-map) +`agent.routing`(per-use-case). Routing supports per-skill + per-cognitive-mode axes with fallback chains; dashboard`/routing`panel and`harness routing {config,trace,decisions}`CLI surface decision telemetry. Legacy`agent.backend`/`agent.localBackend` accepted via in-memory migration shim with deprecation warning. (depends on types, core, intelligence)`

2. Run: `harness validate`
3. Commit: `docs(agents): note per-skill, per-mode routing + trace surfaces (Spec B)`

### Task 11: Update README.md orchestrator capabilities

**Depends on:** Task 10 | **Files:** `README.md` (MODIFY)

Add a single sentence + link.

1. Open `README.md`. Locate the orchestrator capabilities section (search for the existing multi-backend-routing reference; grep `multi-backend-routing` to find the line). The single Spec-2 sentence already references the guide.

2. Insert a new sentence immediately after the existing multi-backend-routing reference. Use **Edit** with whatever surrounding prose is on-disk at execution time. Inserted sentence (verbatim):

   > Spec B extends routing with per-skill and per-cognitive-mode axes, fallback chains, and a `/routing` dashboard panel + `harness routing trace` CLI for inspecting decisions. See the [Per-skill and per-mode routing](docs/guides/multi-backend-routing.md#per-skill-and-per-mode-routing-spec-b) section.

   _Executor note:_ if `README.md` has been restructured since planning and no orchestrator section exists, append the sentence to the closest "Features" or "Capabilities" subsection. If the README has no such section at all, surface a checkpoint to the operator before improvising a new section.

3. Run: `harness validate`
4. Commit: `docs(readme): note Spec B routing extensions (Spec B)`

### Task 12: Update CHANGELOG.md with combined Spec B entry

**Depends on:** Task 11 | **Files:** `CHANGELOG.md` (MODIFY)

Single `### Added` entry under `[Unreleased]` covering Phases 0–7 aggregate.

1. Open `CHANGELOG.md`. The `[Unreleased]` section is at the top (verified at planning time; line 7).

2. Insert this new entry as the **first** bullet under `[Unreleased] > ### Added` (precedes the existing Hermes Phase 4 entry at line 11):

   ```markdown
   - **Granular Task→Backend Routing (Spec B)** — Per-skill and per-cognitive-mode routing axes; fallback chains as a shared primitive; in-memory decision telemetry with dashboard + CLI surfaces. `RoutingUseCase` (in `packages/types/src/orchestrator.ts`) gains two variants — `{ kind: 'skill'; skillName; cognitiveMode? }` and `{ kind: 'mode'; cognitiveMode }`. `RoutingConfig` gains `skills?: Record<string, RoutingValue>` and `modes?: Record<string, RoutingValue>` maps; **`RoutingValue = string | readonly [string, ...string[]]`** widens every existing scalar routing field (`default`, `quick-fix`, `guided-change`, `full-exploration`, `diagnostic`, `intelligence.{sel,pesl}`, `isolation.<tier>`) to accept ordered fallback chains. **The widening is additive and scalar-compatible — pre-Spec-B configs continue to behave byte-for-byte identically (D4).** `BackendRouter.resolve()` (`packages/orchestrator/src/agent/backend-router.ts`) is rewritten to walk a deterministic chain of sources (invocation override → per-skill → per-cognitive-mode → per-tier/per-intelligence-layer/per-isolation → `routing.default`); first match wins, chain entries within a source are tried in declared order, `unknown-backend` outcomes recorded in `RoutingDecision.resolutionPath` for telemetry. New `--backend <name>` flag on `harness skill run` and `harness dispatch` provides an invocation-level escape hatch (D7). New `RoutingDecisionBus` (`packages/orchestrator/src/routing/decision-bus.ts`) emits every `resolve()` to a per-orchestrator-process in-memory ring buffer (default capacity 500, configurable), broadcasts on the WebSocket topic `routing:decision`, and emits a structured `routing-decision` log line per decision — synchronous-but-non-throwing, subscriber errors isolated (S6). Three new HTTP routes (`packages/orchestrator/src/server/routes/v1/routing.ts`): `GET /api/v1/routing/config` returns current config + resolved chains; `GET /api/v1/routing/decisions?skill=&mode=&backend=&limit=` reads filtered records from the ring buffer; `POST /api/v1/routing/trace` runs `resolve()` without dispatching. Three new CLI commands: `harness routing config|trace|decisions` (`packages/cli/src/commands/routing/`) for shell-accessible inspection. New dashboard route `/routing` (`packages/dashboard/src/client/pages/Routing.tsx`) renders four cards — Resolved Chains, Recent Decisions (filterable, expandable rows), Per-Backend Volume (24 h aggregation), Trace Tool — subscribed to `routing:decision` WS with 5 s HTTP polling fallback when WS is disconnected (O2). Startup config validation (`packages/orchestrator/src/workflow/schema.ts` + `packages/orchestrator/src/workflow/config.ts`) hard-errors on any chain entry that references a backend missing from `agent.backends` (every routing surface — `default`, tier, intelligence, isolation, skills, modes — uniformly checked) and warns on unknown skill names + non-standard cognitive modes (D10). New ADRs codify the architectural choices: [0028 — per-skill and per-cognitive-mode routing axes](docs/knowledge/decisions/0028-per-skill-and-per-mode-routing-axes.md) (D1), [0029 — routing resolution order](docs/knowledge/decisions/0029-routing-resolution-order.md) (D2), [0030 — fallback chains as a shared routing primitive](docs/knowledge/decisions/0030-fallback-chains-shared-routing-primitive.md) (D4), [0031 — routing-decision telemetry via in-memory ring buffer](docs/knowledge/decisions/0031-routing-decision-telemetry-ring-buffer.md) (D8), [0032 — skill authors do not declare backend preferences](docs/knowledge/decisions/0032-skill-authors-do-not-declare-backend-preferences.md) (D6). New knowledge doc [`routing-resolution.md`](docs/knowledge/orchestrator/routing-resolution.md); existing [`issue-routing.md`](docs/knowledge/orchestrator/issue-routing.md) extended with the new axes + resolution order + fallback semantics. New operator guide [`routing-trace.md`](docs/guides/routing-trace.md); existing [`multi-backend-routing.md`](docs/guides/multi-backend-routing.md) extended with per-skill/per-mode section + worked patterns. Composes cleanly with LMLM (Spec A) — routing entries reference backend names whose models LMLM auto-populates; Spec B carries no LMLM-specific code. Spec at [`docs/changes/granular-task-routing/proposal.md`](docs/changes/granular-task-routing/proposal.md). (`@harness-engineering/orchestrator`, `@harness-engineering/types`, `@harness-engineering/cli`, `@harness-engineering/dashboard`)
   ```

3. Run: `harness validate`
4. Commit: `docs(changelog): Granular Task→Backend Routing (Spec B) under Unreleased`

### Task 13: Update roadmap status

**Depends on:** Task 12 | **Files:** `docs/roadmap.md` (MODIFY)

Move the roadmap entry to `done`.

1. Open `docs/roadmap.md`. Locate line 1143 — the `Granular Task→Backend Routing` entry's `Status:` field.

2. Use **Edit** to change exactly:
   - **old (per planning-time inspection):** `- **Status:** planned`
   - **new:** `- **Status:** done`

   _Executor note:_ Per U-OP-5, if on-disk reads `in-progress` instead of `planned`, change to `done` regardless. Both edits land at the same destination.

3. Run: `harness validate`
4. Commit: `docs(roadmap): mark Granular Task→Backend Routing done (Spec B)`

### Task 14: Final validation + regen + handoff close

**Depends on:** Task 13 | **Files:** none committed (carry-forward observations only)

Validates the phase exit gate and surfaces the pre-existing core-barrel drift as a carry-forward.

1. Run: `harness validate` — must exit 0.
2. Run: `harness check-docs` — capture the documentation coverage percentage. Compare against the **Phase 7 baseline of 84.0%**. Must be ≥ 84.0% (OT-1 in Observable Truths). If lower, halt and report. Expected: ≥ 84.0% — the two new knowledge docs and the new guide are additive surfaces.
3. Run: `pnpm generate:barrels:check` — capture exit code.
   - If exit 0: confirm by recording "barrels:check clean" in the handoff.
   - If non-zero (expected, per U-OP-1): run `pnpm generate:barrels` then `git diff packages/core/src/index.ts` and verify the drift involves only the pre-existing symbols (`insights`, `validateBranchName`, `invalidateCheckState`). Confirm via `grep -E 'Routing(Decision|Value|UseCase|Step|Source)' packages/core/src/index.ts` (must return empty). Revert via `git checkout HEAD -- packages/core/src/index.ts` to keep Phase 8 docs-only. Record as recurring carry-forward in the handoff.
4. Run: `pnpm generate:plugin:check` — must exit 0 (per OT-Regen-Plugin and U-OP-4). If it surfaces in-scope diffs (unexpected), halt and report.
5. Verify OT-No-Code-Change: `git diff <phase-base>..HEAD -- 'packages/**/src/**' 'packages/**/tests/**'` — must be empty.
6. **No commit** (validate-only task; if barrel regen is reverted per step 3, the working tree is clean).
7. Update handoff at `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/.harness/sessions/changes--granular-task-routing--proposal/handoff.json` (per Final Steps section below).
8. **`[checkpoint:human-action]`** — Operator triggers `manage_roadmap` to update Granular Task→Backend Routing to `done` if there is a separate state surface (graph / dashboard) beyond the on-disk markdown that Task 13 already updated. The plan's `docs/roadmap.md` edit is sufficient for the durable markdown surface; if `manage_roadmap` also writes to a separate state file (e.g., `.harness/roadmap.json`), the operator must invoke it to reconcile. Planner default assumption: no separate state file exists (verified — `.harness/roadmap*` returned no matches at planning time), so this checkpoint is a no-op confirmation in the common case.

---

## Final Steps (after Task 14)

1. **Approval gate.** Before writing the plan file, confirm via `emit_interaction` (type: `confirmation`): plan path, 14 tasks, ~70 min estimate.
2. **Write handoff** to `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/.harness/sessions/changes--granular-task-routing--proposal/handoff.json`. Required fields: `fromSkill: 'harness-planning'`, `phase: 'phase-8-planned'`, `summary`, `completed: []` (empty — execution hasn't started), `pending: <task list>`, `concerns` (the carry-forward items), `decisions` (U-OP-1..6 defaults), `contextKeywords`.
3. **Session summary.** Call `writeSessionSummary` with skill `harness-planning`, status `succeeded`, plan path, keyContext, next-step `harness-execution`.
4. **Transition suggestion.** `emit_interaction` with `type: 'transition'`, `completedPhase: 'planning'`, `suggestedNext: 'execution'`, `requiresConfirmation: true`. Quality gate checks: plan-written, harness-validate, observable-truths-traced, human-approved.

---

## Carry-forward (for handoff `concerns`)

- **Pre-existing barrel drift.** `packages/core/src/index.ts` has unrelated drift from `insights`, `validateBranchName`, `invalidateCheckState` exports that 5 prior phases (0/2/3/4/7) reverted from their scoped commits. Phase 8 continues that precedent (Task 14 step 3). Needs a dedicated cleanup PR scoped to the core package — surfaces here as a recurring concern, not a Spec-B problem.
- **Knowledge graph reindex.** Phase 8 ships durable knowledge surface (5 ADRs + 2 knowledge docs + new guide), but `harness scan` + `harness ingest` are deferred to autopilot DONE (per Spec 2 precedent). The new content will land in the graph on the next ingest run.
- **`manage_roadmap` (separate state surface).** If a `.harness/roadmap.json` or similar exists in some deployments and the executor finds it at execute time, it needs an explicit `manage_roadmap` invocation alongside the on-disk markdown edit. Planning-time inspection showed no such file in this worktree — flagged as conditional only.
- **README.md target location uncertainty (U-OP-6 / Task 11).** If the README has been restructured since planning and the orchestrator capabilities section no longer exists in recognizable form, executor pauses for operator input before improvising. The plan default (append after existing multi-backend reference) assumes the structure observed at planning time.

---

## Risks

- **R1 — Documentation coverage regression.** New knowledge docs introduce new public surfaces (`routing-resolution.md`, `routing-trace.md`); `harness check-docs` may flag unreferenced symbols. Mitigation: the OT-1 baseline floor is 84.0% (Phase 7 baseline). Plan content is additive (more docs ≥ more coverage), so the expected motion is upward. If `check-docs` regresses despite the addition, executor halts and reports (Task 14 step 2).
- **R2 — Concurrent ADR landings.** If another spec lands ADRs between plan-write and plan-execute, the 0028–0032 numbering needs re-scanning. Mitigation: documented as ASSUMPTION; re-numbering is mechanical, no content change (Task 1–5 just shift block start number).
- **R3 — CHANGELOG entry interleaving.** Task 12 inserts the new entry as the first bullet under `[Unreleased] > ### Added`. If a concurrent spec inserts before Task 12 lands, executor uses `git pull --rebase` and verifies the new entry remains correctly placed at the top — or accepts wherever the merge places it as long as the entry is under `[Unreleased] > ### Added`. Position within the section is conventional, not load-bearing.
- **R4 — Roadmap status mismatch.** Per U-OP-5, on-disk shows `planned` but the spec note says "already at in-progress." Mitigation: Task 13 changes whatever it finds to `done`. End state is the same.
- **R5 — Markdown link integrity.** Many new ADRs cross-reference each other and the new knowledge doc. `harness check-docs` validates link integrity; if any link target is mis-typed (e.g., wrong filename), check-docs will surface it at Task 14 step 2.

---

## Approval

After review, confirm via `emit_interaction` (`type: confirmation`, `text: "Approve Phase 8 plan (14 tasks, ~70 min) for execution?"`). On approval, plan is written to `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/docs/changes/granular-task-routing/plans/2026-05-26-phase-8-docs-adrs-plan.md` and harness-execution is invoked with the session slug `changes--granular-task-routing--proposal`.
