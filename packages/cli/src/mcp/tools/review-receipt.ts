import { sanitizePath } from '../utils/sanitize-path.js';
import { type McpResponse, mcpError } from '../utils.js';
import type { ToolDefinition } from '../tool-types.js';
import {
  REVIEW_MOMENTS,
  runCheckReviewReceipt,
  type CwdGit,
  type ReviewGateFailure,
} from '../../review-receipts/gate.js';

/**
 * Shift-left pipeline fidelity, Phase 1: the review receipt gate as an MCP tool. Same code path
 * as `harness check-review-receipt`. It is not part of check_phase_gate, which maps
 * implementation files to spec files and has no session concept.
 */
export const checkReviewReceiptDefinition: ToolDefinition = {
  name: 'check_review_receipt',
  description:
    'Gate a review receipt: recomputes HEAD, the diff file set, the base and every reviewer findings file, ' +
    'checks the receipt is for the review its directory names, and treats the receipt fields as claims. Returns { pass, reviewersRun, reviewersRequired } plus ' +
    '`failures`, whose shape varies: `failures` is absent on a pass, ' +
    'a single object {code, reviewerId?, message} when there is exactly one failure, and ' +
    'an array of them when there are two or more. Gate on `pass` alone: pass:false (including ' +
    'RECEIPT_MISSING) means the review state may not be left. Needs no model credential.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      receipt: {
        type: 'string',
        description:
          'Path to receipt.json or to the review directory holding it, absolute or relative to path. It must be inside path',
      },
      moment: {
        type: 'string',
        enum: [...REVIEW_MOMENTS],
        description:
          'Which review this is, for a receipt directory that does not say (phase-N, final-all and a directory directly under .harness/reviews each do). Contradicting the directory fails the gate',
      },
    },
    required: ['path', 'receipt'],
  },
};

/** Injected inputs (tests); production runs real git. */
export interface CheckReviewReceiptToolDeps {
  git?: CwdGit;
}

function gateError(message: string): McpResponse {
  const failures: ReviewGateFailure[] = [{ code: 'GATE_ERROR', message }];
  return mcpError(JSON.stringify({ pass: false, failures }));
}

export async function handleCheckReviewReceipt(
  input: Record<string, unknown>,
  deps: CheckReviewReceiptToolDeps = {}
): Promise<McpResponse> {
  try {
    if (typeof input.path !== 'string' || typeof input.receipt !== 'string') {
      return gateError('path and receipt are required strings');
    }
    const moment = REVIEW_MOMENTS.find((m) => m === input.moment);
    if (input.moment !== undefined && moment === undefined) {
      return gateError(`moment must be one of ${REVIEW_MOMENTS.join(', ')}`);
    }
    const report = runCheckReviewReceipt({
      receiptPath: input.receipt,
      cwd: sanitizePath(input.path),
      confine: true,
      ...(moment !== undefined && { moment }),
      ...(deps.git !== undefined && { git: deps.git }),
    });
    return { content: [{ type: 'text' as const, text: JSON.stringify(report) }] };
  } catch (error) {
    return gateError(error instanceof Error ? error.message : String(error));
  }
}
