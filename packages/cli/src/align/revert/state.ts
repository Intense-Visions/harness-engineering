/**
 * Revert state — persists the most-recent batch of applied codemods to
 * `.harness/align/last-batch.json` so a subsequent `--revert` run can
 * reconstruct the inverse. Single-shot history per v1 spec; multi-step
 * history is v1.x.
 *
 * Each entry records the original DriftFinding + the diff that was
 * written + a SHA-256 of the post-apply file content. The hash lets
 * revert detect "file edited externally since apply" (SC #27); it is
 * used for integrity, not for a security boundary.
 *
 * Source: docs/changes/design-pipeline/align-design-system/proposal.md
 *   (Open questions deferred to implementation → Revert state location).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import type { DriftFinding } from '../../drift/findings/finding.js';
import type { FixDiff, FixOutcome, AlignMode } from '../findings/outcome.js';

export const LAST_BATCH_PATH = '.harness/align/last-batch.json';

export interface LastBatchEntry {
  finding: DriftFinding;
  diff: FixDiff;
  /** SHA-256 of the file content right after the codemod wrote it. */
  postApplySha256: string;
}

export interface LastBatch {
  version: 1;
  writtenAt: string;
  mode: AlignMode;
  entries: LastBatchEntry[];
}

export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Persist the applied subset of outcomes for later revert. Skipped /
 * suggestion / failed outcomes are not saved — only writes that touched
 * disk are revertable.
 *
 * No-op when no `applied` outcomes exist (avoids clobbering a previous
 * batch with an empty one). Caller must pass a `fileReader` so the hash
 * matches the source as it was written (not as it was *before* the apply).
 */
export function saveLastBatch(
  projectRoot: string,
  outcomes: FixOutcome[],
  mode: AlignMode,
  fileReader: (filePath: string) => string
): void {
  const applied = outcomes.filter(
    (o): o is Extract<FixOutcome, { kind: 'applied' }> => o.kind === 'applied'
  );
  if (applied.length === 0) return;

  const entries: LastBatchEntry[] = [];
  const hashCache = new Map<string, string>();
  for (const o of applied) {
    let hash = hashCache.get(o.diff.file);
    if (hash === undefined) {
      try {
        hash = hashContent(fileReader(o.diff.file));
      } catch {
        // Skip entries we cannot hash — revert would not work for them anyway
        continue;
      }
      hashCache.set(o.diff.file, hash);
    }
    entries.push({ finding: o.finding, diff: o.diff, postApplySha256: hash });
  }
  if (entries.length === 0) return;

  const batch: LastBatch = {
    version: 1,
    writtenAt: new Date().toISOString(),
    mode,
    entries,
  };
  const full = path.join(projectRoot, LAST_BATCH_PATH);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(batch, null, 2) + '\n', 'utf-8');
}

export function loadLastBatch(projectRoot: string): LastBatch | null {
  const full = path.join(projectRoot, LAST_BATCH_PATH);
  if (!fs.existsSync(full)) return null;
  try {
    const raw = fs.readFileSync(full, 'utf-8');
    const parsed = JSON.parse(raw) as LastBatch;
    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) return null;
    return parsed;
  } catch {
    return null;
  }
}
