# Plan: Feedback Loops — Phase 4: harness pulse run CLI

**Date:** 2026-05-05
**Spec:** [docs/changes/compound-engineering-adoption/feedback-loops/proposal.md](../proposal.md)
**Phase:** 4 of 8 (harness pulse run CLI, complexity: high — interactive plan)
**Tasks:** 13
**Time:** ~53 min
**Integration Tier:** medium
**Rigor:** standard

## Goal

Provide a non-interactive `harness pulse run` CLI subcommand that, given a configured `pulse:` block in `harness.config.json`, fetches signals from registered adapters in parallel (with serial DB fallthrough), sanitizes results with defense-in-depth (`adapter.sanitize()` + orchestrator `assertSanitized()`), assembles a single-page report (≤40 lines, 4-section template), and writes it to `docs/pulse-reports/YYYY-MM-DD_HH-MM.md`. Ship one mock reference adapter so the integration is exercised end-to-end before Phase 6 wires the maintenance task.

## Observable Truths (Acceptance Criteria)

1. `harness pulse run --lookback 24h` against a project with `pulse.enabled: true` and a registered `mock` adapter writes a file matching `docs/pulse-reports/\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.md` and exits 0.
2. The same invocation against a project with `pulse.enabled: false` exits with the maintenance-task `skipped` semantic — stdout JSON line `{"status":"skipped","reason":"pulse.enabled is false"}` and exit code 0 (NOT failure).
3. With `--lookback` omitted, `pulse.lookbackDefault` is used; with both omitted, fallback is `24h`. Verified by unit test.
4. `computeWindow(now, "24h", 15)` returns `{start: now - 24h - 15m, end: now - 15m}`. Verified by unit test.
5. The orchestrator dispatches analytics + tracing + payments adapters in parallel via `Promise.all`; DB adapters (when configured) run serially after the parallel batch. Verified by integration test with timing + ordering assertion.
6. If an adapter has no `sanitize` registered, the orchestrator skips that source with a warning AND records it in the JSON status `sourcesSkipped` array.
7. Every adapter result passes through `assertSanitized(adapter.sanitize(raw))` at the orchestrator boundary. If `assertSanitized` throws, the source is skipped with the error message; other sources proceed.
8. A mock adapter that intentionally emits a PII field (`email: "x@y.com"`) is dropped by `sanitize`; the report contains zero references to `email` or the value. Verified by integration test.
9. Generated reports are ≤40 lines; if assembly produces more, the `Followups` section is truncated last-line-first until under threshold. A warning is logged on truncate.
10. Interactive mode (TTY): write file, print Headlines (2-3 lines) + path to stdout, exit 0. Non-interactive mode (`--non-interactive` flag OR `!process.stdout.isTTY`): write file, emit single-line JSON `{"status","path","headlinesSummary","durationMs","sourcesQueried","sourcesSkipped"}` to stdout.
11. The `mock` adapter is registered automatically when `@harness-engineering/core` is imported (side-effect registration in `pulse/adapters/index.ts`).
12. `harness validate` and `harness check-deps` pass after the phase.
13. `pnpm -F @harness-engineering/core test` passes (existing pulse tests + ~15 new tests added by this phase).

## File Map

### Modify

- `packages/types/src/pulse.ts` — add `PulseAdapter` interface with `query: (window: PulseWindow, eventNames?: string[]) => Promise<unknown>` and `sanitize: SanitizeFn`. Add `PulseWindow` (`{start: Date; end: Date}`) and `PulseRunStatus` (`{status: 'success'|'skipped'|'failure'; ...}`) types.
- `packages/types/src/index.ts` — barrel-export new types.
- `packages/core/src/pulse/adapters/registry.ts` — registry stores `PulseAdapter` (the full `{query, sanitize}` object) instead of `{sanitize}`. `registerPulseAdapter` signature changes; `getPulseAdapter` returns full adapter.
- `packages/core/src/pulse/adapters/registry.test.ts` — update existing tests; add tests for `query` field requirement.
- `packages/core/src/pulse/index.ts` — re-export `run/` and `adapters/mock` (side-effect import).
- `packages/cli/src/bin/harness.ts` (or the actual subcommand registration site — verify location during execution) — register `pulse run` subcommand.
- `packages/core/src/pulse/adapters/index.ts` — side-effect register the mock adapter so `import '@harness-engineering/core'` makes it available.

### Create

- `packages/core/src/pulse/run/window.ts` — pure `computeWindow(now: Date, lookback: string, bufferMinutes?: number): PulseWindow`. Parses lookback strings (`24h`, `7d`, `1h`).
- `packages/core/src/pulse/run/window.test.ts`
- `packages/core/src/pulse/adapters/mock.ts` — registers `'mock'` adapter; `query` returns canned data; `sanitize` applies allowlist + denylist.
- `packages/core/src/pulse/adapters/mock.test.ts`
- `packages/core/src/pulse/run/orchestrator.ts` — `runPulse(config, window)` dispatches analytics/tracing/payments in parallel; DB serial; wraps every adapter call in `assertSanitized(adapter.sanitize(raw))`; returns `{sources: SanitizedResult[], sourcesQueried, sourcesSkipped, durationMs}`.
- `packages/core/src/pulse/run/orchestrator.test.ts`
- `packages/core/src/pulse/run/template.md` — 4-section Markdown template with placeholders. Loaded at runtime via `import.meta.url` resolution or fs read of a known path.
- `packages/core/src/pulse/run/report.ts` — `assembleReport(orchestratorResult, productName): string` fills template, enforces ≤40 lines (truncates Followups section last-line-first), final PII sweep on output (regex check against `PII_FIELD_DENYLIST` patterns).
- `packages/core/src/pulse/run/report.test.ts`
- `packages/core/src/pulse/run/index.ts` — barrel: `runPulse`, `assembleReport`, `computeWindow`, types.
- `packages/cli/src/commands/pulse-run.ts` — `runPulseRunCommand({lookback, nonInteractive, configPath, outputDir})`: load config → check enabled → compute window → orchestrate → assemble → write file → emit headlines (TTY) or JSON status (non-TTY).
- `packages/cli/src/commands/pulse-run.test.ts`

## Skeleton

```
1. Adapter contract: extend types, registry stores {query, sanitize}            (~2 tasks, ~7 min)
2. Window/trailing-buffer utility (TDD)                                          (~2 tasks, ~5 min)
3. Mock reference adapter (TDD)                                                  (~2 tasks, ~6 min)
4. Pulse runner orchestrator: parallel + serial + assertSanitized (TDD)          (~2 tasks, ~10 min)
5. Report assembler: 4-section template + ≤40 line guard + final PII sweep (TDD) (~2 tasks, ~10 min)
6. CLI subcommand `pulse run` with interactive + non-interactive modes (TDD)     (~2 tasks, ~10 min)
7. End-to-end integration test: mock adapter → CLI → report file                 (~1 task, ~5 min)

Estimated total: 13 tasks, ~53 minutes
```

_Skeleton approved: yes (interactive planning session 2026-05-05)._

## Tasks

### Task 1: Extend PulseAdapter type and supporting types

**Depends on:** none | **Files:** `packages/types/src/pulse.ts`, `packages/types/src/index.ts`

1. Open `packages/types/src/pulse.ts`. Add the following types (preserve existing `PulseConfig`, `PulseSources`, `PulseDbSource`, `SanitizedResult`, `SanitizeFn`):

```typescript
export interface PulseWindow {
  start: Date;
  end: Date;
}

export interface PulseAdapter {
  query: (window: PulseWindow, eventNames?: string[]) => Promise<unknown>;
  sanitize: SanitizeFn;
}

export type PulseRunStatusType = 'success' | 'skipped' | 'failure';

export interface PulseRunStatus {
  status: PulseRunStatusType;
  path?: string;
  headlinesSummary?: string;
  durationMs?: number;
  sourcesQueried?: string[];
  sourcesSkipped?: Array<{ name: string; reason: string }>;
  reason?: string;
}
```

2. Open `packages/types/src/index.ts`. Add `PulseWindow`, `PulseAdapter`, `PulseRunStatusType`, `PulseRunStatus` to the existing `pulse.ts` re-exports.

3. Run: `pnpm -F @harness-engineering/types build && pnpm -F @harness-engineering/types typecheck`. Both must pass.

4. Run: `harness validate`

5. Commit: `feat(types): add PulseAdapter, PulseWindow, PulseRunStatus types`

### Task 2: Update registry to store PulseAdapter (query + sanitize)

**Depends on:** Task 1 | **Files:** `packages/core/src/pulse/adapters/registry.ts`, `packages/core/src/pulse/adapters/registry.test.ts`

1. Open `packages/core/src/pulse/adapters/registry.test.ts`. Update existing tests AND add new test cases asserting:
   - `registerPulseAdapter('a', { query, sanitize })` succeeds
   - `registerPulseAdapter('a', { sanitize })` (missing `query`) throws `TypeError` mentioning the missing field
   - `registerPulseAdapter('a', { query })` (missing `sanitize`) throws `TypeError` mentioning the missing field
   - `getPulseAdapter('a')` returns the full `{query, sanitize}` object
   - `listPulseAdapters()` returns the names
2. Run: `pnpm -F @harness-engineering/core test pulse/adapters/registry` — observe failure
3. Open `packages/core/src/pulse/adapters/registry.ts`. Update:
   - Map type from `Map<string, {sanitize: SanitizeFn}>` to `Map<string, PulseAdapter>`
   - `registerPulseAdapter(name: string, adapter: PulseAdapter)` — runtime guard requires both `query` and `sanitize` to be functions; throw `TypeError` with the missing field name
   - `getPulseAdapter(name)` returns `PulseAdapter | undefined` (full object)
   - Keep `clearPulseAdapters` and `PulseAdapterAlreadyRegisteredError` unchanged
4. Run: `pnpm -F @harness-engineering/core test pulse/adapters/registry` — observe pass
5. Run: `harness validate && harness check-deps`
6. Commit: `feat(core): registry stores PulseAdapter with query and sanitize`

### Task 3: Window/trailing-buffer utility tests (TDD)

**Depends on:** Task 1 | **Files:** `packages/core/src/pulse/run/window.test.ts`

1. Create `packages/core/src/pulse/run/window.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeWindow, parseLookback } from './window';

describe('parseLookback', () => {
  it.each([
    ['24h', 24 * 60 * 60 * 1000],
    ['7d', 7 * 24 * 60 * 60 * 1000],
    ['1h', 60 * 60 * 1000],
    ['48h', 48 * 60 * 60 * 1000],
  ])('parses %s to %d ms', (input, expected) => {
    expect(parseLookback(input)).toBe(expected);
  });

  it.each(['1m', 'abc', '', '24', 'h24'])('rejects %p', (input) => {
    expect(() => parseLookback(input)).toThrow(/lookback/i);
  });
});

describe('computeWindow', () => {
  it('applies 15-minute trailing buffer to upper bound', () => {
    const now = new Date('2026-05-05T12:00:00Z');
    const w = computeWindow(now, '24h', 15);
    expect(w.end).toEqual(new Date('2026-05-05T11:45:00Z'));
    expect(w.start).toEqual(new Date('2026-05-04T11:45:00Z'));
  });

  it('uses default 15-minute buffer when omitted', () => {
    const now = new Date('2026-05-05T12:00:00Z');
    const w = computeWindow(now, '24h');
    expect(w.end).toEqual(new Date('2026-05-05T11:45:00Z'));
  });

  it('supports zero buffer', () => {
    const now = new Date('2026-05-05T12:00:00Z');
    const w = computeWindow(now, '1h', 0);
    expect(w.end).toEqual(now);
    expect(w.start).toEqual(new Date('2026-05-05T11:00:00Z'));
  });
});
```

2. Run: `pnpm -F @harness-engineering/core test pulse/run/window` — observe failure (file not yet implemented)
3. Commit: `test(core): failing tests for pulse run window utility`

### Task 4: Implement window/trailing-buffer utility

**Depends on:** Task 3 | **Files:** `packages/core/src/pulse/run/window.ts`

1. Create `packages/core/src/pulse/run/window.ts`:

```typescript
import type { PulseWindow } from '@harness-engineering/types';

const LOOKBACK_RE = /^(\d+)(h|d)$/;

export function parseLookback(input: string): number {
  const match = LOOKBACK_RE.exec(input);
  if (!match) {
    throw new Error(`Invalid lookback "${input}": expected format like "24h" or "7d"`);
  }
  const n = Number(match[1]);
  const unit = match[2];
  return unit === 'h' ? n * 60 * 60 * 1000 : n * 24 * 60 * 60 * 1000;
}

export function computeWindow(now: Date, lookback: string, bufferMinutes = 15): PulseWindow {
  const lookbackMs = parseLookback(lookback);
  const bufferMs = bufferMinutes * 60 * 1000;
  const end = new Date(now.getTime() - bufferMs);
  const start = new Date(end.getTime() - lookbackMs);
  return { start, end };
}
```

2. Run: `pnpm -F @harness-engineering/core test pulse/run/window` — observe pass
3. Run: `harness validate`
4. Commit: `feat(core): pulse run window utility with trailing-buffer math`

### Task 5: Mock reference adapter tests (TDD)

**Depends on:** Task 2 | **Files:** `packages/core/src/pulse/adapters/mock.test.ts`

1. Create `packages/core/src/pulse/adapters/mock.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { clearPulseAdapters, getPulseAdapter } from './registry';
import { registerMockAdapter, MOCK_ADAPTER_NAME } from './mock';
import { assertSanitized } from '../sanitize';

describe('mock adapter', () => {
  beforeEach(() => {
    clearPulseAdapters();
  });

  it('registers under name "mock"', () => {
    registerMockAdapter();
    const adapter = getPulseAdapter(MOCK_ADAPTER_NAME);
    expect(adapter).toBeDefined();
    expect(typeof adapter?.query).toBe('function');
    expect(typeof adapter?.sanitize).toBe('function');
  });

  it('query returns canned data with allowlisted fields only', async () => {
    registerMockAdapter();
    const adapter = getPulseAdapter('mock')!;
    const w = { start: new Date('2026-05-04T00:00:00Z'), end: new Date('2026-05-05T00:00:00Z') };
    const raw = await adapter.query(w);
    expect(raw).toMatchObject({
      event_name: expect.any(String),
      count: expect.any(Number),
      timestamp_bucket: expect.any(String),
    });
  });

  it('sanitize drops PII denylisted fields', () => {
    registerMockAdapter();
    const adapter = getPulseAdapter('mock')!;
    const dirty = { event_name: 'click', count: 5, email: 'x@y.com', user_id: 'u123' };
    const sanitized = adapter.sanitize(dirty);
    expect(sanitized).not.toHaveProperty('email');
    expect(sanitized).not.toHaveProperty('user_id');
    expect(sanitized).toHaveProperty('count', 5);
    assertSanitized(sanitized); // throws if any PII slipped through
  });
});
```

2. Run: `pnpm -F @harness-engineering/core test pulse/adapters/mock` — observe failure
3. Commit: `test(core): failing tests for mock pulse adapter`

### Task 6: Implement mock adapter and side-effect register

**Depends on:** Task 5 | **Files:** `packages/core/src/pulse/adapters/mock.ts`, `packages/core/src/pulse/adapters/index.ts`, `packages/core/src/pulse/index.ts`

1. Create `packages/core/src/pulse/adapters/mock.ts`:

```typescript
import type { PulseAdapter, PulseWindow, SanitizedResult } from '@harness-engineering/types';
import { registerPulseAdapter } from './registry';
import { ALLOWED_FIELD_KEYS, PII_FIELD_DENYLIST } from '../sanitize';

export const MOCK_ADAPTER_NAME = 'mock';

const adapter: PulseAdapter = {
  async query(_window: PulseWindow, _eventNames?: string[]): Promise<unknown> {
    return {
      event_name: 'mock.event',
      count: 42,
      timestamp_bucket: new Date().toISOString().slice(0, 10),
      latency_ms: 123,
    };
  },
  sanitize(raw: unknown): SanitizedResult {
    const sanitized: Record<string, unknown> = {};
    if (raw && typeof raw === 'object') {
      for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        if (PII_FIELD_DENYLIST.test(key)) continue;
        if (!ALLOWED_FIELD_KEYS.has(key)) continue;
        sanitized[key] = value;
      }
    }
    return {
      event_name: String(sanitized.event_name ?? 'unknown'),
      counts: { default: Number(sanitized.count ?? 0) },
      distributions: {},
    };
  },
};

export function registerMockAdapter(): void {
  registerPulseAdapter(MOCK_ADAPTER_NAME, adapter);
}
```

2. Open `packages/core/src/pulse/adapters/index.ts`. Add side-effect import + registration:

```typescript
export * from './registry';
export * from './mock';

import { registerMockAdapter } from './mock';
registerMockAdapter();
```

3. Open `packages/core/src/pulse/index.ts`. Ensure `adapters/index.ts` is re-exported (it likely already is — verify).
4. Run: `pnpm -F @harness-engineering/core test pulse/adapters/mock` — observe pass
5. Run: `pnpm -F @harness-engineering/core typecheck`
6. Run: `harness validate && harness check-deps`
7. Commit: `feat(core): mock pulse adapter with allowlist/denylist sanitize`

### Task 7: Pulse runner orchestrator tests (TDD)

**Depends on:** Tasks 4, 6 | **Files:** `packages/core/src/pulse/run/orchestrator.test.ts`

1. Create `packages/core/src/pulse/run/orchestrator.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { runPulse } from './orchestrator';
import { clearPulseAdapters, registerPulseAdapter } from '../adapters/registry';
import { computeWindow } from './window';
import type { PulseConfig } from '@harness-engineering/types';

const baseConfig: PulseConfig = {
  enabled: true,
  lookbackDefault: '24h',
  primaryEvent: 'click',
  valueEvent: 'value',
  completionEvents: [],
  qualityScoring: false,
  qualityDimension: null,
  sources: { analytics: 'mock', tracing: null, payments: null, db: { enabled: false } },
  metricSourceOverrides: {},
  pendingMetrics: [],
  excludedMetrics: [],
};

describe('runPulse orchestrator', () => {
  beforeEach(() => clearPulseAdapters());

  it('queries registered adapters and returns sanitized results', async () => {
    let queried = false;
    registerPulseAdapter('mock', {
      query: async () => {
        queried = true;
        return { event_name: 'x', count: 1 };
      },
      sanitize: (raw) => ({ event_name: 'x', counts: { default: 1 }, distributions: {} }),
    });
    const window = computeWindow(new Date('2026-05-05T12:00:00Z'), '24h');
    const result = await runPulse(
      { ...baseConfig, sources: { ...baseConfig.sources, analytics: 'mock' } },
      window
    );
    expect(queried).toBe(true);
    expect(result.sourcesQueried).toContain('mock');
    expect(result.sources).toHaveLength(1);
  });

  it('skips source with missing adapter and records reason', async () => {
    const window = computeWindow(new Date(), '24h');
    const result = await runPulse(
      { ...baseConfig, sources: { ...baseConfig.sources, analytics: 'unregistered' } },
      window
    );
    expect(result.sourcesSkipped.find((s) => s.name === 'unregistered')).toBeDefined();
    expect(result.sourcesQueried).not.toContain('unregistered');
  });

  it('skips source whose sanitize emits PII (assertSanitized throws)', async () => {
    registerPulseAdapter('leaky', {
      query: async () => ({ email: 'x@y.com' }),
      sanitize: () => ({ email: 'x@y.com' }) as never, // intentionally bad
    });
    const window = computeWindow(new Date(), '24h');
    const result = await runPulse(
      { ...baseConfig, sources: { ...baseConfig.sources, analytics: 'leaky' } },
      window
    );
    expect(result.sourcesSkipped.find((s) => s.name === 'leaky')).toBeDefined();
  });

  it('runs analytics+tracing+payments in parallel; DB serial', async () => {
    const order: string[] = [];
    registerPulseAdapter('a', {
      query: async () => {
        order.push('a-start');
        await new Promise((r) => setTimeout(r, 5));
        order.push('a-end');
        return { event_name: 'a', count: 1 };
      },
      sanitize: () => ({ event_name: 'a', counts: { default: 1 }, distributions: {} }),
    });
    registerPulseAdapter('t', {
      query: async () => {
        order.push('t-start');
        await new Promise((r) => setTimeout(r, 5));
        order.push('t-end');
        return { event_name: 't', count: 1 };
      },
      sanitize: () => ({ event_name: 't', counts: { default: 1 }, distributions: {} }),
    });
    registerPulseAdapter('d', {
      query: async () => {
        order.push('d-start');
        order.push('d-end');
        return { event_name: 'd', count: 1 };
      },
      sanitize: () => ({ event_name: 'd', counts: { default: 1 }, distributions: {} }),
    });
    const window = computeWindow(new Date(), '24h');
    await runPulse(
      {
        ...baseConfig,
        sources: {
          analytics: 'a',
          tracing: 't',
          payments: null,
          db: { enabled: true, source: 'd' } as never,
        },
      },
      window
    );
    // a-start and t-start both fire before either ends (parallel)
    expect(order.indexOf('a-start')).toBeLessThan(order.indexOf('t-end'));
    expect(order.indexOf('t-start')).toBeLessThan(order.indexOf('a-end'));
    // d-start fires after both a-end and t-end (serial)
    expect(order.indexOf('d-start')).toBeGreaterThan(order.indexOf('a-end'));
    expect(order.indexOf('d-start')).toBeGreaterThan(order.indexOf('t-end'));
  });
});
```

2. Run: `pnpm -F @harness-engineering/core test pulse/run/orchestrator` — observe failure
3. Commit: `test(core): failing tests for pulse run orchestrator`

### Task 8: Implement pulse runner orchestrator

**Depends on:** Task 7 | **Files:** `packages/core/src/pulse/run/orchestrator.ts`, `packages/core/src/pulse/run/index.ts`

1. Create `packages/core/src/pulse/run/orchestrator.ts`:

```typescript
import type {
  PulseAdapter,
  PulseConfig,
  PulseWindow,
  SanitizedResult,
} from '@harness-engineering/types';
import { getPulseAdapter } from '../adapters/registry';
import { assertSanitized } from '../sanitize';

export interface OrchestratorResult {
  sources: SanitizedResult[];
  sourcesQueried: string[];
  sourcesSkipped: Array<{ name: string; reason: string }>;
  durationMs: number;
}

async function querySource(
  name: string,
  window: PulseWindow
): Promise<{ ok: true; result: SanitizedResult } | { ok: false; reason: string }> {
  const adapter = getPulseAdapter(name);
  if (!adapter) return { ok: false, reason: `no adapter registered for "${name}"` };
  try {
    const raw = await adapter.query(window);
    const sanitized = adapter.sanitize(raw);
    assertSanitized(sanitized);
    return { ok: true, result: sanitized };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

export async function runPulse(
  config: PulseConfig,
  window: PulseWindow
): Promise<OrchestratorResult> {
  const startedAt = Date.now();
  const sources: SanitizedResult[] = [];
  const sourcesQueried: string[] = [];
  const sourcesSkipped: Array<{ name: string; reason: string }> = [];

  // Parallel batch: analytics, tracing, payments
  const parallelNames = [
    config.sources.analytics,
    config.sources.tracing,
    config.sources.payments,
  ].filter((n): n is string => n != null);
  const parallelResults = await Promise.all(
    parallelNames.map((n) => querySource(n, window).then((r) => [n, r] as const))
  );
  for (const [name, r] of parallelResults) {
    if (r.ok) {
      sources.push(r.result);
      sourcesQueried.push(name);
    } else sourcesSkipped.push({ name, reason: r.reason });
  }

  // Serial batch: DB (when configured)
  if (config.sources.db.enabled && (config.sources.db as { source?: string }).source) {
    const name = (config.sources.db as { source: string }).source;
    const r = await querySource(name, window);
    if (r.ok) {
      sources.push(r.result);
      sourcesQueried.push(name);
    } else sourcesSkipped.push({ name, reason: r.reason });
  }

  return { sources, sourcesQueried, sourcesSkipped, durationMs: Date.now() - startedAt };
}
```

2. Create `packages/core/src/pulse/run/index.ts`:

```typescript
export * from './window';
export * from './orchestrator';
export * from './report';
```

3. Run: `pnpm -F @harness-engineering/core test pulse/run/orchestrator` — observe pass
4. Run: `pnpm -F @harness-engineering/core typecheck`
5. Run: `harness validate && harness check-deps`
6. Commit: `feat(core): pulse run orchestrator with parallel+serial dispatch and assertSanitized double-check`

### Task 9: Report assembler tests (TDD)

**Depends on:** Task 8 | **Files:** `packages/core/src/pulse/run/report.test.ts`, `packages/core/src/pulse/run/template.md`

1. Create `packages/core/src/pulse/run/template.md`:

```markdown
# {{productName}} Pulse — {{windowLabel}}

## Headlines

{{headlines}}

## Usage

{{usage}}

## System performance

{{systemPerformance}}

## Followups

{{followups}}
```

2. Create `packages/core/src/pulse/run/report.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { assembleReport } from './report';
import type { OrchestratorResult } from './orchestrator';

const baseResult: OrchestratorResult = {
  sources: [{ event_name: 'click', counts: { default: 100 }, distributions: {} }],
  sourcesQueried: ['mock'],
  sourcesSkipped: [],
  durationMs: 250,
};

describe('assembleReport', () => {
  it('produces a report ≤40 lines with all 4 sections', () => {
    const out = assembleReport(baseResult, 'TestProduct', '24h');
    const lines = out.split('\n');
    expect(lines.length).toBeLessThanOrEqual(40);
    expect(out).toContain('# TestProduct Pulse');
    expect(out).toContain('## Headlines');
    expect(out).toContain('## Usage');
    expect(out).toContain('## System performance');
    expect(out).toContain('## Followups');
  });

  it('truncates Followups section when output exceeds 40 lines', () => {
    const fat: OrchestratorResult = {
      ...baseResult,
      sourcesSkipped: Array.from({ length: 80 }, (_, i) => ({
        name: `s${i}`,
        reason: 'long reason text that produces a wide followups list',
      })),
    };
    const out = assembleReport(fat, 'P', '24h');
    expect(out.split('\n').length).toBeLessThanOrEqual(40);
  });

  it('contains no PII denylisted patterns in the final output (final sweep)', () => {
    // Force a result that somehow slips through — verify the final sweep
    const tainted: OrchestratorResult = {
      sources: [{ event_name: 'leak', counts: { default: 1 }, distributions: {} } as never],
      sourcesQueried: ['leak'],
      sourcesSkipped: [{ name: 'oops', reason: 'contained user_id in error' }],
      durationMs: 1,
    };
    const out = assembleReport(tainted, 'P', '24h');
    expect(out).not.toMatch(/user_id|email|session_id/i);
  });
});
```

3. Run: `pnpm -F @harness-engineering/core test pulse/run/report` — observe failure
4. Commit: `test(core): failing tests for pulse run report assembler`

### Task 10: Implement report assembler

**Depends on:** Task 9 | **Files:** `packages/core/src/pulse/run/report.ts`

1. Create `packages/core/src/pulse/run/report.ts`:

```typescript
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PII_FIELD_DENYLIST } from '../sanitize';
import type { OrchestratorResult } from './orchestrator';

const TEMPLATE_PATH = join(dirname(fileURLToPath(import.meta.url)), 'template.md');
const MAX_LINES = 40;

function loadTemplate(): string {
  return readFileSync(TEMPLATE_PATH, 'utf-8');
}

function buildHeadlines(r: OrchestratorResult): string {
  const total = r.sources.reduce(
    (sum, s) => sum + Object.values(s.counts).reduce((a, b) => a + (b ?? 0), 0),
    0
  );
  return `- ${r.sourcesQueried.length} source(s) queried in ${r.durationMs}ms\n- ${total} total events recorded\n- ${r.sourcesSkipped.length} source(s) skipped`;
}

function buildUsage(r: OrchestratorResult): string {
  return (
    r.sources
      .map(
        (s) =>
          `- ${s.event_name}: ${Object.entries(s.counts)
            .map(([k, v]) => `${k}=${v}`)
            .join(', ')}`
      )
      .join('\n') || '_(none)_'
  );
}

function buildSystemPerformance(r: OrchestratorResult): string {
  const tracing = r.sources.find((s) => s.event_name === 'tracing') ?? null;
  return tracing
    ? `- ${JSON.stringify(tracing.distributions)}`
    : '_(no tracing source configured)_';
}

function buildFollowups(r: OrchestratorResult): string {
  if (r.sourcesSkipped.length === 0) return '_(none)_';
  return r.sourcesSkipped.map((s) => `- ${s.name} skipped: ${s.reason}`).join('\n');
}

function finalPiiSweep(text: string): string {
  // Defense-in-depth: final regex scan; if any denylisted token appears, strip the whole offending line
  const lines = text.split('\n');
  return lines.filter((l) => !PII_FIELD_DENYLIST.test(l)).join('\n');
}

function truncateFollowupsToFit(text: string): string {
  const lines = text.split('\n');
  if (lines.length <= MAX_LINES) return text;
  // Find the start of "## Followups"
  const idx = lines.findIndex((l) => l.startsWith('## Followups'));
  if (idx < 0) return lines.slice(0, MAX_LINES).join('\n');
  // Truncate from end of file backward until under MAX_LINES, but keep the Followups header
  const headLines = lines.slice(0, idx + 1);
  const followupsLines = lines.slice(idx + 1);
  while (headLines.length + followupsLines.length > MAX_LINES && followupsLines.length > 1) {
    followupsLines.pop();
  }
  followupsLines.push('_(truncated to fit single-page constraint)_');
  return [...headLines, ...followupsLines].join('\n');
}

export function assembleReport(
  result: OrchestratorResult,
  productName: string,
  windowLabel: string
): string {
  const template = loadTemplate();
  const filled = template
    .replace('{{productName}}', productName)
    .replace('{{windowLabel}}', windowLabel)
    .replace('{{headlines}}', buildHeadlines(result))
    .replace('{{usage}}', buildUsage(result))
    .replace('{{systemPerformance}}', buildSystemPerformance(result))
    .replace('{{followups}}', buildFollowups(result));
  const swept = finalPiiSweep(filled);
  return truncateFollowupsToFit(swept);
}
```

2. Run: `pnpm -F @harness-engineering/core test pulse/run/report` — observe pass
3. Run: `pnpm -F @harness-engineering/core typecheck`
4. Run: `harness validate && harness check-deps`
5. Commit: `feat(core): pulse run report assembler with template + ≤40 line guard + final PII sweep`

### Task 11: CLI subcommand tests (TDD)

**Depends on:** Tasks 8, 10 | **Files:** `packages/cli/src/commands/pulse-run.test.ts`

1. Create `packages/cli/src/commands/pulse-run.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPulseRunCommand } from './pulse-run';

describe('pulse run CLI', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'pulse-run-'));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  function writeConfig(pulse: unknown) {
    writeFileSync(
      join(tmp, 'harness.config.json'),
      JSON.stringify({ version: 1, name: 'test', layers: [], forbiddenImports: [], pulse }, null, 2)
    );
  }

  it('skipped status when pulse.enabled is false', async () => {
    writeConfig({ enabled: false });
    const status = await runPulseRunCommand({
      configPath: join(tmp, 'harness.config.json'),
      outputDir: join(tmp, 'reports'),
      nonInteractive: true,
      lookback: '24h',
    });
    expect(status.status).toBe('skipped');
    expect(status.reason).toMatch(/pulse\.enabled/);
  });

  it('writes report file and returns success when configured', async () => {
    writeConfig({
      enabled: true,
      lookbackDefault: '24h',
      primaryEvent: 'click',
      valueEvent: 'value',
      completionEvents: [],
      qualityScoring: false,
      qualityDimension: null,
      sources: { analytics: 'mock', tracing: null, payments: null, db: { enabled: false } },
      metricSourceOverrides: {},
      pendingMetrics: [],
      excludedMetrics: [],
    });
    const status = await runPulseRunCommand({
      configPath: join(tmp, 'harness.config.json'),
      outputDir: join(tmp, 'reports'),
      nonInteractive: true,
      lookback: '24h',
    });
    expect(status.status).toBe('success');
    expect(status.path).toBeDefined();
    const files = readdirSync(join(tmp, 'reports'));
    expect(files.some((f) => f.match(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.md$/))).toBe(true);
  });

  it('uses pulse.lookbackDefault when --lookback omitted', async () => {
    writeConfig({
      enabled: true,
      lookbackDefault: '7d',
      primaryEvent: 'click',
      valueEvent: 'value',
      completionEvents: [],
      qualityScoring: false,
      qualityDimension: null,
      sources: { analytics: 'mock', tracing: null, payments: null, db: { enabled: false } },
      metricSourceOverrides: {},
      pendingMetrics: [],
      excludedMetrics: [],
    });
    const status = await runPulseRunCommand({
      configPath: join(tmp, 'harness.config.json'),
      outputDir: join(tmp, 'reports'),
      nonInteractive: true,
    });
    expect(status.status).toBe('success');
  });
});
```

2. Run: `pnpm -F @harness-engineering/cli test pulse-run` — observe failure
3. Commit: `test(cli): failing tests for pulse run command`

### Task 12: Implement CLI subcommand and register it

**Depends on:** Task 11 | **Files:** `packages/cli/src/commands/pulse-run.ts`, `packages/cli/src/bin/harness.ts` (or actual subcommand registration site)

1. Create `packages/cli/src/commands/pulse-run.ts`:

```typescript
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { runPulse, computeWindow, assembleReport } from '@harness-engineering/core';
import type { PulseConfig, PulseRunStatus } from '@harness-engineering/types';

interface PulseRunOptions {
  configPath: string;
  outputDir: string;
  nonInteractive: boolean;
  lookback?: string;
}

export async function runPulseRunCommand(opts: PulseRunOptions): Promise<PulseRunStatus> {
  const startedAt = Date.now();

  // Load config
  let config: { pulse?: PulseConfig };
  try {
    config = JSON.parse(readFileSync(opts.configPath, 'utf-8'));
  } catch (err) {
    return emit(
      {
        status: 'failure',
        reason: `cannot read ${opts.configPath}: ${err instanceof Error ? err.message : String(err)}`,
      },
      opts.nonInteractive
    );
  }

  if (!config.pulse?.enabled) {
    return emit(
      { status: 'skipped', reason: 'pulse.enabled is false or missing' },
      opts.nonInteractive
    );
  }

  // Compute window
  const lookback = opts.lookback ?? config.pulse.lookbackDefault ?? '24h';
  const window = computeWindow(new Date(), lookback);

  // Orchestrate
  const result = await runPulse(config.pulse, window);

  // Assemble
  const productName = config.pulse.primaryEvent ? 'Project' : 'Project'; // refine: read from config or strategy in execution
  const report = assembleReport(result, productName, lookback);

  // Write file
  const now = new Date();
  const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
  const filePath = join(opts.outputDir, `${ts}.md`);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, report);

  const headlines = report.split('\n').slice(0, 5).join('\n');
  return emit(
    {
      status: 'success',
      path: filePath,
      headlinesSummary: headlines,
      durationMs: Date.now() - startedAt,
      sourcesQueried: result.sourcesQueried,
      sourcesSkipped: result.sourcesSkipped,
    },
    opts.nonInteractive
  );
}

function emit(status: PulseRunStatus, nonInteractive: boolean): PulseRunStatus {
  if (nonInteractive) {
    process.stdout.write(JSON.stringify(status) + '\n');
  } else if (status.status === 'success') {
    process.stdout.write(`${status.headlinesSummary}\n\n→ ${status.path}\n`);
  } else if (status.status === 'skipped') {
    process.stdout.write(`pulse skipped: ${status.reason}\n`);
  } else {
    process.stderr.write(`pulse failed: ${status.reason}\n`);
  }
  return status;
}
```

2. Open `packages/cli/src/bin/harness.ts` (or wherever subcommands are wired — verify the exact registration site during execution). Add a `pulse run` subcommand routing to `runPulseRunCommand`. Parse `--lookback`, `--non-interactive`, `--config`, `--output-dir` flags. Default `--config` to `harness.config.json` in cwd; default `--output-dir` to `docs/pulse-reports/`. Detect non-interactive via the explicit flag OR `!process.stdout.isTTY`.

3. Run: `pnpm -F @harness-engineering/cli test pulse-run` — observe pass
4. Run: `pnpm -F @harness-engineering/cli typecheck`
5. Manual smoke test: `harness pulse run --lookback 24h --non-interactive` against this repo (with a temporary `pulse: { enabled: true, sources: { analytics: "mock", ... } }` block in harness.config.json). Expect: JSON status line on stdout, file under `docs/pulse-reports/`. Revert the config edit before commit.
6. Run: `harness validate && harness check-deps`
7. Commit: `feat(cli): pulse run subcommand with interactive and non-interactive modes`

### Task 13: End-to-end integration test

**Depends on:** Tasks 1-12 | **Files:** `packages/cli/src/commands/pulse-run.test.ts` (extend), or new `packages/cli/test/integration/pulse-run.integration.test.ts`

1. Add an integration test that:
   - Creates a temp project directory with a real `harness.config.json` containing `pulse.enabled: true` and `sources.analytics: 'mock'`
   - Invokes `runPulseRunCommand` end-to-end
   - Asserts the output file exists, contains all 4 sections, ≤40 lines, no PII patterns
   - Asserts the JSON status line includes `path`, `sourcesQueried: ['mock']`, `sourcesSkipped: []`
   - Plants an `email: 'x@y.com'` in the mock adapter's raw output and verifies the final report contains zero `email` references (validates the full sanitization chain)

2. Run: `pnpm -F @harness-engineering/cli test` — all pulse-run tests pass

3. Run: full pulse test suite: `pnpm -F @harness-engineering/core test pulse && pnpm -F @harness-engineering/cli test pulse-run`

4. Run: `harness validate && harness check-deps`

5. Commit: `test(cli): end-to-end integration test for pulse run with PII sanitization sweep`

## Integration Tasks (derived from spec's Integration Points)

Per the spec's Integration Points section, the following integration items apply to Phase 4. Most are deferred to later phases (6, 7, 8); only one applies here:

- **Entry Points → "New CLI subcommand"**: covered by Task 12 (CLI registration).
- **Registrations Required → "Skill barrel exports for `harness-pulse`"**: already done in Phase 3.
- **Registrations Required → "BUILT_IN_TASKS registry entries"**: deferred to Phase 6.
- **Documentation Updates → AGENTS.md, conventions doc**: deferred to Phase 8.
- **Architectural Decisions**: 5 ADRs deferred to Phase 8.
- **Knowledge Impact**: solution-doc → BusinessKnowledgeIngestor wiring deferred to Phase 7.

No additional integration tasks required for this phase beyond Task 12's CLI wiring.

## Uncertainties

- [ASSUMPTION] CLI subcommand registration site is `packages/cli/src/bin/harness.ts` or a near neighbor. Verify during Task 12 execution. If a different site, update file map.
- [ASSUMPTION] `import.meta.url` resolution for `template.md` works in the build pipeline (tsup/vitest both support it). If not, fall back to a string constant in `report.ts` or a `readFile` of an absolute path resolved differently.
- [ASSUMPTION] `pulse.sources.db` shape allows a `source: string` field for the DB adapter name. If the schema rejects it, extend `PulseDbSource` in Task 1 to include the optional name.
- [DEFERRABLE] Exact format of the JSON status line — refine in execution if maintenance task design (Phase 6) needs different fields.
- [DEFERRABLE] Real PostHog adapter (deferred to Phase 4.5 or follow-up).
- [DEFERRABLE] `pulse.qualityScoring: true` runtime path (deferred; Phase 4 ignores with a TODO log).

## Concerns

- The CLI registration site (Task 12 step 2) may use a non-trivial pattern (commander/yargs/etc.) — preserve project convention; do not introduce a new CLI library.
- The orchestrator's parallel test (Task 7) uses `setTimeout` for ordering — slow on CI. Mitigation: short delays (5ms); if flaky, reduce or use a synchronous mock that records call order via a counter.
- Phase 3's `references/interview.md` cited a `node -e` shell-out that was rewritten in fix commit `5ffb1ce3` to use stdin-piped JSON. The CLI subcommand registered here is the proper invocation path; SKILL.md prose in Phase 3 should ideally be updated to point at this subcommand instead of the shell-out. Defer to Phase 8 docs pass; not a Phase 4 task.
