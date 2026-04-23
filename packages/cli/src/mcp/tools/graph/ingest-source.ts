import * as path from 'path';
import { sanitizePath } from '../../utils/sanitize-path.js';

export const ingestSourceDefinition = {
  name: 'ingest_source',
  description:
    'Ingest sources into the project knowledge graph. Supports code analysis, knowledge documents, git history, or all at once.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      source: {
        type: 'string',
        enum: ['code', 'knowledge', 'git', 'business-signals', 'all'],
        description: 'Type of source to ingest',
      },
    },
    required: ['path', 'source'],
  },
};

export async function handleIngestSource(input: {
  path: string;
  source: 'code' | 'knowledge' | 'git' | 'business-signals' | 'all';
}) {
  try {
    const projectPath = sanitizePath(input.path);
    const graphDir = path.join(projectPath, '.harness', 'graph');

    const { GraphStore, CodeIngestor, TopologicalLinker, KnowledgeIngestor, GitIngestor } =
      await import('@harness-engineering/graph');
    const fs = await import('node:fs/promises');

    // Ensure graph directory exists
    await fs.mkdir(graphDir, { recursive: true });

    // Try to load existing graph, or start fresh
    const store = new GraphStore();
    await store.load(graphDir);

    const results: import('@harness-engineering/graph').IngestResult[] = [];

    if (input.source === 'code' || input.source === 'all') {
      const codeIngestor = new CodeIngestor(store);
      const codeResult = await codeIngestor.ingest(projectPath);
      results.push(codeResult);

      const linker = new TopologicalLinker(store);
      linker.link();
    }

    if (input.source === 'knowledge' || input.source === 'all') {
      const knowledgeIngestor = new KnowledgeIngestor(store);
      const knowledgeResult = await knowledgeIngestor.ingestAll(projectPath);
      results.push(knowledgeResult);
    }

    if (input.source === 'git' || input.source === 'all') {
      const gitIngestor = new GitIngestor(store);
      const gitResult = await gitIngestor.ingest(projectPath);
      results.push(gitResult);
    }

    if (input.source === 'business-signals' || input.source === 'all') {
      const { createExtractionRunner } = await import('@harness-engineering/graph');
      const extractedDir = path.join(projectPath, '.harness', 'knowledge', 'extracted');
      const signalsResult = await createExtractionRunner().run(projectPath, store, extractedDir);
      results.push(signalsResult);
    }

    // Save the graph
    await store.save(graphDir);

    // Combine results
    const combined = {
      nodesAdded: results.reduce((s, r) => s + r.nodesAdded, 0),
      nodesUpdated: results.reduce((s, r) => s + r.nodesUpdated, 0),
      edgesAdded: results.reduce((s, r) => s + r.edgesAdded, 0),
      edgesUpdated: results.reduce((s, r) => s + r.edgesUpdated, 0),
      errors: results.flatMap((r) => r.errors),
      durationMs: results.reduce((s, r) => s + r.durationMs, 0),
      graphStats: {
        totalNodes: store.nodeCount,
        totalEdges: store.edgeCount,
      },
    };

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(combined) }],
    };
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
