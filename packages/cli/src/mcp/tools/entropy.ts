import { Ok } from '@harness-engineering/core';
import type {
  DriftConfig,
  PatternConfig,
  DuplicationConfig,
  EntropyReport,
} from '@harness-engineering/core';
import { skipDirGlobs } from '@harness-engineering/graph';
import { resultToMcpResponse } from '../utils/result-adapter.js';
import { sanitizePath } from '../utils/sanitize-path.js';
import { findConfigFile, loadConfig } from '../../config/loader.js';
import type { HarnessConfig } from '../../config/schema.js';
import { loadAnalysisExclude } from '../../config/analysis-schema.js';
import {
  resolveDuplicationRequest,
  describeDuplicationNotRun,
  isEntropyIssueType,
  describeUnknownIssueType,
  ENTROPY_ISSUE_TYPES,
} from '../../shared/duplication-request.js';

/**
 * The outcome of loading the `entropy` section of the project's harness config.
 *
 * `none` and `invalid` must not share a branch. No config file at all is a
 * legitimate reason to analyze on built-in defaults. A config file that FAILS
 * VALIDATION is not: zod rejects the whole document, so falling back discards
 * the operator's `entryPoints` and `excludePatterns` and scans a different
 * project than the one they configured — then reports findings over that scope
 * as though nothing were wrong.
 */
type EntropyConfigLoad =
  | { kind: 'none' }
  | { kind: 'loaded'; entropy: HarnessConfig['entropy'] }
  | { kind: 'invalid'; message: string };

/**
 * Load the `entropy` section of the project's harness config, if present.
 *
 * Best-effort for the `none` case so a project with no harness.config.json
 * still gets entropy analysis. The `invalid` case is REPORTED, not swallowed
 * — see {@link EntropyConfigLoad} and {@link describeInvalidConfig}.
 */
function loadEntropyConfig(projectPath: string): EntropyConfigLoad {
  const configFile = findConfigFile(projectPath);
  if (!configFile.ok) return { kind: 'none' };
  const loaded = loadConfig(configFile.value);
  if (!loaded.ok) return { kind: 'invalid', message: loaded.error.message };
  return { kind: 'loaded', entropy: loaded.value.entropy };
}

/**
 * Refuse an analysis whose config did not validate, the way `harness cleanup`
 * already does.
 *
 * Before this the two surfaces had OPPOSITE failure policies on identical
 * input. `cleanup.ts` goes through `resolveConfig`, prints
 * `x Invalid config: - entropy.duplication.minInstances: Number must be
 * greater than or equal to 2` and exits 2. This tool returned findings as
 * though nothing were wrong, having silently discarded the ENTIRE `entropy`
 * block — `entryPoints` and `excludePatterns` with it. On this repository
 * `excludePatterns` is what carries the vendored-build-cache exclusion the
 * duplication scope depends on, so the silent fallback changed WHAT WAS
 * SCANNED and said nothing about it.
 *
 * The silent fallback predates Phase 3; a validation error inside
 * `entropy.duplication` does not. zod stripped that key before the schema
 * entry existed, so the new bound is what made the trap reachable. Closed
 * here rather than documented.
 */
function describeInvalidConfig(message: string): string {
  return [
    message,
    '',
    'Refusing to analyze on built-in defaults: a config that fails validation is rejected whole,',
    'so falling back would silently discard entryPoints and excludePatterns and scan a different',
    'scope than the configured one. Fix harness.config.json and re-run — `harness cleanup` exits 2',
    'on this same input.',
  ].join('\n');
}

async function loadEntropyGraphOptions(projectPath: string) {
  const { loadGraphStore } = await import('../utils/graph-loader.js');
  const store = await loadGraphStore(projectPath);
  if (!store) return undefined;

  const { GraphEntropyAdapter } = await import('@harness-engineering/graph');
  const adapter = new GraphEntropyAdapter(store);
  const driftData = adapter.computeDriftData();
  const deadCodeData = adapter.computeDeadCodeData();
  return {
    graphDriftData: {
      staleEdges: driftData.staleEdges.map((e) => ({
        docNodeId: e.docNodeId,
        codeNodeId: e.codeNodeId,
        edgeType: e.edgeType,
      })),
      missingTargets: [...driftData.missingTargets],
    },
    graphDeadCodeData: {
      reachableNodeIds: new Set(deadCodeData.reachableNodeIds),
      unreachableNodes: deadCodeData.unreachableNodes.map((n) => ({
        id: n.id,
        type: n.type,
        name: n.name,
        ...(n.path !== undefined && { path: n.path }),
      })),
    },
  };
}

export const detectEntropyDefinition = {
  name: 'detect_entropy',
  description:
    'Detect documentation drift, dead code, pattern violations, and duplicated code units (clone classes, advisory). Optionally auto-fix detected issues.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      type: {
        type: 'string',
        // Advertised from the shared list so this enum and the CLI's `-t`
        // choices cannot drift. The enum is DECORATIVE at runtime — the SDK
        // does not enforce it — so `handleDetectEntropy` checks membership
        // itself.
        enum: [...ENTROPY_ISSUE_TYPES],
        description:
          'Type of entropy to detect (default: all). "duplication" reports clone classes and is advisory — it is never summed into totalIssues; under "all" it runs only when entropy.duplication is configured.',
      },
      autoFix: {
        type: 'boolean',
        description: 'When true, apply fixes after analysis. Default: false (analysis only)',
      },
      dryRun: {
        type: 'boolean',
        description: 'Preview fixes without applying (only used when autoFix is true)',
      },
      fixTypes: {
        type: 'array',
        items: {
          type: 'string',
          enum: [
            'unused-imports',
            'dead-files',
            'dead-exports',
            'commented-code',
            'orphaned-deps',
            'forbidden-import-replacement',
            'import-ordering',
          ],
        },
        description:
          'Specific fix types to apply (default: all safe types). Only used when autoFix is true.',
      },
      mode: {
        type: 'string',
        enum: ['summary', 'detailed'],
        description:
          'Response density: summary returns issue counts and top issues per category, detailed returns full findings. Default: detailed',
      },
    },
    required: ['path'],
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function summarizeDrift(drift: any): { issueCount: number; topIssues: string[] } {
  const driftIssues = (drift.drifts ?? []).map(
    (d: { type: string; file?: string }) => `Drift: ${d.type}${d.file ? ` in ${d.file}` : ''}`
  );
  return { issueCount: driftIssues.length, topIssues: driftIssues.slice(0, 3) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function summarizeDeadCode(deadCode: any): { issueCount: number; topIssues: string[] } {
  const deadIssues = [
    ...(deadCode.unusedImports ?? []).map(
      (i: { specifiers: string[]; source: string }) =>
        `Unused import: ${i.specifiers.join(', ')} from ${i.source}`
    ),
    ...(deadCode.deadExports ?? []).map(
      (e: { name: string; file: string }) => `Dead export: ${e.name} in ${e.file}`
    ),
    ...(deadCode.deadFiles ?? []).map((f: { path: string }) => `Dead file: ${f.path}`),
  ];
  return { issueCount: deadIssues.length, topIssues: deadIssues.slice(0, 3) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function summarizePatterns(patterns: any): { issueCount: number; topIssues: string[] } {
  const patternIssues = (patterns.violations ?? []).map(
    (v: { pattern: string; file: string }) => `${v.pattern}: ${v.file}`
  );
  return { issueCount: patternIssues.length, topIssues: patternIssues.slice(0, 3) };
}

/**
 * The advisory duplication block for summary mode.
 *
 * Reported ALONGSIDE `totalIssues`, never inside it. The CLI keeps clone
 * classes out of its exit-code arithmetic (D4 / ADR 0134) and `totalIssues` is
 * the one number an agent reads as "is this clean", so D4 has to hold on both
 * surfaces or it holds on neither.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function summarizeDuplication(duplication: any) {
  return {
    classesReported: duplication.stats.classesReported,
    classesSuppressed: duplication.stats.classesSuppressed,
    classesTruncated: duplication.stats.classesTruncated,
    membersReported: duplication.classes.reduce(
      (sum: number, cls: { members: unknown[] }) => sum + cls.members.length,
      0
    ),
    topClasses: duplication.classes
      .slice(0, 3)
      .map(
        (cls: { members: Array<{ unit: string; file: string }>; tokenCount: number }) =>
          `${cls.members.length}x ${cls.tokenCount} tokens: ${cls.members[0]?.unit ?? '<anon>'} (${cls.members[0]?.file ?? '?'})`
      ),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildSummaryResponse(report: any) {
  const summary: Record<string, { issueCount: number; topIssues: string[] }> = {};

  if (report.drift) summary['drift'] = summarizeDrift(report.drift);
  if (report.deadCode) summary['deadCode'] = summarizeDeadCode(report.deadCode);
  if (report.patterns) summary['patterns'] = summarizePatterns(report.patterns);

  const totalIssues = Object.values(summary).reduce((s, c) => s + c.issueCount, 0);

  const duplication = report.duplication ? summarizeDuplication(report.duplication) : undefined;

  // The payload is hoisted rather than inlined into the content wrapper: the
  // nested `advisory` literal took `buildSummaryResponse` to nestingDepth 5,
  // one past the arch threshold.
  const payload = {
    mode: 'summary',
    totalIssues,
    categories: summary,
    ...(duplication && { advisory: { duplication } }),
  };
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
  };
}

/**
 * Project a `DuplicationReport` into something `JSON.stringify` renders
 * faithfully.
 *
 * `DuplicationReport.byMember` is a `Map`, and `JSON.stringify` renders a Map
 * as `{}` — so the detailed response carried `byMember: {}`, which reads as an
 * empty index rather than an unserializable one (spec Phase 3 forward note 4;
 * measured on this tool before the change). It is OMITTED instead: it is an
 * in-process O(1) seam for `code-craft`, and `classes[].members` already
 * carries every member it indexes, so an entries array would duplicate data
 * already in the payload. The key's ABSENCE is the honest signal; `{}` is not.
 *
 * `skipErrors[].details.originalError` is an `Error`, which stringifies to
 * `{}` for the same reason; it is dropped here too, since `message`,
 * `errorName` and `details.reason` carry everything a reader can act on.
 *
 * NOT fixed here: `report.snapshot.exportMap.byFile` is also a `Map` and also
 * serializes away. It predates this change on a report this tool has always
 * returned — named, not silently inherited.
 */
function toJsonSafeDuplication(duplication: NonNullable<EntropyReport['duplication']>): unknown {
  const { byMember: _byMember, skipErrors, ...rest } = duplication;
  return {
    ...rest,
    skipErrors: skipErrors.map((error) => {
      const { originalError: _originalError, ...details } = error.details;
      return { ...error, details };
    }),
  };
}

/**
 * The snapshot minus every file's AST.
 *
 * `SourceFile.ast` is the full typescript-eslint `Program` for the file — an
 * in-process parse tree the analyzers consume and no MCP caller can act on
 * (the same honesty rule that drops `byMember`: a key that cannot be used is
 * not worth a byte). Measured on this package's `duplication-cli-project`
 * fixture (5 files, absolute temp paths): the ASTs were 41,289 of 51,333
 * payload bytes — 80.4%. `path`, `imports`, `exports`, `internalSymbols` and
 * `jsDocComments` are kept; a reader can act on all five.
 */
function withoutFileAsts(snapshot: EntropyReport['snapshot']): unknown {
  return {
    ...snapshot,
    files: snapshot.files.map(({ ast: _ast, ...file }) => file),
  };
}

/**
 * The key order, and why it is load-bearing.
 *
 * `JSON.stringify` emits keys in insertion order, and the compaction
 * middleware truncates the serialized response by PREFIX against a
 * 4,000-token budget (`mcp/middleware/compaction.ts:191`,
 * `core/src/compaction/strategies/truncation.ts`). `EntropyReport` declares
 * `snapshot` FIRST (`core/src/entropy/types/report.ts:25`), and on the
 * fixture the snapshot was 98.3% of the payload while everything a caller
 * acts on — `summary`, `analysisErrors`, `duplication`, `timestamp`,
 * `duration` — was 1.7% sitting past byte 50,409. All of it truncated away;
 * the delivered text was pure AST and not even `JSON.parse`-able.
 *
 * Emitting the actionable keys first fixes that for EVERY detailed consumer
 * of this tool without the generic middleware learning anything about
 * entropy payloads. Note the residual: reordering guarantees the actionable
 * keys are *inside* the delivered prefix, not that the delivered text parses
 * — on a project whose post-AST-strip payload still exceeds the budget the
 * prefix is cut mid-value. `compact: false` remains the way to get the whole
 * report.
 */
function toJsonSafeReport(report: EntropyReport): unknown {
  const { snapshot, summary, analysisErrors, duplication, ...rest } = report;
  return {
    summary,
    analysisErrors,
    ...(duplication && { duplication: toJsonSafeDuplication(duplication) }),
    ...rest,
    snapshot: withoutFileAsts(snapshot),
  };
}

export async function handleDetectEntropy(input: {
  path: string;
  type?: string;
  autoFix?: boolean;
  dryRun?: boolean;
  fixTypes?: string[];
  mode?: 'summary' | 'detailed';
}) {
  try {
    const { EntropyAnalyzer } = await import('@harness-engineering/core');
    const typeFilter = input.type ?? 'all';

    // The JSON-schema `enum` above is advertisement, not enforcement: measured
    // on this tool, `{ type: "duplicaiton", mode: "summary" }` returned
    // `{"mode":"summary","totalIssues":0}` with no error, and the only weak
    // marker (`categories: {}`) is deleted by structural compaction — making
    // the wire response byte-indistinguishable from a clean full scan.
    if (!isEntropyIssueType(typeFilter)) {
      return {
        content: [{ type: 'text' as const, text: describeUnknownIssueType(typeFilter) }],
        isError: true,
      };
    }

    const projectPath = sanitizePath(input.path);

    // Load the project's harness config (if present) so drift tuning
    // (entropy.drift: checkApiSignatures / ignorePatterns / forwardLookingPaths
    // / docPaths) and entry points / excludes are honored instead of silently
    // falling back to DEFAULT_DRIFT_CONFIG — issue #723. Missing/invalid config
    // is non-fatal: entropy runs with built-in defaults.
    const configLoad = loadEntropyConfig(projectPath);
    if (configLoad.kind === 'invalid') {
      return {
        content: [{ type: 'text' as const, text: describeInvalidConfig(configLoad.message) }],
        isError: true,
      };
    }
    const entropy = configLoad.kind === 'loaded' ? configLoad.entropy : undefined;
    const driftConfig = entropy?.drift as Partial<DriftConfig> | undefined;
    const driftEnabled = typeFilter === 'all' || typeFilter === 'drift';

    // Pattern rules come from `entropy.patterns` in harness.config.json. The
    // previous implementation passed `patterns` as a bare boolean, which the
    // EntropyAnalyzer coerces into an empty rule set (`{ patterns: [] }`). That
    // evaluated ZERO rules yet reported zero violations / passRate 1 — a pass
    // indistinguishable from a real pattern check that actually found nothing.
    // This is the same empty-ruleset false-pass fixed on the CLI path in #1760
    // (PR #1791). Read the configured rules instead, and refuse to green-tick a
    // patterns check that has nothing to evaluate (#1792).
    const patternsRequested = typeFilter === 'all' || typeFilter === 'patterns';
    const patternConfig = entropy?.patterns as PatternConfig | undefined;
    const configuredRuleCount =
      (patternConfig?.patterns?.length ?? 0) + (patternConfig?.customPatterns?.length ?? 0);
    const hasPatternRules = configuredRuleCount > 0;

    // Fail loudly when patterns is the explicitly requested check but no rules
    // are configured — an empty rule set cannot honestly report a pass (#1792).
    if (typeFilter === 'patterns' && !hasPatternRules) {
      return {
        content: [
          {
            type: 'text' as const,
            text:
              'No pattern rules are configured, so detect_entropy(type: "patterns") has nothing ' +
              'to evaluate. Add rules under `entropy.patterns` in harness.config.json, or request ' +
              'a different check (type: "drift" | "dead-code"). Refusing to report a pass over ' +
              'zero rules.',
          },
        ],
        isError: true,
      };
    }

    // Same opt-in rule as `harness cleanup` — one resolver, two surfaces, so
    // they cannot drift (plan decisions P3/P4/P14).
    const duplicationRequest = resolveDuplicationRequest(
      typeFilter,
      entropy?.duplication as boolean | Partial<DuplicationConfig> | undefined
    );
    if (duplicationRequest.kind === 'refuse') {
      return {
        content: [{ type: 'text' as const, text: duplicationRequest.message }],
        isError: true,
      };
    }

    // Project-wide analysis.exclude globs apply on top of the entropy-specific
    // excludes (or the built-in defaults when no entropy block is configured).
    const analysisExclude = loadAnalysisExclude(projectPath);
    const exclude = [
      ...(entropy?.excludePatterns ?? [...skipDirGlobs(), '**/*.test.ts', '**/*.spec.ts']),
      ...analysisExclude,
    ];

    const analyzer = new EntropyAnalyzer({
      rootDir: projectPath,
      ...(entropy?.entryPoints && { entryPoints: entropy.entryPoints }),
      exclude,
      ...(driftConfig?.docPaths && { docPaths: driftConfig.docPaths }),
      analyze: {
        drift: driftEnabled ? (driftConfig ?? true) : false,
        deadCode: typeFilter === 'all' || typeFilter === 'dead-code',
        // Only run the pattern analyzer when real rules exist; a bare boolean
        // becomes an empty rule set that misrepresents "checked" as "passed"
        // (#1792). For `all`, patterns are simply skipped when unconfigured.
        patterns: patternsRequested && hasPatternRules && patternConfig ? patternConfig : false,
        ...(duplicationRequest.kind === 'run' && { duplication: duplicationRequest.analyze }),
      },
    });

    const graphOptions = await loadEntropyGraphOptions(projectPath);
    const result = await analyzer.analyze(graphOptions);

    // `loadEntropyGraphOptions` returns BOTH graph keys whenever a graph
    // exists, which makes `analyze()` bypass the snapshot — and duplication,
    // which discovers through `snapshot.files`, then refuses with
    // `details.reason: 'snapshot-bypassed'` and leaves the report undefined.
    // For an explicit request that silence would render as "no duplication
    // found", so name it (spec Phase 3 forward note 3). Under `all` the reason
    // is already in the payload's `analysisErrors`, and the other categories
    // still have results worth returning.
    if (
      result.ok &&
      duplicationRequest.kind === 'run' &&
      !result.value.duplication &&
      input.type === 'duplication'
    ) {
      return {
        content: [
          { type: 'text' as const, text: describeDuplicationNotRun(result.value.analysisErrors) },
        ],
        isError: true,
      };
    }

    // Response density control
    if (input.mode === 'summary' && result.ok && !input.autoFix) {
      return buildSummaryResponse(result.value);
    }

    if (!input.autoFix) {
      return result.ok
        ? resultToMcpResponse(Ok(toJsonSafeReport(result.value)))
        : resultToMcpResponse(result);
    }

    // autoFix mode: run fixes after analysis
    if (!result.ok) return resultToMcpResponse(result);

    const { createFixes, applyFixes, generateSuggestions } =
      await import('@harness-engineering/core');

    const report = result.value;
    const deadCode = report.deadCode;
    const fixTypesConfig = input.fixTypes
      ? { fixTypes: input.fixTypes as import('@harness-engineering/core').FixType[] }
      : undefined;
    const fixes = deadCode ? createFixes(deadCode, fixTypesConfig) : [];
    const suggestions = generateSuggestions(report.deadCode, report.drift, report.patterns);

    if (input.dryRun) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ analysis: toJsonSafeReport(report), fixes, suggestions }),
          },
        ],
      };
    }

    if (fixes.length > 0) {
      const applied = await applyFixes(fixes, {});
      if (!applied.ok) return resultToMcpResponse(applied);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              analysis: toJsonSafeReport(report),
              ...applied.value,
              suggestions,
            }),
          },
        ],
      };
    }

    return resultToMcpResponse(
      Ok({ analysis: toJsonSafeReport(report), fixes: [], applied: 0, suggestions })
    );
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
