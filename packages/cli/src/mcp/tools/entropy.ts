import { Ok } from '@harness-engineering/core';
import { resultToMcpResponse } from '../utils/result-adapter.js';
import { sanitizePath } from '../utils/sanitize-path.js';

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
    'Detect documentation drift, dead code, and pattern violations. Optionally auto-fix detected issues.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      type: {
        type: 'string',
        enum: ['drift', 'dead-code', 'patterns', 'all'],
        description: 'Type of entropy to detect (default: all)',
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

    const analyzer = new EntropyAnalyzer({
      rootDir: sanitizePath(input.path),
      analyze: {
        drift: typeFilter === 'all' || typeFilter === 'drift',
        deadCode: typeFilter === 'all' || typeFilter === 'dead-code',
        patterns: typeFilter === 'all' || typeFilter === 'patterns',
      },
    });

    const graphOptions = await loadEntropyGraphOptions(sanitizePath(input.path));
    const result = await analyzer.analyze(graphOptions);

    // Response density control
    if (input.mode === 'summary' && result.ok && !input.autoFix) {
      const report = result.value;
      const summary: Record<string, { issueCount: number; topIssues: string[] }> = {};

      if (report.drift) {
        const driftIssues = (report.drift.drifts ?? []).map(
          (d: { type: string; file?: string }) => `Drift: ${d.type}${d.file ? ` in ${d.file}` : ''}`
        );
        summary['drift'] = {
          issueCount: driftIssues.length,
          topIssues: driftIssues.slice(0, 3),
        };
      }

      if (report.deadCode) {
        const deadIssues = [
          ...(report.deadCode.unusedImports ?? []).map(
            (i) => `Unused import: ${i.specifiers.join(', ')} from ${i.source}`
          ),
          ...(report.deadCode.deadExports ?? []).map((e) => `Dead export: ${e.name} in ${e.file}`),
          ...(report.deadCode.deadFiles ?? []).map((f) => `Dead file: ${f.path}`),
        ];
        summary['deadCode'] = {
          issueCount: deadIssues.length,
          topIssues: deadIssues.slice(0, 3),
        };
      }

      if (report.patterns) {
        const patternIssues = (report.patterns.violations ?? []).map(
          (v) => `${v.pattern}: ${v.file}`
        );
        summary['patterns'] = {
          issueCount: patternIssues.length,
          topIssues: patternIssues.slice(0, 3),
        };
      }

      const totalIssues = Object.values(summary).reduce((s, c) => s + c.issueCount, 0);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ mode: 'summary', totalIssues, categories: summary }),
          },
        ],
      };
    }

    if (!input.autoFix) {
      return resultToMcpResponse(result);
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
          { type: 'text' as const, text: JSON.stringify({ analysis: report, fixes, suggestions }) },
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
            text: JSON.stringify({ analysis: report, ...applied.value, suggestions }),
          },
        ],
      };
    }

    return resultToMcpResponse(Ok({ analysis: report, fixes: [], applied: 0, suggestions }));
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
