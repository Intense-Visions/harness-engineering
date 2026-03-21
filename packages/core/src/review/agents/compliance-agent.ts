import type { ContextBundle, ReviewFinding, ReviewAgentDescriptor } from '../types';

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

/**
 * Check if a file's exported functions have JSDoc comments.
 * Returns file paths and line numbers of exports missing JSDoc.
 */
function findMissingJsDoc(
  bundle: ContextBundle
): Array<{ file: string; line: number; exportName: string }> {
  const missing: Array<{ file: string; line: number; exportName: string }> = [];

  for (const cf of bundle.changedFiles) {
    const lines = cf.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      // Look for export declarations
      const exportMatch = line.match(
        /export\s+(?:async\s+)?(?:function|const|class|interface|type)\s+(\w+)/
      );
      if (exportMatch) {
        // Check if previous non-empty line is end of JSDoc comment (*/)
        let hasJsDoc = false;
        for (let j = i - 1; j >= 0; j--) {
          const prev = lines[j]!.trim();
          if (prev === '') continue;
          if (prev.endsWith('*/')) {
            hasJsDoc = true;
          }
          break;
        }
        if (!hasJsDoc) {
          missing.push({
            file: cf.path,
            line: i + 1,
            exportName: exportMatch[1]!,
          });
        }
      }
    }
  }

  return missing;
}

let findingCounter = 0;

function makeFindingId(domain: string, file: string, line: number): string {
  findingCounter++;
  return `${domain}-${file.replace(/[^a-zA-Z0-9]/g, '-')}-${line}-${findingCounter}`;
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
export function runComplianceAgent(bundle: ContextBundle): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const rules = extractConventionRules(bundle);

  // Check 1: Missing JSDoc on exports (if conventions mention JSDoc)
  const jsDocRuleExists = rules.some((r) => r.text.toLowerCase().includes('jsdoc'));
  if (jsDocRuleExists) {
    const missingDocs = findMissingJsDoc(bundle);
    for (const m of missingDocs) {
      findings.push({
        id: makeFindingId('compliance', m.file, m.line),
        file: m.file,
        lineRange: [m.line, m.line],
        domain: 'compliance',
        severity: 'important',
        title: `Missing JSDoc on exported \`${m.exportName}\``,
        rationale: `Convention requires all exports to have JSDoc comments (from ${rules.find((r) => r.text.toLowerCase().includes('jsdoc'))?.source ?? 'conventions'}).`,
        suggestion: `Add a JSDoc comment above the export of \`${m.exportName}\`.`,
        evidence: [
          `changeType: ${bundle.changeType}`,
          `Convention rule: "${rules.find((r) => r.text.toLowerCase().includes('jsdoc'))?.text ?? ''}"`,
        ],
        validatedBy: 'heuristic',
      });
    }
  }

  // Check 2: Change-type-specific checks
  switch (bundle.changeType) {
    case 'feature': {
      // Flag if no spec/design doc context is present for feature changes
      const hasSpecContext = bundle.contextFiles.some(
        (f) => f.reason === 'spec' || f.reason === 'convention'
      );
      if (!hasSpecContext && bundle.changedFiles.length > 0) {
        const firstFile = bundle.changedFiles[0]!;
        findings.push({
          id: makeFindingId('compliance', firstFile.path, 1),
          file: firstFile.path,
          lineRange: [1, 1],
          domain: 'compliance',
          severity: 'suggestion',
          title: 'No spec/design doc found for feature change',
          rationale:
            'Feature changes should reference a spec or design doc to verify alignment. No spec context was included in the review bundle.',
          evidence: [`changeType: feature`, `contextFiles count: ${bundle.contextFiles.length}`],
          validatedBy: 'heuristic',
        });
      }
      break;
    }
    case 'bugfix': {
      // Flag if commit history is empty (cannot verify root cause context)
      if (bundle.commitHistory.length === 0 && bundle.changedFiles.length > 0) {
        const firstFile = bundle.changedFiles[0]!;
        findings.push({
          id: makeFindingId('compliance', firstFile.path, 1),
          file: firstFile.path,
          lineRange: [1, 1],
          domain: 'compliance',
          severity: 'suggestion',
          title: 'Bugfix without commit history context',
          rationale:
            'Bugfix changes benefit from commit history to verify the root cause is addressed, not just the symptom. No commit history was provided.',
          evidence: [`changeType: bugfix`, `commitHistory entries: ${bundle.commitHistory.length}`],
          validatedBy: 'heuristic',
        });
      }
      break;
    }
    case 'refactor': {
      // No specific heuristic checks for refactor at this layer
      break;
    }
    case 'docs': {
      // No specific heuristic checks for docs at this layer
      break;
    }
  }

  // Check 3: Convention rule violations (keyword matching heuristic)
  const resultTypeRule = rules.find((r) => r.text.toLowerCase().includes('result type'));
  if (resultTypeRule) {
    for (const cf of bundle.changedFiles) {
      // Check if file has functions that could fail but don't use Result type
      const hasTryCatch = cf.content.includes('try {') || cf.content.includes('try{');
      const usesResult =
        cf.content.includes('Result<') ||
        cf.content.includes('Result >') ||
        cf.content.includes(': Result');
      if (hasTryCatch && !usesResult) {
        findings.push({
          id: makeFindingId('compliance', cf.path, 1),
          file: cf.path,
          lineRange: [1, cf.lines],
          domain: 'compliance',
          severity: 'suggestion',
          title: 'Fallible operation uses try/catch instead of Result type',
          rationale: `Convention requires using Result type for fallible operations (from ${resultTypeRule.source}).`,
          suggestion: 'Refactor error handling to use the Result type pattern.',
          evidence: [
            `changeType: ${bundle.changeType}`,
            `Convention rule: "${resultTypeRule.text}"`,
          ],
          validatedBy: 'heuristic',
        });
      }
    }
  }

  return findings;
}
