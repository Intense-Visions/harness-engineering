# Session Summarization (Hermes Phase 1)

**Status:** shipped
**Spec:** [docs/changes/hermes-phase-1-session-search/proposal.md](../../changes/hermes-phase-1-session-search/proposal.md)
**ADR:** [0013-hermes-phase-1-session-memory-architecture.md](../decisions/0013-hermes-phase-1-session-memory-architecture.md)

## What it is

A best-effort, retrospective LLM-driven summary written as `llm-summary.md`
inside every archived session directory. The summary is generated **once**
when the session is archived; it is independent of the operator-authored
`summary.md` (`SessionSummaryData.keyContext`) that the agent maintains
during the live session.

The summary's purpose is downstream retrieval — when Phase 4 (Skill
Proposal Loop) wants to surface "find similar sessions", the FTS5 index
includes the LLM summary as one of its indexable `file_kind`s, and BM25
ranks against the structured retrospective.

## Trigger

`archiveSession()` accepts an optional `options.hooks: ArchiveHooks`
argument. Hooks are constructed by
`buildArchiveHooks({ projectPath, provider, config, logger })` in
`packages/orchestrator/src/sessions/archive-hooks.ts`. The MCP `archive_session`
action and any other caller can opt into the hook by passing it in.

```
session-archive.ts: archiveSession(path, slug, { hooks })
  → fs.renameSync(sessionDir → archiveDir)
  → await hooks.onArchived({ sessionId, archiveDir, projectPath })
       → step 1: summarizeArchivedSession (best-effort)
       → step 2: indexSessionDirectory     (best-effort)
```

Both inner steps are wrapped in `try/catch`. Failure of either does not
propagate. The archive itself is already durable by the time the hook
runs — losing a summary cannot lose the session.

## Schema

`packages/types/src/hermes.ts` defines the Zod schema:

```ts
export const SessionSummarySchema = z.object({
  headline: z.string().min(1).max(120),
  keyOutcomes: z.array(z.string()).max(20),
  openQuestions: z.array(z.string()).max(20),
  relatedSessions: z.array(z.string()).default([]),
});
```

The provider is called via
`AnalysisProvider.analyze<SessionSummary>({ prompt, systemPrompt,
responseSchema, model? })` — the same path used by the SEL/PESL layers in
the rest of the orchestrator. Token usage and model are read off the
response and persisted into the markdown frontmatter.

## On-disk format

```markdown
---
generatedAt: 2026-05-16T10:32:11.000Z
model: claude-sonnet-4-6
inputTokens: 6132
outputTokens: 421
schemaVersion: 1
---

## Headline

<one-sentence retrospective>

## Key outcomes

- <outcome 1>
- ...

## Open questions

- <question 1>
- ...

## Related sessions

- <slug>
- ...
```

Empty sections render as `_(none)_` so the file always has the same shape.

## Failure modes

| Condition                              | Behaviour                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| No provider configured                 | Step skipped; archive completes; no `llm-summary.md` written; logger emits a `warn` if verbose.  |
| Provider throws (rate-limit, network)  | `writeStubOnError=true` (default) writes a `## Summary unavailable` stub with `reason: <error>`. |
| Provider timeout (default 60 s)        | Same as throw — caught by `Promise.race` and logged.                                             |
| Schema validation fails                | Defensive `safeParse` catches it; stub is written; returns `Err`.                                |
| Archive dir is missing                 | Returns `Err` immediately; nothing written.                                                      |
| Archive dir has zero recognised inputs | Returns `Err`; nothing written. (Edge case: an archive with only `state.json` and no markdown.)  |

## Config

```jsonc
{
  "hermes": {
    "summary": {
      "enabled": true, // default: true when intelligence.provider configured
      "inputBudgetTokens": 16000,
      "timeoutMs": 60000,
      "model": "claude-sonnet-4-6", // optional; falls back to agent.model
    },
  },
}
```

`enabled: undefined` means "default to on when a provider is available."
Caller (`buildArchiveHooks`) verifies provider presence and short-circuits
gracefully when missing.

## Token budget

Inputs are concatenated as `## FILE: <kind>\n\n<body>` separators across
`summary.md`, `learnings.md`, `failures.md`, `session-sections.md` (any
that exist; empty files are skipped). The corpus is then truncated to
`inputBudgetTokens * 4` characters (approx 4 chars/token) with a
`[TRUNCATED — input exceeded token budget]` marker. This is a conservative
heuristic, not a real tokenizer — we cap inputs deterministically without
shipping an Anthropic-token-counter dependency.

## CLI / MCP re-summarization

The auto-archive trigger writes the summary once. If the archive needs to
be re-summarized (model upgrade, prompt change, manual override), use the
MCP tool `summarize_session`:

```jsonc
// tier: standard (LLM-spend implication is explicit)
{
  "name": "summarize_session",
  "input": {
    "path": "/path/to/project",
    "sessionId": "hermes-phase-1-2026-05-16",
    "force": true, // overwrite an existing llm-summary.md (otherwise no-op)
  },
}
```

The tool resolves an `AnthropicAnalysisProvider` from
`ANTHROPIC_API_KEY` in env; if no provider can be resolved, the tool
returns an explicit error instead of silently skipping.

## Why this is **additive**, not replacement

The parent meta-spec line "`keyContext` becomes LLM-populated rather than
hand-written" was walked back during brainstorming. `keyContext` is the
mid-session note an agent writes while working — operator-controlled,
shaped by the active task. The LLM summary is a retrospective, written
once after archive, structurally typed, designed for downstream retrieval.
Conflating them would have broken the existing operator/agent UX contract.
The two surfaces coexist in the archived directory:

- `summary.md` — what the agent wrote during the session (operator-controlled).
- `llm-summary.md` — what the LLM produced retrospectively (additive, structured).

Both participate in the FTS5 index as separate `file_kind`s.

## Related

- [Session search](./session-search.md) — companion FTS5 index that
  includes `llm_summary` as one of its indexable file kinds.
- [State management](./state-management.md) — session lifecycle.
- [Intelligence pipeline](../intelligence/pipeline.md) — the
  `AnalysisProvider` interface this hook consumes.
