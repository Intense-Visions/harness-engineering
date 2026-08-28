---
schemaVersion: 1
module: 'packages/core/src/fleet/claims'
sourceHash: '5ad65f452944dfacc681e873c1d61cfca79825157f920dc3ef47127f40c7e12a'
compiledAt: '2026-08-28T01:22:10.396Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  ['index.test.ts', 'index.ts', 'select.test.ts', 'select.ts', 'two-runner.integration.test.ts']
---

## Summary

`packages/core/src/fleet/claims` is a pure, offline primitives library for the cross-run fleet work-claim lease system. It provides serialization, TTL validation, and deterministic race arbitration—all without network, filesystem, or `gh` calls. The module lets fleet runs claim exclusive ownership of items via append-only GitHub comments. When two runs race to claim a stale item, `resolveClaimWinner` deterministically picks the winner based on GitHub's server timestamp, ensuring both racers independently agree. Key surface: `buildClaimBody`/`parseClaimComment` encode/decode claims as GitHub comment text; `isLeaseLive` validates staleness; `resolveClaimWinner` arbitrates reclaim races. Lease is 12 minutes (720s) with 4-minute heartbeat (240s).

## Invariants

- Server timestamp is the sole authority for lease staleness. isLeaseLive uses only serverUpdatedAt (GitHub's stamp), never claim.claimedAt, shielding against clock-skewed writers and preventing both premature expiry and over-trust.
- Race winner is deterministic and symmetric. Earliest server-stamped claim always wins; ties broken by lexicographic runId. Both racers run the same pure function over the same comments, so they independently agree—no split-brain or deadlock.
- Parsing never throws and tolerates malformed input. parseClaimComment returns null for missing markers, malformed JSON, or schema violations. Failures are soft (skipped) rather than exceptions.
- Round-trip fidelity guaranteed. buildClaimBody(claim) → parseClaimComment(body) always deep-equals the original claim. The JSON fence is the stable serialization format.
- All functions are pure offline transforms. No network, filesystem, or gh calls. Enforces injected-IO discipline—GitHub I/O lives in the skill/orchestration layer that calls these primitives.
- Lease TTL pattern is 12-min / 4-min heartbeat. The 720s lease with 240s heartbeat cadence means claims renew well before expiry and tolerate one missed heartbeat cycle.

## Interface Contract

```ts
export *
export CLAIM_LABEL
export CLAIM_MARKER
export DEFAULT_LEASE_SECONDS
export HEARTBEAT_SECONDS
export buildClaimBody
export isLeaseLive
export parseClaimComment
export resolveClaimWinner
```

## Dependency Slice

```
import { CLAIM_LABEL, CLAIM_MARKER, DEFAULT_LEASE_SECONDS, HEARTBEAT_SECONDS, buildClaimBody, isLeaseLive, parseClaimComment, resolveClaimWinner } from './index'
import { ItemClaimContext, classifyClaim, selectUnclaimed } from './select'
import { FLEET_CLAIM_VERSION, FleetClaim, FleetClaimSchema } from '@harness-engineering/types'
import { describe, expect, it } from 'vitest'
```
