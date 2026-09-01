/**
 * Refinement-request telemetry writer/reader (progressive-context demand signal).
 *
 * The filesystem half of the measurement layer defined in
 * `@harness-engineering/core`'s `refinement-demand`. Every served refinement
 * request (`code_outline` / `code_search` / `code_unfold`, and future `expand-*`
 * operations) is appended as one JSONL line tagged with its progressive-domain
 * context class; `readRefinementDemand` reads that log back and aggregates it
 * into the ranked per-class demand signal.
 *
 * Contract copied verbatim from the sibling `skill-telemetry.ts`: non-fatal
 * (never throws, never blocks an MCP response), append-only JSONL under
 * `.harness/metrics/refinement-events.jsonl`, timestamp stamped on write.
 */
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { aggregateDemand, classifyRefinement } from '@harness-engineering/core';
import type {
  RefinementContextClass,
  RefinementDemandReport,
  RefinementOperation,
  RefinementRequest,
} from '@harness-engineering/core';

/** Relative path (under the project root) of the refinement-demand log. */
export const REFINEMENT_EVENTS_FILE = join('.harness', 'metrics', 'refinement-events.jsonl');

/**
 * Record one refinement request. Errors are silently swallowed — telemetry must
 * never interfere with tool execution. Derives `contextClass` from the operation
 * when not given, stamps a timestamp, and appends one JSONL line (crash-safe
 * append).
 */
export function recordRefinement(
  projectPath: string,
  input: {
    operation: RefinementOperation;
    contextClass?: RefinementContextClass;
    target?: string;
  }
): void {
  try {
    const metricsDir = join(projectPath, '.harness', 'metrics');
    mkdirSync(metricsDir, { recursive: true });
    const record: RefinementRequest = {
      operation: input.operation,
      contextClass: input.contextClass ?? classifyRefinement(input.operation),
      ...(input.target !== undefined ? { target: input.target } : {}),
      timestamp: new Date().toISOString(),
    };
    appendFileSync(join(metricsDir, 'refinement-events.jsonl'), JSON.stringify(record) + '\n');
  } catch {
    // Silent — telemetry must never block MCP tool responses.
  }
}

/**
 * Read the refinement-demand log and aggregate it into the demand signal. A
 * missing/empty file yields the all-zero 4-class report; unparseable lines are
 * skipped without throwing.
 */
export function readRefinementDemand(projectPath: string): RefinementDemandReport {
  let raw: string;
  try {
    raw = readFileSync(join(projectPath, REFINEMENT_EVENTS_FILE), 'utf-8');
  } catch {
    return aggregateDemand([]);
  }

  const requests: RefinementRequest[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      requests.push(JSON.parse(trimmed) as RefinementRequest);
    } catch {
      // Skip malformed lines — parse-tolerant by design.
    }
  }

  return aggregateDemand(requests);
}
