import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import {
  StreamIndexSchema,
  DEFAULT_STREAM_INDEX,
  type StreamIndex,
  type StreamInfo,
} from './stream-types';

import { HARNESS_DIR, INDEX_FILE } from './constants';

const STREAMS_DIR = 'streams';

const STREAM_NAME_REGEX = /^[a-z0-9][a-z0-9._-]*$/;

function streamsDir(projectPath: string): string {
  return path.join(projectPath, HARNESS_DIR, STREAMS_DIR);
}

function indexPath(projectPath: string): string {
  return path.join(streamsDir(projectPath), INDEX_FILE);
}

function validateStreamName(name: string): Result<void, Error> {
  if (!STREAM_NAME_REGEX.test(name)) {
    return Err(
      new Error(
        `Invalid stream name '${name}'. Names must match [a-z0-9][a-z0-9._-]* (lowercase alphanumeric, dots, hyphens, underscores).`
      )
    );
  }
  return Ok(undefined);
}

// ── Index persistence ──────────────────────────────────────────────

export async function loadStreamIndex(projectPath: string): Promise<Result<StreamIndex, Error>> {
  const idxPath = indexPath(projectPath);
  if (!fs.existsSync(idxPath)) {
    return Ok({ ...DEFAULT_STREAM_INDEX, streams: {} });
  }
  try {
    const raw = fs.readFileSync(idxPath, 'utf-8');
    const parsed = JSON.parse(raw);
    const result = StreamIndexSchema.safeParse(parsed);
    if (!result.success) {
      return Err(new Error(`Invalid stream index: ${result.error.message}`));
    }
    return Ok(result.data);
  } catch (error) {
    return Err(
      new Error(
        `Failed to load stream index: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}

export async function saveStreamIndex(
  projectPath: string,
  index: StreamIndex
): Promise<Result<void, Error>> {
  const dir = streamsDir(projectPath);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(indexPath(projectPath), JSON.stringify(index, null, 2));
    return Ok(undefined);
  } catch (error) {
    return Err(
      new Error(
        `Failed to save stream index: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}

// ── Git helpers ────────────────────────────────────────────────────

// Cache git branch per projectPath to avoid spawning git on every state operation.
const branchCache = new Map<string, { branch: string | null; timestamp: number }>();
const BRANCH_CACHE_TTL_MS = 30_000; // 30 seconds

function getCurrentBranch(projectPath: string): string | null {
  const cached = branchCache.get(projectPath);
  if (cached && Date.now() - cached.timestamp < BRANCH_CACHE_TTL_MS) {
    return cached.branch;
  }

  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: projectPath,
      stdio: 'pipe',
    })
      .toString()
      .trim();
    branchCache.set(projectPath, { branch, timestamp: Date.now() });
    return branch;
  } catch {
    branchCache.set(projectPath, { branch: null, timestamp: Date.now() });
    return null;
  }
}

// ── Stream resolution ──────────────────────────────────────────────

/**
 * Resolves a stream path without side effects.
 *
 * Does NOT update lastActiveAt or activeStream in the index.
 * Callers that need to mark a stream as active should call `touchStream()` separately.
 */
export async function resolveStreamPath(
  projectPath: string,
  options?: { stream?: string }
): Promise<Result<string, Error>> {
  const idxResult = await loadStreamIndex(projectPath);
  if (!idxResult.ok) return idxResult as Result<string, Error>;
  const index = idxResult.value;

  // 1. Explicit stream name
  if (options?.stream) {
    if (!index.streams[options.stream]) {
      return Err(
        new Error(
          `Stream '${options.stream}' not found. Known streams: ${Object.keys(index.streams).join(', ') || 'none'}`
        )
      );
    }
    return Ok(path.join(streamsDir(projectPath), options.stream));
  }

  // 2. Infer from git branch
  const branch = getCurrentBranch(projectPath);
  if (branch && branch !== 'main' && branch !== 'master') {
    for (const [name, info] of Object.entries(index.streams)) {
      if (info.branch === branch) {
        return Ok(path.join(streamsDir(projectPath), name));
      }
    }
  }

  // 3. Use active stream
  if (index.activeStream && index.streams[index.activeStream]) {
    return Ok(path.join(streamsDir(projectPath), index.activeStream));
  }

  // 4. No resolution possible
  return Err(
    new Error(
      'Cannot resolve stream. Specify --stream <name> or create a stream. ' +
        `Known streams: ${Object.keys(index.streams).join(', ') || 'none'}`
    )
  );
}

/**
 * Updates lastActiveAt and activeStream for the given stream.
 * Call this once per session start, not on every state operation.
 */
export async function touchStream(projectPath: string, name: string): Promise<Result<void, Error>> {
  const idxResult = await loadStreamIndex(projectPath);
  if (!idxResult.ok) return idxResult;
  const index = idxResult.value;

  if (!index.streams[name]) {
    return Err(new Error(`Stream '${name}' not found`));
  }

  index.streams[name]!.lastActiveAt = new Date().toISOString();
  index.activeStream = name;
  return saveStreamIndex(projectPath, index);
}

// ── Stream lifecycle ───────────────────────────────────────────────

export async function createStream(
  projectPath: string,
  name: string,
  branch?: string
): Promise<Result<string, Error>> {
  const nameCheck = validateStreamName(name);
  if (!nameCheck.ok) return nameCheck as Result<string, Error>;

  const idxResult = await loadStreamIndex(projectPath);
  if (!idxResult.ok) return idxResult as Result<string, Error>;
  const index = idxResult.value;

  if (index.streams[name]) {
    return Err(new Error(`Stream '${name}' already exists`));
  }

  const streamPath = path.join(streamsDir(projectPath), name);
  try {
    fs.mkdirSync(streamPath, { recursive: true });
  } catch (error) {
    return Err(
      new Error(
        `Failed to create stream directory: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }

  const now = new Date().toISOString();
  index.streams[name] = {
    name,
    branch,
    createdAt: now,
    lastActiveAt: now,
  };

  const saveResult = await saveStreamIndex(projectPath, index);
  if (!saveResult.ok) return saveResult as Result<string, Error>;

  return Ok(streamPath);
}

export async function listStreams(projectPath: string): Promise<Result<StreamInfo[], Error>> {
  const idxResult = await loadStreamIndex(projectPath);
  if (!idxResult.ok) return idxResult as Result<StreamInfo[], Error>;
  return Ok(Object.values(idxResult.value.streams));
}

export async function setActiveStream(
  projectPath: string,
  name: string
): Promise<Result<void, Error>> {
  const idxResult = await loadStreamIndex(projectPath);
  if (!idxResult.ok) return idxResult;
  const index = idxResult.value;

  if (!index.streams[name]) {
    return Err(new Error(`Stream '${name}' not found`));
  }

  index.activeStream = name;
  return saveStreamIndex(projectPath, index);
}

/**
 * Archives a stream by moving its entire directory (including any failure archives
 * within it) to `.harness/archive/streams/<name>-<date>`.
 */
export async function archiveStream(
  projectPath: string,
  name: string
): Promise<Result<void, Error>> {
  const idxResult = await loadStreamIndex(projectPath);
  if (!idxResult.ok) return idxResult;
  const index = idxResult.value;

  if (!index.streams[name]) {
    return Err(new Error(`Stream '${name}' not found`));
  }

  const streamPath = path.join(streamsDir(projectPath), name);
  const archiveDir = path.join(projectPath, HARNESS_DIR, 'archive', 'streams');

  try {
    fs.mkdirSync(archiveDir, { recursive: true });
    const date = new Date().toISOString().split('T')[0];
    fs.renameSync(streamPath, path.join(archiveDir, `${name}-${date}`));
  } catch (error) {
    return Err(
      new Error(
        `Failed to archive stream: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }

  delete index.streams[name];
  if (index.activeStream === name) {
    index.activeStream = null;
  }

  return saveStreamIndex(projectPath, index);
}

export function getStreamForBranch(index: StreamIndex, branch: string): string | null {
  for (const [name, info] of Object.entries(index.streams)) {
    if (info.branch === branch) return name;
  }
  return null;
}

// ── Migration ──────────────────────────────────────────────────────

const STATE_FILES = ['state.json', 'handoff.json', 'learnings.md', 'failures.md'];

export async function migrateToStreams(projectPath: string): Promise<Result<void, Error>> {
  const harnessDir = path.join(projectPath, HARNESS_DIR);

  // Already migrated?
  if (fs.existsSync(indexPath(projectPath))) {
    return Ok(undefined);
  }

  // Any old-layout files to migrate?
  const filesToMove = STATE_FILES.filter((f) => fs.existsSync(path.join(harnessDir, f)));
  if (filesToMove.length === 0) {
    return Ok(undefined);
  }

  // Create default stream dir
  const defaultDir = path.join(streamsDir(projectPath), 'default');
  try {
    fs.mkdirSync(defaultDir, { recursive: true });

    for (const file of filesToMove) {
      fs.renameSync(path.join(harnessDir, file), path.join(defaultDir, file));
    }
  } catch (error) {
    return Err(
      new Error(`Migration failed: ${error instanceof Error ? error.message : String(error)}`)
    );
  }

  // Create index
  const now = new Date().toISOString();
  const index: StreamIndex = {
    schemaVersion: 1,
    activeStream: 'default',
    streams: {
      default: {
        name: 'default',
        createdAt: now,
        lastActiveAt: now,
      },
    },
  };

  return saveStreamIndex(projectPath, index);
}
