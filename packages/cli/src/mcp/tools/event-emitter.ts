/**
 * Fire-and-forget skill-telemetry emission for MCP tool handlers.
 *
 * Phase 5 (#580 D5) relocated the skill-lifecycle telemetry stream off the retired core
 * `events.jsonl` onto a CLI-owned `.harness/metrics/skill-events.jsonl`. This module is kept
 * as the stable import surface for the call sites (state.ts / interaction.ts / skill.ts);
 * it re-exports the relocated writer so those call sites are unchanged.
 *
 * - Non-fatal: never throws, never blocks an MCP response
 * - Root-scoped: always writes to `.harness/metrics/skill-events.jsonl` (no stream/session)
 *   so the adoption-tracker Stop hook can find events
 */
export { emitSkillEvent } from './skill-telemetry.js';
