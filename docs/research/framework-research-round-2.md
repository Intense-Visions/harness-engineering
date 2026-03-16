# Framework Research Round 2: Competitive Landscape

**Date:** 2026-03-14
**Scope:** 7 frameworks identified but not deeply analyzed in Round 1

---

## Executive Summary

All 7 frameworks were researched. **None warrant deep-dives** — surface-level analysis extracted all useful patterns. The frameworks largely solve problems harness doesn't have (multi-agent swarm coordination, enterprise team governance, fully autonomous agents). However, **14 adoptable patterns** emerged across the group.

### Top 5 Patterns Worth Adopting

| Pattern                                       | Source               | Effort | Impact |
| --------------------------------------------- | -------------------- | ------ | ------ |
| Mechanically verifiable "done" criteria       | Cursor P/W/J         | Low    | High   |
| Checkpoint-based context handoff              | Turbo Flow, Gas Town | Low    | High   |
| Tagged learnings with retrieval               | Claude Flow          | Low    | Medium |
| Specs/ vs changes/ separation                 | OpenSpec             | Medium | Medium |
| Skill scoring (activation vs. implementation) | Tessl                | Medium | Medium |

---

## 1. Claude Flow (now Ruflo)

**Summary:** CLI-first multi-agent orchestration platform deploying 60+ specialized agents via queen/worker hierarchy with distributed consensus protocols. Targets teams wanting fully autonomous AI workflows. The maximalist end of the spectrum.

**Key Innovations:**

- Queen/Worker hierarchy with 3 queen types and 8 worker types
- Shared memory via SQLite + vector database (AgentDB + RuVector)
- ReasoningBank: stores successful reasoning patterns, replays on similar tasks (~32% token reduction)
- Agent Booster: WASM layer bypasses LLM for deterministic transforms (<1ms vs 2-5s)
- Five consensus protocols for distributed coordination (Raft, BFT, Gossip, CRDT, custom)

**Adoptable Patterns:**

1. **Tagged learnings with retrieval.** Change learnings format from plain markdown to tagged entries: `- **2026-03-14 [skill:test-generation] [outcome:success]:** Learned that...`. Add a `loadRelevantLearnings(skillName)` function that filters by tag.

2. **Skip AI for deterministic transforms.** Flag certain skill operations as "deterministic" (scaffolding from templates, adding standard imports) and execute as plain code rather than prompting Claude.

3. **Session continuity via enriched lastSession.** Extend state to include `lastSkill`, `outcome`, and `pendingTasks` so the next session can offer continuity.

**Skip:** Distributed consensus, 60+ agent swarms, vector database, SONA neural router, multi-LLM provider failover. All violate lean/self-contained principles.

**Verdict:** Surface-level sufficient. Philosophies diverge too sharply. Patterns extracted.

**Sources:** [Analytics Vidhya](https://www.analyticsvidhya.com/blog/2026/03/claude-flow/), [GitHub: ruvnet/ruflo](https://github.com/ruvnet/ruflo), [Claude Flow docs](https://claude-flow.ruv.io/)

---

## 2. Gas Town (Steve Yegge)

**Summary:** Go-based multi-agent orchestration (~189K LOC) enabling a single developer to coordinate 20-30 parallel Claude Code agents. Uses Git-backed persistent state and a role hierarchy. Targets advanced practitioners ("Stage 7-8 developers") comfortable running 10+ agents at $2K-5K/month API cost.

**Key Innovations:**

- Beads as atomic work units stored in JSONL within Git
- MEOW workflow stack: Formulas → Protomolecules → Molecules → Beads → Epics
- Hook-based crash recovery — agents resume from last checkpoint on respawn
- 7 specialized roles across 2 scopes (town-level and rig-level)
- GUPP scheduling: "any agent with work on its hook MUST run it" — self-healing without a central scheduler

**Adoptable Patterns:**

1. **Git-backed work state persistence.** Store `.harness/workstate.json` tracking current task, decisions, and next steps. On agent restart, load as context.

2. **Hook-based resumption.** When a session ends mid-task, write a `.harness/resume.md`. Next session's prompt includes "check for resume file first."

3. **Role separation even for single agents.** Formalize 2-3 modes: architect mode (plan, no code), builder mode (implement from spec), reviewer mode (audit, no new code). Switch via prompt, not infrastructure.

4. **Structured work decomposition.** Before multi-file changes, require the agent to produce an ordered task breakdown with dependencies noted — the Molecule concept as a markdown checklist.

**Skip:** Full role taxonomy (7 roles), MEOW workflow stack, Dolt dependency, $2K-5K/month cost model, autonomous background daemons (Deacon "spree-killing workers"), convoy/mailbox inter-agent communication.

**Verdict:** Surface-level sufficient. Core insight (persistent state, agent ephemerality) is valuable and partially reflected in harness already. The 189K lines of Go contain nothing that can't be extracted conceptually.

**Sources:** [GitHub: steveyegge/gastown](https://github.com/steveyegge/gastown), [Steve Yegge: Welcome to Gas Town](https://steve-yegge.medium.com/welcome-to-gas-town-4f25ee16dd04), [Torq Reading List](https://reading.torqsoftware.com/notes/software/ai-ml/agentic-coding/2026-01-15-gas-town-multi-agent-orchestration-framework/)

---

## 3. Turbo Flow

**Summary:** Advanced agentic dev environment (v4.0, built on Ruflo v3.5) orchestrating 600+ specialized AI subagents using the SPARC methodology. Targets teams wanting fully automated, multi-agent development pipelines from specification through deployment.

**Key Innovations:**

- SPARC phased workflow: Specification → Pseudocode → Architecture → Refinement (TDD) → Completion
- Asynchronous coordination via shared, versioned memory bank (JSONL/markdown)
- Checkpoint-based handoffs: agents commit "context packages" at phase boundaries
- Status-driven workflow markers (COMPLETE, IN_PROGRESS, BLOCKED)
- Consolidation: v4.0 reduced plugins from 15 to 6, eliminated 75% of core dependencies

**Adoptable Patterns:**

1. **Phase-gated agent dispatch.** Don't let agents code before specs exist. A task cannot enter "implementation" until a spec file exists and passes schema check.

2. **Checkpoint-based context handoff.** At phase boundaries, write a structured file capturing what was done, what was discovered, what's blocked, and test results. Next phase reads this instead of re-analyzing.

3. **Documented anti-patterns / failure log.** Maintain an `anti-patterns.md` or "do not retry" section. When an agent hits a dead end, it appends. Subsequent agents read before starting.

**Skip:** The 600+ agent swarm, Ruflo orchestration layer (AgentDB, RuVector WASM, 215+ MCP tools), memory bank infrastructure (versioned JSONL with checksums, RBAC), real-time UI layer, SPARC Pseudocode phase (ceremony), cloud-hosted dev environment lock-in.

**Verdict:** Surface-level sufficient. Maximalist system, antithesis of lean. Three adoptable patterns (phase gates, checkpoint handoffs, failure logs) can each be implemented as simple file conventions.

**Sources:** [GitHub: marcuspat/turbo-flow](https://github.com/marcuspat/turbo-flow), [SPARC Methodology Wiki](https://github.com/ruvnet/ruflo/wiki/SPARC-Methodology)

---

## 4. Devika

**Summary:** Open-source "agentic AI software engineer" (Python, ~19.5K GitHub stars) that takes a high-level objective, autonomously plans, researches the web, writes code, and deploys. Built as an open-source alternative to Cognition AI's Devin. Early-stage, superseded by commercial successor "Opcode."

**Key Innovations:**

- 9+ specialized sub-agents in a pipeline (Planner, Researcher, Formatter, Coder, Action, Runner, Feature, Patcher, Reporter)
- Internal monologue as state — human-readable "thought" at each step, persisted and streamed
- Contextual keyword accumulation via SentenceBERT sharpening subsequent prompts
- Action routing: classifies follow-up messages into 6 categories (run, deploy, feature, bug, report, answer)
- Researcher ask-user loop: pauses execution to request clarification

**Adoptable Patterns:**

1. **Internal monologue as transparency layer.** Optional `--explain` mode capturing one-sentence reasoning at each phase gate, written to `.harness/trace.md`.

2. **Contextual keyword accumulation.** Extract 5-10 focus keywords from each phase output, inject as `context_focus` into the next phase's prompt. Keeps AI anchored without full-document repetition.

**Skip:** Full autonomous paradigm (no guardrails, no rollback, no constraint system), web browsing/Playwright infrastructure, SQLite + web UI, multi-LLM provider abstraction, SentenceBERT dependency. Project winding down in favor of Opcode.

**Verdict:** Surface-level sufficient. Fundamentally different paradigm. Two lightweight conceptual patterns extracted. No further action needed.

**Sources:** [GitHub: stitionai/devika](https://github.com/stitionai/devika), [Devika ARCHITECTURE.md](https://github.com/stitionai/devika/blob/main/ARCHITECTURE.md)

---

## 5. Tessl

**Summary:** Agent enablement platform functioning as a package manager for AI coding agent "skills" and context — npm for agent instructions. Founded by Guy Podjarny (ex-Snyk), targets enterprise teams using multiple AI tools who need consistency and governance. Registry indexes 3,000+ skills covering 10,000+ packages.

**Key Innovations:**

- Skills as versioned, distributable packages decoupled from any single AI tool
- Evaluation-driven quality loop with measurable multipliers (e.g., 47% → 96% with terraform skill)
- Automated skill optimization via `--optimize` (review-then-rewrite cycle)
- CDLC maturity model: Manual → Repeatable → Automated → Self-improving
- CI/CD-native eval architecture with error budgets for LLM non-determinism

**Adoptable Patterns:**

1. **Skill scoring with activation vs. implementation dimensions.** Separate "when should this fire?" from "how good is the content?" when evaluating rules/principles.

2. **Error budgets for non-deterministic enforcement.** Use threshold-based scoring (e.g., "agent followed the rule in 4/5 runs") rather than single-pass assertions.

3. **Context drift detection.** Periodic CI job re-running canary tasks against current rules to verify they still produce expected behavior, independent of code changes.

4. **CDLC maturity model as adoption roadmap.** Frame harness features along the Manual → Repeatable → Automated → Self-improving progression.

**Skip:** Registry/marketplace model, agent-agnostic abstraction layer, organizational role progression ("context teams"), probabilistic eval infrastructure, optimization-by-rewrite loop.

**Verdict:** Surface-level sufficient. Platform business solving a different problem (multi-tool enterprise governance). Conceptual takeaways (scoring, error budgets, drift detection) are useful as mental models, not features to build.

**Sources:** [tessl.io](https://tessl.io/), [Tessl spec-driven-development-tile](https://github.com/tesslio/spec-driven-development-tile)

---

## 6. Cursor's Planner/Worker/Judge Model

**Summary:** Hierarchical multi-agent architecture developed for Cursor's autonomous coding at extreme scale (1,000 commits/hour, 1M+ LOC). Planners decompose recursively, Workers execute in isolated git worktrees with zero inter-worker communication, and Judges evaluate quality. Evolved through multiple failed approaches (lock-based, optimistic concurrency).

**Key Innovations:**

- Recursive planning with ownership boundaries — planners never code, only decompose and delegate
- Workers operate on isolated repo copies (git worktrees) with no coordination
- Judge role evolved twice: removed from autonomous workflows (agents self-complete), then re-added for parallel-solution comparison in Cursor 2.2
- "Done" = mechanically verifiable (tests pass, linter clean, type-check passes)
- Failure-tolerant design: accepts "moments of turbulence," lets system converge naturally

**Adoptable Patterns:**

1. **Mechanically verifiable "done" criteria.** Verification step runs tests, lint, type-check, build. Binary pass/fail. No subjective quality assessment. This is the Judge role stripped to its essential function.

2. **Structured handoff documents.** Workers produce: what was done, concerns, deviations, findings. Creates audit trail for next step.

3. **Concrete quantification in task decomposition.** "Generate 20-100 tasks" outperforms "generate many tasks." One-line prompt engineering change with outsized impact.

4. **Specification quality as force multiplier.** Poor specs create massive waste. Explicitly stating dependency philosophy, forbidden libraries, and architectural constraints dramatically improves convergence. Validates the "human architects + AI executes" philosophy.

**Skip:** Full Planner/Sub-planner recursive hierarchy (only needed at 100+ agent scale), multi-agent judging (brute-force compute for quality), failure-tolerant convergence (accepting error rates for self-healing).

**Verdict:** Surface-level sufficient. The valuable insight is clear: mechanical verification > LLM-based judging. Cursor's own experience confirms a separate Judge agent is overkill for single-execution workflows.

**Sources:** [Cursor: Scaling Long-Running Autonomous Coding](https://cursor.com/blog/scaling-agents), [Cursor: Self-Driving Codebases](https://cursor.com/blog/self-driving-codebases), [Cursor: Agent Best Practices](https://cursor.com/blog/agent-best-practices), [Mike Mason: AI Coding Agents](https://mikemason.ca/writing/ai-coding-agents-jan-2026/)

---

## 7. OpenSpec

**Summary:** Lightweight open-source spec-driven development framework by Fission-AI (YC-backed, 30.6K GitHub stars). Adds a persistent specification layer to codebases for AI coding assistants, optimized for brownfield change management. Differentiates from Spec Kit with delta-spec format and persistent spec libraries.

**Key Innovations:**

- Delta specs with ADDED/MODIFIED/REMOVED semantics using Gherkin-style scenarios
- Two-directory architecture: `specs/` (source of truth) vs `changes/` (proposals)
- Retrofitting mode: AI reverse-engineers undocumented legacy code into baseline specs
- Load-on-demand context: agents read only project.md + relevant spec + tasks (not full codebase)
- Agent-agnostic slash commands working with 30+ AI tools via adapters

**Adoptable Patterns:**

1. **Specs/ vs changes/ separation.** Maintain living documentation of implemented capabilities. Change proposals live in scoped folders with deltas against existing specs. Prevents spec rot.

2. **Delta-spec format.** Express requirements as diffs against existing behavior (ADDED/MODIFIED/REMOVED). Forces clarity about what's changing vs. what's new.

3. **Retrofitting / spec-from-code generation.** A skill that reads existing code and generates baseline specs before refactoring. Lowers adoption barrier for existing projects.

4. **Load-on-demand context budgeting.** Make explicit which files an agent should read per phase rather than dumping entire project context.

**Skip:** Node.js CLI with npm global install (runtime dependency), 30+ adapter system (maintenance burden), slash command orchestration (ties to tool's command system), changeset/versioning system (git handles this).

**Verdict:** Surface-level sufficient. Two genuinely novel ideas (specs/changes separation, delta-spec format) are adoptable as lightweight conventions. Retrofitting is interesting but niche.

**Sources:** [GitHub: Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec), [openspec.dev](https://openspec.dev/), [YC Launch](https://www.ycombinator.com/launches/Pdc-openspec-the-spec-framework-for-coding-agents)

---

## Cross-Framework Analysis

### Common Themes

1. **Persistent state outlives agent sessions.** Every framework (Gas Town, Claude Flow, Turbo Flow, Devika) independently converges on this. Agent context must survive crashes and session boundaries. Harness already has `.harness/state.json` — this validates the approach.

2. **Mechanical verification > LLM-based judging.** Cursor explicitly removed their LLM Judge because mechanical checks (tests, lint, types) were more reliable. Turbo Flow uses status markers. Tessl uses eval error budgets. The consensus: binary pass/fail from real tools beats subjective AI assessment.

3. **Phase gates prevent waste.** Turbo Flow (SPARC), Gas Town (MEOW), and Cursor (Planner/Worker) all enforce "don't code until the spec/plan exists." This is the single most impactful pattern across the research.

4. **Structured handoffs between phases.** Every multi-agent framework (Turbo Flow, Gas Town, Cursor) converges on structured context packages at boundaries rather than raw output passing.

5. **The 20-600 agent swarm is a dead end for lean toolkits.** Claude Flow, Gas Town, and Turbo Flow all solve coordination problems that don't exist at single-agent scale. The infrastructure they require (databases, consensus protocols, role hierarchies) contradicts self-contained toolkit philosophy.

### What Harness Already Does Better

- **Mechanical enforcement** via linters and layer checks — no other framework has this
- **Human-architect model** — validated by Cursor's finding that spec quality is the #1 force multiplier
- **Lean footprint** — 21 skills, 2 files each vs. BMAD's 655 files or Gas Town's 189K LOC
- **Self-contained** — no databases, no cloud dependencies, no runtime requirements

### Consolidated Adoptable Patterns (Priority Order)

**High priority (low effort, high impact):**

1. Mechanical "done" criteria in verification (Cursor) — run tests/lint/types as binary gate
2. Checkpoint-based context handoff (Turbo Flow, Gas Town) — structured file at phase boundaries
3. Phase gates (Turbo Flow, Cursor) — don't enter implementation without spec validation
4. Failure/anti-pattern log (Turbo Flow) — append-only "do not retry" file

**Medium priority (medium effort, medium impact):** 5. Tagged learnings with retrieval (Claude Flow) — filter learnings by skill/outcome 6. Specs vs changes separation (OpenSpec) — source of truth vs. proposals 7. Structured handoff documents (Cursor, Gas Town) — what was done, concerns, deviations 8. Session continuity (Claude Flow, Gas Town) — enriched lastSession with lastSkill + pendingTasks

**Low priority (conceptual, no immediate action):** 9. Delta-spec format (OpenSpec) — ADDED/MODIFIED/REMOVED semantics 10. Skill scoring dimensions (Tessl) — activation vs. implementation evaluation 11. Internal monologue trace (Devika) — optional reasoning transparency 12. Context keyword accumulation (Devika) — focus keywords across phases 13. Error budgets for eval (Tessl) — threshold-based rather than binary 14. CDLC maturity model (Tessl) — adoption roadmap framing
