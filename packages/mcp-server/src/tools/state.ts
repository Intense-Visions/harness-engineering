import * as path from 'path';
import { Ok } from '@harness-engineering/core';
import { resultToMcpResponse } from '../utils/result-adapter.js';

// ── manage_state ──────────────────────────────────────────────────────

export const manageStateDefinition = {
  name: 'manage_state',
  description:
    'Manage harness project state: show current state, record learnings/failures, archive failures, reset state, or run mechanical gate checks',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      action: {
        type: 'string',
        enum: ['show', 'learn', 'failure', 'archive', 'reset', 'gate'],
        description: 'Action to perform',
      },
      learning: { type: 'string', description: 'Learning text to record (required for learn)' },
      skillName: { type: 'string', description: 'Skill name associated with the entry' },
      outcome: { type: 'string', description: 'Outcome associated with the learning' },
      description: { type: 'string', description: 'Failure description (required for failure)' },
      failureType: { type: 'string', description: 'Type of failure (required for failure)' },
    },
    required: ['path', 'action'],
  },
};

export async function handleManageState(input: {
  path: string;
  action: 'show' | 'learn' | 'failure' | 'archive' | 'reset' | 'gate';
  learning?: string;
  skillName?: string;
  outcome?: string;
  description?: string;
  failureType?: string;
}) {
  try {
    const {
      loadState,
      saveState,
      appendLearning,
      appendFailure,
      archiveFailures,
      runMechanicalGate,
      DEFAULT_STATE,
    } = await import('@harness-engineering/core');

    const projectPath = path.resolve(input.path);

    switch (input.action) {
      case 'show': {
        const result = await loadState(projectPath);
        return resultToMcpResponse(result);
      }

      case 'learn': {
        if (!input.learning) {
          return {
            content: [
              { type: 'text' as const, text: 'Error: learning is required for learn action' },
            ],
            isError: true,
          };
        }
        const result = await appendLearning(
          projectPath,
          input.learning,
          input.skillName,
          input.outcome
        );
        if (!result.ok) return resultToMcpResponse(result);
        return resultToMcpResponse(Ok({ recorded: true }));
      }

      case 'failure': {
        if (!input.description) {
          return {
            content: [
              { type: 'text' as const, text: 'Error: description is required for failure action' },
            ],
            isError: true,
          };
        }
        if (!input.failureType) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Error: failureType is required for failure action',
              },
            ],
            isError: true,
          };
        }
        const result = await appendFailure(
          projectPath,
          input.description,
          input.skillName ?? 'unknown',
          input.failureType
        );
        if (!result.ok) return resultToMcpResponse(result);
        return resultToMcpResponse(Ok({ recorded: true }));
      }

      case 'archive': {
        const result = await archiveFailures(projectPath);
        if (!result.ok) return resultToMcpResponse(result);
        return resultToMcpResponse(Ok({ archived: true }));
      }

      case 'reset': {
        const result = await saveState(projectPath, { ...DEFAULT_STATE });
        if (!result.ok) return resultToMcpResponse(result);
        return resultToMcpResponse(Ok({ reset: true }));
      }

      case 'gate': {
        const result = await runMechanicalGate(projectPath);
        return resultToMcpResponse(result);
      }

      default: {
        return {
          content: [{ type: 'text' as const, text: `Error: unknown action` }],
          isError: true,
        };
      }
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

// ── manage_handoff ────────────────────────────────────────────────────

export const manageHandoffDefinition = {
  name: 'manage_handoff',
  description: 'Save or load session handoff context for agent continuity across sessions',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      action: {
        type: 'string',
        enum: ['save', 'load'],
        description: 'Action to perform',
      },
      handoff: { type: 'object', description: 'Handoff data to save (required for save)' },
    },
    required: ['path', 'action'],
  },
};

export async function handleManageHandoff(input: {
  path: string;
  action: 'save' | 'load';
  handoff?: unknown;
}) {
  try {
    const { saveHandoff, loadHandoff } = await import('@harness-engineering/core');

    const projectPath = path.resolve(input.path);

    switch (input.action) {
      case 'save': {
        if (!input.handoff) {
          return {
            content: [
              { type: 'text' as const, text: 'Error: handoff is required for save action' },
            ],
            isError: true,
          };
        }
        const result = await saveHandoff(
          projectPath,
          input.handoff as Parameters<typeof saveHandoff>[1]
        );
        return resultToMcpResponse(result.ok ? Ok({ saved: true }) : result);
      }

      case 'load': {
        const result = await loadHandoff(projectPath);
        return resultToMcpResponse(result);
      }

      default: {
        return {
          content: [{ type: 'text' as const, text: `Error: unknown action` }],
          isError: true,
        };
      }
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
