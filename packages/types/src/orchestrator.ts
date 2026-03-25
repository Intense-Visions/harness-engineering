import type { Result } from './result';

// --- Token Usage ---

/**
 * Token usage statistics for an agent turn or session.
 */
export interface TokenUsage {
  /** Number of tokens used in the input (prompt) */
  inputTokens: number;
  /** Number of tokens generated in the output (response) */
  outputTokens: number;
  /** Combined total tokens used */
  totalTokens: number;
  /** Tokens used to create a new cache entry (provider-specific) */
  cacheCreationTokens?: number;
  /** Tokens read from an existing cache entry (provider-specific) */
  cacheReadTokens?: number;
}

// --- Issue Model ---

/**
 * Reference to a blocking issue.
 */
export interface BlockerRef {
  /** Unique ID of the blocker */
  id: string | null;
  /** Human-readable identifier (e.g., "CORE-123") */
  identifier: string | null;
  /** Current state of the blocker */
  state: string | null;
}

/**
 * Representation of a work item (issue/feature) in a tracker.
 */
export interface Issue {
  /** Unique ID in the tracking system */
  id: string;
  /** Human-readable identifier (e.g., "CORE-123") */
  identifier: string;
  /** Title or headline of the issue */
  title: string;
  /** Detailed description, if available */
  description: string | null;
  /** Numerical priority (lower is typically higher priority) */
  priority: number | null;
  /** Current lifecycle state */
  state: string;
  /** Name of the git branch associated with this issue */
  branchName: string | null;
  /** Direct URL to the issue in the tracker */
  url: string | null;
  /** List of labels or tags */
  labels: string[];
  /** References to issues that block this one */
  blockedBy: BlockerRef[];
  /** ISO timestamp of creation */
  createdAt: string | null;
  /** ISO timestamp of last update */
  updatedAt: string | null;
}

// --- Agent Backend Protocol ---

/**
 * Categories of errors that can occur during agent execution.
 */
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

/**
 * Error returned by an agent backend.
 */
export interface AgentError {
  /** Machine-readable category */
  category: AgentErrorCategory;
  /** Human-readable message */
  message: string;
  /** Optional additional context */
  details?: unknown;
}

/**
 * Parameters for starting a new agent session.
 */
export interface SessionStartParams {
  /** Absolute path to the workspace directory */
  workspacePath: string;
  /** Permission level for the agent (e.g., "readonly", "full") */
  permissionMode: string;
  /** List of tool names the agent is allowed to use */
  allowedTools?: string[];
  /** Custom system instructions for the agent */
  systemPrompt?: string;
}

/**
 * Represents an active session with an agent backend.
 */
export interface AgentSession {
  /** Unique ID for the session */
  sessionId: string;
  /** Workspace associated with this session */
  workspacePath: string;
  /** Name of the backend provider */
  backendName: string;
  /** ISO timestamp when the session started */
  startedAt: string;
}

/**
 * Parameters for a single interaction (turn) with an agent.
 */
export interface TurnParams {
  /** ID of the active session */
  sessionId: string;
  /** User or system prompt for this turn */
  prompt: string;
  /** Whether this is a continuation of a previous turn */
  isContinuation: boolean;
}

/**
 * Event emitted by an agent during a turn.
 */
export interface AgentEvent {
  /** Event type (e.g., "thought", "tool_call", "output") */
  type: string;
  /** ISO timestamp */
  timestamp: string;
  /** Optional subtype for finer-grained classification */
  subtype?: string;
  /** Token usage snapshot if available */
  usage?: TokenUsage;
  /** Event payload */
  content?: unknown;
  /** Session ID if not implicit */
  sessionId?: string;
}

/**
 * Result of a completed agent turn.
 */
export interface TurnResult {
  /** Whether the turn completed successfully */
  success: boolean;
  /** ID of the session */
  sessionId: string;
  /** Cumulative usage for this turn */
  usage: TokenUsage;
  /** Error message if success is false */
  error?: string;
}

/**
 * Interface for agent backend implementations (Claude, Mock, etc.)
 */
export interface AgentBackend {
  /** Unique name of the backend */
  readonly name: string;
  /** Starts a new session */
  startSession(params: SessionStartParams): Promise<Result<AgentSession, AgentError>>;
  /** Runs a turn and streams events */
  runTurn(session: AgentSession, params: TurnParams): AsyncGenerator<AgentEvent, TurnResult, void>;
  /** Stops and cleans up a session */
  stopSession(session: AgentSession): Promise<Result<void, AgentError>>;
  /** Verifies connectivity and health */
  healthCheck(): Promise<Result<void, AgentError>>;
}

// --- Issue Tracker Client ---

/**
 * Interface for issue tracking systems (Roadmap, Linear, GitHub, etc.)
 */
export interface IssueTrackerClient {
  /** Fetches issues eligible for agent assignment */
  fetchCandidateIssues(): Promise<Result<Issue[], Error>>;
  /** Fetches issues in specific lifecycle states */
  fetchIssuesByStates(stateNames: string[]): Promise<Result<Issue[], Error>>;
  /** Fetches current state for a set of issue IDs */
  fetchIssueStatesByIds(issueIds: string[]): Promise<Result<Map<string, Issue>, Error>>;
}

// --- Workflow Config ---

/**
 * Configuration for an issue tracker adapter.
 */
export interface TrackerConfig {
  /** Adapter kind (e.g., "roadmap", "linear") */
  kind: string;
  /** API endpoint if applicable */
  endpoint?: string;
  /** API key or token */
  apiKey?: string;
  /** Project slug or identifier */
  projectSlug?: string;
  /** Local file path for file-based trackers */
  filePath?: string;
  /** States considered "ready for work" */
  activeStates: string[];
  /** States considered "finished" */
  terminalStates: string[];
}

/**
 * Polling interval configuration.
 */
export interface PollingConfig {
  /** Interval in milliseconds */
  intervalMs: number;
}

/**
 * Workspace management configuration.
 */
export interface WorkspaceConfig {
  /** Root directory where agent workspaces are created */
  root: string;
}

/**
 * Lifecycle hooks configuration.
 */
export interface HooksConfig {
  /** Script to run after creating a workspace */
  afterCreate: string | null;
  /** Script to run before starting an agent */
  beforeRun: string | null;
  /** Script to run after an agent completes */
  afterRun: string | null;
  /** Script to run before removing a workspace */
  beforeRemove: string | null;
  /** Maximum time allowed for hook execution */
  timeoutMs: number;
}

/**
 * Configuration for the agent runner.
 */
export interface AgentConfig {
  /** Global cooldown in milliseconds after a rate limit hit */
  globalCooldownMs?: number;
  /** Maximum number of requests allowed per minute */
  maxRequestsPerMinute?: number;
  /** Backend type to use */
  backend: string;
  /** Command to launch the agent if applicable */
  command?: string;
  /** Model name/identifier */
  model?: string;
  /** API key for the agent provider */
  apiKey?: string;
  /** Global limit on concurrent agents */
  maxConcurrentAgents: number;
  /** Maximum turns allowed per session */
  maxTurns: number;
  /** Maximum backoff for retries */
  maxRetryBackoffMs: number;
  /** Concurrency limits partitioned by issue state */
  maxConcurrentAgentsByState: Record<string, number>;
  /** Policy for approving tool calls */
  approvalPolicy?: string;
  /** Policy for execution environment isolation */
  sandboxPolicy?: string;
  /** Timeout for a single turn */
  turnTimeoutMs: number;
  /** Timeout for reading from the agent */
  readTimeoutMs: number;
  /** Timeout for agent inactivity */
  stallTimeoutMs: number;
}

/**
 * Internal server configuration.
 */
export interface ServerConfig {
  /** Port to listen on (null to disable) */
  port: number | null;
}

/**
 * Root workflow configuration object.
 */
export interface WorkflowConfig {
  /** Issue tracker settings */
  tracker: TrackerConfig;
  /** Polling loop settings */
  polling: PollingConfig;
  /** Workspace settings */
  workspace: WorkspaceConfig;
  /** Lifecycle hook settings */
  hooks: HooksConfig;
  /** Agent execution settings */
  agent: AgentConfig;
  /** Server settings */
  server: ServerConfig;
}

/**
 * Complete workflow definition including config and prompts.
 */
export interface WorkflowDefinition {
  /** Orchestrator configuration */
  config: WorkflowConfig;
  /** Template used to generate agent prompts */
  promptTemplate: string;
}
