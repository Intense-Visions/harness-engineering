# Harness Router

> A natural-language entry point (`/harness`) that classifies user intent by scope and domain, confirms its routing decision with explicit reasoning, and dispatches to the appropriate harness skill.

**Keywords:** router, skill-dispatch, intent-classification, search-skills, scope-tiers, natural-language, confirm-then-dispatch

## Overview

Users shouldn't need to memorize 30+ slash commands to use harness effectively. `/harness` accepts a natural language description of what the user wants, classifies the intent by scope (quick fix, guided change, full exploration, diagnostic), matches it against the skill catalog via `search_skills`, confirms its routing decision with a one-line explanation of _why_, and dispatches to the selected skill — passing the original intent as context so the user doesn't repeat themselves.

### Goals

1. **Single entry point** — users describe what they want in plain language
2. **Right-sized process** — quick fixes skip planning; complex features get brainstorming
3. **Transparent routing** — always explains the chosen skill and scope classification
4. **Clean handoff** — dispatches to the entry skill and gets out of the way; downstream chaining is the dispatched skill's responsibility

### Non-Goals

- Replacing direct skill invocation (power users can still call `/harness:tdd` directly)
- Managing the downstream skill chain (each skill owns its own transitions)
- Learning user preferences over time (out of scope for v1)
- Executing skills itself (the router only selects and dispatches)

## Decisions

| #   | Decision                                   | Choice                                                          | Rationale                                                                                                                                                                                                   |
| --- | ------------------------------------------ | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Input model                                | Natural language                                                | Most ergonomic; users describe what they want, not which command to run                                                                                                                                     |
| D2  | Dispatch behavior                          | Confirm with explicit reasoning, then dispatch                  | Builds trust; lets user course-correct before committing to a skill                                                                                                                                         |
| D3  | Ambiguity handling                         | Show top 2-3 candidates when confidence is low                  | Avoids silent misroutes without requiring re-phrasing                                                                                                                                                       |
| D4  | Matching engine                            | `search_skills` MCP tool                                        | Deterministic scoring against skills index; already exists, no new code needed                                                                                                                              |
| D5  | Scope classification                       | 4 tiers: quick-fix, guided-change, full-exploration, diagnostic | Right-sizes process overhead; prevents brainstorming sessions for button spacing                                                                                                                            |
| D6  | Downstream chaining                        | Not the router's job                                            | Each dispatched skill owns its own transitions; prevents duplicate chain logic                                                                                                                              |
| D7  | Relationship to intelligent-skill-dispatch | Complementary user-facing layer                                 | `intelligent-skill-dispatch` handles automated change-based dispatch; the router handles interactive NL-based dispatch. Router may use `dispatch_skills` as an additional signal when an active diff exists |

## Technical Design

### Skill Structure

New skill at `agents/skills/claude-code/harness-router/` with:

- `skill.yaml` — metadata, triggers, tools
- `SKILL.md` — routing logic, classification rules, confirmation template

### Routing Flow

```
User: /harness <natural language intent>
         │
         ▼
┌─────────────────────┐
│ 1. Parse intent      │
│    Extract: action,  │
│    target, scope     │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ 2. search_skills()   │
│    Query skills index │
│    Return ranked hits │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ 3. Classify scope    │
│    quick-fix │        │
│    guided │ explore │ │
│    diagnostic         │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ 4. Confirm + reason  │
│    "This looks like   │
│    [scope]. I'll use  │
│    [skill] because    │
│    [reason]. Proceed?"│
└────────┬────────────┘
         │ user confirms
         ▼
┌─────────────────────┐
│ 5. run_skill()       │
│    Dispatch with      │
│    original intent    │
│    as context         │
└─────────────────────┘
```

### Scope Classification

The router classifies based on signals from the intent and `search_skills` results:

| Signal                                               | Points toward        |
| ---------------------------------------------------- | -------------------- |
| "fix", "tweak", "adjust", "change X to Y"            | **quick-fix**        |
| "redesign", "refactor", "improve how X works"        | **guided-change**    |
| "build", "create", "add a new system for", "we need" | **full-exploration** |
| "broken", "slow", "failing", "debug", "review"       | **diagnostic**       |
| Single file / component mentioned                    | Lower ceremony       |
| Multiple systems / no clear target                   | Higher ceremony      |

### Scope-to-Skill Mapping

| Scope            | Primary Skill           | Alternates (if better match)                         |
| ---------------- | ----------------------- | ---------------------------------------------------- |
| quick-fix        | `harness-tdd`           | `harness-refactoring` if structural                  |
| guided-change    | `harness-planning`      | `harness-architecture-advisor` if tradeoffs involved |
| full-exploration | `harness-brainstorming` | —                                                    |
| diagnostic       | `harness-debugging`     | `harness-code-review`, `harness-perf` by domain      |

### Confirmation Templates

**High confidence (single match):**

```
This looks like a [scope-level] — [one-line reasoning].

I'll route to `harness:[skill]` because [why this skill fits].

Proceed? (y/n/suggest another)
```

**Low confidence (ambiguous, top 2-3 candidates):**

```
This could be a few things:

1. `harness:[skill-1]` — [one-line description]
2. `harness:[skill-2]` — [one-line description]
3. `harness:[skill-3]` — [one-line description]

Which fits best? (1/2/3)
```

**No arguments:**

```
Usage: /harness <describe what you want to do>

Examples:
  /harness fix the button spacing on the settings page
  /harness we need a notification system
  /harness this page is slow
  /harness redesign how the sidebar filters work

I'll figure out the right skill and process level for you.
```

### skill.yaml

```yaml
name: harness-router
version: '1.0.0'
description: Natural language router to harness skills — classifies intent, confirms, dispatches
cognitive_mode: analytical-classifier
command_name: harness
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
tools:
  - Read
  - Glob
  - Grep
cli:
  command: harness skill run harness-router
  args:
    - name: intent
      description: Natural language description of what the user wants
      required: true
mcp:
  tool: run_skill
  input:
    skill: harness-router
    path: string
type: rigid
tier: 1
phases:
  - name: classify
    description: Parse intent and search skills index
    required: true
  - name: confirm
    description: Present routing decision with reasoning
    required: true
  - name: dispatch
    description: Invoke selected skill via run_skill
    required: true
depends_on: []
```

### Command Name Override

The `command_name: harness` field in `skill.yaml` tells `generate-slash-commands` to produce this as `/harness` instead of `/harness:router`. This requires adding an optional `command_name` field to the `SlashCommandSpec` type and having the normalize step respect it.

### File Layout

```
agents/skills/claude-code/harness-router/
  skill.yaml          # metadata with command_name override
  SKILL.md            # full routing logic and classification rules
```

Generator changes:

```
packages/cli/src/slash-commands/
  types.ts            # add optional command_name to SlashCommandSpec
  normalize.ts        # respect command_name override when present
```

## Success Criteria

1. `/harness fix the button spacing on the settings page` routes to `harness-tdd` with scope "quick-fix" and confirms before dispatching
2. `/harness we need a notification system` routes to `harness-brainstorming` with scope "full-exploration" and confirms before dispatching
3. `/harness clean up my code` (ambiguous) presents top 2-3 candidates and lets user choose
4. `/harness this page is slow` routes to a diagnostic skill with reasoning
5. `/harness redesign how the sidebar filters work` routes to `harness-planning` or `harness-architecture-advisor` with scope "guided-change"
6. Confirmation always includes: scope classification, chosen skill, and one-line reasoning
7. User can reject the suggestion and re-phrase or pick a different skill
8. Dispatched skill receives the original natural language intent as context
9. `search_skills` MCP tool is used for matching — no custom scoring code
10. `/harness` with no arguments shows usage help with examples

## Implementation Order

1. **Skill files** — Create `harness-router/skill.yaml` and `harness-router/SKILL.md` with the classification logic, confirmation template, and dispatch flow
2. **Command name override** — Add optional `command_name` field to `SlashCommandSpec` in `types.ts`
3. **Generator update** — Update `normalize.ts` to respect `command_name` override when rendering
4. **Regenerate commands** — Run `generate-slash-commands` to produce the new `/harness` command across platforms
5. **Test routing** — Validate the 5 acceptance scenarios from success criteria manually
