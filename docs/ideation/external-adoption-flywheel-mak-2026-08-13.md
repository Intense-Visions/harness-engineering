---
topic: 'External adoption flywheel: make the harness valuable enough off-repo that the constraints-as-code thesis gets tested at scale — skill marketplace, constraint-sharing bundles, harness:blueprint codebase courseware, telemetry-driven adoption insights'
generated_at: '2026-08-13T12:00:00Z'
strategy_grounded: true
strategy_path: STRATEGY.md
count_requested: 10
count_generated: 10
ranking_formula: '(impact × confidence) ÷ effort; strategy-alignment tiebreaker (max +0.75) applied only when |Δbase_score| ≤ 0.05'
---

# Ideation: External adoption flywheel

## Inputs

- Topic: External adoption flywheel: make the harness valuable enough off-repo that the constraints-as-code thesis gets tested at scale — skill marketplace, constraint-sharing bundles, harness:blueprint codebase courseware, telemetry-driven adoption insights
- Generated: 2026-08-13T12:00:00Z
- Strategy grounding: enabled — STRATEGY.md present and valid; matching track "External adoption flywheel"
- Objection policy: none — each candidate's single strongest objection stands as an accepted downside (not rebutted)

## Scoring notes

- Mapping: `low|medium|high → 1|2|3`. `base_score = (impact × confidence) ÷ effort`, rounded to 2 decimals.
- Order is by **base score** descending (monotonically non-increasing).
- Strategy-alignment bonus (`+0.5` track match, `+0.25` Target-problem/Our-approach reference; max `+0.75`) is **recorded for every candidate** but **applied to the final score only within an exact base-score tie** (`|Δbase| ≤ 0.05`). It never reorders candidates across different base scores.

## Ranked candidates

### 1. `harness init --template <stack>` ships a working constraint set on first command — score: 6.00

- Premise: Ship `harness init --template <stack>` starter templates (Next.js, FastAPI, Go) that scaffold a working constraint set — layer ESLint rules, entropy detectors, and a STRATEGY.md seed — on the first command, so an external adopter hits a firing constraint within minutes.
- Persona: An individual developer running agents heavily (10+ sessions/week) trying harness for the first time on their own stack.
- Complexity: low
- Impact / Confidence / Effort: M/H/L — base score 6.00
- Strategy alignment: +0.75 (track "External adoption flywheel" +0.5; references Our approach — constraints-as-code from first run +0.25) — recorded, not applied (no base-score tie) — final score 6.00
- Strongest objection: The strongest objection is maintenance surface — each stack template is a second copy of the harness's evolving constraint surface, and the moment core rule schemas or detector configs change, every template silently drifts to a broken or misleading starting state, the worst possible first impression for an evaluator. The most likely failure mode is a new adopter running `init --template next` months after the template was authored, getting config the current CLI rejects, and concluding the harness is brittle. For the objection not to hold, templates would need to be generated from the same source of truth the core ships (not hand-maintained) and covered by CI that fails when a template no longer initializes cleanly.
- Objection answered: no — accepted as a standing downside.

### 2. `harness assess --adopt` — pre-adoption readiness report on an untouched repo — score: 4.50

- Premise: Add `harness assess --adopt` that runs read-only against an untouched external repo and outputs which constraints would fire, an estimated drift-debt figure, and a one-page "what you'd get" summary — before the adopter changes a single file.
- Persona: A tech lead evaluating harness on a real team repo during a time-boxed trial, needing evidence before asking the team to commit.
- Complexity: medium
- Impact / Confidence / Effort: H/H/M — base score 4.50
- Strategy alignment: +0.75 (track "External adoption flywheel" +0.5; references Target problem — surfaces the drift the repo already carries +0.25) — recorded, not applied (no base-score tie) — final score 4.50
- Strongest objection: The strongest objection is that a pre-adoption scan is exactly where false positives are most expensive: the evaluator has no baseline, no context for which findings matter, and one noisy report ("1,400 violations") reads as either alarmist or unactionable, killing the trial at first contact. The likely failure mode is the report surfacing raw absolute counts against an un-baselined repo — which the harness itself normally treats as baseline-relative — so the number is both large and meaningless. For it not to hold, the report would need to lead with a small, curated, high-confidence subset and frame counts as "new drift per PR going forward," not a total indictment of existing code.
- Objection answered: no — accepted as a standing downside.

### 3. Portable constraint-pack export/import (`harness pack export|import`) — score: 3.75

- Premise: Define a versioned, portable "constraint pack" artifact (layer ESLint rules + entropy detector config + STRATEGY.md section seeds) with `harness pack export`/`import`, so a team can lift a proven constraint set from one repo into another.
- Persona: A senior engineer standardizing architecture rules across several repos in the same org.
- Complexity: medium
- Impact / Confidence / Effort: H/M/M — base score 3.00
- Strategy alignment: +0.75 (track "External adoption flywheel" — constraint-sharing bundles, verbatim +0.5; references Our approach — encoding constraints as portable code +0.25) — applied (base-score tie with #4, |Δbase| = 0.00) — final score 3.75
- Strongest objection: The strongest objection is portability-in-name-only: architectural constraints encode a repo's specific layer topology, path aliases, and package layout, so a pack lifted wholesale into a differently-shaped repo either fails to load or, worse, enforces the wrong boundaries silently. The likely failure mode is an import that "succeeds" but pins layer rules to directories that don't exist in the target, producing zero enforcement while displaying green. For it not to hold, packs would need an explicit parameterization/mapping step at import and a validation pass that proves each imported rule actually binds to real code in the target.
- Objection answered: no — accepted as a standing downside.

### 4. Opt-in telemetry-driven adoption insights view — score: 3.75

- Premise: Build an opt-in, DO_NOT_TRACK-respecting telemetry pipeline that reports anonymized skill- and constraint-usage from external projects into an "External Adoption" insights view, so the team can see which parts of the thesis actually get exercised off-repo.
- Persona: The harness maintainer team deciding where to invest, plus a prospective adopter reading a public "what's working" signal.
- Complexity: high
- Impact / Confidence / Effort: H/M/M — base score 3.00
- Strategy alignment: +0.75 (track "External adoption flywheel" — telemetry-driven adoption insights, verbatim +0.5; references Our approach — operationalizes whether the thesis generalizes +0.25) — applied (base-score tie with #3, |Δbase| = 0.00) — final score 3.75
- Strongest objection: The strongest objection is sample bias plus consent friction: privacy-conscious senior engineers (the exact primary persona) are the most likely to leave DO_NOT_TRACK on, so the telemetry over-represents casual users and under-represents the teams whose behavior the thesis most needs to validate. The likely failure mode is confidently steering roadmap toward features the loud, opted-in minority uses while the target segment's needs stay invisible. For it not to hold, the sample would need either a demonstrably representative opt-in rate or a parallel qualitative channel that corrects for the self-selection.
- Objection answered: no — accepted as a standing downside.

### 5. Skill marketplace with `harness skill publish|install` — score: 2.75

- Premise: Stand up a skill marketplace with `harness skill publish` / `harness skill install <name>` so external authors can share and consume harness skills the way plugins are shared today.
- Persona: A tech lead maintaining an internal team skill library who wants to both consume community skills and publish their own.
- Complexity: high
- Impact / Confidence / Effort: H/M/H — base score 2.00
- Strategy alignment: +0.75 (track "External adoption flywheel" — skill marketplace, verbatim +0.5; references Our approach — distributing workflow-rigidity skills +0.25) — applied (base-score tie with #6 and #7, |Δbase| = 0.00) — final score 2.75
- Strongest objection: The strongest objection is that a marketplace for executable skills is a supply-chain risk masquerading as a distribution feature: skills run with real tool access, so an install-by-name flow without provenance, sandboxing, and review is a credential-and-filesystem exposure vector, and adopters burned by npm-style attacks will (correctly) refuse to install unvetted skills. The likely failure mode is either a malicious/low-quality skill damaging an early adopter's repo, or the trust bar being set so high that nobody publishes and the shelves stay empty. For it not to hold, the marketplace needs signed provenance, a review/trust tier, and capability scoping before it opens.
- Objection answered: no — accepted as a standing downside.

### 6. One-command cross-client setup installer (`harness setup`) — score: 2.75

- Premise: Ship a single `harness setup` installer that configures the harness plugin and MCP wiring correctly across all four clients (Claude Code, Cursor, Codex, Gemini CLI) from one command, removing per-client setup as an adoption barrier.
- Persona: An individual developer on a non-Claude client (Cursor/Gemini) who bounces off multi-step manual setup.
- Complexity: medium
- Impact / Confidence / Effort: M/M/M — base score 2.00
- Strategy alignment: +0.75 (tracks "External adoption flywheel" and "Multi-client portability" +0.5; references Our approach — one portable substrate across clients +0.25) — applied (base-score tie with #5 and #7, |Δbase| = 0.00) — final score 2.75
- Strongest objection: The strongest objection is that a one-command cross-client installer concentrates four independently-drifting config surfaces behind a single "it just works" promise, so the weakest-maintained client path becomes the face of the product — and when Gemini or Codex changes its plugin/MCP format, the installer confidently writes a now-invalid config and the adopter's first experience is a broken tool. The likely failure mode is silent misconfiguration on the least-exercised client. For it not to hold, each client path would need its own post-install verification that proves the wiring actually works, not just that files were written.
- Objection answered: no — accepted as a standing downside.

### 7. Shareable Harness-Coverage / Drift-Floor badge and report link — score: 2.75

- Premise: Generate a hosted, shareable summary link (and README badge) of a repo's Harness Coverage and Drift Floor, giving adopters social-proof artifacts to advocate internally.
- Persona: A tech lead who has adopted harness and needs a shareable artifact to make the internal case for team-wide rollout.
- Complexity: low
- Impact / Confidence / Effort: L/M/L — base score 2.00
- Strategy alignment: +0.75 (track "External adoption flywheel" — social proof drives adoption +0.5; references Our approach — surfaces Harness Coverage / Drift Floor metrics +0.25) — applied (base-score tie with #5 and #6, |Δbase| = 0.00) — final score 2.75
- Strongest objection: The strongest objection is that a public badge optimizes for the wrong thing: Harness Coverage as a headline number invites gaming (documenting trivial rules to inflate the ratio) and, as a shareable artifact, does little to convert a skeptical VP who cares about shipped outcomes, not a coverage percentage — while committing the team to operating a hosted report service. The likely failure mode is low advocacy value for real hosting/operations cost. For it not to hold, the badge would need to surface an outcome metric an executive already trusts (agent-autonomy or drift-per-PR trend) rather than an internal coverage ratio.
- Objection answered: no — accepted as a standing downside.

### 8. Telemetry-seeded "projects like yours also enforce X" recommendations — score: 1.50

- Premise: Use anonymized adoption telemetry to power "projects like yours also enforce X" recommendations that nudge mid-adoption teams toward constraints their peers found valuable.
- Persona: A team a few months into harness adoption, unsure which additional constraints are worth enabling next.
- Complexity: medium
- Impact / Confidence / Effort: H/L/M — base score 1.50
- Strategy alignment: +0.75 (track "External adoption flywheel" — telemetry-driven insights +0.5; references Our approach — peer-driven constraint adoption +0.25) — recorded, not applied (no base-score tie) — final score 1.50
- Strongest objection: The strongest objection is the cold-start dependency: peer-based recommendations require a large, representative telemetry corpus that the External Adoption track has not yet produced, so shipping this before the data exists yields generic or misleading nudges that erode trust exactly when a mid-adoption team is deciding whether to deepen investment. The likely failure mode is a recommender that, on a thin/biased sample, confidently suggests constraints ill-suited to the team's stack. For it not to hold, the telemetry pipeline (#4) would need to be live, opted-into at scale, and demonstrably representative first.
- Objection answered: no — accepted as a standing downside.

### 9. `harness blueprint` — knowledge-graph-driven codebase courseware — score: 2.08

- Premise: Build `harness blueprint` that turns the knowledge graph of a codebase into an interactive, guided courseware tour (architecture, key paths, conventions) for someone learning an unfamiliar repo.
- Persona: A new hire or contributor onboarding onto an unfamiliar harness-managed codebase.
- Complexity: high
- Impact / Confidence / Effort: M/M/H — base score 1.33
- Strategy alignment: +0.75 (track "External adoption flywheel" — harness:blueprint codebase courseware, verbatim +0.5; references Our approach — durable grounding in the knowledge graph +0.25) — applied (base-score tie with #10, |Δbase| = 0.00) — final score 2.08
- Strongest objection: The strongest objection is that auto-generated courseware conflates a map with a lesson: a knowledge-graph-derived tour can enumerate modules, layers, and paths accurately yet fail to teach the "why" a human mentor conveys, so learners get a structurally complete but pedagogically flat artifact they abandon. The likely failure mode is high generation cost producing a tour that reads like generated documentation and drifts stale as the code moves. For it not to hold, the courseware would need a curation layer where a human seeds the narrative/intent and the graph only fills in the structural scaffolding.
- Objection answered: no — accepted as a standing downside.

### 10. Searchable public registry indexing shared constraint packs — score: 2.08

- Premise: Stand up a searchable public registry indexing shared constraint packs (from #3) so adopters can discover and pull a proven ruleset for their stack or domain.
- Persona: A tech lead browsing for a battle-tested constraint set rather than authoring one from scratch.
- Complexity: medium
- Impact / Confidence / Effort: M/M/H — base score 1.33
- Strategy alignment: +0.75 (track "External adoption flywheel" — extends constraint-sharing/marketplace +0.5; references Our approach — discoverable constraints-as-code +0.25) — applied (base-score tie with #9, |Δbase| = 0.00) — final score 2.08
- Strongest objection: The strongest objection is compounded dependency and empty-shelf risk: a registry adds nothing until portable packs (#3) both exist and are numerous and trustworthy enough to browse, so building the discovery layer first inverts the dependency order and risks a polished storefront with empty shelves — while inheriting the same provenance/trust burden as the skill marketplace. The likely failure mode is launching a registry that indexes two internal packs and signals abandonment. For it not to hold, #3 adoption would need to have already produced a critical mass of shareable, vetted packs.
- Objection answered: no — accepted as a standing downside.

## Ranking table (base-score order)

| Rank | Premise (short)                                  | I/C/E | Base | Bonus | Final |
| ---- | ------------------------------------------------ | ----- | ---- | ----- | ----- |
| 1    | Stack starter templates (`init --template`)      | M/H/L | 6.00 | +0.75 | 6.00  |
| 2    | Pre-adoption readiness report (`assess --adopt`) | H/H/M | 4.50 | +0.75 | 4.50  |
| 3    | Portable constraint-pack export/import           | H/M/M | 3.00 | +0.75 | 3.75  |
| 4    | Opt-in telemetry adoption insights               | H/M/M | 3.00 | +0.75 | 3.75  |
| 5    | Skill marketplace (publish/install)              | H/M/H | 2.00 | +0.75 | 2.75  |
| 6    | Cross-client setup installer (`harness setup`)   | M/M/M | 2.00 | +0.75 | 2.75  |
| 7    | Shareable Harness-Coverage badge/report          | L/M/L | 2.00 | +0.75 | 2.75  |
| 8    | Telemetry-seeded skill recommendations           | H/L/M | 1.50 | +0.75 | 1.50  |
| 9    | `harness blueprint` codebase courseware          | M/M/H | 1.33 | +0.75 | 2.08  |
| 10   | Public constraint-pack registry                  | M/M/H | 1.33 | +0.75 | 2.08  |

Note: bonus is applied to the final score only within an exact base-score tie (#3/#4, #5/#6/#7, #9/#10). Singletons (#1, #2, #8) record the bonus but do not apply it, so #8's final (1.50) is intentionally below the applied finals of the lower-base #9/#10 tie — order remains by base score, per the ranking contract.

## Handoff

- Ideation artifact written: docs/ideation/external-adoption-flywheel-mak-2026-08-13.md
- Top pick: `harness init --template <stack>` ships a working constraint set on first command — score 6.00
- Next: invoke `/harness:brainstorming "Stack starter templates"` to take a candidate into a spec, OR `/harness:roadmap` to enqueue picks for later.
