---
schemaVersion: 1
module: 'packages/core/tests/telemetry'
sourceHash: '01559010beef48a0c14c6c96fd2fb5339b1a0c2df453bd1cdaccd45fa738294d'
compiledAt: '2026-08-28T01:22:11.101Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'collector.test.ts',
    'consent.test.ts',
    'install-id.test.ts',
    'integration.test.ts',
    'transport.test.ts',
  ]
---

## Summary

`packages/core/tests/telemetry` tests the harness telemetry pipeline: collecting adoption records (skill invocations), resolving user consent, managing install IDs, and transporting events. The system respects opt-out via environment variables (`DO_NOT_TRACK=1`, `HARNESS_TELEMETRY_OPTOUT=1`) and config flags, persists a stable UUID-based install ID per machine, and converts raw skill invocation logs (`.harness/metrics/adoption.jsonl`) into analytics events with metadata (OS, Node version, harness version, optional user identity). Event identity is routed via alias (if present) or install ID; outcome values are normalized (e.g., `abandoned` → `failure`); malformed JSONL lines are silently skipped. Project/team metadata comes from `.harness/telemetry.json` (preferred) or `harness.config.json` (fallback).

## Invariants

- Consent is hierarchical: environment variables override config; config.enabled defaults to true when unspecified
- Install ID is idempotent: .harness/.install-id persists a UUIDv4 across invocations; must be read on every call to remain stable
- Event identity routing: distinct_id is identity.alias if present, otherwise installId; omitting this breaks analytics de-duplication
- Outcome mapping is lossy: non-standard outcomes (abandoned) must map to an enum-defined value (failure); unmapped values break serialization
- JSONL parsing is resilient: malformed lines are skipped; valid lines processed; missing file returns [], not an error
- Identity source precedence: .harness/telemetry.json > harness.config.json > no value; breaking this order can lose user-configured metadata
- Event payload structure: every event includes installId, os, nodeVersion, harnessVersion, and optional project/team; missing fields break analytics queries

## Interface Contract

```ts

```

## Dependency Slice

```
import { collectEvents } from '../../src/telemetry/collector'
import { resolveConsent } from '../../src/telemetry/consent'
import { getOrCreateInstallId } from '../../src/telemetry/install-id'
import { send } from '../../src/telemetry/transport'
import { ConsentState, TelemetryEvent } from '@harness-engineering/types'
import * as fs from 'node:fs'
import * as http from 'node:http'
import * as path from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
```
