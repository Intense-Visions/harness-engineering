// packages/core/src/state/events.ts
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import { getStateDir } from './state-shared';
import { EVENTS_FILE } from './constants';
import { computeContentHash } from './learnings';

/** Event types emitted at skill lifecycle points. */
export type EventType =
  | 'phase_transition'
  | 'decision'
  | 'gate_result'
  | 'handoff'
  | 'error'
  | 'checkpoint';

/** A structured skill lifecycle event. */
export interface SkillEvent {
  timestamp: string;
  skill: string;
  session?: string;
  type: EventType;
  summary: string;
  data?: Record<string, unknown>;
  refs?: string[];
  contentHash?: string;
}

/** Zod schema for validating SkillEvent objects. */
export const SkillEventSchema = z.object({
  timestamp: z.string(),
  skill: z.string(),
  session: z.string().optional(),
  type: z.enum(['phase_transition', 'decision', 'gate_result', 'handoff', 'error', 'checkpoint']),
  summary: z.string(),
  data: z.record(z.unknown()).optional(),
  refs: z.array(z.string()).optional(),
  contentHash: z.string().optional(),
});

/** Input to emitEvent — timestamp and contentHash are computed automatically. */
export type EmitEventInput = Omit<SkillEvent, 'timestamp' | 'contentHash'>;

export interface EmitEventOptions {
  session?: string;
  stream?: string;
}

export interface EmitEventResult {
  written: boolean;
  reason?: string;
}

/**
 * Compute a content hash for deduplication from the event's identity fields.
 * Uses {skill, type, summary, session} tuple as specified in the proposal.
 */
function computeEventHash(event: EmitEventInput, session?: string): string {
  const identity = `${event.skill}|${event.type}|${event.summary}|${session ?? ''}`;
  return computeContentHash(identity);
}

// In-memory cache of known event hashes per events file path.
// Avoids re-reading the entire JSONL file on every emitEvent call.
const knownHashesCache = new Map<string, Set<string>>();

/** Load the set of content hashes from an events file, using the in-memory cache. */
function loadKnownHashes(eventsPath: string): Set<string> {
  const cached = knownHashesCache.get(eventsPath);
  if (cached) return cached;

  const hashes = new Set<string>();
  if (fs.existsSync(eventsPath)) {
    const content = fs.readFileSync(eventsPath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim() !== '');
    for (const line of lines) {
      try {
        const existing = JSON.parse(line) as SkillEvent;
        if (existing.contentHash) {
          hashes.add(existing.contentHash);
        }
      } catch {
        // Skip malformed lines
      }
    }
  }
  knownHashesCache.set(eventsPath, hashes);
  return hashes;
}

/** Clear the known-hashes cache (for testing). */
export function clearEventHashCache(): void {
  knownHashesCache.clear();
}

/**
 * Emit a structured event to the JSONL event log.
 *
 * - Appends one JSON line to events.jsonl (crash-safe via appendFileSync)
 * - Born-deduplicated: same {skill, type, summary, session} tuple writes only once
 * - Session-scoped when options.session is provided
 * - Uses in-memory hash set for O(1) dedup checks after initial file load
 */
export async function emitEvent(
  projectPath: string,
  event: EmitEventInput,
  options?: EmitEventOptions
): Promise<Result<EmitEventResult, Error>> {
  try {
    const dirResult = await getStateDir(projectPath, options?.stream, options?.session);
    if (!dirResult.ok) return dirResult;
    const stateDir = dirResult.value;
    const eventsPath = path.join(stateDir, EVENTS_FILE);

    fs.mkdirSync(stateDir, { recursive: true });

    // Compute content hash for dedup
    const contentHash = computeEventHash(event, options?.session);

    // O(1) duplicate check via in-memory hash set (loaded once per events file)
    const knownHashes = loadKnownHashes(eventsPath);
    if (knownHashes.has(contentHash)) {
      return Ok({ written: false, reason: 'duplicate' });
    }

    // Build the full event
    const fullEvent: SkillEvent = {
      ...event,
      timestamp: new Date().toISOString(),
      contentHash,
    };
    if (options?.session) {
      fullEvent.session = options.session;
    }

    // Append as JSONL (one line, crash-safe)
    fs.appendFileSync(eventsPath, JSON.stringify(fullEvent) + '\n');

    // Update the in-memory cache
    knownHashes.add(contentHash);

    return Ok({ written: true });
  } catch (error) {
    return Err(
      new Error(`Failed to emit event: ${error instanceof Error ? error.message : String(error)}`)
    );
  }
}

export interface LoadEventsOptions {
  session?: string | undefined;
  stream?: string | undefined;
}

/**
 * Load all events from the JSONL event log.
 * Skips malformed lines gracefully.
 */
export async function loadEvents(
  projectPath: string,
  options?: LoadEventsOptions
): Promise<Result<SkillEvent[], Error>> {
  try {
    const dirResult = await getStateDir(projectPath, options?.stream, options?.session);
    if (!dirResult.ok) return dirResult;
    const stateDir = dirResult.value;
    const eventsPath = path.join(stateDir, EVENTS_FILE);

    if (!fs.existsSync(eventsPath)) {
      return Ok([]);
    }

    const content = fs.readFileSync(eventsPath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim() !== '');
    const events: SkillEvent[] = [];

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        const result = SkillEventSchema.safeParse(parsed);
        if (result.success) {
          events.push(result.data as SkillEvent);
        }
      } catch {
        // Skip malformed lines — JSONL resilience
      }
    }

    return Ok(events);
  } catch (error) {
    return Err(
      new Error(`Failed to load events: ${error instanceof Error ? error.message : String(error)}`)
    );
  }
}

/** Format a phase_transition event's detail string. */
function formatPhaseTransition(event: SkillEvent): string {
  const data = event.data as { from?: string; to?: string; taskCount?: number } | undefined;
  const suffix = data?.taskCount ? ` (${data.taskCount} tasks)` : '';
  return `phase: ${data?.from ?? '?'} -> ${data?.to ?? '?'}${suffix}`;
}

/** Format a gate_result event's detail string. */
function formatGateResult(event: SkillEvent): string {
  const data = event.data as
    | {
        passed?: boolean;
        checks?: Array<{ name: string; passed: boolean }>;
      }
    | undefined;
  const status = data?.passed ? 'passed' : 'failed';
  const checks = data?.checks?.map((c) => `${c.name} ${c.passed ? 'Y' : 'N'}`).join(', ');
  return checks ? `gate: ${status} (${checks})` : `gate: ${status}`;
}

/** Format a handoff event's detail string. */
function formatHandoffDetail(event: SkillEvent): string {
  const data = event.data as { fromSkill?: string; toSkill?: string } | undefined;
  const direction = data?.toSkill ? ` -> ${data.toSkill}` : '';
  return `handoff: ${event.summary}${direction}`;
}

/** Map of event type to detail formatter. Simple types just prefix the summary. */
const EVENT_FORMATTERS: Record<EventType, (event: SkillEvent) => string> = {
  phase_transition: formatPhaseTransition,
  gate_result: formatGateResult,
  decision: (event) => `decision: ${event.summary}`,
  handoff: formatHandoffDetail,
  error: (event) => `error: ${event.summary}`,
  checkpoint: (event) => `checkpoint: ${event.summary}`,
};

/**
 * Format events as a compact timeline for display in gather_context.
 *
 * Example output:
 * - 10:30 [harness-execution] phase: PREPARE -> EXECUTE (12 tasks)
 * - 10:45 [harness-execution] gate: passed (test Y, lint Y)
 * - 11:02 [harness-execution] decision: Use polling over WebSocket
 */
export function formatEventTimeline(events: SkillEvent[], limit: number = 20): string {
  if (events.length === 0) return '';

  const recent = events.slice(-limit);
  return recent
    .map((event) => {
      const time = formatTime(event.timestamp);
      const formatter = EVENT_FORMATTERS[event.type];
      const detail = formatter ? formatter(event) : event.summary;
      return `- ${time} [${event.skill}] ${detail}`;
    })
    .join('\n');
}

/** Extract HH:MM from an ISO timestamp string. */
function formatTime(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  } catch {
    return '??:??';
  }
}
