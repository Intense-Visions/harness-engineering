import { sanitizePath } from '../utils/sanitize-path.js';
import { type McpResponse, mcpError } from '../utils.js';
import type { ToolDefinition } from '../tool-types.js';

/**
 * Trusted Autonomy Mode, Phase 2: record_auto_decision (D6). Appends one entry to
 * .harness/sessions/<session>/auto-decisions.jsonl via core recordAutoDecision, which validates
 * strictly, authorizes against the resolved autonomy, and stamps ts + autonomySource itself.
 */
export const recordAutoDecisionDefinition: ToolDefinition = {
  name: 'record_auto_decision',
  description:
    'Append an auto-taken decision (trusted autonomy) to `.harness/sessions/<session>/auto-decisions.jsonl`. ' +
    'Append-only. The server stamps ts and autonomySource and refuses every entry (escalated ones ' +
    'included) unless the resolved autonomy is trusted, and a judgment with audit "off" while audit is on. ' +
    'If this returns isError (recorded:false), do NOT auto-proceed: pause and ask the human.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      session: {
        type: 'string',
        description: 'Session slug; .harness/sessions/<slug>/ must exist',
      },
      skill: {
        type: 'string',
        description: 'Skill at the pause point, e.g. "harness-planning"',
      },
      phase: { type: 'string', description: 'Skill phase, e.g. "VALIDATE"' },
      pauseClass: {
        type: 'string',
        enum: ['ceremony', 'judgment'],
        description: 'irreversible and gate pauses never auto-proceed and cannot be recorded',
      },
      question: { type: 'string', description: 'The question the pause would have asked' },
      options: {
        type: 'array',
        items: { type: 'string' },
        description: 'Distinct options offered',
      },
      chosen: { type: 'string', description: 'One of options (escalated: the human choice)' },
      rationale: { type: 'string', description: 'Why this option was taken' },
      audit: {
        type: 'object',
        description:
          'Required for judgment, omitted for ceremony. agreed: {status,blindPick(=chosen),objection?{severity:"non-blocking",text}}; ' +
          'escalated: {status,blindPick,objection?,humanChoice(=chosen)}; or {status:"unavailable"|"off"}',
        properties: {
          status: { type: 'string', enum: ['agreed', 'escalated', 'unavailable', 'off'] },
          blindPick: { type: 'string' },
          humanChoice: { type: 'string' },
          objection: {
            type: 'object',
            properties: {
              severity: { type: 'string', enum: ['blocking', 'non-blocking'] },
              text: { type: 'string' },
            },
            required: ['severity', 'text'],
          },
        },
        required: ['status'],
      },
    },
    required: [
      'path',
      'session',
      'skill',
      'phase',
      'pauseClass',
      'question',
      'options',
      'chosen',
      'rationale',
    ],
  },
};

/** Injected inputs (tests); production uses os.homedir(), the real clock and process.env. */
export interface RecordAutoDecisionDeps {
  homeDir?: string;
  now?: () => Date;
  env?: NodeJS.ProcessEnv;
}

function failure(code: string, message: string, field?: string): McpResponse {
  return mcpError(
    JSON.stringify({
      recorded: false,
      error: code,
      ...(field !== undefined && { field }),
      message,
      action: 'pause',
    })
  );
}

export async function handleRecordAutoDecision(
  input: Record<string, unknown>,
  deps: RecordAutoDecisionDeps = {}
): Promise<McpResponse> {
  try {
    const core = await import('@harness-engineering/core');
    const { path: rawPath, session, ...decision } = input;
    const projectPath = sanitizePath(String(rawPath));
    const r = core.recordAutoDecision(projectPath, session, decision, {
      env: deps.env ?? process.env,
      ...(deps.homeDir !== undefined && { homeDir: deps.homeDir }),
      ...(deps.now !== undefined && { now: deps.now }),
    });
    if (!r.ok) {
      const err = r.error as Error & { code?: string; fields?: string[] };
      return failure(err.code ?? core.AUTO_DECISION_WRITE_FAILED, err.message, err.fields?.[0]);
    }
    return {
      content: [
        { type: 'text' as const, text: JSON.stringify({ recorded: true, entry: r.value }) },
      ],
    };
  } catch (error) {
    return failure(
      'AUTO_DECISION_WRITE_FAILED',
      `The decision was NOT recorded: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
