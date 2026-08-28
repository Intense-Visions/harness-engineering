---
schemaVersion: 1
module: "packages/types/tests"
sourceHash: "ffc880c2e1a54bdd20beb1e932b4acf7ec852df68953cbd1cae9f3c810948e91"
compiledAt: "2026-08-28T01:22:12.812Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["fleet-claim.test.ts", "fleet-context-budget.test.ts", "fleet-handoff.test.ts", "fleet-spend-budget.test.ts", "index.test.ts", "maintenance-findings.test.ts", "notifications.test.ts", "plan-task.test.ts", "proposals-migration.test.ts", "proposals.test.ts", "routing-error.test.ts", "session-state.test.ts", "workflow.test.ts"]
---

## Summary

`packages/types/tests` validates the data contracts and schemas for fleet orchestration, context budgeting, handoff records, and workflow execution primitives. The suite covers six modules, each testing a Zod schema and companion validators that enforce both structural and cross-field invariants. The core pattern is dual-API validation: each domain exports both a throwing form (e.g. `parseFleetHandoffRecord`) for assertions and a safe form (e.g. `validateFleetHandoffRecord`, returning `{ok, record|error}`) for fallible parsing. Schemas are strict, enforce positive values on budget/lease fields, default optional arrays to empty, and version fields are present but optional. Fleet handoff records enforce a critical cross-field rule: non-done statuses must carry a `blocker` field.

## Invariants

- Strict schema bounds: all Zod schemas reject unknown keys; no permissive pass-through
- Positive value enforcement: leaseSeconds, maxTokens, envelopeTokens must be > 0; negative/zero values throw
- Blocker-required cross-field invariant: fleet handoff statuses in FLEET_HANDOFF_BLOCKER_REQUIRED_STATUSES (all non-done) must carry a non-empty blocker field
- Optional version fields: v fields default to their module constants when omitted; present but optional in parsing
- Optional arrays default to empty: evidence, next_steps, sources default to [] when omitted, never undefined
- Dual validation API: throwing forms (parseFleetHandoffRecord) assert; safe forms (validateFleetHandoffRecord) return tagged errors for caller control
- Closed taxonomies: FAILURE_CATEGORIES and STANDARD_COGNITIVE_MODES are fixed-size enumerations (7 and 6 entries) with no mutations
- Result type narrowing: Ok(v) and Err(e) create discriminated unions; isOk/isErr narrow types for pattern matching

## Interface Contract

```ts

```

## Dependency Slice

```
import { FLEET_CLAIM_VERSION, FleetClaim, FleetClaimSchema } from '../src/fleet-claim'
import { ContextBudgetSchema, FLEET_CONTEXT_BUDGET_VERSION, LeafContextEstimateSchema, LeafContextSpendSchema, safeParseLeafContextEstimate, validateLeafContextEstimate } from '../src/fleet-context-budget'
import { FLEET_HANDOFF_BLOCKER_REQUIRED_STATUSES, FLEET_HANDOFF_RECORD_VERSION, FleetHandoffRecord, FleetHandoffRecordSchema, parseFleetHandoffRecord, validateFleetHandoffRecord } from '../src/fleet-handoff'
import { FLEET_SPEND_BUDGET_VERSION, SpendEnvelopeSchema, validateSpendEnvelope } from '../src/fleet-spend-budget'
import { Err, FAILURE_CATEGORIES, Ok, SESSION_SECTION_NAMES, STANDARD_COGNITIVE_MODES, SessionEntry, SessionEntryStatus, SessionSectionName, SessionSections, isErr, isOk } from '../src/index.js'
import { MAINTENANCE_FINDINGS_CONTRACT_VERSION, formatFindingsContract, parseFindingsContract } from '../src/maintenance-findings'
import { NotificationDeliveryResultSchema, NotificationEnvelopeSchema, NotificationSinkConfigSchema, NotificationsConfigSchema } from '../src/notifications'
import { CapabilityTier, RoutingDecision, RoutingError, StagedWorkflowDecl, WorkflowConfig } from '../src/orchestrator'
import { PlanTaskSchema } from '../src/plan-task'
import { EmitSkillProposalInputSchema, ModelProposalContentSchema, ProposalKindSchema, ProposalSchema, ProposalStatusSchema, ProposalTypeSchema, SkillKindSchema, SkillProposalSchema, SkillProvenanceSchema, migrateProposalRecord } from '../src/proposals'
import { StageRun, WorkflowExecutionPlan } from '../src/workflow'
import { describe, expect, it } from 'vitest'
```
