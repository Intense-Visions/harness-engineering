---
topic: Extend the harness reliably to the two edges where non-engineers meet the pipeline — authoring intent upstream of the spec, and adjudicating outcomes after ship — through role-shaped front doors rather than the CLI.
generated_at: '2026-09-06T16:45:36Z'
strategy_grounded: true
strategy_path: STRATEGY.md
count_requested: 10
count_generated: 10
ranking_formula: '(impact × confidence) ÷ effort; strategy-alignment tiebreaker (max +0.75) applied only when |Δbase_score| ≤ 0.05'
---

# Ideation: Extend the harness reliably to the two edges where non-engineers meet the pipeline

## Inputs

- Topic: Extend the harness reliably to the two edges where non-engineers meet the pipeline — authoring intent upstream of the spec, and adjudicating outcomes after ship — through role-shaped front doors rather than the CLI.
- Generated: 2026-09-06T16:45:36Z
- Count requested: 10
- Strategy grounding: enabled — `STRATEGY.md` present and valid (v2, `last_updated: 2026-07-01`); matching Tracks bullet **Full-lifecycle reach**.
- Objection policy: **none** — every candidate's single strongest objection is recorded as a standing, accepted downside. No objection was rebutted. Rebuttals are the user's judgment to enter; none were supplied, and the agent never authors one.

## Grounding notes — what already exists at the two edges

The track's grounding sources are **stale**, and this materially changes what counts as additive. Verified against the worktree at `e530ae6bc`:

| Claim in `STRATEGY.md` / `sdlc-coverage-and-agentic-trajectory.md` | Verified reality                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "gaps at the product-requirements middle"                          | **Shipped.** `agents/skills/claude-code/product-requirements/` exists; authors `docs/product-requirements/<item>/prd.md`.                                                                                                                        |
| "UAT / sign-off ... `—` ... gap" (coverage table)                  | **Shipped.** `agents/skills/claude-code/uat-signoff/` exists; writes `docs/changes/<slug>/signoff.md` + one `execution_outcome` node via `uat_signoff` / `UatSignoffRecorder`.                                                                   |
| Recommendation 3, "Role-shaped dashboard front doors (next)"       | **Substantially shipped.** `packages/dashboard/src/shared/roles.ts` defines `dev` / `pm-ba` / `client` lanes; `Signoff.tsx` + `routes/signoff.ts`, `Traceability.tsx` + `routes/traceability.ts`, and an `AuthorIntentForm` on the Roadmap page. |
| product-advisor as "first wedge"                                   | Shipped; writes `docs/inception/<engagement>/brd.md`.                                                                                                                                                                                            |

Three further facts that shaped generation, and that no document currently records:

1. **Adoption at both edges is zero.** `docs/inception/` and `docs/product-requirements/` do not exist. `find docs/changes -name signoff.md` returns nothing across **404** change directories (357 of which carry a `proposal.md`). The edge skills are shipped and unused.
2. **The shipped edge skills are undiscoverable from the dashboard.** `packages/dashboard/src/client/constants/skills.ts` registers 30 skills; `product-advisor`, `product-requirements`, and `uat-signoff` are **not among them** (`harness:strategy` is the only entry in that neighbourhood).
3. **Traceability is spec-rooted, not intent-rooted.** `gather/traceability.ts` → `queryTraceability` runs requirement → code → tests, keyed on `specPath`. It has no BRD/PRD upstream edge and no sign-off downstream edge, so the `client` lane cannot answer "what happened to what I asked for."

Consequently the prior artifact for this track (`full-lifecycle-reach-role-shap-2026-08-13.md`) has been overtaken: its candidates **1** (UAT checklist from acceptance criteria), **3** (product-requirements middle), **6** (client-intake lane) and **7** (UAT sign-off lane) are now shipped. None are re-proposed here. The generative frame for this run is therefore **not "build the edge skills" but "the edges are built, unwired, undiscoverable, and unused."**

## Scoring method

- `low | medium | high → 1 | 2 | 3`. `base_score = (impact × confidence) ÷ effort`, to 2 decimals. Range `[0.33, 9.00]`.
- Candidates sorted by `base_score` descending; order is monotonically non-increasing in final score.
- Strategy-alignment bonus (max **+0.75**): `+0.5` when the premise plausibly advances the **Full-lifecycle reach** Tracks bullet, `+0.25` when premise/persona references the **Target problem** or **Our approach** sections. The bonus is **applied** only within an adjacent-pair tie window of `|Δbase_score| ≤ 0.05`; outside it the bonus is recorded for transparency and does not reorder. Citations are verbatim where a bonus was earned.

## Ranked candidates

### 1. Register `product-advisor`, `product-requirements`, and `uat-signoff` in the dashboard skill registry and place them in the lanes that need them — score: 6.50

- Premise: The three shipped edge skills are added to `SKILL_REGISTRY` in `packages/dashboard/src/client/constants/skills.ts` and surfaced in the `pm-ba` and `client` lanes, so the non-engineer front door names the skills that serve it.
- Persona: A PM/BA sitting in the dashboard's `pm-ba` lane who has never been shown that a PRD interview exists.
- Complexity: low
- Impact / Confidence / Effort: M/H/L — base score **6.00**
- Strategy alignment: `+0.5` — track **Full-lifecycle reach**: _"reach those edges through role-shaped front doors (guided interviews, dashboard lanes) rather than the CLI"_. Bonus **applied** (tied with candidate 2 at base 6.00, |Δ| = 0.00 ≤ 0.05) — final score **6.50**
- Key risk: A registry entry names a slash command but does not run it.
- Strongest objection: This treats a discovery problem as the cause of zero adoption when the binding constraint may be capability. Every entry in `SKILL_REGISTRY` resolves to a `slashCommand`, which presupposes the viewer has an agent client attached; a genuinely non-technical PM/BA reading the `pm-ba` lane in a browser gains the knowledge that `/harness:product-requirements` exists and no way to invoke it. Most likely failure mode: the three entries ship, the lanes look more complete, and `docs/product-requirements/` is still empty three months later — with the added harm that the roadmap now records the edge as "wired" and the real blocker gets one more layer of paint over it. For this objection not to hold, the population actually sitting in the `pm-ba` lane would have to be operators who already have a CLI and simply did not know the skills existed — which would make the lane a presentation preference for engineers rather than the non-engineer front door the track describes.
- Objection answered: no — standing, accepted downside.

### 2. Instrument and report edge adoption, so "shipped" and "used" stop being the same word — score: 6.50

- Premise: Counters for BRDs authored, PRDs authored, and sign-offs recorded (against changes eligible for each) are gathered and surfaced on the existing Adoption surface, making zero-usage at the two edges a visible number rather than something a human discovers by scanning the filesystem.
- Persona: The tech lead or maintainer deciding where the next unit of leverage goes on the Full-lifecycle reach track.
- Complexity: low
- Impact / Confidence / Effort: M/H/L — base score **6.00**
- Strategy alignment: `+0.5` — track **Full-lifecycle reach**: _"completing the two human edges is what lets non-technical people drive real lifecycle work"_. Bonus **applied** (tied with candidate 1 at base 6.00, |Δ| = 0.00 ≤ 0.05) — final score **6.50**
- Key risk: Measuring the gap does not close it.
- Strongest objection: This is instrumentation, not capability — it buys a number, and the number is already known to be zero. The work competes for the same slot as things that would actually move that number, and the counter's most probable career is to sit at 0 / 0 / 0 on a panel nobody with the authority to act on it opens. Most likely failure mode: the metric ships, confirms what a five-minute `find` established, and the team's response is to distrust the metric ("that can't be right, we shipped those skills") rather than the adoption. For this objection not to hold, the value would have to lie in the ongoing signal rather than the current reading — that is, an edge-usage number that regresses silently later is a class of drift worth a permanent detector, which is a real argument but is not the argument for building it now.
- Objection answered: no — standing, accepted downside.

### 3. Derive a sign-off invitation queue that tells the right non-engineer a change is waiting on them — score: 5.25

- Premise: A queue is derived from changes that shipped with a `proposal.md` and carry no `signoff.md`, and is surfaced in the `client` and `pm-ba` lanes as "awaiting your acceptance," turning the sign-off door from a page someone must think to visit into an inbox that arrives.
- Persona: The product owner or engagement sponsor who holds acceptance authority and has never once been told a change was ready for it.
- Complexity: medium
- Impact / Confidence / Effort: H/H/M — base score **4.50**
- Strategy alignment: `+0.5` — track **Full-lifecycle reach**: _"adjudicating outcomes (user acceptance, sign-off, production signals feeding back into the graph)"_; `+0.25` — **Our approach**: _"Humans own the thinking layer (specs, decisions, strategy); the harness mechanically polices everything below it."_ Bonus **applied** (tied with candidate 4 at base 4.50, |Δ| = 0.00 ≤ 0.05) — final score **5.25**
- Key risk: The derivation instantly produces a backlog nobody will ever work.
- Strongest objection: The eligibility rule that makes the queue cheap to build is the rule that makes it useless. "Has a proposal, lacks a sign-off" evaluates to true for something on the order of 357 historical changes in this repository alone, none of which any human will retroactively adjudicate — so the first render is a 350-row wall in which the two changes that genuinely need a decision this week are invisible. Most likely failure mode: the queue ships, is dismissed as noise on first open, and is never opened again, which is strictly worse than the current state because the sign-off door at least carries no false claim of a backlog. For this objection not to hold, there would need to be a durable notion of which changes are _in scope for acceptance at all_ — an engagement boundary, an opt-in marker, or a recency/milestone cutoff — and no such marker exists in `docs/changes/` today, so the real work is defining that boundary, not building the list.
- Objection answered: no — standing, accepted downside.

### 4. Route a non-accepted sign-off item back into work instead of terminating it in a file — score: 5.25

- Premise: When `uat-signoff` records a `REJECT` or `CHANGES_REQUESTED` item, the disposition and its note are routed into the harness's existing intake (a roadmap row or tracked issue linked to the originating change) rather than coming to rest in `signoff.md` and one graph node.
- Persona: The product owner whose rejection is currently a sentence in a Markdown file, and the tech lead who never receives it.
- Complexity: medium
- Impact / Confidence / Effort: H/H/M — base score **4.50**
- Strategy alignment: `+0.5` — track **Full-lifecycle reach**: _"authoring intent ... and adjudicating outcomes"_; `+0.25` — **Our approach**: _"encoding architectural decisions, process discipline, and strategic intent as machine-checkable constraints."_ Bonus **applied** (tied with candidate 3 at base 4.50, |Δ| = 0.00 ≤ 0.05) — final score **5.25**
- Key risk: Auto-created rework items from free-text notes are unactionable.
- Strongest objection: A human's rejection note is a lead, not a requirement, and promoting it directly into a work item launders it into one. The skill's own worked example records `"CHANGES_REQUESTED — fires on transaction but misses refunds"` — a sentence that names a symptom, no acceptance criterion, no scope, no priority — and the harness's own `product-requirements` Iron Law holds that _"a criterion that cannot be judged is not a criterion."_ Most likely failure mode: the roadmap accumulates rows whose entire body is a one-line complaint, each of which a human must re-interview the signer to make executable, so the automation moves the interview rather than removing it, and the roadmap's signal-to-noise falls. For this objection not to hold, the routing would have to pass through a requirements-shaping step rather than around it — which makes this candidate a composition of sign-off with `product-requirements`, a materially larger piece of work than the premise as stated admits.
- Objection answered: no — standing, accepted downside.

### 5. A mechanical staleness check that fails when a lifecycle-coverage claim contradicts the installed skill set — score: 4.00

- Premise: A check cross-references the `gap` / `partial` rows in `docs/knowledge/skills/sdlc-coverage-and-agentic-trajectory.md` and the "Current:" clause of each `STRATEGY.md` Tracks bullet against the skills actually present under `agents/skills/`, and fails on a contradiction — so an upstream grounding source cannot keep describing shipped work as a gap.
- Persona: Every downstream skill that grounds in `STRATEGY.md` (`ideate`, `brainstorming`, `roadmap-pilot`) and inherits its errors, plus the tech lead reading the track.
- Complexity: low
- Impact / Confidence / Effort: M/M/L — base score **4.00**
- Strategy alignment: `+0.5` — track **Upstream grounding**: _"make the strategic and knowledge substrate ... durable enough that downstream skills ground reliably instead of starting cold each invocation"_; `+0.25` — **Our approach**: _"encoding architectural decisions, process discipline, and strategic intent as machine-checkable constraints."_ Bonus **recorded but NOT applied** — nearest neighbours are 4.50 (|Δ| = 0.50) and 3.75 (|Δ| = 0.25), both outside the 0.05 tie window — final score **4.00**
- Key risk: Name-matching a skill directory to a prose stage label is a shallow proxy for coverage.
- Strongest objection: The check would trade a false negative for a false positive. Its only available evidence is that a directory named `uat-signoff` exists, so it would flip the UAT row from `gap` to covered — while this very run established that zero sign-offs have ever been recorded across 404 changes. The coverage table's own header states that status reflects **enforcement, not mere presence**, which is exactly the distinction a filesystem check cannot make; the check would therefore assert the one thing the document explicitly refuses to assert. Most likely failure mode: the table drifts to "solid" across the board, the track reads as complete, and the genuine gap — nothing routes a human to any of it — becomes harder to see than it was when the document was merely out of date. For this objection not to hold, the check would need a usage or enforcement oracle (artifacts written, gates wired, nodes recorded) rather than a directory listing, which is a substantially different and larger build.
- Objection answered: no — standing, accepted downside.

### 6. Turn the author-intent form from a roadmap-row append into a PRD-seeding intake — score: 3.75

- Premise: `AuthorIntentForm` currently writes a title and description straight to a roadmap row via `POST /api/roadmap/append`; it instead captures the minimum PRD seed (user, need, rationale, one success statement), writes `docs/product-requirements/<item>/prd.md`, and links the row to it — so the browser intent door lands in the artifact `harness-brainstorming` consumes.
- Persona: A PM/BA authoring intent in the `pm-ba` lane with no terminal, whose input currently evaporates into a two-field backlog row.
- Complexity: medium
- Impact / Confidence / Effort: H/M/M — base score **3.00**
- Strategy alignment: `+0.5` — track **Full-lifecycle reach**: _"authoring intent (client requirements upstream of the spec)"_; `+0.25` — **Our approach**: _"Humans own the thinking layer."_ Bonus **applied** (tied with candidate 7 at base 3.00, |Δ| = 0.00 ≤ 0.05) — final score **3.75**
- Key risk: A form-authored PRD skips the interview that makes a PRD worth having.
- Strongest objection: The value of `product-requirements` is not the file it writes but the guided interview and the Iron Law it enforces — _"Every user story carries at least one measurable acceptance criterion, or it ships as an open, named gap — never a silent guess."_ A four-field web form cannot chase a vague success statement, cannot detect an unmeasurable criterion, and cannot surface a named gap; it can only accept what was typed. Most likely failure mode: a stub PRD lands at the canonical path, `harness-brainstorming` seeds the spec's Success Criteria from it, `acceptance-eval` judges those criteria, and an unmeasurable requirement propagates the full length of the chain wearing the file name of the artifact designed to prevent exactly that — a worse outcome than today's honest two-field roadmap row, which at least does not impersonate a PRD. For this objection not to hold, the form would have to be a front end onto the interview rather than a replacement for it, which is candidate 10's problem and carries candidate 10's cost.
- Objection answered: no — standing, accepted downside.

### 7. Make UAT sign-off a declarable, opt-in ship gate per change — score: 3.75

- Premise: A change can declare that its ship path waits on a human `ACCEPTED` from `uat-signoff`, converting the deliberately advisory record into an enforcing gate for the changes that opt in, with the advisory default unchanged for everything else.
- Persona: The solution architect on a client engagement where acceptance is contractual rather than informational.
- Complexity: medium
- Impact / Confidence / Effort: H/M/M — base score **3.00**
- Strategy alignment: `+0.5` — track **Full-lifecycle reach**: _"post-ship enforcement"_; `+0.25` — **Our approach**: _"constraints-as-code outperforms prompts-and-conventions."_ Bonus **applied** (tied with candidate 6 at base 3.00, |Δ| = 0.00 ≤ 0.05) — final score **3.75**
- Key risk: A human-blocking gate converts agent throughput into a queue in front of one person.
- Strongest objection: This inverts the harness's central bet at the one place the bet is load-bearing. Every other blocking gate in the pipeline (`outcome-eval`, `acceptance-eval`, the architecture and entropy checks) blocks on a _machine-derived_ verdict precisely so that autonomy survives; a gate whose pass condition is one named human's attention makes the pipeline's throughput equal to that person's response latency, and agents produce changes far faster than a sponsor adjudicates them. Most likely failure mode: the Agent Autonomy and Holiday Confidence KPIs both fall while the gate behaves exactly as specified, and the team's remedy is to stop opting in — leaving the feature built, correct, and switched off. The `uat-signoff` skill states its non-gate status four separate times ("NOT a gate", "advisory", "blocks nothing", "it does not block a merge, a ship, or a pipeline step"), and the dashboard route repeats it; that is a decision already taken deliberately, so this candidate is a reversal and owes an ADR rather than an implementation. For this objection not to hold, the blocking population would have to be small, bounded, and contractually forced — which is plausible for client engagements and not plausible for internal work, meaning the gate's honest scope is much narrower than "per change."
- Objection answered: no — standing, accepted downside.

### 8. Extend traceability from spec-rooted to intent-rooted, so the client lane traces requested → shipped → accepted — score: 2.00

- Premise: `queryTraceability` and the Traceability page gain a BRD/PRD upstream edge and a sign-off downstream edge, so the chain a stakeholder sees runs from the requirement they authored to the outcome they accepted rather than from a spec they never read to a test file.
- Persona: The `client`-lane stakeholder or sponsor whose only question is "what happened to what I asked for."
- Complexity: high
- Impact / Confidence / Effort: H/M/H — base score **2.00**
- Strategy alignment: `+0.5` — track **Full-lifecycle reach**: _"reach those edges through role-shaped front doors."_ Bonus **recorded but NOT applied** — nearest neighbours are 3.75 (|Δ| = 1.75) and 1.75 (|Δ| = 0.25), both outside the 0.05 tie window — final score **2.00**
- Key risk: The new edges have nothing to connect.
- Strongest objection: This builds a graph traversal across a graph whose endpoints do not exist. There are zero BRDs (`docs/inception/` absent), zero PRDs (`docs/product-requirements/` absent), and zero sign-offs (no `signoff.md` in 404 change directories) — so both the upstream and the downstream edge would be provably correct and universally empty, and the Traceability page would render every requirement as intent-orphaned and outcome-orphaned. Most likely failure mode: the feature is verified against synthetic fixtures, ships green, and on real data displays a column of dashes that reads to a client as "nothing was traced" rather than "nothing was authored" — actively damaging the credibility of the one surface built to establish it. For this objection not to hold, the artifacts at both ends would have to exist first, which makes every intent-authoring and sign-off-adoption candidate above a hard prerequisite rather than a parallel option; sequenced correctly this is valuable, and sequenced now it is a traversal over an empty set.
- Objection answered: no — standing, accepted downside.

### 9. Ingest post-ship production signals into the graph as outcome evidence — score: 1.75

- Premise: Operational signals from a shipped change (error rate, incident linkage, rollback occurrence) are pulled back into the knowledge graph alongside the existing `execution_outcome` nodes, closing the one half of the outcome edge that neither `uat-signoff` nor the advisory `deployment` skill nor the propose-only `rollback` skill covers.
- Persona: The tech lead from the **Who it's for** primary persona who owns what happens to a change after it merges, not just whether it merged.
- Complexity: high
- Impact / Confidence / Effort: H/L/H — base score **1.00**
- Strategy alignment: `+0.5` — track **Full-lifecycle reach**: _"production signals feeding back into the graph"_; `+0.25` — **Our approach**: _"durable grounding in a knowledge graph and STRATEGY.md."_ Bonus **applied** (tied with candidate 10 at base 1.00, |Δ| = 0.00 ≤ 0.05) — final score **1.75**
- Key risk: Production signal sources are per-adopter and unstandardized.
- Strongest objection: Every other input the harness consumes is in the repository — specs, code, tests, git history, the graph — which is exactly why the constraints-as-code thesis ports to any adopter unchanged. Production signals are the first input that lives outside it, in a different system per adopter (Datadog, Sentry, CloudWatch, Grafana, an internal bus), each with its own auth, schema, and rate limits. Most likely failure mode: the ingest ships with one connector, works for the repository that built it, and every subsequent adopter needs a connector the harness now has to own and version — converting a self-contained substrate into an integration surface and pulling directly against the **Multi-client portability** track's goal of keeping the harness usable "without forking the substrate." For this objection not to hold, the ingest would have to define a narrow, source-agnostic signal contract that adopters push into rather than a set of connectors the harness pulls from — a defensible design that the premise as stated does not commit to, and one whose adoption depends entirely on adopters bothering to wire it.
- Objection answered: no — standing, accepted downside.

### 10. A browser-native runner so the guided interviews execute in the dashboard rather than requiring an agent CLI — score: 1.50

- Premise: The dashboard gains a runner that executes the guided-interview skills (`product-advisor`, `product-requirements`, `uat-signoff`) turn by turn in the browser against their real `SKILL.md` phases, removing the agent-client prerequisite from the two edges entirely.
- Persona: The genuinely non-technical PM/BA or client sponsor who has a browser, no terminal, and no Claude Code installation.
- Complexity: high
- Impact / Confidence / Effort: H/L/H — base score **1.00**
- Strategy alignment: `+0.5` — track **Full-lifecycle reach**: _"reach those edges through role-shaped front doors (guided interviews, dashboard lanes) rather than the CLI."_ Bonus **applied** (tied with candidate 9 at base 1.00, |Δ| = 0.00 ≤ 0.05) — final score **1.50**
- Key risk: It forks each skill into a second implementation that drifts from its `SKILL.md`.
- Strongest objection: The dashboard has already done this once and the seam is visible. `routes/signoff.ts` re-implements `uat-signoff`'s RESOLVE and INTERVIEW phases as a Hono route with its own basis gatherer, its own soft-degrade, and its own Markdown renderer — a second copy of a contract whose canonical statement lives in `SKILL.md`, kept in sync by nothing but care. Generalizing that to three interview skills triples the surface with no mechanism holding the copies together, in a codebase whose own memory records dual-source-of-truth desync (hook profiles, the core barrel allowlist) as a recurring class of silent bug. Most likely failure mode: `SKILL.md` gains a phase or tightens an Iron Law, the browser path does not, and a non-engineer authors a PRD through a runner that quietly enforces last quarter's rules — with the divergence invisible because both paths write to the same canonical file path. For this objection not to hold, the skills' phase contracts would have to become a shared executable definition that both the agent path and the browser path consume, which is a substantially larger architectural commitment than "add a runner" and is the real prerequisite this candidate implies.
- Objection answered: no — standing, accepted downside.

## Ranking summary

| Rank | #   | Candidate                                      | I/C/E | Base | Bonus | Applied   | Final    |
| ---- | --- | ---------------------------------------------- | ----- | ---- | ----- | --------- | -------- |
| 1    | 1   | Register edge skills in the dashboard registry | M/H/L | 6.00 | +0.50 | yes (tie) | **6.50** |
| 2    | 2   | Instrument edge adoption                       | M/H/L | 6.00 | +0.50 | yes (tie) | **6.50** |
| 3    | 3   | Sign-off invitation queue                      | H/H/M | 4.50 | +0.75 | yes (tie) | **5.25** |
| 4    | 4   | Route non-accepted sign-off items into work    | H/H/M | 4.50 | +0.75 | yes (tie) | **5.25** |
| 5    | 5   | Lifecycle-coverage staleness check             | M/M/L | 4.00 | +0.75 | no        | **4.00** |
| 6    | 6   | Author-intent form → PRD-seeding intake        | H/M/M | 3.00 | +0.75 | yes (tie) | **3.75** |
| 7    | 7   | Opt-in UAT ship gate                           | H/M/M | 3.00 | +0.75 | yes (tie) | **3.75** |
| 8    | 8   | Intent-rooted traceability                     | H/M/H | 2.00 | +0.50 | no        | **2.00** |
| 9    | 9   | Production-signal ingestion                    | H/L/H | 1.00 | +0.75 | yes (tie) | **1.75** |
| 10   | 10  | Browser-native interview runner                | H/L/H | 1.00 | +0.50 | yes (tie) | **1.50** |

Ties at ranks 1–2 and 3–4 were not broken by the alignment bonus (both members earned the same bonus); generation order is preserved, per the stable-sort rule. The bonus did break the 9–10 tie, where candidate 9 earned `+0.75` against candidate 10's `+0.50`.

## Handoff

```
Ideation artifact written: docs/ideation/extend-the-harness-reliably-to-2026-09-06.md
Top pick: Register product-advisor, product-requirements, and uat-signoff in the dashboard skill registry and place them in the lanes that need them — score 6.50
Next: invoke /harness:brainstorming to take a candidate into a spec, OR /harness:roadmap to enqueue picks for later.
```

Two follow-ups fall outside this skill's contract and are recorded, not acted on: `STRATEGY.md`'s **Full-lifecycle reach** bullet and `docs/knowledge/skills/sdlc-coverage-and-agentic-trajectory.md` both describe shipped work as gaps (see Grounding notes). `harness-ideate` reads those sources and never writes them — repair is `/harness:strategy`'s job for the former and a docs change for the latter.
