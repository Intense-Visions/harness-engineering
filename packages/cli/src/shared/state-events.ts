// packages/cli/src/shared/state-events.ts
//
// Single compose point for the event-sourced core-state read/write path. Both the MCP tools
// (manage_state, recordInteraction, gather_context, the state resource) and the `state show`
// CLI import these two helpers so genesis import composes with read/write in exactly one place.
//
// The event-sourcing primitives are published under the `eventSourcing` namespace of
// `@harness-engineering/core`. The legacy top-level skill-event log (`events.jsonl`) was retired
// in Phase 5 (GH-580): its audit/timeline role is subsumed by this store's audit projection, and
// its skill-telemetry role was relocated CLI-side (metrics/skill-events.jsonl).
import { eventSourcing, Ok, type HarnessState, type Result } from '@harness-engineering/core';

const { importLegacyState, readSnapshot, toHarnessState, emitEvent, formatAuditTimeline } =
  eventSourcing;

interface Scope {
  stream?: string | undefined;
  session?: string | undefined;
}

/** Authoritative read: genesis-import (idempotent) → snapshot → legacy-shaped HarnessState. */
export async function readHarnessState(
  projectPath: string,
  scope?: Scope
): Promise<Result<HarnessState, Error>> {
  await importLegacyState(projectPath, scope); // idempotent, memoized
  const snap = await readSnapshot(projectPath, scope);
  if (!snap.ok) return snap;
  return Ok(toHarnessState(snap.value.coreState));
}

/**
 * True when a projected state carries no meaningful content. Used by readers that historically
 * gated on `fs.existsSync(state.json)` — after the cutover the file is gone, so "is there state
 * worth showing?" becomes "is the projection non-empty?" rather than "does a file exist?".
 */
export function isEmptyHarnessState(s: HarnessState): boolean {
  return (
    s.decisions.length === 0 &&
    s.blockers.length === 0 &&
    Object.keys(s.progress).length === 0 &&
    !s.position.phase &&
    !s.position.task &&
    !s.lastSession
  );
}

/** Authoritative write: genesis-import first (so appends union onto legacy) → emit one event. */
export async function emitCoreEvent(
  projectPath: string,
  event: eventSourcing.EventInput,
  scope?: Scope
): Promise<Result<eventSourcing.EmitResult, Error>> {
  await importLegacyState(projectPath, scope); // capture legacy state before the first append
  return emitEvent(projectPath, event, scope);
}

// --- Phase 5: audit-trail emit + read helpers (subsumes GH-580) ---
// These ride the same authoritative log as core-state; the audit subdocument is folded
// additively by projectAudit. emitCoreEvent's genesis-import-then-append keeps legacy state intact.

/** Append a verbatim user_input_captured audit event. */
export async function emitUserInputCaptured(
  projectPath: string,
  text: string,
  interactionId?: string,
  scope?: Scope
): Promise<Result<eventSourcing.EmitResult, Error>> {
  const payload: eventSourcing.EventInput['payload'] = interactionId
    ? { text, interactionId }
    : { text };
  return emitCoreEvent(
    projectPath,
    { type: 'user_input_captured', payload } as eventSourcing.EventInput,
    scope
  );
}

/** Append an approval_requested audit event carrying the verbatim prompt. */
export async function emitApprovalRequested(
  projectPath: string,
  interactionId: string,
  kind: string,
  prompt: string,
  scope?: Scope
): Promise<Result<eventSourcing.EmitResult, Error>> {
  return emitCoreEvent(
    projectPath,
    { type: 'approval_requested', payload: { interactionId, kind, prompt } },
    scope
  );
}

/** Append an approval_resolved audit event carrying the verbatim response. */
export async function emitApprovalResolved(
  projectPath: string,
  interactionId: string,
  response: string,
  scope?: Scope
): Promise<Result<eventSourcing.EmitResult, Error>> {
  return emitCoreEvent(
    projectPath,
    { type: 'approval_resolved', payload: { interactionId, response } },
    scope
  );
}

/** Render the observability timeline from the audit projection (replaces formatEventTimeline). */
export async function readAuditTimeline(projectPath: string, scope?: Scope): Promise<string> {
  const snap = await readSnapshot(projectPath, scope);
  if (!snap.ok) return '';
  return formatAuditTimeline(snap.value.audit);
}
