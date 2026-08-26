import { spawn, type ChildProcess } from 'node:child_process';
import * as readline from 'node:readline';
import { randomUUID } from 'node:crypto';
import {
  AgentBackend,
  SessionStartParams,
  AgentSession,
  TurnParams,
  AgentEvent,
  TurnResult,
  Result,
  Ok,
  Err,
  AgentError,
  McpServerSpec,
} from '@harness-engineering/types';
import type {
  PolicyMetadata,
  PolicySandboxMode,
  PolicyNetworkMode,
} from '@harness-engineering/types';
import { buildSubprocessEnv } from '../subprocess-env.js';
import type { PolicyAuditSink } from './claude.js';

/**
 * Extract the assistant's final text from a parsed codex `--json` line, across
 * protocol versions. Codex surfaces the model's final message as an
 * `agent_message` event whose text lives in one of three shapes:
 *   - nested `msg`:  `{"msg":{"type":"agent_message","message":"…"}}`
 *   - item form:     `{"type":"item.completed","item":{"type":"agent_message","text":"…"}}`
 *   - flat form:     `{"type":"agent_message","message":"…"}` (or `"text"`)
 * Returns the text when the line IS an agent_message, else `undefined`. Kept
 * pure + defensive (never throws on odd shapes) so the JSONL loop can call it per
 * line; the LAST non-empty result is the turn's final assistant output, which the
 * backend re-emits as a `result` event so the workflow stage runner captures it
 * (`run.output`) and can persist a design stage's proposal/plan artifact.
 */
function nonEmptyString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined;
}

/** Pull agent_message text out of a single node (`{type:'agent_message', message|text}`). */
function agentMessageNodeText(node: unknown): string | undefined {
  if (typeof node !== 'object' || node === null) return undefined;
  const n = node as Record<string, unknown>;
  if (n.type !== 'agent_message') return undefined;
  return nonEmptyString(n.message) ?? nonEmptyString(n.text);
}

export function extractCodexAgentMessage(parsed: unknown): string | undefined {
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const rec = parsed as Record<string, unknown>;
  // The agent_message node lives at `msg` (nested form), `item` (item.* form), or
  // is the record itself (flat form) — the same shape check handles all three.
  return (
    agentMessageNodeText(rec.msg) ?? agentMessageNodeText(rec.item) ?? agentMessageNodeText(rec)
  );
}

/**
 * Codex CLI backend driving a LOCAL model (Ollama / LM Studio).
 *
 * Rationale (2026-07 campaign): our bespoke {@link OllamaBackend} tool loop stalled
 * repeatedly on tasks a strong scaffold converges — same model (qwen3-coder:30b),
 * same task, Codex's `apply_patch` scaffold shipped a clean multi-file change where
 * our loop went needs-human 5×. Rather than keep hand-rolling a scaffold, drive the
 * local model through Codex, which OpenAI maintains: exact-patch editing, 256K
 * context negotiation, and the harness persona subagents it already ships at
 * `~/.codex/agents/harness-*.toml`.
 *
 * Unlike the endpoint backends (`local`/`pi`/`ollama`), this backend does NOT own a
 * turn loop — `codex exec` runs the ENTIRE agentic session in one invocation and
 * exits when the task is done (or blocked). So a single {@link runTurn} spawns one
 * `codex exec` and reports success on exit 0; the orchestrator's outer retry/gate
 * loop still governs re-dispatch. stdin is closed (`codex exec` otherwise blocks
 * "Reading additional input from stdin…").
 */
export interface CodexBackendOptions {
  /** `codex` CLI binary. Default `'codex'`. */
  command?: string;
  /** The local model Codex drives, e.g. `'qwen3-coder:30b'`. */
  model?: string;
  /** Prefer-fallback resolver (array-model configs). Takes precedence over `model`. */
  getModel?: (() => string | null) | undefined;
  /** Local model provider Codex uses via `--oss --local-provider`. Default `'ollama'`. */
  localProvider?: 'ollama' | 'lmstudio';
  /** Hard wall-clock cap per session in ms. Default 30min (codex sessions run long). */
  timeoutMs?: number;
  /**
   * Reasoning effort for the driven model, passed as `-c model_reasoning_effort`.
   * A hands-on coder (e.g. qwen3-coder) wants `'low'` — minimal deliberation, spend
   * the budget on edits + gate iteration, not a long think. Design/reasoning phases
   * route to a separate thinking backend, not this one. Omit to use codex's default.
   *
   * `'none'` makes codex OMIT the reasoning field from the request. Required for
   * local ollama (`--oss`) coder models that do not support reasoning at all: newer
   * ollama rejects the request outright (`"qwen3-coder:30b" does not support
   * thinking`, invalid_request_error) rather than ignoring it, which fails EVERY
   * turn (0 tokens, 0 turns). Note codex's DEFAULT (effort omitted) still sends a
   * reasoning request, so `'none'` — not omission — is the fix for such models.
   */
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
  /**
   * MCP servers to expose to the codex-driven model, injected per-invocation via
   * `-c mcp_servers.<name>.…` overrides (NOT written to the user's global
   * `~/.codex/config.toml`, so their real codex setup is untouched). Mirrors the
   * `mcpServers` config the {@link OllamaBackend} path uses: each spec's `tools`
   * allowlist maps to codex's per-server `enabled_tools`, so a broad server (e.g.
   * harness-mcp's ~95 tools) is narrowed to a high-value set the local model can
   * navigate. Absent/empty ⇒ codex runs with only its built-in tools.
   */
  mcpServers?: McpServerSpec[];
  /**
   * Process-isolation posture recorded in the governance audit envelope. DERIVED
   * by the orchestrator from the dispatch's sandbox policy (a docker wrap ⇒
   * `'docker'`). Describes the isolation AROUND the subprocess, not codex's own
   * `--sandbox workspace-write` file guard. Default `'none'`.
   */
  sandboxMode?: PolicySandboxMode;
  /** Network egress posture recorded in the audit envelope. Default `'unrestricted'`. */
  networkMode?: PolicyNetworkMode;
  /** Best-effort codex CLI version stamped into the audit envelope. Default `'unknown'`. */
  agentVersion?: string;
  /**
   * Governance audit sink invoked once per spawn with the resolved
   * {@link PolicyMetadata} plus the NAMES (never values) of parent-env vars
   * withheld by the subprocess air-gap. The orchestrator wires this to
   * `.harness/audit.log`. Best-effort: a sink fault never blocks the spawn.
   */
  policyAudit?: PolicyAuditSink;
  /**
   * Extra exact env var names to forward through the subprocess air-gap, merged
   * with the built-in allowlist (see subprocess-env.ts). For a flow that needs a
   * var the conservative default withholds.
   */
  subprocessEnvAllow?: readonly string[];
  /**
   * Env the air-gap filters (defaults to `process.env`). Injected in tests to
   * prove filtering without depending on the ambient process environment.
   */
  envSource?: NodeJS.ProcessEnv;
}

const DEFAULT_TIMEOUT_MS = 30 * 60_000;

/** Generous startup budget (s) — npx-launched servers (context7) cold-start slowly. */
const MCP_STARTUP_TIMEOUT_SEC = 60;

/**
 * Translate {@link McpServerSpec}s into `codex exec -c mcp_servers.…` override argv.
 * Each `-c` is two argv entries (`'-c'`, `'<dotted.key>=<toml-value>'`); values are
 * JSON-encoded, which is valid TOML for strings and string-arrays. `spec.tools` →
 * `enabled_tools` (codex's per-server allowlist). Server names are dot-sanitized so
 * the dotted-path parser keys them correctly.
 */
export function buildMcpConfigArgs(servers: readonly McpServerSpec[]): string[] {
  const args: string[] = [];
  const push = (key: string, value: string): void => {
    args.push('-c', `${key}=${value}`);
  };
  for (const spec of servers) {
    const name = spec.name.replace(/\./g, '_');
    const base = `mcp_servers.${name}`;
    push(`${base}.command`, JSON.stringify(spec.command));
    if (spec.args !== undefined) push(`${base}.args`, JSON.stringify(spec.args));
    if (spec.cwd !== undefined) push(`${base}.cwd`, JSON.stringify(spec.cwd));
    if (spec.env !== undefined) {
      for (const [k, v] of Object.entries(spec.env)) {
        push(`${base}.env.${k}`, JSON.stringify(v));
      }
    }
    if (spec.tools !== undefined && spec.tools.length > 0) {
      push(`${base}.enabled_tools`, JSON.stringify(spec.tools));
    }
    push(`${base}.startup_timeout_sec`, String(MCP_STARTUP_TIMEOUT_SEC));
  }
  return args;
}

export class CodexBackend implements AgentBackend {
  readonly name = 'codex';
  private command: string;
  private model?: string;
  private getModel?: () => string | null;
  private localProvider: 'ollama' | 'lmstudio';
  private timeoutMs: number;
  private mcpServers: McpServerSpec[];
  private reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
  private sandboxMode: PolicySandboxMode;
  private networkMode: PolicyNetworkMode;
  private agentVersion: string;
  private policyAudit?: PolicyAuditSink;
  private subprocessEnvAllow?: readonly string[];
  private envSource: NodeJS.ProcessEnv;
  /**
   * Live codex subprocess per active session, so {@link stopSession} can kill it
   * when the workflow aborts a stage (its wall-clock deadline). Without this, the
   * runner's abort only invokes the (previously no-op) `stopSession` while the
   * detached codex process kept running to its own 30-min cap — a stage's deadline
   * could not actually terminate the work.
   */
  private readonly activeChildren = new Map<
    string,
    { child: ChildProcess; killTimer: NodeJS.Timeout }
  >();

  constructor(options: CodexBackendOptions = {}) {
    this.command = options.command ?? 'codex';
    if (options.model !== undefined) this.model = options.model;
    if (options.getModel !== undefined) this.getModel = options.getModel;
    this.localProvider = options.localProvider ?? 'ollama';
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.mcpServers = options.mcpServers ?? [];
    if (options.reasoningEffort !== undefined) this.reasoningEffort = options.reasoningEffort;
    this.sandboxMode = options.sandboxMode ?? 'none';
    this.networkMode = options.networkMode ?? 'unrestricted';
    this.agentVersion = options.agentVersion ?? 'unknown';
    if (options.policyAudit) this.policyAudit = options.policyAudit;
    if (options.subprocessEnvAllow) this.subprocessEnvAllow = options.subprocessEnvAllow;
    this.envSource = options.envSource ?? process.env;
  }

  private resolveModel(): string | undefined {
    return this.getModel?.() ?? this.model ?? undefined;
  }

  async startSession(params: SessionStartParams): Promise<Result<AgentSession, AgentError>> {
    return Ok({
      sessionId: randomUUID(),
      workspacePath: params.workspacePath,
      backendName: this.name,
      startedAt: new Date().toISOString(),
    });
  }

  async *runTurn(
    session: AgentSession,
    params: TurnParams
  ): AsyncGenerator<AgentEvent, TurnResult, void> {
    const model = this.resolveModel();
    if (model === undefined) {
      return {
        success: false,
        sessionId: session.sessionId,
        error: 'CodexBackend: no model configured/resolved',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      };
    }

    const args = [
      'exec',
      '--oss',
      '--local-provider',
      this.localProvider,
      '-m',
      model,
      '-C',
      session.workspacePath,
      // `workspace-write` (not the full `--dangerously-bypass-approvals-and-sandbox`):
      // exec mode already runs approval-free (`approval: never`), and workspace-write
      // lets codex edit the worktree + run the gate (verified: 21 gate runs in a live
      // trial) WITHOUT the bypass mode's failure where an interactive command hits
      // `write_stdin failed: stdin is closed for this session`. Reads are unrestricted
      // (the pnpm store resolves); writes are confined to the worktree — appropriate
      // since the orchestrator already dispatches codex into an isolated worktree.
      '--sandbox',
      'workspace-write',
      // Disable codex's multi-agent/subagent dispatch: it is native (GPT-5) only and
      // fails with `unsupported call: multi_agent_v1` when driving a LOCAL model, which
      // derails the run. The harness lifecycle rides on the ORCHESTRATOR's stage
      // sequencing instead, with codex executing each skill as a single agent.
      '--disable',
      'multi_agent',
      // Reasoning effort for the driven model (coder ⇒ 'low'): spend the budget on
      // edits + gate iteration, not a long deliberation. Omitted ⇒ codex default.
      ...(this.reasoningEffort !== undefined
        ? ['-c', `model_reasoning_effort="${this.reasoningEffort}"`]
        : []),
      // Inject MCP servers (context7 for live docs, curated harness-mcp read tools)
      // per-invocation so the codex-driven local model gets the same tool surface the
      // ollama path curates — WITHOUT mutating the user's global ~/.codex/config.toml.
      ...buildMcpConfigArgs(this.mcpServers),
      '--json',
      params.prompt,
    ];

    // Subprocess air-gap: hand codex an ALLOWLISTED env instead of the full parent
    // `process.env`, so unrelated host secrets never leak into the spawned CLI.
    // Provider creds / HARNESS_* / runtime plumbing still pass through — see
    // subprocess-env.ts. Stripping is unconditional; the audit sink is optional.
    // Mirrors the claude backend (claude.ts) — closes the codex leak (#1158).
    const { env, stripped, enforced } = buildSubprocessEnv(
      this.envSource,
      this.subprocessEnvAllow ? { extraAllow: this.subprocessEnvAllow } : {}
    );

    // Stamp the per-call policy envelope into the governance audit trail. `codex
    // exec` runs approval-free (`approval: never`) under `--sandbox workspace-write`,
    // so both are recorded as the governance-relevant flags. Best-effort: never let
    // an audit fault block the spawn.
    if (this.policyAudit) {
      const policy: PolicyMetadata = {
        approvalMode: 'bypass',
        sandboxMode: this.sandboxMode,
        networkMode: this.networkMode,
        dangerousFlags: ['--sandbox=workspace-write'],
        agentFamily: 'codex',
        agentVersion: this.agentVersion,
      };
      try {
        this.policyAudit({
          sessionId: session.sessionId,
          workspacePath: session.workspacePath,
          policy,
          strippedEnvKeys: stripped,
          enforced,
        });
      } catch {
        // Audit is advisory; a sink fault must not stop the agent.
      }
    }

    const child = spawn(this.command, args, {
      cwd: session.workspacePath,
      env,
      // stdin from /dev/null: codex exec otherwise blocks reading additional input.
      stdio: ['ignore', 'pipe', 'pipe'],
      // Own process GROUP (POSIX) so a kill can take down codex AND any grandchild
      // it spawned. Without this, killing only the direct child leaves a grandchild
      // holding the stdout pipe open, and draining hangs past the stage deadline —
      // see killTree.
      detached: process.platform !== 'win32',
    });

    let timedOut = false;
    const killTimer = setTimeout(() => {
      timedOut = true;
      this.killTree(child);
    }, this.timeoutMs);
    // Register the live child so stopSession (invoked by the runner on a stage
    // abort) can terminate it — see activeChildren.
    this.activeChildren.set(session.sessionId, { child, killTimer });

    let spawnError = '';
    child.on('error', (err) => {
      spawnError = err.message;
    });

    const rl = readline.createInterface({ input: child.stdout, terminal: false });
    const errRl = readline.createInterface({ input: child.stderr, terminal: false });
    errRl.on('line', (line) => {
      if (line.trim()) console.error(`[codex stderr] ${line}`);
    });

    let exitCode: number | null = null;
    const exited = new Promise<void>((resolve) => {
      child.on('exit', (code) => {
        exitCode = code;
        resolve();
      });
    });

    yield {
      type: 'status',
      subtype: 'codex_start',
      timestamp: new Date().toISOString(),
      sessionId: session.sessionId,
      content: `codex exec (${this.localProvider}:${model})`,
    };

    // Surface codex's JSONL events as status events so the orchestrator's recorder /
    // black-box see live progress. Unknown/text lines pass through as raw output.
    // Separately, keep the LAST `agent_message` text (the model's final assistant
    // output) so we can emit it below as a `result` event — the status events are
    // truncated to 2000 chars and never captured as `run.output`, which is why a
    // design stage's generated proposal/plan was produced but never persisted.
    let lastAgentMessage = '';
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let subtype = 'codex_output';
      let content = trimmed;
      try {
        const ev = JSON.parse(trimmed) as { type?: unknown; msg?: { type?: unknown } };
        const t = typeof ev.type === 'string' ? ev.type : undefined;
        const mt =
          ev.msg &&
          typeof ev.msg === 'object' &&
          typeof (ev.msg as { type?: unknown }).type === 'string'
            ? (ev.msg as { type: string }).type
            : undefined;
        subtype = mt ?? t ?? 'codex_event';
        content = trimmed.length > 2000 ? `${trimmed.slice(0, 2000)}…` : trimmed;
        const agentText = extractCodexAgentMessage(ev);
        if (agentText !== undefined) lastAgentMessage = agentText;
      } catch {
        // non-JSON line — pass through as raw output
      }
      yield {
        type: 'status',
        subtype: `codex:${subtype}`,
        timestamp: new Date().toISOString(),
        sessionId: session.sessionId,
        content,
      };
    }

    // Emit the model's final assistant text as a `result` event so the workflow
    // stage runner captures it (`run.output`) — without this, a DOCUMENT stage
    // (spec/plan) produces content that is never persisted to its documentPath
    // nor threaded to the next stage. Best-effort: only when the model actually
    // produced a final message; a tool-only or empty run yields nothing here.
    if (lastAgentMessage.trim() !== '') {
      yield {
        type: 'result',
        timestamp: new Date().toISOString(),
        sessionId: session.sessionId,
        content: lastAgentMessage,
      };
    }

    await exited;
    clearTimeout(killTimer);
    // Normal completion — drop the session's live-child registration (the abort
    // path clears it in stopSession instead).
    this.activeChildren.delete(session.sessionId);

    if (spawnError !== '') {
      return {
        success: false,
        sessionId: session.sessionId,
        error: `codex spawn failed: ${spawnError}`,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      };
    }
    if (timedOut) {
      return {
        success: false,
        sessionId: session.sessionId,
        error: `codex session exceeded ${this.timeoutMs}ms wall-clock cap`,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      };
    }
    return {
      success: exitCode === 0,
      sessionId: session.sessionId,
      ...(exitCode === 0 ? {} : { error: `codex exec exited with code ${exitCode}` }),
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    };
  }

  async stopSession(session: AgentSession): Promise<Result<void, AgentError>> {
    // The runner calls this when a stage is aborted (its wall-clock deadline).
    // Kill the live codex subprocess so the deadline actually terminates the work
    // instead of letting codex run to its own 30-min cap. SIGKILL: codex ignores
    // gentler signals mid-run, and its stdio-piped MCP children exit on stdin EOF.
    const active = this.activeChildren.get(session.sessionId);
    if (active !== undefined) {
      clearTimeout(active.killTimer);
      this.killTree(active.child);
      this.activeChildren.delete(session.sessionId);
    }
    return Ok(undefined);
  }

  /**
   * SIGKILL the child AND its process group, so a grandchild codex spawned (or, in
   * tests, a shell's `sleep`) can't survive and keep the stdout pipe open — which
   * would hang the drain past a stage deadline (observed as a 10s test timeout on
   * Linux CI, where an un-grouped kill leaves the grandchild running; macOS reaped
   * it, hiding the gap). The child is spawned `detached`, so it leads its own group
   * and `process.kill(-pid)` targets the whole tree. Best-effort: an already-exited
   * child (ESRCH) is a no-op; Windows (no real process groups / SIGKILL) falls back
   * to a direct child kill.
   */
  private killTree(child: ChildProcess): void {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const pid = child.pid;
    if (pid !== undefined && process.platform !== 'win32') {
      try {
        process.kill(-pid, 'SIGKILL');
        return;
      } catch {
        // Group gone or never grouped — fall through to a direct child kill.
      }
    }
    try {
      child.kill('SIGKILL');
    } catch {
      // Already exited — nothing to terminate.
    }
  }

  async healthCheck(): Promise<Result<void, AgentError>> {
    return new Promise((resolve) => {
      const child = spawn(this.command, ['--version'], { stdio: 'ignore' });
      child.on('error', () =>
        resolve(
          Err({ category: 'agent_not_found', message: `codex CLI '${this.command}' not found` })
        )
      );
      child.on('exit', (code) =>
        resolve(
          code === 0
            ? Ok(undefined)
            : Err({ category: 'agent_not_found', message: `codex --version exited ${code}` })
        )
      );
    });
  }
}
