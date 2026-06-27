// packages/cli/src/shared/state-events.ts
//
// Single compose point for the event-sourced core-state read/write path. Both the MCP tools
// (manage_state, recordInteraction, gather_context, the state resource) and the `state show`
// CLI import these two helpers so genesis import composes with read/write in exactly one place.
//
// The event-sourcing primitives are published under the `eventSourcing` namespace of
// `@harness-engineering/core` (the legacy top-level `emitEvent`/`loadEvents` are the skill-event
// log, NOT this store), so we destructure them from that namespace.
import { eventSourcing, Ok, type HarnessState, type Result } from '@harness-engineering/core';

const { importLegacyState, readSnapshot, toHarnessState, emitEvent } = eventSourcing;

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

/** Authoritative write: genesis-import first (so appends union onto legacy) → emit one event. */
export async function emitCoreEvent(
  projectPath: string,
  event: eventSourcing.EventInput,
  scope?: Scope
): Promise<Result<eventSourcing.EmitResult, Error>> {
  await importLegacyState(projectPath, scope); // capture legacy state before the first append
  return emitEvent(projectPath, event, scope);
}
