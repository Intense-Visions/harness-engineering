import { loadGraphStore } from '../../utils/graph-loader.js';
import { sanitizePath } from '../../utils/sanitize-path.js';
import { graphNotFoundError } from './shared.js';

export const askGraphDefinition = {
  name: 'ask_graph',
  description:
    'Ask a natural language question about the codebase knowledge graph. ' +
    'Supports questions about impact ("what breaks if I change X?"), ' +
    'finding entities ("where is the auth middleware?"), ' +
    'relationships ("what calls UserService?"), ' +
    'explanations ("what is GraphStore?"), ' +
    'and anomalies ("what looks wrong?"). ' +
    'Returns a human-readable summary and raw graph data.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      question: { type: 'string', description: 'Natural language question about the codebase' },
    },
    required: ['path', 'question'],
  },
};

export async function handleAskGraph(input: { path: string; question: string }) {
  try {
    const projectPath = sanitizePath(input.path);
    const store = await loadGraphStore(projectPath);
    if (!store) return graphNotFoundError();

    const { askGraph } = await import('@harness-engineering/graph');
    const result = await askGraph(store, input.question);

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result) }],
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
