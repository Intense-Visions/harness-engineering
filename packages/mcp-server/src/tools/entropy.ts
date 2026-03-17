import * as path from 'path';
import { Ok } from '@harness-engineering/core';
import { resultToMcpResponse } from '../utils/result-adapter.js';

export const detectEntropyDefinition = {
  name: 'detect_entropy',
  description: 'Detect documentation drift, dead code, and pattern violations',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      type: {
        type: 'string',
        enum: ['drift', 'dead-code', 'patterns', 'all'],
        description: 'Type of entropy to detect (default: all)',
      },
    },
    required: ['path'],
  },
};

export async function handleDetectEntropy(input: { path: string; type?: string }) {
  try {
    const { EntropyAnalyzer } = await import('@harness-engineering/core');
    const typeFilter = input.type ?? 'all';
    const analyzer = new EntropyAnalyzer({
      rootDir: path.resolve(input.path),
      analyze: {
        drift: typeFilter === 'all' || typeFilter === 'drift',
        deadCode: typeFilter === 'all' || typeFilter === 'dead-code',
        patterns: typeFilter === 'all' || typeFilter === 'patterns',
      },
    });
    const result = await analyzer.analyze();
    return resultToMcpResponse(result);
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

export const applyFixesDefinition = {
  name: 'apply_fixes',
  description:
    'Auto-fix detected entropy issues and return actionable suggestions for remaining issues',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      dryRun: { type: 'boolean', description: 'Preview fixes without applying' },
    },
    required: ['path'],
  },
};

export async function handleApplyFixes(input: { path: string; dryRun?: boolean }) {
  try {
    const { EntropyAnalyzer, createFixes, applyFixes, generateSuggestions } =
      await import('@harness-engineering/core');
    const analyzer = new EntropyAnalyzer({
      rootDir: path.resolve(input.path),
      analyze: { drift: true, deadCode: true, patterns: true },
    });
    const analysisResult = await analyzer.analyze();
    if (!analysisResult.ok) return resultToMcpResponse(analysisResult);

    const report = analysisResult.value;
    const deadCode = report.deadCode;
    const fixes = deadCode ? createFixes(deadCode, {}) : [];
    const suggestions = generateSuggestions(report.deadCode, report.drift, report.patterns);

    if (input.dryRun) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ fixes, suggestions }) }] };
    }

    if (fixes.length > 0) {
      const applied = await applyFixes(fixes, {});
      if (!applied.ok) return resultToMcpResponse(applied);
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify({ ...applied.value, suggestions }) },
        ],
      };
    }

    return resultToMcpResponse(Ok({ fixes: [], applied: 0, suggestions }));
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
