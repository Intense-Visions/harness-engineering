/**
 * Inverse-application — given a recorded FixDiff (line + before/after
 * text), reverse it on the current source. Pure function: returns the
 * new source plus an inverted diff for emission as a FixOutcome.
 *
 * Source: docs/changes/design-pipeline/align-design-system/proposal.md
 *   (Surface area → CLI → --revert, Success criteria #26 + #27).
 */

import type { FixDiff } from '../findings/outcome.js';
import { replaceLine, sourceLine } from '../codemods/common.js';

export type InverseResult =
  | { ok: true; newSource: string; invertedDiff: FixDiff }
  | { ok: false; reason: string };

export function applyInverse(source: string, diff: FixDiff): InverseResult {
  const lineText = sourceLine(source, diff.line);
  if (lineText !== diff.after) {
    return {
      ok: false,
      reason: 'line content no longer matches the recorded post-apply text',
    };
  }
  const newSource = replaceLine(source, diff.line, diff.before);
  return {
    ok: true,
    newSource,
    invertedDiff: {
      file: diff.file,
      before: diff.after,
      after: diff.before,
      line: diff.line,
    },
  };
}
