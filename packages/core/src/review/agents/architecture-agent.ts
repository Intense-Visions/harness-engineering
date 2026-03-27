import type { ContextBundle, ReviewFinding, ReviewAgentDescriptor } from '../types';
import { makeFindingId } from '../constants';

export const ARCHITECTURE_DESCRIPTOR: ReviewAgentDescriptor = {
  domain: 'architecture',
  tier: 'standard',
  displayName: 'Architecture',
  focusAreas: [
    'Layer compliance — imports flow in the correct direction per architectural layers',
    'Dependency direction — modules depend on abstractions, not concretions',
    'Single Responsibility — each module has one reason to change',
    'Pattern consistency — code follows established codebase patterns',
    'Separation of concerns — business logic separated from infrastructure',
    'DRY violations — duplicated logic that should be extracted (excluding intentional duplication)',
  ],
};

const LARGE_FILE_THRESHOLD = 300;

/**
 * Check if a line from check-deps output indicates a violation.
 */
function isViolationLine(line: string): boolean {
  const lower = line.toLowerCase();
  return lower.includes('violation') || lower.includes('layer');
}

/**
 * Create a finding from a single violation line.
 */
function createLayerViolationFinding(line: string, fallbackPath: string): ReviewFinding {
  const fileMatch = line.match(/(?:in\s+)?(\S+\.(?:ts|tsx|js|jsx))(?::(\d+))?/);
  const file = fileMatch?.[1] ?? fallbackPath;
  const lineNum = fileMatch?.[2] ? parseInt(fileMatch[2], 10) : 1;

  return {
    id: makeFindingId('arch', file, lineNum, 'layer violation'),
    file,
    lineRange: [lineNum, lineNum],
    domain: 'architecture',
    severity: 'critical',
    title: 'Layer boundary violation detected by check-deps',
    rationale: `Architectural layer violation: ${line.trim()}. Imports must flow in the correct direction per the project's layer definitions.`,
    suggestion:
      'Route the dependency through the correct intermediate layer (e.g., routes -> services -> db, not routes -> db).',
    evidence: [line.trim()],
    validatedBy: 'heuristic',
  };
}

/**
 * Detect layer violations from check-deps output in context.
 */
function detectLayerViolations(bundle: ContextBundle): ReviewFinding[] {
  const checkDepsFile = bundle.contextFiles.find((f) => f.path === 'harness-check-deps-output');
  if (!checkDepsFile) return [];

  const fallbackPath = bundle.changedFiles[0]?.path ?? 'unknown';
  return checkDepsFile.content
    .split('\n')
    .filter(isViolationLine)
    .map((line) => createLayerViolationFinding(line, fallbackPath));
}

/**
 * Detect files that are too large (Single Responsibility concern).
 */
function detectLargeFiles(bundle: ContextBundle): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  for (const cf of bundle.changedFiles) {
    if (cf.lines > LARGE_FILE_THRESHOLD) {
      findings.push({
        id: makeFindingId('arch', cf.path, 1, 'large file SRP'),
        file: cf.path,
        lineRange: [1, cf.lines],
        domain: 'architecture',
        severity: 'suggestion',
        title: `Large file (${cf.lines} lines) may violate Single Responsibility`,
        rationale: `Files over ${LARGE_FILE_THRESHOLD} lines often contain multiple responsibilities. Consider splitting into focused modules.`,
        suggestion: 'Identify distinct responsibilities and extract them into separate modules.',
        evidence: [`File has ${cf.lines} lines (threshold: ${LARGE_FILE_THRESHOLD})`],
        validatedBy: 'heuristic',
      });
    }
  }
  return findings;
}

/**
 * Extract relative import sources from file content, normalized to base names.
 */
function extractRelativeImports(content: string): Set<string> {
  const importRegex = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  const imports = new Set<string>();
  while ((match = importRegex.exec(content)) !== null) {
    const source = match[1]!;
    if (source.startsWith('.')) {
      imports.add(source.replace(/^\.\//, '').replace(/^\.\.\//, ''));
    }
  }
  return imports;
}

/**
 * Extract the base name of a file path (without directory and extension).
 */
function fileBaseName(filePath: string): string {
  return filePath.replace(/.*\//, '').replace(/\.(ts|tsx|js|jsx)$/, '');
}

/**
 * Check if a context file creates a circular import back to any changed file.
 */
function findCircularImportInCtxFile(
  ctxFile: { path: string; content: string },
  changedFilePath: string,
  changedPaths: Set<string>,
  fileImports: Set<string>
): ReviewFinding | null {
  const ctxImportRegex = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
  let ctxMatch: RegExpExecArray | null;
  while ((ctxMatch = ctxImportRegex.exec(ctxFile.content)) !== null) {
    const ctxSource = ctxMatch[1]!;
    if (!ctxSource.startsWith('.')) continue;

    for (const changedPath of changedPaths) {
      const baseName = fileBaseName(changedPath);
      const ctxBaseName = fileBaseName(ctxFile.path);
      if (ctxSource.includes(baseName) && fileImports.has(ctxBaseName)) {
        return {
          id: makeFindingId('arch', changedFilePath, 1, `circular ${ctxFile.path}`),
          file: changedFilePath,
          lineRange: [1, 1],
          domain: 'architecture',
          severity: 'important',
          title: `Potential circular import between ${changedFilePath} and ${ctxFile.path}`,
          rationale:
            'Circular imports can cause runtime issues (undefined values at import time) and indicate tightly coupled modules that should be refactored.',
          suggestion:
            'Extract shared types/interfaces into a separate module that both files can import from.',
          evidence: [
            `${changedFilePath} imports from a module that also imports from ${changedFilePath}`,
          ],
          validatedBy: 'heuristic',
        };
      }
    }
  }
  return null;
}

/**
 * Detect potential circular imports by checking if context files import from changed files.
 */
function detectCircularImports(bundle: ContextBundle): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const changedPaths = new Set(bundle.changedFiles.map((f) => f.path));
  const relevantCtxFiles = bundle.contextFiles.filter(
    (f) => f.reason === 'import' || f.reason === 'graph-dependency'
  );

  for (const cf of bundle.changedFiles) {
    const imports = extractRelativeImports(cf.content);

    for (const ctxFile of relevantCtxFiles) {
      const finding = findCircularImportInCtxFile(ctxFile, cf.path, changedPaths, imports);
      if (finding) findings.push(finding);
    }
  }

  return findings;
}

/**
 * Run the architecture review agent.
 *
 * Analyzes the context bundle for architectural violations, dependency direction,
 * and design pattern compliance. Produces ReviewFinding[] with domain 'architecture'.
 */
export function runArchitectureAgent(bundle: ContextBundle): ReviewFinding[] {
  const findings: ReviewFinding[] = [];

  findings.push(...detectLayerViolations(bundle));
  findings.push(...detectLargeFiles(bundle));
  findings.push(...detectCircularImports(bundle));

  return findings;
}
