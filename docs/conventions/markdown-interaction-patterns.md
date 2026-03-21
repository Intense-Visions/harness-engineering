# Markdown Interaction Patterns

**Date:** 2026-03-21
**Spec:** docs/changes/interaction-surface-abstraction/proposal.md

## Purpose

Display-only output from harness skills uses conventional markdown patterns.
These patterns are human-readable in any terminal or markdown viewer, and
parseable by regex for post-processors and future surface adapters.

## Patterns

### Finding

```
**[CRITICAL]** Title of the finding
> Detailed explanation of what's wrong and why it matters
> Suggestion: how to fix it
```

Severities: `CRITICAL`, `IMPORTANT`, `SUGGESTION`

### Progress

```
**[Phase 3/7]** Context scoping — loading graph and computing impact
```

### Strength (reviews)

```
**[STRENGTH]** Clean separation of parsing and validation logic
```

### Auto-fix log

```
**[FIXED]** Added missing traceability link: goal "fast startup" → criterion #4
```

## Parsing Regex

All patterns can be extracted with:

```
\*\*\[(CRITICAL|IMPORTANT|SUGGESTION|STRENGTH|FIXED|Phase \d+/\d+)\]\*\*
```

## Round-Trip Interactions

For interactions requiring a user response (questions, confirmations,
phase transitions), use the `emit_interaction` MCP tool instead of
markdown conventions. See the spec for details.

## Guidelines for Skill Authors

1. Use `**[TYPE]**` patterns for all display-only structured output.
2. Use `emit_interaction` for all round-trip interactions.
3. Never reference a specific surface ("terminal", "CLI", "GitHub") in
   skill instructions. The abstraction handles surface differences.
4. Markdown conventions degrade gracefully — they look good in any
   markdown-capable viewer without special rendering.
