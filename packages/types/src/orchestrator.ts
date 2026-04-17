import type { Result } from './result';
import type { ContainerConfig, SecretConfig } from './container';

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
  /** Relative path to the spec file, or null if none */
  spec: string | null;
  /** Relative paths to plan files */
  plans: string[];
  /** ISO timestamp of creation */
  createdAt: string | null;
  /** ISO timestamp of last update */
  updatedAt: string | null;
  /** External tracker ID (e.g., "github:owner/repo#42"), null if not synced */
  externalId: string | null;
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
  /**
   * Marks an issue as complete in the underlying tracker by transitioning it
   * to a terminal state. Called by the orchestrator after a successful agent
   * exit so the issue is no longer returned by `fetchCandidateIssues` on
   * subsequent ticks (and across restarts). Adapters that cannot write —
   * e.g., a read-only file or remote tracker without auth — should return
   * `Ok` (no-op) rather than `Err`, so completion semantics are preserved
   * in-process via `OrchestratorState.completed`.
   */
  markIssueComplete(issueId: string): Promise<Result<void, Error>>;
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
  /**
   * Git ref to base new worktrees on. When unset, the orchestrator attempts
   * to resolve the repository's default branch (via `origin/HEAD`, then
   * `origin/main`, `origin/master`, `main`, `master`), falling back to the
   * current `HEAD`. Set explicitly to opt out of auto-detection (e.g. to
   * branch agents off a long-running integration branch).
   */
  baseRef?: string;
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
  /** Maximum number of requests allowed per second */
  maxRequestsPerSecond?: number;
  /** Maximum number of input tokens allowed per minute */
  maxInputTokensPerMinute?: number;
  /** Maximum number of output tokens allowed per minute */
  maxOutputTokensPerMinute?: number;
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
  /** Maximum retry attempts before escalating (default: 5, 0 = unlimited) */
  maxRetries: number;
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
  /** Local backend type */
  localBackend?: 'openai-compatible' | 'pi';
  /** Model name for local backend */
  localModel?: string;
  /** Endpoint URL for local backend (e.g., http://localhost:11434/v1) */
  localEndpoint?: string;
  /** API key for local backend (some servers require a dummy key) */
  localApiKey?: string;
  /** Request timeout in ms for local backend calls (default: 90000) */
  localTimeoutMs?: number;
  /** Escalation routing configuration */
  escalation?: Partial<EscalationConfig>;
  /** Container execution configuration (used when sandboxPolicy is 'docker') */
  container?: ContainerConfig;
  /** Secret injection configuration */
  secrets?: SecretConfig;
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
  /** Intelligence pipeline settings */
  intelligence?: IntelligenceConfig;
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

// --- Model Routing ---

/**
 * Scope tier determines the routing default for an issue.
 * Detected from plan/spec presence or label override.
 */
export type ScopeTier = 'quick-fix' | 'guided-change' | 'full-exploration' | 'diagnostic';

/**
 * A concern signal that may gate routing for signal-gated scope tiers.
 */
export interface ConcernSignal {
  /** Machine-readable signal name (e.g., 'highComplexity', 'securitySensitive') */
  name: string;
  /** Human-readable reason */
  reason: string;
}

/**
 * Result of the routeIssue() pure function.
 */
export type RoutingDecision =
  | { action: 'dispatch-local' }
  | { action: 'dispatch-primary' }
  | { action: 'needs-human'; reasons: string[] };

/**
 * Configuration for escalation routing behavior.
 */
export interface EscalationConfig {
  /** Scope tiers that always escalate to human (default: ['full-exploration']) */
  alwaysHuman: ScopeTier[];
  /** Scope tiers that always dispatch to local backend (default: ['quick-fix', 'diagnostic']) */
  autoExecute: ScopeTier[];
  /** Scope tiers that always dispatch to the primary backend (default: []) */
  primaryExecute: ScopeTier[];
  /** Scope tiers that dispatch locally only when no concern signals fire (default: ['guided-change']) */
  signalGated: ScopeTier[];
  /** Max retries for diagnostic issues before escalating (default: 1) */
  diagnosticRetryBudget: number;
}

/**
 * Configuration for the intelligence pipeline (SEL/CML/PESL).
 *
 * When `provider` is omitted, the pipeline derives its LLM connection
 * from the orchestrator's existing `agent` backend config (same API key,
 * same provider). This is the recommended setup — no separate API key needed.
 */
export interface IntelligenceConfig {
  /** Whether the intelligence pipeline is enabled */
  enabled: boolean;
  /**
   * Explicit LLM provider override. When omitted, uses the orchestrator's
   * agent backend config (agent.apiKey, agent.backend).
   */
  provider?: {
    kind: 'anthropic' | 'openai-compatible' | 'claude-cli';
    apiKey?: string;
    baseUrl?: string;
  };
  /** Per-layer model assignments (defaults to the agent's configured model) */
  models?: {
    sel?: string;
    cml?: string;
    pesl?: string;
  };
  /** Request timeout in ms for intelligence LLM calls (default: 90000) */
  requestTimeoutMs?: number;
  /**
   * String appended to user prompts for structured-output requests.
   * Use to disable thinking/reasoning in models that enable it by default
   * (e.g., '/no_think' for Qwen3, '<think>\n</think>' for DeepSeek-R1).
   */
  promptSuffix?: string;
  /** How long to cache analysis failures before retrying, in ms (default: 300000) */
  failureCacheTtlMs?: number;
  /**
   * Number of consecutive connection errors before the pipeline short-circuits
   * and skips remaining issues for the current tick. Default: 2.
   */
  circuitBreakerThreshold?: number;
  /**
   * Whether to send `response_format: { type: 'json_schema' }` with the full
   * schema for grammar-constrained decoding. Disable for models that hang with
   * JSON grammar constraints (e.g., Qwen3 on Ollama). Default: true.
   */
  jsonMode?: boolean;
}
