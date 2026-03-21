import * as path from 'node:path';
import type { ReviewFinding, GraphAdapter, FindingSeverity } from './types';
import type { ExclusionSet } from './exclusion-set';

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

  // Strip project root if absolute
  if (path.isAbsolute(normalized)) {
    const root = projectRoot.endsWith(path.sep) ? projectRoot : projectRoot + path.sep;
    if (normalized.startsWith(root)) {
      normalized = normalized.slice(root.length);
    }
  }

  // Strip leading ./
  if (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }

  // Normalize path separators
  return path.normalize(normalized);
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

    // Extract import paths
    const importRegex = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1]!;
      if (!importPath.startsWith('.')) continue;

      // Resolve relative import to file path
      const dir = path.dirname(current.file);
      let resolved = path.join(dir, importPath);
      // Add .ts extension if missing
      if (!resolved.match(/\.(ts|tsx|js|jsx)$/)) {
        resolved += '.ts';
      }
      // Normalize
      resolved = path.normalize(resolved);

      if (!visited.has(resolved) && current.depth + 1 <= maxDepth) {
        queue.push({ file: resolved, depth: current.depth + 1 });
      }
    }
  }

  visited.delete(fromFile); // Don't include self
  return visited;
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
  const { findings, exclusionSet, graph, projectRoot, fileContents } = options;

  const validated: ReviewFinding[] = [];

  for (const finding of findings) {
    const normalizedFile = normalizePath(finding.file, projectRoot);

    // Step 1: Mechanical exclusion — check both normalized and original path
    if (
      exclusionSet.isExcluded(normalizedFile, finding.lineRange) ||
      exclusionSet.isExcluded(finding.file, finding.lineRange)
    ) {
      continue; // Discard — already caught by mechanical check
    }

    // Also check absolute form against exclusion set
    const absoluteFile = path.isAbsolute(finding.file)
      ? finding.file
      : path.join(projectRoot, finding.file);
    if (exclusionSet.isExcluded(absoluteFile, finding.lineRange)) {
      continue;
    }

    // Step 2: Check for cross-file claims
    const crossFileRefs = extractCrossFileRefs(finding);

    if (crossFileRefs.length === 0) {
      // Single-file finding — no cross-file validation needed
      validated.push({ ...finding });
      continue;
    }

    // Step 3: Validate cross-file claims
    if (graph) {
      // Graph reachability validation
      let allReachable = true;
      for (const ref of crossFileRefs) {
        const reachable = await graph.isReachable(ref.from, ref.to);
        if (!reachable) {
          allReachable = false;
          break;
        }
      }

      if (allReachable) {
        validated.push({ ...finding, validatedBy: 'graph' });
      }
      // else: discard — graph says unreachable
    } else {
      // Import-chain heuristic fallback
      let chainValidated = false;

      if (fileContents) {
        for (const ref of crossFileRefs) {
          const normalizedFrom = normalizePath(ref.from, projectRoot);
          const reachable = followImportChain(normalizedFrom, fileContents, 2);
          const normalizedTo = normalizePath(ref.to, projectRoot);
          if (reachable.has(normalizedTo)) {
            chainValidated = true;
            break;
          }
        }
      }

      if (chainValidated) {
        // Import chain validates the claim — keep original severity
        validated.push({ ...finding, validatedBy: 'heuristic' });
      } else {
        // Unvalidated cross-file claim — downgrade severity, do NOT discard
        validated.push({
          ...finding,
          severity: DOWNGRADE_MAP[finding.severity],
          validatedBy: 'heuristic',
        });
      }
    }
  }

  return validated;
}
