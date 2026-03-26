// packages/core/src/state/session-summary.ts
import * as fs from 'fs';
import * as path from 'path';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import { resolveSessionDir, updateSessionIndex } from './session-resolver';
import { HARNESS_DIR, SESSIONS_DIR, SESSION_INDEX_FILE, SUMMARY_FILE } from './constants';

/**
 * Data required to write a session summary.
 * Required fields: session, lastActive, skill, status, keyContext, nextStep.
 * Optional fields: phase, spec, plan.
 */
export interface SessionSummaryData {
  session: string;
  lastActive: string;
  skill: string;
  phase?: string;
  status: string;
  spec?: string;
  plan?: string;
  keyContext: string;
  nextStep: string;
}

/**
 * Formats a SessionSummaryData object into the spec-defined markdown format.
 */
function formatSummary(data: SessionSummaryData): string {
  const lines: string[] = [
    '## Session Summary',
    '',
    `**Session:** ${data.session}`,
    `**Last active:** ${data.lastActive}`,
    `**Skill:** ${data.skill}`,
  ];

  if (data.phase) {
    lines.push(`**Phase:** ${data.phase}`);
  }

  lines.push(`**Status:** ${data.status}`);

  if (data.spec) {
    lines.push(`**Spec:** ${data.spec}`);
  }
  if (data.plan) {
    lines.push(`**Plan:** ${data.plan}`);
  }

  lines.push(`**Key context:** ${data.keyContext}`);
  lines.push(`**Next step:** ${data.nextStep}`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Derives an index description from session summary data.
 * Example: "execution phase 2, task 4/6"
 */
function deriveIndexDescription(data: SessionSummaryData): string {
  const skillShort = data.skill.replace('harness-', '');
  const parts = [skillShort];
  if (data.phase) {
    parts.push(`phase ${data.phase}`);
  }
  parts.push(data.status.toLowerCase());
  return parts.join(', ');
}

/**
 * Writes a session summary to the session directory and updates the session index.
 * Creates the session directory if it does not exist.
 * Overwrites any existing summary for this session.
 */
export function writeSessionSummary(
  projectPath: string,
  sessionSlug: string,
  data: SessionSummaryData
): Result<void, Error> {
  try {
    const dirResult = resolveSessionDir(projectPath, sessionSlug, { create: true });
    if (!dirResult.ok) return dirResult;

    const sessionDir = dirResult.value;
    const summaryPath = path.join(sessionDir, SUMMARY_FILE);
    const content = formatSummary(data);

    fs.writeFileSync(summaryPath, content);

    // Update the session index
    const description = deriveIndexDescription(data);
    updateSessionIndex(projectPath, sessionSlug, description);

    return Ok(undefined);
  } catch (error) {
    return Err(
      new Error(
        `Failed to write session summary: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}

/**
 * Loads a session's summary.md contents.
 * Returns the raw markdown string, or null if the file does not exist.
 */
export function loadSessionSummary(
  projectPath: string,
  sessionSlug: string
): Result<string | null, Error> {
  try {
    const dirResult = resolveSessionDir(projectPath, sessionSlug);
    if (!dirResult.ok) return dirResult;

    const sessionDir = dirResult.value;
    const summaryPath = path.join(sessionDir, SUMMARY_FILE);

    if (!fs.existsSync(summaryPath)) {
      return Ok(null);
    }

    const content = fs.readFileSync(summaryPath, 'utf-8');
    return Ok(content);
  } catch (error) {
    return Err(
      new Error(
        `Failed to load session summary: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}

/**
 * Lists active sessions by reading the session index file.
 * Returns the raw markdown contents of index.md, or null if it does not exist.
 */
export function listActiveSessions(projectPath: string): Result<string | null, Error> {
  try {
    const indexPath = path.join(projectPath, HARNESS_DIR, SESSIONS_DIR, SESSION_INDEX_FILE);

    if (!fs.existsSync(indexPath)) {
      return Ok(null);
    }

    const content = fs.readFileSync(indexPath, 'utf-8');
    return Ok(content);
  } catch (error) {
    return Err(
      new Error(
        `Failed to list active sessions: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}
