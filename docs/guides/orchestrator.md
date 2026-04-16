# Orchestrator Guide

The Harness Orchestrator is a dedicated daemon designed to manage the lifecycle of coding agents. It runs as a long-lived process that polls issue trackers for work, dispatches agents into isolated workspaces, and provides real-time observability into the entire development loop.

## Core Concepts

### 1. The Daemon Loop

The Orchestrator operates on a fixed-interval "tick" (defaulting to 30 seconds). During each tick, it:

1. **Polls** the configured issue tracker (e.g., a `roadmap.md` file) for active tasks.
2. **Reconciles** the current internal state with the external tracker state (detecting if tasks were manually completed or blocked).
3. **Dispatches** work to agents if concurrency slots are available.
4. **Executes** side effects like creating workspaces, rendering prompts, and spawning agent processes.

### 2. Pure State Machine

At the heart of the Orchestrator is a pure-function state machine. It takes the current `state`, an `event` (like a poll result or worker exit), and the `config`, then returns the `nextState` and a list of `SideEffects`.

This design ensures that the most complex logic is deterministic, easy to test, and completely decoupled from I/O concerns like file systems or network calls.

### 3. Workflows (`WORKFLOW.md`)

The daemon's behavior is governed by a `WORKFLOW.md` file located in the repository root. This file contains:

- **YAML Frontmatter**: Configuration for polling intervals, concurrency limits, workspace locations, and agent backend settings.
- **Liquid Template**: A prompt template used to instruct agents when they are dispatched to an issue.

### 4. Deterministic Workspaces

Every issue handled by the Orchestrator gets its own isolated workspace directory. These paths are deterministic (based on the issue identifier) and are preserved across daemon restarts, allowing agents to resume work incrementally.

### 5. Pluggable Adapters

The Orchestrator uses a pluggable architecture for both issue tracking and agent execution:

- **Trackers**: Currently supports local `Roadmap` files, with Linear and GitHub support planned.
- **Backends**: Supports `Claude` (spawning the Claude Code CLI), `Pi` (embedded pi coding agent SDK for local models with full tool capabilities), `OpenAI-compatible` (chat-only local models), and a `Mock` backend for testing and CI environments.

## Observability

The Orchestrator provides two primary ways to monitor its activity:

### TUI (Terminal User Interface)

Running `harness orchestrator run` launches a high-fidelity dashboard built with [Ink](https://github.com/vadimdemedes/ink). It displays:

- **Header**: Global stats (active agents, total tokens used, daemon uptime).
- **Active Agents**: A table showing currently running issues, their current phase, and the most recent message from the agent.
- **Retry Queue**: Issues currently in exponential backoff.

### HTTP API

The daemon hosts a lightweight HTTP API (defaulting to port `8080`) that exposes the internal state as JSON.

- `GET /api/v1/state`: Returns a full snapshot of the orchestrator state.

## Getting Started

### 1. Initialize a Workflow

Create a `WORKFLOW.md` in your project root. You can use the default template:

```bash
harness init --template orchestrator
```

### 2. Configure your Roadmap

Ensure your `docs/roadmap.md` contains features marked as `planned` or `in-progress`.

### 3. Run the Daemon

Launch the orchestrator using the Harness CLI:

```bash
harness orchestrator run
```

## Lifecycle & Shutdown

The Orchestrator supports graceful shutdown. When it receives a `SIGINT` (Ctrl+C) or `SIGTERM`:

1. It stops polling for new work.
2. It signals all active agent processes to terminate.
3. It waits for agents to exit cleanly (up to a 30-second grace period) before the daemon itself exits.
4. Workspaces are preserved so work can resume on the next launch.
