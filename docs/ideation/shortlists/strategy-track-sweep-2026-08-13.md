---
batch_label: strategy-track sweep (6 confirmed STRATEGY.md tracks)
batch_slug: strategy-track-sweep
pinned_date: 2026-08-13
themes: 6
themes_verified: 6
themes_thin: 0
themes_parked: 0
themes_rejected: 0
count_per_theme: 10
per_theme_cut: 3
global_cap: 10
objection_policy: none
novelty_lookback_days: 90
concurrency: 2
strategy_grounded: true
strategy_path: STRATEGY.md
all_os_ci: not-applicable (fleet produces no code or PR)
filed: nothing
committed: nothing
---

# Ideate-Fleet Curated Shortlist — strategy-track sweep (2026-08-13)

Wave-1 execute lane of `ideate-fleet`, dispatched by `fleet-command`. Six STRATEGY.md tracks were each run through the **real** `harness-ideate` pipeline in its own git worktree (concurrency 2), producing one ranked artifact per theme (10 candidates each). Every shortlist row traces to a **verified** per-theme artifact collected byte-identical into `docs/ideation/`, and every score below was **independently re-derived** by the orchestrator from the artifact's own impact/confidence/effort values — not taken from any subagent's self-report.

**Nothing was filed. Nothing was committed, staged, or pushed.** This shortlist and the six collected artifacts are ordinary working-tree changes. The pick is the human's act; route a pick to `harness-brainstorming` (to spec one) or to the roadmap (to enqueue several).

## Ranked shortlist (10 of 18 preselected; reserved-slot rule applied)

| #   | Premise                                                                                                                                         | Theme                        | Re-derived score (base → final) | Standing objection (one line)                                                                                                                                                                                        | Novelty                                                                                                 | Artifact                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1   | Auto-derive a plain-language UAT checklist from the spec's acceptance section                                                                   | full-lifecycle-reach         | (3×3)/1 = 9.00 → 9.00           | Value is inherited from acceptance-criteria quality; a spec of implementation tasks yields un-adjudicable items and false "human-edge-covered" confidence.                                                           | novel (adjacent to `uat-user-sign-off-loop`, `acceptance-eval`; neither derives the checklist)          | [full-lifecycle-reach](../full-lifecycle-reach-role-shap-2026-08-13.md)         |
| 2   | Cross-client parity conformance test: every client plugin exposes the identical skill/command/agent/hook set the generator claims               | multi-client-portability     | (3×3)/1 = 9.00 → 9.00           | Checks generator self-consistency, not that each client actually loads/honors the fields at runtime — can pass green while a real Cursor/Gemini install is broken.                                                   | novel (no covering row; distinct from `add-harness-mcp-list-capabilities-cli`)                          | [multi-client-portability](../multi-client-portability-keep-2026-08-13.md)      |
| 3   | KG coverage gate fails CI when a package's load-bearing upstream nodes fall below a per-package density threshold                               | upstream-grounding           | (2×3)/1 = 6.00 → 6.75           | A raw node-count rewards volume over load-bearing-ness; a package can clear it with filler ADRs while the number goes green and grounding quality is unchanged.                                                      | novel (operationalizes the Context-Density KPI; no covering row)                                        | [upstream-grounding](../upstream-grounding-make-the-st-2026-08-13.md)           |
| 4   | Skills assert a minimum valid grounding set as an explicit precondition, degrading gracefully with a recorded warning                           | upstream-grounding           | (2×3)/1 = 6.00 → 6.75           | "Degrade gracefully" normalizes degradation until the warning is background noise; blocking instead interrupts flow mid-edit and users reach for a bypass.                                                           | novel (adjacent to `add-per-skill-capability-declarations`; distinct concern)                           | [upstream-grounding](../upstream-grounding-make-the-st-2026-08-13.md)           |
| 5   | `harness plugin doctor`: CLI diagnostic that verifies an installed plugin matches the freshly generated marketplace and prints actionable drift | multi-client-portability     | (2×3)/1 = 6.00 → 6.75           | A doctor is consulted only after something feels broken; the drift it diagnoses is better prevented by a `harness update` step, and its own logic rots un-exercised.                                                 | novel (distinct from `add-harness-mcp-list-capabilities-cli`)                                           | [multi-client-portability](../multi-client-portability-keep-2026-08-13.md)      |
| 6   | Weight skill recommendation by measured effectiveness                                                                                           | compounding-feedback-loops   | (2×3)/1 = 6.00 → 6.50           | Adoption telemetry is sparse per skill; Laplace smoothing over few invocations swings rankings on one or two runs and can steer agents away from a rarely-used-but-correct skill.                                    | novel (adjacent to `extend-skill-effectiveness-scorer`; new recommender wiring)                         | [compounding-feedback-loops](../compounding-feedback-loops-mec-2026-08-13.md)   |
| 7   | Cluster skill proposals into a ranked recurring-gap backlog                                                                                     | compounding-feedback-loops   | (2×3)/1 = 6.00 → 6.50           | Clustering only pays off at proposal volume the queue does not yet have; embedding-based clustering can mis-group near-synonym gaps and be less trustworthy than the raw list.                                       | novel (aggregation layer atop `activate-the-skill-proposal-pipeline`)                                   | [compounding-feedback-loops](../compounding-feedback-loops-mec-2026-08-13.md)   |
| 8   | Post-ship stakeholder outcome digest: delivered-vs-requested in plain language                                                                  | full-lifecycle-reach         | (2×3)/2 = 6.00 → 6.00           | Only as honest as the intent-to-delivery linkage beneath it, which does not durably exist yet (entry via candidate #5 in-theme); risks a fluent report that manufactures unearned closure.                           | novel (adjacent to `dashboard-v3-team-stakeholder-views`, `ship-aggregate-telemetry-synthesis-surface`) | [full-lifecycle-reach](../full-lifecycle-reach-role-shap-2026-08-13.md)         |
| 9   | `harness init --template <stack>` ships a working constraint set on first command                                                               | external-adoption-flywheel   | (2×3)/2 = 6.00 → 6.00           | Each template is a second copy of the evolving constraint surface; core schema changes silently drift templates to a broken first impression unless generated from the shipped source of truth + CI-covered.         | novel (adjacent to `init-scaffold-ecosystem-install-command`, `init-ecosystem-aftercreate`)             | [external-adoption-flywheel](../external-adoption-flywheel-mak-2026-08-13.md)   |
| 10  | Cross-craft finding dedup and composition in craft-fleet                                                                                        | ceiling-raising-llm-judgment | (2×3)/2 = 6.00 → 6.00           | A composed meta-finding can lose the `runId`+`rubricId`+location provenance the craft-fleet rewrite contract needs, or silently drop the lower-confidence contributor so a second objecting skill is never surfaced. | novel (refinement of shipped `craft-fleet`, PR #1241; not obviously present)                            | [ceiling-raising-llm-judgment](../ceiling-raising-via-llm-judgme-2026-08-13.md) |

Score basis: `base = (impact × confidence) ÷ effort` with `low|medium|high → 1|2|3`; `final = base + strategy-alignment bonus`, bonus applied only inside an exact base-score tie (0 ≤ bonus ≤ 0.75). Cross-batch ranking is by final score descending, ties broken by SELECT order then artifact order.

## Assumptions made

- **Derivation basis / merges.** The six themes are the six `STRATEGY.md` `Tracks` verbatim (present + valid, v2, 2026-07-01), confirmed as-is by the human via fleet-command's CONFIRM round. No disjointness merges were needed — the tracks are already disjoint. SELECT order (= strategic weight order) as confirmed: 1 full-lifecycle-reach, 2 upstream-grounding, 3 compounding-feedback-loops, 4 multi-client-portability, 5 external-adoption-flywheel, 6 ceiling-raising-llm-judgment.
- **Batch label.** No explicit invocation topic was supplied; per the member convention the batch would take the highest-weighted theme's focus, but this is a whole-strategy sweep, so the batch is labelled `strategy-track-sweep` for a readable, non-misleading filename. Recorded here for transparency.
- **Pinned batch date.** 2026-08-13 (UTC), used for every artifact filename and this shortlist.
- **Objection policy.** `none` — every candidate's single strongest objection stands as an accepted downside; none were answered/rebutted by the fleet.
- **Bounds in force.** count/theme 10 (clamped range [5,25]); per-theme cut 3; global cap 10; novelty lookback 90 days (PRs merged ≥ 2026-05-15); concurrency 2.
- **Reserved-slot rule.** 1 slot reserved for the highest-scoring survivor of each of the 6 non-thin themes; the remaining 4 slots filled by final score descending. Result: full-lifecycle-reach ×2, upstream-grounding ×2, multi-client-portability ×2, compounding-feedback-loops ×2, external-adoption-flywheel ×1, ceiling-raising-llm-judgment ×1. No cap raise needed (6 reserved ≤ 10).
- **Novelty sources (all available).** Open GitHub issues (135, via `gh`), roadmap rows (`docs/roadmap.d/`, 149 rows), and PRs merged in the 90-day window (via `gh search prs`). No source was unavailable, so there are **no `novelty-unknown` annotations**. "novel (adjacent to X)" means no tracked row/issue/PR **subsumes** the premise; adjacency is noted for the reader.

## Already-known drops (cited) + backfills

Six preselected candidates were dropped as already-tracked and each backfilled from the next below-cut candidate in-theme:

| Dropped candidate                                                | Theme                      | Covered by                                                                                                  | Backfilled with                                                                                |
| ---------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Product-requirements middle skill (BRD → traceable requirements) | full-lifecycle-reach       | roadmap `product-requirements-skill-close-the-prd-middle` (+ existing `harness:product-requirements` skill) | → next dropped too, see below                                                                  |
| Recorded human UAT sign-off wired as a ship gate                 | full-lifecycle-reach       | roadmap `uat-user-sign-off-loop-close-the-outcome-edge` (+ active worktree `feat/uat-signoff-loop`)         | Requirement→spec→outcome traceability edges (in-theme #5)                                      |
| Portable constraint-pack export/import                           | external-adoption-flywheel | roadmap `opt-in-constraint-packs`                                                                           | → next dropped too, see below                                                                  |
| Opt-in telemetry-driven adoption insights view                   | external-adoption-flywheel | roadmap `ship-aggregate-telemetry-synthesis-surface` (+ External-Adoption telemetry KPI)                    | Skill marketplace `publish`/`install` (in-theme #5)                                            |
| `routing.policy`/backend capabilities accepted from config file  | multi-client-portability   | roadmap `adaptive-model-routing` (AMR config surface)                                                       | Client-agnostic skill authoring: one canonical skill → all mirrors + Gemini TOML (in-theme #4) |
| Snapshot skill-effectiveness baselines with drift thresholds     | compounding-feedback-loops | roadmap `skill-regression-evaluator`                                                                        | Push-inject top-K similar historical outcomes into new-run prompts (in-theme #4)               |

Note: the two full-lifecycle and two external-adoption drops cascaded, so each theme's cut refilled from rank 5.

## Preselected-but-not-shortlisted (survived cut, below the cap)

These are top-3 survivors that did not fit the cap of 10. They remain in their linked artifacts, un-promoted:

- full-lifecycle-reach: Requirement→spec→outcome traceability edges in the knowledge graph (final 3.75)
- upstream-grounding: Grounding provenance recorded per skill-invocation in the black-box record (final 4.00)
- compounding-feedback-loops: Push-inject top-K similar historical outcomes into new-run prompts (final 3.75)
- multi-client-portability: Client-agnostic skill authoring — one canonical skill → all mirrors + Gemini TOML (final 5.25)
- external-adoption-flywheel: `harness assess --adopt` pre-adoption readiness report (final 4.50); Skill marketplace `publish`/`install` (final 2.75)
- ceiling-raising-llm-judgment: Golden-set rubric regression harness for judgment drift (final 4.50); Self-tuning taste-calibration noise floor in craft-fleet (final 4.00)

## Per-theme outcome summary

| Theme                        | Ran? | Generated | Verdict  | Shortlisted | Already-known | Below-cut remain in artifact |
| ---------------------------- | ---- | --------- | -------- | ----------- | ------------- | ---------------------------- |
| full-lifecycle-reach         | yes  | 10/10     | verified | 2           | 2             | 6                            |
| upstream-grounding           | yes  | 10/10     | verified | 2           | 0             | 8                            |
| compounding-feedback-loops   | yes  | 10/10     | verified | 2           | 1             | 7                            |
| multi-client-portability     | yes  | 10/10     | verified | 2           | 1             | 7                            |
| external-adoption-flywheel   | yes  | 10/10     | verified | 1           | 2             | 7                            |
| ceiling-raising-llm-judgment | yes  | 10/10     | verified | 1           | 0             | 9                            |

All-OS CI: **not applicable** for every theme (the fleet produces no code and no PR). Each verdict is backed by an independently-read artifact and an independently-recomputed ranking, never a self-report. Cross-theme dedup backstop: 0 collapses (themes disjoint). Thin: 0. Parked: 0. Rejected: 0.

## What was not done

Nothing was filed — no issue, roadmap row, spec, plan, ADR, or PR. Nothing was committed, staged, or pushed. The six worktrees used for per-theme isolation were removed after their artifacts were collected. This shortlist and the six per-theme artifacts under `docs/ideation/` are working-tree changes the human keeps or discards.
