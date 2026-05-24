/**
 * DRIFT-T002 codemod — replace a font-family string with a token reference.
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

export function applyT002Codemod(
  source: string,
  finding: DriftFinding,
  classification: Extract<Classification, { kind: 'safe-codemod' }>
): CodemodResult | CodemodFailure {
  if (finding.line === null) return { ok: false, reason: 'finding has no line number' };
  const family = /"([^"]+)"/.exec(finding.message)?.[1];
  if (!family) return { ok: false, reason: 'cannot extract font-family from finding message' };

  const lineText = sourceLine(source, finding.line);
  const replacement = renderTokenReference(finding.file, classification.tokenPath);

  let newLineText = lineText;
  for (const quote of ['"', "'", '`']) {
    const quoted = `${quote}${family}${quote}`;
    if (lineText.includes(quoted)) {
      newLineText = lineText.replace(quoted, replacement);
      break;
    }
  }
  if (newLineText === lineText) {
    return { ok: false, reason: 'font-family literal not found on line' };
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
