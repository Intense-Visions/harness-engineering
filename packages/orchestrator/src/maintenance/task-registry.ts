import type { TaskDefinition } from './types';

/**
 * All 21 built-in maintenance task definitions with default schedules.
 *
 * Tasks are grouped by type:
 * - mechanical-ai (7): Run check first, dispatch AI only if fixable issues found
 * - pure-ai (4): Always dispatch AI agent on schedule
 * - report-only (7): Run command, record metrics, no PR
 * - housekeeping (3): Mechanical command, no AI, no PR
 */
export const BUILT_IN_TASKS: readonly TaskDefinition[] = [
  // --- Mechanical-AI ---
  {
    id: 'arch-violations',
    type: 'mechanical-ai',
    description: 'Detect and fix architecture violations',
    schedule: '0 2 * * *',
    branch: 'harness-maint/arch-fixes',
    checkCommand: ['check-arch'],
    fixSkill: 'harness-arch-fix',
  },
  {
    id: 'dep-violations',
    type: 'mechanical-ai',
    description: 'Detect and fix dependency violations',
    schedule: '0 2 * * *',
    branch: 'harness-maint/dep-fixes',
    checkCommand: ['check-deps'],
    fixSkill: 'harness-dep-fix',
  },
  {
    id: 'doc-drift',
    type: 'mechanical-ai',
    description: 'Detect and fix documentation drift',
    schedule: '0 3 * * *',
    branch: 'harness-maint/doc-fixes',
    checkCommand: ['check-docs'],
    fixSkill: 'harness-doc-fix',
  },
  {
    id: 'security-findings',
    type: 'mechanical-ai',
    description: 'Detect and fix security findings',
    schedule: '0 1 * * *',
    branch: 'harness-maint/security-fixes',
    checkCommand: ['check-security'],
    fixSkill: 'harness-security-fix',
  },
  {
    id: 'entropy',
    type: 'mechanical-ai',
    description: 'Detect and fix codebase entropy',
    schedule: '0 3 * * *',
    branch: 'harness-maint/entropy-fixes',
    checkCommand: ['cleanup'],
    fixSkill: 'harness-entropy-fix',
  },
  {
    id: 'traceability',
    type: 'mechanical-ai',
    description: 'Detect and fix traceability gaps',
    schedule: '0 6 * * 1',
    branch: 'harness-maint/traceability-fixes',
    checkCommand: ['traceability'],
    fixSkill: 'harness-traceability-fix',
  },
  {
    id: 'cross-check',
    type: 'mechanical-ai',
    description: 'Detect and fix cross-check violations',
    schedule: '0 6 * * 1',
    branch: 'harness-maint/cross-check-fixes',
    checkCommand: ['validate-cross-check'],
    fixSkill: 'harness-cross-check-fix',
  },

  // --- Pure-AI ---
  {
    id: 'dead-code',
    type: 'pure-ai',
    description: 'Find and remove dead code',
    schedule: '0 2 * * 0',
    branch: 'harness-maint/dead-code',
    fixSkill: 'harness-codebase-cleanup',
  },
  {
    id: 'dependency-health',
    type: 'pure-ai',
    description: 'Assess and improve dependency health',
    schedule: '0 3 * * 0',
    branch: 'harness-maint/dep-health',
    fixSkill: 'harness-dependency-health',
  },
  {
    id: 'hotspot-remediation',
    type: 'pure-ai',
    description: 'Identify and remediate code hotspots',
    schedule: '0 4 * * 0',
    branch: 'harness-maint/hotspot-fixes',
    fixSkill: 'harness-hotspot-detector',
  },
  {
    id: 'security-review',
    type: 'pure-ai',
    description: 'Deep security review and fixes',
    schedule: '0 1 * * 0',
    branch: 'harness-maint/security-deep',
    fixSkill: 'harness-security-review',
  },

  // --- Report-only ---
  {
    id: 'perf-check',
    type: 'report-only',
    description: 'Run performance checks and record metrics',
    schedule: '0 6 * * 1',
    branch: null,
    checkCommand: ['check-perf'],
  },
  {
    id: 'decay-trends',
    type: 'report-only',
    description: 'Compute architecture decay trend metrics',
    schedule: '0 7 * * 1',
    branch: null,
    checkCommand: ['predict'],
  },
  {
    id: 'project-health',
    type: 'report-only',
    description: 'Assess overall project health',
    schedule: '0 6 * * *',
    branch: null,
    checkCommand: ['assess_project'],
  },
  {
    id: 'stale-constraints',
    type: 'report-only',
    description: 'Detect stale architectural constraints',
    schedule: '0 2 1 * *',
    branch: null,
    checkCommand: ['detect_stale_constraints'],
  },
  {
    id: 'graph-refresh',
    type: 'report-only',
    description: 'Refresh the knowledge graph',
    schedule: '0 1 * * *',
    branch: null,
    checkCommand: ['graph', 'scan'],
  },
  {
    id: 'product-pulse',
    type: 'report-only',
    description: 'Generate time-windowed pulse report (usage, errors, latency, followups)',
    schedule: '0 8 * * *',
    branch: null,
    checkCommand: ['pulse', 'run', '--non-interactive'],
  },
  {
    id: 'compound-candidates',
    type: 'report-only',
    description: 'Scan recent fixes for undocumented learnings; surface candidates',
    schedule: '0 9 * * 1',
    branch: null,
    checkCommand: ['compound', 'scan-candidates', '--non-interactive'],
  },

  // --- Housekeeping ---
  {
    id: 'session-cleanup',
    type: 'housekeeping',
    description: 'Clean up stale orchestrator sessions',
    schedule: '0 0 * * *',
    branch: null,
    checkCommand: ['cleanup-sessions'],
  },
  {
    id: 'perf-baselines',
    type: 'housekeeping',
    description: 'Update performance baselines',
    schedule: '0 7 * * *',
    branch: null,
    checkCommand: ['perf', 'baselines', 'update'],
  },
  {
    id: 'main-sync',
    type: 'housekeeping',
    description: 'Fast-forward local default branch from origin',
    schedule: '*/15 * * * *',
    branch: null,
    checkCommand: ['harness', 'sync-main', '--json'],
  },
] as const;
