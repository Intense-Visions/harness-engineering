---
schemaVersion: 1
module: 'packages/dashboard/src/client/components/webhooks'
sourceHash: '552bb5bbd1ad1c2ea01839b0135abe8cfe5b718e98db46868dce190b80bfd8da'
compiledAt: '2026-08-28T01:22:11.291Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['CreateSubscriptionForm.tsx', 'QueueStatsPanel.tsx', 'SubscriptionList.tsx']
---

## Summary

The webhooks module implements the dashboard's subscription management UI across four components. CreateSubscriptionForm collects webhook URLs and comma-separated event patterns; CreatedSecretBanner displays the one-time-only generated secret and subscription ID. SubscriptionList renders active subscriptions with delete capability. QueueStatsPanel polls live delivery queue stats (pending, retrying, in-flight, dead, delivered) from GET /api/v1/webhooks/queue/stats at 1s intervals per Spec D7, with conditional red highlighting when dead deliveries exceed zero. All components are presentation-only; parent containers manage state and mutations via callbacks.

## Invariants

- Secret from CreateSubscriptionForm is one-time-only and displayed once in CreatedSecretBanner; once dismissed, it cannot be retrieved.
- Queue stats are REST-polled (not SSE) at 1s cadence because the panel requires only periodic counters, not per-delivery events (Spec D7).
- Dead-queue cell in QueueStatsPanel must conditionally apply red styling (bg-red-900/30, text-red-400) when stats.dead > 0; this is the only visual alert for delivery failures.
- Event patterns are comma-delimited in both form input and SubscriptionList display; validation and parsing are upstream responsibilities.
- onRemove is the sole subscription mutation handler; no inline editing or re-subscription exists in this module.

## Interface Contract

```ts
export CreateSubscriptionForm
export CreatedSecretBanner
export QueueStatsPanel
export SubscriptionList
```

## Dependency Slice

```
import { WebhookSubscriptionPublic } from '@harness-engineering/types'
```
