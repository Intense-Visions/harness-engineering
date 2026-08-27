---
topic: 'Full-lifecycle reach: role-shaped front doors for the two non-engineer edges — authoring intent upstream of the spec, and adjudicating outcomes (UAT, sign-off, production signals feeding the graph) downstream'
generated_at: '2026-08-13T12:00:00Z'
strategy_grounded: true
strategy_path: STRATEGY.md
count_requested: 10
count_generated: 10
ranking_formula: '(impact × confidence) ÷ effort; strategy-alignment tiebreaker (max +0.75) applied only when |Δbase_score| ≤ 0.05'
---

# Ideation: Full-lifecycle reach — role-shaped front doors for the two non-engineer edges

## Inputs

- Topic: Full-lifecycle reach: role-shaped front doors for the two non-engineer edges — authoring intent upstream of the spec, and adjudicating outcomes (UAT, sign-off, production signals feeding the graph) downstream
- Generated: 2026-08-13T12:00:00Z
- Strategy grounding: enabled — STRATEGY.md present and valid; matching track "Full-lifecycle reach"
- Objection policy: none — each candidate's single strongest objection is surfaced as a standing, accepted downside and is NOT rebutted

## Scoring method

- `low | medium | high → 1 | 2 | 3`. `base_score = (impact × confidence) ÷ effort`, displayed to 2 decimals.
- Candidates sorted by base score descending (order is monotonically non-increasing in base score).
- Strategy-alignment bonus (max +0.75): `+0.5` if the premise plausibly advances the "Full-lifecycle reach" Tracks bullet, `+0.25` if premise/persona references the Target problem or Our approach. The bonus is applied to the final score ONLY within an exact base-score tie (|Δbase| ≤ 0.05); it never reorders across differing base scores. The bonus is recorded for every candidate for transparency.

## Ranked candidates

### 1. Auto-derive a plain-language UAT checklist from the spec's acceptance section — score: 9.00

- Premise: A skill transforms a spec's resolved acceptance criteria into an ordered, plain-language pass/fail checklist a non-engineer can walk without reading the spec or touching the CLI.
- Persona: The client-side product owner or QA reviewer who signs off on delivered work but has never opened a `proposal.md`.
- Complexity: low
- Key risk: Acceptance criteria that are vague or implementation-shaped translate into a checklist the reviewer cannot actually judge.
- Impact / Confidence / Effort: H/H/L — base score 9.00
- Strategy alignment: +0.5 track:Full-lifecycle reach (recorded; not applied — no base tie) — final score 9.00
- Strongest objection (standing, accepted downside): The value of the checklist is entirely inherited from acceptance-criteria quality, which acceptance-eval already flags as frequently NOT_MEASURABLE. When the upstream section is a list of implementation tasks rather than observable behaviors, the generated checklist inherits that defect verbatim and hands the reviewer un-adjudicable items ("verify the reducer is pure"), giving false confidence that a human edge was covered when it was mechanically decorated. The most likely failure mode is a green checklist over a spec whose behaviors were never observably specified — the exact gap this edge was meant to close.

### 2. Post-ship stakeholder outcome digest: delivered-vs-requested in plain language — score: 6.00

- Premise: After a change ships, a skill emits a plain-language digest mapping each originally-requested outcome to what was actually delivered, for the non-engineer who authored the intent.
- Persona: The requirements author (client sponsor / PM) who described the need upstream and wants to know, without reading a diff, whether they got it.
- Complexity: low
- Key risk: Without durable links from delivered work back to original intent, the mapping is reconstructed heuristically and can quietly misattribute.
- Impact / Confidence / Effort: M/H/L — base score 6.00
- Strategy alignment: +0.5 track:Full-lifecycle reach (recorded; not applied — no base tie) — final score 6.00
- Strongest objection (standing, accepted downside): The digest is only as honest as the intent-to-delivery linkage beneath it, and today that linkage does not durably exist (candidate #5 is the thing that would create it). Absent real traceability edges, the digest is an LLM re-derivation of "what you asked for" from whatever text it can reach, which reads as authoritative to a non-technical sponsor precisely because it is fluent — a confidently-worded mapping that can silently drop a dropped requirement or claim coverage for a partially-met one. The failure mode is a polished report that manufactures closure the pipeline did not actually earn.

### 3. Product-requirements middle skill: BRD → structured, traceable requirements — score: 4.50

- Premise: A skill converts an approved BRD into a set of structured, individually-addressable requirement records that specs downstream link to, filling the "product-requirements middle" gap named in the strategy between product-advisor and brainstorming.
- Persona: The solution architect translating a signed-off BRD into something the spec author can build against without re-litigating scope.
- Complexity: medium
- Key risk: It can become a redundant artifact layer between the BRD and the spec that authors skip, adding ceremony without grounding.
- Impact / Confidence / Effort: H/H/M — base score 4.50
- Strategy alignment: +0.5 track:Full-lifecycle reach, +0.25 references Our approach (durable grounding / encoding intent as constraint) = +0.75 (recorded; not applied — no base tie) — final score 4.50
- Strongest objection (standing, accepted downside): This inserts a mandatory artifact between two artifacts that teams already treat as one hop (BRD → spec), and every intermediate artifact must earn its keep or it becomes drift-generating ceremony. If the requirement records are not mechanically enforced as the only path from BRD to spec, authors route around them and the records rot immediately — an unenforced convention, which the strategy explicitly diagnoses as the failure it exists to fix. The likely failure mode is a well-intentioned middle layer that is authored once, never maintained, and diverges from both the BRD above it and the specs below it.

### 4. Recorded human UAT sign-off wired as a ship gate — score: 3.00

- Premise: A human's recorded UAT adjudication becomes a blocking ship gate in the pipeline (structurally like outcome-eval), so a change cannot ship without a durable, attributable sign-off from the outcome edge.
- Persona: The accountable non-engineer approver whose sign-off is currently a Slack "lgtm" with no artifact and no gate.
- Complexity: medium
- Key risk: A blocking human gate stalls the autonomy the harness is trying to maximize, and can be rubber-stamped to unblock.
- Impact / Confidence / Effort: H/M/M — base score 3.00
- Strategy alignment: +0.5 track:Full-lifecycle reach, +0.25 references Our approach (gate as machine-checkable constraint) = +0.75 (applied within base tie with #5) — final score 3.75
- Strongest objection (standing, accepted downside): A mandatory human sign-off gate is in direct tension with the Agent-Autonomy and Holiday-Confidence KPIs — the whole thesis is that the senior can disappear for two weeks, and a blocking human edge reintroduces exactly the human-in-the-loop bottleneck the harness sells against. Worse, a gate that blocks is a gate that gets rubber-stamped under delivery pressure, so it degrades into an attestation with the ceremony of a control but none of the assurance. The failure mode is either a pipeline that stalls waiting on a human who has left, or a sign-off click that means nothing.

### 5. Requirement→spec→outcome traceability edges in the knowledge graph — score: 3.00

- Premise: Client requirements are persisted as first-class knowledge-graph nodes with durable edges to the specs that implement them and the execution-outcome nodes that adjudicate them, closing the intent-to-outcome loop as queryable substrate.
- Persona: The tech lead who needs to answer "which delivered outcome satisfies which original client requirement?" without archaeology across BRDs, specs, and PRs.
- Complexity: medium
- Key risk: The edges are only trustworthy if authored/maintained at every hop; a single un-linked hop makes the whole chain unreliable and quietly worse than no chain.
- Impact / Confidence / Effort: M/H/M — base score 3.00
- Strategy alignment: +0.5 track:Full-lifecycle reach, +0.25 references Our approach (durable grounding in the knowledge graph) = +0.75 (applied within base tie with #4) — final score 3.75
- Strongest objection (standing, accepted downside): Traceability graphs are notorious for being 90% complete and therefore untrustworthy — the value is in completeness, but the maintenance burden falls exactly on the hops (client intent → requirement node) where no engineer has a natural incentive to link. A partially-linked graph is arguably worse than none, because it invites confident queries ("nothing traces to requirement R, so it must be unbuilt") that are false whenever the gap is a missing edge rather than missing work. The failure mode is silent under-linkage that makes the graph an authoritative-looking source of wrong answers.

### 6. Client-intake dashboard lane: guided web interview → BRD draft — score: 2.00

- Premise: A non-CLI dashboard lane runs a guided requirements interview for a client and produces a BRD draft that feeds product-advisor, making the upstream intent edge reachable by someone who will never touch a terminal.
- Persona: The prospective client or business sponsor describing what they need, who would abandon the pipeline the moment a CLI is required.
- Complexity: high
- Key risk: A web front door is a large surface (auth, hosting, session state, UX) whose cost may dwarf the underlying skill it fronts.
- Impact / Confidence / Effort: H/M/H — base score 2.00
- Strategy alignment: +0.5 track:Full-lifecycle reach, +0.25 references Who-it's-for/approach (role-shaped front door for non-engineers) = +0.75 (applied within base tie with #7 and #8) — final score 2.75
- Strongest objection (standing, accepted downside): Building and operating a hosted, authenticated web lane is a categorically different and larger commitment than shipping a skill — it drags in session persistence, access control, hosting, and an ongoing UX surface — and that cost is incurred before there is any evidence a client will complete a guided interview rather than just booking a call. The likely failure mode is a heavy, perpetually-maintained web property that fronts a thin skill, inverting the harness's own bet that leverage comes from constraints-as-code, not from building yet another CRUD dashboard.

### 7. UAT sign-off dashboard lane: non-engineer web adjudication front door — score: 2.00

- Premise: A dashboard lane presents the plain-language acceptance checklist to a non-engineer reviewer in the browser, captures per-item pass/fail with evidence, and emits the durable sign-off artifact — the downstream twin of the intake lane.
- Persona: The client-side approver adjudicating whether delivered work meets the agreed outcome, from a browser, without CLI or repo access.
- Complexity: high
- Key risk: Same web-surface cost as the intake lane, plus it presumes the checklist (#1) and the sign-off artifact (#4) already exist and are trustworthy.
- Impact / Confidence / Effort: H/M/H — base score 2.00
- Strategy alignment: +0.5 track:Full-lifecycle reach, +0.25 references Who-it's-for/approach (role-shaped front door for non-engineers) = +0.75 (applied within base tie with #6 and #8) — final score 2.75
- Strongest objection (standing, accepted downside): This lane sits at the top of a dependency stack — it is only meaningful if the plain-language checklist (#1) is trustworthy and the sign-off artifact/gate (#4) exists, so building it first means building a UI over a hollow core. It carries the same hosting/auth/UX operating cost as the intake lane while adding a reviewer-access problem (giving a client scoped visibility into a specific change's outcome without exposing the repo). The failure mode is an expensive web surface that ships ahead of the substrate it needs, producing sign-offs that look rigorous but rest on un-adjudicable checklist items.

### 8. Edge-actor routing: surface "your input is needed" to the right non-engineer — score: 2.00

- Premise: A routing mechanism detects when the pipeline is blocked on a human edge (a requirements gap upstream or a pending sign-off downstream) and surfaces a visible, actionable ask to the specific non-engineer responsible, over a real channel rather than an invisible interaction record.
- Persona: The busy non-engineer stakeholder who is the bottleneck but never sees the ask because it lives in a log they don't read.
- Complexity: medium
- Key risk: Ask-fatigue — a routing layer that notifies too eagerly gets muted, and a muted channel is indistinguishable from no channel.
- Impact / Confidence / Effort: M/M/M — base score 2.00
- Strategy alignment: +0.5 track:Full-lifecycle reach (recorded; +0.25 not credited — premise is plumbing, not intent-encoding) = +0.50 (applied within base tie with #6 and #7) — final score 2.50
- Strongest objection (standing, accepted downside): Notification routing is deceptively simple to build and genuinely hard to make land — the harness's own history (emit_interaction asks that record but never surface) shows the failure is not delivery mechanics but attention economics, and adding another channel that non-engineers can mute solves nothing. If the ask over-fires it gets filtered to a folder no one opens; if it under-fires the edge stays blocked silently. The failure mode is a routing layer that technically works and behaviorally changes nothing because the human edge was never a delivery problem.

### 9. Intent change-request loop: propagate client requirement changes to affected specs/tasks — score: 1.33

- Premise: When a client revises a requirement mid-flight, a guided flow computes the blast radius over the downstream specs, plans, and open tasks and presents the affected set for re-adjudication, treating intent itself as a change with impact analysis.
- Persona: The delivery lead absorbing a scope change from the client and needing to know, before committing, what downstream work it invalidates.
- Complexity: high
- Key risk: Blast radius over intent requires the traceability edges (#5) to already exist and be complete; without them the propagation is guesswork.
- Impact / Confidence / Effort: M/M/H — base score 1.33
- Strategy alignment: +0.5 track:Full-lifecycle reach (recorded; not applied — no base tie) — final score 1.33
- Strongest objection (standing, accepted downside): This is the most downstream-dependent idea in the set — meaningful blast-radius-over-intent presupposes the requirement→spec→outcome graph (#5) is not just present but complete, and impact analysis over an incomplete graph produces exactly the confident-but-wrong answers that make traceability dangerous. Building it before that substrate is trustworthy yields a change-propagation flow that misses affected work (giving false "safe to change" signals) or floods the lead with spurious impacts. The failure mode is a scope-change tool that erodes trust the first time it says a change is contained when it wasn't.

### 10. Production-signal ingestion: feed post-ship operational signals back into the graph — score: 1.00

- Premise: Post-ship production signals (error rates, usage, incidents) are ingested as feedback nodes attached to the shipped change, extending the outcome edge past sign-off into live operation so the graph learns whether delivered work actually held up in production.
- Persona: The operator/tech lead who owns the thing after it ships and wants production reality to feed back into the pipeline that produced it, not die in a separate observability tool.
- Complexity: high
- Key risk: Production telemetry lives in heterogeneous external systems, and attributing a production signal to a specific shipped change is a hard, noisy correlation problem.
- Impact / Confidence / Effort: H/L/H — base score 1.00
- Strategy alignment: +0.5 track:Full-lifecycle reach, +0.25 references Our approach (compounding feedback into the graph) = +0.75 (recorded; not applied — no base tie) — final score 1.00
- Strongest objection (standing, accepted downside): Attributing production signals to the change that caused them is an unsolved correlation problem even for dedicated observability platforms, and doing it from inside a build-loop harness means either integrating a sprawl of external monitoring systems or ingesting signals too coarse to attribute — both of which land low-confidence. The most likely failure mode is a feedback stream that is either empty (no integrations wired) or noisy (signals that can't be tied to a specific ship), meaning the loop it promises to close stays open while carrying the operational cost of pretending it's closed.

## Handoff

- Ideation artifact written: docs/ideation/full-lifecycle-reach-role-shap-2026-08-13.md
- Top pick: Auto-derive a plain-language UAT checklist from the spec's acceptance section — score 9.00
- Next: invoke /harness:brainstorming "UAT Checklist Generator" to take a candidate into a spec, OR /harness:roadmap to enqueue picks for later.
