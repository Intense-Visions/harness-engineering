---
topic: Raise the quality ceiling with LLM-judgment critique that rule-based linters cannot reach, now that the craft family is complete and the track's committed work is exhausted.
generated_at: 2026-09-06T16:27:46Z
strategy_grounded: true
strategy_path: STRATEGY.md
count_requested: 10
count_generated: 10
ranking_formula: '(impact × confidence) ÷ effort; strategy-alignment tiebreaker (max +0.75) applied only when |Δbase_score| ≤ 0.05'
---

# Ideation: Raise the quality ceiling with LLM-judgment critique that rule-based linters cannot reach, now that the craft family is complete and the track's committed work is exhausted.

## Inputs

- Topic: Raise the quality ceiling with LLM-judgment critique that rule-based linters cannot reach, now that the craft family is complete and the track's committed work is exhausted.
- Generated: 2026-09-06T16:27:46Z
- Strategy grounding: enabled — `STRATEGY.md` (v2, `last_updated: 2026-07-01`) present and valid; `Tracks`, `Target problem`, `Our approach`, and `Who it's for` captured.
- Objection policy for this run: **none** — no objection was rebutted. Every strongest objection below stands on the record as an accepted, unrebutted downside.

### Grounding notes

The strategy's **Ceiling-raising via LLM judgment** track reads: _"Current: complete the craft family — docs-craft, code-craft, api-craft, cli-ergonomics are the remaining four; six already shipped (naming, spec, test, copy, knowledge, security)."_ That line is **stale as of this run**. Verified against the repository at `e530ae6b`:

- `docs/roadmap.d/craft-pipeline-sub-project-2-docs-craft.md`, `-4-code-craft.md`, `-7-api-craft.md`, and `-8-cli-ergonomics.md` are all **`Status: done`** — the four "remaining" sub-projects are finished.
- Eleven craft skills exist under `packages/cli/src/`: `naming-`, `spec-`, `test-`, `copy-`, `knowledge-`, `security-`, `docs-`, `code-`, `api-`, `cli-ergonomics-`, and `design-craft`.
- `craft-fleet` (`docs/roadmap.d/craft-fleet.md`) is **`Status: done`** — the sweep orchestrator ships.

The track's committed work is therefore exhausted, and candidate generation targets what the completed family does _not_ yet do. Four structural asymmetries in the shipped family were read directly off the tree and seed several candidates below:

1. **Ten of eleven craft skills carry only `phases/critique.ts`.** Only `design-craft` — the prototype — has `polish.ts`, `benchmark.ts`, and `award-bar.ts`. The family reports; with one exception it does not apply or score.
2. **Six of eleven ship rubrics but no exemplars** (`copy-`, `knowledge-`, `naming-`, `security-`, `spec-`, `test-craft`). `catalog/exemplars/` exists only for `code-`, `docs-`, `api-`, `cli-ergonomics-`, and `design-craft`. Benchmarking against best-in-domain work is impossible for the other six.
3. **Craft findings have no authority seam.** `packages/intelligence/src/outcome-eval/authority.ts` and its acceptance-eval twin derive `blocking | advisory` in TypeScript and never trust the LLM for it. `packages/cli/src/shared/craft/` has no counterpart: the 3-axis model (`findings/axes.ts`) and `derivePriority` (`findings/derived.ts`) produce a sort order, never a gate. Every craft finding is advisory, permanently.
4. **The track's parent initiative is still marked blocked on work that is done.** `docs/roadmap.d/harness-craft-pipeline-orchestrator.md` is `Status: blocked` with `Blockers:` naming exactly the four sub-projects now `done`.

## Ranked candidates

### 1. Stamp every craft finding with the provider, model, and rubric version that produced it, so a judgment is reproducible and the effect of a model or rubric swap is visible rather than invisible — score: 6.00

- Persona: Harness maintainers and tech leads who change the craft LLM backend (`shared/craft/llm/provider.ts` resolves `in-session` → `claude-cli` → `anthropic` → `mock`) and today cannot tell whether a shifted finding set reflects the code or the judge.
- Complexity: low
- Key risk: Provenance is only worth its plumbing if something downstream consumes it; it may become metadata nobody ever reads.
- Impact / Confidence / Effort: M/H/L — base score 6.00
- Strategy alignment: +0.5 track:`Ceiling-raising via LLM judgment` — **recorded, not applied** (|Δ| to the next candidate is 1.50 > 0.05; base score determines rank) — final score 6.00
- Strongest objection: This is bookkeeping dressed as a feature — it raises no ceiling by itself, and the craft family has survived eleven skills without it, which is evidence the pain is theoretical rather than felt. The most likely failure mode is that the fields ship, populate correctly, and are then read by no report, no gate, and no human, leaving eleven emit sites carrying dead weight that must be maintained through every future schema change. There is also a real chance the reproducibility it promises is illusory: stamping the model name does not make an LLM judgment reproducible, because the same model at the same version returns different findings across runs, so the stamp records an input without delivering the determinism a reader will assume it implies. For this objection not to hold, a concrete consumer would have to exist before the stamping lands — a calibration report, a model-swap diff, or a gate that refuses low-provenance findings — and the reproducibility claim would have to be narrowed honestly to "attributable" rather than "repeatable".
- Objection answered: no

### 2. Derive a `blocking | advisory` authority for each craft finding in TypeScript from the existing (tier, impact, confidence) axes, mirroring `deriveAuthority` in outcome-eval, so the highest-conviction ceiling findings can gate a merge while everything else stays advisory — score: 4.50

- Persona: Tech leads whose CLAUDE.md and code-review checklists are, in the strategy's words, _"conventions without enforcement"_ — and who find that a craft finding nobody is obliged to act on gets skipped exactly like the convention it was meant to replace.
- Complexity: medium
- Key risk: A false-positive blocking gate on a taste judgment would poison trust in the entire craft family within one bad week.
- Impact / Confidence / Effort: H/H/M — base score 4.50
- Strategy alignment: +0.5 track:`Ceiling-raising via LLM judgment`, +0.25 `Our approach` — **recorded, not applied** (|Δ| to the next candidate is 0.75 > 0.05; base score determines rank) — final score 4.50
- Strongest objection: The two existing authority modules gate on a _verdict about a stated contract_ — outcome-eval asks whether an implementation met acceptance criteria it can read, acceptance-eval whether criteria are measurable — whereas craft findings are unbounded aesthetic judgments with no contract to check them against, so the analogy that makes this look cheap may not survive the transfer. The most likely failure mode is a `foundational`/`large`/`high` finding that is simply the model being confidently wrong about taste, blocking a correct merge, and teaching the team that the fastest path is an override flag which then becomes the default. Worse, the axes were designed under ADR 0019 for display ordering — `derivePriority` is documented as "for stable sort/display ONLY" — so promoting them into a merge gate loads them with an authority their calibration was never established for. For this objection not to hold, the confidence axis would need demonstrated precision at the `high` end (measured, not assumed), the blocking band would need to be narrow enough that it fires rarely, and an override would need to be auditable rather than routine.
- Objection answered: no

### 3. Build golden fixtures with human-labelled expected findings for each craft skill, measure precision, recall, and run-to-run self-consistency against them, and gate rubric and prompt PRs on the result — score: 3.75

- Persona: Harness maintainers editing craft rubrics and prompts, who today ship a taste change across eleven skills with no measurement of whether the skill got better or worse.
- Complexity: medium
- Key risk: Hand-labelling golden craft fixtures is a large one-time taste investment that decays as the rubrics it measures evolve.
- Impact / Confidence / Effort: H/M/M — base score 3.00
- Strategy alignment: +0.5 track:`Ceiling-raising via LLM judgment: add craft-pipeline skills that critique _quality_ (naming, prose, code shape, spec clarity, threat models) beyond what rule-based linters can catch`, +0.25 `Our approach: encoding architectural decisions, process discipline, and strategic intent as machine-checkable constraints` — **applied** (base score tied at 3.00 with candidates 4, 5, and 6; |Δ| = 0.00 ≤ 0.05, tie window) — final score 3.75
- Strongest objection: A golden fixture encodes one labeller's taste at one moment as ground truth, which is precisely the thing the craft family exists to argue is not mechanizable — so the harness would be measuring agreement with a frozen opinion rather than quality, and a rubric change that genuinely improves the skill would register as a regression and be blocked by its own gate. The most likely failure mode is inverted: the gate makes rubrics harder to improve, maintainers learn to re-baseline the fixtures whenever they fail, and the CI check degrades into a rubber stamp that costs review latency and buys nothing. The existing `skill-regression-evaluator` (`Status: done`) already covers brainstorming, planning, and spec-craft, so part of the claimed gap may be narrower than it appears. For this objection not to hold, the fixtures would have to be labelled by more than one person with inter-rater agreement reported, the gate would have to fire on self-consistency (a property the skill should have regardless of taste) rather than on match-the-label, and re-baselining would need to be a reviewed event rather than a routine unblock.
- Objection answered: no

### 4. Run diff-scoped, risk-tiered craft critique inside the code-review pipeline at PR time instead of only in craft-fleet's periodic sweep, so ceiling findings arrive while the change is still open — score: 3.75

- Persona: Tech leads on agent-heavy teams watching PR-review backlogs balloon, for whom a finding that lands a week after merge is a cleanup ticket rather than a review comment.
- Complexity: medium
- Key risk: Per-PR LLM judgment on every diff is a recurring token cost against a low hit rate — most diffs carry no ceiling finding worth the spend.
- Impact / Confidence / Effort: H/M/M — base score 3.00
- Strategy alignment: +0.5 track:`Ceiling-raising via LLM judgment`, +0.25 `Target problem: ... that humans then absorb as code-review backlogs and manual checklists` — **applied** (base score tied at 3.00 with candidates 3, 5, and 6; |Δ| = 0.00 ≤ 0.05, tie window) — final score 3.75
- Strongest objection: Craft findings are inherently whole-artifact judgments — whether an abstraction is earned, whether a doc teaches, whether a resource models the domain — and a diff is the wrong unit for all of them, so diff-scoping the critique will systematically produce the shallowest findings the family is capable of while charging the highest per-run cost. The most likely failure mode is comment fatigue: an aspirational-tier remark on every PR, reviewers muting the bot within a month, and the craft family acquiring the reputation of a nitpicker precisely when it needed authority for candidate 2. There is also a scope collision worth naming — `craft-fleet` already sweeps these skills and routes findings elevate/file/route, so this creates a second entry point whose boundary with the fleet is undefined. For this objection not to hold, the risk tiering would have to suppress the large majority of diffs rather than annotate them, the PR-time surface would have to be restricted to the finding classes that are genuinely diff-local, and the boundary against craft-fleet would need to be settled before either surface grows.
- Objection answered: no

### 5. Curate exemplar catalogs for copy-, knowledge-, naming-, security-, spec-, and test-craft — the six skills that ship rubrics but no exemplars — bringing the family to parity with the five that have them — score: 3.50

- Persona: Senior engineers who want "how does this compare to the best work in this domain" rather than one more list of rubric violations.
- Complexity: medium
- Key risk: Exemplar curation is taste-labour that does not compound — the catalog goes stale and nobody notices it has.
- Impact / Confidence / Effort: M/H/M — base score 3.00
- Strategy alignment: +0.5 track:`Ceiling-raising via LLM judgment` — **applied** (base score tied at 3.00 with candidates 3, 4, and 6; |Δ| = 0.00 ≤ 0.05, tie window) — final score 3.50
- Strongest objection: The five domains that got exemplars got them because exemplars are _available and citable_ there — Stripe's API, `gh` and `rg` for CLIs, MDN and Linear for docs — whereas the six without them are the six where public best-in-class work either does not exist or cannot be quoted: there is no canonical corpus of exemplary threat models, exemplary knowledge captures, or exemplary internal specs, and the absence may be a correct earlier judgment rather than an oversight. The most likely failure mode is that the catalogs get filled with the harness's own artifacts, which makes the skill measure conformity to this repository's habits and calls it excellence — a self-referential ceiling that can only ever rise to where the repo already is. For this objection not to hold, each of the six domains would need at least a handful of genuinely external, defensible exemplars identified _before_ the build is committed, and any domain that cannot clear that bar would need to be dropped rather than padded.
- Objection answered: no

### 6. Build the `harness:craft-pipeline` orchestrator — the track's parent initiative, still marked `blocked` on four sub-projects that are now all `done` — composing the eleven craft skills as FRESHEN → JUDGE → SUGGEST → BENCHMARK → REPORT, the way docs-pipeline and design-pipeline compose their families — score: 3.50

- Persona: Tech leads who want a single whole-repo ceiling-health command and report rather than invoking eleven skills by hand or waiting on a fleet sweep.
- Complexity: medium
- Key risk: `craft-fleet` already composes these eleven skills, so a second composition surface risks overlapping it with no clear boundary.
- Impact / Confidence / Effort: M/H/M — base score 3.00
- Strategy alignment: +0.5 track:`Ceiling-raising via LLM judgment` — **applied** (base score tied at 3.00 with candidates 3, 4, and 5; |Δ| = 0.00 ≤ 0.05, tie window) — final score 3.50
- Strongest objection: This initiative was specified before `craft-fleet` existed, and `craft-fleet` shipped and did the useful half of it — sweeping the eleven skills, ranking targets, routing findings — so building the orchestrator now is at serious risk of being archaeology rather than product, delivering a second front door to the same eleven skills and forcing every future craft change to be wired into two composition layers instead of one. The most likely failure mode is that the orchestrator ships, `craft-fleet` remains the surface people actually run because it produces PRs rather than a report, and the pipeline becomes a maintained-but-unused artifact whose FRESHEN and BENCHMARK phases quietly rot. The record also shows the two are not equivalent — the orchestrator's BENCHMARK phase has no implementation for six of eleven skills (see candidate 5) — which means shipping it now would ship a phase that half the family cannot execute. For this objection not to hold, the orchestrator/fleet boundary would need to be stated as a decision before any code, and the phases that cannot run family-wide would need to degrade explicitly rather than silently skip.
- Objection answered: no

### 7. Lift design-craft's POLISH phase into the shared craft layer so each of the ten critique-only skills can apply a bounded, cited fix for its own findings instead of only reporting them — score: 2.75

- Persona: Engineers who receive a craft report and must hand-apply every finding, paying the reading cost of the critique twice — once to understand it, once to act on it.
- Complexity: high
- Key risk: An auto-applied ceiling rewrite is a machine acting on its own aesthetic judgment with no independent check between the opinion and the edit.
- Impact / Confidence / Effort: H/M/H — base score 2.00
- Strategy alignment: +0.5 track:`Ceiling-raising via LLM judgment`, +0.25 `Our approach: Constraints fire in real time, so agents self-correct mid-stream instead of accumulating cleanup debt downstream` — **applied** (base score tied at 2.00 with candidate 8; |Δ| = 0.00 ≤ 0.05, tie window) — final score 2.75
- Strongest objection: POLISH works in design-craft because design findings are largely token-level and mechanically checkable after the fact — a spacing value, a type scale, a contrast ratio — whereas code, spec, security, and knowledge findings are semantic, and a model that rewrites a function to satisfy its own "this abstraction is not earned" judgment can silently change behaviour with a diff that reads beautifully and passes review precisely because it reads beautifully. The most likely failure mode is a plausible, well-argued, subtly wrong rewrite landing through a pipeline whose reviewer is the same class of model that proposed it. The scale multiplies the risk: this is ten skills across every artifact type in the repo, and `code-craft` is documented as touching every PR. For this objection not to hold, POLISH would have to be gated behind a test-and-behaviour-preservation check per domain rather than a generic one, applied only to `foundational`-tier high-confidence findings, and shipped domain-by-domain with evidence from each before the next — not lifted family-wide in one move.
- Objection answered: no

### 8. Add a shared arbiter that collapses findings which multiple craft skills raise against the same construct — one poor function draws naming, code, docs, and test findings — into a single ranked elevation — score: 2.50

- Persona: Engineers reading a craft-fleet batch where the finding count overstates the problem count several times over, and who cannot tell which of forty findings are the eight underlying issues.
- Complexity: medium
- Key risk: Cross-domain dedup requires a shared identity for "the same problem", which may not actually exist.
- Impact / Confidence / Effort: M/M/M — base score 2.00
- Strategy alignment: +0.5 track:`Ceiling-raising via LLM judgment` — **applied** (base score tied at 2.00 with candidate 7; |Δ| = 0.00 ≤ 0.05, tie window) — final score 2.50
- Strongest objection: Four skills flagging one function are usually saying four genuinely different things — the name misleads, the abstraction is unearned, the doc comment lies, the test asserts implementation — and collapsing them into one elevation destroys exactly the multi-perspective signal that motivated building eleven separate skills instead of one; the redundancy is the product, not a defect. The most likely failure mode is an arbiter that keeps the highest-priority finding and discards three, so the engineer fixes the name, closes the item, and never learns the test was also wrong. The skills already defer to each other by design where the overlap is real — code-craft is documented as deferring naming findings to naming-craft and doc-comment findings to docs-craft — which suggests the duplication is bounded by construction and the observed volume may be a presentation problem rather than a dedup problem. For this objection not to hold, the arbiter would have to group and nest rather than collapse, and the duplication rate would need measuring on real fleet output first to establish there is a problem worth an arbiter.
- Objection answered: no

### 9. Generalize design-craft's BENCHMARK phase into the shared craft layer so any craft skill scores its target against per-domain exemplars and reports a trend over time — score: 1.33

- Persona: Tech leads who need to report quality movement upward and require a number that moves, rather than a finding list that resets on every run.
- Complexity: high
- Key risk: A single scalar craft score is the output most likely to be gamed, or dismissed as unfalsifiable.
- Impact / Confidence / Effort: M/M/H — base score 1.33
- Strategy alignment: +0.5 track:`Ceiling-raising via LLM judgment` — **recorded, not applied** (|Δ| to the adjacent candidate is 1.17 > 0.05; base score determines rank) — final score 1.33
- Strongest objection: The moment a craft score exists it becomes a target, and a target set by an LLM's own judgment is the easiest target in the repository to satisfy without improving anything — the score rises because the artifacts learn the rubric's vocabulary, which is Goodhart's law with an unusually short feedback loop. The most likely failure mode is a dashboard number that trends up while quality holds flat, which is worse than no number because it retires the question. There is also a hard dependency and a hard prior: six of eleven skills have no exemplars to benchmark against (candidate 5 must land first), and the repository has already ruled — in the `stability-gate-on-ranked-outputs` item, `Status: done` — that ranked outputs must prove two-window rank stability or degrade to tiers, a bar an LLM-derived craft score is unlikely to clear. For this objection not to hold, the score would have to demonstrate cross-window stability under that existing gate, and it would have to be reported as a tier rather than a point value if it cannot.
- Objection answered: no

### 10. Add review-craft, a twelfth craft skill that critiques the harness's own review output — whether review comments are specific, actionable, and correctly prioritized — turning the ceiling family on the reviewers themselves — score: 1.00

- Persona: Tech leads who trust the review pipeline's coverage but not its signal-to-noise, and who today have no measure at all of review-comment quality.
- Complexity: low
- Key risk: Judging a judge with the same class of judge is circular — a model that writes weak reviews will rate weak reviews highly.
- Impact / Confidence / Effort: M/L/M — base score 1.00
- Strategy alignment: +0.5 track:`Ceiling-raising via LLM judgment` — **recorded, not applied** (|Δ| to the adjacent candidate is 0.33 > 0.05; base score determines rank) — final score 1.00
- Strongest objection: The circularity is not a caveat here, it is the whole mechanism: the reviewer and the critic share a model, a prompt lineage, and a set of blind spots, so the skill is structurally incapable of finding the failures that matter most — the ones the reviewing model cannot see — and will instead reward reviews written in the style it would have written. The most likely failure mode is a consistently high review-quality score that is pure self-agreement, actively harmful because it manufactures confidence in a surface nobody has independently checked. The repository already holds a cheaper and less circular instrument for this question — `outcome-eval`'s post-merge `execution_outcome` verdicts, which the Holiday Confidence KPI already reads — so the ground truth about whether reviews caught what mattered is partly available without a new skill. For this objection not to hold, the critic would need a different model or a genuinely independent rubric from the reviewer, and it would need validation against real escaped-defect data before its verdicts were shown to anyone.
- Objection answered: no

## Ranking trace

| Rank | Candidate                                | I/C/E | Base | Alignment bonus | Applied?           | Final |
| ---- | ---------------------------------------- | ----- | ---- | --------------- | ------------------ | ----- |
| 1    | Finding provenance stamping              | M/H/L | 6.00 | +0.5            | no (Δ 1.50 > 0.05) | 6.00  |
| 2    | Craft finding authority module           | H/H/M | 4.50 | +0.75           | no (Δ 0.75 > 0.05) | 4.50  |
| 3    | Judgment calibration harness             | H/M/M | 3.00 | +0.75           | yes (tie window)   | 3.75  |
| 4    | Inline craft critique at PR time         | H/M/M | 3.00 | +0.75           | yes (tie window)   | 3.75  |
| 5    | Exemplars for the six rubric-only skills | M/H/M | 3.00 | +0.5            | yes (tie window)   | 3.50  |
| 6    | `harness:craft-pipeline` orchestrator    | M/H/M | 3.00 | +0.5            | yes (tie window)   | 3.50  |
| 7    | Shared POLISH phase                      | H/M/H | 2.00 | +0.75           | yes (tie window)   | 2.75  |
| 8    | Cross-craft finding arbitration          | M/M/M | 2.00 | +0.5            | yes (tie window)   | 2.50  |
| 9    | Shared BENCHMARK phase                   | M/M/H | 1.33 | +0.5            | no (Δ 1.17 > 0.05) | 1.33  |
| 10   | review-craft (twelfth skill)             | M/L/M | 1.00 | +0.5            | no (Δ 0.33 > 0.05) | 1.00  |

Candidates 3 and 4 tie at 3.75, and candidates 5 and 6 tie at 3.50; ordering within each tie is stable on generation order. Rank is `(impact × confidence) ÷ effort` plus the bounded tiebreaker and nothing else — the unrebutted objections recorded above did not move any position.
