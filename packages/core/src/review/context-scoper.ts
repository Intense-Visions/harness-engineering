import * as path from 'node:path';
import { readFileContent, fileExists, findFiles } from '../shared/fs-utils';
import { detectChangeType } from './change-type';
import type {
  ContextBundle,
  ContextFile,
  ContextScopeOptions,
  ReviewDomain,
  GraphAdapter,
} from './types';

const ALL_DOMAINS: ReviewDomain[] = ['compliance', 'bug', 'security', 'architecture'];

const SECURITY_PATTERNS =
  /auth|crypto|password|secret|token|session|cookie|hash|encrypt|decrypt|sql|shell|exec|eval/i;

/**
 * Compute the target context line count based on the 1:1 ratio rule.
 * - Small diffs (< 20 lines): 3:1 ratio
 * - Medium diffs (20-200 lines): 1:1 ratio
 * - Large diffs (> 200 lines): 1:1 ratio (floor)
 */
function computeContextBudget(diffLines: number): number {
  if (diffLines < 20) return diffLines * 3;
  return diffLines;
}

/**
 * Read a file and produce a ContextFile entry.
 * Returns null if the file cannot be read.
 */
async function readContextFile(
  projectRoot: string,
  filePath: string,
  reason: ContextFile['reason']
): Promise<ContextFile | null> {
  const absPath = path.isAbsolute(filePath) ? filePath : path.join(projectRoot, filePath);
  const result = await readFileContent(absPath);
  if (!result.ok) return null;

  const content = result.value;
  const lines = content.split('\n').length;
  // Normalize to project-relative path
  const relPath = path.isAbsolute(filePath) ? path.relative(projectRoot, filePath) : filePath;

  return { path: relPath, content, reason, lines };
}

/**
 * Extract import sources from TypeScript/JavaScript file content.
 * Returns the raw import specifiers (e.g., './helper', '@pkg/lib').
 */
function extractImportSources(content: string): string[] {
  const sources: string[] = [];
  // Match: import ... from 'source' and import 'source' and require('source')
  const importRegex =
    /(?:import\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\))/g;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(content)) !== null) {
    const source = match[1] ?? match[2];
    if (source) sources.push(source);
  }
  return sources;
}

/**
 * Resolve a relative import specifier to a likely file path.
 * Tries .ts, .tsx, /index.ts extensions.
 */
async function resolveImportPath(
  projectRoot: string,
  fromFile: string,
  importSource: string
): Promise<string | null> {
  // Only resolve relative imports
  if (!importSource.startsWith('.')) return null;

  const fromDir = path.dirname(path.join(projectRoot, fromFile));
  const basePath = path.resolve(fromDir, importSource);
  const relBase = path.relative(projectRoot, basePath);

  const candidates = [
    relBase + '.ts',
    relBase + '.tsx',
    relBase + '.mts',
    path.join(relBase, 'index.ts'),
  ];

  for (const candidate of candidates) {
    const absCandidate = path.join(projectRoot, candidate);
    if (await fileExists(absCandidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Find test files that correspond to a source file.
 * Uses glob patterns to find .test.ts and .spec.ts files.
 */
async function findTestFiles(projectRoot: string, sourceFile: string): Promise<string[]> {
  const baseName = path.basename(sourceFile, path.extname(sourceFile));
  const pattern = `**/${baseName}.{test,spec}.{ts,tsx,mts}`;
  const results = await findFiles(pattern, projectRoot);
  return results.map((f) => path.relative(projectRoot, f));
}

/**
 * Gather import-based context for a set of changed files (fallback heuristic).
 */
async function gatherImportContext(
  projectRoot: string,
  changedFiles: ContextFile[],
  budget: number
): Promise<ContextFile[]> {
  const contextFiles: ContextFile[] = [];
  let linesGathered = 0;
  const seen = new Set(changedFiles.map((f) => f.path));

  for (const cf of changedFiles) {
    if (linesGathered >= budget) break;

    const sources = extractImportSources(cf.content);
    for (const source of sources) {
      if (linesGathered >= budget) break;

      const resolved = await resolveImportPath(projectRoot, cf.path, source);
      if (resolved && !seen.has(resolved)) {
        seen.add(resolved);
        const contextFile = await readContextFile(projectRoot, resolved, 'import');
        if (contextFile) {
          contextFiles.push(contextFile);
          linesGathered += contextFile.lines;
        }
      }
    }
  }

  return contextFiles;
}

/**
 * Gather graph-based dependency context.
 */
async function gatherGraphDependencyContext(
  projectRoot: string,
  changedFilePaths: string[],
  graph: GraphAdapter,
  budget: number
): Promise<ContextFile[]> {
  const contextFiles: ContextFile[] = [];
  let linesGathered = 0;
  const seen = new Set(changedFilePaths);

  for (const filePath of changedFilePaths) {
    if (linesGathered >= budget) break;

    const deps = await graph.getDependencies(filePath);
    for (const dep of deps) {
      if (linesGathered >= budget) break;
      if (seen.has(dep)) continue;
      seen.add(dep);

      const contextFile = await readContextFile(projectRoot, dep, 'graph-dependency');
      if (contextFile) {
        contextFiles.push(contextFile);
        linesGathered += contextFile.lines;
      }
    }
  }

  return contextFiles;
}

/**
 * Gather test file context (graph or heuristic).
 */
async function gatherTestContext(
  projectRoot: string,
  changedFilePaths: string[],
  graph?: GraphAdapter
): Promise<ContextFile[]> {
  const testFiles: ContextFile[] = [];
  const seen = new Set<string>();

  if (graph) {
    for (const filePath of changedFilePaths) {
      const impact = await graph.getImpact(filePath);
      for (const testFile of impact.tests) {
        if (seen.has(testFile)) continue;
        seen.add(testFile);
        const cf = await readContextFile(projectRoot, testFile, 'test');
        if (cf) testFiles.push(cf);
      }
    }
  } else {
    for (const filePath of changedFilePaths) {
      const found = await findTestFiles(projectRoot, filePath);
      for (const testFile of found) {
        if (seen.has(testFile)) continue;
        seen.add(testFile);
        const cf = await readContextFile(projectRoot, testFile, 'test');
        if (cf) testFiles.push(cf);
      }
    }
  }

  return testFiles;
}

/**
 * Scope context for the compliance domain.
 * Convention files + changed files.
 */
async function scopeComplianceContext(
  projectRoot: string,
  _changedFiles: ContextFile[],
  options: ContextScopeOptions
): Promise<ContextFile[]> {
  const contextFiles: ContextFile[] = [];

  // Add convention files
  const conventionFiles = options.conventionFiles ?? ['CLAUDE.md', 'AGENTS.md'];
  for (const cf of conventionFiles) {
    const file = await readContextFile(projectRoot, cf, 'convention');
    if (file) contextFiles.push(file);
  }

  return contextFiles;
}

/**
 * Scope context for the bug detection domain.
 * Changed files + direct dependencies + test files.
 */
async function scopeBugContext(
  projectRoot: string,
  changedFiles: ContextFile[],
  budget: number,
  options: ContextScopeOptions
): Promise<ContextFile[]> {
  const contextFiles: ContextFile[] = [];
  const changedPaths = changedFiles.map((f) => f.path);

  // Dependencies (graph or fallback)
  if (options.graph) {
    const deps = await gatherGraphDependencyContext(
      projectRoot,
      changedPaths,
      options.graph,
      budget
    );
    contextFiles.push(...deps);
  } else {
    const deps = await gatherImportContext(projectRoot, changedFiles, budget);
    contextFiles.push(...deps);
  }

  // Test files
  const tests = await gatherTestContext(projectRoot, changedPaths, options.graph);
  contextFiles.push(...tests);

  return contextFiles;
}

/**
 * Scope context for the security domain.
 * Security-relevant paths + data flows.
 */
async function scopeSecurityContext(
  projectRoot: string,
  changedFiles: ContextFile[],
  budget: number,
  options: ContextScopeOptions
): Promise<ContextFile[]> {
  const contextFiles: ContextFile[] = [];
  const changedPaths = changedFiles.map((f) => f.path);

  if (options.graph) {
    // Use graph to find security-relevant dependencies
    const deps = await gatherGraphDependencyContext(
      projectRoot,
      changedPaths,
      options.graph,
      budget
    );
    // Filter to security-relevant files
    const securityDeps = deps.filter(
      (f) => SECURITY_PATTERNS.test(f.path) || SECURITY_PATTERNS.test(f.content)
    );
    contextFiles.push(...(securityDeps.length > 0 ? securityDeps : deps));
  } else {
    // Fallback: import-based + filter for security patterns
    const deps = await gatherImportContext(projectRoot, changedFiles, budget);
    contextFiles.push(...deps);
  }

  return contextFiles;
}

/**
 * Scope context for the architecture domain.
 * Layer boundaries + import graph.
 */
async function scopeArchitectureContext(
  projectRoot: string,
  changedFiles: ContextFile[],
  budget: number,
  options: ContextScopeOptions
): Promise<ContextFile[]> {
  const contextFiles: ContextFile[] = [];
  const changedPaths = changedFiles.map((f) => f.path);

  if (options.graph) {
    // Use graph for impact analysis
    for (const filePath of changedPaths) {
      const impact = await options.graph.getImpact(filePath);
      for (const codePath of impact.code) {
        const cf = await readContextFile(projectRoot, codePath, 'graph-impact');
        if (cf) contextFiles.push(cf);
      }
    }
  } else {
    // Fallback: import context
    const deps = await gatherImportContext(projectRoot, changedFiles, budget);
    contextFiles.push(...deps);
  }

  return contextFiles;
}

/**
 * Assemble scoped context bundles for each review domain.
 *
 * Returns one ContextBundle per domain. Each bundle contains:
 * - The changed files with their content
 * - Domain-specific context files (imports, tests, conventions, etc.)
 * - Recent commit history
 * - Change type and context ratio metadata
 */
export async function scopeContext(options: ContextScopeOptions): Promise<ContextBundle[]> {
  const { projectRoot, diff, commitMessage } = options;
  const changeType = detectChangeType(commitMessage, diff);
  const budget = computeContextBudget(diff.totalDiffLines);

  // Read all changed files
  const changedFiles: ContextFile[] = [];
  for (const filePath of diff.changedFiles) {
    const cf = await readContextFile(projectRoot, filePath, 'changed');
    if (cf) changedFiles.push(cf);
  }

  // Scope context per domain
  const scopers: Record<ReviewDomain, () => Promise<ContextFile[]>> = {
    compliance: () => scopeComplianceContext(projectRoot, changedFiles, options),
    bug: () => scopeBugContext(projectRoot, changedFiles, budget, options),
    security: () => scopeSecurityContext(projectRoot, changedFiles, budget, options),
    architecture: () => scopeArchitectureContext(projectRoot, changedFiles, budget, options),
  };

  const bundles: ContextBundle[] = [];

  for (const domain of ALL_DOMAINS) {
    const contextFiles = await scopers[domain]();
    const contextLines = contextFiles.reduce((sum, f) => sum + f.lines, 0);

    bundles.push({
      domain,
      changeType,
      changedFiles: [...changedFiles],
      contextFiles,
      commitHistory: [], // Populated by caller via git log
      diffLines: diff.totalDiffLines,
      contextLines,
    });
  }

  return bundles;
}
