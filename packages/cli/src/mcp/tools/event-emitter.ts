/**
 * Fire-and-forget event emission for MCP tool handlers.
 *
 * Wraps core emitEvent() with:
 * - Non-fatal: never throws, never blocks MCP response
 * - Root-scoped: always writes to .harness/events.jsonl (no stream/session)
 *   so the adoption-tracker Stop hook can find events
 */
import type { EmitEventInput } from '@harness-engineering/core';

/**
 * Emit a skill lifecycle event. Errors are silently swallowed —
 * telemetry must never interfere with tool execution.
 */
export async function emitSkillEvent(projectPath: string, event: EmitEventInput): Promise<void> {
  try {
    const { emitEvent } = await import('@harness-engineering/core');
    // No stream/session — always write to root .harness/events.jsonl
    await emitEvent(projectPath, event);
  } catch {
    // Silent — telemetry must never block MCP tool responses
  }
}
