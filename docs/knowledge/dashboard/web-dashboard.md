---
type: business_concept
domain: dashboard
tags: [dashboard, web-ui, visualization, monitoring, roadmap, claim-workflow]
---

# Web Dashboard

The dashboard package provides a web-based interface for monitoring orchestrator state, knowledge graph health, project metrics, and roadmap management. It depends on types, core, and graph packages.

## Capabilities

- **Roadmap Management** — Milestone-grouped feature table with collapsible accordion sections, stats summary bar, inline claim workflow, and assignment history. Replaces the former Gantt chart with a full representation of `docs/roadmap.md` metadata (status, assignee, priority, spec, plan, blockers, external ID)
- **Claim Workflow** — "Start Working" action on unassigned planned/backlog features. Confirmation popover shows the detected workflow step (brainstorming/planning/execution) based on feature state. On confirm: updates `roadmap.md` atomically via `parseRoadmap`/`serializeRoadmap`, assigns the GitHub issue if `externalId` is present, and opens a chat thread routed to the appropriate harness skill
- **Identity Resolution** — Server-side GitHub identity waterfall (GitHub API via `GITHUB_TOKEN` → `gh` CLI → `git config user.name`). Cached for server lifetime. Used as the assignee when claiming roadmap features
- **Orchestrator Monitoring** — Displays active agents, issue queue, dispatch history, and live session streaming
- **Knowledge Graph Visualization** — Interactive graph explorer with node/edge filtering by type and domain
- **Architecture Health** — Stability score trends, violation tracking, and metric category breakdowns
- **Skill Registry** — Browse available skills with metadata, triggers, and platform support including the knowledge pipeline
- **Chat Interface** — Interactive panel for querying project state and running skills

## Key API Endpoints

- `GET /api/roadmap` — Roadmap data with milestone progress and feature metadata
- `POST /api/actions/roadmap/claim` — Atomic claim: updates roadmap.md status/assignee, syncs GitHub issue
- `GET /api/identity` — Resolves current user's GitHub identity via waterfall
- `POST /api/actions/roadmap-status` — Update feature status in roadmap.md
- `GET /api/sse` — Server-Sent Events stream for real-time data updates

## Architecture

The dashboard is a React 18 + TypeScript + Tailwind CSS application with a Hono server backend, served at port 3701. The client uses Zustand for thread/session state management and React Router v7 for routing. It communicates with the orchestrator via REST API and receives real-time updates via SSE. The UI renders tool calls, thinking blocks, and text output as distinct visual elements.
