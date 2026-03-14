import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { validateToolDefinition, handleValidateProject } from './tools/validate.js';
import { checkDependenciesDefinition, handleCheckDependencies } from './tools/architecture.js';
import { checkDocsDefinition, handleCheckDocs, validateKnowledgeMapDefinition, handleValidateKnowledgeMap } from './tools/docs.js';
import { detectEntropyDefinition, handleDetectEntropy, applyFixesDefinition, handleApplyFixes } from './tools/entropy.js';

type ToolDefinition = { name: string; description: string; inputSchema: Record<string, unknown> };
type ToolHandler = (input: Record<string, unknown>) => Promise<unknown>;

const TOOL_DEFINITIONS: ToolDefinition[] = [
  validateToolDefinition,
  checkDependenciesDefinition,
  checkDocsDefinition,
  validateKnowledgeMapDefinition,
  detectEntropyDefinition,
  applyFixesDefinition,
];
const TOOL_HANDLERS: Record<string, ToolHandler> = {
  validate_project: handleValidateProject as ToolHandler,
  check_dependencies: handleCheckDependencies as ToolHandler,
  check_docs: handleCheckDocs as ToolHandler,
  validate_knowledge_map: handleValidateKnowledgeMap as ToolHandler,
  detect_entropy: handleDetectEntropy as ToolHandler,
  apply_fixes: handleApplyFixes as ToolHandler,
};

export function getToolDefinitions(): ToolDefinition[] {
  return TOOL_DEFINITIONS;
}

export function createHarnessServer(): Server {
  const server = new Server(
    { name: 'harness-engineering', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const handler = TOOL_HANDLERS[name];
    if (!handler) {
      return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
    return handler(args ?? {});
  });

  return server;
}

export async function startServer() {
  const server = createHarnessServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
