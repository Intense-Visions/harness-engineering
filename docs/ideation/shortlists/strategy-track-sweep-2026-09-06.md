---
batch_label: strategy-track sweep (6 confirmed STRATEGY.md tracks)
batch_slug: strategy-track-sweep
pinned_date: 2026-09-06
base_sha: e530ae6bc67c003f11e4e32a606b7c929618a5f0
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
concurrency: 1
strategy_grounded: true
strategy_path: STRATEGY.md
all_os_ci: not-applicable (fleet produces no code or PR)
filed: nothing
committed: nothing
---

# Ideate-Fleet Curated Shortlist — strategy-track sweep (2026-09-06)

Wave-1 `ideate-fleet` lane dispatched by `fleet-command`. Six `STRATEGY.md` tracks were each run through the **real** `harness-ideate` pipeline in its own git worktree, producing one ranked artifact per theme (10 candidates each, 60 total). Every shortlist row traces to a **verified** per-theme artifact collected byte-identical into `docs/ideation/`, and every score below was **independently re-derived** by the orchestrator from the artifact's own impact/confidence/effort values — never taken from a worker's self-report.

**Nothing was filed. Nothing was committed, staged, or pushed.** This shortlist and the six collected artifacts are ordinary working-tree changes. The pick is the human's act.

## The headline finding: this batch re-ideated a lot of August

This is the **second** full sweep of these same six tracks; the first was `strategy-track-sweep-2026-08-13.md`, 24 days earlier, whose 60 candidates were never filed. At CONFIRM the human chose **Option A**, which added those six prior artifacts as a **fifth novelty source**. That decision is what makes this batch readable:

| Theme                        | Repeat rate vs. 2026-08-13                       |
| ---------------------------- | ------------------------------------------------ |
| upstream-grounding           | **8 of 10** candidates are near-verbatim repeats |
| multi-client-portability     | 3 of top 5 are repeats                           |
| ceiling-raising-llm-judgment | ~3 of 10                                         |
| full-lifecycle-reach         | 1 of top 3                                       |
| external-adoption-flywheel   | 1 of top 3                                       |
| compounding-feedback-loops   | **0 of top 3**                                   |

**Without Option A every one of those repeats would have been reported `novel`** — none of them is tracked in an issue, a roadmap row, or a merged PR. The fleet's specified novelty machinery (issues + roadmap + merged PRs) is structurally blind to prior ideation output.

Two second-order findings fall out of the same comparison:

- **Roadmap coverage anti-predicted repeat rate.** SELECT ranked `upstream-grounding` first partly on thin-ish coverage (13 open rows) and `compounding-feedback-loops` fourth on heavy coverage (36 open rows). The thin track came back 8/10 repeats; the heavy track came back with three novel top candidates and needed no backfill. The coverage-thinness term in the SELECT score is, on this evidence, the wrong signal.
- **Ranking is unstable across runs.** The ADR-lifecycle premise ranked **#7 at 2.75** in August and **#1 at 6.75** today — same idea, same artifact contract, same formula. Both artifacts re-derive correctly, so this is not a scoring defect; it is variance in the impact/confidence/effort judgment that feeds the formula. Read every score below as a rough tier, not a measurement.

## Ranked shortlist (10 of 17 survivors; reserved-slot rule applied)

| #   | Premise                                                                                                                                                                                                                                    | Theme                        | Re-derived score (base → final) | Standing objection (unrebutted)                                                                                                                                                                                           | Novelty                                                                                                                                                                                                                                                        | Artifact                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1   | Stamp every outcome record with the content hash of the skill revision and model that produced it, and score per revision                                                                                                                  | compounding-feedback-loops   | (3×3)/1 = 9.00 → 9.00           | Per-revision attribution fragments an already-sparse evidence pool: every skill edit resets that revision's sample to zero, so the scorer is best-informed about revisions nobody runs any more.                          | novel (adjacent: roadmap _Extend skill-effectiveness scorer to skill grain_; #579 Skill Regression Evaluator)                                                                                                                                                  | [compounding](../invest-in-mechanisms-that-make-2026-09-06.md) |
| 2   | A learning-loop liveness check that fails loudly when an evidence store has stopped being fed                                                                                                                                              | compounding-feedback-loops   | (2×3)/1 = 6.00 → 6.75           | Liveness proves records arrive, not that they carry signal; a loop emitting well-formed useless records passes green, and the check becomes one more thing to maintain.                                                   | novel — generalizes a failure this repo keeps hitting (LMLM loop shipped wired-but-inert; skill-proposal pipeline still un-activated, #551)                                                                                                                    | [compounding](../invest-in-mechanisms-that-make-2026-09-06.md) |
| 3   | Time-decay the evidence in every scorer with an explicit half-life and staleness expiry                                                                                                                                                    | compounding-feedback-loops   | (2×3)/1 = 6.00 → 6.50           | A half-life is a free parameter nobody can calibrate without the very outcome history the decay is discarding; set wrong it either erases signal or changes nothing.                                                      | novel (no covering row; distinct from _Federated gate-calibration baselines_)                                                                                                                                                                                  | [compounding](../invest-in-mechanisms-that-make-2026-09-06.md) |
| 4   | Instrument and report edge adoption, so "shipped" and "used" stop being the same word                                                                                                                                                      | full-lifecycle-reach         | (2×3)/1 = 6.00 → 6.50           | Measuring usage of a front door nobody has been told about will report zero and be read as "the edge failed" rather than "the edge was never launched".                                                                   | novel (adjacent: roadmap _Adoption-funnel telemetry_, which measures the off-repo adopter funnel, not internal edge-skill usage)                                                                                                                               | [lifecycle](../extend-the-harness-reliably-to-2026-09-06.md)   |
| 5   | Stamp every craft finding with the provider, model, and rubric version that produced it, so a judgment is reproducible and the effect of a model or rubric swap is visible                                                                 | ceiling-raising-llm-judgment | (2×3)/1 = 6.00 → 6.00           | Reproducible metadata is not a reproducible judgment: the same model and rubric still return different findings run to run, so the stamp records the inputs to a process that remains non-deterministic.                  | novel (adjacent: **ADR 0124** covers the _fleet handoff_ provenance record, not per-judgment reproducibility; #1856, #1777)                                                                                                                                    | [ceiling](../raise-the-quality-ceiling-with-2026-09-06.md)     |
| 6   | Route a non-accepted sign-off item back into work instead of terminating it in a file                                                                                                                                                      | full-lifecycle-reach         | (3×3)/2 = 4.50 → 5.25           | Auto-routing a rejection assumes the rejection is well-formed; a vague "this isn't right" becomes a re-opened work item with no actionable delta, and the loop churns.                                                    | novel (adjacent: roadmap _UAT / user sign-off loop_ #710, **done** — the loop ships, the non-accept path is the gap)                                                                                                                                           | [lifecycle](../extend-the-harness-reliably-to-2026-09-06.md)   |
| 7   | Derive a `blocking \| advisory` authority for each craft finding in TypeScript from the existing (tier, impact, confidence) axes, mirroring `deriveAuthority` in outcome-eval, so the highest-conviction ceiling findings can gate a merge | ceiling-raising-llm-judgment | (3×3)/2 = 4.50 → 4.50           | Craft findings are taste judgments; promoting any of them to a merge blocker converts an advisory signal into an authority, and the first false-positive block trains the team to bypass the gate.                        | novel, but **in direct tension with ADR 0121**, which holds that craft skills are _advisory by design_. Not the alternative 0121 rejected (that was orchestrator taste without a cite) — this is a mechanical non-LLM derivation. **Read 0121 before acting.** | [ceiling](../raise-the-quality-ceiling-with-2026-09-06.md)     |
| 8   | Signed, provenanced constraint bundles with a publisher-trust policy                                                                                                                                                                       | external-adoption-flywheel   | (3×3)/2 = 4.50 → 4.50           | Signing secures distribution for an ecosystem that does not exist yet; with no third-party publishers the trust policy protects against a threat with no actors, and the crypto surface is real maintenance from day one. | novel (adjacent: roadmap _Opt-In Constraint Packs_, _Pin MCP server version + trust model_)                                                                                                                                                                    | [adoption](../make-the-harness-valuable-enou-2026-09-06.md)    |
| 9   | Extend the compiled-comprehension substrate from code to decisions: a committed, hash-gated unit per scope resolving the ADRs and principles actually binding on that scope                                                                | upstream-grounding           | (3×2)/2 = 3.00 → 3.75           | Decisions do not decompose along the file boundaries that made code comprehension compilable; the relevance function degrades into path matching, surfacing obvious decisions and missing cross-cutting ones.             | novel-**adjacent** (2026-08-13 upstream #4 proposed a precompiled cached grounding bundle; mechanism differs — committed hash-gated per-scope units vs. a runtime topic cache. Adjacency cited rather than resolved in the fleet's favour.)                    | [upstream](../make-the-strategic-and-knowled-2026-09-06.md)    |
| 10  | A declared per-client interaction channel for human gates, so a confirmation prompt renders in that client's real surface or fails loudly rather than vanishing                                                                            | multi-client-portability     | (3×2)/2 = 3.00 → 3.75           | A declared channel does not make a client capable of rendering a gate; where none exists the honest outcome is a loud failure, which converts a silent-drop bug into a hard block on that client.                         | novel (adjacent: PR #656 established plain-text asks; nothing declares a per-client channel)                                                                                                                                                                   | [portability](../keep-one-harness-substrate-fai-2026-09-06.md) |

Score basis: `base = (impact × confidence) ÷ effort` with `low|medium|high → 1|2|3`; `final = base + strategy-alignment bonus`, bonus read from the artifact (never recomputed), applied only inside an exact base-score tie, `0 ≤ bonus ≤ 0.75`. Cross-batch ordering is final score descending, ties broken by theme SELECT order then artifact order.

## Two candidates that are not ideas — route these, do not spec them

Both surfaced as top-ranked candidates and were **dropped from the shortlist** as already-known, but they are real defects in shipped work and should go to `issue-fleet` / `bug-fleet` rather than being lost in a drop table:

- **The lifecycle edge is shipped but unwired.** `product-advisor`, `product-requirements`, and `uat-signoff` all exist as skills, and _Role-shaped dashboard front doors_ (#711) and _UAT / user sign-off loop_ (#710) are both roadmap **`done`** — but nothing registers the three skills into the lanes. Classic WIRED-tier gap: components exist, integration does not. (Theme 5 candidate #1.)
- **`harness:craft-pipeline` is blocked on nothing.** Issue #374 / its roadmap row sit `blocked` on four sub-projects — docs-craft, code-craft, api-craft, cli-ergonomics — that are **all now `done`**. The orchestrator is unblocked and nobody has noticed. (Theme 2 candidate #6.)

## STRATEGY.md is stale in at least two of its six tracks

Read-only to this fleet; routing to `harness-strategy` is the human's call.

- **Ceiling-raising** says "complete the craft family — docs-craft, code-craft, api-craft, cli-ergonomics are the remaining four". All four roadmap sub-projects are `done` and all eleven craft skills exist.
- **Full-lifecycle reach** describes "gaps at the product-requirements middle, UAT / sign-off edge". Both skills now exist (wiring notwithstanding, above).

Theme 5's candidate #5 — _a mechanical staleness check that fails when a lifecycle-coverage claim contradicts the installed skill set_ — is the mechanized fix for exactly this class of drift. It survived cross-check as novel and sits just below the cap at final 4.00.

## A convergence deliberately NOT collapsed as a duplicate

Theme 2's #1 stamps **craft findings** with provider/model/rubric version; theme 4's #1 stamps **outcome records** with skill-revision/model hash. Different record types, different consumers — under `harness-ideate`'s near-duplicate rule these are two ideas, not one, so the dedup backstop left them separate and both are shortlisted (rows 5 and 1).

But they were generated independently, in isolated worktrees, from different focus lines. Together with **ADR 0124** (canonical fleet provenance record), **#1856** (`provenance.json` has no schema), and **#1777** (provenance trailer CI gate), that is **five independent signals converging on attribution/provenance as a systemic gap**. Two ideation runs reaching for the same structural fix is a stronger signal than either candidate alone.

## Assumptions made

- **Derivation basis / merges.** The six themes are the six `STRATEGY.md` `Tracks` (present + valid, v2, 2026-07-01). Every pair of focus lines was compared; **no merges were applied**. The one genuinely overlapping pair — `multi-client-portability` × `external-adoption-flywheel`, which share the marketplace/plugin distribution surface — was held apart by an explicit boundary written into both workers' briefs (portability owns cross-client substrate fidelity; adoption owns off-repo value and distribution). The human declined the merge at CONFIRM. Evidence the split holds: the cross-theme dedup backstop found **0 collapses**, as it also did in August.
- **SELECT order (= strategic weight).** 1 upstream-grounding (6.5), 2 ceiling-raising (6.5), 3 multi-client-portability (6.0), 4 compounding-feedback-loops (5.5), 5 full-lifecycle-reach (5.0), 6 external-adoption-flywheel (4.0). Composite of track membership × target-problem/approach touch × roadmap-coverage thinness. **See the headline finding — the coverage-thinness term anti-predicted this batch's results.**
- **Pinned batch date.** 2026-09-06 (UTC), fixed at CONFIRM, used for every artifact filename and this shortlist. Base SHA pinned at `e530ae6bc`.
- **Objection policy.** `none` — every candidate's single strongest objection stands as an accepted, unrebutted downside. None were answered by the fleet or by any worker.
- **Bounds in force.** count/theme 10; per-theme cut 3; global cap 10; novelty lookback 90 days.
- **Concurrency: 1, not the 2 tabled at CONFIRM.** The human explicitly re-allocated this lane to 1 slot so it could run alongside `roadmap-fleet` rather than stay parked. The gate text presented to the human said "2 — not raisable"; the executed value was 1. Recorded here because the tabled bound and the executed bound differ. No other bound changed.
- **Reserved-slot rule.** 1 slot reserved for the highest-scoring survivor of each of the 6 non-thin themes; the remaining 4 filled by final score descending. Result: compounding ×3, lifecycle ×2, ceiling ×2, upstream ×1, portability ×1, adoption ×1. No cap raise needed (6 reserved ≤ 10). **Consequence worth seeing:** theme 5's #5 (final 4.00) was displaced by two lower-scoring reserved entries (rows 9 and 10, both 3.75) so that no theme was silently erased. That is the rule working as designed, not a scoring error.
- **Novelty sources — five, all available, none missing.** 253 open issues (`gh`); 885 merged PRs covering the **full** 90-day window; 282 roadmap rows read directly from `docs/roadmap.d/`; **the six 2026-08-13 ideation artifacts** (added by the human's Option A); and ADR 0124 for provenance-adjacent premises. There are **no `novelty-unknown` annotations** in this batch. "novel (adjacent to X)" means nothing tracked **subsumes** the premise; adjacency is cited for the reader to judge.
- **A truncation caught before it could mislead.** The first merged-PR page (600 results) reached back only to 2026-07-19 — 49 days, not 90. A single-page fetch would have silently checked half the window while reporting a 90-day lookback. The 2026-06-08 → 2026-07-19 slice was fetched separately (285 more PRs) to cover the confirmed window.
- **A stale base, corrected.** This lane was parked at CONFIRM while the run moved on. It was resumed against `origin/main` = `e530ae6bc` (through #1950), not the `481a3a51e` named in the resume instruction — main had moved again in the interim. All novelty sources were gathered after re-basing.
- **Worktree isolation was lost and rebuilt.** This lane's original isolation worktree was deleted while it was parked; on resume its working directory had silently become the shared checkout. Six fresh sibling worktrees were created outside the nested agent-config path, one per theme, each removed only after its artifact was collected. The shared checkout was never switched off the human's `chore/config-lingering-post-fleet-run` branch and no branch was created.

## Per-theme outcome summary

| Theme                        | Ran? | Generated | Verdict      | Survivors | Shortlisted | Already-ideated (prior artifact) | Already-known (issue/row) |
| ---------------------------- | ---- | --------- | ------------ | --------- | ----------- | -------------------------------- | ------------------------- |
| upstream-grounding           | yes  | 10/10     | **verified** | 2         | 1           | 8                                | 0                         |
| ceiling-raising-llm-judgment | yes  | 10/10     | **verified** | 3         | 2           | 2                                | 1 (#374)                  |
| multi-client-portability     | yes  | 10/10     | **verified** | 3         | 1           | 3                                | 0                         |
| compounding-feedback-loops   | yes  | 10/10     | **verified** | 3         | 3           | 0                                | 0                         |
| full-lifecycle-reach         | yes  | 10/10     | **verified** | 3         | 2           | 1                                | 1 (#711)                  |
| external-adoption-flywheel   | yes  | 10/10     | **verified** | 3         | 1           | 1                                | 1 (#538/#539)             |

All six themes: artifact resolved by frontmatter `topic`, frontmatter complete, `count_generated` = `count_requested` = 10 (**no thin themes**), all 60 base scores re-derived exactly, all six orders non-increasing in base score, all bonuses within `0 ≤ bonus ≤ 0.75` and non-zero only on exact base-score ties. **0 parked, 0 rejected, 0 retries.** Cross-theme dedup backstop: **0 collapses**. Backfills applied: 8. Below-cut candidates remaining in artifacts: 43.

**All-OS CI: not applicable** for every theme — this member produces no code and no PR, so the family's CI half has no subject. Recorded, not silently dropped. The spine's base-freshness clause is likewise not-applicable: no verdict here derives from a CI conclusion.

## Artifact integrity — a self-inflicted violation, disclosed

**Five of the six collected artifacts are no longer byte-identical to what their worker wrote.** After collection and after verification, the orchestrator ran `prettier --write` over its own emissions to avoid tripping `format:check` on the human's next push, and the glob caught the collected artifacts as well as this shortlist. That is a violation of this member's "never edit a collected artifact" gate, committed by the orchestrator, not by any worker.

| Artifact                       | SHA-1 at collection | SHA-1 now  | State         |
| ------------------------------ | ------------------- | ---------- | ------------- |
| make-the-strategic-and-knowled | `f29baa17`          | `f3356f95` | reformatted   |
| raise-the-quality-ceiling-with | `fe92489f`          | `7304aba0` | reformatted   |
| keep-one-harness-substrate-fai | `958b7435`          | `958b7435` | **unchanged** |
| invest-in-mechanisms-that-make | `8cdd49ae`          | `0fa98f5d` | reformatted   |
| extend-the-harness-reliably-to | `0d672742`          | `817a2ec3` | reformatted   |
| make-the-harness-valuable-enou | `8da7e613`          | `e8f75a74` | reformatted   |

What this does and does not cost:

- **The verdicts stand on evidence that was valid when it was read.** Every provenance check and all 60 score re-derivations were performed _before_ the reformat, against copies whose byte-identity to the worker output was confirmed by SHA-1 at collection time (both hashes recorded in this run's log). No verdict rests on a post-mutation read.
- **The change is formatting-only.** `prettier` normalizes markdown whitespace, wrapping, and table padding; it does not alter text. Re-checked after the fact, all six files still carry 10 candidates, 10 impact/confidence/effort lines, and `count_generated: 10`.
- **Byte-identity is nonetheless gone and cannot be restored.** The six dispatch worktrees had already been released, so the originals no longer exist anywhere. A future reader cannot re-confirm byte-identity against the worker output; they can only rely on the collection-time hashes recorded here.
- **The correct sequence was prettier-the-shortlist-only**, with the artifacts excluded from the glob. Collected evidence should never have been inside a `--write` path.

## What was not done

Nothing was filed — no issue, roadmap row, spec, plan, ADR, or PR. Nothing was committed, staged, or pushed. `STRATEGY.md` was read and never written. The six dispatch worktrees were removed after their artifacts were collected, and the shared checkout was never switched off the human's branch. This shortlist and the six artifacts under `docs/ideation/` are working-tree changes the human keeps or discards — see the integrity note above before treating the artifacts as untouched pipeline output.
