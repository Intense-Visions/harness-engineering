# Plan: ULID Identity — Phase 1 (Core ULID generator + identity store)

**Date:** 2026-08-08 | **Spec:** docs/changes/ulid-identity-sessions-worktrees/proposal.md | **Tasks:** 6 | **Time:** ~24 min | **Integration Tier:** medium

## Goal

Add the `HarnessIdentity` type, a self-contained (no new dependency) `generateUlid`/`isValidUlid`/`ulidTime` generator, and a file-backed best-effort identity store (`readIdentity`/`ensureIdentity`/`assignNumber`/`nextNumber`) in a new `packages/core/src/identity/` module, fully unit-tested, with barrels regenerated. No wiring — pure, isolated, testable.

## Observable Truths (Acceptance Criteria)

Derived from spec Success Criteria 1–3, 7 (partial), 8 (partial):

1. `generateUlid()` returns a 26-char Crockford-base32 string; two ULIDs generated with the **same** `seedTime` sort in creation order (monotonic — the random component is incremented, not re-randomized).
2. `isValidUlid()` accepts a well-formed ULID and rejects malformed input (wrong length, lowercase-only excluded chars `I`/`L`/`O`/`U`, non-base32 chars).
3. `ulidTime(ulid)` decodes the 48-bit millisecond timestamp; `ulidTime(generateUlid(t)) === t`.
4. `ensureIdentity(file, { slug, domain })` writes `identity.json` once with `number: null`, `completedAt: null`, and returns the **same** ULID on a second call even with a different `slug` argument (immutability).
5. `assignNumber(file, counter)` allocates 1, 2, 3… from an empty counter across successive identities, stamps `number` + `completedAt`, and is idempotent per identity (a second call returns the same number without re-incrementing the counter).
6. `readIdentity`, `ensureIdentity`, `assignNumber`, `nextNumber` are all best-effort: a write/read failure returns a sane value (null / in-memory record) and never throws.
7. `HarnessIdentity` + `IdentityDomain` are exported from `@harness-engineering/types` and flow through the `@harness-engineering/core` barrel; `generateUlid`/`ensureIdentity`/etc. are exported from `@harness-engineering/core`.
8. `pnpm run generate:barrels:check`, typecheck, lint, and the new + existing core/types test suites pass; `harness validate` passes.

## File Map

- CREATE `packages/types/src/identity.ts`
- MODIFY `packages/types/src/index.ts` (hand-edited barrel — add identity exports; this file is NOT auto-generated)
- CREATE `packages/core/src/identity/ulid.ts`
- CREATE `packages/core/src/identity/store.ts`
- CREATE `packages/core/src/identity/index.ts` (module barrel; auto-detected by `generate-core-barrel.mjs`)
- MODIFY `packages/core/src/index.ts` (AUTO-GENERATED — regenerated via `pnpm run generate:barrels`, never hand-edited)
- CREATE `packages/core/tests/identity/ulid.test.ts`
- CREATE `packages/core/tests/identity/store.test.ts`
- CREATE `packages/types/__type_tests__/identity.test-d.ts` OR `packages/core/tests/identity/types.test.ts` (type presence check via core barrel)

## Grounding Notes (verified against codebase)

- Precedent: `packages/core/src/shared/uuid.ts` self-implements UUID v4 via native `globalThis.crypto` — the ULID generator follows the same no-dependency pattern.
- `packages/core/src/index.ts` begins with `// AUTO-GENERATED — do not edit.` — regenerate with `pnpm run generate:barrels`; the core-barrel script (`scripts/generate-core-barrel.mjs`) auto-includes any `src/<dir>/` that has an `index.ts`, and re-exports `@harness-engineering/types`, so a new `identity/index.ts` and the new type flow through automatically.
- `packages/types/src/index.ts` starts with `/**` and is **hand-maintained** (the barrel scripts touch only the CLI `_registry.ts` and core `index.ts`). It MUST be edited by hand.
- Core convention uses **synchronous** `fs` (`import * as fs from 'fs'`) — see `session-resolver.ts` / `session-archive.ts`. The store uses sync `fs` to match.
- Test conventions: `import { describe, it, expect } from 'vitest'`; temp dirs via `fs.mkdtempSync(path.join(os.tmpdir(), '<prefix>-'))` with `afterEach` cleanup (see `packages/core/tests/state/session-archive.test.ts`).

## Tasks

### Task 1: Add `HarnessIdentity` type + hand-edit the types barrel

**Depends on:** none | **Files:** `packages/types/src/identity.ts`, `packages/types/src/index.ts` | **Owns:** `packages/types/src/identity.ts`

1. Create `packages/types/src/identity.ts`:

   ```ts
   /**
    * @harness-engineering/types — immutable ULID identity for sessions & worktrees.
    *
    * An additive metadata record: the ULID is the durable, sortable, collision-free
    * key assigned once at creation; `number` is a human-friendly sequential label
    * assigned only at completion.
    *
    * Spec: docs/changes/ulid-identity-sessions-worktrees/proposal.md
    */
   export type IdentityDomain = 'session' | 'worktree';

   export interface HarnessIdentity {
     /** Immutable collision-free ULID, assigned once at creation. */
     ulid: string;
     /** Human-facing label — session slug or worktree identifier. */
     slug: string;
     domain: IdentityDomain;
     /** ISO-8601 creation timestamp. */
     createdAt: string;
     /** Sequential human-friendly number; null until completion. */
     number: number | null;
     /** ISO-8601 completion timestamp; null until completion. */
     completedAt: string | null;
   }
   ```

2. Hand-edit `packages/types/src/index.ts` — append after the final `} from './proposals';` block (line ~425):

   ```ts
   // --- Identity ---
   export type { HarnessIdentity, IdentityDomain } from './identity';
   ```

3. Run: `pnpm --filter @harness-engineering/types typecheck` (or `pnpm run typecheck` from repo root)
4. Run: `harness validate`
5. Commit: `feat(types): add HarnessIdentity type for ULID identity`

### Task 2 (TDD): Self-contained ULID generator with monotonic test

**Depends on:** Task 1 | **Files:** `packages/core/src/identity/ulid.ts`, `packages/core/tests/identity/ulid.test.ts` | **Owns:** `packages/core/src/identity/ulid.ts`

1. Create `packages/core/tests/identity/ulid.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { generateUlid, isValidUlid, ulidTime } from '../../src/identity/ulid';

   describe('generateUlid', () => {
     it('returns a 26-char Crockford-base32 string', () => {
       const ulid = generateUlid();
       expect(ulid).toHaveLength(26);
       expect(isValidUlid(ulid)).toBe(true);
     });

     it('is monotonic within a millisecond (same seedTime sorts in creation order)', () => {
       const t = 1_700_000_000_000;
       const a = generateUlid(t);
       const b = generateUlid(t);
       expect(a).not.toBe(b);
       expect(a < b).toBe(true);
     });

     it('encodes the timestamp so later times sort after earlier times', () => {
       const early = generateUlid(1_000);
       const late = generateUlid(2_000);
       expect(early < late).toBe(true);
     });
   });

   describe('isValidUlid', () => {
     it('accepts a well-formed ULID', () => {
       expect(isValidUlid(generateUlid())).toBe(true);
     });
     it('rejects malformed input', () => {
       expect(isValidUlid('')).toBe(false);
       expect(isValidUlid('too-short')).toBe(false);
       expect(isValidUlid('I'.repeat(26))).toBe(false); // I excluded from Crockford base32
       expect(isValidUlid('l'.repeat(26))).toBe(false); // lowercase / L excluded
       expect(isValidUlid('!'.repeat(26))).toBe(false);
     });
   });

   describe('ulidTime', () => {
     it('round-trips the timestamp', () => {
       const t = 1_700_000_000_000;
       expect(ulidTime(generateUlid(t))).toBe(t);
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/core test tests/identity/ulid.test.ts` — observe failure (module missing).
3. Create `packages/core/src/identity/ulid.ts`:

   ```ts
   /**
    * Self-contained ULID (Universally Unique Lexicographically Sortable Identifier).
    *
    * 48-bit millisecond timestamp + 80-bit randomness, Crockford base32, 26 chars,
    * lexicographically sortable. Monotonic within a millisecond (increments the random
    * component rather than re-randomizing). No runtime dependency — mirrors the
    * native-crypto approach of `shared/uuid.ts`.
    */
   const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32 (no I, L, O, U)
   const ENCODING_LEN = ENCODING.length; // 32
   const TIME_LEN = 10;
   const RANDOM_LEN = 16;
   const ULID_RE = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/;

   let lastTime = -1;
   let lastRandom: number[] = [];

   function randomChars(len: number): number[] {
     const bytes = new Uint8Array(len);
     globalThis.crypto.getRandomValues(bytes);
     return Array.from(bytes, (b) => b % ENCODING_LEN);
   }

   function incrementRandom(rand: number[]): number[] {
     const out = [...rand];
     for (let i = out.length - 1; i >= 0; i--) {
       if (out[i]! < ENCODING_LEN - 1) {
         out[i]!++;
         return out;
       }
       out[i] = 0;
     }
     // Overflow (astronomically unlikely) — re-randomize.
     return randomChars(out.length);
   }

   function encodeTime(time: number, len: number): string {
     let out = '';
     let t = time;
     for (let i = 0; i < len; i++) {
       const mod = t % ENCODING_LEN;
       out = ENCODING[mod]! + out;
       t = (t - mod) / ENCODING_LEN;
     }
     return out;
   }

   export function generateUlid(seedTime?: number): string {
     const time = seedTime ?? Date.now();
     const random = time === lastTime ? incrementRandom(lastRandom) : randomChars(RANDOM_LEN);
     lastTime = time;
     lastRandom = random;
     return encodeTime(time, TIME_LEN) + random.map((r) => ENCODING[r]!).join('');
   }

   export function isValidUlid(value: string): boolean {
     return typeof value === 'string' && ULID_RE.test(value);
   }

   export function ulidTime(value: string): number {
     let time = 0;
     for (const ch of value.slice(0, TIME_LEN)) {
       time = time * ENCODING_LEN + ENCODING.indexOf(ch);
     }
     return time;
   }
   ```

4. Run: `pnpm --filter @harness-engineering/core test tests/identity/ulid.test.ts` — observe pass.
5. Run: `harness validate`
6. Commit: `feat(core): add self-contained ULID generator`

### Task 3 (TDD): File-backed identity store (read/ensure/assign/counter)

**Depends on:** Task 2 | **Files:** `packages/core/src/identity/store.ts`, `packages/core/tests/identity/store.test.ts` | **Owns:** `packages/core/src/identity/store.ts`

1. Create `packages/core/tests/identity/store.test.ts`:

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'fs';
   import * as path from 'path';
   import * as os from 'os';
   import {
     readIdentity,
     ensureIdentity,
     assignNumber,
     nextNumber,
   } from '../../src/identity/store';
   import { isValidUlid } from '../../src/identity/ulid';

   describe('identity store', () => {
     let tmp: string;
     beforeEach(() => {
       tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'identity-store-test-'));
     });
     afterEach(() => {
       fs.rmSync(tmp, { recursive: true, force: true });
     });

     it('ensureIdentity writes once and is immutable on re-call with a different slug', () => {
       const file = path.join(tmp, 'a', 'identity.json');
       const first = ensureIdentity(file, { slug: 'my-session', domain: 'session' });
       expect(isValidUlid(first.ulid)).toBe(true);
       expect(first.number).toBeNull();
       expect(first.completedAt).toBeNull();
       const second = ensureIdentity(file, { slug: 'renamed-slug', domain: 'session' });
       expect(second.ulid).toBe(first.ulid); // immutable
       expect(second.slug).toBe('my-session'); // original preserved
     });

     it('readIdentity returns null when the file is absent or malformed', () => {
       expect(readIdentity(path.join(tmp, 'missing.json'))).toBeNull();
       const bad = path.join(tmp, 'bad.json');
       fs.writeFileSync(bad, '{ not json');
       expect(readIdentity(bad)).toBeNull();
     });

     it('nextNumber increments a monotonic counter from an empty start', () => {
       const counter = path.join(tmp, '.number-counter');
       expect(nextNumber(counter)).toBe(1);
       expect(nextNumber(counter)).toBe(2);
       expect(nextNumber(counter)).toBe(3);
     });

     it('assignNumber allocates 1,2,3… across identities and is idempotent per identity', () => {
       const counter = path.join(tmp, '.number-counter');
       const fileA = path.join(tmp, 'a', 'identity.json');
       const fileB = path.join(tmp, 'b', 'identity.json');
       ensureIdentity(fileA, { slug: 'a', domain: 'session' });
       ensureIdentity(fileB, { slug: 'b', domain: 'session' });

       const a1 = assignNumber(fileA, counter);
       expect(a1?.number).toBe(1);
       expect(typeof a1?.completedAt).toBe('string');

       const b1 = assignNumber(fileB, counter);
       expect(b1?.number).toBe(2);

       const a2 = assignNumber(fileA, counter); // idempotent
       expect(a2?.number).toBe(1);
       // counter not re-incremented by the idempotent call:
       const c = assignNumber(path.join(tmp, 'c', 'identity.json'), counter);
       expect(c).toBeNull(); // no identity to assign
     });

     it('assignNumber returns null when no identity exists', () => {
       expect(assignNumber(path.join(tmp, 'none.json'), path.join(tmp, '.c'))).toBeNull();
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/core test tests/identity/store.test.ts` — observe failure.
3. Create `packages/core/src/identity/store.ts`:

   ```ts
   import * as fs from 'fs';
   import * as path from 'path';
   import type { HarnessIdentity, IdentityDomain } from '@harness-engineering/types';
   import { generateUlid } from './ulid';

   /** Best-effort read; returns null when absent or unparseable. */
   export function readIdentity(filePath: string): HarnessIdentity | null {
     try {
       if (!fs.existsSync(filePath)) return null;
       return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as HarnessIdentity;
     } catch {
       return null;
     }
   }

   /**
    * Create-if-absent. Writes the ULID exactly once; a subsequent call returns the
    * existing record unchanged (immutable) even with a different slug. Best-effort:
    * a write failure still returns the in-memory record.
    */
   export function ensureIdentity(
     filePath: string,
     opts: { slug: string; domain: IdentityDomain }
   ): HarnessIdentity {
     const existing = readIdentity(filePath);
     if (existing?.ulid) return existing;
     const record: HarnessIdentity = {
       ulid: generateUlid(),
       slug: opts.slug,
       domain: opts.domain,
       createdAt: new Date().toISOString(),
       number: null,
       completedAt: null,
     };
     try {
       fs.mkdirSync(path.dirname(filePath), { recursive: true });
       fs.writeFileSync(filePath, JSON.stringify(record, null, 2));
     } catch {
       // best-effort — identity is metadata, never a gate.
     }
     return record;
   }

   /** Read-increment-write a monotonic integer counter. Best-effort; starts at 0. */
   export function nextNumber(counterFilePath: string): number {
     let current = 0;
     try {
       if (fs.existsSync(counterFilePath)) {
         const parsed = parseInt(fs.readFileSync(counterFilePath, 'utf-8').trim(), 10);
         if (Number.isFinite(parsed) && parsed >= 0) current = parsed;
       }
     } catch {
       // start from 0
     }
     const next = current + 1;
     try {
       fs.mkdirSync(path.dirname(counterFilePath), { recursive: true });
       fs.writeFileSync(counterFilePath, String(next));
     } catch {
       // best-effort
     }
     return next;
   }

   /**
    * Allocate the next completion number and stamp `number`/`completedAt`.
    * Idempotent: a second call returns the already-assigned record WITHOUT
    * re-incrementing the counter. Returns null when no identity exists.
    */
   export function assignNumber(filePath: string, counterFilePath: string): HarnessIdentity | null {
     const existing = readIdentity(filePath);
     if (!existing) return null;
     if (existing.number !== null && existing.number !== undefined) return existing; // idempotent
     const updated: HarnessIdentity = {
       ...existing,
       number: nextNumber(counterFilePath),
       completedAt: new Date().toISOString(),
     };
     try {
       fs.writeFileSync(filePath, JSON.stringify(updated, null, 2));
     } catch {
       return existing;
     }
     return updated;
   }
   ```

4. Run: `pnpm --filter @harness-engineering/core test tests/identity/store.test.ts` — observe pass.
5. Run: `harness validate`
6. Commit: `feat(core): add file-backed identity store`

### Task 4: Create the identity module barrel

**Depends on:** Task 3 | **Files:** `packages/core/src/identity/index.ts` | **Owns:** `packages/core/src/identity/index.ts`

1. Create `packages/core/src/identity/index.ts`:

   ```ts
   /**
    * @harness-engineering/core — identity module.
    *
    * One identity engine (ULID generation + file-backed create-if-absent store +
    * completion-number allocator) consumed by session and worktree wirings.
    */
   export { generateUlid, isValidUlid, ulidTime } from './ulid';
   export { readIdentity, ensureIdentity, assignNumber, nextNumber } from './store';
   ```

2. Run: `harness validate`
3. Commit: `feat(core): add identity module barrel`

### Task 5: Regenerate barrels and verify the public surface

**Depends on:** Task 4 | **Files:** `packages/core/src/index.ts` (auto-generated) | **Category:** integration

1. Run: `pnpm run generate:barrels`
2. Run: `pnpm run generate:barrels:check` — must report the core barrel is fresh.
3. Verify `packages/core/src/index.ts` now includes an `export * from './identity';` (or equivalent auto-generated entry). Do NOT hand-edit it.
4. Run: `pnpm run typecheck`
5. Commit: `chore(core): regenerate barrels for identity module`

### Task 6 (TDD): Barrel surface test + full-suite/lint gate

**Depends on:** Task 5 | **Files:** `packages/core/tests/identity/barrel.test.ts` | **Category:** integration

1. Create `packages/core/tests/identity/barrel.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { generateUlid, isValidUlid, ensureIdentity } from '../../src/index';
   import type { HarnessIdentity } from '../../src/index';

   describe('core barrel — identity surface', () => {
     it('re-exports the identity engine from the package entry point', () => {
       expect(typeof generateUlid).toBe('function');
       expect(typeof isValidUlid).toBe('function');
       expect(typeof ensureIdentity).toBe('function');
     });
     it('re-exports the HarnessIdentity type through core', () => {
       const id: HarnessIdentity = {
         ulid: generateUlid(),
         slug: 's',
         domain: 'session',
         createdAt: new Date().toISOString(),
         number: null,
         completedAt: null,
       };
       expect(isValidUlid(id.ulid)).toBe(true);
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/core test tests/identity/barrel.test.ts` — observe pass.
3. Run: `pnpm --filter @harness-engineering/core test` — confirm all existing core tests still pass (backward compatibility).
4. Run: `pnpm run lint`
5. Run: `harness validate`
6. Commit: `test(core): verify identity barrel surface`

## Notes / Risks

- `assignNumber` increments the counter before writing the identity; if the identity write then fails, that number is "burned" (a gap in the human-friendly sequence). Acceptable — numbers are display labels, not gates (spec Decision 6).
- Monotonic state (`lastTime`/`lastRandom`) is module-level. Correct for a single-process generator; ULIDs generated across processes in the same ms rely on randomness for uniqueness (standard ULID behavior).
- Changeset is added in Phase 3 (final phase) per the spec Implementation Order, covering all three phases.
