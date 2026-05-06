import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import matter from 'gray-matter';
import { Ok, Err } from '../shared/result';
import type { Result } from '../shared/result';
import {
  BUG_TRACK_CATEGORIES,
  KNOWLEDGE_TRACK_CATEGORIES,
  SolutionDocFrontmatterSchema,
} from '../solutions/schema';
import { validateConfig } from './config';
import type { ConfigError } from './types';
import { createError } from '../shared/errors';

export interface SolutionsDirValidation {
  filesChecked: number;
  issues: Array<{ file: string; message: string }>;
}

const TRACK_CATEGORIES: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
  ['bug-track', BUG_TRACK_CATEGORIES],
  ['knowledge-track', KNOWLEDGE_TRACK_CATEGORIES],
];

async function* walk(dir: string): AsyncGenerator<string> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile() && e.name.endsWith('.md')) yield p;
  }
}

export async function validateSolutionsDir(
  cwd: string
): Promise<Result<SolutionsDirValidation, ConfigError>> {
  const root = path.join(cwd, 'docs', 'solutions');
  try {
    await fs.stat(root);
  } catch {
    return Ok({ filesChecked: 0, issues: [] });
  }
  const issues: Array<{ file: string; message: string }> = [];
  let count = 0;
  // Positive filtering: only walk known track/category subtrees. Sibling dirs
  // (.candidates, references, assets, or any future top-level addition) are
  // not visited. Track and category names come from the schema enums — single
  // source of truth.
  for (const [track, categories] of TRACK_CATEGORIES) {
    for (const category of categories) {
      const categoryDir = path.join(root, track, category);
      for await (const file of walk(categoryDir)) {
        count++;
        const raw = await fs.readFile(file, 'utf-8');
        const parsed = matter(raw);
        const result = validateConfig(parsed.data, SolutionDocFrontmatterSchema);
        if (!result.ok)
          issues.push({
            file: path.relative(cwd, file).replaceAll('\\', '/'),
            message: result.error.message,
          });
      }
    }
  }
  if (issues.length > 0) {
    return Err(
      createError<ConfigError>(
        'VALIDATION_FAILED',
        `${issues.length} solution doc(s) failed frontmatter validation`,
        { issues },
        []
      )
    );
  }
  return Ok({ filesChecked: count, issues: [] });
}
