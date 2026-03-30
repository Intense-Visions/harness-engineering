# Final Ranked List: All Findings (Skepticism-Adjusted)

**Date:** 2026-03-30
**Scoring:** Impact (1-5) × Ease (1-5) × Alignment (1-5), adjusted by skeptical analysis
**Total findings:** 43 → 37 survived (6 demoted to "Don't Do")

---

## DO: Survived Skeptical Review (37 findings)

### Batch 1: Prose-Only Upgrades (8 items, ~1-2 days)

Zero-code changes to existing SKILL.md files. Highest ROI possible.

| #   | ID  | Finding                            | Adj Score | What To Do                                                                                                                                                                                                |
| --- | --- | ---------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A4  | Rationalizations to Reject         | 125       | Add `## Rationalizations to Reject` with excuse→rebuttal tables to: harness-security-review, harness-security-scan, harness-tdd, harness-verification, harness-code-review, harness-architecture-enforcer |
| 2   | C1  | Iron Laws + Red Flags (prose only) | 100       | Add `## Iron Law` and `## Red Flags` sections to discipline-enforcing skills. Skip the YAML schema change — no programmatic consumer yet                                                                  |
| 3   | C13 | Review-never-fixes                 | 100       | Add explicit constraint to reviewer persona and code-review SKILL.md: "Output findings only. Never auto-fix. Recommend switching to execution mode for remediation."                                      |
| 4   | C14 | Read-only research phase           | 100       | Add "no solutions during research" constraint to architecture-advisor and planning skills                                                                                                                 |
| 5   | C10 | TDD for skill authoring            | 100       | Add RED-GREEN-REFACTOR methodology to harness-skill-authoring: observe failure → write skill → observe evasions → iterate                                                                                 |
| 6   | C8  | Rubric compression                 | 100       | Convert verbose review rubrics to dense format: "Criterion (weight: N) — Description. 1=Missing, 5=Excellent"                                                                                             |
| 7   | C11 | Uncertainty surfacing              | 64        | Add step to planning skill: planner must list unknowns/assumptions with 2-4 resolution options before proceeding                                                                                          |
| 8   | B9  | Comment replacement guard          | 60        | Add to code-review checklist: "Check for placeholder comments replacing real code (// rest of implementation, // ... existing code)"                                                                      |

---

### Batch 2: Quick Hooks & Config (4 items, ~1 day)

Immediate security and DX wins via hook installation and documentation.

| #   | ID  | Finding                     | Adj Score | What To Do                                                                                                                                                                                |
| --- | --- | --------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 9   | A1  | Parry prompt injection hook | 90        | Document parry-guard installation in getting-started guide for orchestrator users. Add to recommended-hooks section in templates. Scope: orchestrator use cases processing external input |
| 10  | B5  | Desktop notifications       | 60        | Add `node-notifier` hook example to templates for autopilot/orchestrator Stop events                                                                                                      |
| 11  | B7  | Git stash auto-checkpoint   | 55        | Add opt-in checkpoint hook example: `git stash create` + `git stash store` on Stop, max 10 with cleanup                                                                                   |
| 12  | A9  | Session taint (softened)    | 50        | Document taint concept for orchestrator security, but with auto-expire after 30 minutes + alert, not permanent block                                                                      |

---

### Batch 3: Context Efficiency (6 items, ~2-3 days)

Reduce token waste and give users control over cost/quality tradeoff.

| #   | ID  | Finding                       | Adj Score | What To Do                                                                                                                                          |
| --- | --- | ----------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 13  | C7  | --fast/--thorough flags       | 80        | Add flags to autopilot, planning, code-review: --fast skips optional phases, --thorough adds meta-judge and deep review                             |
| 14  | C2  | Scratchpad delegation         | 75        | In autopilot: instruct planning/verification agents to write analysis to `.harness/scratchpad/`. Orchestrator reads structured verdict headers only |
| 15  | C6  | Learnings in code review      | 70        | Call `loadBudgetedLearnings` in code-review pipeline with intent from changed files. Only surface entries with >0.7 relevance score                 |
| 16  | D6  | Confidence-first gating       | 64        | Add self-assessment step to planning: >90% confidence → proceed, 70-89% → present alternatives, <70% → ask questions                                |
| 17  | C4  | Commands-over-skills audit    | 64        | Audit which of 79 skills auto-load descriptions into context. Move rarely-used skills to on-demand loading                                          |
| 18  | C12 | Incremental milestone commits | 64        | Add mid-phase commit points to autopilot execution loop at task boundaries, not just phase boundaries                                               |

---

### Batch 4: Security Depth (5 items, ~1-2 weeks)

New security skills and scanner enhancements from Trail of Bits patterns.

| #   | ID  | Finding                                   | Adj Score | What To Do                                                                                                                                                                                        |
| --- | --- | ----------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 19  | A3  | FP verification (simplified)              | 60        | Start simple: require justification comment for any `harness-ignore` suppression. Build full fp-verify skill later if suppression volume warrants it                                              |
| 20  | A6  | Insecure defaults detection               | 65        | Add fail-open detection to SecurityScanner: trace whether missing env vars/config keys degrade to weak defaults. Conditional — most valuable for projects without schema validation               |
| 21  | A5  | Supply-chain risk auditor                 | 55        | New skill `harness:supply-chain-audit`. Present findings as "flags for human review" not verdicts. Cover: single maintainer, unmaintained, low popularity, dangerous install scripts, CVE history |
| 22  | A7  | Sharp-edges / API footgun detection       | 50        | Narrow scope: known dangerous patterns only (deprecated crypto, unsafe deserialization, TOCTOU). Add as check categories to security-review, not a separate skill                                 |
| 23  | A8  | AST command safety knowledge (study only) | 40        | Study Dippy's 130 handler modules for domain knowledge (which git/docker/kubectl subcommands are safe). Don't port the parser — use for orchestrator approval logic documentation                 |

---

### Batch 5: DX Infrastructure (6 items, ~2-3 weeks)

CLI commands, config validation, and tooling.

| #   | ID  | Finding                             | Adj Score | What To Do                                                                                                                                                                                                                        |
| --- | --- | ----------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 24  | B1  | `harness usage` CLI                 | 64        | Extend TokenUsage type. Read `~/.claude/projects/**/*.jsonl`. Commands: daily, session, current. Fetch pricing from LiteLLM with static fallback. Focus on orchestrator/team aggregation                                          |
| 25  | B2  | Agent config linting (agnix hybrid) | 60        | `harness validate --agent-configs` shells out to agnix when present. Port ~20 highest-value rules as fallback: CC-AG-_ (broken agents), CC-HK-_ (invalid hooks), CC-SK-011 (unreachable skills), CC-MEM-009 (oversized CLAUDE.md) |
| 26  | D1  | Tiered MCP tool loading             | 55        | Measure token cost of 46 tool descriptions first. If >5% of context, implement core/standard/full tiers via env var. If <5%, skip                                                                                                 |
| 27  | B3  | Hook scaffolding with presets       | 40        | `harness generate hooks` with opinionated presets only: --preset tdd, --preset security, --preset checkpoint. Skip generic templates — they add no value                                                                          |
| 28  | B4  | TDD Guard hook integration          | 48        | Enhance harness:tdd with optional hook-based guard mode. Use `@ast-grep/napi` for test counting. Deliver as `harness generate hooks --preset tdd`                                                                                 |
| 29  | B8  | Codebase map auto-injection         | 36        | Enhance `gather_context` with optional structural overview. Auto-generate at session start for orchestrator agents                                                                                                                |

---

### Batch 6: Architectural Bets (8 items, ~1-2 months)

Larger investments that differentiate harness.

| #   | ID  | Finding                            | Adj Score | What To Do                                                                                                                                                      |
| --- | --- | ---------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 30  | A2  | Container sandboxing               | 55        | Start with Docker `--read-only` + `--user` flags for simple sandboxing. Evaluate Container Use MCP client as upgrade path only if simple Docker is insufficient |
| 31  | C5  | Structured learnings (cherry-pick) | 40        | Add optional `root_cause` and `tried_and_failed` fields to learnings. Add semantic overlap check to `appendLearning`. Skip the 3-agent capture pipeline         |
| 32  | C3  | Meta-judge pre-generation          | 40        | Add to `--thorough` review mode only: dispatch rubric-generation agent in parallel with implementation, use pre-generated rubric for evaluation                 |
| 33  | C9  | Two-stage isolated review          | 40        | Add to `--thorough` mode: split into spec-compliance reviewer + code-quality reviewer with separate context. Not default                                        |
| 34  | D4  | findParallelGroups algorithm       | 48        | Enhance `check_task_independence` with topological sort + parallel group detection from dependency metadata                                                     |
| 35  | B6  | Full-text session search           | 36        | `harness sessions search` with SQLite FTS5. Index: phase, persona, skill, plan_id, content. CLI + optional TUI                                                  |
| 36  | D9  | Triage routing before dispatch     | 36        | Add triage step to orchestrator: classify issue complexity/domain before selecting agent persona                                                                |
| 37  | D10 | Unified file guard (.agentignore)  | 36        | Merge .agentignore, .aiignore, .cursorignore patterns in harness workspace management                                                                           |

---

## DON'T DO: Demoted by Skeptical Review (6 findings)

| ID        | Finding                              | Original Score | Why Not                                                                                                      |
| --------- | ------------------------------------ | -------------- | ------------------------------------------------------------------------------------------------------------ |
| C5 (full) | Full 3-agent lesson capture pipeline | 40             | 200x more expensive per lesson than `appendLearning()`. Cherry-pick fields instead (moved to Batch 6 as #31) |
| D2        | 4-tier spec hierarchy                | 24             | Complexity cost exceeds benefit. Steal bidirectional `[[linking]]` syntax only if needed later               |
| D3        | JSONL+SQLite dual storage            | 18             | Over-engineering for current scale. Revisit if query performance becomes a bottleneck                        |
| D7        | Deep multi-hop research pipeline     | 18             | Unreliable web search conflicts with harness's mechanical, grounded identity                                 |
| B10       | Rulesync multi-platform              | 36             | Premature unless platform expansion is a strategic priority. Harness is Claude Code-first                    |
| D5        | Token efficiency symbol tables       | 45             | Reduces readability for humans. Only applicable to agent-to-agent comms where no human reads output          |

---

## Timeline View

```
Week 1:      Batch 1 (prose) + Batch 2 (hooks)         — 12 items
Week 2-3:    Batch 3 (context efficiency)               —  6 items
Week 3-5:    Batch 4 (security depth)                   —  5 items
Week 5-8:    Batch 5 (DX infrastructure)                —  6 items
Month 2-3:   Batch 6 (architectural bets)               —  8 items
                                                  Total: 37 items
```

## Sources Referenced

| Source                  | Findings Contributed        | Highest-Value Finding                     |
| ----------------------- | --------------------------- | ----------------------------------------- |
| Trail of Bits skills    | A3, A4, A5, A6, A7 (5)      | A4: Rationalizations to Reject (125)      |
| Superpowers             | C1, C9, C10 (3)             | C1: Rationalization defense (100)         |
| parry                   | A1, A9 (2)                  | A1: Prompt injection hook (90)            |
| Context Engineering Kit | C2, C3, C4, C7, C8 (5)      | C8: Rubric compression (100)              |
| Compound Engineering    | C5, C6 (2)                  | C6: Learnings in code review (70)         |
| claudekit               | B7, B8, B9, D8, D9, D10 (6) | B9: Comment replacement detection (60)    |
| RIPER                   | C13, C14 (2)                | C13: Review-never-fixes (100)             |
| ContextKit              | C11, C12 (2)                | C11: Uncertainty surfacing (64)           |
| ccflare/ccusage         | B1 (1)                      | B1: Usage CLI (64)                        |
| agnix                   | B2 (1)                      | B2: Agent config linting (60)             |
| Container Use           | A2 (1)                      | A2: Container sandboxing (55)             |
| Dippy                   | A8 (1)                      | A8: Command safety knowledge (40)         |
| CC Notify               | B5 (1)                      | B5: Desktop notifications (60)            |
| claude-hooks            | B3 (1)                      | B3: Hook scaffolding (40)                 |
| TDD Guard               | B4 (1)                      | B4: TDD enforcement (48)                  |
| Claude Task Master      | D1 (1)                      | D1: Tiered MCP tools (55)                 |
| sudocode                | D4 (2)                      | D4: findParallelGroups (48)               |
| SuperClaude             | D5, D6 (2)                  | D6: Confidence gating (64)                |
| Rulesync                | B10 (1)                     | Demoted                                   |
| Claude Squad            | — (0)                       | Patterns noted but no actionable findings |
| cclogviewer             | — (0)                       | Visualization pattern noted only          |
| Claudio                 | — (0)                       | Too niche                                 |
