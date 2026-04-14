# Hybrid Orchestrator Quick Start

Run the orchestrator with local model routing and the web dashboard.

## Prerequisites

- Node.js 22+
- A local model server (Ollama, vLLM, LM Studio, or any OpenAI-compatible endpoint)
- `ANTHROPIC_API_KEY` environment variable (for the Claude Chat Pane)

## 1. Set Up a Local Model Server

### Ollama (recommended)

```bash
brew install ollama
ollama pull deepseek-coder-v2
ollama serve
# Serves at http://localhost:11434/v1
```

### Other servers

Any server that implements the OpenAI-compatible chat completions API works. Point `localEndpoint` to its base URL:

- **vLLM:** `http://localhost:8000/v1`
- **LM Studio:** `http://localhost:1234/v1`
- **llama.cpp server:** `http://localhost:8080/v1`

## 2. Configure WORKFLOW.md

Add the local backend and escalation config to the `agent:` section in your project's `WORKFLOW.md`:

```yaml
agent:
  backend: claude # primary backend (used for human-escalated work)
  command: claude

  # Local model configuration
  localBackend: openai-compatible
  localModel: deepseek-coder-v2 # must match a model available on your server
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

  # Keep your existing settings
  maxConcurrentAgents: 1
  maxTurns: 10
  maxRetryBackoffMs: 5000
  turnTimeoutMs: 300000
  readTimeoutMs: 30000
  stallTimeoutMs: 60000

server:
  port: 8080
```

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

## 4. Build and Run

```bash
# Build the dashboard
cd packages/dashboard
npm run build
cd ../..

# Set your Anthropic API key (for the Claude Chat Pane)
export ANTHROPIC_API_KEY=sk-ant-...

# Start the orchestrator
npx harness orchestrator run
```

The orchestrator starts polling the roadmap every 30 seconds. The TUI shows agent status in the terminal. The web dashboard is available at `http://localhost:8080`.

## 5. Use the Web Dashboard

Open `http://localhost:8080` in your browser. Three pages are available:

### Agent Monitor (`/orchestrator`)

Shows real-time orchestrator state:

- **Running agents** with issue, backend (local/primary), turn count, tokens used
- **Rate limits** (requests/min, requests/sec, input/output tokens per minute)
- **Concurrency** (active agents, retry queue)
- **Token usage** (cumulative input, output, total)

### Needs Attention (`/orchestrator/attention`)

Lists issues that were escalated to the human:

- Each card shows the issue title, escalation reasons, and available context
- **Claim** opens the Claude Chat Pane with pre-loaded context
- **Dismiss** resolves the interaction without action
- Browser notifications fire when new escalations arrive (if the tab is backgrounded)

### Claude Chat Pane (`/orchestrator/chat`)

Interactive chat with Claude for reasoning through complex work:

- Pre-loaded with issue context (title, description, escalation reasons, related files)
- Streams Claude responses via SSE in real-time
- **Save Plan** writes the last assistant response as a plan to `docs/plans/`
- Saving a plan automatically resolves the interaction and the orchestrator picks it up on the next tick

## 6. Development Mode

For hot-reload during dashboard development:

```bash
# Terminal 1: Start the orchestrator
npx harness orchestrator run

# Terminal 2: Start the dashboard dev server
cd packages/dashboard
npm run dev
# Dashboard at http://localhost:3700 (proxies API to :8080)
```

The Vite dev server proxies all `/api/*` and `/ws` requests to the orchestrator server.

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
Check that your model server is running and the `localEndpoint` URL is correct. The orchestrator logs connection failures at startup.

**Chat Pane shows "Chat proxy unavailable":**
Set the `ANTHROPIC_API_KEY` environment variable. The chat proxy is disabled when the key is absent.

**Dashboard shows "Connecting..." permanently:**
The orchestrator server must be running on the configured port (default 8080). Check that `server.port` is set in `WORKFLOW.md`.
