# Hybrid Orchestrator Quick Start

Run the orchestrator with local model routing and the web dashboard.

## Prerequisites

- Node.js 22+
- [Ollama](https://ollama.ai) (or any OpenAI-compatible model server)
- Claude Code CLI installed and authenticated (for the Claude Chat Pane — no separate API key needed)

## 1. Set Up a Local Model Server

### Ollama (recommended)

```bash
brew install ollama
ollama serve
```

### Choosing a Model

Pick a model based on your available system RAM:

| RAM       | Model                  | Size   | Command                             | Notes                                       |
| --------- | ---------------------- | ------ | ----------------------------------- | ------------------------------------------- |
| **8GB**   | Qwen2.5-Coder 3B       | ~2GB   | `ollama pull qwen2.5-coder:3b`      | Fits easily, good for quick-fix tasks       |
| **16GB**  | Qwen2.5-Coder 7B       | ~4.5GB | `ollama pull qwen2.5-coder:7b`      | Best balance of quality and speed           |
| **16GB**  | DeepSeek-Coder-V2 Lite | ~9GB   | `ollama pull deepseek-coder-v2:16b` | Better at multi-file changes, uses more RAM |
| **32GB**  | Codestral 22B          | ~13GB  | `ollama pull codestral:22b`         | Strongest code quality at this size         |
| **32GB+** | Qwen2.5-Coder 32B      | ~20GB  | `ollama pull qwen2.5-coder:32b`     | Near-frontier quality, needs headroom       |

**Recommendation for 16GB systems:** Start with `qwen2.5-coder:7b`. It uses under a third of your RAM, leaving plenty for context window and OS. Step up to `deepseek-coder-v2:16b` if you find it struggling with larger tasks.

**Avoid:** Models 34B+ on 16GB systems — they'll either not fit or swap heavily.

```bash
# Pull your chosen model
ollama pull qwen2.5-coder:7b
```

### Other Servers

Any server that implements the OpenAI-compatible chat completions API works. Point `localEndpoint` to its base URL:

- **vLLM:** `http://localhost:8000/v1`
- **LM Studio:** `http://localhost:1234/v1`
- **llama.cpp server:** `http://localhost:8080/v1` (note: conflicts with default orchestrator port)

## 2. Configure WORKFLOW.md

Add the local backend and escalation config to the `agent:` section in your project's `WORKFLOW.md`:

```yaml
agent:
  backend: claude
  command: claude

  # Local model configuration
  localBackend: openai-compatible
  localModel: qwen2.5-coder:7b # must match a model available on your server
  localEndpoint: http://localhost:11434/v1

  # Escalation routing
  escalation:
    alwaysHuman:
      - full-exploration # no spec/plan = always needs human
    autoExecute:
      - quick-fix # simple fixes run locally
      - diagnostic # bug fixes run locally (1 retry before escalation)
    signalGated:
      - guided-change # has a plan, runs locally unless concern signals fire
    diagnosticRetryBudget: 1 # escalate after 1 failed fix attempt
```

The rest of your existing `agent:` settings (rate limits, timeouts, etc.) remain unchanged.

## 3. Label Roadmap Issues

The orchestrator routes issues based on **scope tier**, detected from labels on roadmap features. Add a `scope:` label to control routing:

| Label                    | Routing                            | When to use                               |
| ------------------------ | ---------------------------------- | ----------------------------------------- |
| `scope:quick-fix`        | Local model, autonomous            | Single-file changes, typos, config tweaks |
| `scope:diagnostic`       | Local model, 1-retry then escalate | Bug fixes with test failures              |
| `scope:guided-change`    | Local if no concern signals        | Has a spec/plan, moderate complexity      |
| `scope:full-exploration` | Always needs human                 | New features, no spec yet                 |
| _(no label)_             | Needs human (default)              | Artifact detection not yet wired          |

Example in `docs/roadmap.md`:

```markdown
### Current Work

- [ ] Fix typo in README header `scope:quick-fix` `P2`
- [ ] Debug failing auth test `scope:diagnostic` `P1`
- [ ] Implement notification system `scope:full-exploration` `P0`
```

**Important:** Without a `scope:` label, issues default to `full-exploration` and escalate to the human. This is because artifact presence detection (checking for spec/plan files) is not yet wired in the state machine.

## 4. Run

### Development (recommended)

Starts the orchestrator in headless mode and the dashboard with hot reload in one command:

```bash
pnpm orchestrator:dev
```

This runs:

- **Orchestrator** on port 8080 (headless — no TUI, server only)
- **Dashboard** on port 3700 (Vite dev server, proxies API/WebSocket to 8080)

Open `http://localhost:3700` in your browser.

### Production

```bash
# Build the dashboard
pnpm dashboard:build

# Start the orchestrator with TUI
pnpm orchestrator
```

The orchestrator serves the built dashboard at `http://localhost:8080`.

### Headless (CI / remote)

```bash
pnpm orchestrator -- --headless
```

Runs the orchestrator server without the TUI. Useful when stdin doesn't support raw mode (SSH, Docker, CI).

## 5. Use the Web Dashboard

### Agent Monitor (`/orchestrator`)

Real-time orchestrator state:

- **Running agents** — issue, backend (local/primary), turn count, tokens used
- **Rate limits** — requests/min, requests/sec, input/output tokens per minute
- **Concurrency** — active agents vs max, retry queue
- **Token usage** — cumulative input, output, total

### Needs Attention (`/orchestrator/attention`)

Issues escalated to the human:

- Each card shows the issue title, escalation reasons, and available context
- **Claim** opens the Claude Chat Pane with pre-loaded context
- **Dismiss** resolves the interaction without action
- Browser notifications fire when new escalations arrive (if the tab is backgrounded)

### Claude Chat Pane (`/orchestrator/chat`)

Interactive chat with Claude for reasoning through complex work:

- Pre-loaded with issue context (title, description, escalation reasons, related files)
- Streams Claude Code responses in real-time (uses your local `claude` CLI — no API key needed)
- **Save Plan** writes the last assistant response as a plan to `docs/plans/`
- Saving a plan automatically resolves the interaction and the orchestrator picks it up on the next tick

## How Routing Works

```
Roadmap issue picked up by orchestrator
        |
        v
  Detect scope tier (from label or artifact presence)
        |
   +----+----+----+
   |         |    |
quick-fix  guided  full-exploration
diagnostic change
   |         |          |
   v         v          v
 LOCAL    SIGNAL     NEEDS
 MODEL    CHECK      HUMAN
   |      /    \       |
   |   clear  fires    |
   |     |      |      |
   v     v      v      v
 Execute Execute Dashboard
 locally locally  alert
```

## Troubleshooting

**All issues route to "needs-human":**
Make sure issues have `scope:` labels. Without labels, the default is `full-exploration` which always escalates.

**Local model not connecting:**
Verify Ollama is running (`ollama serve`) and the model is pulled (`ollama list`). Check that `localEndpoint` in WORKFLOW.md matches your server URL.

**Chat Pane not responding:**
Make sure `claude` CLI is installed and authenticated. Run `claude --version` to verify. The chat proxy spawns `claude` as a subprocess — no separate API key is needed.

**Dashboard shows "Connecting..." permanently:**
The orchestrator server must be running on the configured port (default 8080). Check that `server.port` is set in `WORKFLOW.md`.

**Ink raw mode error when using `pnpm orchestrator:dev`:**
This is expected — the dev script uses `--headless` to avoid this. If running the orchestrator directly through `concurrently` or other non-TTY tools, add the `--headless` flag.

**Model runs slowly or system swaps:**
Your model is too large for available RAM. Switch to a smaller model (see the model table above). Check memory usage with `ollama ps`.
