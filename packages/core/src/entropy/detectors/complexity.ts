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

/**
 * Extract function boundaries from source code using regex.
 * Handles function declarations, methods, and arrow functions.
 */
function extractFunctions(content: string): FunctionInfo[] {
  const functions: FunctionInfo[] = [];
  const lines = content.split('\n');

  // Patterns for function-like declarations
  const patterns = [
    // function declarations: function name(params) {
    /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/,
    // method declarations: name(params) {
    /^\s*(?:async\s+)?(\w+)\s*\(([^)]*)\)\s*(?::\s*[^{]+)?\s*\{/,
    // arrow functions assigned to const/let/var: const name = (params) =>
    /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*(?::\s*[^=]+)?\s*=>/,
    // arrow functions assigned to const/let/var with single param: const name = param =>
    /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(\w+)\s*=>/,
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    for (const pattern of patterns) {
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
 * Find the end of a function by tracking brace depth.
 */
function findFunctionEnd(lines: string[], startIdx: number): number {
  let depth = 0;
  let foundOpen = false;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i]!;
    for (const ch of line) {
      if (ch === '{') {
        depth++;
        foundOpen = true;
      } else if (ch === '}') {
        depth--;
        if (foundOpen && depth === 0) {
          return i;
        }
      }
    }
  }

  // If no matching brace found, return last line
  return lines.length - 1;
}

/**
 * Compute cyclomatic complexity by counting decision points.
 */
function computeCyclomaticComplexity(body: string): number {
  let complexity = 1; // Base complexity

  // Count decision points using regex
  const decisionPatterns = [
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

  for (const pattern of decisionPatterns) {
    const matches = body.match(pattern);
    if (matches) {
      complexity += matches.length;
    }
  }

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

/**
 * Detect complexity violations across a codebase snapshot.
 */
export async function detectComplexityViolations(
  snapshot: CodebaseSnapshot,
  config?: ComplexityConfig,
  graphData?: GraphComplexityData
): Promise<Result<ComplexityReport, EntropyError>> {
  const violations: ComplexityViolation[] = [];
  const thresholds = {
    cyclomaticComplexity: {
      error:
        config?.thresholds?.cyclomaticComplexity?.error ??
        DEFAULT_THRESHOLDS.cyclomaticComplexity.error,
      warn:
        config?.thresholds?.cyclomaticComplexity?.warn ??
        DEFAULT_THRESHOLDS.cyclomaticComplexity.warn,
    },
    nestingDepth: {
      warn: config?.thresholds?.nestingDepth?.warn ?? DEFAULT_THRESHOLDS.nestingDepth.warn,
    },
    functionLength: {
      warn: config?.thresholds?.functionLength?.warn ?? DEFAULT_THRESHOLDS.functionLength.warn,
    },
    parameterCount: {
      warn: config?.thresholds?.parameterCount?.warn ?? DEFAULT_THRESHOLDS.parameterCount.warn,
    },
    fileLength: {
      info: config?.thresholds?.fileLength?.info ?? DEFAULT_THRESHOLDS.fileLength.info,
    },
  };

  let totalFunctions = 0;

  for (const file of snapshot.files) {
    let content: string;
    try {
      content = await readFile(file.path, 'utf-8');
    } catch {
      continue; // Skip files that can't be read
    }

    const lines = content.split('\n');

    // Check file length
    if (lines.length > thresholds.fileLength.info) {
      violations.push({
        file: file.path,
        function: '<file>',
        line: 1,
        metric: 'fileLength',
        value: lines.length,
        threshold: thresholds.fileLength.info,
        tier: 3,
        severity: 'info',
        message: `File has ${lines.length} lines (threshold: ${thresholds.fileLength.info})`,
      });
    }

    // Extract and analyze functions
    const functions = extractFunctions(content);
    totalFunctions += functions.length;

    for (const fn of functions) {
      // Cyclomatic complexity
      const complexity = computeCyclomaticComplexity(fn.body);
      if (complexity > thresholds.cyclomaticComplexity.error) {
        violations.push({
          file: file.path,
          function: fn.name,
          line: fn.line,
          metric: 'cyclomaticComplexity',
          value: complexity,
          threshold: thresholds.cyclomaticComplexity.error,
          tier: 1,
          severity: 'error',
          message: `Function "${fn.name}" has cyclomatic complexity of ${complexity} (error threshold: ${thresholds.cyclomaticComplexity.error})`,
        });
      } else if (complexity > thresholds.cyclomaticComplexity.warn) {
        violations.push({
          file: file.path,
          function: fn.name,
          line: fn.line,
          metric: 'cyclomaticComplexity',
          value: complexity,
          threshold: thresholds.cyclomaticComplexity.warn,
          tier: 2,
          severity: 'warning',
          message: `Function "${fn.name}" has cyclomatic complexity of ${complexity} (warning threshold: ${thresholds.cyclomaticComplexity.warn})`,
        });
      }

      // Nesting depth
      const nestingDepth = computeNestingDepth(fn.body);
      if (nestingDepth > thresholds.nestingDepth.warn) {
        violations.push({
          file: file.path,
          function: fn.name,
          line: fn.line,
          metric: 'nestingDepth',
          value: nestingDepth,
          threshold: thresholds.nestingDepth.warn,
          tier: 2,
          severity: 'warning',
          message: `Function "${fn.name}" has nesting depth of ${nestingDepth} (threshold: ${thresholds.nestingDepth.warn})`,
        });
      }

      // Function length
      const fnLength = fn.endLine - fn.startLine + 1;
      if (fnLength > thresholds.functionLength.warn) {
        violations.push({
          file: file.path,
          function: fn.name,
          line: fn.line,
          metric: 'functionLength',
          value: fnLength,
          threshold: thresholds.functionLength.warn,
          tier: 2,
          severity: 'warning',
          message: `Function "${fn.name}" is ${fnLength} lines long (threshold: ${thresholds.functionLength.warn})`,
        });
      }

      // Parameter count
      if (fn.params > thresholds.parameterCount.warn) {
        violations.push({
          file: file.path,
          function: fn.name,
          line: fn.line,
          metric: 'parameterCount',
          value: fn.params,
          threshold: thresholds.parameterCount.warn,
          tier: 2,
          severity: 'warning',
          message: `Function "${fn.name}" has ${fn.params} parameters (threshold: ${thresholds.parameterCount.warn})`,
        });
      }

      // Graph hotspot scoring
      if (graphData) {
        const hotspot = graphData.hotspots.find(
          (h) => h.file === file.path && h.function === fn.name
        );
        if (hotspot && hotspot.hotspotScore > graphData.percentile95Score) {
          violations.push({
            file: file.path,
            function: fn.name,
            line: fn.line,
            metric: 'hotspotScore',
            value: hotspot.hotspotScore,
            threshold: graphData.percentile95Score,
            tier: 1,
            severity: 'error',
            message: `Function "${fn.name}" is a complexity hotspot (score: ${hotspot.hotspotScore}, p95: ${graphData.percentile95Score})`,
          });
        }
      }
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
