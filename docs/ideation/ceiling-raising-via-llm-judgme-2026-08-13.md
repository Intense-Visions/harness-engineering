---
topic: 'Ceiling-raising via LLM judgment: complete and extend the craft-pipeline family that critiques quality beyond rule-based linters — the remaining docs-craft, code-craft, api-craft, cli-ergonomics skills and the craft fleet that composes them'
generated_at: '2026-08-13T12:00:00Z'
strategy_grounded: true
strategy_path: STRATEGY.md
count_requested: 10
count_generated: 10
ranking_formula: '(impact × confidence) ÷ effort; strategy-alignment tiebreaker (max +0.75) applied only when |Δbase_score| ≤ 0.05'
---

# Ideation: Ceiling-raising via LLM judgment — complete and extend the craft-pipeline family

## Inputs

- Topic: Ceiling-raising via LLM judgment — complete and extend the craft-pipeline family that critiques quality beyond rule-based linters (the docs-craft, code-craft, api-craft, cli-ergonomics skills and the craft fleet that composes them).
- Generated: 2026-08-13T12:00:00Z
- Strategy grounding: enabled — STRATEGY.md present and valid; track match "Ceiling-raising via LLM judgment".
- Objection policy: none — each candidate carries its single strongest objection as a standing, accepted downside; none are rebutted.

## Grounding note

Reconnaissance of the repo shows the four skills named in the theme (docs-craft, code-craft, api-craft, cli-ergonomics-craft) plus the six earlier ones (naming, spec, test, copy, knowledge, security) and harness-design-craft — eleven craft skills total — and the `craft-fleet` that composes them have all shipped. The theme's "complete" is therefore effectively done at the skill-inventory level; the live leverage is now in **extending, hardening, and compounding** the family. Candidates below are grounded in observed asymmetries: only 4 of 11 craft skills expose a `_finalize` tool; `code-craft` explicitly foreshadows a future `align-code` autofix sibling; the family shares a 3-axis (tier × impact × confidence) output model (ADR 0019) and a formal verifier interface; rubric catalogs are hardcoded (seeded from Martin/Beck/Karlton); and craft findings are advisory-by-design with no calibration loop back into their own confidence.

## Ranked candidates

### 1. Cross-craft finding dedup and composition in craft-fleet — score: 6.00

- Premise: Add a location-keyed dedup/composition pass to `craft-fleet`'s SELECT phase so a single code site flagged by multiple craft skills (e.g. naming + code + copy) collapses into one composed finding instead of three parallel `(scope, domain)` targets.
- Persona: The tech lead running a batch craft sweep whose scarce resource is review attention, and who abandons the fleet's output when the same twenty lines arrive as three separate elevation items.
- Complexity: low
- Impact / Confidence / Effort: M/H/L — base score 6.00
- Strategy alignment: +0.75 (advances the Ceiling-raising track; persona references the Target problem's PR-review-backlog cost) — final score 6.00 (bonus recorded; not applied — no adjacent base-score tie)
- Strongest objection (accepted downside): Composing findings across independent rubric catalogs risks producing a muddled meta-finding that serves no single craft skill's rewrite contract — the fleet's `harness-refactoring` subagents need a cited `runId`+`rubricId`+location per finding, and a composed item either loses that provenance or has to carry three, which complicates the cited-and-net-better verification the fleet's Iron Law depends on. The most likely failure mode is that the dedup silently drops the lower-confidence contributor and the human never learns a second craft skill also objected to that site.

### 2. Golden-set rubric regression harness for judgment drift — score: 4.50

- Premise: Build a curated corpus of exemplar/anti-exemplar snippets per rubric with pinned expected verdicts, run in CI, so a model upgrade or prompt change that shifts any craft skill's judgment is caught as a regression before it ships.
- Persona: The harness maintainer who upgrades the backend model and currently has no way to know whether spec-craft or code-craft quietly got harsher, softer, or inconsistent overnight.
- Complexity: medium
- Impact / Confidence / Effort: H/H/M — base score 4.50
- Strategy alignment: +0.75 (advances the Compounding-feedback-loops track; premise references Our approach — machine-checkable, compounding constraints) — final score 4.50 (bonus recorded; not applied — no adjacent base-score tie)
- Strongest objection (accepted downside): LLM judgment is inherently non-deterministic, so a golden-set harness must tolerate variance without becoming a flaky CI gate that maintainers learn to rerun-until-green — and the moment it tolerates variance it can no longer distinguish real drift from noise. The most likely failure mode is a harness that is either too strict (constant false-positive reds that get muted) or too loose (passes through the exact judgment regressions it was built to catch), with no stable middle band.

### 3. Self-tuning taste-calibration noise floor in craft-fleet — score: 4.00

- Premise: Record the human's accept/reject decision on `craft-fleet`'s CONFIRM-phase verbatim taste-calibration sample and feed it back into the fleet's per-domain noise-floor threshold, so the floor that decides which findings are "above the noise" self-tunes toward that reviewer's demonstrated taste.
- Persona: The senior engineer who repeatedly rejects the same class of low-value naming nits from the sweep and wants the floor to stop surfacing them without editing a config file.
- Complexity: low
- Impact / Confidence / Effort: M/M/L — base score 4.00
- Strategy alignment: +0.75 (advances the Compounding-feedback-loops track; premise references Our approach — skills that measurably improve over time) — final score 4.00 (bonus recorded; not applied — no adjacent base-score tie)
- Strongest objection (accepted downside): A floor that tunes itself to one reviewer's accept/reject history overfits to a single person's taste and can silently suppress a whole category of legitimate findings the team would have wanted, converting an advisory floor into an opaque filter no one audits. The most likely failure mode is that the calibration ratchets the floor upward over a few sessions until the fleet reports "quiet" everywhere, and the human mistakes a mis-tuned filter for a codebase that has reached its ceiling.

### 4. Unified craft finalize/persistence contract across all eleven skills — score: 3.75

- Premise: Extract a shared `*_craft_finalize` contract and apply it to all eleven craft skills (only four expose one today) so every craft run persists its findings uniformly as graph nodes with the 3-axis metadata, giving the family one queryable finding store.
- Persona: The tech lead who wants `harness insights` to answer "where is our craft debt concentrated?" but today gets that signal from only the four skills that happen to persist.
- Complexity: medium
- Impact / Confidence / Effort: M/H/M — base score 3.00
- Strategy alignment: +0.75 (advances the Ceiling-raising track and feeds the Context-Density KPI via the knowledge graph — Our approach) — final score 3.75 (bonus applied — base-score tie with candidate 5)
- Strongest objection (accepted downside): Forcing eleven skills with genuinely different finding shapes (a prose docs finding vs a per-unit code finding vs a per-endpoint api finding) through one persistence contract risks a lowest-common-denominator schema that loses each domain's specifics, or a bloated union type that is awkward for every consumer. The most likely failure mode is that the "shared" contract needs a per-skill escape hatch within two releases, at which point the unification is nominal and the maintenance cost of the abstraction outweighs the query convenience it promised.

### 5. Wire craft critique into the per-PR code-review pipeline — score: 3.75

- Premise: Integrate the relevant craft skill(s) into the existing multi-agent `code-review` pipeline so that ceiling critique fires automatically on the units changed in a PR, instead of only when a human already suspected something was mediocre and invoked a craft skill by hand on one file.
- Persona: The tech lead 3–6 months into agent adoption whose review backlog is the bottleneck, and whose agents never get ceiling feedback because no one remembers to run the craft skills.
- Complexity: medium
- Impact / Confidence / Effort: H/M/M — base score 3.00
- Strategy alignment: +0.75 (advances the Ceiling-raising track; persona references the Target problem — ballooning PR-review backlogs — and the Agent-Autonomy KPI) — final score 3.75 (bonus applied — base-score tie with candidate 4)
- Strongest objection (accepted downside): Craft findings are advisory and noisy by design, so firing them automatically on every PR risks flooding review with subjective "could be better" comments that reviewers learn to ignore — the same alert-fatigue that killed inline-lint-comment bots — and worse, an agent may thrash trying to satisfy contradictory taste feedback with no human to arbitrate. The most likely failure mode is that teams disable the integration within a sprint because the signal-to-noise ratio on a per-PR cadence is worse than the deliberate, human-initiated one-file cadence the craft skills were designed for.

### 6. Per-rubric confidence calibration loop from outcome telemetry — score: 2.75

- Premise: Close a feedback loop that records whether each craft finding was accepted or rejected downstream (by the human, by craft-fleet's re-critique, by a merged fix) and calibrates each rubric's confidence prior over time, so persistently-rejected rubrics down-weight and persistently-actioned rubrics gain authority.
- Persona: The harness maintainer tracking skill-effectiveness baselines who wants the craft family to demonstrably get sharper release-over-release rather than emit the same fixed-confidence judgments forever.
- Complexity: high
- Impact / Confidence / Effort: H/M/H — base score 2.00
- Strategy alignment: +0.75 (advances the Compounding-feedback-loops track; premise references Our approach — skills that measurably improve and compound) — final score 2.75 (bonus applied — base-score tie with candidates 7 and 8)
- Strongest objection (accepted downside): Calibrating rubric confidence from accept/reject outcomes conflates "the reviewer disagreed with this rubric" with "this rubric was wrong here," and taste rejections are sparse, personal, and context-dependent — a rubric that is right but unpopular will be down-weighted into silence, permanently lowering the family's ceiling to match the median reviewer's tolerance. The most likely failure mode is a feedback loop that optimizes for agreement rather than quality, quietly amputating the family's most demanding (and most valuable) rubrics.

### 7. New infra/config-craft domain skill — score: 2.75

- Premise: Extend the craft family with a new domain skill that critiques the quality of infrastructure-as-code and configuration (Dockerfiles, CI YAML, `harness.config.json`, compose files) — the readability, honesty, and maintainability questions a YAML/schema linter cannot ask.
- Persona: The senior engineer whose CI and container config has quietly rotted into copy-pasted, unexplained, drift-prone stanzas that no rule-based linter flags but every new hire misreads.
- Complexity: medium
- Impact / Confidence / Effort: M/M/M — base score 2.00
- Strategy alignment: +0.75 (advances the Ceiling-raising track by adding a domain; premise references Our approach — constraints-as-code extended to config surfaces) — final score 2.75 (bonus applied — base-score tie with candidates 6 and 8)
- Strongest objection (accepted downside): Infra/config quality is far more environment- and org-specific than code or prose quality — what reads as a smell in one team's CI is a deliberate, load-bearing choice in another's — so a generic rubric catalog will produce a high false-positive rate and little of the near-universal signal that made error-message and naming critique land. The most likely failure mode is a twelfth craft skill whose findings are so context-dependent that the honest confidence axis pins everything to "low," and the skill is never trusted enough to act on.

### 8. Adopter-extensible / override-able rubric catalogs — score: 2.75

- Premise: Let adopters add, disable, or override craft rubrics through project config rather than the hardcoded seed catalogs, so a team can encode its own house taste (or mute a rubric that fights its conventions) without forking the substrate.
- Persona: The tech lead at an adopting org whose team standards diverge from the Martin/Beck/Karlton defaults and who currently has no lever short of ignoring the whole skill.
- Complexity: medium
- Impact / Confidence / Effort: M/M/M — base score 2.00
- Strategy alignment: +0.75 (advances the External-adoption track; premise references Our approach — constraints-as-code that adopters own) — final score 2.75 (bonus applied — base-score tie with candidates 6 and 7)
- Strongest objection (accepted downside): A curated rubric catalog is the product — its value is precisely that it encodes expert taste the adopter does not have — so handing adopters an override knob invites them to mute the rubrics they find annoying (which are often the ones they most need), hollowing the ceiling down to what they already believed. The most likely failure mode is that override configs become the mechanism by which teams disable exactly the demanding judgment the family exists to supply, and the feature ships a foot-gun dressed as flexibility.

### 9. align-code safe-autofix sibling for code-craft — score: 1.00

- Premise: Ship the `align-code` sibling that `code-craft`'s SKILL.md already foreshadows — a bounded, behavior-preserving autofix path that applies only the highest-confidence, mechanically-safe code-craft findings, mirroring how `align-design-system` applies safe drift codemods.
- Persona: The individual developer running 10+ agent sessions a week who wants the obvious readability wins applied automatically rather than read as a critique they must action by hand.
- Complexity: high
- Impact / Confidence / Effort: H/L/H — base score 1.00
- Strategy alignment: +0.75 (advances the Ceiling-raising track; premise references Our approach — turning judgment into mechanically-applied change) — final score 1.00 (bonus recorded; not applied — no adjacent base-score tie)
- Strongest objection (accepted downside): Safe behavior-preserving rewriting of subjective code quality is exactly the thing `craft-fleet` deliberately refuses to do at scale ("file-don't-rewrite") because taste-driven autofix produces churn, style-thrash, and un-reviewable bulk diffs — the confidence axis on code-craft findings is low precisely because "this reads better" is contestable. The most likely failure mode is that the set of findings genuinely safe to auto-apply is so small it does not justify a whole sibling skill, while any wider net reintroduces the churn the family was architected to avoid.

### 10. Provider-neutral craft judgment routing — score: 0.67

- Premise: Add per-rubric backend routing so craft critique can run off the Claude-only path (local models, other providers) with each rubric declaring the judgment strength it needs, extending the family across the multi-client substrate.
- Persona: The Cursor/Codex/Gemini-CLI or local-model adopter who wants ceiling critique without being locked to a single provider's judgment.
- Complexity: high
- Impact / Confidence / Effort: M/L/H — base score 0.67
- Strategy alignment: +0.75 (advances the Multi-client-portability track; premise references Our approach — a substrate usable across clients) — final score 0.67 (bonus recorded; not applied — no adjacent base-score tie)
- Strongest objection (accepted downside): Taste judgment is the single capability where weaker/local models are furthest behind — prior local-pipeline work here found local models can execute mechanical fixes but hit a hard ceiling on the structured, subjective judgment craft skills demand — so routing craft critique to them produces confident-but-hollow verdicts that are worse than no critique because they carry the family's authority without its discernment. The most likely failure mode is that provider-neutral routing technically works while silently degrading the one thing the craft family exists to provide, and the degradation is invisible precisely because bad taste reads exactly like good taste in prose.
