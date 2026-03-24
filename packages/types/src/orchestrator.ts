import type { Result } from './index';

// --- Token Usage ---

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

// --- Issue Model ---

export interface BlockerRef {
  id: string | null;
  identifier: string | null;
  state: string | null;
}

export interface Issue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: number | null;
  state: string;
  branchName: string | null;
  url: string | null;
  labels: string[];
  blockedBy: BlockerRef[];
  createdAt: string | null;
  updatedAt: string | null;
}

// --- Agent Backend Protocol ---

export type AgentErrorCategory =
  | 'agent_not_found'
  | 'invalid_workspace_cwd'
  | 'response_timeout'
  | 'turn_timeout'
  | 'process_exit'
  | 'response_error'
  | 'turn_failed'
  | 'turn_cancelled'
  | 'turn_input_required';

export interface AgentError {
  category: AgentErrorCategory;
  message: string;
  details?: unknown;
}

export interface SessionStartParams {
  workspacePath: string;
  permissionMode: string;
  allowedTools?: string[];
  systemPrompt?: string;
}

export interface AgentSession {
  sessionId: string;
  workspacePath: string;
  backendName: string;
  startedAt: string;
}

export interface TurnParams {
  sessionId: string;
  prompt: string;
  isContinuation: boolean;
}

export interface AgentEvent {
  type: string;
  timestamp: string;
  subtype?: string;
  usage?: TokenUsage;
  content?: unknown;
  sessionId?: string;
}

export interface TurnResult {
  success: boolean;
  sessionId: string;
  usage: TokenUsage;
  error?: string;
}

export interface AgentBackend {
  readonly name: string;
  startSession(params: SessionStartParams): Promise<Result<AgentSession, AgentError>>;
  runTurn(session: AgentSession, params: TurnParams): AsyncGenerator<AgentEvent, TurnResult, void>;
  stopSession(session: AgentSession): Promise<Result<void, AgentError>>;
  healthCheck(): Promise<Result<void, AgentError>>;
}

// --- Issue Tracker Client ---

export interface IssueTrackerClient {
  fetchCandidateIssues(): Promise<Result<Issue[], Error>>;
  fetchIssuesByStates(stateNames: string[]): Promise<Result<Issue[], Error>>;
  fetchIssueStatesByIds(issueIds: string[]): Promise<Result<Map<string, Issue>, Error>>;
}

// --- Workflow Config ---

export interface TrackerConfig {
  kind: string;
  endpoint?: string;
  apiKey?: string;
  projectSlug?: string;
  filePath?: string;
  activeStates: string[];
  terminalStates: string[];
}

export interface PollingConfig {
  intervalMs: number;
}

export interface WorkspaceConfig {
  root: string;
}

export interface HooksConfig {
  afterCreate: string | null;
  beforeRun: string | null;
  afterRun: string | null;
  beforeRemove: string | null;
  timeoutMs: number;
}

export interface AgentConfig {
  backend: string;
  command?: string;
  model?: string;
  apiKey?: string;
  maxConcurrentAgents: number;
  maxTurns: number;
  maxRetryBackoffMs: number;
  maxConcurrentAgentsByState: Record<string, number>;
  approvalPolicy?: string;
  sandboxPolicy?: string;
  turnTimeoutMs: number;
  readTimeoutMs: number;
  stallTimeoutMs: number;
}

export interface ServerConfig {
  port: number | null;
}

export interface WorkflowConfig {
  tracker: TrackerConfig;
  polling: PollingConfig;
  workspace: WorkspaceConfig;
  hooks: HooksConfig;
  agent: AgentConfig;
  server: ServerConfig;
}

export interface WorkflowDefinition {
  config: WorkflowConfig;
  promptTemplate: string;
}
