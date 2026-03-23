import { Ok } from '@harness-engineering/core';
import { resultToMcpResponse } from '../utils/result-adapter.js';
import { sanitizePath } from '../utils/sanitize-path.js';

// ── manage_state ──────────────────────────────────────────────────────

export const manageStateDefinition = {
  name: 'manage_state',
  description:
    'Manage harness project state: show current state, record learnings/failures, archive failures, reset state, run mechanical gate checks, or save/load session handoff',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      action: {
        type: 'string',
        enum: [
          'show',
          'learn',
          'failure',
          'archive',
          'reset',
          'gate',
          'save-handoff',
          'load-handoff',
        ],
        description: 'Action to perform',
      },
      learning: { type: 'string', description: 'Learning text to record (required for learn)' },
      skillName: { type: 'string', description: 'Skill name associated with the entry' },
      outcome: { type: 'string', description: 'Outcome associated with the learning' },
      description: { type: 'string', description: 'Failure description (required for failure)' },
      failureType: { type: 'string', description: 'Type of failure (required for failure)' },
      handoff: { type: 'object', description: 'Handoff data to save (required for save-handoff)' },
      stream: {
        type: 'string',
        description: 'Stream name to target (auto-resolves from branch if omitted)',
      },
    },
    required: ['path', 'action'],
  },
};

export async function handleManageState(input: {
  path: string;
  action:
    | 'show'
    | 'learn'
    | 'failure'
    | 'archive'
    | 'reset'
    | 'gate'
    | 'save-handoff'
    | 'load-handoff';
  learning?: string;
  skillName?: string;
  outcome?: string;
  description?: string;
  failureType?: string;
  handoff?: unknown;
  stream?: string;
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

    const projectPath = sanitizePath(input.path);

    switch (input.action) {
      case 'show': {
        const result = await loadState(projectPath, input.stream);
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
          input.outcome,
          input.stream
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
          input.failureType,
          input.stream
        );
        if (!result.ok) return resultToMcpResponse(result);
        return resultToMcpResponse(Ok({ recorded: true }));
      }

      case 'archive': {
        const result = await archiveFailures(projectPath, input.stream);
        if (!result.ok) return resultToMcpResponse(result);
        return resultToMcpResponse(Ok({ archived: true }));
      }

      case 'reset': {
        const result = await saveState(projectPath, { ...DEFAULT_STATE }, input.stream);
        if (!result.ok) return resultToMcpResponse(result);
        return resultToMcpResponse(Ok({ reset: true }));
      }

      case 'gate': {
        const result = await runMechanicalGate(projectPath);
        return resultToMcpResponse(result);
      }

      case 'save-handoff': {
        if (!input.handoff) {
          return {
            content: [
              { type: 'text' as const, text: 'Error: handoff is required for save-handoff action' },
            ],
            isError: true,
          };
        }
        const { saveHandoff } = await import('@harness-engineering/core');
        const result = await saveHandoff(
          projectPath,
          input.handoff as Parameters<typeof saveHandoff>[1],
          input.stream
        );
        return resultToMcpResponse(result.ok ? Ok({ saved: true }) : result);
      }

      case 'load-handoff': {
        const { loadHandoff } = await import('@harness-engineering/core');
        const result = await loadHandoff(projectPath, input.stream);
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

// ── list_streams ──────────────────────────────────────────────────────

export const listStreamsDefinition = {
  name: 'list_streams',
  description: 'List known state streams with branch associations and last-active timestamps',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
    },
    required: ['path'],
  },
};

export async function handleListStreams(input: { path: string }) {
  try {
    const { listStreams, loadStreamIndex } = await import('@harness-engineering/core');
    const projectPath = sanitizePath(input.path);
    const indexResult = await loadStreamIndex(projectPath);
    const streamsResult = await listStreams(projectPath);

    if (!streamsResult.ok) return resultToMcpResponse(streamsResult);

    return resultToMcpResponse(
      Ok({
        activeStream: indexResult.ok ? indexResult.value.activeStream : null,
        streams: streamsResult.value,
      })
    );
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
