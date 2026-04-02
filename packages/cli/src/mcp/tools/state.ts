import { Ok } from '@harness-engineering/core';
import { resultToMcpResponse } from '../utils/result-adapter.js';
import { sanitizePath } from '../utils/sanitize-path.js';
import { autoSyncRoadmap } from './roadmap-auto-sync.js';

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
          'append_entry',
          'update_entry_status',
          'read_section',
          'read_sections',
          'archive_session',
          'task-start',
          'task-complete',
          'phase-start',
          'phase-complete',
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
      session: {
        type: 'string',
        description:
          'Session slug for session-scoped state (takes priority over stream when provided)',
      },
      section: {
        type: 'string',
        enum: ['terminology', 'decisions', 'constraints', 'risks', 'openQuestions', 'evidence'],
        description:
          'Session section name (terminology, decisions, constraints, risks, openQuestions, evidence)',
      },
      authorSkill: {
        type: 'string',
        description: 'Name of the skill authoring the entry (required for append_entry)',
      },
      content: {
        type: 'string',
        description: 'Entry content text (required for append_entry)',
      },
      entryId: {
        type: 'string',
        description: 'ID of the entry to update (required for update_entry_status)',
      },
      newStatus: {
        type: 'string',
        enum: ['active', 'resolved', 'superseded'],
        description:
          'New status for the entry: active, resolved, or superseded (required for update_entry_status)',
      },
    },
    required: ['path', 'action'],
  },
};

import { type McpResponse, mcpError } from '../utils.js';

type StateInput = {
  path: string;
  action: string;
  learning?: string;
  skillName?: string;
  outcome?: string;
  description?: string;
  failureType?: string;
  handoff?: unknown;
  stream?: string;
  session?: string;
  section?: string;
  authorSkill?: string;
  content?: string;
  entryId?: string;
  newStatus?: string;
};

async function handleShow(projectPath: string, input: StateInput) {
  const { loadState } = await import('@harness-engineering/core');
  return resultToMcpResponse(await loadState(projectPath, input.stream, input.session));
}

async function handleLearn(projectPath: string, input: StateInput) {
  if (!input.learning) return mcpError('Error: learning is required for learn action');
  const { appendLearning } = await import('@harness-engineering/core');
  const result = await appendLearning(
    projectPath,
    input.learning,
    input.skillName,
    input.outcome,
    input.stream,
    input.session
  );
  if (!result.ok) return resultToMcpResponse(result);
  return resultToMcpResponse(Ok({ recorded: true }));
}

async function handleFailure(projectPath: string, input: StateInput) {
  if (!input.description) return mcpError('Error: description is required for failure action');
  if (!input.failureType) return mcpError('Error: failureType is required for failure action');
  const { appendFailure } = await import('@harness-engineering/core');
  const result = await appendFailure(
    projectPath,
    input.description,
    input.skillName ?? 'unknown',
    input.failureType,
    input.stream,
    input.session
  );
  if (!result.ok) return resultToMcpResponse(result);
  return resultToMcpResponse(Ok({ recorded: true }));
}

async function handleArchive(projectPath: string, input: StateInput) {
  const { archiveFailures } = await import('@harness-engineering/core');
  const result = await archiveFailures(projectPath, input.stream, input.session);
  if (!result.ok) return resultToMcpResponse(result);
  return resultToMcpResponse(Ok({ archived: true }));
}

async function handleReset(projectPath: string, input: StateInput) {
  const { saveState, DEFAULT_STATE } = await import('@harness-engineering/core');
  const result = await saveState(projectPath, { ...DEFAULT_STATE }, input.stream, input.session);
  if (!result.ok) return resultToMcpResponse(result);
  return resultToMcpResponse(Ok({ reset: true }));
}

async function handleGate(projectPath: string, _input: StateInput) {
  const { runMechanicalGate } = await import('@harness-engineering/core');
  return resultToMcpResponse(await runMechanicalGate(projectPath));
}

async function handleSaveHandoff(projectPath: string, input: StateInput) {
  if (!input.handoff) return mcpError('Error: handoff is required for save-handoff action');
  const { saveHandoff } = await import('@harness-engineering/core');
  const result = await saveHandoff(
    projectPath,
    input.handoff as Parameters<typeof saveHandoff>[1],
    input.stream,
    input.session
  );
  if (!result.ok) return resultToMcpResponse(result);

  // Auto-sync roadmap after saving handoff (mechanical enforcement)
  await autoSyncRoadmap(projectPath);

  return resultToMcpResponse(Ok({ saved: true }));
}

async function handleLoadHandoff(projectPath: string, input: StateInput) {
  const { loadHandoff } = await import('@harness-engineering/core');
  return resultToMcpResponse(await loadHandoff(projectPath, input.stream, input.session));
}

async function handleAppendEntry(projectPath: string, input: StateInput) {
  if (!input.session) return mcpError('Error: session is required for append_entry action');
  if (!input.section) return mcpError('Error: section is required for append_entry action');
  if (!input.authorSkill) return mcpError('Error: authorSkill is required for append_entry action');
  if (!input.content) return mcpError('Error: content is required for append_entry action');
  const { appendSessionEntry } = await import('@harness-engineering/core');
  const result = await appendSessionEntry(
    projectPath,
    input.session,
    input.section as import('@harness-engineering/types').SessionSectionName,
    input.authorSkill,
    input.content
  );
  return resultToMcpResponse(result);
}

async function handleUpdateEntryStatus(projectPath: string, input: StateInput) {
  if (!input.session) return mcpError('Error: session is required for update_entry_status action');
  if (!input.section) return mcpError('Error: section is required for update_entry_status action');
  if (!input.entryId) return mcpError('Error: entryId is required for update_entry_status action');
  if (!input.newStatus)
    return mcpError('Error: newStatus is required for update_entry_status action');
  const { updateSessionEntryStatus } = await import('@harness-engineering/core');
  const result = await updateSessionEntryStatus(
    projectPath,
    input.session,
    input.section as import('@harness-engineering/types').SessionSectionName,
    input.entryId,
    input.newStatus as import('@harness-engineering/types').SessionEntryStatus
  );
  return resultToMcpResponse(result);
}

async function handleReadSection(projectPath: string, input: StateInput) {
  if (!input.session) return mcpError('Error: session is required for read_section action');
  if (!input.section) return mcpError('Error: section is required for read_section action');
  const { readSessionSection } = await import('@harness-engineering/core');
  const result = await readSessionSection(
    projectPath,
    input.session,
    input.section as import('@harness-engineering/types').SessionSectionName
  );
  return resultToMcpResponse(result);
}

async function handleReadSections(projectPath: string, input: StateInput) {
  if (!input.session) return mcpError('Error: session is required for read_sections action');
  const { readSessionSections } = await import('@harness-engineering/core');
  const result = await readSessionSections(projectPath, input.session);
  return resultToMcpResponse(result);
}

async function handleArchiveSession(projectPath: string, input: StateInput) {
  if (!input.session) return mcpError('Error: session is required for archive_session action');
  const { archiveSession } = await import('@harness-engineering/core');
  const result = await archiveSession(projectPath, input.session);
  if (!result.ok) return resultToMcpResponse(result);

  // Auto-sync roadmap after archiving session (mechanical enforcement)
  await autoSyncRoadmap(projectPath);

  return resultToMcpResponse(Ok({ archived: true }));
}

async function handleTaskStart(projectPath: string, _input: StateInput) {
  await autoSyncRoadmap(projectPath);
  return resultToMcpResponse(Ok({ synced: true, trigger: 'task-start' }));
}

async function handleTaskComplete(projectPath: string, _input: StateInput) {
  await autoSyncRoadmap(projectPath);
  return resultToMcpResponse(Ok({ synced: true, trigger: 'task-complete' }));
}

async function handlePhaseStart(projectPath: string, _input: StateInput) {
  await autoSyncRoadmap(projectPath);
  return resultToMcpResponse(Ok({ synced: true, trigger: 'phase-start' }));
}

async function handlePhaseComplete(projectPath: string, _input: StateInput) {
  await autoSyncRoadmap(projectPath);
  return resultToMcpResponse(Ok({ synced: true, trigger: 'phase-complete' }));
}

const ACTION_HANDLERS: Record<
  string,
  (projectPath: string, input: StateInput) => Promise<McpResponse>
> = {
  show: handleShow,
  learn: handleLearn,
  failure: handleFailure,
  archive: handleArchive,
  reset: handleReset,
  gate: handleGate,
  'save-handoff': handleSaveHandoff,
  'load-handoff': handleLoadHandoff,
  append_entry: handleAppendEntry,
  update_entry_status: handleUpdateEntryStatus,
  read_section: handleReadSection,
  read_sections: handleReadSections,
  archive_session: handleArchiveSession,
  'task-start': handleTaskStart,
  'task-complete': handleTaskComplete,
  'phase-start': handlePhaseStart,
  'phase-complete': handlePhaseComplete,
};

export async function handleManageState(input: StateInput) {
  try {
    const projectPath = sanitizePath(input.path);
    const handler = ACTION_HANDLERS[input.action];
    if (!handler) return mcpError('Error: unknown action');
    return await handler(projectPath, input);
  } catch (error) {
    return mcpError(`Error: ${error instanceof Error ? error.message : String(error)}`);
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
