// packages/core/src/state/session-resolver.ts
import * as fs from 'fs';
import * as path from 'path';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import { HARNESS_DIR, SESSIONS_DIR, SESSION_INDEX_FILE } from './constants';

/**
 * Resolves the directory path for a session.
 * Optionally creates the directory if it does not exist.
 */
export function resolveSessionDir(
  projectPath: string,
  sessionSlug: string,
  options?: { create?: boolean }
): Result<string, Error> {
  if (!sessionSlug || sessionSlug.trim() === '') {
    return Err(new Error('Session slug must not be empty'));
  }

  if (sessionSlug.includes('..') || sessionSlug.includes('/') || sessionSlug.includes('\\')) {
    return Err(
      new Error(`Invalid session slug '${sessionSlug}': must not contain path traversal characters`)
    );
  }

  const sessionDir = path.join(projectPath, HARNESS_DIR, SESSIONS_DIR, sessionSlug);

  if (options?.create) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  return Ok(sessionDir);
}

/**
 * Updates the session index.md file with an entry for the given session.
 * Creates the file if it does not exist.
 * Updates existing entries in-place (per-slug line ownership).
 */
export function updateSessionIndex(
  projectPath: string,
  sessionSlug: string,
  description: string
): void {
  const sessionsDir = path.join(projectPath, HARNESS_DIR, SESSIONS_DIR);
  fs.mkdirSync(sessionsDir, { recursive: true });

  const indexPath = path.join(sessionsDir, SESSION_INDEX_FILE);
  const date = new Date().toISOString().split('T')[0];
  const newLine = `- [${sessionSlug}](${sessionSlug}/summary.md) — ${description} (${date})`;

  if (!fs.existsSync(indexPath)) {
    fs.writeFileSync(indexPath, `## Active Sessions\n\n${newLine}\n`);
    return;
  }

  const content = fs.readFileSync(indexPath, 'utf-8');
  const lines = content.split('\n');
  const slugPattern = `- [${sessionSlug}]`;
  const existingIdx = lines.findIndex((l) => l.startsWith(slugPattern));

  if (existingIdx >= 0) {
    lines[existingIdx] = newLine;
  } else {
    // Append after the last non-empty line
    const lastNonEmpty = lines.reduce((last, line, i) => (line.trim() !== '' ? i : last), 0);
    lines.splice(lastNonEmpty + 1, 0, newLine);
  }

  fs.writeFileSync(indexPath, lines.join('\n'));
}
