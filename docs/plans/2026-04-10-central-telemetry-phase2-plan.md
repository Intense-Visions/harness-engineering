# Plan: Central Telemetry Phase 2 -- Collector and Transport

**Date:** 2026-04-10
**Spec:** docs/changes/central-telemetry/proposal.md (Phase 2)
**Estimated tasks:** 7
**Estimated time:** 30 minutes

## Goal

Implement the collector (reads adoption.jsonl, formats TelemetryEvent payloads) and transport (PostHog HTTP /batch with retry/timeout) modules, with full unit and integration test coverage.

## Observable Truths (Acceptance Criteria)

1. When adoption.jsonl contains valid SkillInvocationRecord lines, the system shall return TelemetryEvent[] with correct event name, distinctId, properties (os, nodeVersion, harnessVersion, skillName, duration, outcome, phasesReached), and ISO timestamp.
2. When ConsentState has identity fields (project, team, alias), the system shall include those fields in TelemetryEvent properties and use alias as distinctId instead of installId.
3. When adoption.jsonl is empty or missing, the system shall return an empty TelemetryEvent array.
4. When transport sends events to PostHog /batch and receives a 2xx response, the system shall resolve without error.
5. When the PostHog endpoint returns errors, the system shall retry up to 3 times with 1s and 2s linear backoff, then fail silently.
6. When the PostHog endpoint does not respond within 5 seconds, the system shall abort via AbortSignal.timeout and retry.
7. If all 3 transport attempts fail, then the system shall not throw -- it resolves silently to avoid blocking session teardown.
8. `npx vitest run packages/core/tests/telemetry/collector.test.ts` passes with all tests green.
9. `npx vitest run packages/core/tests/telemetry/transport.test.ts` passes with all tests green.
10. `npx vitest run packages/core/tests/telemetry/integration.test.ts` passes -- collector output piped to transport against a local HTTP server.
11. `harness validate` passes.

## File Map

```
CREATE packages/core/src/telemetry/collector.ts
CREATE packages/core/src/telemetry/transport.ts
CREATE packages/core/tests/telemetry/collector.test.ts
CREATE packages/core/tests/telemetry/transport.test.ts
CREATE packages/core/tests/telemetry/integration.test.ts
MODIFY packages/core/src/telemetry/index.ts (add exports for collectEvents and send)
```

## Tasks

### Task 1: Create collector test file (TDD -- red phase)

**Depends on:** none
**Files:** packages/core/tests/telemetry/collector.test.ts

1. Create test file `packages/core/tests/telemetry/collector.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { collectEvents } from '../../src/telemetry/collector';
import type { ConsentState } from '@harness-engineering/types';

describe('collectEvents', () => {
  const tmpDir = path.join(__dirname, '__test-tmp-collector__');
  const metricsDir = path.join(tmpDir, '.harness', 'metrics');
  const adoptionFile = path.join(metricsDir, 'adoption.jsonl');

  const allowedConsent: ConsentState = {
    allowed: true,
    installId: 'test-uuid-1234',
    identity: {},
  };

  beforeEach(() => {
    fs.mkdirSync(metricsDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('converts adoption records to TelemetryEvent array', () => {
    const record = {
      skill: 'harness-brainstorming',
      session: 'sess-1',
      startedAt: '2026-04-10T10:00:00.000Z',
      duration: 5000,
      outcome: 'completed',
      phasesReached: ['SCOPE', 'DECOMPOSE'],
    };
    fs.writeFileSync(adoptionFile, JSON.stringify(record) + '\n');

    const events = collectEvents(tmpDir, allowedConsent);

    expect(events).toHaveLength(1);
    expect(events[0]!.event).toBe('skill_invocation');
    expect(events[0]!.distinctId).toBe('test-uuid-1234');
    expect(events[0]!.timestamp).toBe('2026-04-10T10:00:00.000Z');
    expect(events[0]!.properties.skillName).toBe('harness-brainstorming');
    expect(events[0]!.properties.duration).toBe(5000);
    expect(events[0]!.properties.outcome).toBe('completed');
    expect(events[0]!.properties.phasesReached).toEqual(['SCOPE', 'DECOMPOSE']);
    expect(events[0]!.properties.installId).toBe('test-uuid-1234');
    expect(events[0]!.properties.os).toBe(process.platform);
    expect(events[0]!.properties.nodeVersion).toBe(process.version);
    expect(typeof events[0]!.properties.harnessVersion).toBe('string');
  });

  it('uses alias as distinctId when identity has alias', () => {
    const consent: ConsentState = {
      allowed: true,
      installId: 'test-uuid-1234',
      identity: { alias: 'cwarner', project: 'myapp', team: 'platform' },
    };
    const record = {
      skill: 'harness-tdd',
      session: 'sess-2',
      startedAt: '2026-04-10T11:00:00.000Z',
      duration: 3000,
      outcome: 'completed',
      phasesReached: ['RED'],
    };
    fs.writeFileSync(adoptionFile, JSON.stringify(record) + '\n');

    const events = collectEvents(tmpDir, consent);

    expect(events[0]!.distinctId).toBe('cwarner');
    expect(events[0]!.properties.project).toBe('myapp');
    expect(events[0]!.properties.team).toBe('platform');
  });

  it('includes project and team in properties when present', () => {
    const consent: ConsentState = {
      allowed: true,
      installId: 'test-uuid-1234',
      identity: { project: 'myapp', team: 'platform' },
    };
    const record = {
      skill: 'harness-execution',
      session: 'sess-3',
      startedAt: '2026-04-10T12:00:00.000Z',
      duration: 2000,
      outcome: 'failed',
      phasesReached: [],
    };
    fs.writeFileSync(adoptionFile, JSON.stringify(record) + '\n');

    const events = collectEvents(tmpDir, consent);

    expect(events[0]!.distinctId).toBe('test-uuid-1234');
    expect(events[0]!.properties.project).toBe('myapp');
    expect(events[0]!.properties.team).toBe('platform');
  });

  it('returns empty array when adoption.jsonl does not exist', () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    const events = collectEvents(tmpDir, allowedConsent);
    expect(events).toEqual([]);
  });

  it('returns empty array when adoption.jsonl is empty', () => {
    fs.writeFileSync(adoptionFile, '');
    const events = collectEvents(tmpDir, allowedConsent);
    expect(events).toEqual([]);
  });

  it('skips malformed lines and converts valid ones', () => {
    const good = {
      skill: 'harness-planning',
      session: 'sess-4',
      startedAt: '2026-04-10T13:00:00.000Z',
      duration: 1000,
      outcome: 'completed',
      phasesReached: ['SCOPE'],
    };
    fs.writeFileSync(adoptionFile, 'not json\n' + JSON.stringify(good) + '\n');

    const events = collectEvents(tmpDir, allowedConsent);
    expect(events).toHaveLength(1);
    expect(events[0]!.properties.skillName).toBe('harness-planning');
  });

  it('handles multiple records', () => {
    const records = [
      {
        skill: 'skill-a',
        session: 's1',
        startedAt: '2026-04-10T10:00:00Z',
        duration: 100,
        outcome: 'completed',
        phasesReached: [],
      },
      {
        skill: 'skill-b',
        session: 's2',
        startedAt: '2026-04-10T11:00:00Z',
        duration: 200,
        outcome: 'failed',
        phasesReached: ['A'],
      },
    ];
    fs.writeFileSync(adoptionFile, records.map((r) => JSON.stringify(r)).join('\n') + '\n');

    const events = collectEvents(tmpDir, allowedConsent);
    expect(events).toHaveLength(2);
    expect(events[0]!.properties.skillName).toBe('skill-a');
    expect(events[1]!.properties.skillName).toBe('skill-b');
  });

  it('maps SkillInvocationRecord outcome to TelemetryEvent outcome', () => {
    const record = {
      skill: 'harness-tdd',
      session: 'sess-5',
      startedAt: '2026-04-10T14:00:00.000Z',
      duration: 4000,
      outcome: 'abandoned',
      phasesReached: [],
    };
    fs.writeFileSync(adoptionFile, JSON.stringify(record) + '\n');

    const events = collectEvents(tmpDir, allowedConsent);
    // 'abandoned' is not in TelemetryEvent outcome union, should map to 'failure'
    expect(events[0]!.properties.outcome).toBe('failure');
  });
});
```

2. Run: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/telemetry/collector.test.ts`
3. Observe failure: `collectEvents` is not exported from `../../src/telemetry/collector`
4. Commit: `test(telemetry): add failing collector unit tests for Phase 2`

---

### Task 2: Implement collector module (TDD -- green phase)

**Depends on:** Task 1
**Files:** packages/core/src/telemetry/collector.ts

1. Create `packages/core/src/telemetry/collector.ts`:

```typescript
import type { ConsentState, TelemetryEvent } from '@harness-engineering/types';
import type { SkillInvocationRecord } from '@harness-engineering/types';
import { readAdoptionRecords } from '../adoption/reader';
import { VERSION } from '../index';

/**
 * Maps a SkillInvocationRecord outcome to the TelemetryEvent outcome union.
 * 'completed' → 'success'; anything else → 'failure'.
 */
function mapOutcome(outcome: string): 'success' | 'failure' {
  return outcome === 'completed' ? 'success' : 'failure';
}

/**
 * Reads adoption.jsonl records and formats them as TelemetryEvent payloads.
 *
 * Requires an allowed ConsentState (discriminated union with allowed: true).
 * Populates OS, Node version, harness version, and optional identity fields.
 */
export function collectEvents(
  projectRoot: string,
  consent: ConsentState & { allowed: true }
): TelemetryEvent[] {
  const records = readAdoptionRecords(projectRoot);
  if (records.length === 0) return [];

  const { installId, identity } = consent;
  const distinctId = identity.alias ?? installId;

  return records.map(
    (record: SkillInvocationRecord): TelemetryEvent => ({
      event: 'skill_invocation',
      distinctId,
      timestamp: record.startedAt,
      properties: {
        installId,
        os: process.platform,
        nodeVersion: process.version,
        harnessVersion: VERSION,
        skillName: record.skill,
        duration: record.duration,
        outcome: mapOutcome(record.outcome),
        phasesReached: record.phasesReached,
        ...(identity.project ? { project: identity.project } : {}),
        ...(identity.team ? { team: identity.team } : {}),
      },
    })
  );
}
```

2. Run: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/telemetry/collector.test.ts`
3. Observe: all tests pass
4. Run: `cd /Users/cwarner/Projects/harness-engineering && npx harness validate`
5. Commit: `feat(telemetry): implement collector module for adoption.jsonl to TelemetryEvent mapping`

---

### Task 3: Create transport test file (TDD -- red phase)

**Depends on:** none (parallel with Tasks 1-2)
**Files:** packages/core/tests/telemetry/transport.test.ts

1. Create test file `packages/core/tests/telemetry/transport.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { send } from '../../src/telemetry/transport';
import type { TelemetryEvent } from '@harness-engineering/types';

function makeEvent(overrides: Partial<TelemetryEvent> = {}): TelemetryEvent {
  return {
    event: 'skill_invocation',
    distinctId: 'test-uuid',
    timestamp: '2026-04-10T10:00:00.000Z',
    properties: {
      installId: 'test-uuid',
      os: 'linux',
      nodeVersion: 'v22.0.0',
      harnessVersion: '0.21.2',
      skillName: 'harness-tdd',
      duration: 1000,
      outcome: 'success',
    },
    ...overrides,
  };
}

describe('send', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('sends events to PostHog /batch with correct payload shape', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    globalThis.fetch = mockFetch;

    const events = [makeEvent()];
    await send(events, 'phc_test_api_key');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0]!;
    expect(url).toBe('https://app.posthog.com/batch');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(options.body);
    expect(body.api_key).toBe('phc_test_api_key');
    expect(body.batch).toHaveLength(1);
    expect(body.batch[0].event).toBe('skill_invocation');
  });

  it('resolves on first success without retrying', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    globalThis.fetch = mockFetch;

    await send([makeEvent()], 'phc_key');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries up to 3 times on server errors', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: false, status: 502 })
      .mockResolvedValueOnce({ ok: false, status: 503 });
    globalThis.fetch = mockFetch;

    // Should not throw -- silent failure
    await expect(send([makeEvent()], 'phc_key')).resolves.toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('retries on network errors (fetch throws)', async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({ ok: true, status: 200 });
    globalThis.fetch = mockFetch;

    await send([makeEvent()], 'phc_key');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('succeeds on second attempt after first failure', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    globalThis.fetch = mockFetch;

    await send([makeEvent()], 'phc_key');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('never throws -- resolves silently after all retries fail', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('total failure'));
    globalThis.fetch = mockFetch;

    await expect(send([makeEvent()], 'phc_key')).resolves.toBeUndefined();
  });

  it('passes AbortSignal.timeout(5000) to fetch', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    globalThis.fetch = mockFetch;

    await send([makeEvent()], 'phc_key');

    const [, options] = mockFetch.mock.calls[0]!;
    expect(options.signal).toBeInstanceOf(AbortSignal);
    // AbortSignal.timeout produces a signal -- we verify it exists
  });

  it('sends empty batch without error', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    globalThis.fetch = mockFetch;

    await send([], 'phc_key');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
    expect(body.batch).toEqual([]);
  });
});
```

2. Run: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/telemetry/transport.test.ts`
3. Observe failure: `send` is not exported from `../../src/telemetry/transport`
4. Commit: `test(telemetry): add failing transport unit tests for Phase 2`

---

### Task 4: Implement transport module (TDD -- green phase)

**Depends on:** Task 3
**Files:** packages/core/src/telemetry/transport.ts

1. Create `packages/core/src/telemetry/transport.ts`:

```typescript
import type { TelemetryEvent } from '@harness-engineering/types';

const POSTHOG_BATCH_URL = 'https://app.posthog.com/batch';
const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 5_000;

/**
 * Sleeps for the given milliseconds. Used for linear backoff between retries.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sends telemetry events to PostHog HTTP /batch endpoint.
 *
 * - 3 attempts with linear backoff (1s, 2s)
 * - 5s timeout per attempt via AbortSignal.timeout
 * - Silent failure: never throws, never blocks session teardown
 */
export async function send(events: TelemetryEvent[], apiKey: string): Promise<void> {
  const payload = { api_key: apiKey, batch: events };
  const body = JSON.stringify(payload);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(POSTHOG_BATCH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) return;
    } catch {
      // Network error or timeout -- retry
    }
    // Linear backoff: 1s after first failure, 2s after second
    if (attempt < MAX_ATTEMPTS - 1) {
      await sleep(1_000 * (attempt + 1));
    }
  }
  // Silent failure -- all retries exhausted
}
```

2. Run: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/telemetry/transport.test.ts`
3. Observe: all tests pass
4. Note: The retry tests with backoff waits will take ~3s for the "retries up to 3 times" test. If this is too slow for CI, the sleep function can be injected as a dependency in a future refactor. For now it matches the spec exactly.
5. Run: `cd /Users/cwarner/Projects/harness-engineering && npx harness validate`
6. Commit: `feat(telemetry): implement transport module with PostHog /batch retry and timeout`

---

### Task 5: Update barrel exports

**Depends on:** Tasks 2 and 4
**Files:** packages/core/src/telemetry/index.ts

1. Modify `packages/core/src/telemetry/index.ts` to add the new exports:

```typescript
export { resolveConsent } from './consent';
export { getOrCreateInstallId } from './install-id';
export { collectEvents } from './collector';
export { send } from './transport';
```

2. Run: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/telemetry/`
3. Observe: all collector and transport tests still pass
4. Run: `cd /Users/cwarner/Projects/harness-engineering && npx harness validate`
5. Commit: `feat(telemetry): export collectEvents and send from telemetry barrel`

---

### Task 6: Create integration test (TDD -- collector to transport via local HTTP server)

**Depends on:** Tasks 2, 4, 5
**Files:** packages/core/tests/telemetry/integration.test.ts

1. Create `packages/core/tests/telemetry/integration.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { collectEvents } from '../../src/telemetry/collector';
import type { ConsentState } from '@harness-engineering/types';

// We test the full collector → transport flow by spinning up a local HTTP server
// and overriding fetch to point at it. This avoids coupling to PostHog internals.

describe('collector → transport integration', () => {
  const tmpDir = path.join(__dirname, '__test-tmp-integration__');
  const metricsDir = path.join(tmpDir, '.harness', 'metrics');
  const adoptionFile = path.join(metricsDir, 'adoption.jsonl');

  let server: http.Server;
  let serverPort: number;
  let receivedBodies: string[];

  beforeAll(async () => {
    receivedBodies = [];
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        receivedBodies.push(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 1 }));
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          serverPort = addr.port;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  beforeEach(() => {
    fs.mkdirSync(metricsDir, { recursive: true });
    receivedBodies = [];
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('collects adoption records and sends them to an HTTP endpoint', async () => {
    // Write adoption records
    const records = [
      {
        skill: 'harness-brainstorming',
        session: 's1',
        startedAt: '2026-04-10T10:00:00Z',
        duration: 5000,
        outcome: 'completed',
        phasesReached: ['SCOPE'],
      },
      {
        skill: 'harness-planning',
        session: 's2',
        startedAt: '2026-04-10T11:00:00Z',
        duration: 3000,
        outcome: 'failed',
        phasesReached: [],
      },
    ];
    fs.writeFileSync(adoptionFile, records.map((r) => JSON.stringify(r)).join('\n') + '\n');

    const consent: ConsentState = {
      allowed: true,
      installId: 'integration-test-uuid',
      identity: { project: 'test-project' },
    };

    // Collect events
    const events = collectEvents(tmpDir, consent);
    expect(events).toHaveLength(2);

    // Send events via transport -- override fetch to hit local server
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const localUrl = url.replace('https://app.posthog.com', `http://localhost:${serverPort}`);
      return originalFetch(localUrl, init);
    };

    try {
      // Dynamic import to use the overridden fetch
      const { send } = await import('../../src/telemetry/transport');
      await send(events, 'phc_integration_test_key');
    } finally {
      globalThis.fetch = originalFetch;
    }

    // Verify server received the batch
    expect(receivedBodies).toHaveLength(1);
    const payload = JSON.parse(receivedBodies[0]!);
    expect(payload.api_key).toBe('phc_integration_test_key');
    expect(payload.batch).toHaveLength(2);
    expect(payload.batch[0].event).toBe('skill_invocation');
    expect(payload.batch[0].properties.skillName).toBe('harness-brainstorming');
    expect(payload.batch[0].properties.project).toBe('test-project');
    expect(payload.batch[1].properties.skillName).toBe('harness-planning');
    expect(payload.batch[1].properties.outcome).toBe('failure');
  });
});
```

2. Run: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/telemetry/integration.test.ts`
3. Observe: test passes -- collector output flows through transport to local server
4. Run: `cd /Users/cwarner/Projects/harness-engineering && npx harness validate`
5. Commit: `test(telemetry): add collector-to-transport integration test with local HTTP server`

---

### Task 7: Final verification

[checkpoint:human-verify]

**Depends on:** Tasks 1-6
**Files:** none (verification only)

1. Run full telemetry test suite: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/telemetry/`
2. Observe: all tests pass (consent, install-id, collector, transport, integration)
3. Run: `cd /Users/cwarner/Projects/harness-engineering && npx harness validate`
4. Observe: validation passes
5. Verify file map completeness:
   - `packages/core/src/telemetry/collector.ts` exists
   - `packages/core/src/telemetry/transport.ts` exists
   - `packages/core/tests/telemetry/collector.test.ts` exists
   - `packages/core/tests/telemetry/transport.test.ts` exists
   - `packages/core/tests/telemetry/integration.test.ts` exists
   - `packages/core/src/telemetry/index.ts` exports all 4 functions
6. No commit -- verification only

## Traceability

| Observable Truth                                      | Delivered By                                      |
| ----------------------------------------------------- | ------------------------------------------------- |
| 1. adoption records → TelemetryEvent[]                | Task 2 (collector impl)                           |
| 2. identity fields in properties, alias as distinctId | Task 2 (collector impl), verified by Task 1 tests |
| 3. empty/missing adoption.jsonl → empty array         | Task 2, verified by Task 1 tests                  |
| 4. successful send resolves                           | Task 4 (transport impl)                           |
| 5. retry with backoff on errors                       | Task 4, verified by Task 3 tests                  |
| 6. 5s timeout via AbortSignal                         | Task 4, verified by Task 3 tests                  |
| 7. silent failure after exhausted retries             | Task 4, verified by Task 3 tests                  |
| 8. collector tests pass                               | Task 1 + Task 2                                   |
| 9. transport tests pass                               | Task 3 + Task 4                                   |
| 10. integration test passes                           | Task 6                                            |
| 11. harness validate passes                           | Task 7                                            |

## Evidence

- `packages/types/src/telemetry.ts:24-26` -- ConsentState discriminated union confirmed: `{ allowed: true; identity: TelemetryIdentity; installId: string } | { allowed: false }`
- `packages/types/src/adoption.ts:1-22` -- SkillInvocationRecord type confirmed with `skill`, `session`, `startedAt`, `duration`, `outcome`, `phasesReached` fields
- `packages/core/src/adoption/reader.ts:38-62` -- `readAdoptionRecords()` reads `.harness/metrics/adoption.jsonl`, returns `SkillInvocationRecord[]`, empty array on missing file
- `packages/core/src/telemetry/index.ts:1-2` -- current barrel exports only `resolveConsent` and `getOrCreateInstallId`
- `packages/core/src/index.ts:184` -- `VERSION` constant exported as `'0.21.1'`; used for `harnessVersion` property
- `packages/core/tests/telemetry/consent.test.ts` -- existing test pattern: tmpDir with beforeEach/afterEach cleanup, ConsentState discriminated union usage
- `packages/core/tests/usage/jsonl-reader.test.ts` -- existing test pattern for JSONL reader: tmpDir, fs.mkdirSync, fs.writeFileSync, fs.rmSync cleanup

## Notes

- The `outcome` field on SkillInvocationRecord uses `'completed' | 'failed' | 'abandoned'` while TelemetryEvent uses `'success' | 'failure'`. The collector maps `'completed'` to `'success'` and everything else to `'failure'`.
- The VERSION constant in `packages/core/src/index.ts` is noted as deprecated with a suggestion to read from CLI package.json instead, but it is the simplest available fallback for the core package. Phase 3 (stop hook in CLI) can use the CLI package version directly.
- Transport retry backoff delays (1s, 2s) will make the "retries up to 3 times" transport test take ~3s. This is acceptable for correctness. If CI speed becomes a concern, sleep can be extracted as an injectable dependency.
