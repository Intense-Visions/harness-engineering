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
  /**
   * Repo-relative paths to seed into a freshly-created worktree by copying
   * them from the orchestrator's root working tree.
   *
   * New worktrees are based on a committed remote ref (e.g. `origin/main`), so
   * they do NOT inherit uncommitted artifacts that live only in the root
   * working tree. The brainstorm → orchestrator handoff produces exactly such
   * artifacts: a proposal under `.harness/proposals/` and a promoted row in
   * the roadmap aggregate, both written uncommitted. Without seeding, a dispatched
   * agent sees a roadmap entry but cannot find its proposal and stalls.
   *
   * When unset, defaults to seeding `.harness/proposals` and the roadmap
   * aggregate. Each
   * path is copied best-effort: missing sources are skipped and copy failures
   * never block dispatch. Set explicitly to override (e.g. a non-default
   * roadmap location).
   */
  seedPaths?: string[];
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

// --- AMR Phase 1: provider-neutral backend capability metadata (D1) ---
// Additive + optional on every BackendDef member. Existing configs validate
// and behave byte-identically (SC8/SC19). Tier resolution lives in the AMR
// layer only; RoutingValue/RoutingConfig are NOT widened (S5-002/D2).

/** Capability bar a backend clears. Cheap→capable, never local-vs-cloud. */
export type CapabilityTier = 'fast' | 'standard' | 'strong';

/** Privacy guarantee a backend provides. Ordered floor: on-device is strongest. */
export type PrivacyClass = 'on-device' | 'pooled-isolated' | 'byo-endpoint' | 'shared-cloud';

/** Provider-neutral capability block attached (optionally) to a BackendDef. */
export interface BackendCapabilities {
  tier: CapabilityTier;
  /** USD per 1k blended tokens; 0 for operator-local. Drives min-cost selection. */
  costPer1kTokens: number;
  privacyClass: PrivacyClass;
  contextWindow: number;
  vision?: boolean;
  toolUse?: boolean;
}

/** Backend name → capabilities. Consumed by selectCheapestQualifying (AMR). */
export type BackendCapabilityRegistry = ReadonlyMap<string, BackendCapabilities>;

// --- AMR Phase 2: complexity cascade + routing policy (types-only) ---
// Additive. Existing configs validate and behave byte-identically (SC8/SC19).
// The complexity cascade + pure deriveRequiredTier consume these shapes; the
// LLM may set level/confidence but the tier is always TS-derived (D3).

/** Complexity band of a single invocation (D3). Ordered trivial→complex. */
export type ComplexityLevel = 'trivial' | 'simple' | 'moderate' | 'complex';

/** Confidence-rated verdict, shaped like the eval verdicts (D3). The LLM may set
 *  `level`/`confidence`; the tier is always derived in TS (never trusted from the LLM). */
export interface ComplexityVerdict {
  level: ComplexityLevel;
  confidence: 'high' | 'medium' | 'low';
  /** blastRadius, filesTouched, layersTouched, specExists, ... */
  signals: Record<string, number | boolean | string>;
  source: 'static' | 'llm-tiebreak' | 'escalated';
}

/** Per-invocation risk facets fed to deriveRequiredTier (D5). */
export interface RoutingRisk {
  blastRadius: number;
  sensitivePath: boolean;
  layer?: string;
  publicApi?: boolean;
}

/**
 * Pre-diff text-only signals the orchestrator knows about a unit at dispatch
 * time, BEFORE any diff exists (S3-001 phase-awareness). Threaded on the
 * RoutingRequest so the live classifier seam can score real task difficulty
 * without fabricating diff-based signals (no fake blast-radius pre-diff). Absent
 * ⇒ the classifier degrades to a conservative verdict (D4). Additive/optional:
 * existing requests validate and behave byte-identically (SC8/SC19).
 */
export interface RoutingTaskText {
  /** Length of the task's title + description (chars). Drives the static pass. */
  descriptionLength: number;
  /** A spec file is attached to the unit — a well-scoped signal that LOWERS complexity. */
  specExists: boolean;
  /** Acceptance criteria look measurable — a well-scoped signal that LOWERS complexity. */
  acceptanceMeasurable: boolean;
  /** Free-text prompt for the optional LLM tie-break (title + description). */
  prompt: string;
}

/** Decision vector fed to the AMR layer. `complexity` absent ⇒ classifier runs (Phase 3). */
export interface RoutingRequest {
  useCase: RoutingUseCase;
  complexity?: ComplexityVerdict;
  risk?: RoutingRisk;
  capabilities?: { needsVision?: boolean; needsToolUse?: boolean; minContextTokens?: number };
  coherenceUnit?: string;
  /**
   * Pre-diff text signals for the LIVE complexity classifier (S3-001). Populated
   * at the dispatch call site from what the orchestrator knows about the unit;
   * consumed by the classify seam. Absent ⇒ conservative fallback (D4).
   */
  taskText?: RoutingTaskText;
  /**
   * split-routing D8(a): a caller-supplied required-tier floor for THIS request,
   * used by the workflow engine's one-shot per-stage retry to route the retry at
   * a bumped tier (`nextTier(prior tier)`) WITHOUT mutating the cumulative
   * EscalationState floor. `route()` takes the max-by-rank of this and the unit's
   * escalation floor. Additive/optional: absent ⇒ `route()` behaves byte-
   * identically to today (SC8), so all existing routing paths are unaffected.
   */
  floor?: CapabilityTier;
}

/**
 * AMR routing failure (D10). `privacy-no-match` mirrors the capability-registry
 * fail-closed signal; `escalation-exhausted` is raised when a coherence unit's
 * vertical escalation floor is already `strong` and re-crosses the failure
 * threshold — the router emits it (bus/logger) for steward escalation.
 */
export class RoutingError extends Error {
  constructor(
    readonly code: 'privacy-no-match' | 'escalation-exhausted' | 'budget-exhausted',
    message: string
  ) {
    super(message);
    this.name = 'RoutingError';
  }
}

/** Injected spend snapshot (D8/S1-001) — keeps deriveRequiredTier pure. */
export interface BudgetSnapshot {
  spentUsd: number;
}

/**
 * Policy block injected per orchestrator (Phase 2/3 scope only). Tenant/Shuttle
 * fields arrive in Phase 5 — `allowedProviders` (below) is the first, pushed by
 * the Shuttle control plane via `PUT /api/v1/routing/policy`.
 */
export interface RoutingPolicy {
  /** (complexity level) → required tier. Defaults provided in code; overridable. */
  complexityTierMatrix?: Partial<Record<ComplexityLevel, CapabilityTier>>;
  /** Per-skill/phase required-tier override, evaluated before the matrix. */
  skillTierOverrides?: Record<string, CapabilityTier>;
  privacyFloor?: PrivacyClass;
  budget?: {
    capUsd: number;
    /** clamp tier down one step at this % of cap; default 90 (D8). */
    degradeAtPct?: number;
    onBudgetExhausted: 'degrade' | 'pause' | 'human';
  };
  /** globs → blast-radius veto (D5). */
  sensitivePaths?: string[];
  /** consecutive quality failures before tier bump; default 2 (D10, consumed Phase 4). */
  escalationThreshold?: number;
  /**
   * AMR 4c (v2): opt-in LLM spec-satisfaction verdict fed into single-agent
   * escalation on a NORMAL exit, ALONGSIDE the always-on baseline-relative
   * security-defect feeder. Off unless `enabled: true` — it is heavy (one model
   * call + latency per exit), so it is gated separately from the cheap security
   * scan. Conservative by construction: only a high-confidence NOT_SATISFIED
   * outcome-eval verdict escalates (`quality-fail`); SATISFIED / INCONCLUSIVE
   * / any lower-confidence verdict, a missing spec, or an unavailable model
   * provider is neutral (never a premature `quality-pass`).
   */
  acceptanceEval?: {
    enabled: boolean;
    /** Override model for the eval call; defaults to the SEL intelligence layer. */
    model?: string;
  };
  /**
   * AMR Phase 5 (D3): provider-type allowlist. When present and non-empty, tier
   * selection considers only backends whose `type` is in this set (fail-closed
   * if it empties the qualifying set). Absent/empty → all backends eligible.
   * Pushed by the Shuttle control plane; wired through `selectCheapestQualifying`'s
   * `allowed` constraint.
   */
  allowedProviders?: BackendDef['type'][];
}

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
  | OllamaBackendDef
  | CodexBackendDef
  | SshBackendDef
  | ServerlessBackendDef;

/**
 * Codex CLI backend driving a LOCAL model (Ollama / LM Studio) via
 * `codex exec --oss --local-provider <provider> -m <model>`. Unlike the endpoint
 * backends it owns no turn loop — `codex exec` runs the whole agentic session in
 * one invocation. Adopted after a controlled experiment showed Codex's apply_patch
 * scaffold converges a local model where the bespoke OllamaBackend loop stalled.
 */
export interface CodexBackendDef {
  type: 'codex';
  /** The local model Codex drives, e.g. `'qwen3-coder:30b'`. Array ⇒ prefer-fallback. */
  model: string | string[];
  /** Local model provider Codex uses. Default `'ollama'`. */
  localProvider?: 'ollama' | 'lmstudio';
  /** Override for the `codex` CLI binary. Default `'codex'`. */
  command?: string;
  /** Hard wall-clock cap per session in ms. Default 1_800_000 (30min). */
  timeoutMs?: number;
  /**
   * MCP servers exposed to the codex-driven local model, injected per-invocation via
   * `-c mcp_servers.<name>.…` (never written to the user's global `~/.codex/config.toml`).
   * Each spec's `tools` allowlist maps to codex's per-server `enabled_tools`. Mirrors the
   * ollama path's `mcpServers` so the codex path gets tool-parity (context7 live docs +
   * curated harness read tools). Absent ⇒ codex built-in tools only.
   */
  mcpServers?: McpServerSpec[];
  /** Native isolation tier this backend provides. Defaults to `'none'`. */
  isolation?: IsolationTier;
  /** AMR Phase 1 (D1): optional capability block for tier selection. */
  capabilities?: BackendCapabilities;
}

/** Mock backend (used in tests and dry runs). */
export interface MockBackendDef {
  type: 'mock';
  /** Native isolation tier this backend provides. Defaults to `'none'`. */
  isolation?: IsolationTier;
  /** AMR Phase 1 (D1): optional capability block for tier selection. */
  capabilities?: BackendCapabilities;
}

/** Claude CLI subprocess backend (subscription-based, no token billing). */
export interface ClaudeBackendDef {
  type: 'claude';
  /** Override for the `claude` CLI binary path. */
  command?: string;
  /** Native isolation tier this backend provides. Defaults to `'none'`. */
  isolation?: IsolationTier;
  /** AMR Phase 1 (D1): optional capability block for tier selection. */
  capabilities?: BackendCapabilities;
}

/** Anthropic API backend (token-billed). */
export interface AnthropicBackendDef {
  type: 'anthropic';
  model: string;
  apiKey?: string;
  /** Native isolation tier this backend provides. Defaults to `'none'`. */
  isolation?: IsolationTier;
  /** AMR Phase 1 (D1): optional capability block for tier selection. */
  capabilities?: BackendCapabilities;
}

/** OpenAI API backend (token-billed). */
export interface OpenAIBackendDef {
  type: 'openai';
  model: string;
  apiKey?: string;
  /** Native isolation tier this backend provides. Defaults to `'none'`. */
  isolation?: IsolationTier;
  /** AMR Phase 1 (D1): optional capability block for tier selection. */
  capabilities?: BackendCapabilities;
}

/** Google Gemini API backend (token-billed). */
export interface GeminiBackendDef {
  type: 'gemini';
  model: string;
  apiKey?: string;
  /** Native isolation tier this backend provides. Defaults to `'none'`. */
  isolation?: IsolationTier;
  /** AMR Phase 1 (D1): optional capability block for tier selection. */
  capabilities?: BackendCapabilities;
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
  /** AMR Phase 1 (D1): optional capability block for tier selection. */
  capabilities?: BackendCapabilities;
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
  /** AMR Phase 1 (D1): optional capability block for tier selection. */
  capabilities?: BackendCapabilities;
}

/**
 * Native Ollama agentic backend pointing at an Ollama OpenAI-compatible server.
 *
 * Unlike the `pi` backend (which embeds the pi-coding-agent SDK), this backend
 * owns its agentic tool loop: it drives `/v1/chat/completions` directly, parses
 * native `tool_calls`, executes `bash`/`write_file`/`read_file` inside the
 * workspace, and appends tool results until the model stops calling tools. The
 * pi/codex SDKs fail against Ollama-served tool-calling models (empty
 * completions / rejected tool calls) where this harness-owned driver succeeds.
 */
/**
 * A single MCP server the OllamaBackend agent may connect to. The agent spawns
 * `command` (with `args`/`env`) over stdio, lists its tools, and exposes them to
 * the model namespaced as `<name>__<tool>`. `cwd` defaults to the session
 * workspace so code-intelligence servers (e.g. `harness-mcp`) operate on the
 * agent's worktree, not the daemon's repo.
 */
export interface McpServerSpec {
  /** Server label; becomes the `<name>__` tool namespace prefix (sanitized). */
  name: string;
  /** Executable to spawn over stdio (e.g. `npx`, `harness-mcp`). */
  command: string;
  /** Arguments passed to `command`. */
  args?: string[];
  /** Extra environment for the spawned process. */
  env?: Record<string, string>;
  /** Working directory; defaults to the session `workspacePath`. */
  cwd?: string;
  /**
   * Per-server tool allowlist (pre-namespacing tool names). When present, only
   * these tools are aggregated from the server; absent ⇒ all tools (byte-identical
   * to prior behavior). Narrows a broad server (e.g. `harness-mcp`'s ~95 tools) to
   * a high-value set so a local model is not overwhelmed by choice.
   */
  tools?: string[];
}

export interface OllamaBackendDef {
  type: 'ollama';
  /** Ollama OpenAI-compatible base URL (e.g., `http://127.0.0.1:11434/v1`). */
  endpoint: string;
  /** Model name(s). Array form supports prefer-fallback resolution. */
  model: string | string[];
  apiKey?: string;
  /** Per-request timeout in ms for each chat-completion call. Default: 600_000. */
  timeoutMs?: number;
  /** Maximum inner agentic-loop iterations per `runTurn`. Default: 50. */
  maxTurnsPerRun?: number;
  /**
   * Append ` /no_think` to each user turn so reasoning models (Qwen3 family)
   * skip `<think>` traces. Ollama's `/v1` ignores `reasoning:false`, so this is
   * the reliable off-switch; without it a reasoning model never emits a tool
   * call. Default: false.
   */
  disableReasoning?: boolean;
  /** Explicit context-window override (tokens). Set ⇒ autosizing is skipped. */
  numCtx?: number;
  /** Hardware-derived context cap (tokens) injected by the orchestrator wiring; the backend never imports local-models. */
  maxContextTokens?: number;
  /** Output-token budget (`num_predict`). Unset ⇒ model default. */
  numPredict?: number;
  /**
   * Sampling temperature (native `/api/chat` `options.temperature`). Unset ⇒
   * Ollama model default (~0.8). Precise agentic coding benefits from a lower
   * value — Qwen guidance for thinking-mode coding is 0.6.
   */
  temperature?: number;
  /** Nucleus sampling `top_p`. Unset ⇒ model default. Qwen coding guidance: 0.95. */
  topP?: number;
  /** `top_k` sampling. Unset ⇒ model default. Qwen coding guidance: 20. */
  topK?: number;
  /** Keep the sized model warm between turns (`keep_alive`). Default `'10m'`. */
  keepAlive?: string;
  /**
   * MCP servers whose tools are merged into the model's tool set (opt-in
   * allowlist). Absent/empty ⇒ built-ins only (byte-identical to today).
   */
  mcpServers?: McpServerSpec[];
  /** Native isolation tier this backend provides. Defaults to `'none'`. */
  isolation?: IsolationTier;
  /** AMR Phase 1 (D1): optional capability block for tier selection. */
  capabilities?: BackendCapabilities;
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
  /** AMR Phase 1 (D1): optional capability block for tier selection. */
  capabilities?: BackendCapabilities;
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
  /** AMR Phase 1 (D1): optional capability block for tier selection. */
  capabilities?: BackendCapabilities;
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
  /**
   * AMR Phase 3 (D11): opt-in adaptive-routing policy. Its PRESENCE and
   * non-emptiness is the default-off gate — the orchestrator constructs
   * `AdaptiveRouter` only when this is set. Absent ⇒ dispatch is byte-identical
   * to the shipped `BackendRouter` (SC8/SC17/SC19). Every other `RoutingConfig`
   * field keeps its meaning; a config without `policy` validates unchanged.
   */
  policy?: RoutingPolicy;
  /**
   * local-backend-full-workflow Phase 3 (D5): routes the LOCAL gate's
   * judgment sub-gate (outcome-eval) to a stronger provider. `'primary'`
   * resolves the eval provider from the routing.default (primary) backend;
   * absent or `'local'` ⇒ local SEL (byte-identical default). Affects ONLY
   * the local (`pi`) dispatch gate — the Claude/AMR path is unchanged.
   */
  workflowGates?: 'local' | 'primary';
  /**
   * staged-verify-gate-convergence D3: bound on consecutive staged-settle gate
   * failures for a LOCAL unit before it escalates to the needs-human terminal
   * (instead of retrying again). Absent ⇒ `DEFAULT_MAX_LOCAL_STAGE_GATE_RETRIES`
   * (5). Wired in BOTH this TS type AND the orchestrator Zod config schema
   * (`schema.ts`, positive-int optional), so a config that sets it validates; the
   * settle path still reads it defensively via optional chaining.
   */
  maxLocalStageRetries?: number;
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
  /** AMR Phase 3 (D9/SC9): the complexity verdict that drove tier selection. Absent for identity-only (non-AMR) dispatch. */
  complexity?: ComplexityVerdict;
  /** AMR Phase 3 (D9/SC9): the derived required CapabilityTier. Absent for identity-only dispatch. */
  tierRequired?: CapabilityTier;
  /** AMR Phase 3 (D9/SC9): estimated USD cost of the resolved backend for this invocation. */
  estCostUsd?: number;
}

/**
 * AMR Phase 5 (D2): a single routing decision projected into the Shuttle
 * telemetry wire shape. This is the cross-repo contract — it MUST match
 * Shuttle's `RoutingDecision` in `src/types/routing.ts` exactly
 * (`{ decisionTs, tierRequired, backend, estCostUsd, workItemId?, domainId? }`).
 * Distinct from the orchestrator-internal {@link RoutingDecision}, which is
 * resolver-shaped; `GET /api/v1/routing/telemetry` projects the internal ring
 * buffer into this shape so a real Shuttle drain deserializes to non-empty rows.
 */
export interface RoutingTelemetryDecision {
  /** ISO-8601 timestamp the decision was made (internal `timestamp`). */
  decisionTs: string;
  /** The required CapabilityTier that drove selection. */
  tierRequired: CapabilityTier;
  /** The selected backend's name (internal `backendName`). */
  backend: string;
  /** Estimated USD cost of the resolved backend for this invocation. */
  estCostUsd: number;
  /** Optional work-item correlation id (absent in single-container harness dispatch). */
  workItemId?: string;
  /** Optional domain correlation id (absent in single-container harness dispatch). */
  domainId?: string;
}

/**
 * AMR Phase 5 (D2): the telemetry drain payload returned by
 * `GET /api/v1/routing/telemetry`. Matches Shuttle's `RoutingTelemetry`.
 * `spentUsd` is the sum of `estCostUsd` over the retained ring (capped, FIFO) —
 * telemetry, not billing-of-record.
 */
export interface RoutingTelemetry {
  decisions: RoutingTelemetryDecision[];
  spentUsd: number;
}

/**
 * AMR observability (operator status): the live budget picture, distinct from
 * the {@link RoutingTelemetry} ring-sum. `spentUsd` here is the MONOTONIC
 * accumulator that actually drives the D8 clamp (not the bounded ring sum).
 */
export interface RoutingBudgetStatus {
  /** Monotonic total spend that drives the clamp (`AdaptiveRouter.getSpentUsd()`). */
  spentUsd: number;
  capUsd: number;
  /** Degrade threshold as a percent of `capUsd` (default 90). */
  degradeAtPct: number;
  /** `spentUsd / capUsd * 100`, rounded. */
  spentPct: number;
  /** True once `spentPct >= degradeAtPct` — the clamp is now stepping tiers down. */
  degrading: boolean;
  /**
   * True once `spentUsd >= capUsd` — the D8 HARD cap. At/above it, `degrade`/`pause`
   * routing is forced all the way to `fast` and `human` mode surfaces the unit to a
   * steward (`routing:budget-exhausted`) instead of routing.
   */
  exhausted: boolean;
}

/** AMR observability: one coherence unit that has climbed its escalation floor. */
export interface RoutingEscalationUnit {
  coherenceUnit: string;
  floor: CapabilityTier;
}

/**
 * AMR observability payload for `GET /api/v1/routing/status` — the live operator
 * view of the adaptive router: whether it's active, budget spend-vs-cap, the
 * units that have escalated, and the active provider allowlist. Read-only; NOT
 * the Shuttle wire contract (that is {@link RoutingTelemetry}).
 */
export interface RoutingStatus {
  /** AMR active for this container (a `routing.policy` is set). */
  active: boolean;
  /** Budget picture, or `null` when no `budget` is configured. */
  budget: RoutingBudgetStatus | null;
  /** Coherence units that have climbed above the `fast` floor (empty if none). */
  escalation: RoutingEscalationUnit[];
  /** Active provider-type allowlist, or `null` when unset. */
  allowedProviders: BackendDef['type'][] | null;
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
 * split-routing D7: an operator declaration binding a staged workflow to units.
 * Additive + optional so every existing config is byte-valid (SC4). The producer
 * surface is config-declared (parsed by the existing `validateWorkflowConfig`),
 * NOT a dispatch-input field: `workflowFor(issue, config)` selects the matching
 * decl. A 0-stage decl is a validation error; a 1-stage decl falls back to single
 * dispatch (D13).
 */
export interface StagedWorkflowDecl {
  /** Human label for logs/telemetry. */
  name: string;
  /** Match units by identifier prefix and/or labels (v1 matchers). */
  match: { identifierPrefix?: string; labels?: string[] };
  /** Ordered stages; `workflowFor` only returns a plan for length >= 2 (D13). */
  stages: import('./workflow').WorkflowStep[];
  /** D12 override; absent ⇒ engine default DEFAULT_STAGE_DEADLINE_MS. */
  stageDeadlineMs?: number;
  /**
   * staged-verify-gate-convergence D2: an optional shell command run in the unit's
   * workspace at settle to gate a LOCAL last-stage unit (exit code 0 ⇒ pass). When
   * set, the settle acceptance gate runs THIS command as its mechanical step in
   * place of the default `verifyRunner` (project typecheck+lint+test); when absent,
   * `verifyRunner` is unchanged. Portable — no project-specific command is baked in.
   */
  acceptance?: string;
}

/**
 * Roadmap Auto-Triage config (Phase 0, Contract 2). The WHOLE surface, defined once
 * and **default-off**: with `enabled: false` (the default) the roadmap behaves
 * byte-identically to today (SC-S1). All `thresholds` are documented, tunable SEEDS
 * (mirroring AMR's STATIC_WEIGHTS); each later phase reads its own fields. Wired in
 * BOTH this TS type AND the orchestrator Zod schema — a type-only add is silently
 * rejected at validate (the AMR config-surface lesson).
 */
export interface RoadmapAutoTriageConfig {
  /** Master switch. Default false — nothing triages until explicitly enabled (D5). */
  enabled: boolean;
  /** Cron schedule; absent ⇒ on-demand only (the seam registers dormant without it). */
  schedule?: string;
  /** Autonomy-ratchet stage in effect (D14). Default 1 = human before execution. */
  ratchetStage: 1 | 2 | 3 | 4;
  /** Corroboration/gate seeds (tunable). */
  thresholds: {
    /** Pre-diff confidence ceiling (S3-001) — the dispatch gate bar. */
    dispatchConfidence: 'low' | 'medium' | 'high';
    /** Blast-radius ceiling for a "bounded" scope (seed). */
    boundedScopeMax: number;
    /** Per-fork auto-accept bar for the autonomous brainstorm (P2). */
    brainstormConfidence: number;
    /** Level-delta that counts as a mispredict at the retrospective (P4). */
    exceededByBands: number;
    /** Success-rate required to advance a ratchet stage (P4). */
    ratchetAdvanceRate: number;
    /** Minimum recorded matches before a stage may advance (P4). */
    ratchetMinSample: number;
  };
  /**
   * Brainstorm depth by complexity level (P2) — bounds cost per eligible band. Only the
   * `trivial`/`simple` bands are brainstorm-eligible (D1: the eligible band); `moderate`/
   * `complex` are INTENTIONALLY omitted — those always route to a human, so they never run
   * the autonomous brainstorm and thus need no depth budget.
   */
  depthBudget: { trivial: number; simple: number };
}

/**
 * Roadmap-level config namespace. Currently carries only the auto-triage surface;
 * a distinct top-level section keeps it out of `agent`/`maintenance` so each phase
 * reads `roadmap.autoTriage.*` from one place.
 */
export interface RoadmapConfig {
  /** Auto-triage settings (Phase 0 Contract 2). Absent ⇒ feature off. */
  autoTriage?: RoadmapAutoTriageConfig;
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
  /**
   * Local Model Lifecycle Manager (LMLM) settings (D5). Optional; absent or
   * `enabled: false` preserves pre-Phase-4 resolver behavior byte-for-byte.
   */
  localModels?: import('./local-models').LocalModelsConfig;
  /** Optional stable identity for this orchestrator instance. Auto-generated if omitted. */
  orchestratorId?: string;
  /**
   * split-routing D7: declarative staged workflows (opt-in; absent ⇒ single
   * dispatch). Parsed by the existing `validateWorkflowConfig`; selected per unit
   * by the pure `workflowFor(issue, config)` predicate (>= 2 stages ⇒ staged
   * dispatch, else single dispatch).
   */
  workflows?: StagedWorkflowDecl[];
  /**
   * Roadmap Auto-Triage settings (Phase 0 Contract 2). Absent or
   * `autoTriage.enabled: false` ⇒ byte-identical roadmap behavior (SC-S1).
   */
  roadmap?: RoadmapConfig;
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
   * Backend-aware local dispatch template (Phase 1, local-backend-full-workflow).
   * Loaded from the sibling `harness.orchestrator.local.md` when present.
   * Undefined when the file is absent — resolution falls back to
   * `promptTemplate`, preserving pre-Phase-1 behavior (SC5).
   */
  localPromptTemplate?: string;
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
