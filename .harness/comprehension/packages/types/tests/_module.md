---
schemaVersion: 1
module: 'packages/types/tests'
sourceHash: 'ebc90e7b66d1e677a0179e990cdb427ce6162f7862b3817f0400fe582b4f63b8'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'autonomy.test.ts',
    'fleet-claim.test.ts',
    'fleet-context-budget.test.ts',
    'fleet-handoff.test.ts',
    'fleet-spend-budget.test.ts',
    'index.test.ts',
    'maintenance-findings.test.ts',
    'notifications.test.ts',
    'pipeline-receipts.test.ts',
    'plan-task.test.ts',
    'proposals-migration.test.ts',
    'proposals.test.ts',
    'routing-error.test.ts',
    'session-state.test.ts',
    'workflow.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { FLEET_CLAIM_VERSION, FleetClaim, FleetClaimSchema } from '../src/fleet-claim'
import { ContextBudgetSchema, FLEET_CONTEXT_BUDGET_VERSION, LeafContextEstimateSchema, LeafContextSpendSchema, safeParseLeafContextEstimate, validateLeafContextEstimate } from '../src/fleet-context-budget'
import { FLEET_HANDOFF_BLOCKER_REQUIRED_STATUSES, FLEET_HANDOFF_RECORD_VERSION, FleetHandoffRecord, FleetHandoffRecordSchema, parseFleetHandoffRecord, validateFleetHandoffRecord } from '../src/fleet-handoff'
import { FLEET_SPEND_BUDGET_VERSION, SpendEnvelopeSchema, validateSpendEnvelope } from '../src/fleet-spend-budget'
import { AUTONOMY_LEVELS, AUTONOMY_SOURCES, AUTO_DECISION_AUDIT_STATUSES, AUTO_DECISION_PAUSE_CLASSES, AutoDecision, AutoDecisionSummary, AutonomySessionOverride, CONDITIONAL_REVIEWER_IDS, DEFAULT_AUTONOMY_AUDIT, ESCAPED_FROM_STAGES, FINDING_CLASSES, FULL_TIER_REVIEWER_IDS, LIGHT_TIER_REVIEWER_ID, REVIEW_BACKENDS, REVIEW_BASE_SOURCES, REVIEW_MOMENTS, REVIEW_TIERS, ResolvedAutonomy, ReviewReceipt } from '../src/index'
import { Err, FAILURE_CATEGORIES, Ok, SESSION_SECTION_NAMES, STANDARD_COGNITIVE_MODES, SessionEntry, SessionEntryStatus, SessionSectionName, SessionSections, isErr, isOk } from '../src/index.js'
import { MAINTENANCE_FINDINGS_CONTRACT_VERSION, formatFindingsContract, parseFindingsContract } from '../src/maintenance-findings'
import { NotificationDeliveryResultSchema, NotificationEnvelopeSchema, NotificationSinkConfigSchema, NotificationsConfigSchema } from '../src/notifications'
import { CapabilityTier, RoutingDecision, RoutingError, StagedWorkflowDecl, WorkflowConfig } from '../src/orchestrator'
import { PlanTaskSchema } from '../src/plan-task'
import { EmitSkillProposalInputSchema, ModelProposalContentSchema, ProposalKindSchema, ProposalSchema, ProposalStatusSchema, ProposalTypeSchema, SkillKindSchema, SkillProposalSchema, SkillProvenanceSchema, migrateProposalRecord } from '../src/proposals'
import { StageRun, WorkflowExecutionPlan } from '../src/workflow'
import { describe, expect, it } from 'vitest'
```
