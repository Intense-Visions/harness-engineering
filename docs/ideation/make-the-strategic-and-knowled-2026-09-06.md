---
topic: 'Make the strategic and knowledge substrate — STRATEGY.md, the knowledge graph, principles, and ADRs — durable enough that downstream skills ground reliably instead of starting cold each invocation.'
generated_at: 2026-09-06T16:22:33Z
strategy_grounded: true
strategy_path: STRATEGY.md
count_requested: 10
count_generated: 10
ranking_formula: '(impact × confidence) ÷ effort; strategy-alignment tiebreaker (max +0.75) applied only when |Δbase_score| ≤ 0.05'
---

# Ideation: Make the strategic and knowledge substrate — STRATEGY.md, the knowledge graph, principles, and ADRs — durable enough that downstream skills ground reliably instead of starting cold each invocation.

## Inputs

- Topic: Make the strategic and knowledge substrate — STRATEGY.md, the knowledge graph, principles, and ADRs — durable enough that downstream skills ground reliably instead of starting cold each invocation.
- Generated: 2026-09-06T16:22:33Z
- Strategy grounding: enabled — `STRATEGY.md` present and valid; `Tracks`, `Target problem`, `Our approach`, and `Who it's for` read for the alignment tiebreaker.
- Objection policy for this run: **none answered**. Every strongest objection below stands as an accepted, unrebutted downside. No rebuttal was authored by the agent, and no objection changes any score or rank.

### Observed substrate state at generation time

Candidate effort and confidence estimates were calibrated against the repository as it stands at `e530ae6`, not against a blank slate:

- `docs/knowledge/decisions/` holds 136 ADRs numbered through 0124. Status distribution: 116 `accepted`, 17 `proposed`, 2 records carrying a literal enum string rather than a value.
- ADR 0123 carries `status: proposed` while its own body states the behavior it records already shipped — the status field is descriptive prose, not an enforced lifecycle.
- 23 ADR files mention supersession in prose; no ADR carries `superseded` as a status value and there is no backlink invariant.
- Compiled comprehension units, the serve-time hash gate, and dispatch-time pre-warm injection have already shipped, and cover **code shape**. Decisions, principles, and STRATEGY sections are not part of that compiled substrate.
- `packages/linter-gen` exists, which raises the floor under any principle-to-constraint compilation idea relative to a from-scratch estimate.

## Ranked candidates

### 1. ADR status becomes a machine-enforced lifecycle — validated transitions plus reciprocal `superseded_by` / `supersedes` backlinks — so a reversed decision cannot keep presenting itself as live guidance — score: 6.75

- Persona: The tech lead 3–6 months into agent adoption who keeps watching agents re-open decisions the team already settled, because the record the agent reads does not say which way the decision finally went.
- Complexity: low
- Impact / Confidence / Effort: M/H/L — base score 6.00
- Strategy alignment: +0.5 track:`Upstream grounding` ("make the strategic and knowledge substrate (STRATEGY.md, knowledge graph, principles, ADRs) durable enough that downstream skills ground reliably") +0.25 Target problem ("re-litigates settled architectural decisions") = +0.75 — final score 6.75 (bonus **applied**: base tied with candidate 2 at 6.00, |Δ| = 0.00 ≤ 0.05)
- Strongest objection: This fixes the _integrity_ of the decision record without touching the _reachability_ of it, and reachability is the binding constraint. An agent that never opens the ADR directory is unaffected by whether the frontmatter in that directory is internally consistent; the enforcement lands entirely on the human authoring path, where the failure was never expensive. The most likely failure mode is a validator that goes green on day one — because 116 records already say `accepted` — while the 17 `proposed` records that actually shipped stay mislabeled until someone hand-audits them, so the gate holds a line that was never being crossed and the real corpus stays wrong. There is a second, meaner mode: forcing a status transition to be mechanically legal invites authors to satisfy the schema rather than the semantics, producing `superseded_by` links that are syntactically reciprocal and substantively arbitrary. For this objection not to hold, the ADRs would have to be genuinely load-bearing at agent runtime today — something a grounding-provenance record could establish but which nothing currently measures — and the initial backfill of the 17 mislabeled records would have to be part of the same change rather than deferred to a follow-up nobody schedules.
- Objection answered: no

### 2. Every skill invocation records its grounding provenance in the black-box run record — the exact STRATEGY sections, ADRs, principles, and graph nodes it actually consumed — so "started cold" becomes a measured fact rather than an assumption — score: 6.75

- Persona: The maintainer of the harness itself, who cannot currently tell a genuinely grounded run from a cold one after the fact, and so cannot tell whether any grounding investment paid.
- Complexity: low
- Impact / Confidence / Effort: M/H/L — base score 6.00
- Strategy alignment: +0.5 track:`Upstream grounding` +0.25 Target problem ("each agent invocation starts cold") = +0.75 — final score 6.75 (bonus **applied**: base tied with candidate 1 at 6.00, |Δ| = 0.00 ≤ 0.05)
- Strategy note: ranked below candidate 1 on the stable-tie rule (identical final score; generation order preserved), not on any judgment that it matters less.
- Strongest objection: Provenance measures what was _injected_, not what was _used_, and the gap between those two is the entire question. The pre-warm resolver knows which nodes it put into the prompt; it has no visibility into whether the model attended to them, and a run record showing four ADRs and three STRATEGY sections resolved is fully compatible with a model that ignored all seven. The most likely failure mode is a metric that looks like rigor and functions as reassurance: grounding-coverage numbers climb, "cold start" appears solved on the dashboard, and downstream behavior is unchanged — the exact shape of the already-deferred behavioral A/B that this record does not substitute for. Compounding it, provenance is only as honest as the resolver's own bookkeeping, so any grounding that reaches the model through a path the resolver does not mediate is invisible and silently scores as absent. For this objection not to hold, the provenance record would have to be paired with an outcome signal that can distinguish injected-and-used from injected-and-ignored, which means this idea is a prerequisite for the measurement rather than the measurement itself.
- Objection answered: no

### 3. Extend the compiled-comprehension substrate from code to decisions: a committed, hash-gated unit per scope that resolves the handful of ADRs and principles actually binding on that scope, so a leaf agent receives its governing decisions pre-warmed instead of a directory of 136 files — score: 3.75

- Persona: The leaf agent's operator — a tech lead dispatching autonomous work — who knows the binding decision exists somewhere in the corpus but has no way to get it in front of the agent that needs it.
- Complexity: high
- Impact / Confidence / Effort: H/M/M — base score 3.00
- Strategy alignment: +0.5 track:`Upstream grounding` +0.25 Target problem ("each agent invocation starts cold, re-litigates settled architectural decisions") = +0.75 — final score 3.75 (bonus **applied**: base tied with candidates 4 and 5 at 3.00, |Δ| = 0.00 ≤ 0.05)
- Strongest objection: Decisions do not decompose along the file boundaries that made code comprehension compilable. A compiled comprehension unit works because a module's shape is a property of that module; an architectural decision is precisely the kind of knowledge that is _not_ local — its whole value is that it constrains code it never mentions, in packages that did not exist when it was written. The most likely failure mode is a relevance function that degrades into path matching: ADRs get attached to the scopes whose paths they happen to name, which systematically surfaces the decisions that are already obvious from reading the code and systematically misses the cross-cutting ones that an agent would actually re-litigate. There is a freshness trap underneath it too — the code substrate can re-derive units from source on every merge, but a decision-to-scope mapping has no mechanical ground truth to re-derive from, so it either needs human curation at 136-and-growing records or it silently rots into a stale index that is worse than no index because it looks authoritative. For this objection not to hold, decisions would need a durable machine-readable statement of what they bind that is authored once at decision time and does not require re-curation as the codebase moves underneath it.
- Objection answered: no

### 4. STRATEGY.md's tracks, metrics, and sections are ingested as first-class graph nodes with edges to the ADRs, roadmap items, and packages that serve them, so strategic intent is traversable rather than prose the graph cannot reason over — score: 3.75

- Persona: The tech lead deciding what to build next, who wants to ask which packages currently serve a given track and gets no answer because the strategy lives outside the graph.
- Complexity: medium
- Impact / Confidence / Effort: M/H/M — base score 3.00
- Strategy alignment: +0.5 track:`Upstream grounding` +0.25 Our approach ("durable grounding in a knowledge graph and STRATEGY.md") = +0.75 — final score 3.75 (bonus **applied**: base tied with candidates 3 and 5 at 3.00, |Δ| = 0.00 ≤ 0.05)
- Strongest objection: The edges are the product here, and the edges are the part that cannot be ingested — they have to be asserted. Ingesting six sections and six tracks as nodes is nearly free and nearly worthless; what makes the graph answer "which packages serve Upstream grounding" is a set of track-to-artifact relationships that exist in nobody's head in a form a parser can extract, and inferring them from keyword overlap will confidently connect every package to every track, since the tracks are written in exactly the vocabulary the codebase uses. The most likely failure mode is a graph that gains a strategy subgraph, gains the Context Density number that counts it, and answers strategic queries with plausible-looking noise that is harder to distrust than an honest absence. Worse, a strategy edge asserted once decays invisibly: a package stops serving a track when its purpose shifts, and nothing in the ingest path will ever retract that edge. For this objection not to hold, track membership would have to be declared at the artifact — a field on the roadmap item or ADR that names its track — which moves the cost onto every author and makes this an adoption problem rather than an ingestion one.
- Objection answered: no

### 5. Skills declare their required grounding set as an explicit precondition in `skill.yaml`; the runner resolves it before the first phase and records an honest DEGRADED verdict when the substrate is missing, stale, or invalid — score: 3.75

- Persona: The adopter running harness skills in a repo whose substrate is partial, who today gets a confidently-executed run with no indication that the skill ran without the grounding it assumes.
- Complexity: high
- Impact / Confidence / Effort: H/M/M — base score 3.00
- Strategy alignment: +0.5 track:`Upstream grounding` +0.25 Our approach ("workflow rigidity in skills") = +0.75 — final score 3.75 (bonus **applied**: base tied with candidates 3 and 4 at 3.00, |Δ| = 0.00 ≤ 0.05)
- Strongest objection: A precondition that degrades gracefully is a warning, and warnings on a per-invocation path get absorbed within a week. The harness ships to adopters whose repos will essentially never satisfy a full grounding set — no STRATEGY.md, no ADR corpus, an empty graph — so the DEGRADED verdict fires on the overwhelming majority of external runs and immediately becomes the ambient condition rather than a signal, which is the failure mode that makes the label worthless exactly where the substrate problem is worst. Making it blocking instead is not available: it would gate the marginal adopter out of the skill on their first invocation, which contradicts the portability commitment. The most likely failure mode is therefore a correctly-implemented contract that produces a field of yellow across every install and changes no behavior at either end — the adopter ignores it, and the maintainer cannot use it as a quality signal because it does not discriminate. For this objection not to hold, the declared grounding sets would have to be scoped tightly enough that a well-configured repo genuinely passes and a misconfigured one genuinely fails, which requires per-skill judgment across the whole skill catalog rather than one uniform contract.
- Objection answered: no

### 6. `harness ground <path>` — a read-only command that prints the exact grounding bundle an agent would receive for a given path, so cold-start is inspectable by a human before dispatch rather than diagnosed after a bad run — score: 3.50

- Persona: The tech lead about to dispatch autonomous work on an unfamiliar package, who wants to see what the agent will actually know before spending a session finding out.
- Complexity: low
- Impact / Confidence / Effort: M/H/M — base score 3.00
- Strategy alignment: +0.5 track:`Upstream grounding` — final score 3.50 (bonus **applied**: base tied with candidates 3, 4, and 5 at 3.00, |Δ| = 0.00 ≤ 0.05; ranks below them on the smaller bonus)
- Strongest objection: This is a window onto a resolver, and it inherits every weakness of the resolver it renders while adding a layer of false confidence on top. If the grounding assembly is thin, the command's honest output is a short list that a human reads as "fine" because they have no baseline for what a good bundle looks like — there is no expected set to diff against, so the tool can only report what is there, never what is missing. The most likely failure mode is a command that is run twice during onboarding and never again, because inspecting grounding before dispatch is a discipline nobody sustains when the dispatch path does not require it. It also risks the worse outcome of validating the substrate socially: a bundle that prints cleanly gets treated as evidence the grounding is adequate, when it is only evidence that the resolver ran. For this objection not to hold, the command would need to be wired into a path people already traverse — a pre-dispatch gate or a fleet CONFIRM round — rather than offered as a standalone verb.
- Objection answered: no

### 7. A staleness trip-wire evaluated at consumption time: when the upstream substrate is provably older than the code it describes, the grounding read reports the drift to the consuming skill instead of serving the stale content silently — score: 2.00

- Persona: The individual developer running 10+ agent sessions a week whose ADRs and knowledge docs describe an architecture two refactors behind the code the agent is editing.
- Complexity: medium
- Impact / Confidence / Effort: M/M/M — base score 2.00
- Strategy alignment: +0.5 track:`Upstream grounding` +0.25 Target problem ("documentation rot") = +0.75 — recorded for transparency, **not applied** (nearest base score is 3.00, |Δ| = 1.00 > 0.05) — final score 2.00
- Strongest objection: Timestamp comparison is a proxy for staleness that is wrong in both directions, and the errors are not symmetric in cost. A durable architectural decision is _supposed_ to outlive the code beneath it — an ADR from 2026-02 governing a package refactored last week is doing exactly its job, not rotting — so a mtime-based wire fires loudest on the records with the longest half-life, which are the most valuable ones. Meanwhile a doc updated yesterday with a stale claim in paragraph three passes cleanly. The most likely failure mode is a wire calibrated to avoid that false-positive flood, at which point its threshold is loose enough that it never fires on anything, and it becomes a check that is always green and therefore never read. Semantic staleness — does this document still describe reality — is the thing worth detecting, and it is not derivable from filesystem metadata or git dates at all. For this objection not to hold, staleness would have to be assessed against content rather than age, which is a materially different and more expensive piece of work than the trip-wire framing implies.
- Objection answered: no

### 8. A grounding-health lane surfaces per-package upstream coverage, substrate freshness, and grounding provenance in one view, and contributes a gate to Holiday Confidence — score: 1.50

- Persona: The tech lead who owns the substrate's condition and currently has no single place that says whether it is healthy.
- Complexity: medium
- Impact / Confidence / Effort: L/H/M — base score 1.50
- Strategy alignment: +0.5 track:`Upstream grounding` — recorded for transparency, **not applied** (nearest base score is 2.00, |Δ| = 0.50 > 0.05) — final score 1.50
- Strongest objection: This is a presentation layer over data that does not exist yet, and building it early is how the underlying gap gets papered over. Every input it needs — per-package coverage, freshness, provenance — is the output of another candidate on this list, so shipping the lane first yields a view populated by whatever partial signals happen to be available, which is precisely the condition under which a dashboard misleads most. The likely failure mode is a lane that shows green because its inputs are thin rather than because the substrate is sound, and then gets promoted into a Holiday Confidence gate, where a soft measurement acquires hard authority over whether a window counts as safe to leave unwatched. Adding it to that KPI is the specific harm: Holiday Confidence derives its meaning from every input being an authority, and a coverage heuristic is not one. For this objection not to hold, the provenance and freshness signals would have to be real and validated first, which makes this strictly downstream work rather than a parallel track.
- Objection answered: no

### 9. A merge-time hook incrementally re-ingests changed source into the knowledge graph on every merge, so the substrate stays continuously fresh instead of being rebuilt on a manual or periodic cadence — score: 1.33

- Persona: The team whose graph is authoritative-looking and hours-to-days behind main, so every agent grounding on it grounds on a past version of the repo.
- Complexity: high
- Impact / Confidence / Effort: M/M/H — base score 1.33
- Strategy alignment: +0.5 track:`Upstream grounding` — recorded for transparency, **not applied** (nearest base score is 1.50, |Δ| = 0.17 > 0.05) — final score 1.33
- Strongest objection: Merge-time is the single most contended point in this repository's workflow, and adding graph ingestion to it puts a slow, stateful, conflict-prone write on the path where the cost of being wrong is highest. This codebase has already paid repeatedly for artifacts that regenerate near merge — shard conflicts that required a dedicated merge driver and a single-writer ADR to stop, and a fail-closed pre-commit gate that blocks all commits when a baseline is red. An incremental ingest hook re-creates that class of problem with a heavier payload and a database behind it, and under concurrent merges the incremental path is exactly where correctness is hardest to guarantee: an ingest that races or partially applies leaves a graph that is fresh-looking and internally inconsistent, which is worse for grounding than one that is honestly a day old. For this objection not to hold, the ingest would have to be genuinely idempotent, order-independent, and cheap enough to never become the reason a merge is slow — and the repo's own history with merge-time regeneration argues that bar is rarely cleared on the first attempt.
- Objection answered: no

### 10. A compiler turns documented principles and ADR constraints into machine-checkable enforcement (ESLint rules, validators) semi-automatically, so an upstream decision fires in real time rather than waiting to be read — score: 1.00

- Persona: The tech lead who has written the architectural rule down three times and still watches agents violate it, because prose in `docs/knowledge/` has no runtime.
- Complexity: high
- Impact / Confidence / Effort: H/L/H — base score 1.00
- Strategy alignment: +0.5 track:`Upstream grounding` +0.25 Our approach ("encoding architectural decisions, process discipline, and strategic intent as machine-checkable constraints") = +0.75 — recorded for transparency, **not applied** (nearest base score is 1.33, |Δ| = 0.33 > 0.05) — final score 1.00
- Strongest objection: The decisions worth enforcing are the ones least amenable to extraction, and this inverts the direction the existing tooling works in. `packages/linter-gen` generates rules from a specification someone wrote _as_ a specification; the input here is 136 ADRs of discursive English whose load-bearing content is context, trade-off, and the reasoning for a choice — the enforceable predicate, where one exists at all, is usually a single clause buried in prose that also contains three alternatives that were rejected. The most likely failure mode is a compiler with a very low yield that produces plausible rules from the syntactically simplest ADRs, which are also the ones whose constraints are already enforced or trivially obvious, while every genuinely valuable decision requires a human to formalize it anyway. And a mis-extracted constraint is not a neutral miss: a generated ESLint rule that enforces a rejected alternative teaches agents the opposite of the decision, in real time, with the authority of a mechanical check. For this objection not to hold, ADRs would need to carry an explicit machine-readable constraint clause authored at decision time, which makes the leverage sit in the ADR template rather than in a compiler over the existing corpus.
- Objection answered: no

## Ranking notes

- Base scores use the `low|medium|high → 1|2|3` mapping on all three axes.
- The alignment bonus was applied inside two tie windows: candidates 1 and 2 (base 6.00, |Δ| = 0.00) and candidates 3, 4, 5, and 6 (base 3.00, |Δ| = 0.00). In the second window the bonus did real work — candidate 6 carries a track-only +0.5 and so ranks below the three carrying +0.75.
- Candidates 7 through 10 have their bonus recorded but not applied; each is separated from its nearest neighbour by more than 0.05, so the base score determines the order.
- Ties after the bonus (candidates 1 and 2 at 6.75; candidates 3, 4, and 5 at 3.75) are broken stably by generation order.
- No objection was answered on this run, by design. Objections do not enter the ranking under any circumstance; the order above is `(impact × confidence) ÷ effort` plus the bounded tiebreaker and nothing else.
