/**
 * MCP tool: `mcp__harness__uat_signoff`.
 *
 * Records a HUMAN user-acceptance-testing (UAT) sign-off for a change as a
 * single `execution_outcome` node. This is the terminal, human-authority stage
 * of the change lifecycle under `docs/changes/<slug>/` — the same slug used by
 * the spec, plan, code review, and outcome-eval; it records the human's
 * acceptance of the shipped reality against the change's Success Criteria.
 *
 * The CORE CONTRACT that makes UAT distinct from acceptance-eval / outcome-eval:
 * those are spec-vs-implementation, LLM-judged, TS-authority-derived, and
 * merge/ship-blocking. UAT is intent(Success Criteria)-vs-shipped-reality,
 * HUMAN-judged. The human IS the authority — this tool derives NO authority and
 * runs NO LLM. It durably records the decision the human already made. It is
 * advisory / record-only: it never blocks.
 *
 * The node reuses the shared `execution_outcome` shape (via
 * `UatSignoffRecorder` -> `ExecutionOutcomeConnector`) with
 * `metadata.source = 'uat-signoff'`, so the eval-fail-rate signal consumes it
 * for free. The write is degrade-safe and additive: it loads the existing graph,
 * adds one node, and saves.
 */

import * as path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { sanitizePath } from '../utils/sanitize-path.js';

interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/** A per-item disposition as accepted from the caller. */
export interface UatSignoffToolItem {
  id: string;
  disposition: 'ACCEPT' | 'REJECT' | 'CHANGES_REQUESTED';
  note?: string;
}

export interface UatSignoffToolInput {
  /** Change slug — the `docs/changes/<slug>/` owner (same slug as spec/plan/review). Required. */
  slug: string;
  /** The overall human verdict. Required. */
  decision: 'ACCEPTED' | 'REJECTED' | 'CHANGES_REQUESTED';
  /** Name/identity of the human who signed off. Required. */
  signedOffBy: string;
  /** Per-item dispositions ruled on during the interview. */
  items?: UatSignoffToolItem[];
  /** Success-Criterion ids the sign-off closes (the accepted acceptance items). */
  criteriaRefs?: string[];
  /** ISO timestamp of the sign-off; defaults to now when omitted. */
  timestamp?: string;
  /** Project root used to resolve the knowledge graph (default: cwd). */
  path?: string;
}

const DECISIONS = ['ACCEPTED', 'REJECTED', 'CHANGES_REQUESTED'] as const;
const DISPOSITIONS = ['ACCEPT', 'REJECT', 'CHANGES_REQUESTED'] as const;

export const uatSignoffDefinition = {
  name: 'uat_signoff',
  description:
    'Record a HUMAN user-acceptance-testing (UAT) sign-off for a change as one ' +
    'execution_outcome node. The terminal, human-authority stage of the change ' +
    "lifecycle under the `docs/changes/<slug>/` directory: it records the human's " +
    "acceptance of the shipped reality against the change's Success Criteria. Unlike acceptance_eval / " +
    'outcome_eval this runs NO LLM and derives NO authority — the HUMAN is the authority, ' +
    'and the record is advisory (never blocks). Persists metadata.source = "uat-signoff" ' +
    'onto the shared execution_outcome shape so the eval-fail-rate signal consumes it. ' +
    'result is success iff decision === ACCEPTED, else failure. Call this AFTER the ' +
    'guided interview has captured the overall decision, the signer, and per-item ' +
    'dispositions — do not fabricate a verdict.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      slug: {
        type: 'string',
        description: 'Change slug — the docs/changes/<slug>/ owner (same slug as spec/plan/review)',
      },
      decision: {
        type: 'string',
        enum: [...DECISIONS],
        description: 'The overall human verdict (ACCEPTED | REJECTED | CHANGES_REQUESTED)',
      },
      signedOffBy: {
        type: 'string',
        description: 'Name/identity of the human who signed off',
      },
      items: {
        type: 'array',
        description: 'Per-item dispositions ruled on during the interview',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Stable id of the Success-Criterion item (e.g. SC3)',
            },
            disposition: {
              type: 'string',
              enum: [...DISPOSITIONS],
              description: 'The human disposition for this item',
            },
            note: { type: 'string', description: 'Optional free-text note' },
          },
          required: ['id', 'disposition'],
        },
      },
      criteriaRefs: {
        type: 'array',
        items: { type: 'string' },
        description: 'Success-Criterion ids the sign-off closes (the accepted acceptance items)',
      },
      timestamp: {
        type: 'string',
        description: 'ISO timestamp of the sign-off; defaults to now when omitted',
      },
      path: {
        type: 'string',
        description: 'Project root used to resolve the knowledge graph (default: cwd)',
      },
    },
    required: ['slug', 'decision', 'signedOffBy'],
  },
};

/** Validate the required inputs. Returns an error message or null. */
function validateInput(input: UatSignoffToolInput): string | null {
  if (typeof input?.slug !== 'string' || input.slug.length === 0) {
    return 'uat_signoff: `slug` is required';
  }
  if (!DECISIONS.includes(input?.decision)) {
    return `uat_signoff: \`decision\` must be one of ${DECISIONS.join(' | ')}`;
  }
  if (typeof input?.signedOffBy !== 'string' || input.signedOffBy.length === 0) {
    return 'uat_signoff: `signedOffBy` is required';
  }
  return null;
}

/** Normalize the tool input into the recorder's `UatSignoffInput` (drops empty optionals). */
function toRecorderInput(input: UatSignoffToolInput) {
  return {
    slug: input.slug,
    decision: input.decision,
    signedOffBy: input.signedOffBy,
    items: Array.isArray(input.items) ? input.items : [],
    ...(Array.isArray(input.criteriaRefs) ? { criteriaRefs: input.criteriaRefs } : {}),
    ...(typeof input.timestamp === 'string' && input.timestamp !== ''
      ? { timestamp: input.timestamp }
      : {}),
  };
}

/** Render the success payload — a record-only confirmation (nothing was blocked). */
function successResponse(args: {
  outcomeId: string;
  decision: UatSignoffToolInput['decision'];
  nodesAdded: number;
  graphDir: string;
}): ToolResponse {
  const body = {
    recorded: true,
    outcomeId: args.outcomeId,
    result: args.decision === 'ACCEPTED' ? 'success' : 'failure',
    nodesAdded: args.nodesAdded,
    graphPath: path.join(args.graphDir, 'graph.json'),
    note: 'Advisory / record-only — human is the authority; nothing was blocked.',
  };
  return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
}

export async function handleUatSignoff(input: UatSignoffToolInput): Promise<ToolResponse> {
  const validationError = validateInput(input);
  if (validationError !== null) return errorResponse(validationError);

  try {
    const projectRoot = sanitizePath(input.path ?? process.cwd());
    const { GraphStore, resolveGraphDir } = await import('@harness-engineering/graph');
    const { UatSignoffRecorder } = await import('@harness-engineering/intelligence');

    const graphDir = resolveGraphDir(projectRoot);
    await mkdir(graphDir, { recursive: true });

    // Load the existing graph so the write is additive; a missing graph leaves
    // the store empty (the sign-off node is still written and saved below).
    const store = new GraphStore();
    await store.load(graphDir);

    const { outcomeId, ingest } = new UatSignoffRecorder(store).record(toRecorderInput(input));
    await store.save(graphDir);

    return successResponse({
      outcomeId,
      decision: input.decision,
      nodesAdded: ingest.nodesAdded,
      graphDir,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(`uat_signoff failed: ${message}`);
  }
}

function errorResponse(message: string): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}
