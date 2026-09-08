---
topic: 'Invest in mechanisms that make agents and skills measurably improve over time rather than holding steady — the skill proposal loop, effectiveness baselines, trust scoring, and prompt injection from historical outcomes.'
generated_at: 2026-09-06T16:39:16Z
strategy_grounded: true
strategy_path: STRATEGY.md
count_requested: 10
count_generated: 10
ranking_formula: '(impact × confidence) ÷ effort; strategy-alignment tiebreaker (max +0.75) applied only when |Δbase_score| ≤ 0.05'
---

# Ideation: Invest in mechanisms that make agents and skills measurably improve over time rather than holding steady — the skill proposal loop, effectiveness baselines, trust scoring, and prompt injection from historical outcomes

## Inputs

- Topic: "Invest in mechanisms that make agents and skills measurably improve over time rather than holding steady — the skill proposal loop, effectiveness baselines, trust scoring, and prompt injection from historical outcomes."
- Generated: 2026-09-06T16:39:16Z
- Strategy grounding: enabled — `STRATEGY.md` present and valid (`read_strategy`); matching track **Compounding feedback loops** ("skill proposal loop, skill effectiveness baselines, trust scoring, prompt injection from historical outcomes")
- Count: 10
- Objection policy: **none** — every candidate's strongest objection stands as an accepted, unrebutted downside. No objection was answered.

### Grounding note

This track is densely covered: 156 roadmap rows are open, and a large share of the obvious measurement ideas are already tracked — bandit/explore-exploit allocation, item-response difficulty×ability modelling, Kalman signal fusion, a Goodhart sentinel, skill P&L, precedent, a rejection ledger, counterfactual shadow trials, federated gate-calibration baselines, known-answer drills, statistical audit sampling, number-needed-to-run, "let the harness run a controlled experiment on its own effect", spaced-repetition re-verification, auto-triggered retrospection with applyable proposals, and trajectory-to-eval harvesting from black-box records. Candidates below were checked against that open set and against `docs/ideation/compounding-feedback-loops-mec-2026-08-13.md`, and deliberately target gaps that sit _underneath_ those mechanisms rather than beside them.

What the codebase actually shows:

- **The scorers exist and are version-blind.** `packages/intelligence/src/effectiveness/skill-scorer.ts` and `scorer.ts` apply Laplace (α=1) smoothing over `SkillInvocationRecord`s and graph `execution_outcome` nodes. Counts are unweighted by time and carry no identity for the skill revision or model that produced them.
- **The learning evidence is gitignored, per-checkout local state.** `.gitignore:60,62,66` excludes `**/.harness/proposals/`, `**/.harness/black-box/`, and `**/.harness/metrics/*` — with a single carve-out, `!**/.harness/metrics/holiday-confidence.jsonl`. The durable-ledger pattern therefore already works in this repo (`.harness/arch/timeline.json`, `.harness/signals/timeline.json`, `.harness/security/timeline.json`, `holiday-confidence.jsonl`), but it is applied to KPI _trends_ and not to the _learning corpus_.
- **A committed learning store exists and has never been fed.** `.harness/specialization-profiles.json` is committed and contains `{"profiles": {}}`, stamped `2026-07-08` — two months stale.
- **A push-injection channel exists and does not carry outcomes.** `packages/orchestrator/src/workflow/stage-prompt-template.ts:32` renders `## Pre-warmed comprehension`, resolved by `resolveLeafPrewarmSources` (`orchestrator.ts:141,1940`) and budgeted by `core/context-budget-governor.ts`. Historical learnings are reachable only _pull-only_, as MCP resource `harness://learnings` (`packages/cli/src/mcp/resources/learnings.ts`).
- **Fleet verdicts are validated and then dropped.** `packages/types/src/fleet-handoff.ts` defines `FleetHandoffRecordSchema` / `validateFleetHandoffRecord`, and no source outside `packages/types` imports `FleetHandoffRecord`. There is no path from a fleet lane's verdict to an `execution_outcome` node (`packages/intelligence/src/outcome/connector.ts:47,61`).
- **The post-mortem corpus is nearly empty.** `docs/solutions/` holds 4 markdown files.

## Ranked candidates

### 1. Stamp every outcome record with the content hash of the skill revision and model that produced it, and score per revision — score: 9.00

- Premise: Add a `skillContentHash` + `modelId` field to `SkillInvocationRecord` and the `execution_outcome` node, and group `skill-scorer.ts` / `scorer.ts` counts by that hash so each skill revision is scored as its own population with an explicit changepoint at every hash boundary.
- Persona: A tech lead who rewrote a skill's SKILL.md last month and cannot tell from any harness surface whether the rewrite helped, hurt, or did nothing.
- Complexity: low
- Key risk: Per-revision partitioning shrinks each population, so most revisions never reach a countable sample.
- Impact / Confidence / Effort: H / H / L — base score 9.00
- Strategy alignment: +0.5 track:Compounding feedback loops, +0.25 Our approach (makes "measurably improve" machine-checkable) = +0.75 — **not applied** (|Δbase| vs next candidate = 2.25 > 0.05; recorded for transparency only) — final score 9.00
- Strongest objection: Partitioning the evidence by revision hash makes the sparsity problem strictly worse, and sparsity is already the binding constraint on every scorer in this track. Today a skill pools every record it has ever produced and still gets a Laplace-smoothed rate that swings on one or two runs; splitting that pool at every SKILL.md edit — including whitespace and platform-mirror syncs, which this repo does constantly, since `agents/skills/{cursor,codex,gemini-cli}/<skill>` are symlinks that change together — leaves most revisions with an n of one or two and no revision with enough evidence to compare against another. Most likely failure mode: the changepoint report becomes a wall of single-sample partitions, nobody can read an improvement out of it, and the team either ignores it or re-pools the partitions manually, which is where they started. For the objection not to hold, the hash would need to be computed over semantically load-bearing content only (so cosmetic and mirror-sync edits do not fork the population) _and_ the comparison would need a stated minimum-sample rule that refuses to render a verdict below it, which turns a low-effort field addition into a real statistical design problem.
- Objection answered: no (accepted downside per objection policy: none)

### 2. A learning-loop liveness check that fails loudly when an evidence store has stopped being fed — score: 6.75

- Premise: Ship one check that reports, per compounding loop (proposals, adoption records, black-box, specialization profiles, outcome nodes), the timestamp of its most recent record, and treats a store with no writes in N days as a failing condition rather than as a zero.
- Persona: A tech lead who reads a skill-effectiveness report of all zeros and cannot tell whether the skills are untouched or the telemetry has been dark for two months.
- Complexity: low
- Key risk: A liveness signal tells you a store is empty without telling you why, so it may just relocate the confusion.
- Impact / Confidence / Effort: M / H / L — base score 6.00
- Strategy alignment: +0.5 track:Compounding feedback loops, +0.25 Target problem ("conventions without enforcement" — an unenforced loop reports zeros indistinguishably from a healthy one) = +0.75 — applied (|Δbase| vs adjacent candidate = 0.00 ≤ 0.05) — final score 6.75
- Strongest objection: The evidence that the loops are dormant is already in hand and did not need a detector to find it — `.harness/specialization-profiles.json` has been an empty object since 2026-07-08, and the in-progress row "Activate the skill-proposal pipeline in dogfood" concluded that the proposal surfaces are dormant _by design_ (opt-in, gated on `HARNESS_SESSION_RETROSPECTION` and an analysis provider). A liveness check would therefore report, correctly and permanently, that intentionally-off loops are off. Most likely failure mode: the check goes red on day one for four of five loops, the team adds suppressions to get CI green, and the suppressions outlive the reason for them — the standard fate of an alarm that fires on a known, accepted condition. For the objection not to hold, the check would need to distinguish "configured on but not receiving records" (a real fault) from "deliberately off" (not a fault), which means every loop first needs a declared expected-state that does not exist today.
- Objection answered: no (accepted downside per objection policy: none)

### 3. Time-decay the evidence in every scorer with an explicit half-life and staleness expiry — score: 6.50

- Premise: Replace the unweighted Laplace counts in `skill-scorer.ts` and `scorer.ts` with exponentially time-weighted counts plus a staleness horizon, so a score reflects the system as it is now rather than as it was across its whole history.
- Persona: An individual developer running agents 10+ sessions/week whose skill scores are still dominated by runs made against a model and a skill text that no longer exist.
- Complexity: low
- Key risk: Decay discards the only evidence sparse skills have, trading staleness for noise.
- Impact / Confidence / Effort: M / H / L — base score 6.00
- Strategy alignment: +0.5 track:Compounding feedback loops — applied (|Δbase| vs adjacent candidate = 0.00 ≤ 0.05) — final score 6.50
- Strongest objection: Decay and sparsity pull in opposite directions, and in this repo sparsity wins. A half-life short enough to drop pre-rewrite and pre-model-swap evidence is also short enough to leave a skill invoked twice a month with an effective sample size below one, at which point the smoothed score is the prior and nothing else — a decayed score that is really just α=1 dressed as a measurement is worse than an honestly stale one, because it looks current. Most likely failure mode: rarely-used skills oscillate between "no signal" and "one recent failure defines the skill", and the first time that mis-ranks a correct-but-infrequent skill the team stops trusting scores generally. For the objection not to hold, the half-life would need to be fitted to observed per-skill invocation rates rather than picked as a constant, and the surface would need to publish effective sample size next to every decayed score so a reader can see when the number is really the prior.
- Objection answered: no (accepted downside per objection policy: none)

### 4. Promote the learning corpus from gitignored local state to a committed append-only ledger — score: 3.75

- Premise: Move the outcome/effectiveness evidence (adoption records, proposal records, outcome verdicts) out of the gitignored `**/.harness/{proposals,black-box,metrics}/` set and into a committed append-only ledger, following the pattern already proven by `.harness/metrics/holiday-confidence.jsonl` and the arch/security/signals timelines.
- Persona: A tech lead whose team of six each accumulate a private, invisible evidence store, so nothing any of them learns is available to the other five or to CI.
- Complexity: medium
- Key risk: A committed, high-write ledger becomes a merge-conflict generator on every concurrent PR.
- Impact / Confidence / Effort: H / M / M — base score 3.00
- Strategy alignment: +0.5 track:Compounding feedback loops, +0.25 Target problem ("each agent invocation starts cold") = +0.75 — applied (|Δbase| vs adjacent candidates = 0.00 ≤ 0.05) — final score 3.75
- Strongest objection: This repo has already been burned by exactly this shape. `.harness/baselines.json` — a committed, machine-appended state file — produced a documented conflict treadmill severe enough to need its own tolerance work, and the comprehension `_module.md` shards produced a second one that needed a custom merge driver to end. An append-only evidence ledger written on every agent run, in a repo that routinely has a dozen fleet worktrees in flight, is a higher-write version of the same file shape and will re-open the same wound; and unlike a baseline, an outcome ledger has no natural "recompute from scratch" resolution, because the records _are_ the state. Most likely failure mode: the ledger goes DIRTY on every merge burst, someone registers a union merge driver, the driver is local-only config that new checkouts and CI never register, and the ledger silently diverges per machine — which is the durability problem it was introduced to solve. For the objection not to hold, the ledger would need per-writer sharding with no shared line (so concurrent writers never touch the same file) and an aggregate that is regenerated rather than committed.
- Objection answered: no (accepted downside per objection policy: none)

### 5. Prewarm the executor with prior failures on the paths it is about to touch, over the existing budget-governed channel — score: 3.75

- Premise: Add an outcome-evidence source type to `resolveLeafPrewarmSources` so the `## Pre-warmed comprehension` block in `stage-prompt-template.ts` also carries the recorded _failures_ previously seen on the leaf's touched paths, subject to the same `context-budget-governor` accounting as comprehension units.
- Persona: A tech lead watching agents re-make, on the same files, a mistake the harness already recorded and can only surface if the agent thinks to pull `harness://learnings`.
- Complexity: medium
- Key risk: Injected failure history is context spend with no proven behavioral effect.
- Impact / Confidence / Effort: H / M / M — base score 3.00
- Strategy alignment: +0.5 track:Compounding feedback loops, +0.25 Target problem ("each agent invocation starts cold, re-litigates settled architectural decisions") = +0.75 — applied (|Δbase| = 0.00 ≤ 0.05) — final score 3.75
- Strongest objection: The comprehension prewarm that this would ride has itself never been shown to change behavior — the existing evidence for it is a token-delta figure, and the behavioral A/B was explicitly deferred. Adding a second, noisier payload to an unvalidated channel compounds an unproven bet rather than testing it, and failure records are a worse payload than comprehension units: comprehension describes what the code _is_, which is stably useful, whereas a past failure on a path may have been caused by a bug that is now fixed, a model that is now replaced, or a spec that has since changed, so the injected text can actively mislead. Most likely failure mode: the prewarm block grows, the context budget governor starts tripping on leaves that previously fit, and the harness pays a measurable context cost for an unmeasured — possibly negative — behavioral effect. For the objection not to hold, the comprehension prewarm's own behavioral A/B would need to land first, and injected failures would need an expiry tied to whether the failure's cause is still live.
- Objection answered: no (accepted downside per objection policy: none)

### 6. Publish a track-level improvement-rate KPI that answers "is this actually compounding?" — score: 3.75

- Premise: Add a seventh KPI to `STRATEGY.md` that measures the _rate of change_ of first-pass success per unit of human intervention over a rolling window, so the compounding track has a number that would go flat if the loops stopped working.
- Persona: A senior engineer asked to justify continued investment in feedback-loop machinery who can point to six KPIs, none of which measures improvement over time.
- Complexity: medium
- Key risk: A self-reported improvement metric is the most Goodhart-exposed number the project would own.
- Impact / Confidence / Effort: H / M / M — base score 3.00
- Strategy alignment: +0.5 track:Compounding feedback loops, +0.25 Our approach ("constraints-as-code … compounds — each constraint added now removes a class of future drift") = +0.75 — applied (|Δbase| = 0.00 ≤ 0.05) — final score 3.75
- Strongest objection: The five existing input KPIs plus Holiday Confidence already measure state, and the honest reason none of them measures improvement rate is that a derivative of a noisy, low-volume, self-collected series is mostly noise — a 30-day window over this repo's merged-PR volume produces a slope whose confidence interval comfortably spans zero, so the number will be reportable long before it is meaningful. Worse, it is a metric the project both owns and optimizes, published as evidence for the project's own central wager, which is the textbook setup the tracked "Goodhart sentinel" row exists to police; a KPI that needs a sentinel to be trustworthy is a liability shipped ahead of its guard. Most likely failure mode: the slope reads positive during a quarter of heavy investment, gets cited as proof the thesis works, and then goes flat or negative for reasons (model changes, task-mix changes) that have nothing to do with the harness — and the number gets quietly redefined rather than believed. For the objection not to hold, the metric would need a denominator that controls for task mix and model version, and it would need to be published with its confidence interval rather than as a point estimate.
- Objection answered: no (accepted downside per objection policy: none)

### 7. Turn fleet handoff verdicts into durable outcome evidence — score: 3.50

- Premise: Persist each lane's validated `FleetHandoffRecord` as an `execution_outcome` node via `packages/intelligence/src/outcome/connector.ts`, so that fleet execution — now the dominant way work gets done in this repo — contributes to effectiveness and trust scoring instead of being validated and dropped.
- Persona: A tech lead running multi-lane fleets daily whose highest-volume source of agent work feeds exactly zero records into the machinery meant to learn from agent work.
- Complexity: medium
- Key risk: A lane's self-reported status is the worker's own claim, and scoring it rewards optimistic self-reporting.
- Impact / Confidence / Effort: H / M / M — base score 3.00
- Strategy alignment: +0.5 track:Compounding feedback loops — applied (|Δbase| vs adjacent candidate = 0.00 ≤ 0.05) — final score 3.50
- Strongest objection: The `status` field in a handoff record is the lane's assessment of its own work, and the fleet orchestrators exist precisely because that assessment is not trusted — every fleet member in the family independently re-derives its verdict from the lane's emitted artifacts rather than from the lane's self-report. Ingesting `status` as outcome evidence imports exactly the signal the surrounding architecture was built to distrust, and it does so into the scorers that feed skill ranking and trust, so a lane that overstates success would raise the measured effectiveness of the skill that let it overstate. Most likely failure mode: `done` counts accumulate faster than real successes, effectiveness scores drift upward across the board, and the drift is invisible because the same inflated records are the only evidence available to detect it. For the objection not to hold, the persisted outcome would need to be the _orchestrator's_ independently re-derived verdict rather than the lane's `status`, which means the ingestion point is in the verify stage and not in the handoff record at all.
- Objection answered: no (accepted downside per objection policy: none)

### 8. Bootstrap the evidence loops on adopter installs so the thesis compounds off-repo — score: 2.75

- Premise: Make an adopter's first `harness init` create and begin feeding the evidence stores the compounding loops read from, so the mechanisms produce a real score on someone else's codebase rather than only inside the dogfood repo.
- Persona: A tech lead at a team 3–6 months into agent adoption who installs harness, runs it for a month, and gets effectiveness surfaces that report nothing because no store was ever created.
- Complexity: high
- Key risk: Turning on evidence collection by default in someone else's repo is a privacy and consent decision, not a wiring decision.
- Impact / Confidence / Effort: M / M / M — base score 2.00
- Strategy alignment: +0.5 track:Compounding feedback loops, +0.25 Our approach ("the wager: constraints-as-code outperforms prompts-and-conventions **at every scale**") = +0.75 — applied (|Δbase| = 0.00 ≤ 0.05) — final score 2.75
- Strongest objection: The records these loops need — which skills ran, on which files, with what outcome, and the prompts and diffs behind them — are a detailed behavioral log of an adopter's proprietary codebase and their engineers' working patterns, and creating that by default at install time is the kind of decision that gets a tool banned from an enterprise rather than adopted by one. The project already respects `DO_NOT_TRACK` for anonymous telemetry, which signals that the consent bar here is understood to be high; a local-but-on-by-default forensic store is a materially larger collection than the anonymous counts that bar was set for. Most likely failure mode: it ships on-by-default, one security review at one prospective adopter reads what is in `.harness/black-box/`, and the finding propagates — costing more adoption than the feature was meant to win. For the objection not to hold, the bootstrap would need to be opt-in with a plain-language disclosure of exactly what is recorded, which reintroduces the dormancy problem this candidate exists to solve.
- Objection answered: no (accepted downside per objection policy: none)

### 9. Record the rendered leaf prompt alongside its outcome, as a replayable corpus — score: 2.75

- Premise: Persist the exact rendered prompt each leaf received — the thing the black-box forensic record explicitly does not store today — keyed to its outcome, so effectiveness can be attributed to prompt content and prior runs can be re-scored offline against a changed skill or model.
- Persona: A senior engineer trying to work out why a skill's success rate moved, who has the verdict and the diff but not the one artifact that actually varied between runs.
- Complexity: high
- Key risk: A prompt corpus is a large, secret-bearing store whose cost is paid on every run and whose value is paid out only later.
- Impact / Confidence / Effort: H / M / H — base score 2.00
- Strategy alignment: +0.5 track:Compounding feedback loops, +0.25 Target problem ("each agent invocation starts cold") = +0.75 — applied (|Δbase| = 0.00 ≤ 0.05) — final score 2.75
- Strongest objection: Rendered leaf prompts contain whatever the context assembly pulled in — source, config, environment values, and any secret that happened to sit in a file the prewarm resolved — so the corpus is a secret-bearing artifact by construction, and it grows at the full context size of every run rather than at the size of a verdict. The project's own security tooling already flags patterns inside comments, which means a prompt store will trip scanners constantly and generate exactly the false-positive stream that erodes attention to real findings. Most likely failure mode: storage and scan noise make the corpus expensive from week one, retention gets capped to a short window to control both, and the short window destroys the longitudinal comparison that was the entire justification for collecting it. For the objection not to hold, prompts would need to be stored as content-addressed references to already-committed units plus a small delta — not as full text — which is a substantially harder design than "record the prompt".
- Objection answered: no (accepted downside per objection policy: none)

### 10. Give the skill-proposal loop a fitness signal on its own output — score: 2.50

- Premise: Track, for every proposal that clears the gate and is promoted into a real skill, whether the promoted skill subsequently outperforms the baseline it was meant to improve on — so the proposal loop is measured on the value of what it promotes, not on how many proposals it emits.
- Persona: A tech lead approving skill proposals with no way to know whether their last ten approvals produced anything that got used or worked.
- Complexity: medium
- Key risk: Promotions are too rare to ever accumulate a countable population.
- Impact / Confidence / Effort: M / M / M — base score 2.00
- Strategy alignment: +0.5 track:Compounding feedback loops — applied (|Δbase| = 0.00 ≤ 0.05) — final score 2.50
- Strongest objection: The loop this would measure has not run yet — `.harness/proposals/` is empty in the dogfood repo and both emission surfaces are dormant by design — so a fitness signal on promotions would be built over a population of zero and stay at zero until the upstream activation work lands, at which point promotions will still arrive at a rate of a handful per quarter. A measurement whose sample accrues that slowly cannot detect a regression within any window in which someone could act on it, and the intervening variable is brutal: a promoted skill that goes unused scores identically to one that is used and fails. Most likely failure mode: the surface is built, reports "insufficient data" for two quarters, and is quietly dropped before it ever renders a verdict — having consumed the effort that could have gone to activating the loop it was measuring. For the objection not to hold, the proposal pipeline would need to be genuinely live and producing promotions at volume first, which makes this a follow-on to that activation rather than a candidate that stands on its own.
- Objection answered: no (accepted downside per objection policy: none)
