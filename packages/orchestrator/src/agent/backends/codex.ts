import { spawn } from 'node:child_process';
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
   * MCP servers to expose to the codex-driven model, injected per-invocation via
   * `-c mcp_servers.<name>.…` overrides (NOT written to the user's global
   * `~/.codex/config.toml`, so their real codex setup is untouched). Mirrors the
   * `mcpServers` config the {@link OllamaBackend} path uses: each spec's `tools`
   * allowlist maps to codex's per-server `enabled_tools`, so a broad server (e.g.
   * harness-mcp's ~95 tools) is narrowed to a high-value set the local model can
   * navigate. Absent/empty ⇒ codex runs with only its built-in tools.
   */
  mcpServers?: McpServerSpec[];
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

  constructor(options: CodexBackendOptions = {}) {
    this.command = options.command ?? 'codex';
    if (options.model !== undefined) this.model = options.model;
    if (options.getModel !== undefined) this.getModel = options.getModel;
    this.localProvider = options.localProvider ?? 'ollama';
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.mcpServers = options.mcpServers ?? [];
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
      // Inject MCP servers (context7 for live docs, curated harness-mcp read tools)
      // per-invocation so the codex-driven local model gets the same tool surface the
      // ollama path curates — WITHOUT mutating the user's global ~/.codex/config.toml.
      ...buildMcpConfigArgs(this.mcpServers),
      '--json',
      params.prompt,
    ];

    const child = spawn(this.command, args, {
      cwd: session.workspacePath,
      env: process.env,
      // stdin from /dev/null: codex exec otherwise blocks reading additional input.
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let timedOut = false;
    const killTimer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, this.timeoutMs);

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

    await exited;
    clearTimeout(killTimer);

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

  async stopSession(_session: AgentSession): Promise<Result<void, AgentError>> {
    return Ok(undefined);
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
