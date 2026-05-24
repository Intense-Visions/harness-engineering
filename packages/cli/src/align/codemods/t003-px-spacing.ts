/**
 * DRIFT-T003 codemod — replace a px spacing literal with a token reference.
 *
 * Recognized contexts:
 *   - { padding: "16px" }   → { padding: tokens.space.md }   (TS/JS)
 *   - padding: 16px;         → padding: var(--space-md);     (CSS)
 *
 * Source: docs/changes/design-pipeline/align-design-system/proposal.md
 *   (Technical Design → Codemod implementation).
 */

import type { DriftFinding } from '../../drift/findings/finding.js';
import type { Classification } from '../classifier/pre-flight.js';
import type { FixDiff } from '../findings/outcome.js';
import { renderTokenReference, sourceLine, replaceLine } from './common.js';

export interface CodemodResult {
  ok: true;
  newSource: string;
  diff: FixDiff;
}

export interface CodemodFailure {
  ok: false;
  reason: string;
}

export function applyT003Codemod(
  source: string,
  finding: DriftFinding,
  classification: Extract<Classification, { kind: 'safe-codemod' }>
): CodemodResult | CodemodFailure {
  if (finding.line === null) return { ok: false, reason: 'finding has no line number' };
  const pxStr = /(\d+(?:\.\d+)?)px/.exec(finding.message)?.[1];
  if (!pxStr) return { ok: false, reason: 'cannot extract px value from finding message' };

  const lineText = sourceLine(source, finding.line);
  const replacement = renderTokenReference(finding.file, classification.tokenPath);

  let newLineText = lineText;
  // Quoted forms: "16px"  '16px'  `16px`
  for (const quote of ['"', "'", '`']) {
    const quoted = `${quote}${pxStr}px${quote}`;
    if (lineText.includes(quoted)) {
      newLineText = lineText.replace(quoted, replacement);
      break;
    }
  }
  // CSS bare form: 16px (with word boundary so 116px doesn't match)
  if (newLineText === lineText) {
    const re = new RegExp(`\\b${pxStr}px\\b`);
    if (re.test(lineText)) {
      newLineText = lineText.replace(re, replacement);
    }
  }
  if (newLineText === lineText) {
    return { ok: false, reason: 'px literal not found on line in supported context' };
  }

  return {
    ok: true,
    newSource: replaceLine(source, finding.line, newLineText),
    diff: {
      file: finding.file,
      before: lineText,
      after: newLineText,
      line: finding.line,
    },
  };
}
