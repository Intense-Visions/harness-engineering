---
schemaVersion: 1
module: 'packages/dashboard/src/shared'
sourceHash: 'a449dc1ef74c9d8bc2b40e9d73a0d6c3b33488dc613afb1c9110a0e6e7c62c8b'
compiledAt: '2026-08-28T01:22:11.374Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['constants.ts', 'roles.ts', 'typeGuards.ts', 'types.ts']
---

## Summary

`packages/dashboard/src/shared` is the contract layer between the dashboard server and client. It exports constants (ports, endpoints, paths, poll intervals), a role taxonomy (`dev`/`pm-ba`/`client` — presentation-only lane selection), type guards for safe network response narrowing (roadmap, health, graph, security, perf, arch, anomaly, blast-radius), and API shapes for roadmap features with conflict detection, identity + role, health metrics, graph counts, and SSE event unions. No business logic—only structural contracts and runtime type safety.

## Invariants

- Role coercion never returns undefined — coerceRole() always yields a valid DashboardRole by falling back to DEFAULT_ROLE; callers need not null-check.
- Type guards are structural, not semantic — isRoadmapData() et al. check shape (key presence) only, not domain validity; callers must validate ranges and invariants beyond type-guard scope.
- Role is presentation-only, not a security boundary — IdentityResponse.role selects the navigation lane client-side; real auth lives in the orchestrator proxy; code must not assume role-gating provides access control.
- TrackerConflictBody discriminant is precise — guard checks code, externalId, and object-shape together; responses without all three must not be treated as conflicts.
- SSE event union is the contract for async events — SSEEvent is the source of truth for what types/shapes flow over the wire; adding events requires updating this union; handlers can rely on type narrowing via the type field.
- RoadmapResult and HealthResult are mutually-exclusive unions — callers must discriminate (check for error presence) before accessing data fields; type guards enforce this.
- Port and path constants must not drift — API_PORT, DASHBOARD_PORT, ORCHESTRATOR_PORT, and GRAPH_DIR are singletons that server startup and client requests must agree on; drift breaks routing.
- Claim workflow is a fixed enum — ClaimResponse.workflow ('brainstorming' | 'planning' | 'execution') mirrors orchestrator state; client state machines key on this; adding workflows requires coordination.
- ExtendedHealthData is a cache aggregation, not a primary contract — it bundles health + optional security/perf/arch; treat as an internal optimization layer (GatherCache output), not an API guarantee.
- getBindHost() enables container flexibility — defaults to loopback (127.0.0.1), but HOST env var overrides for containerized deployments; server startup must call this, not hardcode addresses.

## Interface Contract

```ts
export API_PORT
export API_PREFIX
export AdoptionSnapshot
export CONFLICT_TOAST_TEMPLATE
export DASHBOARD_PORT
export DASHBOARD_ROLES
export DEFAULT_POLL_INTERVAL_MS
export DEFAULT_ROLE
export FeatureStatus
export GRAPH_DIR
export ORCHESTRATOR_PORT
export SSE_ENDPOINT
export SkillAdoptionSummary
export coerceRole
export getBindHost
export isAnomalyData
export isArchData
export isBlastRadiusData
export isDashboardRole
export isGraphData
export isHealthData
export isPerfData
export isRoadmapData
export isSecurityData
export isTrackerConflictBody
```

## Dependency Slice

```
import { DashboardRole } from './roles'
import { AnomalyData, ArchData, BlastRadiusData, GraphData, HealthData, PerfData, RoadmapData, SecurityData } from './types'
import { FeatureStatus } from '@harness-engineering/core'
import { AdoptionSnapshot, SkillAdoptionSummary } from '@harness-engineering/types'
```
