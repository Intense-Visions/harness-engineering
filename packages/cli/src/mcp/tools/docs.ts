import * as path from 'path';
import { Ok } from '@harness-engineering/core';
import { resultToMcpResponse } from '../utils/result-adapter.js';
import { sanitizePath } from '../utils/sanitize-path.js';
import { findConfigFile, loadConfig } from '../../config/loader.js';

function resolveDocsDir(projectPath: string): string {
  const configResult = findConfigFile(projectPath);
  if (configResult.ok) {
    const config = loadConfig(configResult.value);
    if (config.ok) {
      return path.resolve(projectPath, config.value.docsDir);
    }
  }
  return path.resolve(projectPath, 'docs');
}

export const checkDocsDefinition = {
  name: 'check_docs',
  description: 'Analyze documentation coverage and/or validate knowledge map integrity',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      domain: { type: 'string', description: 'Domain/module to check' },
      scope: {
        type: 'string',
        enum: ['coverage', 'integrity', 'all'],
        description:
          "Scope of check: 'coverage' (doc coverage), 'integrity' (knowledge map validation), 'all' (both). Default: 'coverage'",
      },
    },
    required: ['path'],
  },
};

export async function handleCheckDocs(input: {
  path: string;
  domain?: string;
  scope?: 'coverage' | 'integrity' | 'all';
}) {
  try {
    const projectPath = sanitizePath(input.path);
    const scope = input.scope ?? 'coverage';

    if (scope === 'integrity') {
      const { validateKnowledgeMap } = await import('@harness-engineering/core');
      const result = await validateKnowledgeMap(projectPath);
      return resultToMcpResponse(result);
    }

    if (scope === 'all') {
      const { checkDocCoverage, validateKnowledgeMap } = await import('@harness-engineering/core');
      const domain = input.domain ?? 'src';

      const { loadGraphStore } = await import('../utils/graph-loader.js');
      const store = await loadGraphStore(projectPath);
      let graphCoverage:
        | { documented: string[]; undocumented: string[]; coveragePercentage: number }
        | undefined;
      if (store) {
        const { Assembler } = await import('@harness-engineering/graph');
        const assembler = new Assembler(store);
        const report = assembler.checkCoverage();
        graphCoverage = {
          documented: [...report.documented],
          undocumented: [...report.undocumented],
          coveragePercentage: report.coveragePercentage,
        };
      }

      const [coverageResult, integrityResult] = await Promise.allSettled([
        checkDocCoverage(domain, {
          sourceDir: path.resolve(projectPath, 'src'),
          docsDir: resolveDocsDir(projectPath),
          ...(graphCoverage !== undefined && { graphCoverage }),
        }),
        validateKnowledgeMap(projectPath),
      ]);

      let coverage: unknown;
      if (coverageResult.status === 'fulfilled') {
        const r = coverageResult.value;
        coverage = r.ok ? r.value : { error: r.error };
      } else {
        coverage = { error: String(coverageResult.reason) };
      }
      let integrity: unknown;
      if (integrityResult.status === 'fulfilled') {
        const r = integrityResult.value;
        integrity = r.ok ? r.value : { error: r.error };
      } else {
        integrity = { error: String(integrityResult.reason) };
      }

      return resultToMcpResponse(Ok({ coverage, integrity }));
    }

    // scope === 'coverage' (default -- existing behavior)
    const { checkDocCoverage } = await import('@harness-engineering/core');
    const domain = input.domain ?? 'src';
    const { loadGraphStore } = await import('../utils/graph-loader.js');
    const store = await loadGraphStore(projectPath);
    let graphCoverage:
      | { documented: string[]; undocumented: string[]; coveragePercentage: number }
      | undefined;
    if (store) {
      const { Assembler } = await import('@harness-engineering/graph');
      const assembler = new Assembler(store);
      const report = assembler.checkCoverage();
      graphCoverage = {
        documented: [...report.documented],
        undocumented: [...report.undocumented],
        coveragePercentage: report.coveragePercentage,
      };
    }

    const result = await checkDocCoverage(domain, {
      sourceDir: path.resolve(projectPath, 'src'),
      docsDir: resolveDocsDir(projectPath),
      ...(graphCoverage !== undefined && { graphCoverage }),
    });
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
