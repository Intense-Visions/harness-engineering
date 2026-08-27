---
topic: 'Upstream grounding: make the strategic and knowledge substrate (STRATEGY.md, the knowledge graph, principles, ADRs) durable enough that downstream skills ground reliably instead of starting cold each invocation'
generated_at: 2026-08-13T12:00:00Z
strategy_grounded: true
strategy_path: STRATEGY.md
count_requested: 10
count_generated: 10
ranking_formula: '(impact × confidence) ÷ effort; strategy-alignment tiebreaker (max +0.75) applied only when |Δbase_score| ≤ 0.05'
---

# Ideation: Upstream grounding — make the strategic and knowledge substrate durable enough that downstream skills ground reliably instead of starting cold

## Inputs

- Topic: Upstream grounding: make the strategic and knowledge substrate (STRATEGY.md, the knowledge graph, principles, ADRs) durable enough that downstream skills ground reliably instead of starting cold each invocation
- Generated: 2026-08-13T12:00:00Z
- Strategy grounding: enabled — STRATEGY.md present and valid; matching track "Upstream grounding". Objection policy: none (each candidate's strongest objection stands as an accepted downside; none are rebutted).

## Ranked candidates

### 1. A knowledge-graph coverage gate fails CI when a package's load-bearing upstream nodes (ADRs, principles, STRATEGY sections) fall below a per-package density threshold — score: 6.75

- Persona: The tech lead 3–6 months into agent adoption who owns the Context Density KPI and is watching packages accumulate code with no anchoring decisions behind them.
- Complexity: low
- Impact / Confidence / Effort: M/H/L — base score 6.00
- Strategy alignment: +0.5 track:Upstream grounding, +0.25 references Context Density metric / Our approach (machine-checkable) — final score 6.75
- Strongest objection: A raw node-count threshold rewards volume over load-bearing-ness — a package can clear the gate with ten shallow, never-read ADRs while a genuinely under-grounded package with two excellent principles fails. The gate measures the proxy (density) the KPI already tracks, not the thing that matters (do downstream skills actually retrieve and use these nodes), so it risks becoming a checkbox that teams satisfy by minting filler nodes, inflating the very substrate it was meant to make trustworthy. Most likely failure mode: the number goes green while grounding quality is unchanged or worse.
- Objection answered: no — accepted as a standing downside per objection policy (none).

### 2. Skills assert a minimum valid grounding set as an explicit precondition before running, degrading gracefully (with a recorded warning) when the substrate is missing or stale — score: 6.75

- Persona: The senior engineer who has seen brainstorming and roadmap-pilot produce confident output from an empty or invalid STRATEGY.md and wants a skill to say so out loud rather than silently start cold.
- Complexity: low
- Impact / Confidence / Effort: M/H/L — base score 6.00
- Strategy alignment: +0.5 track:Upstream grounding, +0.25 references Target problem (starting cold each invocation) — final score 6.75
- Strongest objection: Preconditions that "degrade gracefully" tend to normalize degradation — once every skill can proceed with a warning, the warning becomes background noise and the assertion changes nothing except adding a line to the log. If the precondition is instead made blocking, it converts a soft cold-start into a hard stop that interrupts flow the moment STRATEGY.md is mid-edit or the graph is rebuilding, and users will reach for a bypass flag that then becomes the default. Most likely failure mode: the guard is either too soft to matter or too hard to tolerate, and no threshold satisfies both.
- Objection answered: no — accepted as a standing downside per objection policy (none).

### 3. Each skill invocation records its grounding provenance in the black-box record — exactly which STRATEGY sections, ADRs, principles, and graph nodes it actually consumed — so cold-start vs. genuinely-grounded runs become measurable — score: 4.00

- Persona: The harness maintainer who wants to prove (not assume) that the Upstream-grounding investments change downstream behavior, using the existing per-run flight-recorder.
- Complexity: low
- Impact / Confidence / Effort: M/M/L — base score 4.00
- Strategy alignment: +0.5 track:Upstream grounding, +0.25 references Target problem (starting cold) — final score 4.00 (bonus recorded; not applied — no adjacent base-score tie)
- Strongest objection: Recording what a skill _read_ is not the same as recording what it was _influenced by_ — a skill can load a STRATEGY section into context and still ignore it, so provenance produces an optimistic upper bound on grounding that looks like evidence but isn't. Worse, the metric invites gaming: a skill that touches every node scores as maximally grounded regardless of whether the retrieval improved its output. Most likely failure mode: provenance becomes a vanity signal that shows high "grounding" while output quality is unmoved, giving false confidence to the very people trying to validate the thesis.
- Objection answered: no — accepted as a standing downside per objection policy (none).

### 4. A precompiled, cached grounding bundle resolves the relevant STRATEGY sections, ADRs, principles, and graph nodes for a given topic into one ready substrate that downstream skills load instead of re-assembling cold each invocation — score: 3.75

- Persona: The tech lead running brainstorming, ideate, and roadmap-pilot back-to-back who watches each skill re-derive the same context from scratch and pay the latency and inconsistency tax every time.
- Complexity: medium
- Impact / Confidence / Effort: H/M/M — base score 3.00
- Strategy alignment: +0.5 track:Upstream grounding, +0.25 references Target problem (starting cold) + Our approach (durable grounding) — final score 3.75
- Strongest objection: The bundle's value hinges entirely on the topic-relevance selection that decides which nodes belong in it, and that selection is the hard, unsolved part — a bundle that over-includes recreates the cold-start noise it was meant to remove, while one that under-includes silently drops the load-bearing ADR and grounds skills on a confident, incomplete picture. Caching then compounds the error: a stale bundle serves the wrong substrate fast, and invalidation across STRATEGY.md, ADRs, and graph edits is exactly the freshness problem this track is trying to solve, now duplicated in a second place. Most likely failure mode: the bundle is trusted precisely because it's precompiled, so its selection errors propagate unquestioned into every downstream skill.
- Objection answered: no — accepted as a standing downside per objection policy (none).

### 5. A staleness detector flags when the upstream substrate has drifted from the code it describes (and from itself) before a downstream skill consumes it, so skills never ground on a substrate that no longer matches reality — score: 3.75

- Persona: The senior engineer whose STRATEGY.md and ADRs lag the codebase by weeks and who currently discovers the drift only when a skill confidently grounds on a decision that was reversed three PRs ago.
- Complexity: medium
- Impact / Confidence / Effort: M/H/M — base score 3.00
- Strategy alignment: +0.5 track:Upstream grounding, +0.25 references Our approach (machine-checkable) + Target problem (drift) — final score 3.75
- Strongest objection: Detecting drift between prose (STRATEGY.md, ADRs, principles) and code is a semantic-alignment problem, and heuristic detectors here are prone to both false positives (flagging a rename as a strategy change) and false negatives (missing a genuine reversal expressed in new code with old vocabulary) — the existing doc-drift detector already had to be made language-aware to tame exactly this. A noisy detector trains users to ignore its warnings, at which point stale grounding sails through anyway. Most likely failure mode: the signal-to-noise ratio never clears the bar where a human trusts the flag, so the substrate keeps drifting while the detector cries wolf.
- Objection answered: no — accepted as a standing downside per objection policy (none).

### 6. A grounding-health lane in `harness insights` surfaces per-package upstream coverage, substrate staleness, and grounding provenance in one scannable view — score: 3.75

- Persona: The tech lead who wants a single at-a-glance answer to "is our substrate healthy enough to leave the agent unwatched?" rather than piecing it together from three separate KPI sources.
- Complexity: low
- Impact / Confidence / Effort: L/H/L — base score 3.00
- Strategy alignment: +0.5 track:Upstream grounding, +0.25 references Context Density / Holiday-Confidence metrics — final score 3.75
- Strongest objection: A dashboard is a downstream mirror of upstream signals — it can only be as good as the coverage, staleness, and provenance measures feeding it, so building the lane before those measures are trustworthy just renders unreliable numbers more legibly and lends them unearned authority. It also creates maintenance surface that competes for attention with the substrate work itself, and dashboards that don't drive an action tend to be glanced at once and then ignored. Most likely failure mode: the lane ships, looks impressive in a demo, and changes no one's behavior because the metrics behind it aren't yet load-bearing.
- Objection answered: no — accepted as a standing downside per objection policy (none).

### 7. ADR lifecycle status is enforced with real transitions (proposed → accepted → superseded) and supersession backlinks, so settled or reversed decisions stop being silently re-litigated by cold agents — score: 2.75

- Persona: The senior engineer who keeps seeing agents re-open architectural questions an ADR already closed because nothing marks the decision as settled or points from the old record to the one that replaced it.
- Complexity: medium
- Impact / Confidence / Effort: M/M/M — base score 2.00
- Strategy alignment: +0.5 track:Upstream grounding, +0.25 references Target problem (re-litigate settled decisions) — final score 2.75
- Strongest objection: Lifecycle metadata is only durable if it is kept accurate, and ADR status is exactly the kind of field that rots — a decision gets reversed in code while its ADR still reads "accepted," so the enforced status now actively misleads the agent with the authority of a machine-checked field. Enforcing transitions adds process friction (a superseding PR must remember to relink and restatus) that humans skip under deadline, and a half-maintained status graph is worse than none because it looks trustworthy. Most likely failure mode: the status field lies confidently, and agents re-ground on a "settled" decision that no longer holds.
- Objection answered: no — accepted as a standing downside per objection policy (none).

### 8. A commit-time hook incrementally re-ingests changed source into the knowledge graph on every merge, so the substrate stays continuously fresh instead of being rebuilt cold on a periodic or manual cadence — score: 2.75

- Persona: The individual developer running 10+ agent sessions a week whose knowledge graph is only as current as the last full rebuild they remembered to run, and who pays for the gap in stale retrievals.
- Complexity: high
- Impact / Confidence / Effort: H/M/H — base score 2.00
- Strategy alignment: +0.5 track:Upstream grounding, +0.25 references Our approach (durable grounding in a knowledge graph) — final score 2.75
- Strongest objection: Incremental graph ingestion is genuinely hard to get correct — partial updates must handle deleted symbols, moved files, renamed exports, and cross-package edges without leaving orphaned or duplicated nodes, and an incremental path that silently diverges from a full rebuild produces a substrate that is fresh but wrong, which is more dangerous than one that is stale but consistent. Putting it on a commit/merge hook also loads the hot path everyone feels, so any latency or flake turns into pressure to bypass it (this repo's hooks already draw that complaint). Most likely failure mode: incremental drift accumulates invisibly until a full rebuild reveals the graph had been quietly lying for weeks.
- Objection answered: no — accepted as a standing downside per objection policy (none).

### 9. STRATEGY.md and the knowledge graph are kept in bidirectional sync so tracks, metrics, and sections exist as first-class, reachable graph nodes rather than prose the graph can't traverse — score: 2.75

- Persona: The harness maintainer who wants a skill to answer "which shipped work advances the Upstream-grounding track?" by traversing the graph, not by re-parsing STRATEGY.md prose on every invocation.
- Complexity: medium
- Impact / Confidence / Effort: M/M/M — base score 2.00
- Strategy alignment: +0.5 track:Upstream grounding, +0.25 references Our approach (durable grounding in graph and STRATEGY.md) — final score 2.75
- Strongest objection: Two-way sync between a human-authored prose document and a generated graph is a source-of-truth conflict waiting to happen — the moment both sides can change, you need conflict resolution, and the durable-anchor contract deliberately makes STRATEGY.md human-owned and skills read-only against it, so a bidirectional design risks a skill mutating the very anchor it is supposed to only consume. Even one-way materialization drifts the instant STRATEGY.md is edited without re-seeding. Most likely failure mode: the graph and the document disagree, and downstream skills can no longer tell which one is authoritative — defeating the point of a single durable anchor.
- Objection answered: no — accepted as a standing downside per objection policy (none).

### 10. A compiler turns documented principles and ADRs into machine-checkable constraints (ESLint rules, validators) semi-automatically, so upstream decisions fire in real time instead of living as prose an agent may never read — score: 1.00

- Persona: The tech lead who has written the architectural principles down but watches agents violate them anyway, because a principle that isn't enforced is a convention the next cold session forgets.
- Complexity: high
- Impact / Confidence / Effort: H/L/H — base score 1.00
- Strategy alignment: +0.5 track:Upstream grounding, +0.25 references Our approach (constraints-as-code, machine-checkable) — final score 1.00 (bonus recorded; not applied — no adjacent base-score tie)
- Strongest objection: The gap between a prose principle ("modules should own one responsibility") and an executable check is precisely where the hard, irreducible engineering judgment lives, and a semi-automatic compiler will either generate constraints so generic they catch nothing or so literal they misfire on the first legitimate exception — and a wrong auto-generated constraint firing in real time is worse than an unenforced principle, because it blocks correct code with machine authority and erodes trust in the whole harness. Most likely failure mode: the compiler produces constraints that are either toothless or tyrannical, and the human ends up hand-writing every rule anyway, which is where the effort actually was.
- Objection answered: no — accepted as a standing downside per objection policy (none).
