# Interaction Surface Abstraction

**Date:** 2026-03-20
**Status:** Proposed
**Parent:** [Harness v2 Design Patterns](../harness-v2-patterns/proposal.md) — Patterns 3, 5
**Scope:** Foundational abstraction enabling multi-surface interaction for all harness skills
**Keywords:** interaction-surface, emit-interaction, message-types, markdown-conventions, phase-transition, surface-adapter, CLI-adapter, MCP-tool

## Overview

Decouple harness skills from specific interaction surfaces (terminal, GitHub, Slack) by introducing structured message types for round-trip interactions (MCP tool) and conventional markdown patterns for display-only output. Prove the abstraction by migrating the 5 core development loop skills (brainstorming, planning, execution, verification, review). This is the foundational subsystem that enables Pattern 3 (suggest-and-confirm chaining) and Pattern 5 (interaction surface abstraction) from the Harness v2 Design Patterns.

### Non-goals

- GitHub/Slack adapters (future subsystem specs)
- Async response routing (deferred until GitHub adapter spec)
- Migrating non-core skills (each subsystem spec migrates its own)
- Changing what skills communicate — only how they communicate it

## Decisions

| Decision                 | Choice                                                                                            | Rationale                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Abstraction depth        | Message types + CLI adapter                                                                       | Proves the abstraction with real code; CLI is primary surface today                       |
| Display-only messages    | Conventional markdown patterns                                                                    | Human-readable in terminal, parseable by regex, degrades gracefully                       |
| Round-trip interactions  | Single `emit_interaction` MCP tool with type parameter                                            | One tool is easier to manage; type parameter makes it extensible                          |
| Async routing            | Synchronous only; async deferred to GitHub adapter spec                                           | Speculative until we know what GitHub surface needs; designed so async can be added later |
| Skill migration scope    | 5 core loop skills upfront                                                                        | These are the backbone; not all subsystem specs touch them; proves full chain             |
| Implementation approach  | Parallel — types and first skill migration inform each other                                      | Fastest convergence; avoids ivory-tower type design                                       |
| LLM vs code execution    | Hybrid — LLM skills use format conventions + MCP tool calls; code tools use TypeScript interfaces | Skills are markdown instructions, not code; both levels need the abstraction              |
| Existing skill migration | Replace for modified code, wrap for untouched code                                                | Clean break where we're already changing things; no unnecessary churn                     |

## Technical Design

### Two-Layer Architecture

```
┌─────────────────────────────────────────────────┐
│ SKILL LAYER (LLM-executed SKILL.md instructions) │
│                                                   │
│ Display-only: markdown format conventions         │
│ Round-trip:   emit_interaction MCP tool calls      │
├─────────────────────────────────────────────────┤
│ TOOL LAYER (TypeScript MCP tools & CLI)           │
│                                                   │
│ InteractionMessage types (Zod-validated)          │
│ emit_interaction tool implementation              │
│ OutputFormatter CLI adapter                       │
├─────────────────────────────────────────────────┤
│ SURFACE LAYER (renders & captures)                │
│                                                   │
│ CLI adapter (this spec)                           │
│ GitHub adapter (future spec)                      │
│ Slack adapter (future spec)                       │
└─────────────────────────────────────────────────┘
```

### Display-Only Format Conventions

Skills instruct the LLM to emit these markdown patterns. Parseable by convention, readable in terminal.

**Finding:**

```
**[CRITICAL]** Title of the finding
> Detailed explanation of what's wrong and why it matters
> Suggestion: how to fix it
```

Severities: `CRITICAL`, `IMPORTANT`, `SUGGESTION`

**Progress:**

```
**[Phase 3/7]** Context scoping — loading graph and computing impact
```

**Strengths (in reviews):**

```
**[STRENGTH]** Clean separation of parsing and validation logic
```

**Auto-fix log:**

```
**[FIXED]** Added missing traceability link: goal "fast startup" → criterion #4
```

These patterns are documented in the skill but are NOT enforced by tooling — they're conventions the LLM follows. A post-processor can parse them with regex: `\*\*\[(CRITICAL|IMPORTANT|SUGGESTION|STRENGTH|FIXED|Phase \d+/\d+)\]\*\*`.

### `emit_interaction` MCP Tool

**Location:** `packages/mcp-server/src/tools/interaction.ts`

**Input Schema:**

```typescript
interface EmitInteractionInput {
  path: string; // project root
  type: 'question' | 'confirmation' | 'transition';
  stream?: string; // state stream for recording

  // For type: 'question'
  question?: {
    text: string;
    options?: string[]; // multiple choice; omit for free-form
    default?: string;
  };

  // For type: 'confirmation'
  confirmation?: {
    text: string; // what to confirm
    context: string; // why confirmation is needed
  };

  // For type: 'transition'
  transition?: {
    completedPhase: string;
    suggestedNext: string;
    reason: string;
    artifacts: string[]; // file paths produced
  };
}
```

**Behavior by type:**

| Type           | What the tool does                                                     | What it returns                                                                       |
| -------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `question`     | Records question in state; returns formatted prompt for LLM to present | `{id, prompt}` — LLM presents prompt, user's next message is the answer               |
| `confirmation` | Records pending confirmation in state                                  | `{id, prompt}` — LLM presents yes/no prompt                                           |
| `transition`   | Writes to `.harness/handoff.json`; records in state decisions          | `{id, prompt, handoffWritten: true}` — LLM presents "Phase X complete. Proceed to Y?" |

**Recording:** Every interaction is appended to `.harness/state.json` decisions array:

```typescript
{
  date: string;
  decision: string; // the question/confirmation text
  context: string; // user's response (filled in by skill after user responds)
}
```

**Sync model:** The tool returns immediately with a formatted prompt. The LLM presents the prompt to the user. The user responds. The LLM interprets the response and continues. This is identical to how skills work today — the tool just adds structure and recording.

### Core Types

**Location:** `packages/core/src/interaction/types.ts`

```typescript
import { z } from 'zod';

export const InteractionTypeSchema = z.enum(['question', 'confirmation', 'transition']);

export const QuestionSchema = z.object({
  text: z.string(),
  options: z.array(z.string()).optional(),
  default: z.string().optional(),
});

export const ConfirmationSchema = z.object({
  text: z.string(),
  context: z.string(),
});

export const TransitionSchema = z.object({
  completedPhase: z.string(),
  suggestedNext: z.string(),
  reason: z.string(),
  artifacts: z.array(z.string()),
});

export const EmitInteractionInputSchema = z.object({
  path: z.string(),
  type: InteractionTypeSchema,
  stream: z.string().optional(),
  question: QuestionSchema.optional(),
  confirmation: ConfirmationSchema.optional(),
  transition: TransitionSchema.optional(),
});

export type InteractionType = z.infer<typeof InteractionTypeSchema>;
export type EmitInteractionInput = z.infer<typeof EmitInteractionInputSchema>;
```

### CLI Adapter Changes

- Existing colored icon output stays as-is for non-migrated code
- New `parseConventionalMarkdown(text)` utility extracts structured data from `**[TYPE]**` patterns for post-processors
- No changes to how the terminal renders — markdown conventions already look good in terminal
- No new CLI commands — the interaction tool is MCP-only; CLI users interact through the LLM as today

### Skill Migration: What Changes

For each of the 5 core skills, the SKILL.md gains:

1. `emit_interaction` added to the tools list in `skill.yaml`
2. Sign-off/approval gates replaced with `emit_interaction` calls
3. Phase completion → `emit_interaction({type: 'transition', ...})`
4. Clarifying questions → `emit_interaction({type: 'question', ...})`
5. Display-only output (findings, progress, strengths) → conventional markdown patterns

**Per-skill changes:**

| Skill         | Questions               | Confirmations           | Transitions    | Display-only                      |
| ------------- | ----------------------- | ----------------------- | -------------- | --------------------------------- |
| brainstorming | Clarifying Qs (Phase 2) | Spec sign-off (Phase 4) | → planning     | Approach tradeoffs, spec sections |
| planning      | Scope Qs                | Plan sign-off           | → execution    | Task breakdown, dependency graph  |
| execution     | Blocker resolution      | Checkpoint gates        | → verification | Progress, task completion         |
| verification  | (none typical)          | Verification acceptance | → review       | EXISTS/SUBSTANTIVE/WIRED results  |
| review        | (none typical)          | Review acceptance       | → merge/PR     | Strengths/Issues/Assessment       |

### Future-Proofing for Async

The `emit_interaction` tool returns an `{id, prompt}`. The `id` is a unique interaction ID. Today, the response flows back through the LLM conversation. To add async later:

1. A `resolve_interaction` companion tool accepts `{id, response}`
2. Surface adapters (GitHub, Slack) call `resolve_interaction` when the user responds
3. The skill's next invocation reads resolved interactions from state
4. No changes to `emit_interaction` itself — the async path is additive

This is NOT built now — just noting the extension point is clean.

## Success Criteria

1. **`emit_interaction` tool exists and works** — accepts question, confirmation, and transition types; records interactions in state; returns formatted prompts
2. **Core types are Zod-validated** — `InteractionMessage` types in `packages/core` with schema validation
3. **5 core skills migrated** — brainstorming, planning, execution, verification, and review use `emit_interaction` for all round-trip interactions
4. **Markdown conventions documented and used** — display-only output in migrated skills follows the `**[TYPE]**` pattern
5. **Transitions recorded in handoff** — every `emit_interaction({type: 'transition'})` writes to `.harness/handoff.json`
6. **Existing CLI experience unchanged** — users see the same quality of output; the structured layer is invisible unless a post-processor consumes it
7. **Parseable by regex** — a simple regex can extract structured data from both the markdown conventions and the tool's recorded state
8. **No surface-specific references in skills** — migrated SKILL.md files never mention "terminal," "CLI," or any specific rendering target
9. **Async extension point is clean** — `emit_interaction` returns an `id` that a future `resolve_interaction` tool could consume without changing the existing tool
10. **Other subsystem specs can reference this** — the types, tool, and conventions are stable enough for documentation pipeline, dev loop chaining, etc. to build on

## Implementation Order

1. **Core types + tool schema (parallel with step 2)** — Define `InteractionMessage` types and Zod schemas in `packages/core/src/interaction/types.ts`. Define `emit_interaction` tool input/output schema. These are initial drafts informed by step 2.

2. **Brainstorming SKILL.md migration (parallel with step 1)** — Migrate `harness-brainstorming` to use `emit_interaction` for clarifying questions (Phase 2), spec sign-off (Phase 4), and phase transition. Use markdown conventions for approach tradeoffs and spec sections. Iterate on types if friction emerges.

3. **`emit_interaction` MCP tool implementation** — Implement the tool in `packages/mcp-server/src/tools/interaction.ts`. Wire up state recording and handoff writing. Freeze the types based on what brainstorming migration revealed.

4. **Markdown convention documentation** — Document the `**[TYPE]**` patterns and the regex for parsing them. Add to skill authoring guide so new skills adopt the conventions.

5. **Remaining 4 skill migrations** — Migrate planning, execution, verification, and review SKILL.md files. These use the frozen types — no iteration expected.

6. **CLI adapter utility** — Add `parseConventionalMarkdown()` to OutputFormatter for post-processors that want structured data from display-only output. Not required for terminal rendering but enables future tooling.

7. **Re-export and integration** — Export interaction types from `packages/core/src/index.ts`. Ensure `emit_interaction` is registered in MCP server tool list. Verify the 5 migrated skills work end-to-end in Claude Code and Gemini CLI.
