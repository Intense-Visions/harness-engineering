# Reference: packages / core / 1

Auto-generated reference index for previously-undocumented modules in this group. Each entry links the source file and summarizes its purpose and key exports.

## packages/core/src/harness-strength/auditor.ts

[`packages/core/src/harness-strength/auditor.ts`](/packages/core/src/harness-strength/auditor.ts)

**Exports:** `AuditOptions`, `HarnessStrengthAuditor`

## packages/core/src/harness-strength/rules/strength-001-nonblocking-hooks.ts

[`packages/core/src/harness-strength/rules/strength-001-nonblocking-hooks.ts`](/packages/core/src/harness-strength/rules/strength-001-nonblocking-hooks.ts)

STRENGTH-001 — non-blocking hooks.

**Exports:** `strength001NonblockingHooks`

## packages/core/src/harness-strength/rules/strength-002-autobaseline.ts

[`packages/core/src/harness-strength/rules/strength-002-autobaseline.ts`](/packages/core/src/harness-strength/rules/strength-002-autobaseline.ts)

STRENGTH-002 — auto-baseline on regression.

**Exports:** `strength002Autobaseline`

## packages/core/src/harness-strength/rules/strength-003-skip-list.ts

[`packages/core/src/harness-strength/rules/strength-003-skip-list.ts`](/packages/core/src/harness-strength/rules/strength-003-skip-list.ts)

STRENGTH-003 — oversized --skip list.

**Exports:** `strength003SkipList`

## packages/core/src/harness-strength/rules/strength-004-empty-thresholds.ts

[`packages/core/src/harness-strength/rules/strength-004-empty-thresholds.ts`](/packages/core/src/harness-strength/rules/strength-004-empty-thresholds.ts)

STRENGTH-004 — empty architecture.thresholds.

**Exports:** `strength004EmptyThresholds`

## packages/core/src/harness-strength/rules/strength-005-lowest-tier.ts

[`packages/core/src/harness-strength/rules/strength-005-lowest-tier.ts`](/packages/core/src/harness-strength/rules/strength-005-lowest-tier.ts)

STRENGTH-005 — lowest-tier default.

**Exports:** `strength005LowestTier`

## packages/core/src/harness-strength/rules/strength-006-autoapprove-baseline.ts

[`packages/core/src/harness-strength/rules/strength-006-autoapprove-baseline.ts`](/packages/core/src/harness-strength/rules/strength-006-autoapprove-baseline.ts)

STRENGTH-006 — auto-approved baseline PR.

**Exports:** `strength006AutoapproveBaseline`

## packages/core/src/harness-strength/rules/strength-007-snapshot-signal-mismatch.ts

[`packages/core/src/harness-strength/rules/strength-007-snapshot-signal-mismatch.ts`](/packages/core/src/harness-strength/rules/strength-007-snapshot-signal-mismatch.ts)

STRENGTH-007 — snapshot/signal mismatch (defense-in-depth backstop).

**Exports:** `strength007SnapshotSignalMismatch`

## packages/core/src/harness-strength/scoring.ts

[`packages/core/src/harness-strength/scoring.ts`](/packages/core/src/harness-strength/scoring.ts)

Per-severity point deduction.

**Exports:** `SEVERITY_WEIGHTS`, `tierFor`, `rollupScore`

## packages/core/src/locks/compound-lock.ts

[`packages/core/src/locks/compound-lock.ts`](/packages/core/src/locks/compound-lock.ts)

**Exports:** `CompoundLockHeldError`, `CompoundLockHandle`, `AcquireOptions`, `acquireCompoundLock`

## packages/core/src/proposals/store.ts

[`packages/core/src/proposals/store.ts`](/packages/core/src/proposals/store.ts)

**Exports:** `proposalsDir`, `ProposalNotFoundError`, `ProposalConflictError`, `createProposal`, `getProposal`, `ListProposalsOptions`, `listProposals`, `updateProposal`

## packages/core/src/pulse/config-writer.ts

[`packages/core/src/pulse/config-writer.ts`](/packages/core/src/pulse/config-writer.ts)

Absolute path to harness.config.json.

**Exports:** `WritePulseConfigOptions`, `writePulseConfig`

## packages/core/src/pulse/run/window.ts

[`packages/core/src/pulse/run/window.ts`](/packages/core/src/pulse/run/window.ts)

Parse a lookback string into milliseconds.

**Exports:** `parseLookback`, `computeWindow`

## packages/core/src/pulse/sanitize.ts

[`packages/core/src/pulse/sanitize.ts`](/packages/core/src/pulse/sanitize.ts)

The only field keys allowed in a SanitizedResult.fields.

**Exports:** `ALLOWED_FIELD_KEYS`, `PII_TOKENS`, `PII_FIELD_DENYLIST`, `PII_LINE_RE`, `isSanitizedResult`, `assertSanitized`

## packages/core/src/pulse/strategy-seeder.ts

[`packages/core/src/pulse/strategy-seeder.ts`](/packages/core/src/pulse/strategy-seeder.ts)

**Exports:** `StrategySeed`, `SeedOptions`, `seedFromStrategy`

## packages/core/src/review/agents/adversarial-agent.ts

[`packages/core/src/review/agents/adversarial-agent.ts`](/packages/core/src/review/agents/adversarial-agent.ts)

Adversarial review agent — looks for failure modes between the existing 4 agents: assumption violations, composition failures, abuse cases, and (at Deep depth) cascade chains.

**Exports:** `ADVERSARIAL_DESCRIPTOR`, `runAdversarialAgent`

## packages/core/src/review/agents/frontend-races-agent.ts

[`packages/core/src/review/agents/frontend-races-agent.ts`](/packages/core/src/review/agents/frontend-races-agent.ts)

Frontend-races review agent — activated when typescript-strict is active AND an async-UI signal is present in the diff (.tsx, useEffect, setTimeout, setInterval, addEventListener, data-controller=, etc.).

**Exports:** `FRONTEND_RACES_DESCRIPTOR`, `runFrontendRacesAgent`

## packages/core/src/review/agents/typescript-strict-agent.ts

[`packages/core/src/review/agents/typescript-strict-agent.ts`](/packages/core/src/review/agents/typescript-strict-agent.ts)

TypeScript-strict review agent — activated when a non-test `.ts` or `.tsx` is in the diff.

**Exports:** `TYPESCRIPT_STRICT_DESCRIPTOR`, `runTypescriptStrictAgent`
