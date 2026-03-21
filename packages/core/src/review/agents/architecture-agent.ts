import type { ContextBundle, ReviewFinding, ReviewAgentDescriptor } from '../types';

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

function makeFindingId(file: string, line: number, title: string): string {
  const hash = title.slice(0, 20).replace(/[^a-zA-Z0-9]/g, '');
  return `arch-${file.replace(/[^a-zA-Z0-9]/g, '-')}-${line}-${hash}`;
}

/**
 * Detect layer violations from check-deps output in context.
 */
function detectLayerViolations(bundle: ContextBundle): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const checkDepsFile = bundle.contextFiles.find((f) => f.path === 'harness-check-deps-output');
  if (!checkDepsFile) return findings;

  const lines = checkDepsFile.content.split('\n');
  for (const line of lines) {
    if (line.toLowerCase().includes('violation') || line.toLowerCase().includes('layer')) {
      // Try to extract file reference from the violation message
      const fileMatch = line.match(/(?:in\s+)?(\S+\.(?:ts|tsx|js|jsx))(?::(\d+))?/);
      const file = fileMatch?.[1] ?? bundle.changedFiles[0]?.path ?? 'unknown';
      const lineNum = fileMatch?.[2] ? parseInt(fileMatch[2], 10) : 1;

      findings.push({
        id: makeFindingId(file, lineNum, 'layer violation'),
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
      });
    }
  }
  return findings;
}

/**
 * Detect files that are too large (Single Responsibility concern).
 */
function detectLargeFiles(bundle: ContextBundle): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  for (const cf of bundle.changedFiles) {
    if (cf.lines > LARGE_FILE_THRESHOLD) {
      findings.push({
        id: makeFindingId(cf.path, 1, 'large file SRP'),
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
 * Detect potential circular imports by checking if context files import from changed files.
 */
function detectCircularImports(bundle: ContextBundle): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const changedPaths = new Set(bundle.changedFiles.map((f) => f.path));

  for (const cf of bundle.changedFiles) {
    // Extract what this file imports
    const importRegex = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;
    const imports = new Set<string>();
    while ((match = importRegex.exec(cf.content)) !== null) {
      const source = match[1]!;
      if (source.startsWith('.')) {
        // Normalize to approximate path
        imports.add(source.replace(/^\.\//, '').replace(/^\.\.\//, ''));
      }
    }

    // Check if any context file imports back to a changed file
    for (const ctxFile of bundle.contextFiles) {
      if (ctxFile.reason !== 'import' && ctxFile.reason !== 'graph-dependency') continue;

      const ctxImportRegex = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
      let ctxMatch: RegExpExecArray | null;
      while ((ctxMatch = ctxImportRegex.exec(ctxFile.content)) !== null) {
        const ctxSource = ctxMatch[1]!;
        if (ctxSource.startsWith('.')) {
          // Check if this import points back to a changed file
          for (const changedPath of changedPaths) {
            const baseName = changedPath.replace(/.*\//, '').replace(/\.(ts|tsx|js|jsx)$/, '');
            if (
              ctxSource.includes(baseName) &&
              imports.has(ctxFile.path.replace(/.*\//, '').replace(/\.(ts|tsx|js|jsx)$/, ''))
            ) {
              findings.push({
                id: makeFindingId(cf.path, 1, `circular ${ctxFile.path}`),
                file: cf.path,
                lineRange: [1, 1],
                domain: 'architecture',
                severity: 'important',
                title: `Potential circular import between ${cf.path} and ${ctxFile.path}`,
                rationale:
                  'Circular imports can cause runtime issues (undefined values at import time) and indicate tightly coupled modules that should be refactored.',
                suggestion:
                  'Extract shared types/interfaces into a separate module that both files can import from.',
                evidence: [`${cf.path} imports from a module that also imports from ${cf.path}`],
                validatedBy: 'heuristic',
              });
            }
          }
        }
      }
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
