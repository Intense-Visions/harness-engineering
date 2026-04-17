// packages/core/src/annotations/protected-regions.ts

import type {
  ProtectionScope,
  ProtectedRegion,
  ProtectedRegionMap,
  AnnotationIssue,
} from './types';
import { VALID_SCOPES } from './types';

/**
 * Regex patterns for harness-ignore annotations.
 *
 * Line:  // harness-ignore [scopes]: [reason]
 * Start: // harness-ignore-start [scopes]: [reason]
 * End:   // harness-ignore-end
 *
 * Also supports # prefix for Python/shell files.
 * Does NOT match security-scanner patterns like `harness-ignore SEC-XXX-NNN`.
 */
const LINE_PATTERN =
  /^[ \t]*(?:\/\/|#)\s*harness-ignore(?!\s*(?:SEC-|-start|-end))(?:\s+([\w,]+))?(?::\s*(.+))?$/;
const START_PATTERN = /^[ \t]*(?:\/\/|#)\s*harness-ignore-start(?:\s+([\w,]+))?(?::\s*(.+))?$/;
const END_PATTERN = /^[ \t]*(?:\/\/|#)\s*harness-ignore-end\s*$/;

/** Check if a line is a comment or blank (for skipping past when finding protected line). */
function isCommentOrBlank(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === '') return true;
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('*')
  );
}

/** Parse scope string into validated ProtectionScope array. Returns unknown scopes separately. */
function parseScopes(scopeStr: string | undefined): {
  scopes: ProtectionScope[];
  unknown: string[];
} {
  if (!scopeStr) return { scopes: ['all'], unknown: [] };

  const raw = scopeStr.split(',').map((s) => s.trim());
  const scopes: ProtectionScope[] = [];
  const unknown: string[] = [];

  for (const s of raw) {
    if (VALID_SCOPES.has(s)) {
      scopes.push(s as ProtectionScope);
    } else {
      unknown.push(s);
    }
  }

  if (scopes.length === 0) scopes.push('all');
  return { scopes, unknown };
}

/** Report unknown scopes as issues when present. */
function reportUnknownScopes(
  unknown: string[],
  filePath: string,
  lineNum: number,
  issues: AnnotationIssue[]
): void {
  if (unknown.length > 0) {
    issues.push({
      file: filePath,
      line: lineNum,
      type: 'unknown-scope',
      message: `Unknown protection scope(s): ${unknown.join(', ')} at line ${lineNum}`,
    });
  }
}

/** Find the next non-comment, non-blank line index after a given position. */
function findNextCodeLine(lines: string[], startIndex: number): number {
  for (let j = startIndex; j < lines.length; j++) {
    if (!isCommentOrBlank(lines[j]!)) return j + 1; // 1-indexed
  }
  return startIndex; // fallback: protect the annotation line itself (0-indexed → already 1-indexed from caller)
}

interface BlockEntry {
  line: number;
  scopes: ProtectionScope[];
  reason: string | null;
}

/** Handle a block-end annotation. */
function handleBlockEnd(
  filePath: string,
  lineNum: number,
  blockStack: BlockEntry[],
  regions: ProtectedRegion[],
  issues: AnnotationIssue[]
): void {
  if (blockStack.length === 0) {
    issues.push({
      file: filePath,
      line: lineNum,
      type: 'orphaned-end',
      message: `harness-ignore-end at line ${lineNum} has no matching harness-ignore-start`,
    });
    return;
  }

  const open = blockStack.pop()!;
  regions.push({
    file: filePath,
    startLine: open.line,
    endLine: lineNum,
    scopes: open.scopes,
    reason: open.reason,
    type: 'block',
  });
}

/** Handle a block-start annotation. */
function handleBlockStart(
  match: RegExpExecArray,
  filePath: string,
  lineNum: number,
  blockStack: BlockEntry[],
  issues: AnnotationIssue[]
): void {
  const { scopes, unknown } = parseScopes(match[1]);
  const reason = match[2]?.trim() || null;
  reportUnknownScopes(unknown, filePath, lineNum, issues);
  blockStack.push({ line: lineNum, scopes, reason });
}

/** Handle a line-level annotation. */
function handleLineAnnotation(
  match: RegExpExecArray,
  filePath: string,
  lineNum: number,
  lines: string[],
  lineIndex: number,
  regions: ProtectedRegion[],
  issues: AnnotationIssue[]
): void {
  const { scopes, unknown } = parseScopes(match[1]);
  const reason = match[2]?.trim() || null;
  reportUnknownScopes(unknown, filePath, lineNum, issues);

  const targetLine = findNextCodeLine(lines, lineIndex + 1);
  regions.push({
    file: filePath,
    startLine: targetLine,
    endLine: targetLine,
    scopes,
    reason,
    type: 'line',
  });
}

/** Close any remaining open blocks as unclosed, creating regions to end-of-file. */
function closeUnclosedBlocks(
  filePath: string,
  totalLines: number,
  blockStack: BlockEntry[],
  regions: ProtectedRegion[],
  issues: AnnotationIssue[]
): void {
  for (const open of blockStack) {
    issues.push({
      file: filePath,
      line: open.line,
      type: 'unclosed-block',
      message: `harness-ignore-start at line ${open.line} has no matching harness-ignore-end`,
    });
    regions.push({
      file: filePath,
      startLine: open.line,
      endLine: totalLines,
      scopes: open.scopes,
      reason: open.reason,
      type: 'block',
    });
  }
}

/**
 * Parse a single file for protected regions and annotation issues.
 */
export function parseFileRegions(
  filePath: string,
  content: string
): { regions: ProtectedRegion[]; issues: AnnotationIssue[] } {
  const regions: ProtectedRegion[] = [];
  const issues: AnnotationIssue[] = [];

  if (!content) return { regions, issues };

  const lines = content.split('\n');
  const blockStack: BlockEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNum = i + 1;

    if (END_PATTERN.test(line)) {
      handleBlockEnd(filePath, lineNum, blockStack, regions, issues);
      continue;
    }

    const startMatch = START_PATTERN.exec(line);
    if (startMatch) {
      handleBlockStart(startMatch, filePath, lineNum, blockStack, issues);
      continue;
    }

    const lineMatch = LINE_PATTERN.exec(line);
    if (lineMatch) {
      handleLineAnnotation(lineMatch, filePath, lineNum, lines, i, regions, issues);
    }
  }

  closeUnclosedBlocks(filePath, lines.length, blockStack, regions, issues);
  return { regions, issues };
}

/**
 * Create a ProtectedRegionMap from a list of regions with efficient lookup.
 */
export function createRegionMap(regions: ProtectedRegion[]): ProtectedRegionMap {
  const byFile = new Map<string, ProtectedRegion[]>();
  for (const region of regions) {
    const existing = byFile.get(region.file) ?? [];
    existing.push(region);
    byFile.set(region.file, existing);
  }

  return {
    regions,

    isProtected(file: string, line: number, scope: ProtectionScope): boolean {
      const fileRegions = byFile.get(file);
      if (!fileRegions) return false;

      return fileRegions.some((r) => {
        if (line < r.startLine || line > r.endLine) return false;
        return r.scopes.includes('all') || r.scopes.includes(scope);
      });
    },

    getRegions(file: string): ProtectedRegion[] {
      return byFile.get(file) ?? [];
    },
  };
}

/**
 * Parse multiple files for protected regions and aggregate results.
 */
export function parseProtectedRegions(files: Array<{ path: string; content: string }>): {
  regions: ProtectedRegionMap;
  issues: AnnotationIssue[];
} {
  const allRegions: ProtectedRegion[] = [];
  const allIssues: AnnotationIssue[] = [];

  for (const file of files) {
    const { regions, issues } = parseFileRegions(file.path, file.content);
    allRegions.push(...regions);
    allIssues.push(...issues);
  }

  return {
    regions: createRegionMap(allRegions),
    issues: allIssues,
  };
}
