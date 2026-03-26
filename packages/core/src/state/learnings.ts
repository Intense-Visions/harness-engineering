// packages/core/src/state/learnings.ts
import * as fs from 'fs';
import * as path from 'path';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import { getStateDir, LEARNINGS_FILE, evictIfNeeded } from './state-shared';

interface LearningsCache {
  mtimeMs: number;
  entries: string[];
}

const learningsCacheMap = new Map<string, LearningsCache>();

export function clearLearningsCache(): void {
  learningsCacheMap.clear();
}

export async function appendLearning(
  projectPath: string,
  learning: string,
  skillName?: string,
  outcome?: string,
  stream?: string,
  session?: string
): Promise<Result<void, Error>> {
  try {
    const dirResult = await getStateDir(projectPath, stream, session);
    if (!dirResult.ok) return dirResult;
    const stateDir = dirResult.value;
    const learningsPath = path.join(stateDir, LEARNINGS_FILE);

    fs.mkdirSync(stateDir, { recursive: true });
    const timestamp = new Date().toISOString().split('T')[0];

    let entry: string;
    if (skillName && outcome) {
      entry = `\n- **${timestamp} [skill:${skillName}] [outcome:${outcome}]:** ${learning}\n`;
    } else if (skillName) {
      entry = `\n- **${timestamp} [skill:${skillName}]:** ${learning}\n`;
    } else {
      entry = `\n- **${timestamp}:** ${learning}\n`;
    }

    if (!fs.existsSync(learningsPath)) {
      fs.writeFileSync(learningsPath, `# Learnings\n${entry}`);
    } else {
      fs.appendFileSync(learningsPath, entry);
    }

    // Invalidate cache on write
    learningsCacheMap.delete(learningsPath);

    return Ok(undefined);
  } catch (error) {
    return Err(
      new Error(
        `Failed to append learning: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}

export async function loadRelevantLearnings(
  projectPath: string,
  skillName?: string,
  stream?: string,
  session?: string
): Promise<Result<string[], Error>> {
  try {
    const dirResult = await getStateDir(projectPath, stream, session);
    if (!dirResult.ok) return dirResult;
    const stateDir = dirResult.value;
    const learningsPath = path.join(stateDir, LEARNINGS_FILE);

    if (!fs.existsSync(learningsPath)) {
      return Ok([]);
    }

    // Cache check: use mtime to determine if re-parse is needed
    const stats = fs.statSync(learningsPath);
    const cacheKey = learningsPath;
    const cached = learningsCacheMap.get(cacheKey);

    let entries: string[];

    if (cached && cached.mtimeMs === stats.mtimeMs) {
      entries = cached.entries;
    } else {
      // Parse file and populate cache
      const content = fs.readFileSync(learningsPath, 'utf-8');
      const lines = content.split('\n');
      entries = [];
      let currentBlock: string[] = [];

      for (const line of lines) {
        if (line.startsWith('# ')) continue;

        const isDatedBullet = /^- \*\*\d{4}-\d{2}-\d{2}/.test(line);
        const isHeading = /^## \d{4}-\d{2}-\d{2}/.test(line);

        if (isDatedBullet || isHeading) {
          if (currentBlock.length > 0) {
            entries.push(currentBlock.join('\n'));
          }
          currentBlock = [line];
        } else if (line.trim() !== '' && currentBlock.length > 0) {
          currentBlock.push(line);
        }
      }

      if (currentBlock.length > 0) {
        entries.push(currentBlock.join('\n'));
      }

      learningsCacheMap.set(cacheKey, { mtimeMs: stats.mtimeMs, entries });
      evictIfNeeded(learningsCacheMap);
    }

    if (!skillName) {
      return Ok(entries);
    }

    const filtered = entries.filter((entry) => entry.includes(`[skill:${skillName}]`));
    return Ok(filtered);
  } catch (error) {
    return Err(
      new Error(
        `Failed to load learnings: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}
