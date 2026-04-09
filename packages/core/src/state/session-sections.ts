// packages/core/src/state/session-sections.ts
import * as fs from 'fs';
import * as path from 'path';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import type { SessionEntry, SessionSectionName, SessionSections } from '@harness-engineering/types';
import { SESSION_SECTION_NAMES } from '@harness-engineering/types';
import { resolveSessionDir } from './session-resolver';
import { SESSION_STATE_FILE } from './constants';

/** Returns an empty SessionSections object with all sections initialized. */
function emptySections(): SessionSections {
  const sections = {} as SessionSections;
  for (const name of SESSION_SECTION_NAMES) {
    sections[name] = [];
  }
  return sections;
}

/** Loads session-state.json from the session directory; returns empty sections if missing. */
async function loadSessionState(
  projectPath: string,
  sessionSlug: string
): Promise<Result<SessionSections, Error>> {
  const dirResult = resolveSessionDir(projectPath, sessionSlug);
  if (!dirResult.ok) return dirResult;
  const sessionDir = dirResult.value;
  const filePath = path.join(sessionDir, SESSION_STATE_FILE);

  if (!fs.existsSync(filePath)) {
    return Ok(emptySections());
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as SessionSections;
    // Ensure all sections exist (forward compat if new sections are added later)
    const sections = emptySections();
    for (const name of SESSION_SECTION_NAMES) {
      if (Array.isArray(parsed[name])) {
        sections[name] = parsed[name];
      }
    }
    return Ok(sections);
  } catch (error) {
    return Err(
      new Error(
        `Failed to load session state: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}

/** Saves session-state.json to the session directory. */
async function saveSessionState(
  projectPath: string,
  sessionSlug: string,
  sections: SessionSections
): Promise<Result<void, Error>> {
  const dirResult = resolveSessionDir(projectPath, sessionSlug, { create: true });
  if (!dirResult.ok) return dirResult;
  const sessionDir = dirResult.value;
  const filePath = path.join(sessionDir, SESSION_STATE_FILE);

  try {
    fs.writeFileSync(filePath, JSON.stringify(sections, null, 2));
    return Ok(undefined);
  } catch (error) {
    return Err(
      new Error(
        `Failed to save session state: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}

/**
 * Reads all session sections. Returns empty sections if no session state exists.
 */
export async function readSessionSections(
  projectPath: string,
  sessionSlug: string
): Promise<Result<SessionSections, Error>> {
  return loadSessionState(projectPath, sessionSlug);
}

/**
 * Reads a single session section by name. Returns empty array if section has no entries.
 */
export async function readSessionSection(
  projectPath: string,
  sessionSlug: string,
  section: SessionSectionName
): Promise<Result<SessionEntry[], Error>> {
  const result = await loadSessionState(projectPath, sessionSlug);
  if (!result.ok) return result;
  return Ok(result.value[section]);
}

/**
 * Appends an entry to a session section (read-before-write).
 * Generates a unique ID and timestamp for the entry.
 */
export async function appendSessionEntry(
  projectPath: string,
  sessionSlug: string,
  section: SessionSectionName,
  authorSkill: string,
  content: string
): Promise<Result<SessionEntry, Error>> {
  // Read-before-write: load current state first
  const loadResult = await loadSessionState(projectPath, sessionSlug);
  if (!loadResult.ok) return loadResult;
  const sections = loadResult.value;

  const entry: SessionEntry = {
    id: generateEntryId(),
    timestamp: new Date().toISOString(),
    authorSkill,
    content,
    status: 'active',
  };

  sections[section].push(entry);

  const saveResult = await saveSessionState(projectPath, sessionSlug, sections);
  if (!saveResult.ok) return saveResult;

  return Ok(entry);
}

/**
 * Updates the status of an existing entry in a session section.
 * Returns Err if the entry is not found.
 */
export async function updateSessionEntryStatus(
  projectPath: string,
  sessionSlug: string,
  section: SessionSectionName,
  entryId: string,
  newStatus: SessionEntry['status']
): Promise<Result<SessionEntry, Error>> {
  const loadResult = await loadSessionState(projectPath, sessionSlug);
  if (!loadResult.ok) return loadResult;
  const sections = loadResult.value;

  const entry = sections[section].find((e) => e.id === entryId);
  if (!entry) {
    return Err(new Error(`Entry '${entryId}' not found in section '${section}'`));
  }

  entry.status = newStatus;

  const saveResult = await saveSessionState(projectPath, sessionSlug, sections);
  if (!saveResult.ok) return saveResult;

  return Ok(entry);
}

/** Generates a short unique ID for session entries. */
function generateEntryId(): string {
  const timestamp = Date.now().toString(36);
  const random = Buffer.from(crypto.getRandomValues(new Uint8Array(4))).toString('hex');
  return `${timestamp}-${random}`;
}
