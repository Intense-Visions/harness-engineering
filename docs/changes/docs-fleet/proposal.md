# docs-fleet — Proposal (brainstorming stage)

- **Issue:** #1230 (roadmap; milestone "Fleet Family — Batch Orchestration")
- **Route:** feature (new capability → `harness-brainstorming` → `harness-autopilot`)
- **Slug:** docs-fleet
- **Epic:** #1194 (the `-fleet` skill family)

## Problem

Working a documentation-drift/coverage backlog down by hand is a per-area attention slog: every drifted or undocumented area of the codebase must be found, its remediation scoped, driven through `harness-docs-pipeline` to convergence, and turned into a reviewable PR — one at a time, with a human present throughout. For a codebase with dozens of drifted docs and undocumented modules the human's attention, not the machinery, is the bottleneck. Every other SDLC stage in the `-fleet` family has a fan-out orchestrator (`roadmap-fleet` for build, `pr-fleet` for land, `cleanup-fleet` for entropy, `test-fleet` for coverage, …); documentation freshness does not, so a large refactor that drifts docs across many modules still forces the per-area slog.

## Proposed solution

`docs-fleet` — a **quality-queue** member of the `-fleet` family that fans documentation-drift remediation across the codebase and returns a **batch of scoped doc-fix PRs** for one bulk human review. It is the documentation-floor analog of the existing members: it enumerates the drift/coverage backlog by composing the existing detectors, runs the real per-area pipeline autonomously and in isolation for each area, verifies each result independently, and never auto-merges.

It is modeled **exactly** on the shared `-fleet` spine (`docs/reference/fleet-family.md`) and on the closest existing member, `cleanup-fleet` (both are quality-queue, per-target/per-area convergence-remediation fan-outs off the core spine). It defines only what is its own: its queue, its triage taxonomy, its per-area pipeline, its terminal act, and its domain rationalizations. Everything else — the five-phase SELECT→CONFIRM→DISPATCH→VERIFY→REPORT skeleton, the concurrency governor, the per-leaf context budget, the artifact+all-OS-CI verification discipline, the base-freshness clause, the worktree fan-out with the `.claude/` push caveat, the canonical `FleetHandoffRecord`, and the never-silent-merge invariant — is inherited from the spine, referenced not restated.

### Queue (SELECT)

Compose, never reimplement:

- `detect-doc-drift` — code-vs-doc drift (renames, deleted-code references, changed behaviour, moved code).
- `harness check-docs` — the mechanical documentation floor (coverage, broken links, stale sections).
- `harness-docs-pipeline` in report-only mode — its DETECT + AUDIT phases produce the combined drift+gap finding set.
- a git-churn pass over `docs/` and the source it documents — areas whose code moved but whose docs did not.

Findings fold into **doc-fix areas** (one coherent module/doc cluster = one PR), classified by fix class (`safe`/`probably-safe`/`unsafe`, mapping to `harness-docs-pipeline`'s existing fix-safety taxonomy), cross-checked against merged/open PRs (already-fresh → drop), and scored by composite `doc-churn-gap × drift-density × coverage-gap` via `roadmap-pilot`-style impact scoring.

### Per-area pipeline (DISPATCH)

`harness-docs-pipeline --fix` in convergence mode, scoped to the area's modules/docs, in a worktree-isolated subagent — the real pipeline, whose convergence record (drift resolved, `harness check-docs` passing) is what VERIFY checks. Unsafe documentation changes (behavioural rewrites, deleted-code section removals, complex-module authoring) park per-area and surface in REPORT.

### Terminal act (REPORT)

A one-row-per-area batch summary of verified, merge-ready doc-fix PRs (each with an assumptions-made note), rejected/failed areas with reasons, parked unsafe remediations, and dropped already-fresh areas citing the resolving PR. **Never merges** — the human (optionally via `pr-fleet`) lands the batch.

## Key design decision — the boundary vs cleanup-fleet and craft-fleet

The roadmap shard (#1230) recorded a deferred blocker: docs-fleet "overlaps `cleanup-fleet` (drift floor) and `craft-fleet` (docs-craft ceiling); likely fold is drift to cleanup-fleet and quality to craft-fleet." This proposal resolves it as a **standalone member with an explicit floor scope**, not a fold, for three reasons:

1. **Different queues.** `cleanup-fleet`'s queue is _code_ entropy/hotspots (dead code, structural risk); a stale doc is not a code hotspot and would never surface from `hotspot-detector`/`cleanup-dead-code`. `craft-fleet`'s `docs-craft` queue is LLM-judgment _prose quality_ — whether a doc that already passes the floor _teaches well_; it presupposes the doc exists and is fresh. Neither neighbour's detectors enumerate doc-drift/coverage, so folding would force one of them to grow a second, foreign detection engine — exactly the "drift waiting to happen" the family forbids.
2. **Floor vs ceiling is the family's own line.** docs-fleet enforces that documentation _exists, matches the code, and links resolve_ (the mechanical floor `harness-docs-pipeline` remediates). `docs-craft` critiques whether it _reads well_ (the ceiling). Collapsing floor and ceiling into one fleet is the same category error the family avoids everywhere else (e.g. `security-scan` floor vs `security-craft` ceiling).
3. **Symmetry.** Every other stage/quality queue has its own member; documentation is the conspicuous gap. A standalone member keeps the conveyor and the quality-queue set complete and each member's queue disjoint.

The SKILL.md states this boundary explicitly (a "Boundary — docs-fleet vs cleanup-fleet vs craft-fleet" section and a Rationalization guarding scope-creep into prose quality), which is what keeps the three queues non-overlapping in practice.

## ADR — not warranted

No new ADR. docs-fleet introduces no new family-level decision: the fan-out architecture (ADR 0087), the front-load/park-unforeseen interaction model (ADR 0088), item-type routing (ADR 0103, N/A here — docs-fleet is a single-pipeline quality-queue member, not a build-shaped router), and the claim-lease (ADR 0105, docs-fleet uses only its open-PR-cross-check degradation since a doc area carries no GitHub-native id at SELECT) are all already decided. Like the other quality-queue members (`cleanup-fleet`, `test-fleet`, `craft-fleet`), docs-fleet ships as a member with a proposal + plan and _references_ the shared ADRs rather than adding one. The one genuine decision — standalone vs fold — is resolved above and belongs in this proposal, not a family ADR, because it is scoped to this member.

## Scope

- **In:** `agents/skills/claude-code/docs-fleet/{SKILL.md,skill.yaml}`; the three platform mirror symlinks; regenerated slash commands (all platforms) + skills/tool catalogs via the standard generators.
- **Out:** any executable orchestrator code (docs-fleet is skill-driven fan-out, like every other member — the spine's `Workflow` primitive is the named future deterministic upgrade, not this slice); reimplementing any detector; landing/merging (that is `pr-fleet`); prose-quality elevation (that is `craft-fleet`).

## Assumptions

- The parent roadmap-fleet directive resolves the deferred fold-vs-standalone blocker in favour of **standalone member** (this proposal argues why that is correct); if a future decision folds documentation freshness elsewhere, this member is the reference for what that fold must preserve.
- Platform mirrors are symlinks to `agents/skills/claude-code/docs-fleet`; editing the canonical SKILL.md updates all four, and the gemini/antigravity `.toml` + per-platform slash commands regenerate via the generators/pre-commit.
- No publishable package `src/` is touched, so an **empty changeset** is the honest no-release acknowledgement (the changeset gate only requires one for `packages/<pkg>/src/` or `package.json` changes).

## Success criteria

See the SKILL.md "Success Criteria" section — the acceptance surface is the skill contract itself: a confirmed batch of N areas yields up to N verified doc-fix PRs, exactly one up-front human round, every PR carries an assumptions note, unsafe changes park, already-fresh areas drop with citations, never auto-merges, degrades gracefully, concurrency capped, and no self-report accepted as verification. `harness skill validate docs-fleet` passes and the freshness gates (skills/tool catalogs, plugin slash commands) stay green.
