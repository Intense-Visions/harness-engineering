# Readable emit_interaction Output

**Keywords:** emit_interaction, MCP, content-items, audience-annotations, markdown-rendering, Gemini-CLI, cross-platform

## Overview

The `emit_interaction` MCP tool currently wraps rendered markdown inside a JSON string (`{ id, prompt }`), making output unreadable on clients that display raw MCP responses (notably Gemini CLI). This change restructures the response to return markdown as a first-class text content item, with metadata in a separate annotated item.

### Goals

1. Rendered markdown is directly readable when any MCP client displays tool output
2. Metadata (id, handoffWritten, batchMode, autoTransition) remains accessible to the LLM
3. `audience` annotations future-proof the response for clients that will filter by audience
4. No functional change to what gets recorded in state or handoff files

### Out of Scope

- Changing how Gemini CLI or other clients render MCP responses (we don't control that)
- Migrating to `structuredContent` (deferred until client support stabilizes)
- Changes to `interaction-renderer.ts` (rendering logic is already correct)
- Changes to `interaction-schemas.ts` (input validation is unaffected)

## Decisions

| Decision                                         | Rationale                                                                                                 |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Dual content items over single JSON blob         | Raw JSON is unreadable in Gemini CLI and other clients that don't extract nested fields                   |
| Markdown first, metadata second                  | LLMs and clients that concatenate will lead with human-readable content                                   |
| `audience` annotations on both items             | Spec-blessed mechanism (MCP 2025-06-18+); no-op today but positions for future client filtering           |
| `priority: 1.0` for markdown, `0.2` for metadata | Signals relative importance when clients support priority-based rendering                                 |
| Defer `structuredContent`                        | Claude Code deprioritizes `content` when `structuredContent` is present — risky until behavior stabilizes |

## Technical Design

### Response Format Change

All 4 handler functions in `interaction.ts` change their return format.

**Before:**

```typescript
return { content: [{ type: 'text', text: JSON.stringify({ id, prompt }) }] };
```

**After:**

```typescript
return {
  content: [
    {
      type: 'text',
      text: prompt,
      annotations: { audience: ['user', 'assistant'], priority: 1.0 },
    },
    {
      type: 'text',
      text: JSON.stringify({ id }),
      annotations: { audience: ['assistant'], priority: 0.2 },
    },
  ],
};
```

### Per-Handler Metadata

- **Question:** `{ id }`
- **Confirmation:** `{ id }`
- **Transition:** `{ id, handoffWritten, autoTransition?, nextAction? }`
- **Batch:** `{ id, batchMode: true }`

### Files Changed

| File                                               | Change                                                                                   |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `packages/cli/src/mcp/tools/interaction.ts`        | Update 4 handler return formats to dual content items with annotations                   |
| `packages/cli/src/mcp/utils.ts`                    | Extend `McpResponse` content item type to support `annotations` if needed                |
| `packages/cli/tests/mcp/tools/interaction.test.ts` | Update assertions: `content[0].text` is raw markdown, `content[1].text` is metadata JSON |

### Data Flow

**Before:**

```
render → markdown → JSON.stringify({ id, prompt: markdown }) → content[0].text
```

**After:**

```
render → markdown → content[0].text (audience: user + assistant)
         metadata → content[1].text (audience: assistant)
```

### Migration Concern

Any downstream code parsing `JSON.parse(response.content[0].text).prompt` will break. Implementation must audit for consumers before changing the format.

## Success Criteria

1. When `emit_interaction` returns a question, Gemini CLI displays a readable decision table — not escaped JSON
2. Claude Code brainstorming, planning, and other skills that consume `emit_interaction` responses continue to function correctly
3. The LLM can extract `id`, `handoffWritten`, `autoTransition`, and `batchMode` from `content[1]`
4. `content[0]` has `annotations.audience: ['user', 'assistant']` and `content[1]` has `annotations.audience: ['assistant']`
5. All existing tests pass, updated to assert against the new response shape
6. `recordInteraction` and `saveHandoff` side effects are not affected
7. Audit confirms no downstream code parses `content[0].text` as JSON

## Implementation Order

1. **Audit consumers** — Grep for anything parsing `emit_interaction` responses as JSON (skill code, tests, orchestration logic)
2. **Update `McpResponse` type** — Extend content item type to support `annotations` if needed
3. **Update the 4 handlers** — Change return format in `interaction.ts`
4. **Update tests** — Adjust assertions to match new response shape
5. **Manual verification** — Test with both Claude Code and Gemini CLI to confirm readability
