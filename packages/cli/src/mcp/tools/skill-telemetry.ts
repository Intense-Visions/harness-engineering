/**
 * Skill-lifecycle telemetry writer (relocated off the retired core `events.jsonl` — #580 D5).
 *
 * Phase 5 retires `.harness/events.jsonl` as the audit/timeline source. The skill-lifecycle
 * telemetry stream (phase_transition / gate_result / handoff / error / skill-invoked) that the
 * adoption-tracker Stop hook consumes is preserved here, relocated to a CLI-owned, renamed file
 * `.harness/metrics/skill-events.jsonl`. Self-contained: no dependency on core/state/events.ts.
 *
 * Contract: non-fatal (never throws, never blocks an MCP response), root-scoped (always writes
 * to `.harness/metrics/skill-events.jsonl` with no stream/session) so the adoption-tracker can
 * find events deterministically.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/** Skill-lifecycle event types (self-contained; formerly core's EventType). */
export type SkillEventType =
  | 'phase_transition'
  | 'decision'
  | 'gate_result'
  | 'handoff'
  | 'error'
  | 'checkpoint';

/**
 * Caller-supplied skill-telemetry record (self-contained; formerly core's EmitEventInput).
 * `timestamp` is stamped on write.
 */
export interface SkillEventInput {
  skill: string;
  session?: string;
  type: SkillEventType;
  summary: string;
  data?: Record<string, unknown>;
  refs?: string[];
}

/** Relative path (under the project root) of the relocated skill-telemetry log. */
export const SKILL_EVENTS_FILE = join('.harness', 'metrics', 'skill-events.jsonl');

/**
 * Emit a skill lifecycle event. Errors are silently swallowed — telemetry must never
 * interfere with tool execution. Appends one timestamped JSONL line (crash-safe append).
 */
export async function emitSkillEvent(projectPath: string, event: SkillEventInput): Promise<void> {
  try {
    const metricsDir = join(projectPath, '.harness', 'metrics');
    mkdirSync(metricsDir, { recursive: true });
    const record = { ...event, timestamp: new Date().toISOString() };
    appendFileSync(join(metricsDir, 'skill-events.jsonl'), JSON.stringify(record) + '\n');
  } catch {
    // Silent — telemetry must never block MCP tool responses.
  }
}
