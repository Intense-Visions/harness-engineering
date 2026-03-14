import * as path from 'path';
import { resultToMcpResponse } from '../utils/result-adapter.js';

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
    const result = await checkDocCoverage(domain, {
      sourceDir: path.resolve(input.path, 'src'),
      docsDir: path.resolve(input.path, 'docs'),
    });
    return resultToMcpResponse(result);
  } catch (error) {
    return { content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
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
    const result = await validateKnowledgeMap(path.resolve(input.path));
    return resultToMcpResponse(result);
  } catch (error) {
    return { content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
  }
}
