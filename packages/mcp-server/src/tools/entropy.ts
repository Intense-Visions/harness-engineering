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
    },
    required: ['path'],
  },
};

export async function handleDetectEntropy(input: { path: string }) {
  try {
    const { EntropyAnalyzer } = await import('@harness-engineering/core');
    const analyzer = new EntropyAnalyzer({
      rootDir: path.resolve(input.path),
      analyze: { drift: true, deadCode: true, patterns: true },
    });
    const result = await analyzer.analyze();
    return resultToMcpResponse(result);
  } catch (error) {
    return { content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
  }
}

export const applyFixesDefinition = {
  name: 'apply_fixes',
  description: 'Auto-fix detected entropy issues',
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
    const { EntropyAnalyzer, createFixes, applyFixes } = await import('@harness-engineering/core');
    const analyzer = new EntropyAnalyzer({
      rootDir: path.resolve(input.path),
      analyze: { drift: true, deadCode: true, patterns: true },
    });
    const analysisResult = await analyzer.analyze();
    if (!analysisResult.ok) return resultToMcpResponse(analysisResult);

    const deadCode = analysisResult.value.deadCode;
    if (!deadCode) {
      return resultToMcpResponse(Ok({ fixes: [], applied: 0 }));
    }

    const fixes = createFixes(deadCode, {});
    if (input.dryRun) {
      return { content: [{ type: 'text' as const, text: JSON.stringify(fixes) }] };
    }
    const applied = await applyFixes(fixes, {});
    return resultToMcpResponse(applied);
  } catch (error) {
    return { content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
  }
}
