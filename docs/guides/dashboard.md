# Dashboard Guide

The harness dashboard is a local web UI for monitoring project health, tracking roadmap progress, exploring the knowledge graph, and interacting with the orchestrator. It runs entirely on your machine -- no external services required.

## Starting the Dashboard

```bash
harness dashboard
```

This starts the Hono API server on port 3701 and opens your browser automatically. The server gathers data from your project directory and serves both the API and the client UI from a single port.

### Options

```bash
harness dashboard --api-port 4000    # Use a custom port
harness dashboard --no-open          # Don't auto-open browser
harness dashboard --cwd /path/to/project  # Point at a different project
```

### Development Mode

If you are working on the dashboard itself:

```bash
cd packages/dashboard
pnpm dev
```

This runs the Vite dev server (port 3700) and the API server (port 3701) concurrently with hot reload.

## Pages

### Overview

The landing page. Shows a high-level summary of your project across four domains:

- **Roadmap** -- milestone completion percentages and feature counts by status
- **Health** -- entropy-based project health score with pass/warn/fail indicators
- **Graph** -- knowledge graph node and edge counts, density metrics
- **Checks** -- security findings, performance issues, and architecture violations

Data refreshes automatically via SSE every 30 seconds. A stale indicator appears if the connection drops.

### Attention

Displays escalated interactions from the orchestrator that require human review. Each interaction shows:

- The issue title and description
- Escalation reasons (why the orchestrator could not handle it autonomously)
- Enriched spec from the intelligence pipeline (intent, affected systems, unknowns)
- Complexity score and concern signals

Use the search bar to filter interactions. Click an interaction to expand details. When the orchestrator is running, new escalations appear in real time via WebSocket.

**When to use:** Check this page when the orchestrator is running to review and resolve escalated work items.

### Adoption

Tracks how harness skills are being used across your project:

- **Total invocations** -- how many times skills have been triggered
- **Success rate** -- percentage of skill invocations that completed successfully
- **Average duration** -- how long each skill typically takes
- **Skills table** -- per-skill breakdown with invocation count, success rate, average duration, and last-used date

**When to use:** Review periodically to understand which skills are providing value and which may need attention.

### Health

Detailed project health analysis with collapsible sections:

- **Entropy Health** -- drift detection, dead code, pattern violations scored as pass/warn/fail
- **Security** -- security rule violations found by static analysis
- **Performance** -- performance-related findings
- **Architecture** -- layer violations, circular dependencies, boundary breaches

Each finding includes a description and a "Fix It" button that opens the relevant command. Use the "Refresh Checks" button to re-run the expensive security/perf/arch scans on demand. Use "Run Validate" to trigger a full `harness validate` from the UI.

**When to use:** After making significant code changes, or as a regular hygiene check.

### Analyze

An interactive interface to the intelligence pipeline. Submit a task description (title and optional details) and watch the pipeline process it in real time via streaming SSE:

1. **SEL (Spec Enrichment)** -- identifies intent, affected systems, unknowns, and ambiguities
2. **CML (Complexity Modeling)** -- scores structural, semantic, and historical complexity
3. **PESL (Pre-Execution Simulation)** -- simulates execution, predicts failures and test gaps
4. **Signals** -- concern signals that would trigger escalation

Results stream in progressively as each pipeline stage completes.

**When to use:** Before starting complex work, to understand blast radius and potential risks. Requires the orchestrator to be running with intelligence enabled.

### Roadmap

Visual roadmap tracking with three views:

- **Progress bars** -- per-milestone completion percentages
- **Gantt chart** -- timeline view of features with start/end dates and status coloring
- **Dependency graph** -- visualizes blocker relationships between features

Filter by milestone or status (in-progress, planned, blocked, done, backlog). Data is sourced from `docs/roadmap.md` in your project.

**When to use:** During planning and standups to track progress and identify blockers.

### Orchestrator

Live monitoring of the orchestrator when it is running:

- **Rate limits** -- requests per minute/second, input/output tokens per minute, cooldown status
- **Concurrency** -- active agents, claimed issues, retry queue depth
- **Token usage** -- cumulative input and output token counts
- **Running agents** -- each active agent with its issue, phase, and elapsed time
- **Tick activity** -- recent orchestrator tick log showing what was processed

Click a running agent to open the Agent Stream Drawer, which shows the agent's live output (tool calls, text blocks, thinking) as it works.

**When to use:** While the orchestrator is running, to monitor agent progress and resource usage. Requires a WebSocket connection to the orchestrator.

### Impact

Graph-based impact analysis with two sections:

- **Anomalies** -- articulation points (nodes whose removal disconnects the graph) and outlier nodes (unusually high connectivity). Click any anomaly to see its blast radius.
- **Blast radius** -- interactive visualization showing the cascade of dependencies from a selected node. Adjust depth (1-5 levels) to control how far the analysis reaches.

**When to use:** Before refactoring critical modules, to understand how changes will propagate. Requires a knowledge graph (run `harness scan` first).

### Graph

Knowledge graph statistics and structure:

- **Summary KPIs** -- total nodes, total edges, density, connected components
- **Node type breakdown** -- table showing count and percentage for each node type (file, module, function, etc.)

**When to use:** To verify the knowledge graph is populated and understand the project's structural composition.

### Chat

Full-screen AI chat interface for interacting with harness:

- **Skill-aware context** -- the chat system understands available harness skills and project context
- **Command palette** -- quick access to common operations
- **Session management** -- create, switch between, and save chat sessions
- **Briefing panel** -- optional project briefing context for the AI

The Chat page connects to the orchestrator for AI responses. It supports markdown rendering and syntax-highlighted code blocks.

**When to use:** For ad-hoc questions about your project, exploratory analysis, or when you want AI assistance with harness operations.

## Live Updates

The dashboard uses two real-time update mechanisms:

### SSE (Server-Sent Events)

The Overview, Health, Roadmap, and Graph pages subscribe to an SSE stream at `/api/sse`. The server runs a shared polling loop that:

1. Gathers roadmap, health, and graph data every 30 seconds
2. Broadcasts an `overview` event to all connected clients
3. On first connection, also runs expensive checks (security, perf, arch, anomalies) and broadcasts a `checks` event
4. Late-connecting clients receive cached check results immediately

If the SSE connection drops, the UI shows a stale indicator on affected data. The client automatically reconnects after 3 seconds.

### WebSocket

The Orchestrator and Attention pages connect to the orchestrator's WebSocket endpoint (`/ws`) for real-time state updates. This provides:

- Orchestrator snapshots (running agents, rate limits, concurrency)
- Pending interaction notifications
- Agent streaming events (live tool calls and output)

The WebSocket auto-reconnects on disconnect with a 3-second delay.

## Integration with Orchestrator

Several dashboard pages require a running orchestrator:

| Page         | Requires Orchestrator | Connection       |
| ------------ | --------------------- | ---------------- |
| Attention    | Yes                   | WebSocket        |
| Analyze      | Yes                   | REST + SSE       |
| Orchestrator | Yes                   | WebSocket        |
| Chat         | Yes                   | WebSocket        |
| Maintenance  | Yes                   | REST + WebSocket |

Start the orchestrator before opening these pages:

```bash
harness orchestrator start
```

Pages that do not require the orchestrator (Overview, Health, Roadmap, Graph, Impact, Adoption) work with only the dashboard server running.

### Maintenance Page — Per-Task Run Now

Since 2026-05-09, the Maintenance page renders a Run Now button on every row of the schedule table. The previous single-button affordance (which always triggered `project-health`) has been removed. Each button is disabled while a `maintenance:started` event is in flight for that task ID and re-enables on the matching `maintenance:completed` or `maintenance:error` event.

## Data Sources

The dashboard gathers data from your project directory:

| Data         | Source                    | Gathered By           |
| ------------ | ------------------------- | --------------------- |
| Roadmap      | `docs/roadmap.md`         | `gatherRoadmap()`     |
| Health       | `harness validate` output | `gatherHealth()`      |
| Graph        | `.harness/graph/`         | `gatherGraph()`       |
| Security     | Static analysis rules     | `gatherSecurity()`    |
| Performance  | Performance checks        | `gatherPerf()`        |
| Architecture | Layer/boundary validation | `gatherArch()`        |
| Anomalies    | Graph topology analysis   | `gatherAnomalies()`   |
| Adoption     | `.harness/` telemetry     | `gatherAdoption()`    |
| Blast radius | Graph cascade simulation  | `gatherBlastRadius()` |
