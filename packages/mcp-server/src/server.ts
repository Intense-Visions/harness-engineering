import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { validateToolDefinition, handleValidateProject } from './tools/validate.js';
import { checkDependenciesDefinition, handleCheckDependencies } from './tools/architecture.js';
import {
  checkDocsDefinition,
  handleCheckDocs,
  validateKnowledgeMapDefinition,
  handleValidateKnowledgeMap,
} from './tools/docs.js';
import {
  detectEntropyDefinition,
  handleDetectEntropy,
  applyFixesDefinition,
  handleApplyFixes,
} from './tools/entropy.js';
import {
  generateLinterDefinition,
  handleGenerateLinter,
  validateLinterConfigDefinition,
  handleValidateLinterConfig,
} from './tools/linter.js';
import { initProjectDefinition, handleInitProject } from './tools/init.js';
import {
  listPersonasDefinition,
  handleListPersonas,
  generatePersonaArtifactsDefinition,
  handleGeneratePersonaArtifacts,
  runPersonaDefinition,
  handleRunPersona,
} from './tools/persona.js';
import {
  addComponentDefinition,
  handleAddComponent,
  runAgentTaskDefinition,
  handleRunAgentTask,
} from './tools/agent.js';
import {
  runSkillDefinition,
  handleRunSkill,
  createSkillDefinition,
  handleCreateSkill,
} from './tools/skill.js';
import { getSkillsResource } from './resources/skills.js';
import { getRulesResource } from './resources/rules.js';
import { getProjectResource } from './resources/project.js';
import { getLearningsResource } from './resources/learnings.js';
import {
  manageStateDefinition,
  handleManageState,
  manageHandoffDefinition,
  handleManageHandoff,
} from './tools/state.js';
import {
  createSelfReviewDefinition,
  handleCreateSelfReview,
  analyzeDiffDefinition,
  handleAnalyzeDiff,
  requestPeerReviewDefinition,
  handleRequestPeerReview,
} from './tools/feedback.js';
import { checkPhaseGateDefinition, handleCheckPhaseGate } from './tools/phase-gate.js';
import { validateCrossCheckDefinition, handleValidateCrossCheck } from './tools/cross-check.js';
import {
  generateSlashCommandsDefinition,
  handleGenerateSlashCommands,
} from './tools/generate-slash-commands.js';
import { getStateResource } from './resources/state.js';
import {
  queryGraphDefinition,
  handleQueryGraph,
  searchSimilarDefinition,
  handleSearchSimilar,
  findContextForDefinition,
  handleFindContextFor,
  getRelationshipsDefinition,
  handleGetRelationships,
  getImpactDefinition,
  handleGetImpact,
  ingestSourceDefinition,
  handleIngestSource,
} from './tools/graph.js';
import {
  getGraphResource,
  getEntitiesResource,
  getRelationshipsResource,
} from './resources/graph.js';
import {
  generateAgentDefinitionsDefinition,
  handleGenerateAgentDefinitions,
} from './tools/agent-definitions.js';

type ToolDefinition = { name: string; description: string; inputSchema: Record<string, unknown> };
type ToolHandler = (
  input: Record<string, unknown>
) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

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
  addComponentDefinition,
  runAgentTaskDefinition,
  runSkillDefinition,
  manageStateDefinition,
  manageHandoffDefinition,
  createSelfReviewDefinition,
  analyzeDiffDefinition,
  requestPeerReviewDefinition,
  checkPhaseGateDefinition,
  validateCrossCheckDefinition,
  createSkillDefinition,
  generateSlashCommandsDefinition,
  queryGraphDefinition,
  searchSimilarDefinition,
  findContextForDefinition,
  getRelationshipsDefinition,
  getImpactDefinition,
  ingestSourceDefinition,
  generateAgentDefinitionsDefinition,
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
  add_component: handleAddComponent as ToolHandler,
  run_agent_task: handleRunAgentTask as ToolHandler,
  run_skill: handleRunSkill as ToolHandler,
  manage_state: handleManageState as ToolHandler,
  manage_handoff: handleManageHandoff as ToolHandler,
  create_self_review: handleCreateSelfReview as ToolHandler,
  analyze_diff: handleAnalyzeDiff as ToolHandler,
  request_peer_review: handleRequestPeerReview as ToolHandler,
  check_phase_gate: handleCheckPhaseGate as ToolHandler,
  validate_cross_check: handleValidateCrossCheck as ToolHandler,
  create_skill: handleCreateSkill as ToolHandler,
  generate_slash_commands: handleGenerateSlashCommands as ToolHandler,
  query_graph: handleQueryGraph as ToolHandler,
  search_similar: handleSearchSimilar as ToolHandler,
  find_context_for: handleFindContextFor as ToolHandler,
  get_relationships: handleGetRelationships as ToolHandler,
  get_impact: handleGetImpact as ToolHandler,
  ingest_source: handleIngestSource as ToolHandler,
  generate_agent_definitions: handleGenerateAgentDefinitions as ToolHandler,
};

const RESOURCE_DEFINITIONS = [
  {
    uri: 'harness://skills',
    name: 'Harness Skills',
    description:
      'Available skills with metadata (name, description, cognitive_mode, type, triggers)',
    mimeType: 'application/json',
  },
  {
    uri: 'harness://rules',
    name: 'Harness Rules',
    description: 'Active linter rules and constraints from harness config',
    mimeType: 'application/json',
  },
  {
    uri: 'harness://project',
    name: 'Project Context',
    description: 'Project structure and agent instructions from AGENTS.md',
    mimeType: 'text/markdown',
  },
  {
    uri: 'harness://learnings',
    name: 'Learnings',
    description: 'Review learnings and anti-pattern log from .harness/',
    mimeType: 'text/markdown',
  },
  {
    uri: 'harness://state',
    name: 'Project State',
    description: 'Current harness state including position, progress, decisions, and blockers',
    mimeType: 'application/json',
  },
  {
    uri: 'harness://graph',
    name: 'Knowledge Graph',
    description: 'Graph statistics, node/edge counts by type, staleness',
    mimeType: 'application/json',
  },
  {
    uri: 'harness://entities',
    name: 'Graph Entities',
    description: 'All entity nodes with types and metadata',
    mimeType: 'application/json',
  },
  {
    uri: 'harness://relationships',
    name: 'Graph Relationships',
    description: 'All edges with types, confidence scores, and timestamps',
    mimeType: 'application/json',
  },
];

type ResourceHandler = (projectRoot: string) => Promise<string>;

const RESOURCE_HANDLERS: Record<string, ResourceHandler> = {
  'harness://skills': getSkillsResource,
  'harness://rules': getRulesResource,
  'harness://project': getProjectResource,
  'harness://learnings': getLearningsResource,
  'harness://state': getStateResource,
  'harness://graph': getGraphResource,
  'harness://entities': getEntitiesResource,
  'harness://relationships': getRelationshipsResource,
};

export function getToolDefinitions(): ToolDefinition[] {
  return TOOL_DEFINITIONS;
}

export function getResourceDefinitions(): typeof RESOURCE_DEFINITIONS {
  return RESOURCE_DEFINITIONS;
}

export function createHarnessServer(projectRoot?: string): Server {
  const resolvedRoot = projectRoot ?? process.cwd();

  const server = new Server(
    { name: 'harness-engineering', version: '0.1.0' },
    { capabilities: { tools: {}, resources: {} } }
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

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: RESOURCE_DEFINITIONS,
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    const handler = RESOURCE_HANDLERS[uri];
    if (!handler) {
      throw new Error(`Unknown resource: ${uri}`);
    }
    const content = await handler(resolvedRoot);
    const resourceDef = RESOURCE_DEFINITIONS.find((r) => r.uri === uri);
    const mimeType = resourceDef?.mimeType ?? 'text/plain';
    return {
      contents: [{ uri, text: content, mimeType }],
    };
  });

  return server;
}

export async function startServer() {
  const server = createHarnessServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
