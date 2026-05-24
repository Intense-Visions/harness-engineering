/**
 * DRIFT-T001 codemod — replace a hex literal with a token reference.
 *
 * Replacement form depends on file extension:
 *   .ts/.tsx/.js/.jsx → tokens.<path>
 *   .css/.scss        → var(--<dotted-path-as-kebab>)
 *
 * Pure function: takes source + finding + classification, returns the
 * new source. The caller writes to disk.
 *
 * Source: docs/changes/design-pipeline/align-design-system/proposal.md
 *   (Technical Design → Codemod implementation).
 */

import type { DriftFinding } from '../../drift/findings/finding.js';
import type { Classification } from '../classifier/pre-flight.js';
import type { FixDiff } from '../findings/outcome.js';
import { renderTokenReference, sourceLine } from './common.js';

export interface CodemodResult {
  ok: true;
  newSource: string;
  diff: FixDiff;
}

export interface CodemodFailure {
  ok: false;
  reason: string;
}

export function applyT001Codemod(
  source: string,
  finding: DriftFinding,
  classification: Extract<Classification, { kind: 'safe-codemod' }>
): CodemodResult | CodemodFailure {
  if (finding.line === null) return { ok: false, reason: 'finding has no line number' };
  const hex = /#[0-9a-fA-F]{3,8}/.exec(finding.message)?.[0];
  if (!hex) return { ok: false, reason: 'cannot extract hex from finding message' };

  const lineText = sourceLine(source, finding.line);
  // Replace ALL occurrences of the literal on that line (regex-detect
  // dedup'd per-line, so multiple identical hexes on one line are one
  // finding but multiple textual matches).
  if (!lineText.includes(hex)) {
    return { ok: false, reason: 'hex no longer present on expected line (file may have changed)' };
  }

  const replacement = renderTokenReference(finding.file, classification.tokenPath);
  // Replace the QUOTED form: "hex" or 'hex' or `hex`. If unquoted (CSS),
  // replace the bare hex.
  const newLineText = replaceHexInLine(lineText, hex, replacement);
  if (newLineText === lineText) {
    return { ok: false, reason: 'no replacement performed (unsupported context)' };
  }

  const newSource = replaceLine(source, finding.line, newLineText);
  return {
    ok: true,
    newSource,
    diff: {
      file: finding.file,
      before: lineText,
      after: newLineText,
      line: finding.line,
    },
  };
}

function replaceHexInLine(line: string, hex: string, replacement: string): string {
  // Try quoted forms first: "..." '...' `...`
  for (const quote of ['"', "'", '`']) {
    const quoted = `${quote}${hex}${quote}`;
    if (line.includes(quoted)) {
      return line.replace(quoted, replacement);
    }
  }
  // Bare form (CSS): replace the hex itself
  return line.replace(hex, replacement);
}

function replaceLine(source: string, line: number, newLine: string): string {
  const lines = source.split('\n');
  if (line < 1 || line > lines.length) return source;
  lines[line - 1] = newLine;
  return lines.join('\n');
}
