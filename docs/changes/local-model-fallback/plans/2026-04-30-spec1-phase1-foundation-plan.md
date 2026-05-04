# Plan: Spec 1 Phase 1 — LocalModelResolver Foundation (resolver in isolation)

**Date:** 2026-04-30 | **Spec:** `docs/changes/local-model-fallback/proposal.md` (Phase 1 only) | **Tasks:** 9 | **Time:** ~36 min | **Integration Tier:** small | **Session:** `changes--local-model-fallback--proposal`

## Goal

Implement the `LocalModelResolver` class in isolation, plus the required type widening, with full unit-test coverage for spec success criteria SC4–SC12. No orchestrator wiring, no backend changes, no dashboard work. The resolver must be reusable and fake-timer-friendly.

## Phase 1 Scope (from spec)

Phase 1 delivers:

- Widen `localModel` type in `packages/types/src/orchestrator.ts` to `string | string[]`
- Add `localProbeIntervalMs` field on `AgentConfig`
- Add `LocalModelStatus` interface to `packages/types/src/orchestrator.ts` and re-export from the package barrel
- Implement `LocalModelResolver` at `packages/orchestrator/src/agent/local-model-resolver.ts` with probe loop, status snapshot, change subscription, idempotent start/stop, and an injectable `fetchModels` for fake-timer-driven tests
- Unit tests at `packages/orchestrator/tests/agent/local-model-resolver.test.ts` covering SC4–SC12

Phase 1 explicitly excludes (deferred to later phases of the same spec):

- Backend `getModel` callback wiring (Phase 2 — covers SC15)
- Orchestrator construction/start/stop wiring (Phase 3 — covers SC1, SC2, SC8, SC13, SC14, SC16, SC21, SC22)
- Dashboard surface, SSE, HTTP route, banner (Phase 4 — covers SC17–SC20)
- ADRs and knowledge docs (Phase 5)

## Observable Truths (Acceptance Criteria — Phase 1 only)

1. **OT1 (SC4 — array priority match):** Given `configured: ['a', 'b', 'c']` and `fetchModels` returning `['b', 'c', 'x']`, `resolveModel()` returns `'b'`.
2. **OT2 (SC5 — array priority order honored):** Given `configured: ['a', 'b', 'c']` and `fetchModels` returning `['a', 'b', 'c']`, `resolveModel()` returns `'a'`.
3. **OT3 (SC6 — no candidate matches):** Given `configured: ['a', 'b', 'c']` and `fetchModels` returning `['x', 'y', 'z']`, after `start()`, `getStatus()` reports `available: false`, `resolved: null`, `detected: ['x','y','z']`, and `warnings` contains a string naming both the configured list and the detected list.
4. **OT4 (SC7 — empty configured array rejected):** The resolver constructor (or a `normalizeLocalModel` helper exported from the same module) rejects `configured: []` with a descriptive error. (Config-schema validation lives elsewhere; this task verifies the resolver itself does not silently accept an empty array.)
5. **OT5 (SC8 — immediate probe on start):** When `start()` resolves, exactly one probe has executed; `resolveModel()` returns the resolved value (not null) when a candidate is loaded.
6. **OT6 (SC9 — periodic re-probe via fake timers):** With fake timers and `probeIntervalMs: 30_000`, after `start()` and N advances of 30_000ms, `fetchModels` has been called exactly `N + 1` times.
7. **OT7 (SC10 — onStatusChange fires on resolved-model change):** After `start()` with `fetchModels` returning `[]` then `[a]` on the next probe, the `onStatusChange` handler receives a status where `available: true`, `resolved: 'a'`. Handler fires only on meaningful change (not on every probe with identical status).
8. **OT8 (SC11 — error handling on unreachable endpoint):** When `fetchModels` rejects with `Error('ECONNREFUSED')`, `getStatus()` reports `available: false`, `resolved: null`, `lastError: 'ECONNREFUSED'`, and a subsequent timer tick still calls `fetchModels` again (probing continues).
9. **OT9 (SC11b — malformed response handled):** When `fetchModels` resolves but the resolver internally treats malformed input as a probe failure, `lastError` reads `'malformed /v1/models response'` and `available: false`. (See task 4 for where this branching lives.)
10. **OT10 (SC11c — empty `data` array is not an error):** When `fetchModels` resolves with `[]`, `getStatus()` reports `available: false`, `resolved: null`, `detected: []`, `lastError: null`.
11. **OT11 (SC12 — stop clears the timer):** After `stop()`, advancing fake timers by any amount does not call `fetchModels`. `start()` is idempotent (calling twice does not create a second timer); `stop()` is idempotent (calling twice does not throw).
12. **OT12 (mechanical):** `pnpm typecheck`, `pnpm lint`, `pnpm test --filter @harness-engineering/orchestrator -- local-model-resolver`, and `harness validate` all pass at end of phase.

## Skill Recommendations

From `docs/changes/local-model-fallback/SKILLS.md`:

- `ts-type-guards` (reference) — relevant for parsing `/v1/models` response in task 4
- `ts-testing-types` (reference) — relevant for tightly-typed test fixtures in task 7
- `ts-zod-integration` — not applied; spec does not introduce Zod here, raw runtime checks are sufficient for the resolver's defensive parsing

## File Map

- MODIFY `packages/types/src/orchestrator.ts` — widen `localModel`, add `localProbeIntervalMs`, add `LocalModelStatus` interface
- MODIFY `packages/types/src/index.ts` — re-export `LocalModelStatus` from the orchestrator group
- CREATE `packages/orchestrator/src/agent/local-model-resolver.ts` — `LocalModelResolver` class plus `normalizeLocalModel` helper plus default `fetchModels` implementation
- CREATE `packages/orchestrator/tests/agent/local-model-resolver.test.ts` — unit tests covering OT1–OT11

No other files are touched in Phase 1.

## Skeleton

1. Type widening and barrel export (~2 tasks, ~5 min)
2. Resolver module — types and helpers (~1 task, ~3 min)
3. Resolver class — construction, status snapshot, probe loop (~3 tasks, ~14 min)
4. Test suite — array fallback, lifecycle, error modes (~2 tasks, ~12 min)
5. Phase exit gate — typecheck, lint, validate (~1 task, ~2 min)

**Estimated total:** 9 tasks, ~36 min. Skeleton inline (autopilot non-interactive); proceed to full expansion.

## Uncertainties

- **[ASSUMPTION]** Internal change-detection ignores `lastProbeAt` (per spec line 139). Implemented as a JSON-stringify diff on a status object with `lastProbeAt` removed before comparison.
- **[ASSUMPTION]** When the very first probe fails (before any successful probe), `detected` is initialized to `[]` rather than holding undefined or null. Spec line 137 says "retains the prior successful probe's value"; with no prior successful probe, the prior value is the initial value `[]`.
- **[ASSUMPTION]** `Logger` is optional. If not provided, the resolver uses a noop logger so test fixtures don't have to wire a console. This matches the spec's `logger?: Pick<Logger, 'info' | 'warn'>` typing.
- **[DEFERRABLE]** Default `fetchModels` implementation uses `globalThis.fetch` (Node 22+ has it built in). Tests always inject a fake; production callers can override too. This avoids importing `openai` SDK in this isolated module.

## Tasks

### Task 1: Widen `localModel` and add `localProbeIntervalMs` + `LocalModelStatus` to types

**Depends on:** none | **Files:** `packages/types/src/orchestrator.ts`

**Skills:** `ts-type-guards` (reference)

1. Open `packages/types/src/orchestrator.ts`. Locate the `AgentConfig` interface (currently around lines 293–348).
2. Change the existing `localModel` field from `localModel?: string;` to:
   ```typescript
   /** Model name(s) for local backend. String form is normalized to a 1-element array internally. Non-empty array required when array form is used. */
   localModel?: string | string[];
   ```
3. Add a new field on `AgentConfig`, immediately after `localTimeoutMs?: number;`:
   ```typescript
   /** Probe interval in ms for local model availability (default: 30_000, minimum: 1_000). */
   localProbeIntervalMs?: number;
   ```
4. After the `AgentConfig` interface declaration, add the new `LocalModelStatus` interface:
   ```typescript
   /**
    * Snapshot of local-model availability, exposed to the dashboard and consumers.
    *
    * @remarks
    * Produced by `LocalModelResolver.getStatus()`. Field semantics:
    * - `available` flips true when at least one configured candidate appears in `detected`.
    * - `resolved` is the first match in `configured` order; `null` when `available` is false.
    * - `detected` is the list of model IDs returned by the most recent successful probe;
    *   it retains its previous value across transient probe failures.
    * - `lastError` is non-null when the most recent probe attempt failed (network, timeout,
    *   non-2xx, malformed body). An empty `detected` array on a successful probe is NOT an error.
    */
   export interface LocalModelStatus {
     /** True when at least one configured candidate is loaded on the server. */
     available: boolean;
     /** The currently selected model ID, or null when none matched. */
     resolved: string | null;
     /** Configured candidate list, normalized to array. */
     configured: string[];
     /** Model IDs returned by the last successful probe. */
     detected: string[];
     /** ISO timestamp of the last successful probe, null if never succeeded. */
     lastProbeAt: string | null;
     /** Last probe error message, null when healthy. */
     lastError: string | null;
     /** Human-readable warnings (empty when healthy). */
     warnings: string[];
   }
   ```
5. Run: `pnpm --filter @harness-engineering/types typecheck`
6. Verify: command exits 0.
7. Commit:
   ```
   feat(types): widen localModel and add LocalModelStatus
   ```

---

### Task 2: Re-export `LocalModelStatus` from the types barrel

**Depends on:** Task 1 | **Files:** `packages/types/src/index.ts`

1. Open `packages/types/src/index.ts`. Locate the `// --- Orchestrator ---` block (around lines 99–126).
2. Add `LocalModelStatus` to the existing `export type { ... } from './orchestrator';` block. Insert it on a new line after `IntelligenceConfig,`. The block should now end with:
   ```typescript
     EscalationConfig,
     IntelligenceConfig,
     LocalModelStatus,
   } from './orchestrator';
   ```
3. Run: `pnpm --filter @harness-engineering/types typecheck`
4. Run: `pnpm --filter @harness-engineering/types build` (regenerates `dist/`).
5. Verify: both commands exit 0.
6. Commit:
   ```
   feat(types): export LocalModelStatus from package barrel
   ```

---

### Task 3: Define resolver module shell and `normalizeLocalModel` helper (TDD red)

**Depends on:** Task 2 | **Files:** `packages/orchestrator/src/agent/local-model-resolver.ts`, `packages/orchestrator/tests/agent/local-model-resolver.test.ts`

**Skills:** `ts-type-guards` (reference)

1. Create `packages/orchestrator/tests/agent/local-model-resolver.test.ts` with a minimal red test for `normalizeLocalModel`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { normalizeLocalModel } from '../../src/agent/local-model-resolver';

   describe('normalizeLocalModel', () => {
     it('returns [] when input is undefined', () => {
       expect(normalizeLocalModel(undefined)).toEqual([]);
     });

     it('wraps a string in a 1-element array', () => {
       expect(normalizeLocalModel('gemma-4-e4b')).toEqual(['gemma-4-e4b']);
     });

     it('returns the array unchanged when given a non-empty array', () => {
       expect(normalizeLocalModel(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
     });

     it('throws a descriptive error when given an empty array', () => {
       expect(() => normalizeLocalModel([])).toThrow(/non-empty/i);
     });
   });
   ```

2. Create `packages/orchestrator/src/agent/local-model-resolver.ts` with module shell only:

   ```typescript
   import type { LocalModelStatus } from '@harness-engineering/types';

   /**
    * Normalize the `agent.localModel` config (string | string[] | undefined) into a string[].
    *
    * - `undefined` -> `[]` (no candidates configured)
    * - `'name'`    -> `['name']`
    * - `[]`        -> throws (config validation must catch this; the resolver does not silently accept it)
    * - `[a, b]`    -> `[a, b]`
    */
   export function normalizeLocalModel(input: string | string[] | undefined): string[] {
     if (input === undefined) return [];
     if (typeof input === 'string') return [input];
     if (input.length === 0) {
       throw new Error('localModel array must be non-empty when provided');
     }
     return [...input];
   }

   // LocalModelResolver class added in Task 4.
   export type { LocalModelStatus };
   ```

3. Run: `pnpm --filter @harness-engineering/orchestrator test -- local-model-resolver`
4. Verify: all four `normalizeLocalModel` tests pass.
5. Run: `pnpm --filter @harness-engineering/orchestrator typecheck`
6. Verify: command exits 0.
7. Commit:
   ```
   feat(orchestrator): add normalizeLocalModel helper for local-model resolver
   ```

---

### Task 4: Implement `LocalModelResolver` core (constructor, status, single probe)

**Depends on:** Task 3 | **Files:** `packages/orchestrator/src/agent/local-model-resolver.ts`, `packages/orchestrator/tests/agent/local-model-resolver.test.ts`

1. **Append failing tests** to `packages/orchestrator/tests/agent/local-model-resolver.test.ts` (after the existing `normalizeLocalModel` describe block):

   ```typescript
   import { LocalModelResolver } from '../../src/agent/local-model-resolver';

   describe('LocalModelResolver — single probe semantics (no timer)', () => {
     it('selects the first configured candidate present in detected (SC4)', async () => {
       const resolver = new LocalModelResolver({
         endpoint: 'http://localhost:11434/v1',
         configured: ['a', 'b', 'c'],
         fetchModels: async () => ['b', 'c', 'x'],
       });
       const status = await resolver.probe();
       expect(status.available).toBe(true);
       expect(status.resolved).toBe('b');
       expect(status.detected).toEqual(['b', 'c', 'x']);
       expect(resolver.resolveModel()).toBe('b');
     });

     it('honors configured priority order (SC5)', async () => {
       const resolver = new LocalModelResolver({
         endpoint: 'http://localhost:11434/v1',
         configured: ['a', 'b', 'c'],
         fetchModels: async () => ['a', 'b', 'c'],
       });
       const status = await resolver.probe();
       expect(status.resolved).toBe('a');
     });

     it('reports unavailable with warnings when no candidate matches (SC6)', async () => {
       const resolver = new LocalModelResolver({
         endpoint: 'http://localhost:11434/v1',
         configured: ['a', 'b', 'c'],
         fetchModels: async () => ['x', 'y', 'z'],
       });
       const status = await resolver.probe();
       expect(status.available).toBe(false);
       expect(status.resolved).toBeNull();
       expect(status.detected).toEqual(['x', 'y', 'z']);
       expect(status.warnings.length).toBeGreaterThan(0);
       expect(status.warnings.join(' ')).toMatch(/a.*b.*c/);
       expect(status.warnings.join(' ')).toMatch(/x.*y.*z/);
     });

     it('treats empty detected array as unavailable but not an error (SC11c)', async () => {
       const resolver = new LocalModelResolver({
         endpoint: 'http://localhost:11434/v1',
         configured: ['a'],
         fetchModels: async () => [],
       });
       const status = await resolver.probe();
       expect(status.available).toBe(false);
       expect(status.resolved).toBeNull();
       expect(status.detected).toEqual([]);
       expect(status.lastError).toBeNull();
     });

     it('records lastError and keeps available=false on fetch failure (SC11)', async () => {
       const resolver = new LocalModelResolver({
         endpoint: 'http://localhost:11434/v1',
         configured: ['a'],
         fetchModels: async () => {
           throw new Error('ECONNREFUSED');
         },
       });
       const status = await resolver.probe();
       expect(status.available).toBe(false);
       expect(status.lastError).toBe('ECONNREFUSED');
       expect(status.detected).toEqual([]); // initial empty stays empty
     });
   });
   ```

2. Run the tests now. They must fail (`LocalModelResolver` not implemented yet).
3. **Implement** `LocalModelResolver` in `packages/orchestrator/src/agent/local-model-resolver.ts`. Replace the file contents with:

   ```typescript
   import type { LocalModelStatus } from '@harness-engineering/types';

   const DEFAULT_PROBE_INTERVAL_MS = 30_000;
   const MIN_PROBE_INTERVAL_MS = 1_000;
   const DEFAULT_API_KEY = 'lm-studio';

   export interface ResolverLogger {
     info(message: string, context?: Record<string, unknown>): void;
     warn(message: string, context?: Record<string, unknown>): void;
   }

   export interface LocalModelResolverOptions {
     endpoint: string;
     apiKey?: string;
     /** Normalized candidate list (already turned from string|string[] into string[]). */
     configured: string[];
     /** Probe cadence in ms; default 30_000, minimum 1_000. */
     probeIntervalMs?: number;
     /**
      * Injectable for tests. Default: GET `${endpoint}/models` with bearer apiKey.
      * Resolves to detected model IDs. Rejects on network/timeout/non-2xx/malformed.
      */
     fetchModels?: (endpoint: string, apiKey?: string) => Promise<string[]>;
     logger?: ResolverLogger;
   }

   export function normalizeLocalModel(input: string | string[] | undefined): string[] {
     if (input === undefined) return [];
     if (typeof input === 'string') return [input];
     if (input.length === 0) {
       throw new Error('localModel array must be non-empty when provided');
     }
     return [...input];
   }

   const noopLogger: ResolverLogger = {
     info: () => undefined,
     warn: () => undefined,
   };

   /**
    * Default `fetchModels` — GET `${endpoint}/models` with bearer apiKey.
    * Throws on network failure, non-2xx, or malformed body.
    */
   export async function defaultFetchModels(endpoint: string, apiKey?: string): Promise<string[]> {
     const url = `${endpoint.replace(/\/$/, '')}/models`;
     const res = await fetch(url, {
       headers: { Authorization: `Bearer ${apiKey ?? DEFAULT_API_KEY}` },
     });
     if (!res.ok) {
       throw new Error(`probe failed: ${res.status} ${res.statusText}`);
     }
     let body: unknown;
     try {
       body = await res.json();
     } catch {
       throw new Error('malformed /v1/models response');
     }
     if (!body || typeof body !== 'object' || !Array.isArray((body as { data?: unknown }).data)) {
       throw new Error('malformed /v1/models response');
     }
     const data = (body as { data: unknown[] }).data;
     const ids: string[] = [];
     for (const entry of data) {
       if (
         !entry ||
         typeof entry !== 'object' ||
         typeof (entry as { id?: unknown }).id !== 'string'
       ) {
         throw new Error('malformed /v1/models response');
       }
       ids.push((entry as { id: string }).id);
     }
     return ids;
   }

   export class LocalModelResolver {
     private readonly endpoint: string;
     private readonly apiKey?: string;
     private readonly configured: string[];
     private readonly probeIntervalMs: number;
     private readonly fetchModels: (endpoint: string, apiKey?: string) => Promise<string[]>;
     private readonly logger: ResolverLogger;

     private timer: ReturnType<typeof setInterval> | null = null;
     private listeners = new Set<(status: LocalModelStatus) => void>();

     // Mutable status fields (composed into LocalModelStatus on demand).
     private resolved: string | null = null;
     private detected: string[] = [];
     private lastProbeAt: string | null = null;
     private lastError: string | null = null;
     private warnings: string[] = [];
     private available = false;

     constructor(opts: LocalModelResolverOptions) {
       this.endpoint = opts.endpoint;
       this.apiKey = opts.apiKey;
       this.configured = [...opts.configured];
       const interval = opts.probeIntervalMs ?? DEFAULT_PROBE_INTERVAL_MS;
       this.probeIntervalMs = Math.max(MIN_PROBE_INTERVAL_MS, interval);
       this.fetchModels = opts.fetchModels ?? defaultFetchModels;
       this.logger = opts.logger ?? noopLogger;
     }

     resolveModel(): string | null {
       return this.resolved;
     }

     getStatus(): LocalModelStatus {
       return {
         available: this.available,
         resolved: this.resolved,
         configured: [...this.configured],
         detected: [...this.detected],
         lastProbeAt: this.lastProbeAt,
         lastError: this.lastError,
         warnings: [...this.warnings],
       };
     }

     onStatusChange(handler: (status: LocalModelStatus) => void): () => void {
       this.listeners.add(handler);
       return () => {
         this.listeners.delete(handler);
       };
     }

     async probe(): Promise<LocalModelStatus> {
       const before = this.snapshotForDiff();
       try {
         const detected = await this.fetchModels(this.endpoint, this.apiKey);
         this.detected = [...detected];
         this.lastError = null;
         this.lastProbeAt = new Date().toISOString();
         const match = this.configured.find((id) => detected.includes(id)) ?? null;
         this.resolved = match;
         this.available = match !== null;
         this.warnings = match
           ? []
           : [
               `No configured local model is loaded. Configured: [${this.configured.join(', ')}]. Detected: [${detected.join(', ')}].`,
             ];
       } catch (err) {
         const message = err instanceof Error ? err.message : 'probe failed';
         this.lastError = message;
         this.available = false;
         this.resolved = null;
         this.warnings = [`Local model probe failed against ${this.endpoint}: ${message}.`];
         // detected retains prior value
         this.logger.warn('local-model-resolver probe failed', {
           endpoint: this.endpoint,
           error: message,
         });
       }
       const after = this.snapshotForDiff();
       const status = this.getStatus();
       if (before !== after) {
         for (const listener of this.listeners) {
           try {
             listener(status);
           } catch (err) {
             this.logger.warn('local-model-resolver listener threw', {
               error: err instanceof Error ? err.message : String(err),
             });
           }
         }
       }
       return status;
     }

     // start() and stop() implemented in Task 5.
     async start(): Promise<void> {
       throw new Error('not implemented yet');
     }
     stop(): void {
       throw new Error('not implemented yet');
     }

     private snapshotForDiff(): string {
       return JSON.stringify({
         available: this.available,
         resolved: this.resolved,
         configured: this.configured,
         detected: this.detected,
         lastError: this.lastError,
         warnings: this.warnings,
       });
     }
   }
   ```

4. Run: `pnpm --filter @harness-engineering/orchestrator test -- local-model-resolver`
5. Verify: all single-probe tests pass (5 new + 4 from Task 3 = 9 tests). The class's `start` and `stop` throw is fine — no test calls them yet.
6. Run: `pnpm --filter @harness-engineering/orchestrator typecheck`
7. Verify: exits 0.
8. Run: `harness validate`
9. Commit:
   ```
   feat(orchestrator): implement LocalModelResolver core probe logic
   ```

---

### Task 5: Implement `start()` / `stop()` lifecycle with idempotency

**Depends on:** Task 4 | **Files:** `packages/orchestrator/src/agent/local-model-resolver.ts`, `packages/orchestrator/tests/agent/local-model-resolver.test.ts`

1. **Append failing tests** to the test file:

   ```typescript
   import { vi, beforeEach, afterEach } from 'vitest';

   describe('LocalModelResolver — lifecycle (fake timers)', () => {
     beforeEach(() => {
       vi.useFakeTimers();
     });
     afterEach(() => {
       vi.useRealTimers();
     });

     it('runs one probe before start() resolves (SC8)', async () => {
       const fetchModels = vi.fn().mockResolvedValue(['a']);
       const resolver = new LocalModelResolver({
         endpoint: 'http://localhost:11434/v1',
         configured: ['a'],
         probeIntervalMs: 30_000,
         fetchModels,
       });
       await resolver.start();
       expect(fetchModels).toHaveBeenCalledTimes(1);
       expect(resolver.resolveModel()).toBe('a');
       resolver.stop();
     });

     it('re-probes on every interval tick (SC9)', async () => {
       const fetchModels = vi.fn().mockResolvedValue(['a']);
       const resolver = new LocalModelResolver({
         endpoint: 'http://localhost:11434/v1',
         configured: ['a'],
         probeIntervalMs: 30_000,
         fetchModels,
       });
       await resolver.start();
       expect(fetchModels).toHaveBeenCalledTimes(1);

       await vi.advanceTimersByTimeAsync(30_000);
       expect(fetchModels).toHaveBeenCalledTimes(2);

       await vi.advanceTimersByTimeAsync(30_000);
       expect(fetchModels).toHaveBeenCalledTimes(3);

       await vi.advanceTimersByTimeAsync(60_000);
       expect(fetchModels).toHaveBeenCalledTimes(5);

       resolver.stop();
     });

     it('stop() clears the timer (SC12)', async () => {
       const fetchModels = vi.fn().mockResolvedValue(['a']);
       const resolver = new LocalModelResolver({
         endpoint: 'http://localhost:11434/v1',
         configured: ['a'],
         probeIntervalMs: 30_000,
         fetchModels,
       });
       await resolver.start();
       resolver.stop();

       await vi.advanceTimersByTimeAsync(120_000);
       expect(fetchModels).toHaveBeenCalledTimes(1); // only the start() probe
     });

     it('start() is idempotent (no second timer)', async () => {
       const fetchModels = vi.fn().mockResolvedValue(['a']);
       const resolver = new LocalModelResolver({
         endpoint: 'http://localhost:11434/v1',
         configured: ['a'],
         probeIntervalMs: 30_000,
         fetchModels,
       });
       await resolver.start();
       await resolver.start(); // should not schedule a second timer or re-probe immediately
       expect(fetchModels).toHaveBeenCalledTimes(1);

       await vi.advanceTimersByTimeAsync(30_000);
       expect(fetchModels).toHaveBeenCalledTimes(2); // exactly one tick, not two

       resolver.stop();
     });

     it('stop() is idempotent (calling twice does not throw)', async () => {
       const fetchModels = vi.fn().mockResolvedValue(['a']);
       const resolver = new LocalModelResolver({
         endpoint: 'http://localhost:11434/v1',
         configured: ['a'],
         probeIntervalMs: 30_000,
         fetchModels,
       });
       await resolver.start();
       resolver.stop();
       expect(() => resolver.stop()).not.toThrow();
     });
   });
   ```

2. Run the tests now. The five new lifecycle tests must fail (`start` and `stop` still throw "not implemented yet").
3. **Replace** the placeholder `start()` and `stop()` methods inside `LocalModelResolver` with:

   ```typescript
     async start(): Promise<void> {
       if (this.timer !== null) {
         // Idempotent: already running.
         return;
       }
       await this.probe();
       this.timer = setInterval(() => {
         // Fire-and-forget — errors are recorded in lastError by probe().
         void this.probe();
       }, this.probeIntervalMs);
       // Some Node interval handles support unref so they don't keep the
       // process alive on their own. Test environments without it (jsdom
       // synthetic handles, etc.) safely no-op via the optional check.
       const handle = this.timer as unknown as { unref?: () => void };
       handle.unref?.();
     }

     stop(): void {
       if (this.timer !== null) {
         clearInterval(this.timer);
         this.timer = null;
       }
     }
   ```

4. Run: `pnpm --filter @harness-engineering/orchestrator test -- local-model-resolver`
5. Verify: all lifecycle tests pass.
6. Run: `pnpm --filter @harness-engineering/orchestrator typecheck`
7. Verify: exits 0.
8. Run: `harness validate`
9. Commit:
   ```
   feat(orchestrator): add LocalModelResolver start/stop lifecycle with idempotent probe loop
   ```

---

### Task 6: Add `onStatusChange` regression tests (SC10)

**Depends on:** Task 5 | **Files:** `packages/orchestrator/tests/agent/local-model-resolver.test.ts`

1. **Append** a new describe block to the test file:

   ```typescript
   describe('LocalModelResolver — onStatusChange semantics (SC10)', () => {
     beforeEach(() => {
       vi.useFakeTimers();
     });
     afterEach(() => {
       vi.useRealTimers();
     });

     it('fires when resolved model transitions from null to a candidate', async () => {
       let returnValue: string[] = [];
       const fetchModels = vi.fn().mockImplementation(async () => returnValue);
       const resolver = new LocalModelResolver({
         endpoint: 'http://localhost:11434/v1',
         configured: ['a'],
         probeIntervalMs: 30_000,
         fetchModels,
       });
       const handler = vi.fn();
       resolver.onStatusChange(handler);

       await resolver.start();
       // Initial probe: detected=[], available=false. Compared against the
       // pre-probe initial snapshot (also available=false, detected=[]) —
       // listeners fire only on diff. Since this is the first transition out
       // of the initial state, snapshots may differ; assert the handler was
       // called at most once for the initial probe.
       const initialCalls = handler.mock.calls.length;

       returnValue = ['a'];
       await vi.advanceTimersByTimeAsync(30_000);
       expect(handler).toHaveBeenCalledTimes(initialCalls + 1);
       const lastStatus = handler.mock.calls.at(-1)?.[0];
       expect(lastStatus.available).toBe(true);
       expect(lastStatus.resolved).toBe('a');

       resolver.stop();
     });

     it('does not fire when consecutive probes produce identical status', async () => {
       const fetchModels = vi.fn().mockResolvedValue(['a']);
       const resolver = new LocalModelResolver({
         endpoint: 'http://localhost:11434/v1',
         configured: ['a'],
         probeIntervalMs: 30_000,
         fetchModels,
       });
       const handler = vi.fn();
       await resolver.start();
       resolver.onStatusChange(handler); // subscribe AFTER initial probe

       await vi.advanceTimersByTimeAsync(30_000);
       await vi.advanceTimersByTimeAsync(30_000);

       expect(handler).not.toHaveBeenCalled();
       resolver.stop();
     });

     it('returns an unsubscribe function that detaches the handler', async () => {
       const fetchModels = vi
         .fn()
         .mockResolvedValueOnce(['a'])
         .mockResolvedValueOnce(['b'])
         .mockResolvedValue(['a']);
       const resolver = new LocalModelResolver({
         endpoint: 'http://localhost:11434/v1',
         configured: ['a', 'b'],
         probeIntervalMs: 30_000,
         fetchModels,
       });
       await resolver.start();
       const handler = vi.fn();
       const unsubscribe = resolver.onStatusChange(handler);

       await vi.advanceTimersByTimeAsync(30_000);
       expect(handler).toHaveBeenCalledTimes(1);

       unsubscribe();
       await vi.advanceTimersByTimeAsync(30_000);
       expect(handler).toHaveBeenCalledTimes(1);

       resolver.stop();
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/orchestrator test -- local-model-resolver`
3. Verify: all `onStatusChange` tests pass. (No implementation change — this exercises code already written in Task 4. If a test fails, fix the diff or listener logic in `local-model-resolver.ts`.)
4. Commit:
   ```
   test(orchestrator): cover LocalModelResolver onStatusChange semantics
   ```

---

### Task 7: Add malformed-response and persistent-failure regression tests

**Depends on:** Task 6 | **Files:** `packages/orchestrator/tests/agent/local-model-resolver.test.ts`

**Skills:** `ts-testing-types` (reference)

1. **Append** a new describe block to the test file:

   ```typescript
   describe('LocalModelResolver — error and degraded modes', () => {
     beforeEach(() => {
       vi.useFakeTimers();
     });
     afterEach(() => {
       vi.useRealTimers();
     });

     it('records malformed response error from a custom fetchModels (SC11b)', async () => {
       const fetchModels = vi.fn().mockRejectedValue(new Error('malformed /v1/models response'));
       const resolver = new LocalModelResolver({
         endpoint: 'http://localhost:11434/v1',
         configured: ['a'],
         fetchModels,
       });
       await resolver.start();
       const status = resolver.getStatus();
       expect(status.available).toBe(false);
       expect(status.lastError).toBe('malformed /v1/models response');
       resolver.stop();
     });

     it('continues probing after a failure (SC11)', async () => {
       const fetchModels = vi
         .fn()
         .mockRejectedValueOnce(new Error('ECONNREFUSED'))
         .mockResolvedValueOnce(['a'])
         .mockResolvedValue(['a']);
       const resolver = new LocalModelResolver({
         endpoint: 'http://localhost:11434/v1',
         configured: ['a'],
         probeIntervalMs: 30_000,
         fetchModels,
       });
       await resolver.start();
       expect(resolver.getStatus().available).toBe(false);
       expect(resolver.getStatus().lastError).toBe('ECONNREFUSED');

       await vi.advanceTimersByTimeAsync(30_000);
       expect(fetchModels).toHaveBeenCalledTimes(2);
       expect(resolver.getStatus().available).toBe(true);
       expect(resolver.getStatus().lastError).toBeNull();

       resolver.stop();
     });

     it('preserves prior detected list across a transient failure', async () => {
       const fetchModels = vi
         .fn()
         .mockResolvedValueOnce(['a', 'b'])
         .mockRejectedValueOnce(new Error('ECONNREFUSED'));
       const resolver = new LocalModelResolver({
         endpoint: 'http://localhost:11434/v1',
         configured: ['a'],
         probeIntervalMs: 30_000,
         fetchModels,
       });
       await resolver.start();
       expect(resolver.getStatus().detected).toEqual(['a', 'b']);

       await vi.advanceTimersByTimeAsync(30_000);
       const after = resolver.getStatus();
       expect(after.lastError).toBe('ECONNREFUSED');
       expect(after.detected).toEqual(['a', 'b']); // retained per spec line 137
       expect(after.available).toBe(false);

       resolver.stop();
     });

     it('clamps probeIntervalMs below the 1_000ms minimum', async () => {
       const fetchModels = vi.fn().mockResolvedValue([]);
       const resolver = new LocalModelResolver({
         endpoint: 'http://localhost:11434/v1',
         configured: ['a'],
         probeIntervalMs: 100, // below MIN
         fetchModels,
       });
       await resolver.start();
       // Advance by 999ms — interval should not have fired (minimum is 1_000).
       await vi.advanceTimersByTimeAsync(999);
       expect(fetchModels).toHaveBeenCalledTimes(1);
       await vi.advanceTimersByTimeAsync(1);
       expect(fetchModels).toHaveBeenCalledTimes(2);
       resolver.stop();
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/orchestrator test -- local-model-resolver`
3. Verify: all error-mode tests pass.
4. Commit:
   ```
   test(orchestrator): cover LocalModelResolver error and degraded modes
   ```

---

### Task 8: Verify default `defaultFetchModels` shape against an integration-style fixture

**Depends on:** Task 7 | **Files:** `packages/orchestrator/tests/agent/local-model-resolver.test.ts`

1. **Append** a final describe block exercising `defaultFetchModels` with a `globalThis.fetch` stub:

   ```typescript
   import { defaultFetchModels } from '../../src/agent/local-model-resolver';

   describe('defaultFetchModels — wire format', () => {
     const realFetch = globalThis.fetch;
     afterEach(() => {
       globalThis.fetch = realFetch;
     });

     it('parses a valid /v1/models response into ID list', async () => {
       globalThis.fetch = vi.fn().mockResolvedValue({
         ok: true,
         status: 200,
         statusText: 'OK',
         json: async () => ({
           data: [
             { id: 'gemma-4-e4b', object: 'model' },
             { id: 'qwen3:8b', object: 'model' },
           ],
         }),
       }) as unknown as typeof fetch;

       const ids = await defaultFetchModels('http://localhost:11434/v1', 'lm-studio');
       expect(ids).toEqual(['gemma-4-e4b', 'qwen3:8b']);
     });

     it('throws on non-2xx response', async () => {
       globalThis.fetch = vi.fn().mockResolvedValue({
         ok: false,
         status: 503,
         statusText: 'Service Unavailable',
         json: async () => ({}),
       }) as unknown as typeof fetch;
       await expect(defaultFetchModels('http://localhost:11434/v1')).rejects.toThrow(/503/);
     });

     it('throws "malformed" on missing data array', async () => {
       globalThis.fetch = vi.fn().mockResolvedValue({
         ok: true,
         status: 200,
         statusText: 'OK',
         json: async () => ({ models: [] }),
       }) as unknown as typeof fetch;
       await expect(defaultFetchModels('http://localhost:11434/v1')).rejects.toThrow(/malformed/);
     });

     it('throws "malformed" on entry without id', async () => {
       globalThis.fetch = vi.fn().mockResolvedValue({
         ok: true,
         status: 200,
         statusText: 'OK',
         json: async () => ({ data: [{ object: 'model' }] }),
       }) as unknown as typeof fetch;
       await expect(defaultFetchModels('http://localhost:11434/v1')).rejects.toThrow(/malformed/);
     });

     it('sends Authorization: Bearer with apiKey or default', async () => {
       const fetchSpy = vi.fn().mockResolvedValue({
         ok: true,
         status: 200,
         statusText: 'OK',
         json: async () => ({ data: [] }),
       });
       globalThis.fetch = fetchSpy as unknown as typeof fetch;

       await defaultFetchModels('http://localhost:11434/v1', 'my-key');
       expect(fetchSpy).toHaveBeenCalledWith(
         'http://localhost:11434/v1/models',
         expect.objectContaining({
           headers: expect.objectContaining({ Authorization: 'Bearer my-key' }),
         })
       );

       fetchSpy.mockClear();
       await defaultFetchModels('http://localhost:11434/v1');
       expect(fetchSpy).toHaveBeenCalledWith(
         'http://localhost:11434/v1/models',
         expect.objectContaining({
           headers: expect.objectContaining({ Authorization: 'Bearer lm-studio' }),
         })
       );
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/orchestrator test -- local-model-resolver`
3. Verify: all `defaultFetchModels` tests pass.
4. Run: `pnpm --filter @harness-engineering/orchestrator lint`
5. Verify: no new ESLint errors.
6. Commit:
   ```
   test(orchestrator): cover defaultFetchModels HTTP behavior
   ```

---

### Task 9: Phase 1 exit gate — typecheck, lint, test, validate

**Depends on:** Task 8 | **Files:** none (verification only)

1. Run: `pnpm typecheck` (root). Verify exit 0.
2. Run: `pnpm lint` (root). Verify exit 0; no new suppressions introduced.
3. Run: `pnpm test --filter @harness-engineering/orchestrator -- local-model-resolver`. Verify all resolver tests pass.
4. Run: `pnpm test --filter @harness-engineering/types`. Verify types tests still pass.
5. Run: `harness validate`. Verify exit 0.
6. Run: `harness check-deps`. Verify exit 0.
7. **[checkpoint:human-verify]** — Confirm Phase 1 exit gate is green and the resolver module is reusable in isolation. Pause for autopilot to record success and advance to Phase 2.
8. No commit needed — verification only. If any check fails, fix and recommit per the offending task's pattern.

## Coverage Trace (Observable Truths to Tasks)

| Truth | Spec SC | Tasks          |
| ----- | ------- | -------------- |
| OT1   | SC4     | Task 4         |
| OT2   | SC5     | Task 4         |
| OT3   | SC6     | Task 4         |
| OT4   | SC7     | Task 3         |
| OT5   | SC8     | Task 5         |
| OT6   | SC9     | Task 5         |
| OT7   | SC10    | Task 6         |
| OT8   | SC11    | Task 4, Task 7 |
| OT9   | SC11    | Task 7, Task 8 |
| OT10  | SC11    | Task 4         |
| OT11  | SC12    | Task 5         |
| OT12  | SC24-25 | Task 9         |

Every Phase 1 success criterion (SC4–SC12) is exercised by at least one task. SC24/SC25 (typecheck/lint) gate at Task 9.

## Integration Tier Estimate

**small** — Phase 1 touches 4 files (2 modify, 2 create) inside one package boundary, adds one new export to the types barrel, and introduces no architectural decision. The Integration Points subsections that apply at full-spec level (HTTP route, SSE topic, ADRs, knowledge docs) are deferred to Phases 4–5; Phase 1 itself only requires the WIRE sub-phase (barrel regeneration check + `harness validate`), already covered by Task 9.

## Concerns

None blocking. The resolver intentionally uses `globalThis.fetch` rather than the `openai` SDK so the module stays orthogonal to the SDK upgrade path. The `unref?.()` guard on the interval handle is defensive against test environments where the handle is a synthetic object.

## Gates

- Every code-producing task includes a failing-first test before implementation.
- Every task touches at most 2 files.
- Every task includes exact code, exact file paths, exact run/verify commands.
- No phase-2/3 wiring (orchestrator construction, backend callbacks, dashboard) appears in any task.
- All 9 Phase 1 success criteria (SC4–SC12) trace to at least one Phase 1 task.
- `harness validate` runs at Tasks 4, 5, and 9.
