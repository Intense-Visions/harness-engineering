---
topic: 'External-source adoption triage: rank 28 evaluated external repos/tools for adoption into harness-engineering'
generated_at: 2026-08-09T00:00:00Z
strategy_grounded: true
strategy_path: STRATEGY.md
count_requested: 12
count_generated: 12
ranking_formula: '(impact × confidence) ÷ effort; strategy-alignment tiebreaker (max +0.75) applied only when |Δbase_score| ≤ 0.05'
sources_assessed: 28 unique (28 links, 24 GitHub + 4 hosted, no duplicates)
method: repo-metadata verification via gh api + implementation-file reads + benchmark-methodology audit + harness-baseline verification against actual source
---

# Ideation: External-source adoption triage

## Inputs

- Topic: which of 28 external sources are worth adopting into harness, and as what
- Generated: 2026-08-09
- Strategy grounding: enabled — tracks read: upstream-grounding, ceiling-raising, compounding-feedback-loops, multi-client-portability, external-adoption-flywheel, full-lifecycle-reach

## Method and its limits

Every GitHub source had stars, language, last-push, license and size re-verified through `gh api repos/{owner}/{repo}` rather than read off the page. Where a project claims a benchmark, the **benchmark harness itself was read** where one is published, and the claim is reported against its actual methodology. The harness side was verified by reading the competing source in this repo — not by assuming a capability exists or doesn't.

Honest limits:

- The three Hermes sub-projects surfaced by `awesome-hermes-agent` (RTK-Hermes, llmtrim, hermes-lcm) were **not verifiable at the names given**. `NousResearch/RTK-Hermes` returns 404. The only `llmtrim` on GitHub is `fkiene/llmtrim` (203 stars, a local compressing proxy), which may or may not be the one referenced. Treat that directory's pointers as unconfirmed.
- `openai.com/index/harness-engineering/` returned HTTP 403 and could not be read. The claim that OpenAI publishes a "harness engineering" concept rests on `openai/symphony`'s own README, which links to it and states Symphony "works best in codebases that have adopted harness engineering."
- Per-agent token figures below are **summed per usage line without `requestId` dedup**. Harness's own `burn` package documents that transcripts repeat each usage block ~3×, so absolute numbers are inflated ~3.5×. The _attribution capability_ is the finding; the magnitudes are not.

## What the harness already has (verified against source, not assumed)

This determines half the verdicts, so it is stated first.

| Capability                                        | Where it actually lives                                                                                                      | State                                          |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Aggregate usage measurement                       | `packages/burn` — scans `~/.claude/projects/**/*.jsonl`, dedups by `requestId`, weighted `units` formula                     | Shipped, wired                                 |
| Progressive skill loading under a token budget    | `computeLoadPlan` in `packages/core/src/context/progressive-loader.ts`, called from `packages/cli/src/mcp/tools/skill.ts:79` | Shipped, **wired**                             |
| Context budget allocator                          | `contextBudget()` in `packages/core/src/context/budget.ts`                                                                   | Shipped, **zero non-test callers — dead code** |
| Tool-response compaction with reduction reporting | `packages/core/src/compaction/` + `packages/cli/src/mcp/middleware/compaction.ts`; `PackedEnvelope` reports `reductionPct`   | Shipped, wired                                 |
| MCP tool-surface reduction                        | `packages/cli/src/mcp/tool-tiers.ts` — `core`/`standard`/`full` allow-lists                                                  | Shipped                                        |
| Token estimation                                  | `estimateTokens()` = `chars / 4` heuristic                                                                                   | Shipped, approximate                           |
| Code graph context scoping                        | `query_graph`, `ask_graph`, `get_impact`, `compute_blast_radius`, `code_outline`, `code_unfold`, `find_context_for`          | Shipped                                        |
| Skill telemetry retrospective                     | `harness:catalog-retrospective`, `getCatalogRetrospectiveReport`                                                             | Shipped                                        |
| Design exemplar benchmarking                      | `harness:design-craft` BENCHMARK phase, `catalog/exemplars/` — **50 exemplars, 5 component types**                           | Shipped                                        |
| Post-implementation multi-category review         | `harness:code-review`, `run_ci_review`, 7 review agents, `check_traceability`                                                | Shipped                                        |

**The two genuine gaps this exercise found:**

1. **Attribution, not measurement.** `burn` measures the aggregate correctly. Nothing attributes it — not per always-loaded artifact, and not per dispatched subagent.
2. **No published number for the graph.** Harness has the capability its two closest competitors benchmark and market; it has never measured or published one.

## The finding that overturns a documented limitation

`fleet-command/SKILL.md:319` states, as a rationalization-to-reject:

> "Tokens spent inside dispatched subagents are not observable, so a token governor would be a promise the skill cannot keep."

**This is empirically false.** Claude Code writes one transcript per subagent to
`~/.claude/projects/<project>/<sessionId>/subagents/agent-<id>.jsonl`. On this machine there are **816** such files. Each carries `isSidechain: true`, `agentId`, `attributionAgent`, `sessionId`, `sourceToolAssistantUUID`, `requestId`, `model`, and a full `usage` block.

Grouping them by `attributionAgent` across 300 files already yields:

| attributionAgent            | turns |
| --------------------------- | ----- |
| `general-purpose`           | 9,585 |
| `harness-task-executor`     | 3,416 |
| `harness-planner`           | 1,243 |
| `harness-code-reviewer`     | 864   |
| `canary:canary-test-author` | 778   |
| `harness-verifier`          | 608   |
| `Explore`                   | 255   |

And `burn`'s `listTranscripts()` already recurses into subdirectories — so **burn is already ingesting this data and discarding the identity**. Per-subagent attribution needs no new instrumentation, no wrapper, and no provider cooperation: it is a grouping key on a scan that already runs.

This is what `paperclip` sells as a platform feature, and harness can have the read-only half of it for near-zero effort.

## Ranked candidates

### 1. Group `burn`'s existing transcript scan by `attributionAgent` to produce per-subagent and per-fleet-lane token attribution — score: 9.00

- Persona: the individual developer running 10+ agent sessions/week, and the tech lead who authorizes a fleet run without knowing what it will cost
- Complexity: low
- Impact / Confidence / Effort: H/H/L — base score 9.00
- Strategy alignment: none applied (clear base-score winner; no tie window) — final score 9.00
- Strongest objection: The data is on disk, but nothing guarantees Claude Code keeps writing it in this shape — `attributionAgent` and the `subagents/` layout are undocumented internals, not a contract. A feature built on them breaks silently on a CLI update, and worse, breaks _quietly wrong_ (attribution goes to zero rather than erroring). Most likely failure mode: a version bump renames the field, per-agent totals silently read 0, and a fleet cost report says a run was free. For this objection not to hold, the reader needs a schema assertion that fails loudly when the field disappears — the same discipline `packages/burn/tests/bin-startup.test.ts` already applies to its import graph.
- Objection answered: no — left standing. It is addressable (assert the shape, degrade to "unattributed" rather than 0) but the mitigation is real work and should be in scope from the start.

### 2. Publish a reproducible token-savings benchmark for the harness code graph — score: 6.75

- Persona: the tech lead 3–6 months in, evaluating whether harness's graph earns its indexing cost against a standalone MCP alternative
- Complexity: medium
- Impact / Confidence / Effort: M/H/L — base score 6.00
- Strategy alignment: +0.5 track `external-adoption-flywheel` + 0.25 references `Our approach` (durable grounding in a knowledge graph) — final score 6.75
- Strongest objection: Publishing a number invites a comparison harness might lose. `codebase-memory-mcp` is C with an arXiv preprint and `code-review-graph` is Python with a published reproduction guide; both are single-purpose and heavily optimized for exactly this metric, whereas the harness graph serves review scoping, impact analysis and blast radius too. Most likely failure mode: the benchmark shows harness meaningfully worse, and the result either gets buried (wasting the work) or published (handing competitors a citation). For the objection not to hold, the team has to genuinely want the answer either way — a losing number is a roadmap input, not a PR problem.
- Objection answered: no — left standing. Note the honest comparator: the arXiv preprint's own figure is **10× fewer tokens across 31 repos**, not the 99.2% on the README, which came from 5 hand-picked structural queries. 10× is the number to beat.

### 3. Position harness against OpenAI's "harness engineering" concept — score: 6.75

- Persona: anyone evaluating this project who searches the term and finds OpenAI's page and `openai/symphony` (26.5k stars) first
- Complexity: low
- Impact / Confidence / Effort: M/H/L — base score 6.00
- Strategy alignment: +0.5 track `external-adoption-flywheel` + 0.25 references `Our approach` — final score 6.75
- Strongest objection: This is positioning work, not engineering, and it can burn a lot of thinking for no shipped capability. There is also a real chance the two meanings are close enough that "differentiation" is manufactured — in which case the honest move is to adopt the shared vocabulary rather than contest it. Most likely failure mode: a week spent on a naming argument that no user ever had. For the objection not to hold, the term has to actually be load-bearing for discovery, which the 26.5k-star Symphony repo treating it as a **prerequisite** suggests it is.
- Objection answered: no — left standing. Flagged because Symphony is the closest structural analogue to the fleet family _and_ it names this project's category as its substrate; that is both a validation and a discoverability collision. Blocked on reading the OpenAI page, which 403'd.

### 4. Extend `design-craft` BENCHMARK's exemplar corpus with the 73 real-world `DESIGN.md` files from `awesome-design-md` — score: 6.50

- Persona: an engineer without a designer, shipping a customer-facing surface and wanting a credible bar to score against
- Complexity: low
- Impact / Confidence / Effort: M/H/L — base score 6.00
- Strategy alignment: +0.5 track `ceiling-raising-via-llm-judgment` — final score 6.50
- Strongest objection: The corpus is a category mismatch. `design-craft`'s 50 exemplars are **component-level** (EmptyState, LoadingState, ErrorState, Modal, Button — 10 each) with reference markup and per-exemplar reference scores that feed the machine-computed `awardBar`. `awesome-design-md` ships **whole-system design languages**, which have no component markup and no reference scores. Dropping them in does not extend the existing corpus; it requires a second, differently-shaped benchmark axis. Most likely failure mode: the files get added, the `awardBar` math has nothing to compute against, and BENCHMARK silently returns `indeterminate`. For the objection not to hold, this has to be scoped as a new system-level axis rather than corpus expansion.
- Objection answered: no — left standing, and it materially reshapes the item. MIT-licensed, so the corpus itself is free to use.

### 5. Add a context-surface attribution report: always-loaded vs path-scoped vs invoked-only, with exact tokenizer counts — score: 4.50

- Persona: the tech lead who already has a CLAUDE.md and a `.claude/` tree and cannot tell which parts of it are being paid for on every single turn
- Complexity: medium
- Impact / Confidence / Effort: H/H/M — base score 4.50
- Strategy alignment: recorded, not applied (no tie window at this score) — final score 4.50
- Strongest objection: The classification that makes `dotclaude`'s version cheap does not survive contact with harness. Its taxonomy assumes a small flat `.claude/` tree; harness's always-loaded surface is dominated by things that skill never models — MCP tool schemas across ~88 tool modules, four platform skill trees, hooks, and `AGENTS.md`. Worse, the two biggest levers are already partly handled elsewhere: `tool-tiers.ts` cuts the exposed tool count, and Claude Code's own deferred-tool loading defers schemas entirely. Most likely failure mode: the report measures a surface the platform already optimized and recommends trims worth a few hundred tokens. For the objection not to hold, the report has to measure harness's _actual_ loaded surface under a given tier, not a generic `.claude/` tree.
- Objection answered: no — left standing. Two mechanisms are still worth taking verbatim: the **always-loaded / path-scoped / invoked-only taxonomy**, and using the `/v1/messages/count_tokens` endpoint for exact counts instead of the `chars/4` heuristic in `estimateTokens()`.

### 6. Add a preventive over-build ladder (YAGNI → reuse → stdlib → native → installed dep → one-liner → minimum code) — score: 4.00

- Persona: the tech lead paying the cleanup tax on agent-generated abstractions nobody asked for
- Complexity: low
- Impact / Confidence / Effort: M/M/L — base score 4.00
- Strategy alignment: recorded, not applied — final score 4.00
- Strongest objection: Harness already critiques exactly this, and does it with more rigor — `harness:code-craft` asks "whether each abstraction earns its keep" and "whether it is as simple as it could be." Adding a prompt-layer ladder risks two skills disagreeing about the same property, with the always-loaded rule quietly winning because it fires first. Most likely failure mode: rule and craft skill give contradictory guidance on the same diff. For the objection not to hold, the distinction has to be real: `ponytail` is **preventive** (fires before code is written) and `code-craft` is **post-hoc critique**. That is a genuine gap — harness has no preventive simplicity constraint.
- Objection answered: no — left standing. Ponytail's own evidence is weak (self-measured, n=4, Haiku 4.5 only, FastAPI+React), so adopt the mechanism on its merits, not its numbers.

### 7. Adopt frontier/round-based questioning as a shared interview primitive across the guided-interview skills — score: 3.75

- Persona: the non-engineer meeting the pipeline at the intent edge — solution architects in `product-advisor`, anyone in `product-requirements`, `strategy`, or `pulse`
- Complexity: medium
- Impact / Confidence / Effort: H/M/M — base score 3.00
- Strategy alignment: +0.5 track `full-lifecycle-reach` + 0.25 references `Who it's for` (role-shaped front doors, guided interviews) — final score 3.75
- Strongest objection: Harness's interview skills deliberately ask one question at a time, and `product-requirements` says so explicitly. Batching questions into rounds trades a known-good rhythm for throughput, and the source itself concedes the design is "genuinely contested" — practitioners who read slowly or work in a second language report the sequential format is better for them. Most likely failure mode: rounds land as a wall of questions, users answer the easy ones and skip the load-bearing one, and requirements quality drops while the interview _looks_ faster. For the objection not to hold, the frontier has to be real — only mutually independent questions share a round — and one-at-a-time must remain a supported opt-out, not a regression.
- Objection answered: no — left standing. The mechanism is well specified: a design tree, a frontier of decisions whose prerequisites are settled, rounds that ask the whole frontier, and a **facts-vs-decisions split** where the skill dispatches subagents to settle facts and blocks only on human decisions. That last part is the piece harness most clearly lacks. Cited effect: ~13 questions in ~3 rounds.

### 8. Align harness's `DESIGN.md` with the Google Stitch `DESIGN.md` convention — score: 3.50

- Persona: a team adopting harness that already has a `DESIGN.md` from Stitch, impeccable, or the awesome-design-md corpus
- Complexity: medium
- Impact / Confidence / Effort: M/H/M — base score 3.00
- Strategy alignment: +0.5 track `multi-client-portability` — final score 3.50
- Strongest objection: Harness's design system is richer than the Stitch format and converging on it could be a downgrade — `design-system/DESIGN.md` is paired with `tokens.json` and a `$extensions.harness.brand.forbidden_contexts` schema that `audit-brand-compliance` reads for BRAND-T001. A plain-markdown standard has nowhere to put that. Most likely failure mode: conforming to the standard drops the machine-checkable half, which is the entire thesis. For the objection not to hold, this has to be import/export interop at the boundary, not replacing the internal format.
- Objection answered: no — left standing. Note the concrete divergence: harness puts the file at `design-system/DESIGN.md`; the Stitch convention is project root. Both `awesome-design-md` and `impeccable` standardize on the root convention, and impeccable ships `/impeccable document` to generate it.

### 9. Wire or delete `contextBudget()` — score: 3.00

- Persona: any contributor who greps for token-budget logic and finds two answers
- Complexity: low
- Impact / Confidence / Effort: L/H/L — base score 3.00
- Strategy alignment: none — final score 3.00
- Strongest objection: It is harmless dead code, and deleting an exported function is a breaking change for any adopter importing it from `@harness-engineering/core` — it appears in the package's public `.d.ts`. Most likely failure mode: a deletion breaks a downstream consumer to fix a problem nobody had. For the objection not to hold, either it gets wired into candidate 5 (which needs exactly this kind of allocator) or it goes through normal deprecation.
- Objection answered: no — left standing. Flagged because harness's own `entropy-cleaner` and dead-export detection exist to catch precisely this, and did not.

### 10. Extend the design-drift rule set with an AI-slop detector corpus — score: 2.50

- Persona: an engineer shipping UI with an agent that keeps reaching for the same generic defaults
- Complexity: medium
- Impact / Confidence / Effort: M/M/M — base score 2.00
- Strategy alignment: +0.5 track `ceiling-raising-via-llm-judgment` — final score 2.50
- Strongest objection: The detectors are the product. `impeccable` is Apache-2.0 (57.4k stars, actively pushed) so the _ideas_ are readable, but 58 detectors is a large corpus to reimplement, and taste-based rules ("AI beige", "over-rounding") are exactly the category that generates false positives and gets switched off. Harness's existing drift codes are deliberately few and mechanical. Most likely failure mode: 58 noisy rules land, the signal-to-noise ratio collapses, and the whole check gets disabled. For the objection not to hold, this needs to start as a small high-confidence subset with the same conservative confidence discipline `security-craft` already uses.
- Objection answered: no — left standing.

### 11. Add a model-routing policy that maps cheap mechanical fleet lanes to cheaper models — score: 2.50

- Persona: the tech lead authorizing a fleet run where mechanical cleanup lanes currently cost the same per token as adversarial review
- Complexity: medium
- Impact / Confidence / Effort: M/M/M — base score 2.00
- Strategy alignment: +0.5 track `multi-client-portability` (per-skill / per-cognitive-mode backend routing is already listed under it) — final score 2.50
- Strongest objection: The mechanism already exists — per-agent `model` overrides are available at the call site — so this is a policy question dressed as a feature, and policy is exactly where a wrong default is expensive. Route a lane to Haiku that actually needed Opus and the fleet produces confidently wrong work that costs more to unwind than the tokens saved. Most likely failure mode: quality regression that shows up as review findings weeks later, with no attribution back to the routing decision. For the objection not to hold, routing needs per-lane outcome measurement, which depends on candidate 1.
- Objection answered: no — left standing. Depends on candidate 1. `oh-my-claudecode`'s 30–50% claim is unsourced.

### 12. Close the skill-telemetry loop into retrieval ranking — score: 1.33

- Persona: a developer whose skill catalog has grown past the point where the right skill reliably surfaces
- Complexity: high
- Impact / Confidence / Effort: M/M/H — base score 1.33
- Strategy alignment: recorded, not applied — final score 1.33
- Strongest objection: This closes a loop that is only half-open. `catalog-retrospective` already ranks most-invoked, failing and abandoned skills, and `recommend_skills` / `advise_skills` / `search_skills` already do retrieval — so the delta is feeding outcomes into ranking weights, which is a genuinely hard ML-shaped problem with a nasty feedback pathology: skills that rank low get invoked less, so they accumulate less evidence, so they rank lower. Most likely failure mode: a rich-get-richer loop that entrenches early winners and buries good new skills. For the objection not to hold, it needs explicit exploration budget, which is most of the work.
- Objection answered: no — left standing.

## Full source coverage — all 28, with verdicts

Sources that produced no candidate above are recorded here with the reason.

### Adopt the mechanism (became candidates)

| #   | Source                                                                          | Stars  | License    | Feeds                                                                 |
| --- | ------------------------------------------------------------------------------- | ------ | ---------- | --------------------------------------------------------------------- |
| 1   | [paperclipai/paperclip](https://github.com/paperclipai/paperclip)               | 76.1k  | MIT        | Candidate 1 — budget-enforcement model; **do not adopt the platform** |
| 2   | [DeusData/codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp) | 38.3k  | MIT        | Candidate 2 — benchmark methodology (arXiv:2603.27277)                |
| 3   | [tirth8205/code-review-graph](https://github.com/tirth8205/code-review-graph)   | 29.6k  | MIT        | Candidate 2 — `docs/REPRODUCING.md`                                   |
| 4   | [openai/symphony](https://github.com/openai/symphony)                           | 26.5k  | Apache-2.0 | Candidate 3                                                           |
| 5   | [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md)   | 107.5k | MIT        | Candidate 4 — 73 `DESIGN.md` files                                    |
| 6   | [poshan0126/dotclaude](https://github.com/poshan0126/dotclaude)                 | 849    | MIT        | Candidate 5 — `/context-budget` taxonomy + `count_tokens` API         |
| 7   | [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail)           | 99.4k  | MIT        | Candidate 6 — the seven-rung ladder                                   |
| 8   | [mattpocock/skills](https://github.com/mattpocock/skills)                       | 211.2k | MIT        | Candidate 7 — `grilling` frontier/round primitive                     |
| 9   | [pbakaus/impeccable](https://impeccable.style/)                                 | 57.4k  | Apache-2.0 | Candidates 8 + 10 — 58 detectors, 23 commands, Stitch export          |
| 10  | [Yeachan-Heo/oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) | 38.5k  | MIT        | Candidate 11 — routing policy only                                    |
| 11  | [HKUDS/OpenSpace](https://github.com/HKUDS/OpenSpace)                           | 7.3k   | MIT        | Candidate 12 — outcome-conditioned retrieval, lineage                 |

### Leave — overlaps a shipped harness capability

| Source                                                                                                                  | Stars  | Why leave                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Google Conductor automated reviews](https://developers.googleblog.com/conductor-update-introducing-automated-reviews/) | n/a    | All five categories (code, plan-compliance, guideline, test-suite, security, severity-ranked) are already covered by `harness:code-review` + `check_traceability` + `run_security_scan`. Nothing published on cost or orchestration.                                                                                                                                                                                                                                                                                                                              |
| [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman)                                                       | 97.1k  | Output-only compression. Its own `docs/HONEST-NUMBERS.md` concedes the skill **adds ~1–1.5k input tokens per turn** and "on already-terse workloads they can go net-negative." The 65% is 10 single-turn chat prompts against a bare "You are a helpful assistant" baseline; the independent JetBrains figure on 86 real coding tasks is **8.5%**. Fleet sessions are input-dominated. Its `caveman-shrink` MCP tool-description compressor is the interesting half, but `tool-tiers.ts` plus Claude Code's own deferred-tool loading already cover that surface. |
| [wilpel/caveman-compression](https://github.com/wilpel/caveman-compression)                                             | 1,089  | Stale (last push 2025-12-03) and **no license metadata** despite the README claiming MIT — a real adoption risk. Superseded by the above.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents)                                             | 140.6k | 230+ agent personas. Harness has 16 purpose-built agents wired to skills and gates; persona count is not the constraint.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| [garrytan/gstack](https://github.com/garrytan/gstack)                                                                   | 127.2k | Think→Plan→Build→Review→Test→Ship→Reflect with 23 role agents — structurally the same loop harness already runs, minus the constraints-as-code layer.                                                                                                                                                                                                                                                                                                                                                                                                             |
| [VoltAgent/voltagent](https://github.com/VoltAgent/voltagent)                                                           | 10.3k  | TS agent framework + observability console. Different layer — a framework to build agents, not a harness over a codebase.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| [stephengpope/thepopebot](https://github.com/stephengpope/thepopebot)                                                   | 1.9k   | Self-hosted multi-interface agent platform. Its one portable idea — a separate cheap helper-LLM slot — is folded into candidate 11.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [HKUDS/CLI-Anything](https://github.com/HKUDS/CLI-Anything)                                                             | 46.8k  | Auto-generates agent-controllable CLIs for GUI software. Genuinely interesting, entirely orthogonal to a code harness.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| [obsidian.md](https://obsidian.md/)                                                                                     | n/a    | Local markdown vault. No first-party MCP. Relevant only as a downstream store for harness knowledge output, which is a user choice, not a harness feature.                                                                                                                                                                                                                                                                                                                                                                                                        |
| [motecloud.live](https://motecloud.live/)                                                                               | n/a    | Hosted-only graph memory ($29/mo Starter, $99/mo Pro, credits per operation), not self-hostable — a non-starter against a local-first graph. One idea worth noting: it publishes per-operation costs so agents can estimate spend before committing, which is a small complement to candidate 1.                                                                                                                                                                                                                                                                  |
| [0xNyk/awesome-hermes-agent](https://github.com/0xNyk/awesome-hermes-agent)                                             | 5.3k   | A directory, NOASSERTION license, not itself adoptable. Its three pointers could not be verified — see method limits.                                                                                                                                                                                                                                                                                                                                                                                                                                             |

### Leave — good, but not for this codebase

| Source                                                                                        | Stars | Why leave                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [emilkowalski/skills](https://github.com/emilkowalski/skills)                                 | 27.7k | High-quality animation/design-engineering judgment (easing, durations, transform-only) from Vercel/Linear experience. Real expertise, but it is guidance for building UIs, and harness is not a UI project. Worth pointing an adopter's design work at; not worth vendoring.                                                                                     |
| [alchaincyf/huashu-design](https://github.com/alchaincyf/huashu-design)                       | 22.7k | Generates prototypes, decks and motion graphics from prompts — a generation tool, and `design-craft` explicitly scopes out "code generation from scratch (use v0 / bolt.new / Lovable — different tool class)."                                                                                                                                                  |
| [yizhiyanhua-ai/fireworks-tech-graph](https://github.com/yizhiyanhua-ai/fireworks-tech-graph) | 9.8k  | Natural-language → SVG/PNG technical diagrams. Despite the name, not a knowledge graph. No overlap with the harness graph.                                                                                                                                                                                                                                       |
| [wondelai/skills](https://github.com/wondelai/skills)                                         | 1.9k  | 62 skills distilled from business/marketing/UX books, plus stateful "metaskills". The state-in-`docs/` journey pattern mirrors what harness already does with `docs/changes/<slug>`; the content is business strategy, not engineering substrate.                                                                                                                |
| [tlehman/litprog-skill](https://github.com/tlehman/litprog-skill)                             | 242   | Literate programming — weave/tangle to `.lit.md`. **No license** (adoption risk) and last pushed 2026-04-10. Its one novel mechanism is a PostToolUse hook doing reverse-sync from edited source back into the document — a different bet from harness's `detect-doc-drift`, which detects divergence rather than preventing it. Interesting, niche, unlicensed. |
| [ayghri/i-have-adhd](https://github.com/ayghri/i-have-adhd)                                   | 18.8k | Response formatting for scannability. Presentation-layer only — explicitly **not** token efficiency, despite where it sits on the list. No harness surface competes with it, and none should.                                                                                                                                                                    |

## Recommended sequence

1. **Candidate 1 first, alone.** It is the only item here that is high impact, high confidence and low effort simultaneously, it corrects a documented falsehood in a shipped skill, and candidates 11 and 5 both depend on having per-lane cost attribution to be evaluable at all.
2. **Candidates 2 and 3 in parallel** — both are low-effort, both are about what harness can credibly _claim_, and neither blocks anything.
3. **Candidate 5** once 1 has established what the real always-loaded surface costs under each MCP tier.
4. **Candidate 7** independently — it is the highest-impact item on the strategy's `full-lifecycle-reach` track and touches four existing skills.
5. Everything below score 3.50 should wait for a second pass; several will look different after 1 and 2 produce numbers.
