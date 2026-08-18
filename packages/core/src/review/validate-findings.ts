import * as path from 'node:path';
import type { ReviewFinding, GraphAdapter, FindingSeverity } from './types';
import type { ExclusionSet } from './exclusion-set';
import { parseHarnessIgnore } from '../security/harness-ignore';

/**
 * Options for the validation phase.
 */
export interface ValidateFindingsOptions {
  /** All findings from Phase 4 fan-out */
  findings: ReviewFinding[];
  /** ExclusionSet built from mechanical findings in Phase 2 */
  exclusionSet: ExclusionSet;
  /** Graph adapter (optional — falls back to import-chain heuristic when absent) */
  graph?: GraphAdapter;
  /** Project root for path normalization */
  projectRoot: string;
  /** Changed file contents for import-chain heuristic (file path -> content) */
  fileContents?: Map<string, string>;
  /**
   * Full (line-aligned) content of each changed file, keyed by the same path the
   * findings carry. Used to honor `// harness-ignore SEC-XXX-NNN` annotations on
   * the heuristic path exactly as the mechanical SecurityScanner does (#1302).
   *
   * Distinct from {@link fileContents}, which holds per-file *diff hunks* whose
   * line numbers do not align with a finding's `lineRange`; annotation lookup
   * needs the true source lines.
   */
  changedFileContents?: Map<string, string>;
}

/**
 * Severity downgrade map: critical -> important -> suggestion (unchanged).
 */
const DOWNGRADE_MAP: Record<FindingSeverity, FindingSeverity> = {
  critical: 'important',
  important: 'suggestion',
  suggestion: 'suggestion',
};

/**
 * Extract cross-file references from a finding's evidence.
 * Looks for patterns like "src/foo.ts affects src/bar.ts" or file paths
 * in evidence entries that differ from the finding's own file.
 */
function extractCrossFileRefs(finding: ReviewFinding): Array<{ from: string; to: string }> {
  const refs: Array<{ from: string; to: string }> = [];
  const crossFilePattern = /([^\s]+\.(?:ts|tsx|js|jsx))\s+affects\s+([^\s]+\.(?:ts|tsx|js|jsx))/i;

  for (const ev of finding.evidence) {
    const match = ev.match(crossFilePattern);
    if (match) {
      refs.push({ from: match[1]!, to: match[2]! });
    }
  }

  return refs;
}

/**
 * Normalize a file path to project-relative form.
 * Handles absolute paths by stripping the project root prefix.
 * Handles leading ./ or redundant separators.
 */
function normalizePath(filePath: string, projectRoot: string): string {
  let normalized = filePath;

  // Normalize to forward slashes for cross-platform consistency
  normalized = normalized.replace(/\\/g, '/');
  const normalizedRoot = projectRoot.replace(/\\/g, '/');

  // Strip project root if absolute
  if (path.isAbsolute(normalized)) {
    const root = normalizedRoot.endsWith('/') ? normalizedRoot : normalizedRoot + '/';
    if (normalized.startsWith(root)) {
      normalized = normalized.slice(root.length);
    }
  }

  // Strip leading ./
  if (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }

  return normalized;
}

function resolveImportPath(currentFile: string, importPath: string): string {
  const dir = path.dirname(currentFile);
  let resolved = path.join(dir, importPath).replace(/\\/g, '/');
  if (!resolved.match(/\.(ts|tsx|js|jsx)$/)) {
    resolved += '.ts';
  }
  return path.normalize(resolved).replace(/\\/g, '/');
}

function enqueueImports(
  content: string,
  current: { file: string; depth: number },
  visited: Set<string>,
  queue: Array<{ file: string; depth: number }>,
  maxDepth: number
): void {
  const importRegex = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1]!;
    if (!importPath.startsWith('.')) continue;
    const resolved = resolveImportPath(current.file, importPath);
    if (!visited.has(resolved) && current.depth + 1 <= maxDepth) {
      queue.push({ file: resolved, depth: current.depth + 1 });
    }
  }
}

/**
 * Follow imports up to `maxDepth` levels deep from a source file.
 * Returns all reachable file paths.
 */
function followImportChain(
  fromFile: string,
  fileContents: Map<string, string>,
  maxDepth: number = 2
): Set<string> {
  const visited = new Set<string>();
  const queue: Array<{ file: string; depth: number }> = [{ file: fromFile, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current.file) || current.depth > maxDepth) continue;
    visited.add(current.file);

    const content = fileContents.get(current.file);
    if (!content) continue;

    enqueueImports(content, current, visited, queue, maxDepth);
  }

  visited.delete(fromFile); // Don't include self
  return visited;
}

/**
 * Resolve a finding's changed-file content across the path forms it may carry
 * (project-relative as scanned, or absolute). Mirrors the multi-form lookup in
 * {@link isMechanicallyExcluded} so annotation suppression is not defeated by a
 * path-shape mismatch.
 */
function lookupChangedContent(
  finding: ReviewFinding,
  changedFileContents: Map<string, string>,
  projectRoot: string
): string | undefined {
  const direct = changedFileContents.get(finding.file);
  if (direct !== undefined) return direct;

  const normalized = normalizePath(finding.file, projectRoot);
  const byNormalized = changedFileContents.get(normalized);
  if (byNormalized !== undefined) return byNormalized;

  const absolute = path.isAbsolute(finding.file)
    ? finding.file
    : path.join(projectRoot, finding.file).replace(/\\/g, '/');
  return changedFileContents.get(absolute);
}

/**
 * True when a heuristic finding's line carries a matching `// harness-ignore
 * SEC-XXX-NNN` annotation (#1302). The heuristic security agent tags each
 * finding with the SecurityScanner rule it mirrors (`securityRuleId`); here we
 * reuse that scanner's own {@link parseHarnessIgnore} so the suppression is
 * byte-for-byte the mechanical path's — same-line first (trailing-comment
 * style), then the prior line (the dominant over-the-top convention).
 *
 * Findings without a `securityRuleId` (every non-security agent) can never match
 * a `SEC-` annotation and are left untouched, so this is a no-op for them.
 */
function isSuppressedByAnnotation(
  finding: ReviewFinding,
  changedFileContents: Map<string, string> | undefined,
  projectRoot: string
): boolean {
  const ruleId = finding.securityRuleId;
  if (!ruleId || !changedFileContents) return false;

  const content = lookupChangedContent(finding, changedFileContents, projectRoot);
  if (content === undefined) return false;

  const lines = content.split('\n');
  const lineNumber = finding.lineRange[0]; // 1-indexed
  const sameLine = lines[lineNumber - 1];
  if (sameLine !== undefined && parseHarnessIgnore(sameLine, ruleId)) return true;

  const priorLine = lineNumber >= 2 ? lines[lineNumber - 2] : undefined;
  return priorLine !== undefined && parseHarnessIgnore(priorLine, ruleId) !== null;
}

function isMechanicallyExcluded(
  finding: ReviewFinding,
  exclusionSet: ExclusionSet,
  projectRoot: string
): boolean {
  const normalizedFile = normalizePath(finding.file, projectRoot);
  if (exclusionSet.isExcluded(normalizedFile, finding.lineRange)) return true;
  if (exclusionSet.isExcluded(finding.file, finding.lineRange)) return true;

  const absoluteFile = path.isAbsolute(finding.file)
    ? finding.file
    : path.join(projectRoot, finding.file).replace(/\\/g, '/');
  return exclusionSet.isExcluded(absoluteFile, finding.lineRange);
}

async function validateWithGraph(
  crossFileRefs: Array<{ from: string; to: string }>,
  graph: GraphAdapter
): Promise<{ result: 'keep' | 'discard' | 'fallback' }> {
  try {
    for (const ref of crossFileRefs) {
      const reachable = await graph.isReachable(ref.from, ref.to);
      if (!reachable) return { result: 'discard' };
    }
    return { result: 'keep' };
  } catch {
    return { result: 'fallback' };
  }
}

function validateWithHeuristic(
  finding: ReviewFinding,
  crossFileRefs: Array<{ from: string; to: string }>,
  fileContents: Map<string, string> | undefined,
  projectRoot: string
): ReviewFinding {
  if (fileContents) {
    for (const ref of crossFileRefs) {
      const normalizedFrom = normalizePath(ref.from, projectRoot);
      const reachable = followImportChain(normalizedFrom, fileContents, 2);
      const normalizedTo = normalizePath(ref.to, projectRoot);
      if (reachable.has(normalizedTo)) {
        return { ...finding, validatedBy: 'heuristic' };
      }
    }
  }

  return {
    ...finding,
    severity: DOWNGRADE_MAP[finding.severity],
    validatedBy: 'heuristic',
  };
}

async function processFinding(
  finding: ReviewFinding,
  exclusionSet: ExclusionSet,
  graph: GraphAdapter | undefined,
  projectRoot: string,
  fileContents: Map<string, string> | undefined,
  changedFileContents: Map<string, string> | undefined
): Promise<ReviewFinding | null> {
  // #1302: honor `// harness-ignore SEC-XXX-NNN` on the heuristic path, exactly
  // as the mechanical SecurityScanner path already does.
  if (isSuppressedByAnnotation(finding, changedFileContents, projectRoot)) return null;
  if (isMechanicallyExcluded(finding, exclusionSet, projectRoot)) return null;

  const crossFileRefs = extractCrossFileRefs(finding);
  if (crossFileRefs.length === 0) return { ...finding };

  if (graph) {
    const { result } = await validateWithGraph(crossFileRefs, graph);
    if (result === 'keep') return { ...finding, validatedBy: 'graph' };
    if (result === 'discard') return null;
    // result === 'fallback': fall through to heuristic
  }

  return validateWithHeuristic(finding, crossFileRefs, fileContents, projectRoot);
}

/**
 * Validate Phase 4 findings against mechanical exclusion, graph reachability,
 * and import-chain heuristic fallback.
 *
 * 1. Mechanical exclusion: discard findings that overlap with ExclusionSet
 * 2. Graph reachability (if graph provided): verify cross-file claims, discard unreachable
 * 3. Import-chain heuristic (no graph): downgrade findings with unvalidated cross-file claims
 */
export async function validateFindings(options: ValidateFindingsOptions): Promise<ReviewFinding[]> {
  const { findings, exclusionSet, graph, projectRoot, fileContents, changedFileContents } = options;

  const validated: ReviewFinding[] = [];

  for (const finding of findings) {
    const result = await processFinding(
      finding,
      exclusionSet,
      graph,
      projectRoot,
      fileContents,
      changedFileContents
    );
    if (result !== null) validated.push(result);
  }

  return validated;
}
