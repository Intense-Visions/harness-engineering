import { readFile } from 'node:fs/promises';
import type { Result } from '../../shared/result';
import { Ok } from '../../shared/result';
import type {
  EntropyError,
  CodebaseSnapshot,
  ComplexityConfig,
  ComplexityReport,
  ComplexityViolation,
} from '../types';

export interface GraphComplexityData {
  hotspots: Array<{ file: string; function: string; hotspotScore: number }>;
  percentile95Score: number;
}

const DEFAULT_THRESHOLDS = {
  cyclomaticComplexity: { error: 15, warn: 10 },
  nestingDepth: { warn: 4 },
  functionLength: { warn: 50 },
  parameterCount: { warn: 5 },
  fileLength: { info: 300 },
  hotspotPercentile: { error: 95 },
};

interface FunctionInfo {
  name: string;
  line: number;
  params: number;
  startLine: number;
  endLine: number;
  body: string;
}

// Patterns for function-like declarations (module-level to avoid unbalanced
// braces inside function bodies confusing the brace-counting detector).
const FUNCTION_PATTERNS = [
  // function declarations: function name(params) {
  /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/,
  // method declarations: name(params) {
  /^\s*(?:async\s+)?(\w+)\s*\(([^)]*)\)\s*(?::\s*[^{]+)?\s*\{/,
  // arrow functions assigned to const/let/var: const name = (params) =>
  /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*(?::\s*[^=]+)?\s*=>/,
  // arrow functions assigned to const/let/var with single param: const name = param =>
  /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(\w+)\s*=>/,
];

/**
 * Extract function boundaries from source code using regex.
 * Handles function declarations, methods, and arrow functions.
 */
function extractFunctions(content: string): FunctionInfo[] {
  const functions: FunctionInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    for (const pattern of FUNCTION_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        const name = match[1] ?? 'anonymous';
        const paramsStr = match[2] || '';
        const params = paramsStr.trim() === '' ? 0 : paramsStr.split(',').length;

        // Find the function body by tracking braces
        const endLine = findFunctionEnd(lines, i);
        const body = lines.slice(i, endLine + 1).join('\n');

        functions.push({
          name,
          line: i + 1,
          params,
          startLine: i + 1,
          endLine: endLine + 1,
          body,
        });
        break; // Only match one pattern per line
      }
    }
  }

  return functions;
}

/**
 * Lexical contexts the brace scan can be inside. A brace that appears inside
 * any of these is text, not structure, so it must not move the depth counter.
 */
type ScanContext = 'code' | 'blockComment' | 'single' | 'double' | 'template' | 'regex';

// A `/` opens a regex literal only where a value cannot already have ended.
// After an identifier, a number, or a closing `)`/`]`, the `/` is division.
// Keywords are the exception: `return /x/` is a regex, `count / 2` is not.
const REGEX_PRECEDING_PUNCTUATION = new Set([
  '(',
  ',',
  '=',
  ':',
  '[',
  '!',
  '&',
  '|',
  '?',
  '{',
  '}',
  ';',
  '+',
  '-',
  '*',
  '%',
  '^',
  '<',
  '>',
  '~',
]);

const REGEX_PRECEDING_KEYWORDS =
  /\b(?:return|typeof|instanceof|in|of|new|delete|void|case|do|else|yield|await)$/;

/**
 * Decide whether the `/` at `index` starts a regex literal rather than a
 * division operator, from the code that precedes it on the same line.
 */
function startsRegexLiteral(line: string, index: number): boolean {
  const before = line.slice(0, index).trimEnd();
  if (before === '') return true;
  const last = before[before.length - 1]!;
  if (REGEX_PRECEDING_PUNCTUATION.has(last)) return true;
  return REGEX_PRECEDING_KEYWORDS.test(before);
}

/** Mutable state carried by the literal-aware brace scan. */
interface ScanState {
  context: ScanContext;
  /** Inside a regex `[...]` class, where `/` does not terminate the literal. */
  charClass: boolean;
  /** Brace depth recorded at each open `${ ... }` interpolation. */
  templateSpans: number[];
  depth: number;
  foundOpen: boolean;
}

const QUOTE_CONTEXTS: Record<string, ScanContext | undefined> = {
  "'": 'single',
  '"': 'double',
  '`': 'template',
};

const QUOTE_CLOSERS: Record<string, string | undefined> = {
  single: "'",
  double: '"',
  template: '`',
};

/** Advance one character inside a block comment. Returns the next index. */
function advanceInBlockComment(line: string, c: number, state: ScanState): number {
  if (line[c] === '*' && line[c + 1] === '/') {
    state.context = 'code';
    return c + 1;
  }
  return c;
}

/** Advance one character inside a regex literal. Returns the next index. */
function advanceInRegex(line: string, c: number, state: ScanState): number {
  const ch = line[c];
  if (ch === '\\') return c + 1;
  if (ch === '[') state.charClass = true;
  else if (ch === ']') state.charClass = false;
  else if (ch === '/' && !state.charClass) state.context = 'code';
  return c;
}

/** Advance one character inside a quoted or template string. */
function advanceInString(line: string, c: number, state: ScanState): number {
  const ch = line[c];
  if (ch === '\\') return c + 1;
  if (ch === QUOTE_CLOSERS[state.context]) {
    state.context = 'code';
    return c;
  }
  if (state.context === 'template' && ch === '$' && line[c + 1] === '{') {
    // An interpolation is code again, but its closing `}` belongs to the
    // template, not to the enclosing block.
    state.templateSpans.push(state.depth);
    state.context = 'code';
    return c + 1;
  }
  return c;
}

/** Advance one character inside any non-code context. */
function advanceInNonCode(line: string, c: number, state: ScanState): number {
  if (state.context === 'blockComment') return advanceInBlockComment(line, c, state);
  if (state.context === 'regex') return advanceInRegex(line, c, state);
  return advanceInString(line, c, state);
}

/**
 * Handle a `/` in code: block comment or regex literal. (Line comments are
 * handled by the caller, which stops scanning the line outright.) Returns the
 * index to resume from, or -1 when it is a division operator.
 */
function enterSlashContext(line: string, c: number, state: ScanState): number {
  const next = line[c + 1];
  if (next === '*') {
    state.context = 'blockComment';
    return c + 1;
  }
  if (startsRegexLiteral(line, c)) {
    state.context = 'regex';
    state.charClass = false;
    return c;
  }
  return -1;
}

/**
 * If the character at `c` opens a literal or comment, enter that context and
 * return the index to resume from. Returns -1 when it is ordinary code.
 */
function enterNonCodeContext(line: string, c: number, state: ScanState): number {
  const ch = line[c];
  if (ch === '/') return enterSlashContext(line, c, state);
  const quoted = ch === undefined ? undefined : QUOTE_CONTEXTS[ch];
  if (quoted !== undefined) {
    state.context = quoted;
    return c;
  }
  return -1;
}

/**
 * Apply one code character to the brace tracker. Returns true when it ends
 * the function.
 */
function applyStructuralChar(ch: string, state: ScanState): boolean {
  if (ch === '{') {
    state.depth++;
    state.foundOpen = true;
    return false;
  }
  if (ch === '}') {
    const span = state.templateSpans[state.templateSpans.length - 1];
    if (span !== undefined && state.depth === span) {
      // Closes a `${ ... }` interpolation, not a block.
      state.templateSpans.pop();
      state.context = 'template';
      return false;
    }
    state.depth--;
    return state.foundOpen && state.depth === 0;
  }
  // Expression-bodied arrow / bodyless declaration: the statement ends before
  // any block opens, so the function ends on this line rather than running
  // the brace scan into the next function or to EOF (issue #1329).
  return ch === ';' && !state.foundOpen && state.depth === 0;
}

/**
 * Find the end of a function by tracking brace depth.
 *
 * The scan is literal- and comment-aware: a `{` inside a string, a template
 * literal, a regex, or a comment is ignored. Without that, an unmatched brace
 * in a literal (`const open = '{';`) never closes, so the function's measured
 * extent runs to EOF and it absorbs every following function's decision
 * points (issues #1329, #2037).
 *
 * This is a deliberately small scanner, not a tokenizer. Regex literals are
 * recognised by a heuristic on the preceding token rather than by parsing,
 * because a regex may hold an unbalanced brace or a stray backtick
 * that would otherwise derail the string tracking.
 */
function findFunctionEnd(lines: string[], startIdx: number): number {
  const state: ScanState = {
    context: 'code',
    charClass: false,
    templateSpans: [],
    depth: 0,
    foundOpen: false,
  };

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i]!;

    // Only block comments and template literals legally span a newline, so
    // every other context is reset per line. That stops one unterminated
    // quote from swallowing the rest of the file.
    if (state.context !== 'blockComment' && state.context !== 'template') {
      state.context = 'code';
      state.charClass = false;
    }

    for (let c = 0; c < line.length; c++) {
      if (state.context !== 'code') {
        c = advanceInNonCode(line, c, state);
        continue;
      }

      // A `//` comment runs to the newline; nothing after it is structural.
      if (line[c] === '/' && line[c + 1] === '/') break;

      const resumeAt = enterNonCodeContext(line, c, state);
      if (resumeAt >= 0) {
        c = resumeAt;
        continue;
      }

      if (applyStructuralChar(line[c]!, state)) return i;
    }
  }

  // If no matching brace found, return last line
  return lines.length - 1;
}

const DECISION_PATTERNS = [
  /\bif\s*\(/g,
  /\belse\s+if\s*\(/g,
  /\bwhile\s*\(/g,
  /\bfor\s*\(/g,
  /\bcase\s+/g,
  /&&/g,
  /\|\|/g,
  /\?(?!=)/g, // Ternary ? but not ?. or ??
  /\bcatch\s*\(/g,
];

/**
 * Count all decision-point matches across all patterns in a function body.
 */
function countDecisionPoints(body: string): number {
  let count = 0;
  for (const pattern of DECISION_PATTERNS) {
    const matches = body.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
}

/**
 * Compute cyclomatic complexity by counting decision points.
 */
function computeCyclomaticComplexity(body: string): number {
  let complexity = 1 + countDecisionPoints(body);

  // else if is counted by both 'if' and 'else if' patterns, deduplicate
  const elseIfMatches = body.match(/\belse\s+if\s*\(/g);
  if (elseIfMatches) {
    complexity -= elseIfMatches.length; // Remove double-count from 'if' pattern
  }

  return complexity;
}

/**
 * Compute maximum nesting depth of a function body.
 * Subtract 1 for the function body's own brace.
 */
function computeNestingDepth(body: string): number {
  let maxDepth = 0;
  let currentDepth = 0;
  let functionBodyStarted = false;

  for (const ch of body) {
    if (ch === '{') {
      if (!functionBodyStarted) {
        functionBodyStarted = true;
        continue; // Skip the function body opening brace
      }
      currentDepth++;
      if (currentDepth > maxDepth) {
        maxDepth = currentDepth;
      }
    } else if (ch === '}') {
      if (currentDepth > 0) {
        currentDepth--;
      }
    }
  }

  return maxDepth;
}

interface ResolvedThresholds {
  cyclomaticComplexity: { error: number; warn: number };
  nestingDepth: { warn: number };
  functionLength: { warn: number };
  parameterCount: { warn: number };
  fileLength: { info: number };
}

function resolveThresholds(config?: ComplexityConfig): ResolvedThresholds {
  const userThresholds = config?.thresholds;
  if (!userThresholds) return { ...DEFAULT_THRESHOLDS };

  return {
    cyclomaticComplexity: {
      ...DEFAULT_THRESHOLDS.cyclomaticComplexity,
      ...stripUndefined(userThresholds.cyclomaticComplexity),
    },
    nestingDepth: {
      ...DEFAULT_THRESHOLDS.nestingDepth,
      ...stripUndefined(userThresholds.nestingDepth),
    },
    functionLength: {
      ...DEFAULT_THRESHOLDS.functionLength,
      ...stripUndefined(userThresholds.functionLength),
    },
    parameterCount: {
      ...DEFAULT_THRESHOLDS.parameterCount,
      ...stripUndefined(userThresholds.parameterCount),
    },
    fileLength: { ...DEFAULT_THRESHOLDS.fileLength, ...stripUndefined(userThresholds.fileLength) },
  };
}

function stripUndefined<T extends Record<string, unknown>>(obj?: Partial<T>): Partial<T> {
  if (!obj) return {} as Partial<T>;
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) result[key] = val;
  }
  return result as Partial<T>;
}

function checkFileLengthViolation(
  filePath: string,
  lineCount: number,
  threshold: number
): ComplexityViolation | null {
  if (lineCount <= threshold) return null;
  return {
    file: filePath,
    function: '<file>',
    line: 1,
    metric: 'fileLength',
    value: lineCount,
    threshold,
    tier: 3,
    severity: 'info',
    message: `File has ${lineCount} lines (threshold: ${threshold})`,
  };
}

function checkCyclomaticComplexity(
  filePath: string,
  fn: FunctionInfo,
  thresholds: { error: number; warn: number }
): ComplexityViolation | null {
  const complexity = computeCyclomaticComplexity(fn.body);
  if (complexity > thresholds.error) {
    return {
      file: filePath,
      function: fn.name,
      line: fn.line,
      metric: 'cyclomaticComplexity',
      value: complexity,
      threshold: thresholds.error,
      tier: 1,
      severity: 'error',
      message: `Function "${fn.name}" has cyclomatic complexity of ${complexity} (error threshold: ${thresholds.error})`,
    };
  }
  if (complexity > thresholds.warn) {
    return {
      file: filePath,
      function: fn.name,
      line: fn.line,
      metric: 'cyclomaticComplexity',
      value: complexity,
      threshold: thresholds.warn,
      tier: 2,
      severity: 'warning',
      message: `Function "${fn.name}" has cyclomatic complexity of ${complexity} (warning threshold: ${thresholds.warn})`,
    };
  }
  return null;
}

function checkNestingDepth(
  filePath: string,
  fn: FunctionInfo,
  threshold: number
): ComplexityViolation | null {
  const depth = computeNestingDepth(fn.body);
  if (depth <= threshold) return null;
  return {
    file: filePath,
    function: fn.name,
    line: fn.line,
    metric: 'nestingDepth',
    value: depth,
    threshold,
    tier: 2,
    severity: 'warning',
    message: `Function "${fn.name}" has nesting depth of ${depth} (threshold: ${threshold})`,
  };
}

function checkFunctionLength(
  filePath: string,
  fn: FunctionInfo,
  threshold: number
): ComplexityViolation | null {
  const fnLength = fn.endLine - fn.startLine + 1;
  if (fnLength <= threshold) return null;
  return {
    file: filePath,
    function: fn.name,
    line: fn.line,
    metric: 'functionLength',
    value: fnLength,
    threshold,
    tier: 2,
    severity: 'warning',
    message: `Function "${fn.name}" is ${fnLength} lines long (threshold: ${threshold})`,
  };
}

function checkParameterCount(
  filePath: string,
  fn: FunctionInfo,
  threshold: number
): ComplexityViolation | null {
  if (fn.params <= threshold) return null;
  return {
    file: filePath,
    function: fn.name,
    line: fn.line,
    metric: 'parameterCount',
    value: fn.params,
    threshold,
    tier: 2,
    severity: 'warning',
    message: `Function "${fn.name}" has ${fn.params} parameters (threshold: ${threshold})`,
  };
}

function checkHotspot(
  filePath: string,
  fn: FunctionInfo,
  graphData: GraphComplexityData
): ComplexityViolation | null {
  const hotspot = graphData.hotspots.find((h) => h.file === filePath && h.function === fn.name);
  if (!hotspot || hotspot.hotspotScore <= graphData.percentile95Score) return null;
  return {
    file: filePath,
    function: fn.name,
    line: fn.line,
    metric: 'hotspotScore',
    value: hotspot.hotspotScore,
    threshold: graphData.percentile95Score,
    tier: 1,
    severity: 'error',
    message: `Function "${fn.name}" is a complexity hotspot (score: ${hotspot.hotspotScore}, p95: ${graphData.percentile95Score})`,
  };
}

function collectFunctionViolations(
  filePath: string,
  fn: FunctionInfo,
  thresholds: ResolvedThresholds,
  graphData?: GraphComplexityData
): ComplexityViolation[] {
  const checks: Array<ComplexityViolation | null> = [
    checkCyclomaticComplexity(filePath, fn, thresholds.cyclomaticComplexity),
    checkNestingDepth(filePath, fn, thresholds.nestingDepth.warn),
    checkFunctionLength(filePath, fn, thresholds.functionLength.warn),
    checkParameterCount(filePath, fn, thresholds.parameterCount.warn),
  ];
  if (graphData) {
    checks.push(checkHotspot(filePath, fn, graphData));
  }
  return checks.filter((v): v is ComplexityViolation => v !== null);
}

/**
 * Detect complexity violations across a codebase snapshot.
 */
export async function detectComplexityViolations(
  snapshot: CodebaseSnapshot,
  config?: ComplexityConfig,
  graphData?: GraphComplexityData
): Promise<Result<ComplexityReport, EntropyError>> {
  const violations: ComplexityViolation[] = [];
  const thresholds = resolveThresholds(config);
  let totalFunctions = 0;

  for (const file of snapshot.files) {
    let content: string;
    try {
      content = await readFile(file.path, 'utf-8');
    } catch {
      continue;
    }

    const lines = content.split('\n');

    const fileLenViolation = checkFileLengthViolation(
      file.path,
      lines.length,
      thresholds.fileLength.info
    );
    if (fileLenViolation) violations.push(fileLenViolation);

    const functions = extractFunctions(content);
    totalFunctions += functions.length;

    for (const fn of functions) {
      violations.push(...collectFunctionViolations(file.path, fn, thresholds, graphData));
    }
  }

  const errorCount = violations.filter((v) => v.severity === 'error').length;
  const warningCount = violations.filter((v) => v.severity === 'warning').length;
  const infoCount = violations.filter((v) => v.severity === 'info').length;

  return Ok({
    violations,
    stats: {
      filesAnalyzed: snapshot.files.length,
      functionsAnalyzed: totalFunctions,
      violationCount: violations.length,
      errorCount,
      warningCount,
      infoCount,
    },
  });
}
