import type { CleanupFinding, HotspotContext, SafetyLevel } from '../types';

interface FindingInput {
  concern: 'dead-code' | 'architecture';
  file: string;
  line?: number;
  type: string;
  description: string;
  isPublicApi?: boolean;
  hasAlternative?: boolean;
}

const ALWAYS_UNSAFE_TYPES = new Set([
  'upward-dependency',
  'skip-layer-dependency',
  'circular-dependency',
  'dead-internal',
]);

let idCounter = 0;

/**
 * Classify a raw finding into a CleanupFinding with safety level
 */
export function classifyFinding(input: FindingInput): CleanupFinding {
  idCounter++;
  const id = `${input.concern === 'dead-code' ? 'dc' : 'arch'}-${idCounter}`;

  let safety: SafetyLevel;
  let safetyReason: string;
  let fixAction: string | undefined;
  let suggestion: string;

  if (ALWAYS_UNSAFE_TYPES.has(input.type)) {
    safety = 'unsafe';
    safetyReason = `${input.type} requires human judgment`;
    suggestion = 'Review and refactor manually';
  } else if (input.concern === 'dead-code') {
    if (input.isPublicApi) {
      safety = 'unsafe';
      safetyReason = 'Public API export may have external consumers';
      suggestion = 'Deprecate before removing';
    } else if (
      input.type === 'dead-export' ||
      input.type === 'unused-import' ||
      input.type === 'commented-code' ||
      input.type === 'dead-file'
    ) {
      safety = 'safe';
      safetyReason = 'zero importers, non-public';
      fixAction =
        input.type === 'dead-export'
          ? 'Remove export keyword'
          : input.type === 'dead-file'
            ? 'Delete file'
            : input.type === 'commented-code'
              ? 'Delete commented block'
              : 'Remove import';
      suggestion = fixAction;
    } else if (input.type === 'orphaned-dep') {
      safety = 'probably-safe';
      safetyReason = 'No imports found, but needs install+test verification';
      fixAction = 'Remove from package.json';
      suggestion = fixAction;
    } else {
      safety = 'unsafe';
      safetyReason = 'Unknown dead code type';
      suggestion = 'Manual review required';
    }
  } else {
    // architecture
    if (input.type === 'import-ordering') {
      safety = 'safe';
      safetyReason = 'Mechanical reorder, no semantic change';
      fixAction = 'Reorder imports';
      suggestion = fixAction;
    } else if (input.type === 'forbidden-import' && input.hasAlternative) {
      safety = 'probably-safe';
      safetyReason = 'Alternative configured, needs typecheck+test';
      fixAction = 'Replace with configured alternative';
      suggestion = fixAction;
    } else {
      safety = 'unsafe';
      safetyReason = `${input.type} requires structural changes`;
      suggestion = 'Restructure code to fix violation';
    }
  }

  return {
    id,
    concern: input.concern,
    file: input.file,
    line: input.line,
    type: input.type,
    description: input.description,
    safety,
    safetyReason,
    hotspotDowngraded: false,
    fixAction,
    suggestion,
  };
}

/**
 * Downgrade safety for findings in high-churn files
 */
export function applyHotspotDowngrade(
  finding: CleanupFinding,
  hotspot: HotspotContext
): CleanupFinding {
  if (finding.safety !== 'safe') return finding;

  const churn = hotspot.churnMap.get(finding.file) ?? 0;
  if (churn >= hotspot.topPercentileThreshold) {
    return {
      ...finding,
      safety: 'probably-safe',
      safetyReason: `${finding.safetyReason}; downgraded due to high churn (${churn} commits)`,
      hotspotDowngraded: true,
    };
  }

  return finding;
}

/**
 * Deduplicate cross-concern findings (e.g., dead import + forbidden import on same line)
 */
export function deduplicateFindings(findings: CleanupFinding[]): CleanupFinding[] {
  const byFileAndLine = new Map<string, CleanupFinding[]>();

  for (const f of findings) {
    const key = `${f.file}:${f.line ?? 'none'}`;
    const group = byFileAndLine.get(key) ?? [];
    group.push(f);
    byFileAndLine.set(key, group);
  }

  const result: CleanupFinding[] = [];

  for (const group of byFileAndLine.values()) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }

    // Check for dead-code + architecture overlap
    const deadCode = group.find((f) => f.concern === 'dead-code');
    const arch = group.find((f) => f.concern === 'architecture');

    if (deadCode && arch) {
      // Merge: dead code fix resolves both
      result.push({
        ...deadCode,
        description: `${deadCode.description} (also violates architecture: ${arch.type})`,
        suggestion: deadCode.fixAction
          ? `${deadCode.fixAction} (resolves both dead code and architecture violation)`
          : deadCode.suggestion,
      });
    } else {
      result.push(...group);
    }
  }

  return result;
}
