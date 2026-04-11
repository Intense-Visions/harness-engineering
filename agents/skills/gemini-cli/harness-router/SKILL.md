# Harness Router

> Natural language entry point to all harness skills. Classifies intent by scope/domain, confirms routing with reasoning, dispatches to the appropriate skill.

## When to Use

- When the user invokes `/harness` with a natural language description
- When the user is unsure which harness skill to use
- NOT when the user already knows the specific skill (e.g., `/harness:tdd`)
- NOT for non-harness tasks (general coding, file operations, etc.)

## Process

### Iron Law

**The router confirms before dispatching.** Never silently route. Always present the chosen skill, scope classification, and reasoning — then wait for confirmation.

---

### Phase 1: CLASSIFY — Parse Intent and Search

1. **Check for empty input.** Show usage help and stop:

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

2. **Search the skill catalog.** Call `search_skills({ query: "<user's intent>" })` to get ranked matches.

3. **Classify scope** into one of four tiers:

   | Scope                | Signal Words                                       | Description                                |
   | -------------------- | -------------------------------------------------- | ------------------------------------------ |
   | **quick-fix**        | fix, tweak, adjust, update, change X to Y, correct | Small targeted change, no design decisions |
   | **guided-change**    | redesign, refactor, improve, rework                | Moderate scope, clear architecture         |
   | **full-exploration** | build, create, add system for, we need, design     | Ambiguous scope, design decisions needed   |
   | **diagnostic**       | broken, slow, failing, debug, review, analyze      | Something broken or needs analysis         |

   Additional signals: single file → lower ceremony; multiple systems → higher ceremony; error messages → diagnostic.

4. **Map scope to entry skill:**

   | Scope            | Primary Skill           | Alternates                                                        |
   | ---------------- | ----------------------- | ----------------------------------------------------------------- |
   | quick-fix        | `harness-tdd`           | `harness-refactoring` if structural                               |
   | guided-change    | `harness-planning`      | `harness-architecture-advisor` if tradeoffs involved              |
   | full-exploration | `harness-brainstorming` | —                                                                 |
   | diagnostic       | `harness-debugging`     | `harness-code-review` for reviews, `harness-perf` for performance |

   If `search_skills` results strongly favor a different skill, prefer search results. Scope classification is the fallback when search is ambiguous.

5. **Assess confidence:**
   - **High:** Top result clearly dominates and aligns with scope classification
   - **Low:** Top 2-3 results close in score, or scope classification conflicts with search results

---

### Phase 2: CONFIRM — Present Decision with Reasoning

**High confidence:**

```
This looks like a [scope-level] — [reasoning].
I'll route to `harness:[skill]` because [why this skill fits].
Proceed? (y / n / suggest another)
```

Wait for confirmation.

**Low confidence (multiple candidates):**

```
This could be a few things:
1. `harness:[skill-1]` — [description]
2. `harness:[skill-2]` — [description]
3. `harness:[skill-3]` — [description]
Which fits best? (1 / 2 / 3)
```

Wait for the user to choose.

**User rejects:** If they name a skill, confirm and dispatch. If they re-phrase, re-run CLASSIFY. Do not loop more than twice — after two misses, list all available skills and let the user pick.

---

### Phase 3: DISPATCH — Invoke Selected Skill

1. **Pass original intent as context** so the user does not repeat themselves.
2. **Invoke via `run_skill`:** `run_skill({ skill: "<selected-skill>", path: "<project-root>" })` with original intent as argument context.
3. **Hand off cleanly.** Once invoked, the router's job is done. The dispatched skill owns all subsequent interaction.

---

## Examples

**Quick Fix:** "fix the button spacing on the settings page"
quick-fix — single component, clear target → `harness-tdd`

**Guided Change:** "redesign how the sidebar filters work"
guided-change — moderate scope, some decisions → `harness-planning` or `harness-architecture-advisor`

**Full Exploration:** "we need a notification system"
full-exploration — ambiguous scope, multiple approaches → `harness-brainstorming`

**Diagnostic:** "this page is slow"
diagnostic — performance symptom → `harness-perf`

**Ambiguous:** "clean up my code"
Could be refactoring, dead code, or architecture cleanup → Present candidates: `harness-refactoring`, `harness-codebase-cleanup`, `harness-cleanup-dead-code`

## Harness Integration

- **`search_skills`** — Phase 1: matches intent against the skill catalog. Returns ranked results.
- **`run_skill`** — Phase 3: dispatches to selected skill with project path and original intent.
- **`harness validate`** — Not used by the router. Validation is the dispatched skill's responsibility.

## Success Criteria

- Quick-fix intents route to `harness-tdd`, full-exploration to `harness-brainstorming`, diagnostics to appropriate diagnostic skill
- Ambiguous intents present top 2-3 candidates for user choice
- Confirmation always includes scope classification, chosen skill, and one-line reasoning
- User can reject and re-phrase or pick a different skill
- Dispatched skill receives original intent as context
- `search_skills` MCP tool is used for matching — no custom scoring code
- `/harness` with no arguments shows usage help

## Rationalizations to Reject

| Rationalization                                                           | Reality                                                                                                                                       |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| "The intent is obvious, I can skip confirmation"                          | The Iron Law requires confirmation before every dispatch. Even obvious intents benefit from the user seeing scope classification.             |
| "I should suggest downstream skills the dispatched skill will chain into" | Each skill owns its own transitions. Surfacing the full chain adds noise and duplicates logic in the dispatched skill.                        |
| "Search results don't match well, so I'll guess based on keywords"        | If `search_skills` returns poor results, present top candidates and let the user choose. Guessing silently is worse than admitting ambiguity. |
| "The user rejected twice, I should keep trying"                           | After two misses, list available skills and let the user pick directly. Do not loop indefinitely.                                             |

## Gates

- **No silent dispatch.** Every routing decision must be confirmed before the skill is invoked.
- **No bypassing search_skills.** The skill catalog search must be used. Do not hardcode intent-to-skill mappings.
- **No downstream chaining.** The router dispatches to exactly one skill. Do not pre-load or suggest follow-on skills.
- **No more than two re-classification attempts.** After two rejections, show the full list.

## Escalation

- **`search_skills` returns no results:** Skills index may be stale. Suggest `harness update-skills-index` to regenerate, then retry.
- **Intent spans multiple skills:** Ask: "This involves both [skill A] and [skill B]. Which should we start with?" Do not dispatch to multiple skills.
- **Intent outside harness catalog:** Say so plainly: "This doesn't match any harness skill. Handle directly, or re-describe if you think a skill should apply."
