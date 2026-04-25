---
type: business_concept
domain: dashboard
tags: [dashboard, web-ui, visualization, monitoring]
---

# Web Dashboard

The dashboard package provides a web-based interface for monitoring orchestrator state, knowledge graph health, and project metrics. It depends on types, core, and graph packages.

## Capabilities

- **Orchestrator Monitoring** — Displays active agents, issue queue, dispatch history, and live session streaming
- **Knowledge Graph Visualization** — Interactive graph explorer with node/edge filtering by type and domain
- **Architecture Health** — Stability score trends, violation tracking, and metric category breakdowns
- **Skill Registry** — Browse available skills with metadata, triggers, and platform support including the knowledge pipeline
- **Chat Interface** — Interactive panel for querying project state and running skills

## Architecture

The dashboard is a client-side application served at port 3701 with a health check endpoint. It communicates with the orchestrator via REST API and receives real-time updates for session streaming. The UI renders tool calls, thinking blocks, and text output as distinct visual elements.
