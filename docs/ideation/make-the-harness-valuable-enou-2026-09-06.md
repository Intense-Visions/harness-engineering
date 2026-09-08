---
topic: 'Make the harness valuable enough off-repo that the constraints-as-code thesis gets tested at scale — first-run adopter value, constraint sharing, courseware, and telemetry-driven adoption insight.'
generated_at: '2026-09-06T16:50:16Z'
strategy_grounded: true
strategy_path: STRATEGY.md
count_requested: 10
count_generated: 10
ranking_formula: '(impact × confidence) ÷ effort; strategy-alignment tiebreaker (max +0.75) applied only when |Δbase_score| ≤ 0.05'
---

# Ideation: Make the harness valuable enough off-repo that the constraints-as-code thesis gets tested at scale — first-run adopter value, constraint sharing, courseware, and telemetry-driven adoption insight.

## Inputs

- Topic: Make the harness valuable enough off-repo that the constraints-as-code thesis gets tested at scale — first-run adopter value, constraint sharing, courseware, and telemetry-driven adoption insight.
- Generated: 2026-09-06T16:50:16Z
- Count requested: 10
- Strategy grounding: enabled — `STRATEGY.md` present and valid; matched track **External adoption flywheel** ("make the harness valuable enough off-repo that the constraints-as-code thesis gets tested at scale").
- Objection policy: **none** — every candidate's strongest objection is recorded as standing and unrebutted. An accepted downside is a real signal, not a gap.

## Scoring notes

- `low | medium | high` map to `1 | 2 | 3`. `base_score = (impact × confidence) ÷ effort`, range `[≈0.33, 9.0]`.
- Strategy-alignment bonus: `+0.5` when the premise plausibly advances a `Tracks` bullet, `+0.25` when premise or persona references `Target problem` / `Our approach` / `Who it's for`. Maximum `+0.75`.
- The bonus is **bounded**: applied only where the adjacent base-score delta is `≤ 0.05`. It is recorded for every candidate for transparency, but it reorders nothing outside a tie window. Two tie windows occurred this run — the three-way tie at `3.00` and the two-way tie at `2.00`.

## Grounding against existing work

This track is the most heavily covered in the repo (~107 roadmap rows, ~65 still open), and several of the obvious moves have already shipped rather than merely being queued. Candidates below were generated against that reality:

- **Constraint sharing already exists** — `packages/core/src/constraints/sharing/` ships `bundle.ts`, `manifest.ts`, `lockfile.ts`, `merge.ts`, `remove.ts`, `write-config.ts`, alongside `harness install-constraints` / `uninstall-constraints` and shipped opt-in packs (`packages/core/src/constraints/packs.ts`, row `opt-in-constraint-packs` = done). So "build export/import" is not additive. What is missing is everything _around_ a bundle: integrity, provenance, discovery, and any evidence that an imported pack did anything.
- **Courseware already has a one-shot generator** — `packages/cli/src/commands/blueprint.ts` runs `ProjectScanner` → `BlueprintGenerator` → a static `docs/blueprint/index.html`. So "build blueprint" is not additive; turning a dump into a sequenced, checkable, freshness-aware path is.
- **Adoption telemetry is already collected but points inward** — `packages/cli/src/commands/adoption.ts` reads local `adoption.jsonl` records and aggregates by skill for the repo's own owner. Tracked rows cover the on-ramp funnel (`adoption-funnel-telemetry`), failure-reason categorization (`extend-adoption-jsonl-with-failure-reason-categorization`), the synthesis surface (`ship-aggregate-telemetry-synthesis-surface`, done) and standards interop (`standard-telemetry-semantics-interop`). Candidates here deliberately avoid re-describing those and instead target outcome evidence the adopter can act on or show someone else.
- **Scope boundary honored** — cross-client substrate fidelity (Claude Code / Cursor / Codex / Gemini CLI / OpenCode) belongs to the sibling `multi-client-portability` track and is excluded here.

## Ranked candidates

### 1. `harness init` selects a graduated first-run constraint set — exactly one gate the repo already passes and one it nearly passes, deferring the rest — score: 9.00

- Persona: The primary-persona tech lead from `Who it's for` — 3–6 months into agent adoption, with a CLAUDE.md and a review checklist but no enforcement — running `harness init` on a real, already-drifted repo for the first time.
- Premise: Init runs the candidate constraints before writing config, and enables only a constraint the repository currently passes plus the nearest near-miss, recording the remainder as deferred with their violation counts.
- Complexity: low
- Impact / Confidence / Effort: H / H / L — base score 9.00
- Strategy alignment: +0.5 track:External adoption flywheel, +0.25 persona (`Who it's for` primary persona) = +0.75 — recorded, **not applied** (no adjacent tie) — final score 9.00
- Key risk: A graduated on-ramp can read as the tool hiding the problem it was hired to find.
- Strongest objection: The whole value proposition is that constraints fire mechanically and immediately; deliberately withholding constraints the repo fails inverts that on day one and teaches the adopter that harness findings are negotiable. The most likely failure mode is the deferred set never getting enabled — the "one more gate" step has no forcing function, so the adopter settles permanently at two constraints, reports the tool as installed, and contributes a green Harness Coverage number that means nothing. A second failure mode is that on a sufficiently drifted repo there is no constraint that currently passes, so the graduated selection degenerates to enabling nothing at all and the first run is vacuous rather than encouraging. For this objection not to hold, the deferred set would have to carry real forward pressure — a visible ratchet, a scheduled re-evaluation, or a Harness Coverage denominator that counts deferred constraints as unmet — and there would have to be evidence that first-run violation volume, not disagreement with the rules, is what actually loses adopters.
- Objection answered: no — stands as an accepted, unrebutted downside.

### 2. Locally-computed Harness Coverage / Drift Floor badge with a verifiable report link — score: 6.00

- Persona: A tech lead who has adopted the harness and now needs to show peers and leadership that it is doing something, without exporting source or granting anyone access to the repo.
- Premise: `harness` emits a shields-compatible endpoint JSON plus a self-contained report page for the two KPIs it already computes locally (Harness Coverage from `harness validate` baselines, Drift Floor from the architecture timeline), so a repo can publish its enforcement posture from its own README.
- Complexity: low
- Impact / Confidence / Effort: M / H / L — base score 6.00
- Strategy alignment: +0.5 track:External adoption flywheel, +0.25 (`Key metrics` — Harness Coverage, Drift Floor) = +0.75 — recorded, **not applied** (no adjacent tie) — final score 6.00
- Key risk: A self-reported badge is a number the badge's owner controls, so it persuades nobody who is paying attention.
- Strongest objection: Badges are trivially gameable — the same repo can raise Harness Coverage by deleting documented rules rather than enforcing them, and can flatten Drift Floor by merging less, so the number that gets published is the number the publisher wanted rather than the number the substrate earned. The most likely failure mode is quiet Goodharting: coverage rises, the badge goes green, and enforcement quality is unchanged or worse, which is corrosive precisely because this project's credibility rests on measured claims. A related failure is irrelevance — outside observers have no calibration for what a given Drift Floor means, so the badge decorates a README without moving a single adoption decision. For this objection not to hold, the report behind the badge would have to carry enough provenance to be checked by a skeptic (which rules, which baselines, which window, which commits) and the metric definitions would have to be resistant to the deletion shortcut.
- Objection answered: no — stands as an accepted, unrebutted downside.

### 3. Signed, provenanced constraint bundles with a publisher-trust policy — score: 4.50

- Persona: A tech lead about to run someone else's constraint pack — machine-checkable rules that will execute in their CI and block their team's merges.
- Premise: The existing sharing bundle gains a signed manifest, a publisher identity, and a `trust` policy in `harness.config.json` that refuses to install unsigned or unknown-publisher bundles by default.
- Complexity: medium
- Impact / Confidence / Effort: H / H / M — base score 4.50
- Strategy alignment: +0.5 track:External adoption flywheel, +0.25 (`Our approach` — constraints executing as code in the adopter's pipeline) = +0.75 — recorded, **not applied** (no adjacent tie) — final score 4.50
- Key risk: Signing infrastructure is a real cost paid up front against a threat that has not yet materialized at this adoption volume.
- Strongest objection: There is no meaningful third-party bundle ecosystem yet, so this hardens a supply chain that currently has approximately one supplier — and key management, revocation, and the "unknown publisher" refusal path add friction to exactly the flow (trying someone else's pack) that the flywheel needs to be frictionless. The most likely failure mode is that default-refuse becomes the first thing every adopter turns off, at which point the trust policy is a config option nobody honors and the signing work bought nothing but a slower install. A subtler failure is scope confusion: a signature attests to who published a bundle, not that its rules are sensible for the importing repo, and adopters will read the green checkmark as the latter. For this objection not to hold, either bundle sharing would have to reach a volume where an untrusted publisher is realistic, or the trust surface would have to deliver something adopters want independently of the threat — reproducible provenance, diffable pack history, an auditable record of what changed in their gates and when.
- Objection answered: no — stands as an accepted, unrebutted downside.

### 4. `harness would-have` — replay the adopter's own merged-PR history through the gates and report what would have been caught — score: 3.75

- Persona: The primary-persona tech lead evaluating adoption — already paying the cleanup tax described in `Target problem`, and unwilling to install anything into CI on the strength of a marketing claim.
- Premise: A read-only, write-nothing command walks the last N merged PRs in an untouched repository, runs the harness checks against each diff, and reports the violations, layer breaks, and entropy findings that would have fired at the time — evidence drawn from the adopter's own history rather than a generic scan.
- Complexity: medium
- Impact / Confidence / Effort: H / M / M — base score 3.00
- Strategy alignment: +0.5 track:External adoption flywheel, +0.25 (`Target problem` — the compounding cleanup tax) = +0.75 — **applied** (three-way tie at base 3.00, |Δ| = 0.00 ≤ 0.05) — final score 3.75
- Key risk: A retrospective replay measures what the rules say, not what the team would have wanted, and a large findings count reads as noise rather than as value.
- Strongest objection: Running current constraints against historical diffs is anachronistic — the code was written under different conventions, by people who never agreed to these rules, so a big number is ambiguous between "look how much drift you accumulated" and "look how badly calibrated these defaults are to your codebase." The most likely failure mode is a hostile first impression: the prospective adopter runs the evaluation, sees four thousand findings across a year of merges, concludes the tool does not understand their repo, and never installs it — the command would have actively destroyed the adoption it was built to create. There is also a substantial correctness hazard in replaying gates against historical trees whose dependencies, configs, and layer definitions no longer resolve, producing findings that are artifacts of the replay rather than of the code. For this objection not to hold, the output would have to lead with a small, high-confidence, obviously-real subset — the findings a human would agree were bugs — and be honest about which checks could not be faithfully replayed at each historical commit.
- Objection answered: no — stands as an accepted, unrebutted downside.

### 5. Pack efficacy receipts — every installed constraint pack carries a measured before/after Drift Floor delta for the repo that installed it — score: 3.75

- Persona: A tech lead choosing between several available constraint packs, and the pack author who wants a reason anyone should prefer theirs.
- Premise: Installing a pack stamps a local baseline; after a configurable window the adopter can render a receipt showing that pack's own contribution to violations-introduced-per-merged-PR, and can optionally contribute the receipt back so packs accumulate outcome evidence rather than only rule counts.
- Complexity: medium
- Impact / Confidence / Effort: H / M / M — base score 3.00
- Strategy alignment: +0.5 track:External adoption flywheel, +0.25 (`Key metrics` — Drift Floor; `Our approach` — constraints that compound) = +0.75 — **applied** (three-way tie at base 3.00, |Δ| = 0.00 ≤ 0.05) — final score 3.75
- Key risk: Attributing a drift change to one pack is a causal claim the available data cannot support.
- Strongest objection: A repo's Drift Floor moves for many reasons at once — team changes, release pressure, a refactor, other packs installed the same week, seasonal merge volume — and a before/after delta around a single install is confounded by all of them, so the receipt will confidently report an effect that is mostly noise. The most likely failure mode is that receipts become a marketing surface with a statistical veneer: pack authors publish the favorable windows, adopters treat the numbers as comparable across wildly different codebases, and the project ends up shipping exactly the kind of unfalsifiable claim its own metric discipline exists to prevent. Low merge volume makes it worse — most adopter repos will not produce enough merged PRs in any reasonable window for the delta to clear the noise floor at all. For this objection not to hold, receipts would need honest uncertainty reporting and a declared denominator, an explicit refusal to report when n is too small, and ideally a design that identifies the pack's effect mechanically (which specific violations that pack's rules caught) rather than inferring it from an aggregate time series.
- Objection answered: no — stands as an accepted, unrebutted downside.

### 6. `harness eject` — emit the enforced constraint set as plain ESLint config and CI workflow with zero harness dependency — score: 3.75

- Persona: The tech lead who must get a new tool past a skeptical staff engineer or a platform team whose first question is what happens when this project is abandoned.
- Premise: A single command materializes the currently-enforced constraints as standalone linter configuration and workflow files that keep working after the harness is uninstalled, making the exit cost explicit and near-zero.
- Complexity: medium
- Impact / Confidence / Effort: M / H / M — base score 3.00
- Strategy alignment: +0.5 track:External adoption flywheel, +0.25 persona (`Who it's for` — the lead defending a new dependency) = +0.75 — **applied** (three-way tie at base 3.00, |Δ| = 0.00 ≤ 0.05) — final score 3.75
- Key risk: Building a first-class exit is engineering effort spent making it easier to leave.
- Strongest objection: Much of what the harness enforces is not expressible as static linter configuration — graph-derived layer rules, skill workflow rigidity, gate sequencing, comprehension freshness, the outcome-eval verdicts — so an honest eject produces a thin subset and advertises, in the adopter's own repo, how much of the value was locked in the parts that could not be ejected. The most likely failure mode is that the ejected config silently diverges: teams eject "for safety," the standalone files rot against the harness's evolving rules, and a later re-import or comparison is a mess of conflicts nobody owns. There is also a real strategic cost — a frictionless exit invites eject-and-abandon by teams who wanted the rules but not the substrate, which is precisely the population whose telemetry would have tested the thesis at scale. For this objection not to hold, the ejected artifact would have to be genuinely useful on its own while being unmistakably honest about the boundary, and the lock-in objection would have to be a real, observed blocker in adoption conversations rather than a hypothesized one.
- Objection answered: no — stands as an accepted, unrebutted downside.

### 7. Author a shareable constraint pack from a team's own recurring PR review comments — score: 2.75

- Persona: A staff engineer who writes the same review comment for the fifth time this quarter and has no path from that comment to a rule that enforces it.
- Premise: A skill mines the repository's review-comment history for recurring, mechanically-checkable assertions, clusters them into candidate rules, and drafts them into a constraint pack the team can enforce internally and publish externally — supply for the flywheel, not just distribution.
- Complexity: high
- Impact / Confidence / Effort: H / M / H — base score 2.00
- Strategy alignment: +0.5 track:External adoption flywheel, +0.25 (`Our approach` — conventions-without-enforcement converted into machine-checkable constraints) = +0.75 — **applied** (two-way tie at base 2.00, |Δ| = 0.00 ≤ 0.05) — final score 2.75
- Key risk: Most review comments are not mechanizable, and the ones that are have usually already been mechanized.
- Strongest objection: Review comments are overwhelmingly contextual judgment — "this belongs in the service layer," "this name is misleading," "are we sure about this ordering?" — and the fraction that reduces cleanly to a deterministic rule is small and consists largely of things a linter already catches, so the mined output will be dominated by unmechanizable prose with a thin tail of redundant rules. The most likely failure mode is a plausible-looking pack full of rules that are subtly wrong: a comment that applied to one module is generalized into a repo-wide constraint, the team enables it, and it starts blocking correct code — which poisons trust in the entire constraint mechanism, not just the generated pack. Mining also depends on review-comment volume and quality that many adopter repos simply do not have. For this objection not to hold, the extraction would need to be aggressively conservative (proposing few rules, each with the specific comments and code sites that justify it) and the review corpus would have to be a demonstrably richer source of latent rules than the codebase itself.
- Objection answered: no — stands as an accepted, unrebutted downside.

### 8. A searchable pack index generated from published bundle manifests, with no hosted service to operate — score: 2.50

- Persona: An adopter who has decided to use shared constraints and now has no way to find out what exists beyond asking someone.
- Premise: Opting in to publish emits a bundle's manifest to a static, version-controlled index that renders as a searchable catalog, so discovery is a build artifact rather than a service someone has to run and keep alive.
- Complexity: medium
- Impact / Confidence / Effort: M / M / M — base score 2.00
- Strategy alignment: +0.5 track:External adoption flywheel = +0.50 — **applied** (two-way tie at base 2.00, |Δ| = 0.00 ≤ 0.05) — final score 2.50
- Key risk: A discovery surface built before there is anything to discover is an empty room with good signage.
- Strongest objection: Indexes are demand-side infrastructure and the binding constraint here is supply — with a handful of packs in existence the catalog's most honest state is near-empty, and an empty catalog is worse than no catalog because it advertises that nobody is sharing. The most likely failure mode is the cold-start trap made permanent: the index ships, stays sparse, prospective adopters read sparseness as a dead ecosystem, and the perception outlives the fix. Even granting supply, a static generated index carries no quality signal at all — no downloads, no maintenance status, no indication whether a pack is a serious rule set or someone's afternoon — so discovery succeeds mechanically while failing at the thing adopters actually need, which is knowing which pack to trust. For this objection not to hold, pack supply would have to be growing on its own, and the index would need to carry at least one credible quality or freshness signal per entry.
- Objection answered: no — stands as an accepted, unrebutted downside.

### 9. Turn the blueprint dump into sequenced courseware — an ordered path with comprehension checks and a freshness contract — score: 1.33

- Persona: A new hire, contractor, or agent operator arriving cold at an adopter's codebase, who needs to know what to read in what order rather than being handed a complete map.
- Premise: The existing blueprint generator gains an ordering derived from the knowledge graph's critical paths, per-stop checks for understanding, a recorded completion trail, and a staleness signal that marks stops whose underlying code has moved.
- Complexity: high
- Impact / Confidence / Effort: M / M / H — base score 1.33
- Strategy alignment: +0.5 track:External adoption flywheel = +0.50 — recorded, **not applied** (no adjacent tie) — final score 1.33
- Key risk: Generated courseware is a documentation artifact, and documentation artifacts rot faster than anyone maintains them.
- Strongest objection: Ordering a codebase into a curriculum is an editorial act requiring judgment about what a newcomer needs, and graph centrality is a poor proxy for pedagogical order — the most-depended-upon module is frequently the worst place to start. The most likely failure mode is a confidently-sequenced path that teaches the codebase in the wrong order, which is more damaging than an unordered reference because the reader trusts the sequence and blames themselves when it does not cohere. Auto-generated comprehension checks compound this: questions derived from structure tend to test whether you can read a call graph rather than whether you understand the design, and a learner who passes them has learned nothing durable. The freshness contract adds ongoing maintenance cost to an artifact whose consumption is bursty and rare — most repos onboard someone a few times a year. For this objection not to hold, the generated order would have to beat a hand-written onboarding doc in a real comparison, and the checks would have to test comprehension rather than navigation.
- Objection answered: no — stands as an accepted, unrebutted downside.

### 10. Cohort benchmarking — show an adopter their Drift Floor as a percentile against comparable repositories — score: 1.00

- Persona: The primary-persona tech lead who can see their own numbers but has no idea whether they are good, and needs a comparison to justify continued investment internally.
- Premise: Opt-in telemetry aggregates KPI outcomes into anonymized cohorts by repository size and stack, so an adopter's own Drift Floor and Harness Coverage are reported as a position within a distribution rather than as a bare number.
- Complexity: high
- Impact / Confidence / Effort: H / L / H — base score 1.00
- Strategy alignment: +0.5 track:External adoption flywheel, +0.25 (`Key metrics` — External Adoption, Drift Floor; primary persona) = +0.75 — recorded, **not applied** (no adjacent tie) — final score 1.00
- Key risk: The cohorts do not exist yet, and building the comparison before the population exists produces confident statistics over a handful of repos.
- Strongest objection: Percentile reporting requires a population large enough that a cohort is not three repositories, and External Adoption is precisely the metric this whole track exists to raise — so the feature's prerequisite is its own goal, and shipping it early means publishing percentiles computed over an n that would be embarrassing to disclose. The most likely failure mode is a privacy incident of the ordinary kind: "repositories of your size and stack" is a small enough bucket that a cohort statistic becomes attributable, and an adopter recognizes their own repo in someone else's benchmark — which for a tool asking teams to enable telemetry is close to unrecoverable. Cohort definition is also genuinely hard and contestable: size and stack are weak predictors of drift compared to team maturity, release cadence, and code age, so the comparison will feel wrong to the people it is meant to persuade. For this objection not to hold, the adopter population would need to be an order of magnitude larger than it is, the cohorting would need a defensible k-anonymity floor with suppression below it, and there would need to be evidence that a percentile actually changes an adoption decision that a raw number does not.
- Objection answered: no — stands as an accepted, unrebutted downside.

## Ranking table (final-score order)

| Rank | Candidate                                                    | Complexity | I/C/E | Base | Alignment                | Applied | Final |
| ---- | ------------------------------------------------------------ | ---------- | ----- | ---- | ------------------------ | ------- | ----- |
| 1    | Graduated first-run constraint selection in `harness init`   | low        | H/H/L | 9.00 | +0.75 (track + persona)  | no      | 9.00  |
| 2    | Harness Coverage / Drift Floor badge + verifiable report     | low        | M/H/L | 6.00 | +0.75 (track + metrics)  | no      | 6.00  |
| 3    | Signed, provenanced bundles with publisher-trust policy      | medium     | H/H/M | 4.50 | +0.75 (track + approach) | no      | 4.50  |
| 4    | `harness would-have` retrospective replay of merged PRs      | medium     | H/M/M | 3.00 | +0.75 (track + problem)  | yes     | 3.75  |
| 5    | Pack efficacy receipts (per-pack Drift Floor delta)          | medium     | H/M/M | 3.00 | +0.75 (track + metrics)  | yes     | 3.75  |
| 6    | `harness eject` — dependency-free constraint materialization | medium     | M/H/M | 3.00 | +0.75 (track + persona)  | yes     | 3.75  |
| 7    | Constraint pack authored from recurring review comments      | high       | H/M/H | 2.00 | +0.75 (track + approach) | yes     | 2.75  |
| 8    | Static, generated pack index (no hosted service)             | medium     | M/M/M | 2.00 | +0.50 (track)            | yes     | 2.50  |
| 9    | Blueprint → sequenced courseware with comprehension checks   | high       | M/M/H | 1.33 | +0.50 (track)            | no      | 1.33  |
| 10   | Cohort benchmarking of Drift Floor percentiles               | high       | H/L/H | 1.00 | +0.75 (track + metrics)  | no      | 1.00  |

Tie windows: ranks 4–6 tied at base 3.00 (|Δ| = 0.00 ≤ 0.05) and ranks 7–8 tied at base 2.00 (|Δ| = 0.00 ≤ 0.05); the bonus was applied within those windows only, and reordered ranks 7 and 8 relative to base order. All other bonuses are recorded for transparency and changed no positions.

## Handoff

- Ideation artifact written: `docs/ideation/make-the-harness-valuable-enou-2026-09-06.md`
- Top pick: Graduated first-run constraint selection in `harness init` — score 9.00
- Next: invoke `/harness:brainstorming "<candidate>"` to take a candidate into a spec, OR `/harness:roadmap` to enqueue picks for later. This artifact is an input to brainstorming, never a substitute for it.
