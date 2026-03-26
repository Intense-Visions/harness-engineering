// packages/core/src/state/failures.ts
import * as fs from 'fs';
import * as path from 'path';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import { getStateDir, FAILURES_FILE, evictIfNeeded } from './state-shared';

interface FailuresCache {
  mtimeMs: number;
  entries: Array<{ date: string; skill: string; type: string; description: string }>;
}

const failuresCacheMap = new Map<string, FailuresCache>();

export function clearFailuresCache(): void {
  failuresCacheMap.clear();
}

const FAILURE_LINE_REGEX =
  /^- \*\*(\d{4}-\d{2}-\d{2}) \[skill:([^\]]+)\] \[type:([^\]]+)\]:\*\* (.+)$/;

export async function appendFailure(
  projectPath: string,
  description: string,
  skillName: string,
  type: string,
  stream?: string,
  session?: string
): Promise<Result<void, Error>> {
  try {
    const dirResult = await getStateDir(projectPath, stream, session);
    if (!dirResult.ok) return dirResult;
    const stateDir = dirResult.value;
    const failuresPath = path.join(stateDir, FAILURES_FILE);

    fs.mkdirSync(stateDir, { recursive: true });
    const timestamp = new Date().toISOString().split('T')[0];
    const entry = `\n- **${timestamp} [skill:${skillName}] [type:${type}]:** ${description}\n`;

    if (!fs.existsSync(failuresPath)) {
      fs.writeFileSync(failuresPath, `# Failures\n${entry}`);
    } else {
      fs.appendFileSync(failuresPath, entry);
    }

    // Invalidate cache on write
    failuresCacheMap.delete(failuresPath);

    return Ok(undefined);
  } catch (error) {
    return Err(
      new Error(
        `Failed to append failure: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}

export async function loadFailures(
  projectPath: string,
  stream?: string,
  session?: string
): Promise<
  Result<Array<{ date: string; skill: string; type: string; description: string }>, Error>
> {
  try {
    const dirResult = await getStateDir(projectPath, stream, session);
    if (!dirResult.ok) return dirResult;
    const stateDir = dirResult.value;
    const failuresPath = path.join(stateDir, FAILURES_FILE);

    if (!fs.existsSync(failuresPath)) {
      return Ok([]);
    }

    // Cache check: use mtime to determine if re-parse is needed
    const stats = fs.statSync(failuresPath);
    const cacheKey = failuresPath;
    const cached = failuresCacheMap.get(cacheKey);

    if (cached && cached.mtimeMs === stats.mtimeMs) {
      return Ok(cached.entries);
    }

    const content = fs.readFileSync(failuresPath, 'utf-8');
    const entries: Array<{ date: string; skill: string; type: string; description: string }> = [];

    for (const line of content.split('\n')) {
      const match = line.match(FAILURE_LINE_REGEX);
      if (match) {
        entries.push({
          date: match[1] ?? '',
          skill: match[2] ?? '',
          type: match[3] ?? '',
          description: match[4] ?? '',
        });
      }
    }

    failuresCacheMap.set(cacheKey, { mtimeMs: stats.mtimeMs, entries });
    evictIfNeeded(failuresCacheMap);
    return Ok(entries);
  } catch (error) {
    return Err(
      new Error(
        `Failed to load failures: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}

export async function archiveFailures(
  projectPath: string,
  stream?: string,
  session?: string
): Promise<Result<void, Error>> {
  try {
    const dirResult = await getStateDir(projectPath, stream, session);
    if (!dirResult.ok) return dirResult;
    const stateDir = dirResult.value;
    const failuresPath = path.join(stateDir, FAILURES_FILE);

    if (!fs.existsSync(failuresPath)) {
      return Ok(undefined);
    }

    const archiveDir = path.join(stateDir, 'archive');
    fs.mkdirSync(archiveDir, { recursive: true });

    const date = new Date().toISOString().split('T')[0];
    let archiveName = `failures-${date}.md`;
    let counter = 2;

    while (fs.existsSync(path.join(archiveDir, archiveName))) {
      archiveName = `failures-${date}-${counter}.md`;
      counter++;
    }

    fs.renameSync(failuresPath, path.join(archiveDir, archiveName));

    // Invalidate cache on move
    failuresCacheMap.delete(failuresPath);

    return Ok(undefined);
  } catch (error) {
    return Err(
      new Error(
        `Failed to archive failures: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}
