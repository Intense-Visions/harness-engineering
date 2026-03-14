import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { validateToolDefinition, handleValidateProject } from './tools/validate.js';
import { checkDependenciesDefinition, handleCheckDependencies } from './tools/architecture.js';
import { checkDocsDefinition, handleCheckDocs, validateKnowledgeMapDefinition, handleValidateKnowledgeMap } from './tools/docs.js';
import { detectEntropyDefinition, handleDetectEntropy, applyFixesDefinition, handleApplyFixes } from './tools/entropy.js';
import { generateLinterDefinition, handleGenerateLinter, validateLinterConfigDefinition, handleValidateLinterConfig } from './tools/linter.js';
import { initProjectDefinition, handleInitProject } from './tools/init.js';
import { listPersonasDefinition, handleListPersonas, generatePersonaArtifactsDefinition, handleGeneratePersonaArtifacts, runPersonaDefinition, handleRunPersona } from './tools/persona.js';

type ToolDefinition = { name: string; description: string; inputSchema: Record<string, unknown> };
type ToolHandler = (input: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

const TOOL_DEFINITIONS: ToolDefinition[] = [
  validateToolDefinition,
  checkDependenciesDefinition,
  checkDocsDefinition,
  validateKnowledgeMapDefinition,
  detectEntropyDefinition,
  applyFixesDefinition,
  generateLinterDefinition,
  validateLinterConfigDefinition,
  initProjectDefinition,
  listPersonasDefinition,
  generatePersonaArtifactsDefinition,
  runPersonaDefinition,
];
const TOOL_HANDLERS: Record<string, ToolHandler> = {
  validate_project: handleValidateProject as ToolHandler,
  check_dependencies: handleCheckDependencies as ToolHandler,
  check_docs: handleCheckDocs as ToolHandler,
  validate_knowledge_map: handleValidateKnowledgeMap as ToolHandler,
  detect_entropy: handleDetectEntropy as ToolHandler,
  apply_fixes: handleApplyFixes as ToolHandler,
  generate_linter: handleGenerateLinter as ToolHandler,
  validate_linter_config: handleValidateLinterConfig as ToolHandler,
  init_project: handleInitProject as ToolHandler,
  list_personas: handleListPersonas as ToolHandler,
  generate_persona_artifacts: handleGeneratePersonaArtifacts as ToolHandler,
  run_persona: handleRunPersona as ToolHandler,
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
    return handler(args ?? {}) as Promise<never>;
  });

  return server;
}

export async function startServer() {
  const server = createHarnessServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
