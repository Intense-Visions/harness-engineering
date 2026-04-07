# Proposal: Patterns to Adopt from agent-skills

## Option A: Anti-Rationalization Tables (Recommended)

**Summary:** Make `## Common Rationalizations` a required section in every harness skill, using the table format (Rationalization | Reality) proven effective in agent-skills.

**How it works:**

1. Add `## Common Rationalizations` to the skill authoring spec as a required section
2. Define the table format: `| Rationalization | Reality |` with 3-8 entries per skill
3. Audit existing skills — backfill rationalizations for all 83 skills
4. Update skill validation to check for section presence

**Pros:**

- Directly prevents the most common agent failure mode (skipping steps with plausible excuses)
- Table format is easy for agents to pattern-match against — more effective than prose
- Low implementation effort — it's a documentation change, not a code change

**Cons:**

- Backfilling 83 skills requires domain knowledge per skill — medium effort
- Risk of generic/boilerplate rationalizations if not carefully authored — low severity

**Effort:** Small (spec change) + Medium (backfill across 83 skills)
**Risk:** Low
**Best when:** You want the highest-impact improvement with the lowest technical risk.

---

## Option B: MCP Degraded Mode

**Summary:** Define fallback behavior in SKILL.md for each MCP tool call, so skills remain functional (with reduced capabilities) when the MCP server is unavailable.

**How it works:**

1. Add a `## Degraded Mode` section to SKILL.md spec
2. For each MCP call in a skill's process, document the manual fallback (e.g., `emit_interaction` → print to stdout and wait for user input)
3. Add a `degraded_mode: true|false` field to skill.yaml indicating whether the skill supports MCP-free operation
4. Skills with `degraded_mode: true` can be exported as standalone Markdown for other platforms

**Pros:**

- Expands harness adoption to non-MCP environments (Cursor, Gemini CLI, Windsurf)
- Makes SKILL.md self-sufficient — the process works even if infrastructure fails
- Opens a path to marketplace distribution as a Claude Code plugin

**Cons:**

- Significant documentation effort — every MCP call in every skill needs a fallback — high severity
- State management in degraded mode is fundamentally limited (no `gather_context`, no `manage_state`)
- Two code paths to maintain per skill — ongoing maintenance cost

**Effort:** Large (touches all 83 skills + infrastructure)
**Risk:** Medium — degraded mode may create a false sense of capability
**Best when:** Multi-platform adoption is a strategic priority.

---

## Option C: Context Budget System

**Summary:** Add explicit token budgets to skill invocation, preventing context bloat as skill count grows past 100.

**How it works:**

1. Add `context_budget` field to skill.yaml (e.g., `context_budget: { max_lines: 2000, loading: progressive }`)
2. Adopt agent-skills' 5-level context hierarchy (rules → spec → source → errors → history)
3. Implement progressive loading: only skill name + description at startup, full SKILL.md on demand
4. Add context budget validation to skill authoring

**Pros:**

- Prevents context bloat as skill library grows — currently 83 skills, projected 100+
- Explicit budgets force skill authors to be concise
- Progressive loading reduces startup cost

**Cons:**

- Requires runtime changes to how skills are loaded — not just documentation
- Budget enforcement is approximate (token counts vary by model)
- May conflict with existing patterns where skills load full context eagerly

**Effort:** Medium (schema change + runtime changes)
**Risk:** Medium — budget enforcement is imprecise
**Best when:** Context pressure is causing measurable quality degradation.

---

## Comparison Matrix

| Criterion               | A: Anti-Rationalization | B: Degraded Mode      | C: Context Budget |
| ----------------------- | ----------------------- | --------------------- | ----------------- |
| Complexity              | Low                     | High                  | Medium            |
| Impact on agent quality | High                    | Medium                | Medium            |
| Effort to build         | Small-Medium            | Large                 | Medium            |
| Effort to maintain      | Low                     | High (two paths)      | Low               |
| Risk                    | Low                     | Medium                | Medium            |
| Fits current priorities | Yes                     | Strategic, not urgent | Preventive        |

## Recommendation

Based on the constraints (especially backward compatibility and minimizing churn), I lean toward **Option A: Anti-Rationalization Tables** as the immediate action. It is the highest-impact, lowest-risk improvement and directly addresses a gap where agent-skills demonstrably exceeds harness.

Options B and C are valuable but should be sequenced:

- **Option C** becomes urgent when skill count exceeds ~100 or context quality degrades measurably
- **Option B** becomes urgent if multi-platform adoption is prioritized as a strategic goal

A phased approach: **A now, C when needed, B if strategic**.
