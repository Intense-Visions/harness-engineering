# Harness Router

> Natural language entry point to all harness skills. Classifies user intent by scope and domain, confirms the routing decision with explicit reasoning, and dispatches to the appropriate skill.

## When to Use

- When the user invokes `/harness` with a natural language description of what they want
- When the user is unsure which harness skill to use
- When the user wants to describe their intent rather than remember a command name
- NOT when the user already knows the specific skill (e.g., `/harness:tdd`, `/harness:planning`)
- NOT for non-harness tasks (general coding, file operations, etc.)

## Process

### Iron Law

**The router confirms before dispatching.** Never silently route to a skill. Always present the chosen skill, scope classification, and reasoning — then wait for the user to confirm.

---

### Phase 1: CLASSIFY — Parse Intent and Search

1. **Check for empty input.** If no intent is provided, show usage help:

   ```
   Usage: /harness <describe what you want to do>

   Examples:
     /harness fix the button spacing on the settings page
     /harness we need a notification system
     /harness this page is slow
     /harness redesign how the sidebar filters work
     /harness clean up my code

   I'll figure out the right skill and process level for you.
   ```

   Stop here — do not proceed to classification.

2. **Search the skill catalog.** Call `search_skills` with the user's natural language intent as the query:

   ```
   search_skills({ query: "<user's intent>" })
   ```

   This returns ranked skill matches from the skills index.

3. **Classify scope.** Based on the intent language and search results, classify into one of four tiers:

   | Scope                | Signal Words                                                       | Description                                                   |
   | -------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------- |
   | **quick-fix**        | "fix", "tweak", "adjust", "change X to Y", "update", "correct"     | Small, targeted change with no design decisions               |
   | **guided-change**    | "redesign", "refactor", "improve how X works", "rework"            | Moderate scope, some decisions but architecture is clear      |
   | **full-exploration** | "build", "create", "add a new system for", "we need", "design"     | Ambiguous scope, multiple approaches, design decisions needed |
   | **diagnostic**       | "broken", "slow", "failing", "debug", "review", "check", "analyze" | Something is broken or needs analysis                         |

   Additional scope signals:
   - Single file or component mentioned → lower ceremony (quick-fix or guided-change)
   - Multiple systems or no clear target → higher ceremony (full-exploration)
   - Error messages or symptoms → diagnostic

4. **Map scope to entry skill.** Use the classification and search results to select the entry skill:

   | Scope            | Primary Skill           | Alternates (when search results indicate better match)                    |
   | ---------------- | ----------------------- | ------------------------------------------------------------------------- |
   | quick-fix        | `harness-tdd`           | `harness-refactoring` if the intent is structural                         |
   | guided-change    | `harness-planning`      | `harness-architecture-advisor` if tradeoffs are involved                  |
   | full-exploration | `harness-brainstorming` | —                                                                         |
   | diagnostic       | `harness-debugging`     | `harness-code-review` for review requests, `harness-perf` for performance |

   If the `search_skills` results strongly favor a specific skill that differs from the scope-based default, prefer the search result. The scope classification provides the fallback when search results are ambiguous.

5. **Assess confidence.** Determine whether the match is confident or ambiguous:
   - **High confidence:** Top search result clearly dominates, scope classification aligns with it
   - **Low confidence:** Top 2-3 results are close in score, or scope classification points to a different skill than search results

---

### Phase 2: CONFIRM — Present Decision with Reasoning

**High confidence (single clear match):**

Present the routing decision with scope classification and reasoning:

```
This looks like a [scope-level] — [one-line reasoning about why this scope].

I'll route to `harness:[skill]` because [why this skill fits the intent].

Proceed? (y / n / suggest another)
```

Wait for the user to confirm before proceeding.

**Low confidence (ambiguous, multiple candidates):**

Present the top 2-3 candidates with descriptions:

```
This could be a few things:

1. `harness:[skill-1]` — [one-line description of what this skill does]
2. `harness:[skill-2]` — [one-line description of what this skill does]
3. `harness:[skill-3]` — [one-line description of what this skill does]

Which fits best? (1 / 2 / 3)
```

Wait for the user to choose.

**User rejects the suggestion:**

If the user says no or suggests a different skill:

- If they name a specific skill, confirm and dispatch to that skill
- If they re-phrase their intent, re-run CLASSIFY with the new phrasing
- Do not loop more than twice — if the second attempt also misses, list all available harness skills and let the user pick

---

### Phase 3: DISPATCH — Invoke Selected Skill

1. **Pass the original intent as context.** When invoking the selected skill, include the user's original natural language intent so they do not need to repeat themselves.

2. **Invoke via `run_skill`.** Call `run_skill` with the selected skill name and the user's intent as the argument:

   ```
   run_skill({ skill: "<selected-skill>", path: "<project-root>" })
   ```

   Pass the original intent through as the skill's argument context.

3. **Hand off cleanly.** Once the skill is invoked, the router's job is done. The dispatched skill owns all subsequent interaction, including any downstream chaining to other skills.

---

## Scope Examples

### Quick Fix

**Intent:** "fix the button spacing on the settings page"
**Classification:** quick-fix — single component, clear target, no design decisions
**Route:** `harness-tdd`

### Guided Change

**Intent:** "redesign how the sidebar filters work"
**Classification:** guided-change — moderate scope, clear architecture, some decisions
**Route:** `harness-planning` or `harness-architecture-advisor`

### Full Exploration

**Intent:** "we need a notification system"
**Classification:** full-exploration — ambiguous scope, multiple approaches, design decisions needed
**Route:** `harness-brainstorming`

### Diagnostic

**Intent:** "this page is slow"
**Classification:** diagnostic — performance symptom, needs investigation
**Route:** `harness-perf`

### Ambiguous

**Intent:** "clean up my code"
**Classification:** ambiguous — could be refactoring, dead code removal, or architecture cleanup
**Route:** Present candidates: `harness-refactoring`, `harness-codebase-cleanup`, `harness-cleanup-dead-code`

## Harness Integration

- **`search_skills`** — Used in Phase 1 to match the user's natural language intent against the skill catalog. Returns ranked results based on keyword, description, and stack-signal matching.
- **`run_skill`** — Used in Phase 3 to dispatch to the selected skill. Passes the project path and original intent as context.
- **`harness validate`** — Not directly used by the router. Validation is the responsibility of the dispatched skill.

## Success Criteria

- `/harness fix the button spacing on the settings page` routes to `harness-tdd` with scope "quick-fix" and confirms before dispatching
- `/harness we need a notification system` routes to `harness-brainstorming` with scope "full-exploration" and confirms before dispatching
- `/harness clean up my code` (ambiguous) presents top 2-3 candidates and lets user choose
- `/harness this page is slow` routes to a diagnostic skill with reasoning
- `/harness redesign how the sidebar filters work` routes to `harness-planning` or `harness-architecture-advisor` with scope "guided-change"
- Confirmation always includes: scope classification, chosen skill, and one-line reasoning
- User can reject the suggestion and re-phrase or pick a different skill
- Dispatched skill receives the original natural language intent as context
- `search_skills` MCP tool is used for matching — no custom scoring code
- `/harness` with no arguments shows usage help with examples

## Rationalizations to Reject

| Rationalization                                                                | Reality                                                                                                                                                                    |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "The intent is obvious, I can skip the confirmation step"                      | The Iron Law requires confirmation before every dispatch. Even obvious intents benefit from the user seeing the scope classification — it catches misunderstandings early. |
| "I should also suggest downstream skills the dispatched skill will chain into" | Each skill owns its own transitions. Surfacing the full chain adds noise and duplicates logic that already exists in the dispatched skill.                                 |
| "The search results don't match well, so I'll just guess based on keywords"    | If `search_skills` returns poor results, present the top candidates and let the user choose. Guessing silently is worse than admitting ambiguity.                          |
| "The user rejected my suggestion twice, I should keep trying"                  | After two misses, list available skills and let the user pick directly. Do not loop indefinitely.                                                                          |

## Gates

- **No silent dispatch.** Every routing decision must be confirmed by the user before the skill is invoked. No exceptions.
- **No bypassing search_skills.** The skill catalog search must be used for matching. Do not hardcode intent-to-skill mappings or rely solely on keyword heuristics.
- **No downstream chaining.** The router dispatches to exactly one skill. It does not pre-load or suggest the skills that will follow.
- **No more than two re-classification attempts.** If the user rejects twice, show the full list and let them pick.

## Escalation

- **When `search_skills` returns no results:** The skills index may be stale or missing. Suggest the user run `harness update-skills-index` to regenerate it, then retry.
- **When the user's intent spans multiple skills:** Ask: "This sounds like it involves both [skill A] and [skill B]. Which should we start with?" Do not attempt to dispatch to multiple skills simultaneously.
- **When the user asks for something outside the harness skill catalog:** Say so plainly: "This doesn't match any harness skill. You may want to handle this directly, or describe the task differently if you think a harness skill should apply."
