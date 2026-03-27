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

interface SafetyClassification {
  safety: SafetyLevel;
  safetyReason: string;
  fixAction?: string;
  suggestion: string;
}

/** Fix actions for safe dead-code types. */
const DEAD_CODE_FIX_ACTIONS: Record<string, string> = {
  'dead-export': 'Remove export keyword',
  'dead-file': 'Delete file',
  'commented-code': 'Delete commented block',
  'unused-import': 'Remove import',
};

/**
 * Classify dead-code findings by type and public API status.
 */
function classifyDeadCode(input: FindingInput): SafetyClassification {
  if (input.isPublicApi) {
    return {
      safety: 'unsafe',
      safetyReason: 'Public API export may have external consumers',
      suggestion: 'Deprecate before removing',
    };
  }

  const fixAction = DEAD_CODE_FIX_ACTIONS[input.type];
  if (fixAction) {
    return {
      safety: 'safe',
      safetyReason: 'zero importers, non-public',
      fixAction,
      suggestion: fixAction,
    };
  }

  if (input.type === 'orphaned-dep') {
    return {
      safety: 'probably-safe',
      safetyReason: 'No imports found, but needs install+test verification',
      fixAction: 'Remove from package.json',
      suggestion: 'Remove from package.json',
    };
  }

  return {
    safety: 'unsafe',
    safetyReason: 'Unknown dead code type',
    suggestion: 'Manual review required',
  };
}

/**
 * Classify architecture findings by type.
 */
function classifyArchitecture(input: FindingInput): SafetyClassification {
  if (input.type === 'import-ordering') {
    return {
      safety: 'safe',
      safetyReason: 'Mechanical reorder, no semantic change',
      fixAction: 'Reorder imports',
      suggestion: 'Reorder imports',
    };
  }
  if (input.type === 'forbidden-import' && input.hasAlternative) {
    return {
      safety: 'probably-safe',
      safetyReason: 'Alternative configured, needs typecheck+test',
      fixAction: 'Replace with configured alternative',
      suggestion: 'Replace with configured alternative',
    };
  }
  return {
    safety: 'unsafe',
    safetyReason: `${input.type} requires structural changes`,
    suggestion: 'Restructure code to fix violation',
  };
}

/**
 * Classify a raw finding into a CleanupFinding with safety level
 */
export function classifyFinding(input: FindingInput): CleanupFinding {
  idCounter++;
  const id = `${input.concern === 'dead-code' ? 'dc' : 'arch'}-${idCounter}`;

  let classification: SafetyClassification;
  if (ALWAYS_UNSAFE_TYPES.has(input.type)) {
    classification = {
      safety: 'unsafe',
      safetyReason: `${input.type} requires human judgment`,
      suggestion: 'Review and refactor manually',
    };
  } else if (input.concern === 'dead-code') {
    classification = classifyDeadCode(input);
  } else {
    classification = classifyArchitecture(input);
  }

  return {
    id,
    concern: input.concern,
    file: input.file,
    ...(input.line !== undefined ? { line: input.line } : {}),
    type: input.type,
    description: input.description,
    safety: classification.safety,
    safetyReason: classification.safetyReason,
    hotspotDowngraded: false,
    ...(classification.fixAction !== undefined ? { fixAction: classification.fixAction } : {}),
    suggestion: classification.suggestion,
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
export function deduplicateCleanupFindings(findings: CleanupFinding[]): CleanupFinding[] {
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
      result.push(group[0]!);
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
