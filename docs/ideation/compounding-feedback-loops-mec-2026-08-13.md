---
topic: 'Compounding feedback loops: mechanisms that make agents and skills measurably improve over time — the skill-proposal loop, skill-effectiveness baselines, trust scoring, and prompt injection from historical outcomes'
generated_at: 2026-08-13T16:00:00Z
strategy_grounded: true
strategy_path: STRATEGY.md
count_requested: 10
count_generated: 10
ranking_formula: '(impact × confidence) ÷ effort; strategy-alignment tiebreaker (max +0.75) applied only when |Δbase_score| ≤ 0.05'
---

# Ideation: Compounding feedback loops (skill-proposal loop, effectiveness baselines, trust scoring, historical-outcome prompt injection)

## Inputs

- Topic: "Compounding feedback loops: mechanisms that make agents and skills measurably improve over time — the skill-proposal loop, skill-effectiveness baselines, trust scoring, and prompt injection from historical outcomes"
- Generated: 2026-08-13T16:00:00Z
- Strategy grounding: enabled — STRATEGY.md present and valid; matching track "Compounding feedback loops" (skill proposal loop, skill effectiveness baselines, trust scoring, prompt injection from historical outcomes)
- Objection policy: none — each candidate's single strongest objection stands as an accepted downside (not rebutted)

Grounding note: candidates were checked against the current codebase. The skill-proposal loop is largely complete (emit → auto-retrospect → mechanical gate → human approve → promote); skill-effectiveness and trust scorers exist and are wired together (persona effectiveness → review-finding trust), but effectiveness is computed on demand rather than snapshotted, trust never gates autonomy, and historical outcomes reach scoring/gates/humans but are never push-injected into new agent run prompts. Premises target those confirmed gaps rather than restating shipped machinery.

## Ranked candidates

### 1. Weight skill recommendation by measured effectiveness — score: 6.50

- Premise: Feed the existing Laplace-smoothed skill success rates (`packages/intelligence/.../skill-scorer.ts`) into `recommend_skills`/`advise_skills` so proven skills rank higher and `detectFailingSkills`/`detectAbandonedSkills` outputs are demoted at selection time.
- Persona: A tech lead 3–6 months into agent adoption who watches the agent keep reaching for a skill that quietly underperforms, because selection is blind to outcomes.
- Complexity: low
- Impact / Confidence / Effort: M / H / L — base score 6.00
- Strategy alignment: +0.5 track:Compounding feedback loops — final score 6.50
- Strongest objection: The scorer already exists, so this is "just wiring," which usually means the value is capped by the quality of the signal underneath it — adoption telemetry is sparse per skill, and Laplace smoothing over a handful of invocations produces rankings that swing on one or two runs. Most likely failure mode: low-volume skills get ranked by noise, the recommender starts steering agents away from a rarely-used-but-correct skill, and a human notices the recommendation got _worse_, eroding trust in the whole feedback loop. For the objection not to hold, per-skill invocation counts would need to clear a confidence floor before effectiveness is allowed to move the ranking at all.
- Objection answered: no (accepted downside per objection policy: none)

### 2. Cluster skill proposals into a ranked recurring-gap backlog — score: 6.50

- Premise: Add semantic clustering over the open proposals in `.harness/proposals/` so recurring gaps (today deduped only per-target-skill by the store) surface as a single ranked "most-requested capability" backlog instead of scattered one-off records.
- Persona: A tech lead triaging the proposal queue who cannot tell that six differently-worded proposals are really one missing skill everyone keeps hitting.
- Complexity: low
- Impact / Confidence / Effort: M / H / L — base score 6.00
- Strategy alignment: +0.5 track:Compounding feedback loops — final score 6.50
- Strongest objection: Clustering is only worth building once proposal volume is high enough to hide signal, and right now the queue is small enough that a human scanning `harness proposals list` sees the duplication unaided — so this optimizes a problem that does not yet bite. Most likely failure mode: embedding-based clustering mis-groups near-synonym gaps that are actually distinct, or splits one gap across two clusters, and the "ranked backlog" is less trustworthy than the raw list it replaced. For the objection not to hold, the proposal inflow (including the auto-retrospection emitter) would need to be producing enough volume that manual dedup has already become the bottleneck.
- Objection answered: no (accepted downside per objection policy: none)

### 3. Snapshot skill-effectiveness baselines with drift thresholds — score: 3.75

- Premise: Periodically snapshot per-skill effectiveness (from `adoption.jsonl` + `execution_outcome` nodes) into a persisted baseline artifact with per-skill drift thresholds, replacing today's compute-on-demand scores that have no historical anchor.
- Persona: A tech lead who wants a defensible "is our skill catalog getting better or worse this month" number, not a figure recomputed fresh every time it is asked.
- Complexity: medium
- Impact / Confidence / Effort: H / M / M — base score 3.00
- Strategy alignment: +0.5 track:Compounding feedback loops, +0.25 Our approach (machine-checkable baselines mirror the Harness-Coverage / architecture-timeline pattern) — final score 3.75
- Strongest objection: Baselines are only meaningful if the underlying outcome labels are trustworthy, and effectiveness here is a blend of outcome-eval verdicts and self-reported invocation outcomes that carry known noise (abandoned-mid-workflow is ambiguous, `failureCategory` is coarse). Most likely failure mode: a snapshot bakes in a bad month as "the baseline," every subsequent skill edit trips a drift threshold against a distorted anchor, and the team learns to ignore the drift alerts — the exact fate of a ratchet nobody trusts. For the objection not to hold, the outcome-labeling pipeline would need calibration (and probably a minimum sample size per skill) _before_ any threshold is allowed to fire.
- Objection answered: no (accepted downside per objection policy: none)

### 4. Push-inject top-K similar historical outcomes into new-run prompts — score: 3.75

- Premise: Have the orchestrator retrieve the top-K most-similar prior `execution_outcome` nodes and `docs/solutions` post-mortems for the task at hand and inject their lessons into the dispatch prompt, extending `priorGateFailure` (today same-issue-retry only) to cross-run "last time a similar task failed because X."
- Persona: A solo developer running 10+ agent sessions a week who keeps re-hitting failures the harness already recorded, because every new invocation starts cold and never sees the prior lesson unless it thinks to call `search_similar`.
- Complexity: medium
- Impact / Confidence / Effort: H / M / M — base score 3.00
- Strategy alignment: +0.5 track:Compounding feedback loops (the marquee "prompt injection from historical outcomes" bullet), +0.25 Target problem ("each agent invocation starts cold, re-litigates settled decisions") — final score 3.75
- Strongest objection: Retrieval precision is the whole ballgame, and injecting the _wrong_ K prior outcomes is strictly worse than injecting none — it spends scarce context budget priming the executor toward a lesson from a superficially-similar-but-actually-different task, and negative transfer degrades runs that would otherwise have succeeded. Most likely failure mode: similarity is computed over task descriptions (a length/keyword proxy, as the AMR pre-diff classifier already is), the top-K are topically adjacent but causally irrelevant, and the agent over-indexes on a red herring. For the objection not to hold, retrieval would need a relevance gate strong enough that low-confidence matches inject nothing rather than something.
- Objection answered: no (accepted downside per objection policy: none)

### 5. Skill-effectiveness ratchet as a CI gate — score: 2.75

- Premise: Promote `detectFailingSkills` from a report into a CI gate that flags (non-blocking floor first) when a skill's smoothed success rate regresses beyond its baseline tolerance, mirroring the coverage/architecture ratchets already in the pre-push gauntlet.
- Persona: A tech lead who wants a silently-degrading skill to trip a gate in CI the same way a layer violation does, rather than being discovered in a monthly retrospective.
- Complexity: medium
- Impact / Confidence / Effort: M / M / M — base score 2.00
- Strategy alignment: +0.5 track:Compounding feedback loops, +0.25 Our approach (constraints-as-code: another machine-checkable ratchet) — final score 2.75
- Strongest objection: A ratchet keyed to a noisy, low-volume metric is a false-positive machine, and the harness already carries several non-blocking floors (required-review, security baseline) that teams have learned to merge through — adding another one that cries wolf trains the team to ignore gate output generally, which is a net negative for the whole enforcement thesis. Most likely failure mode: an unrelated PR merges during a bad-luck window of skill outcomes, the ratchet reds, the author has no lever to green it (skill quality is not what their PR changed), and the gate becomes noise. For the objection not to hold, this depends entirely on candidate #3's calibrated baseline plus a sample-size floor — without those it should not be built.
- Objection answered: no (accepted downside per objection policy: none)

### 6. Curated anti-pattern corpus injected as executor guardrails — score: 2.75

- Premise: Mine recurring failures from `execution_outcome` NOT_SATISFIED verdicts and black-box `gate-blocked` records into a small human-curated "known failure modes" set that is injected as explicit prohibitions into executor prompts.
- Persona: A solo heavy user whose agent keeps re-committing the same class of mistake (e.g. barrel-integration thrash, empty-diff halts) that the harness has already seen dozens of times.
- Complexity: medium
- Impact / Confidence / Effort: M / M / M — base score 2.00
- Strategy alignment: +0.5 track:Compounding feedback loops, +0.25 Target problem ("agents drift back to bad patterns the moment a session forgets the prompt") — final score 2.75
- Strongest objection: Curation does not scale and staleness rots the corpus — a "known failure modes" list is only as good as its last human curation pass, and an out-of-date prohibition ("never do X") actively fights a change that has since made X correct, so the guardrail becomes a source of drift rather than a cure. Most likely failure mode: the corpus is seeded once with real failures, never revisited, and six months later it is prohibiting patterns that the codebase now mandates. For the objection not to hold, the corpus would need an expiry/review cadence tied to the same retrospection loop that produces skill proposals, so entries decay unless re-affirmed.
- Objection answered: no (accepted downside per objection policy: none)

### 7. Per-backend/per-agent trust score feeding routing — score: 2.75

- Premise: Compute a rolling trust score per (backend, task-class) from historical gate pass rates and feed it into the `BackendRouter` so demonstrably-unreliable backends are downgraded or escorted (paired with a reviewer) rather than dispatched blind.
- Persona: A tech lead running a mixed local/cloud fleet who currently has no signal for "this backend keeps failing this class of task" beyond reading black-box records by hand.
- Complexity: high
- Impact / Confidence / Effort: H / M / H — base score 2.00
- Strategy alignment: +0.5 track:Compounding feedback loops (trust scoring), +0.25 Our approach ("the substrate the agent runs on, not the agent itself, determines reliability") — final score 2.75
- Strongest objection: A trust score that reroutes work creates a self-reinforcing feedback trap: a backend that scores low gets fewer (and only harder, escorted) tasks, which prevents it from ever recovering its score, so the loop ossifies an early bad streak into a permanent demotion regardless of later capability or a model upgrade. Most likely failure mode: a transient bad window (a flaky CI period, one gnarly task-class) tanks a backend's trust, routing starves it, and the score never rebuilds because the evidence stream dried up. For the objection not to hold, the router would need an exploration policy (periodic trust-blind dispatch) so scores can recover — which is real ML-systems complexity, not a weekend wiring job.
- Objection answered: no (accepted downside per objection policy: none)

### 8. Build the stubbed skill-mode soundness-review gate — score: 1.33

- Premise: Replace the proposal-promotion gate's explicit "degraded mode" (mechanical YAML/markdown/diff checks only) with the named-but-unbuilt semantic gate `harness skill run harness-soundness-review --mode skill`, so agent-proposed skills are judged on soundness before human approval, not just well-formedness.
- Persona: A tech lead reviewing agent-proposed skills who currently gets a "the YAML is valid" green light that says nothing about whether the proposed skill is actually a good idea.
- Complexity: high
- Impact / Confidence / Effort: M / M / H — base score 1.33
- Strategy alignment: +0.5 track:Compounding feedback loops, +0.25 Our approach (a machine-checkable constraint on the promotion path) — final score 1.33 (bonus recorded but NOT applied — no adjacent base-score tie within 0.05)
- Strongest objection: The gate is stubbed precisely because "the skill-mode check vocabulary is not yet designed" — the hard part is not running soundness-review, it is defining what soundness _means_ for a skill (as opposed to a spec), and shipping a gate on top of an under-specified rubric produces confident-but-arbitrary verdicts that a human reviewer must then second-guess, adding a step without adding trust. Most likely failure mode: the LLM judge blocks a perfectly good proposed skill on a rubric criterion nobody agreed to, the reviewer overrides it, and the gate becomes advisory theater. For the objection not to hold, the skill-soundness rubric would need to be designed and validated against real proposals _before_ the gate is wired — that design work, not the wiring, is the actual project.
- Objection answered: no (accepted downside per objection policy: none)

### 9. Trust-gated autonomy escalation — score: 1.75

- Premise: Make a run's unattended/auto-merge eligibility rise and fall with the acting agent's accumulated trust score and the live holiday-confidence gates, replacing today's fixed pass/fail gates with an earned-autonomy ladder.
- Persona: A tech lead deciding whether to leave the fleet running unattended over a weekend, who today has only a repo-wide holiday-confidence number and no per-agent "has this one earned the leash" signal.
- Complexity: high
- Impact / Confidence / Effort: H / L / H — base score 1.00
- Strategy alignment: +0.5 track:Compounding feedback loops (trust scoring), +0.25 Target problem (the "if the senior disappears for two weeks, what holds?" thesis) — final score 1.75
- Strongest objection: Autonomy is the single highest-blast-radius decision the harness makes, and letting an _accumulated_ score raise the auto-merge bar means one over-trusted agent on a streak can ship something catastrophic unattended precisely when oversight has been dialed down — the failure is rare but unbounded, which is the worst risk profile. Most likely failure mode: trust accrued on easy task-classes transfers to a hard one, the agent ships a subtly wrong change during the unattended window, and no human is watching because the ladder said it was safe. For the objection not to hold, escalation would need to be strictly bounded (trust can widen review, never remove the human merge gate) — at which point much of the headline value evaporates.
- Objection answered: no (accepted downside per objection policy: none)

### 10. Feed black-box forensic records back into routing and planning — score: 1.75

- Premise: Read the today-write-only `.harness/black-box/run-*/run.json` records (routing choices, provenance, per-unit `gateReason`) back into routing decisions and pre-run planning, closing the loop on a forensic sink that currently informs nothing.
- Persona: A tech lead who has 60+ richly-detailed run records that explain exactly why past runs failed, none of which the harness ever consults when planning the next run.
- Complexity: medium
- Impact / Confidence / Effort: M / L / M — base score 1.00
- Strategy alignment: +0.5 track:Compounding feedback loops, +0.25 Our approach (durable grounding fed back into the substrate) — final score 1.75
- Strongest objection: Black-box records were designed as a forensic sink for humans, and their schema is optimized for post-hoc debugging, not for machine consumption — repurposing them as a planning input means treating an audit log as a decision oracle, and the two goals conflict (a forensic record wants completeness and stability; a routing input wants a curated, low-latency, schema-stable signal). Most likely failure mode: the record format shifts to serve routing, its forensic value degrades, and the routing signal it feeds substantially overlaps what `execution_outcome` nodes already provide via candidate #4 — so this either duplicates #4 or corrupts the forensic trail. For the objection not to hold, there would need to be a routing-relevant signal in black-box records that is genuinely absent from the graph's outcome nodes.
- Objection answered: no (accepted downside per objection policy: none)

## Handoff

- Ideation artifact written: docs/ideation/compounding-feedback-loops-mec-2026-08-13.md
- Top pick: "Weight skill recommendation by measured effectiveness" — score 6.50
- Next: invoke /harness:brainstorming "Effectiveness-weighted skill recommendation" to take a candidate into a spec, OR /harness:roadmap to enqueue picks for later.
