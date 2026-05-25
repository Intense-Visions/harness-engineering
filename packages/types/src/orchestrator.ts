import type { Result } from './result';
import type { ContainerConfig, SecretConfig } from './container';
import type { MaintenanceConfig } from './maintenance';
import type { SessionsConfig } from './sessions';

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
  /** Assignee identity (orchestrator ID, username, etc.), null if unassigned */
  assignee?: string | null;
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
  /**
   * Claims an issue for the given orchestrator by transitioning it to
   * "in-progress" and recording the orchestrator identity. Idempotent
   * if already claimed by the same orchestratorId.
   */
  claimIssue(issueId: string, orchestratorId: string): Promise<Result<void, Error>>;
  /**
   * Releases a previously claimed issue by transitioning it back to an
   * active state and clearing the orchestrator identity.
   */
  releaseIssue(issueId: string): Promise<Result<void, Error>>;
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
  /** Optional random jitter in ms. Each tick offsets by a random value in [-jitterMs, +jitterMs]. Default: 0 */
  jitterMs?: number;
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

// --- Backend Definitions (Spec 2: Multi-Backend Routing) ---

/**
 * Execution-isolation tier a backend (or routing target) provides.
 *
 * Added in Hermes Phase 5 as the fourth axis of {@link BackendRouter}
 * routing (alongside `tier` / `intelligence` / `maintenance|chat`). The
 * tier is also declarable on every {@link BackendDef} so a config can
 * advertise the isolation guarantee a backend provides natively.
 *
 * - `none`: Runs in the orchestrator host process; no boundary.
 * - `container`: Runs inside a container on the orchestrator host (via
 *   the existing {@link import('./container.js').ContainerRuntime}
 *   decorator path).
 * - `remote-sandbox`: Runs on a remote host (SSH backend) or on
 *   ephemeral serverless infrastructure (cold-start per session) —
 *   strongest isolation tier supported.
 */
export type IsolationTier = 'none' | 'container' | 'remote-sandbox';

/**
 * Discriminated union of all backend definitions, keyed by `type`.
 *
 * Used by `agent.backends` (a named map of definitions) and consumed by
 * `BackendRouter` and the backend-instantiation factory (Phase 2+).
 */
export type BackendDef =
  | MockBackendDef
  | ClaudeBackendDef
  | AnthropicBackendDef
  | OpenAIBackendDef
  | GeminiBackendDef
  | LocalBackendDef
  | PiBackendDef
  | SshBackendDef
  | ServerlessBackendDef;

/** Mock backend (used in tests and dry runs). */
export interface MockBackendDef {
  type: 'mock';
  /** Native isolation tier this backend provides. Defaults to `'none'`. */
  isolation?: IsolationTier;
}

/** Claude CLI subprocess backend (subscription-based, no token billing). */
export interface ClaudeBackendDef {
  type: 'claude';
  /** Override for the `claude` CLI binary path. */
  command?: string;
  /** Native isolation tier this backend provides. Defaults to `'none'`. */
  isolation?: IsolationTier;
}

/** Anthropic API backend (token-billed). */
export interface AnthropicBackendDef {
  type: 'anthropic';
  model: string;
  apiKey?: string;
  /** Native isolation tier this backend provides. Defaults to `'none'`. */
  isolation?: IsolationTier;
}

/** OpenAI API backend (token-billed). */
export interface OpenAIBackendDef {
  type: 'openai';
  model: string;
  apiKey?: string;
  /** Native isolation tier this backend provides. Defaults to `'none'`. */
  isolation?: IsolationTier;
}

/** Google Gemini API backend (token-billed). */
export interface GeminiBackendDef {
  type: 'gemini';
  model: string;
  apiKey?: string;
  /** Native isolation tier this backend provides. Defaults to `'none'`. */
  isolation?: IsolationTier;
}

/** OpenAI-compatible local backend (LM Studio, Ollama, vLLM, etc.). */
export interface LocalBackendDef {
  type: 'local';
  endpoint: string;
  /** Model name(s). Array form supports fallback resolution (Spec 1). */
  model: string | string[];
  apiKey?: string;
  /** Per-request timeout in ms. Default: 90_000. */
  timeoutMs?: number;
  /** Probe interval in ms for resolver. Default: 30_000. Minimum: 1_000. */
  probeIntervalMs?: number;
  /** Native isolation tier this backend provides. Defaults to `'none'`. */
  isolation?: IsolationTier;
}

/** Pi-coding-agent backend pointing at a local OpenAI-compatible server. */
export interface PiBackendDef {
  type: 'pi';
  endpoint: string;
  model: string | string[];
  apiKey?: string;
  /** Per-request timeout in ms. Default: 90_000. */
  timeoutMs?: number;
  /** Probe interval in ms for resolver. Default: 30_000. Minimum: 1_000. */
  probeIntervalMs?: number;
  /** Native isolation tier this backend provides. Defaults to `'none'`. */
  isolation?: IsolationTier;
}

/**
 * SSH agent dispatch backend (Hermes Phase 5).
 *
 * Spawns the agent process on a remote host over an SSH transport using
 * the operator's existing `ssh` binary (and therefore the operator's
 * `~/.ssh/config`). The remote host must already have the agent CLI
 * installed and any model API keys configured locally — the orchestrator
 * does not push secrets over SSH.
 */
export interface SshBackendDef {
  type: 'ssh';
  /** Remote host. Must not contain shell metacharacters. */
  host: string;
  /** SSH user, if not embedded in `host`. */
  user?: string;
  /** SSH port. Defaults to 22. */
  port?: number;
  /** Identity file path passed to `ssh -i`. */
  identityFile?: string;
  /** Remote command (the agent CLI invocation) — JSON-lines protocol expected. */
  remoteCommand: string;
  /** Additional `-o key=value` SSH options. Each entry is the literal `key=value`. */
  sshOptions?: string[];
  /** Path to the `ssh` binary on the orchestrator host. Defaults to `'ssh'`. */
  sshBinary?: string;
  /** Native isolation tier. Defaults to `'remote-sandbox'`. */
  isolation?: IsolationTier;
}

/**
 * Serverless agent dispatch backend (Hermes Phase 5).
 *
 * Cold-starts a stateless container per session, runs turns inside it,
 * and tears it down on session stop. The `adapter` discriminant selects
 * the concrete provider; Phase 5 ships only `'oci'` (OCI-image runner
 * via `docker` or `podman`). Future adapters (`'modal'`, `'daytona'`,
 * `'vercel'`) plug in behind the same shape.
 */
export interface ServerlessBackendDef {
  type: 'serverless';
  /** Concrete adapter. Phase 5 ships only `'oci'`. */
  adapter: 'oci';
  /** OCI image reference, including tag (e.g., `ghcr.io/.../agent:0.1.0`). */
  image: string;
  /** Optional registry override (passed to `docker pull` when applicable). */
  registry?: string;
  /** Image-pull policy. Defaults to `'if-not-present'`. */
  pullPolicy?: 'always' | 'if-not-present' | 'never';
  /** Environment variable names from the orchestrator process to forward into the container. */
  envPassthrough?: string[];
  /** OCI runtime binary (`'docker'` or `'podman'`). Defaults to `'docker'`. */
  runtime?: 'docker' | 'podman';
  /** Native isolation tier. Defaults to `'remote-sandbox'`. */
  isolation?: IsolationTier;
}

/**
 * Routing configuration mapping use cases to named backends.
 *
 * Required: `default`. Optional: per-tier overrides and intelligence-layer
 * overrides. Unknown keys are validation errors (`.strict()`).
 *
 * Spec B Phase 0: scalar fields widened from `string` to {@link RoutingValue}
 * (`string | readonly [string, ...string[]]`) so each routing target can
 * be either a single backend name (pre-Spec-B, byte-identical behavior)
 * or an ordered fallback chain. Phase 1 wires `BackendRouter.resolve()`
 * to walk the chain; Phase 0 ships the type only.
 */
export interface RoutingConfig {
  /** Backend name (or fallback chain) used when no specific rule matches. Required. */
  default: RoutingValue;
  'quick-fix'?: RoutingValue;
  'guided-change'?: RoutingValue;
  'full-exploration'?: RoutingValue;
  diagnostic?: RoutingValue;
  intelligence?: {
    sel?: RoutingValue;
    pesl?: RoutingValue;
  };
  /**
   * Isolation-tier routing (Hermes Phase 5).
   *
   * Maps each isolation tier to a backend name (or fallback chain). A
   * task that needs a particular execution boundary (e.g.
   * `remote-sandbox` for an untrusted external code execution) issues a
   * `{ kind: 'isolation', tier }` query; the router returns the
   * configured name, falling back to {@link RoutingConfig.default} when
   * the tier is not mapped.
   */
  isolation?: {
    none?: RoutingValue;
    container?: RoutingValue;
    'remote-sandbox'?: RoutingValue;
  };
  /**
   * Per-skill routing (Spec B D1/D3). Keys are skill names from the
   * local skill catalog; values are backend names or fallback chains.
   * Phase 0 ships the type; Phase 1 wires `BackendRouter.resolve()` to
   * consult this map for `{ kind: 'skill', skillName }` use cases.
   */
  skills?: Record<string, RoutingValue>;
  /**
   * Per-cognitive-mode routing (Spec B D1/D3). Keys are cognitive-mode
   * identifiers (typically values from `STANDARD_COGNITIVE_MODES`);
   * values are backend names or fallback chains. Phase 0 ships the type;
   * Phase 1 wires `BackendRouter.resolve()` to consult this map after
   * `skills` and before `tier`.
   */
  modes?: Record<string, RoutingValue>;
}

// --- Spec B: Granular Task→Backend Routing (Phase 0 — types-only) ---

/**
 * A routing target: either a single backend name (scalar) or an ordered
 * fallback chain (non-empty tuple). Scalar form is byte-compatible with
 * pre-Spec-B configs; the array form is consumed by `BackendRouter.resolve()`
 * which tries each entry in order until an existing backend is found
 * (full chain walk lands in Phase 1).
 *
 * @example scalar form
 *   routing.default: 'claude-opus'
 *
 * @example fallback chain
 *   routing.skills.harness-debugging: ['local-fast', 'claude-sonnet']
 */
export type RoutingValue = string | readonly [string, ...string[]];

/**
 * One step in the ordered walk performed by `BackendRouter.resolve()` to
 * pick a backend for a {@link RoutingUseCase}. Phase 0 ships the type;
 * Phase 1 wires the resolver to emit `ResolutionStep[]`.
 */
export type ResolutionSource = 'invocation' | 'skill' | 'mode' | 'tier' | 'default';

/**
 * Single candidate considered during routing resolution.
 *
 * - `chosen`   — first candidate whose backend exists in `agent.backends`; ends the walk.
 * - `unknown-backend` — candidate references a backend not in `agent.backends`; walk continues.
 * - `considered` — reserved for future use (e.g., health-aware skip in a later spec).
 */
export interface ResolutionStep {
  source: ResolutionSource;
  candidate: string;
  outcome: 'chosen' | 'unknown-backend' | 'considered';
}

/**
 * Record of a single `BackendRouter.resolve()` invocation: the use case,
 * the ordered candidates considered, the chosen backend, and timing.
 *
 * NOTE: this is the Spec B `RoutingDecision`. The pre-Spec-B type of the
 * same name (the `routeIssue()` action result) has been renamed to
 * {@link IssueRoutingDecision}.
 */
export interface RoutingDecision {
  /** ISO-8601 timestamp the resolver ran. */
  timestamp: string;
  /** The use case that was resolved. */
  useCase: RoutingUseCase;
  /** Ordered candidates considered during the walk. */
  resolutionPath: ResolutionStep[];
  /** The selected backend's name (key in `agent.backends`). */
  backendName: string;
  /** The selected backend's `type` discriminant, copied for telemetry convenience. */
  backendType: BackendDef['type'];
  /** Wall-clock duration of the resolve() call in milliseconds. */
  durationMs: number;
}

/**
 * Discriminated union describing a single routing query (Spec 2 §3 / SC16-SC21).
 *
 * Consumed by `BackendRouter.resolve(useCase)` and
 * `BackendRouter.resolveDefinition(useCase)`. Extensible — new use-case
 * kinds (e.g., `agentic-tool`) can be added without breaking existing
 * callers, since unknown kinds are not constructible.
 *
 * Spec B Phase 0 adds `skill` and `mode` variants — consumed by Phase 1's
 * resolver rewrite. Until then, `BackendRouter.resolve()` falls these
 * through to `routing.default`.
 */
export type RoutingUseCase =
  | { kind: 'tier'; tier: ScopeTier }
  | { kind: 'intelligence'; layer: 'sel' | 'pesl' }
  | { kind: 'maintenance' }
  | { kind: 'chat' }
  | { kind: 'isolation'; tier: IsolationTier }
  // --- Spec B Phase 0 (consumed by resolver in Phase 1) ---
  | { kind: 'skill'; skillName: string; cognitiveMode?: string }
  | { kind: 'mode'; cognitiveMode: string };

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
  /** Model name(s) for local backend. String form is normalized to a 1-element array internally. Non-empty array required when array form is used. */
  localModel?: string | string[];
  /** Endpoint URL for local backend (e.g., http://localhost:11434/v1) */
  localEndpoint?: string;
  /** API key for local backend (some servers require a dummy key) */
  localApiKey?: string;
  /** Request timeout in ms for local backend calls (default: 90000) */
  localTimeoutMs?: number;
  /** Probe interval in ms for local model availability (default: 30_000, minimum: 1_000). */
  localProbeIntervalMs?: number;
  /** Escalation routing configuration */
  escalation?: Partial<EscalationConfig>;
  /**
   * Named backend definitions (Spec 2). When set, the legacy
   * `backend` / `localBackend` / `localEndpoint` / `localModel` /
   * `localApiKey` / `localTimeoutMs` / `localProbeIntervalMs` fields
   * are ignored (with a deprecation warning). When unset, the
   * orchestrator synthesizes this map at startup from the legacy
   * fields via `migrateAgentConfig()`.
   */
  backends?: Record<string, BackendDef>;
  /**
   * Routing rules mapping use cases to backend names (Spec 2). Required
   * when `backends` is set. Synthesized by `migrateAgentConfig()` for
   * legacy configs.
   */
  routing?: RoutingConfig;
  /** Container execution configuration (used when sandboxPolicy is 'docker') */
  container?: ContainerConfig;
  /** Secret injection configuration */
  secrets?: SecretConfig;
}

/**
 * Snapshot of local-model availability, exposed to the dashboard and consumers.
 *
 * @remarks
 * Produced by `LocalModelResolver.getStatus()`. Field semantics:
 * - `available` flips true when at least one configured candidate appears in `detected`.
 * - `resolved` is the first match in `configured` order; `null` when `available` is false.
 * - `detected` is the list of model IDs returned by the most recent successful probe;
 *   it retains its previous value across transient probe failures.
 * - `lastError` is non-null when the most recent probe attempt failed (network, timeout,
 *   non-2xx, malformed body). An empty `detected` array on a successful probe is NOT an error.
 */
export interface LocalModelStatus {
  /** True when at least one configured candidate is loaded on the server. */
  available: boolean;
  /** The currently selected model ID, or null when none matched. */
  resolved: string | null;
  /** Configured candidate list, normalized to array. */
  configured: string[];
  /** Model IDs returned by the last successful probe. */
  detected: string[];
  /** ISO timestamp of the last successful probe, null if never succeeded. */
  lastProbeAt: string | null;
  /** Last probe error message, null when healthy. */
  lastError: string | null;
  /** Human-readable warnings (empty when healthy). */
  warnings: string[];
}

/**
 * Per-backend snapshot of local-model availability. Adds `backendName`
 * and `endpoint` to identify which local backend the status is for in
 * multi-local configurations (Spec 2).
 *
 * Returned by `GET /api/v1/local-models/status` and the SSE
 * `local-model:status` topic (payload widened in Phase 5).
 */
export interface NamedLocalModelStatus extends LocalModelStatus {
  /** The key in `agent.backends` this status corresponds to. */
  backendName: string;
  /** The endpoint URL this backend probes. */
  endpoint: string;
}

/**
 * Internal server configuration.
 */
export interface ServerConfig {
  /** Port to listen on (null to disable) */
  port: number | null;
}

/**
 * Phase 5: OTLP/HTTP trace exporter configuration. When present and
 * `enabled !== false`, the orchestrator instantiates an OTLPExporter
 * targeting `endpoint` and wires it into the telemetry fanout.
 *
 * Schema enforcement lives in `@harness-engineering/cli` (config/schema.ts).
 * This is the structural shape consumed at runtime by `orchestrator.ts`.
 */
export interface OTLPExportConfig {
  endpoint: string;
  enabled?: boolean;
  headers?: Record<string, string>;
  flushIntervalMs?: number;
  batchSize?: number;
}

export interface TelemetryWorkflowConfig {
  /** OTLP/HTTP trace exporter wiring. Omit to disable export entirely. */
  export?: { otlp?: OTLPExportConfig };
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
  /** Scheduled maintenance settings */
  maintenance?: MaintenanceConfig;
  /** Phase 5: telemetry export wiring (OTLP/HTTP traces). */
  telemetry?: TelemetryWorkflowConfig;
  /** Session search + LLM summarization on archive. */
  sessions?: SessionsConfig;
  /**
   * Notification sinks (Slack-first). When present + non-empty,
   * orchestrator boot constructs a `SinkRegistry` from this section and wires
   * `wireNotificationSinks` against the orchestrator's event bus.
   */
  notifications?: import('./notifications').NotificationsConfig;
  /** Optional stable identity for this orchestrator instance. Auto-generated if omitted. */
  orchestratorId?: string;
}

/**
 * Complete workflow definition including config and prompts.
 */
export interface WorkflowDefinition {
  /** Orchestrator configuration */
  config: WorkflowConfig;
  /** Template used to generate agent prompts */
  promptTemplate: string;
  /**
   * Non-blocking warnings produced during config validation. Loaded by
   * `WorkflowLoader.loadWorkflow`. Spec B Phase 2 / S3: contains
   * warnings about `routing.skills` / `routing.modes` entries that are
   * SYNTACTICALLY valid but reference unknown skill names / cognitive
   * modes. CLI loaders surface these via `logger.warn` after a
   * successful load.
   */
  warnings: readonly string[];
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
 * Result of the `routeIssue()` pure function in `packages/orchestrator/src/core/model-router.ts`.
 *
 * Renamed from `RoutingDecision` to `IssueRoutingDecision` in Spec B Phase 0 to
 * free the `RoutingDecision` name for the resolver-walk record produced by
 * `BackendRouter.resolve()` (see {@link RoutingDecision} below).
 */
export type IssueRoutingDecision =
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
