---
type: business_process
domain: core
tags: [state, streams, sessions, persistence, isolation]
---

# State Management

The state module is the operational memory of Harness, persisting project health, decisions, learnings, and session state across skill executions.

## Stream-Based Isolation

Each git branch gets its own state stream at `.harness/streams/{stream-name}/`, preventing state collision when developers work on parallel branches. Streams are auto-created on first use and track creation and last-active timestamps for cleanup.

## Session Layering

Within each stream, sessions add an additional isolation layer at `.harness/sessions/{session-id}/`. Sessions accumulate section-based state (terminology, decisions, constraints, risks, open questions, evidence) across skill executions. This enables cold-start context restoration and cross-skill state sharing.

## HarnessState Structure

The core state object tracks: current position (phase/task), decisions made, blockers encountered, and per-task progress (pending/in_progress/complete). Updated by orchestrators between skill turns.

## Self-Healing Reads

All state reads self-heal: if files are missing or corrupted, the system returns sensible defaults (empty collections) rather than failing. State persists with schema version 1, enabling forward compatibility as structures evolve.

## Handoff Protocol

When transitioning between skills, a Handoff captures: completed tasks, pending work, blockers, and recommended next skills. This reduces context loss during skill transitions and enables smooth hand-off.
