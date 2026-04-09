import type { ContextBundle, ReviewFinding, ReviewAgentDescriptor } from '../types';
import { makeFindingId } from '../constants';

/**
 * Descriptor for the compliance review agent.
 */
export const COMPLIANCE_DESCRIPTOR: ReviewAgentDescriptor = {
  domain: 'compliance',
  tier: 'standard',
  displayName: 'Compliance',
  focusAreas: [
    'Spec alignment — implementation matches design doc',
    'API surface — new public interfaces are minimal and well-named',
    'Backward compatibility — no breaking changes without migration path',
    'Convention adherence — project conventions from CLAUDE.md/AGENTS.md followed',
    'Documentation completeness — all public interfaces documented',
  ],
};

/**
 * Convention rules extracted from convention file content.
 */
interface ConventionRule {
  text: string;
  source: string;
}

/**
 * Extract convention rules from context files marked as 'convention'.
 */
function extractConventionRules(bundle: ContextBundle): ConventionRule[] {
  const rules: ConventionRule[] = [];
  const conventionFiles = bundle.contextFiles.filter((f) => f.reason === 'convention');

  for (const file of conventionFiles) {
    // Extract bullet-pointed rules (lines starting with - or *)
    const lines = file.content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        rules.push({ text: trimmed.slice(2).trim(), source: file.path });
      }
    }
  }

  return rules;
}

const EXPORT_RE = /export\s+(?:async\s+)?(?:function|const|class|interface|type)\s+(\w+)/;

/**
 * Check whether the line immediately before index `i` (ignoring blank lines) closes a JSDoc.
 */
function hasPrecedingJsDoc(lines: string[], i: number): boolean {
  for (let j = i - 1; j >= 0; j--) {
    const prev = lines[j]!.trim();
    if (prev === '') continue;
    return prev.endsWith('*/');
  }
  return false;
}

/**
 * Scan a single file's lines for exported symbols that lack JSDoc.
 */
function scanFileForMissingJsDoc(
  filePath: string,
  lines: string[]
): Array<{ file: string; line: number; exportName: string }> {
  const missing: Array<{ file: string; line: number; exportName: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    const exportMatch = lines[i]!.match(EXPORT_RE);
    if (exportMatch && !hasPrecedingJsDoc(lines, i)) {
      missing.push({ file: filePath, line: i + 1, exportName: exportMatch[1]! });
    }
  }
  return missing;
}

/**
 * Check if a file's exported functions have JSDoc comments.
 * Returns file paths and line numbers of exports missing JSDoc.
 */
function findMissingJsDoc(
  bundle: ContextBundle
): Array<{ file: string; line: number; exportName: string }> {
  return bundle.changedFiles.flatMap((cf) =>
    scanFileForMissingJsDoc(cf.path, cf.content.split('\n'))
  );
}

/**
 * Run the compliance review agent.
 *
 * Analyzes the context bundle for convention adherence, spec alignment,
 * and documentation completeness. Produces ReviewFinding[] with domain 'compliance'.
 *
 * This function performs static/heuristic analysis. The actual LLM invocation
 * for deeper compliance review happens at the orchestration layer (MCP/CLI).
 */
/**
 * Check for missing JSDoc on exports when conventions require it.
 */
function checkMissingJsDoc(bundle: ContextBundle, rules: ConventionRule[]): ReviewFinding[] {
  const jsDocRule = rules.find((r) => r.text.toLowerCase().includes('jsdoc'));
  if (!jsDocRule) return [];

  const missingDocs = findMissingJsDoc(bundle);
  return missingDocs.map((m) => ({
    id: makeFindingId('compliance', m.file, m.line, `Missing JSDoc ${m.exportName}`),
    file: m.file,
    lineRange: [m.line, m.line] as [number, number],
    domain: 'compliance' as const,
    severity: 'important' as const,
    title: `Missing JSDoc on exported \`${m.exportName}\``,
    rationale: `Convention requires all exports to have JSDoc comments (from ${jsDocRule.source}).`,
    suggestion: `Add a JSDoc comment above the export of \`${m.exportName}\`.`,
    evidence: [`changeType: ${bundle.changeType}`, `Convention rule: "${jsDocRule.text}"`],
    validatedBy: 'heuristic' as const,
  }));
}

/**
 * Check for missing spec context on feature changes.
 */
function checkFeatureSpec(bundle: ContextBundle): ReviewFinding[] {
  const hasSpecContext = bundle.contextFiles.some(
    (f) => f.reason === 'spec' || f.reason === 'convention'
  );
  if (hasSpecContext || bundle.changedFiles.length === 0) return [];

  const firstFile = bundle.changedFiles[0]!;
  return [
    {
      id: makeFindingId('compliance', firstFile.path, 1, 'No spec for feature'),
      file: firstFile.path,
      lineRange: [1, 1],
      domain: 'compliance',
      severity: 'suggestion',
      title: 'No spec/design doc found for feature change',
      rationale:
        'Feature changes should reference a spec or design doc to verify alignment. No spec context was included in the review bundle.',
      evidence: [`changeType: feature`, `contextFiles count: ${bundle.contextFiles.length}`],
      validatedBy: 'heuristic',
    },
  ];
}

/**
 * Check for missing commit history on bugfix changes.
 */
function checkBugfixHistory(bundle: ContextBundle): ReviewFinding[] {
  if (bundle.commitHistory.length > 0 || bundle.changedFiles.length === 0) return [];

  const firstFile = bundle.changedFiles[0]!;
  return [
    {
      id: makeFindingId('compliance', firstFile.path, 1, 'Bugfix no history'),
      file: firstFile.path,
      lineRange: [1, 1],
      domain: 'compliance',
      severity: 'suggestion',
      title: 'Bugfix without commit history context',
      rationale:
        'Bugfix changes benefit from commit history to verify the root cause is addressed, not just the symptom. No commit history was provided.',
      evidence: [`changeType: bugfix`, `commitHistory entries: ${bundle.commitHistory.length}`],
      validatedBy: 'heuristic',
    },
  ];
}

/**
 * Check change-type-specific compliance issues.
 */
function checkChangeTypeSpecific(bundle: ContextBundle): ReviewFinding[] {
  switch (bundle.changeType) {
    case 'feature':
      return checkFeatureSpec(bundle);
    case 'bugfix':
      return checkBugfixHistory(bundle);
    default:
      return [];
  }
}

/**
 * Check a single changed file for try/catch usage without Result type.
 */
function checkFileResultTypeConvention(
  cf: ContextBundle['changedFiles'][number],
  bundle: ContextBundle,
  rule: ConventionRule
): ReviewFinding | null {
  const hasTryCatch = cf.content.includes('try {') || cf.content.includes('try{');
  const usesResult =
    cf.content.includes('Result<') ||
    cf.content.includes('Result >') ||
    cf.content.includes(': Result');

  if (!hasTryCatch || usesResult) return null;

  return {
    id: makeFindingId('compliance', cf.path, 1, 'try-catch not Result'),
    file: cf.path,
    lineRange: [1, cf.lines],
    domain: 'compliance',
    severity: 'suggestion',
    title: 'Fallible operation uses try/catch instead of Result type',
    rationale: `Convention requires using Result type for fallible operations (from ${rule.source}).`,
    suggestion: 'Refactor error handling to use the Result type pattern.',
    evidence: [`changeType: ${bundle.changeType}`, `Convention rule: "${rule.text}"`],
    validatedBy: 'heuristic',
  };
}

/**
 * Check for try/catch usage when conventions require Result type.
 */
function checkResultTypeConvention(
  bundle: ContextBundle,
  rules: ConventionRule[]
): ReviewFinding[] {
  const resultTypeRule = rules.find((r) => r.text.toLowerCase().includes('result type'));
  if (!resultTypeRule) return [];

  return bundle.changedFiles
    .map((cf) => checkFileResultTypeConvention(cf, bundle, resultTypeRule))
    .filter((f): f is ReviewFinding => f !== null);
}

export function runComplianceAgent(bundle: ContextBundle): ReviewFinding[] {
  const rules = extractConventionRules(bundle);

  return [
    ...checkMissingJsDoc(bundle, rules),
    ...checkChangeTypeSpecific(bundle),
    ...checkResultTypeConvention(bundle, rules),
  ];
}
