# Strategy Interview Reference

The first-run interview (and the per-section update flow) converts vague intent ("we want to be the best at X") into a small, concrete `STRATEGY.md`. This document is the rule book the skill quotes when pushing back on input.

The interview is heuristic — the agent reading SKILL.md applies the rules. Nothing in `packages/core` parses the user's natural-language answers. The fixture-driven contract test in `agents/skills/tests/harness-strategy.test.ts` asserts the rule _names_ and the presence of repair-script keywords; rewording surrounding prose is free.

## Pushback Rules

Three rules, each cited verbatim in the skill output when it fires (so the user sees _why_ the answer was rejected, not just _that_ it was). **Each rule fires AT MOST TWICE per section. After the second pushback, capture what the user offered, flag the section, and move on.** The cap is the disable mechanism — there is no flag, no override, no "I know what I'm doing" path. The cap protects users from infinite loops, not from feedback. Round 1 MUST always fire when a rule matches.

### Rule 1: Fluff detection

**What it catches:** Empty modifiers and mission-statement vocabulary that look like answers but state nothing concrete.

| Detection signal                                                              | Example trigger                                     |
| ----------------------------------------------------------------------------- | --------------------------------------------------- |
| Empty modifiers: "best", "leading", "world-class", "best-in-class", "premier" | _"We want to be the best at developer experience."_ |
| Mission-statement verbs: "delight", "empower", "transform", "revolutionize"   | _"Empower engineers to build amazing things."_      |
| Answers ≤ 5 words with no domain-specific noun                                | _"Deliver value."_ / _"Win the market."_            |
| Adjective-only diagnoses: "broken", "bad", "slow" without an object           | _"It's slow."_ / _"It's hard."_                     |

**Repair script:**

> Replace `<phrase>` with a concrete diagnosis: _what is broken_, _for whom_, _that we can verify_. "We want to be the best at X" is not a diagnosis — it's an aspiration. Try the next layer down: which _specific_ failure mode are we trying to remove from the world?

### Rule 2: Goal-as-strategy

**What it catches:** Targets, KPIs, and fiscal-year aspirations dressed up as strategy. A goal is a destination; strategy is the bet you're making about how to get there.

| Detection signal                                                         | Example trigger                                          |
| ------------------------------------------------------------------------ | -------------------------------------------------------- |
| Numeric targets without an underlying bet                                | _"Grow revenue by 20% this year."_ / _"Get to 10k DAU."_ |
| Fiscal-year or quarter phrasing under `Target problem` or `Our approach` | _"By Q4 we'll have shipped the new platform."_           |
| KPI-shape strings: "increase X by Y%", "reduce X to Z"                   | _"Reduce churn to under 5%."_                            |
| Sentences that name a metric value but not a mechanism                   | _"Hit 99.9% uptime."_                                    |

**Repair script:**

> That's a goal. What is the **bet** — the choice you're making about _how_ to produce it — that goes underneath? Strategy is the coherent action that, if it works, produces the goal. "Grow revenue 20%" is the destination; _how_ you'll do it (which segment, which channel, which product wedge) is the strategy.

### Rule 3: Feature-list-as-strategy

**What it catches:** Roadmap-style enumerations of components dressed up as strategy. Feature lists don't survive contact with reality; the coherent action underneath does.

| Detection signal                                                              | Example trigger                                       |
| ----------------------------------------------------------------------------- | ----------------------------------------------------- |
| Multi-item lists (≥3 bullets) of feature/component names under `Our approach` | _"- Dashboard, - Notifications, - Mobile app, - SSO"_ |
| Noun-heavy lists with no verbs describing the coherent action                 | _"- AI agents - Knowledge graph - Skill registry"_    |
| Track names that are feature names (e.g., `- Dashboard:`, `- Mobile:`)        | _"- Dashboard: ship the new dashboard"_               |
| `Our approach` answered as a roadmap rather than a thesis                     | _"First we'll do X, then Y, then Z."_                 |

**Repair script:**

> Feature lists don't survive contact with reality. What's the **coherent action** these features are instances of? The features are downstream of the bet. State the bet, then the features become consequences ("we're betting on agent-orchestrated workflows, so dashboard/SSO/mobile fall out of that"), not the strategy itself.

## The 2-Round Cap

For every section, each rule fires at most twice:

1. **Round 1** — Rule matches → cite the rule, quote the failing answer, offer the repair script. Wait for revised answer.
2. **Round 2** — Rule matches the revised answer → cite the rule a second time, quote the repair script. Wait for the user's third attempt.
3. **Cap reached** — Capture whatever the user offered on attempt 3. Emit a section flag in the doc summary:

   > ⚠ <section name>: flagged for revisit — pushback cap reached without <concrete diagnosis | underlying bet | coherent action>.

The flag is informational. It does NOT block the write — STRATEGY.md is the user's commitment, not the skill's gate. The flag lives in the _summary_ shown to the user, not in the on-disk file (the schema rejects unknown content).

If the user explicitly says round 1's pushback is wrong (e.g., _"no, that IS the diagnosis — we really mean it this way"_), capture the answer verbatim after round 1. Do NOT push back twice if the user explicitly disagrees with round 1. This is not a third path around the cap; it's recognition that pushback is an offer, not a gate.

## Separation from `docs/roadmap.md`

The interview MUST refuse to capture tactical phase tracking (phase numbers, blockers, assignees, external IDs) under any section. That belongs in `docs/roadmap.md`. The two artifacts have different lifecycles:

| Artifact          | Cadence            | Owner            | Content                                            |
| ----------------- | ------------------ | ---------------- | -------------------------------------------------- |
| `STRATEGY.md`     | Quarterly-ish      | Product / lead   | Target problem, approach, persona, metrics, tracks |
| `docs/roadmap.md` | Per-phase / weekly | Eng orchestrator | Phase status, blockers, assignees, external-IDs    |

If the user asks "where do I track that we're blocked on X" or "where do I record the assignee for phase 4" → answer: `docs/roadmap.md`, not `STRATEGY.md`. The separation is Decision 1 of the strategic-anchor proposal.

## Section-by-section interview prompts

Phase 1 walks the sections in template order. Each prompt is a single focused question; the rules above govern the response loop.

| Section              | Opening prompt                                                                                                                                                   | Rules to apply                                                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Target problem       | _"In 2-4 sentences: what is specifically broken in the world that this product addresses? Not the goal — the diagnosis."_                                        | Fluff, Goal-as-strategy                                                                                                                          |
| Our approach         | _"What is your distinctive bet on how to solve the target problem? The choice you're making about HOW, not WHAT you're building."_                               | Fluff, Goal-as-strategy, Feature-list                                                                                                            |
| Who it's for         | _"Specific persona — who is the person, what context are they in, what alternatives are they currently using? 'Developers' is not a specific persona."_          | Fluff                                                                                                                                            |
| Key metrics          | _"What 1-5 metrics, measured where, would tell you the bet is paying off? Each metric is a bullet line: `- <name>: <how measured, where it lives>`."_            | Fluff (per bullet)                                                                                                                               |
| Tracks               | _"What 1-5 tracks of work are you currently investing in to advance the bet? Each track is a bullet line: `- <track name>: <one-sentence current investment>`."_ | Feature-list (per bullet)                                                                                                                        |
| Milestones (opt)     | _"What 2-3 dated milestones would mark visible progress on the tracks? Skip if none yet."_                                                                       | Goal-as-strategy (milestones SHOULD be dated targets — accept them here even though Rule 2 rejects them under `Target problem` / `Our approach`) |
| Not working on (opt) | _"What did you deliberately decide NOT to invest in this cycle? Explicit non-goals reduce future drift."_                                                        | Fluff                                                                                                                                            |
| Marketing (opt)      | _"What 1-3 sentences describe how you'd pitch this to the persona? Often this is downstream of `Target problem` + `Our approach`."_                              | Fluff                                                                                                                                            |

## Anti-pattern fixtures (referenced by the contract test)

The skill's contract test (`agents/skills/tests/harness-strategy.test.ts`) asserts the rule names and key repair-script phrases appear in this file. The fixtures below are the canonical anti-patterns each rule must catch.

### Fluff detection fixture

> **User answer (Target problem):** _"We want to be the best at developer experience."_
>
> **Skill response:** "**Fluff detection** fired. `be the best at` is empty-modifier vocabulary — it states an aspiration, not a diagnosis. Try the next layer down: which _specific_ failure mode in developer experience are we trying to remove from the world?"

### Goal-as-strategy fixture

> **User answer (Our approach):** _"Grow revenue 20% this year and reduce churn to under 5%."_
>
> **Skill response:** "**Goal-as-strategy** fired. Those are goals, not approach. What is the **bet** — the choice you're making about _how_ to produce them — that goes underneath?"

### Feature-list-as-strategy fixture

> **User answer (Our approach):** _"- Ship the new dashboard. - Add notifications. - Build the mobile app. - Wire up SSO."_
>
> **Skill response:** "**Feature-list-as-strategy** fired. Feature lists don't survive contact with reality. What's the **coherent action** these features are instances of? The features are downstream of the bet."

## Update-flow guidance

Phase 2 of the skill re-interviews ONE user-selected section at a time. The same three rules apply. **Re-running a section does not exempt it from pushback** — "no rubber-stamping" is the proposal Decision 4 phrasing.

When the user revisits a section and the new answer also triggers a rule, the 2-round cap still applies — counted _within that revisit_, not cumulatively across all-time runs.
