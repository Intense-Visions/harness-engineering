# Ranked Findings: Awesome Claude Code Resource Integration

**Date:** 2026-03-30
**Scoring:** Impact (1-5) × Ease (1-5, where 5=tiny effort) × Alignment (1-5, fit with harness identity)
**Max score:** 125

---

## Tier 1: Do These First (Score 60+)

| Rank | ID  | Finding                                                    | Impact | Ease | Align | Score | Source          |
| ---- | --- | ---------------------------------------------------------- | ------ | ---- | ----- | ----- | --------------- |
| 1    | A4  | "Rationalizations to Reject" sections in discipline skills | 5      | 5    | 5     | 125   | Trail of Bits   |
| 2    | C1  | Rationalization defense (Iron Laws, Red Flags, Rebuttals)  | 5      | 4    | 5     | 100   | Superpowers     |
| 3    | A1  | Prompt injection scanning (install parry as hook)          | 5      | 5    | 4     | 100   | parry           |
| 4    | C8  | Rubric compression format for review prompts               | 4      | 5    | 5     | 100   | Context Eng Kit |
| 5    | B9  | Comment replacement detection hook                         | 4      | 5    | 5     | 100   | claudekit       |
| 6    | C13 | Review-never-fixes separation of concerns                  | 4      | 5    | 5     | 100   | RIPER           |
| 7    | C14 | Read-only research phase (no solutions in discovery)       | 4      | 5    | 5     | 100   | RIPER           |
| 8    | C10 | TDD for skill authoring methodology                        | 4      | 5    | 5     | 100   | Superpowers     |
| 9    | A9  | Session taint model for confirmed injection                | 4      | 4    | 5     | 80    | parry           |
| 10   | C2  | Scratchpad delegation (reasoning to disk, not context)     | 5      | 4    | 4     | 80    | Context Eng Kit |
| 11   | A3  | False-positive verification workflow (fp-check)            | 4      | 4    | 5     | 80    | Trail of Bits   |
| 12   | A6  | Insecure defaults / fail-open detection                    | 4      | 4    | 5     | 80    | Trail of Bits   |
| 13   | C6  | Learnings-researcher as always-on reviewer                 | 4      | 4    | 5     | 80    | Compound Eng    |
| 14   | C7  | Stage filtering / --fast modes for skills                  | 4      | 4    | 5     | 80    | Context Eng Kit |
| 15   | B1  | Usage/cost tracking from JSONL                             | 4      | 4    | 4     | 64    | ccflare/ccusage |
| 16   | C12 | Incremental milestone commits in autopilot                 | 4      | 4    | 4     | 64    | ContextKit      |
| 17   | C11 | Uncertainty surfacing / clarification protocol             | 4      | 4    | 4     | 64    | ContextKit      |
| 18   | B7  | Git stash auto-checkpointing hook                          | 4      | 4    | 4     | 64    | claudekit       |
| 19   | B5  | Desktop notifications for long-running ops                 | 3      | 5    | 4     | 60    | CC Notify       |
| 20   | C4  | Commands-over-skills context loading audit                 | 4      | 4    | 4     | 64    | Context Eng Kit |
| 21   | D6  | Confidence-first gating (>90/70-89/<70)                    | 4      | 4    | 4     | 64    | SuperClaude     |

---

## Tier 2: High Value, Moderate Effort (Score 36-59)

| Rank | ID  | Finding                                      | Impact | Ease | Align | Score | Source          |
| ---- | --- | -------------------------------------------- | ------ | ---- | ----- | ----- | --------------- |
| 22   | A2  | Container sandboxing via MCP client          | 5      | 4    | 3     | 60    | Container Use   |
| 23   | A5  | Supply-chain risk auditor skill              | 4      | 3    | 5     | 60    | Trail of Bits   |
| 24   | A7  | API footgun / sharp-edges detection          | 4      | 3    | 5     | 60    | Trail of Bits   |
| 25   | D1  | Tiered MCP tool loading (5K/10K/21K)         | 4      | 3    | 5     | 60    | Task Master     |
| 26   | B2  | Agent config linting (agnix hybrid)          | 4      | 3    | 5     | 60    | agnix           |
| 27   | D9  | Mandatory triage routing before dispatch     | 3      | 4    | 4     | 48    | claudekit       |
| 28   | D10 | Unified file guard with multi-format ignore  | 3      | 4    | 4     | 48    | claudekit       |
| 29   | D5  | Token efficiency symbol tables               | 3      | 5    | 3     | 45    | SuperClaude     |
| 30   | D8  | Thinking level tuning per session            | 3      | 4    | 3     | 36    | claudekit       |
| 31   | B10 | Multi-platform via Rulesync canonical format | 4      | 3    | 3     | 36    | Rulesync        |
| 32   | B3  | Hook authoring scaffolding (generate hooks)  | 4      | 3    | 3     | 36    | claude-hooks    |
| 33   | C3  | Meta-judge pre-generation for reviews        | 4      | 3    | 4     | 48    | Context Eng Kit |
| 34   | C9  | Two-stage isolated review (spec + quality)   | 4      | 3    | 4     | 48    | Superpowers     |
| 35   | B4  | Mechanical TDD enforcement via hooks         | 4      | 3    | 4     | 48    | TDD Guard       |
| 36   | B8  | Codebase map auto-injection at session start | 3      | 3    | 4     | 36    | claudekit       |
| 37   | D4  | findParallelGroups from dependency graph     | 4      | 3    | 4     | 48    | sudocode        |

---

## Tier 3: Worth Doing Eventually (Score 15-35)

| Rank | ID  | Finding                                       | Impact | Ease | Align | Score | Source       |
| ---- | --- | --------------------------------------------- | ------ | ---- | ----- | ----- | ------------ |
| 38   | C5  | Structured error-to-lesson pipeline           | 5      | 2    | 4     | 40    | Compound Eng |
| 39   | B6  | Full-text session search TUI                  | 4      | 3    | 3     | 36    | recall       |
| 40   | A8  | AST command safety (130 handlers)             | 4      | 2    | 4     | 32    | Dippy        |
| 41   | D2  | 4-tier spec hierarchy + bidirectional linking | 4      | 2    | 3     | 24    | sudocode     |
| 42   | D3  | JSONL+SQLite dual storage                     | 3      | 2    | 3     | 18    | sudocode     |
| 43   | D7  | Deep multi-hop research pipeline              | 3      | 2    | 3     | 18    | SuperClaude  |

---

## Proposed Implementation Batches

### Batch 1: "Prose Power" — Zero-code skill upgrades (1-2 days)

Items that only require adding prose to existing SKILL.md files:

| ID  | What                                                       | Files to Edit                                                                         |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| A4  | Add "Rationalizations to Reject" to security skills        | harness-security-review, harness-security-scan                                        |
| C1  | Add Iron Laws + Red Flags + Rebuttals to discipline skills | harness-tdd, harness-verification, harness-code-review, harness-architecture-enforcer |
| C13 | Enforce "review never fixes" in reviewer personas          | harness-code-review SKILL.md, reviewer persona                                        |
| C14 | Add "no solutions" constraint to research phases           | harness-architecture-advisor, harness-planning                                        |
| C10 | Add TDD-for-skill-authoring to skill-authoring skill       | harness-skill-authoring SKILL.md                                                      |
| C8  | Switch review rubrics to dense single-line format          | harness-code-review, harness-verification                                             |
| B9  | Document comment-replacement detection pattern             | harness-code-review SKILL.md                                                          |
| C11 | Add uncertainty surfacing step to planning                 | harness-planning SKILL.md                                                             |

**Estimated effort:** 1-2 days. **Impact:** Immediately improves agent discipline across 8+ skills.

### Batch 2: "Quick Hooks" — Tiny integrations (1-2 days)

| ID  | What                                                                          |
| --- | ----------------------------------------------------------------------------- |
| A1  | Install parry-guard as Claude Code hook (documented in getting-started guide) |
| B5  | Add desktop notification hook example to templates                            |
| B7  | Add git stash checkpoint hook to templates                                    |
| A9  | Document taint model pattern for orchestrator security                        |

**Estimated effort:** 1-2 days. **Impact:** Immediate security + DX wins.

### Batch 3: "Context Efficiency" — Reduce token waste (2-3 days)

| ID  | What                                                            |
| --- | --------------------------------------------------------------- |
| C2  | Scratchpad delegation pattern in autopilot/planning             |
| C7  | Add --fast/--thorough flags to autopilot, planning, code-review |
| C4  | Audit skill descriptions for always-on vs on-demand loading     |
| C6  | Integrate learnings lookup into code-review pipeline            |
| C12 | Add mid-phase milestone commits to autopilot                    |
| D6  | Add confidence self-assessment to planning/execution            |

**Estimated effort:** 2-3 days. **Impact:** Reduces token consumption, improves autopilot reliability.

### Batch 4: "Security Depth" — New security skills (1-2 weeks)

| ID  | What                                            |
| --- | ----------------------------------------------- |
| A3  | New `harness:fp-verify` skill                   |
| A5  | New `harness:supply-chain-audit` skill          |
| A6  | Add insecure-defaults checks to SecurityScanner |
| A7  | Add sharp-edges checks to security-review       |

**Estimated effort:** 1-2 weeks. **Impact:** Fills critical security skill gaps identified by ToB comparison.

### Batch 5: "DX Infrastructure" — CLI & tooling (2-3 weeks)

| ID  | What                                              |
| --- | ------------------------------------------------- |
| B1  | `harness usage` CLI command                       |
| B2  | `harness validate --agent-configs` (agnix hybrid) |
| B3  | `harness generate hooks` with presets             |
| B4  | TDD Guard integration into harness:tdd            |
| D1  | Tiered MCP tool loading                           |

**Estimated effort:** 2-3 weeks. **Impact:** Major DX improvements, config safety, budget visibility.

### Batch 6: "Architecture" — Bigger bets (1-2 months)

| ID  | What                                              |
| --- | ------------------------------------------------- |
| A2  | ContainerBackend via Container Use MCP client     |
| C5  | Structured error-to-lesson pipeline for learnings |
| A8  | AST command safety for orchestrator               |
| D4  | findParallelGroups enhancement                    |
| C3  | Meta-judge pre-generation                         |
| C9  | Two-stage isolated review                         |

**Estimated effort:** 1-2 months. **Impact:** Architectural capabilities that differentiate harness.

---

## Top 10 Summary

If you could only do 10 things:

1. **A4** — Add "Rationalizations to Reject" to security skills (free, huge impact)
2. **C1** — Rationalization defense across all discipline skills (free, transforms agent compliance)
3. **A1** — Install parry-guard hook (5 minutes, closes biggest security gap)
4. **C2** — Scratchpad delegation in autopilot (small effort, big token savings)
5. **B1** — `harness usage` CLI (2-3 days, users need budget visibility)
6. **A3** — FP verification skill (small, fills real security pipeline gap)
7. **C7** — --fast/--thorough flags (small, gives users control over cost/quality)
8. **B2** — Agent config linting (medium, prevents silent config failures)
9. **C6** — Learnings in code review (small, makes learnings system earn its keep)
10. **A2** — Container sandboxing (1-2 days, enables safe orchestrator execution)
