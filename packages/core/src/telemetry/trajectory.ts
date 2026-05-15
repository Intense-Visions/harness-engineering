/**
 * TrajectoryBuilder — joins `.harness/metrics/adoption.jsonl` records with
 * an in-memory `AgentEvent[]` snapshot to produce a `TrajectoryMetadata`
 * summary for a single session. The metadata is then attached to a
 * `maintenance_run` parent span via the OTLP exporter.
 *
 * - Adoption records: contribute `phasesReached`, turn count (one per
 *   skill invocation), and total duration.
 * - Agent events: contribute tool-call counts and aggregated token spend
 *   (including prompt-cache create/read tokens).
 *
 * The builder is a pure function over its inputs; it does not write to
 * disk and does not depend on a live orchestrator instance. Read the
 * adoption file with `readAdoptionRecords()` and pass an event snapshot
 * captured during the session.
 */

import type { AgentEvent, TokenUsage, TrajectoryMetadata } from '@harness-engineering/types';
import { readAdoptionRecords } from '../adoption/reader';

/**
 * Inputs accepted by {@link TrajectoryBuilder.fromSession}. The events
 * snapshot is optional — when omitted, only adoption-derived fields are
 * populated and token spend / tool calls remain zero.
 */
export interface TrajectoryBuilderInput {
  sessionId: string;
  projectRoot: string;
  events?: AgentEvent[];
}

const EMPTY_METADATA: TrajectoryMetadata = {
  turnsCount: 0,
  toolCallCount: 0,
  modelTokenSpend: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
  promptCacheHit: 0,
  promptCacheMiss: 0,
  totalDurationMs: 0,
  phasesReached: [],
};

function isToolCallEvent(ev: AgentEvent): boolean {
  // Anthropic-style events emit `tool_use` / `tool_call` as the type or
  // subtype; we accept both spellings to stay resilient to backend churn.
  return (
    ev.type === 'tool_use' ||
    ev.type === 'tool_call' ||
    ev.subtype === 'tool_use' ||
    ev.subtype === 'tool_call'
  );
}

function addUsage(acc: TrajectoryMetadata['modelTokenSpend'], usage: TokenUsage): void {
  acc.input += usage.inputTokens ?? 0;
  acc.output += usage.outputTokens ?? 0;
  acc.cacheCreation += usage.cacheCreationTokens ?? 0;
  acc.cacheRead += usage.cacheReadTokens ?? 0;
}

export class TrajectoryBuilder {
  /**
   * Build a {@link TrajectoryMetadata} for a single session by joining
   * adoption.jsonl records (filtered to `sessionId`) with the supplied
   * AgentEvent snapshot.
   *
   * Returns the zero-metadata when no records exist and no events are
   * supplied — callers can still attach the (empty) object as a span
   * attribute without a null branch.
   */
  static fromSession(input: TrajectoryBuilderInput): TrajectoryMetadata {
    const { sessionId, projectRoot, events = [] } = input;

    const adoption = readAdoptionRecords(projectRoot).filter((r) => r.session === sessionId);
    if (adoption.length === 0 && events.length === 0) {
      return { ...EMPTY_METADATA, modelTokenSpend: { ...EMPTY_METADATA.modelTokenSpend } };
    }

    const phasesSet = new Set<string>();
    let totalDurationMs = 0;
    for (const record of adoption) {
      for (const phase of record.phasesReached) phasesSet.add(phase);
      totalDurationMs += record.duration;
    }

    const modelTokenSpend = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };
    let toolCallCount = 0;
    let promptCacheHit = 0;
    let promptCacheMiss = 0;

    for (const ev of events) {
      if (isToolCallEvent(ev)) toolCallCount++;
      if (ev.usage) {
        addUsage(modelTokenSpend, ev.usage);
        // A response is a "cache hit" when the model reported a non-zero
        // cacheReadTokens; otherwise it is a miss. This matches the
        // recorder semantics in CacheMetricsRecorder.record().
        if ((ev.usage.cacheReadTokens ?? 0) > 0) promptCacheHit++;
        else promptCacheMiss++;
      }
    }

    return {
      turnsCount: adoption.length,
      toolCallCount,
      modelTokenSpend,
      promptCacheHit,
      promptCacheMiss,
      totalDurationMs,
      phasesReached: Array.from(phasesSet),
    };
  }
}
