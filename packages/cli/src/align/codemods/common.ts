/**
 * Shared helpers for align-design-system codemods.
 *
 * - renderTokenReference: file-extension-aware token reference syntax
 * - sourceLine: 1-indexed line accessor
 * - replaceLine: pure line-replace helper
 */

import * as path from 'node:path';

export function renderTokenReference(file: string, tokenPath: string): string {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.css' || ext === '.scss') {
    return `var(--${tokenPath.replace(/\./g, '-')})`;
  }
  return `tokens.${tokenPath}`;
}

export function sourceLine(source: string, line: number): string {
  return source.split('\n')[line - 1] ?? '';
}

export function replaceLine(source: string, line: number, newLine: string): string {
  const lines = source.split('\n');
  if (line < 1 || line > lines.length) return source;
  lines[line - 1] = newLine;
  return lines.join('\n');
}
