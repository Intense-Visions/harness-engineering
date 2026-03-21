import * as path from 'path';
import { resultToMcpResponse } from '../utils/result-adapter.js';
import { sanitizePath } from '../utils/sanitize-path.js';

export const checkDocsDefinition = {
  name: 'check_docs',
  description: 'Analyze documentation coverage',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      domain: { type: 'string', description: 'Domain/module to check' },
    },
    required: ['path'],
  },
};

export async function handleCheckDocs(input: { path: string; domain?: string }) {
  try {
    const { checkDocCoverage } = await import('@harness-engineering/core');
    const domain = input.domain ?? 'src';

    // Attempt to load graph for enhanced coverage analysis
    const { loadGraphStore } = await import('../utils/graph-loader.js');
    const projectPath = sanitizePath(input.path);
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
      docsDir: path.resolve(projectPath, 'docs'),
      graphCoverage,
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

export const validateKnowledgeMapDefinition = {
  name: 'validate_knowledge_map',
  description: 'Validate AGENTS.md knowledge map structure and links',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
    },
    required: ['path'],
  },
};

export async function handleValidateKnowledgeMap(input: { path: string }) {
  try {
    const { validateKnowledgeMap } = await import('@harness-engineering/core');
    const result = await validateKnowledgeMap(sanitizePath(input.path));
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
