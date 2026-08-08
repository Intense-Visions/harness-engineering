# Plan: ULID Identity — Phase 2 (Session identity wiring)

**Date:** 2026-08-08 | **Spec:** docs/changes/ulid-identity-sessions-worktrees/proposal.md | **Depends on:** Phase 1 | **Tasks:** 4 | **Time:** ~18 min | **Integration Tier:** medium

## Goal

Wire the Phase 1 identity engine into the session lifecycle: `ensureIdentity` at session-directory creation (immutable) and `assignNumber` at session archive, extending the `onArchived` hook info additively with `ulid`/`number` — all best-effort, never breaking session state operations or the archive.

## Observable Truths (Acceptance Criteria)

Derived from spec Success Criteria 4, 5, 7 (partial):

1. Creating a session via `resolveSessionDir(projectPath, slug, { create: true })` writes `<sessionDir>/identity.json` containing a valid ULID, `slug` equal to the session slug, `domain: 'session'`, and `number: null`. The directory name is still the slug (unchanged on-disk layout).
2. Calling `resolveSessionDir(..., { create: true })` again for the same slug does NOT overwrite the ULID (immutable — subsequent resolves are no-ops for identity).
3. A `resolveSessionDir` failure to write identity never changes the returned `Ok(sessionDir)` result — identity is best-effort.
4. `archiveSession` assigns a completion `number` (starting at 1) and `completedAt` to the archived `identity.json`, using the counter `.harness/archive/sessions/.number-counter`.
5. `archiveSession` surfaces `ulid` and `number` to the `onArchived` hook as additive fields; existing `onArchived` consumers (which read only `sessionId`/`archiveDir`/`projectPath`) continue to compile and run unchanged.
6. All existing `packages/core/tests/state/` tests still pass (backward compatibility).
7. Typecheck, lint, and `harness validate` pass.

## File Map

- MODIFY `packages/core/src/state/session-resolver.ts` (best-effort `ensureIdentity` on create)
- MODIFY `packages/core/src/state/session-archive.ts` (best-effort `assignNumber` after archive move; extend `ArchiveHooks.onArchived` info + call site additively)
- CREATE `packages/core/tests/state/session-identity.test.ts` (create-time identity)
- MODIFY `packages/core/tests/state/session-archive.test.ts` (completion-number-at-archive + hook fields)

## Grounding Notes (verified against codebase)

- `session-resolver.ts` `resolveSessionDir` does `fs.mkdirSync(sessionDir, { recursive: true })` inside `if (options?.create)` — the identity write goes immediately after, in the same block. Uses sync `fs` and `path` already imported.
- `session-archive.ts` computes `archiveBase = path.join(projectPath, HARNESS_DIR, ARCHIVE_DIR, 'sessions')` and `dest = path.join(archiveBase, archiveName)` (the moved directory). The archived `identity.json` lives at `path.join(dest, 'identity.json')`; the counter at `path.join(archiveBase, '.number-counter')`.
- `ArchiveHooks.onArchived` currently receives `{ sessionId, archiveDir, projectPath }`. Adding OPTIONAL `ulid?`/`number?` fields is additive and non-breaking (the orchestrator consumer at `packages/orchestrator/src/sessions/archive-hooks.ts:150` destructures only `{ sessionId, archiveDir }`).
- Import path for the identity engine within core is relative: `import { ensureIdentity, assignNumber } from '../identity/store';` (same-package, layer-clean).
- Hook failures are already caught in `session-archive.ts`; the identity write is wrapped in its own try/catch so a failure never aborts the archive (which has already succeeded by then).

## Tasks

### Task 1 (TDD): Wire `ensureIdentity` into session-dir creation

**Depends on:** Phase 1 complete | **Files:** `packages/core/src/state/session-resolver.ts`, `packages/core/tests/state/session-identity.test.ts` | **Owns:** `packages/core/tests/state/session-identity.test.ts`

1. Create `packages/core/tests/state/session-identity.test.ts`:

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'fs';
   import * as path from 'path';
   import * as os from 'os';
   import { resolveSessionDir } from '../../src/state/session-resolver';
   import { readIdentity } from '../../src/identity/store';
   import { isValidUlid } from '../../src/identity/ulid';

   describe('resolveSessionDir — identity', () => {
     let tmp: string;
     beforeEach(() => {
       tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'session-identity-test-'));
     });
     afterEach(() => {
       fs.rmSync(tmp, { recursive: true, force: true });
     });

     it('writes identity.json with a ULID and number:null on create', () => {
       const res = resolveSessionDir(tmp, 'my-session', { create: true });
       expect(res.ok).toBe(true);
       if (!res.ok) return;
       expect(path.basename(res.value)).toBe('my-session'); // slug is still the dir name
       const identity = readIdentity(path.join(res.value, 'identity.json'));
       expect(identity).not.toBeNull();
       expect(isValidUlid(identity!.ulid)).toBe(true);
       expect(identity!.slug).toBe('my-session');
       expect(identity!.domain).toBe('session');
       expect(identity!.number).toBeNull();
       expect(identity!.completedAt).toBeNull();
     });

     it('is immutable — a second resolve does not change the ULID', () => {
       const first = resolveSessionDir(tmp, 'sess', { create: true });
       const idFile = path.join((first as { value: string }).value, 'identity.json');
       const ulid1 = readIdentity(idFile)!.ulid;
       resolveSessionDir(tmp, 'sess', { create: true });
       expect(readIdentity(idFile)!.ulid).toBe(ulid1);
     });

     it('does not write identity when create is not requested', () => {
       const res = resolveSessionDir(tmp, 'no-create');
       expect(res.ok).toBe(true);
       if (!res.ok) return;
       expect(fs.existsSync(path.join(res.value, 'identity.json'))).toBe(false);
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/core test tests/state/session-identity.test.ts` — observe failure.
3. Edit `packages/core/src/state/session-resolver.ts` — add the import near the top (after the existing constants import):

   ```ts
   import { ensureIdentity } from '../identity/store';
   ```

4. In `resolveSessionDir`, replace the create block:

   ```ts
   if (options?.create) {
     fs.mkdirSync(sessionDir, { recursive: true });
   }
   ```

   with:

   ```ts
   if (options?.create) {
     fs.mkdirSync(sessionDir, { recursive: true });
     // Best-effort: record an immutable ULID identity alongside the session.
     // Never blocks session-dir creation — identity is metadata, not a gate.
     try {
       ensureIdentity(path.join(sessionDir, 'identity.json'), {
         slug: sessionSlug,
         domain: 'session',
       });
     } catch {
       // best-effort
     }
   }
   ```

5. Run: `pnpm --filter @harness-engineering/core test tests/state/session-identity.test.ts` — observe pass.
6. Run: `harness validate`
7. Commit: `feat(core): record ULID identity on session creation`

### Task 2: Extend `ArchiveHooks.onArchived` info additively

**Depends on:** Task 1 | **Files:** `packages/core/src/state/session-archive.ts` | **Owns:** none

1. In `packages/core/src/state/session-archive.ts`, update the `ArchiveHooks` interface `onArchived` info object to add two optional fields:

   ```ts
   export interface ArchiveHooks {
     onArchived: (info: {
       sessionId: string;
       /** Absolute path of the new archived directory. */
       archiveDir: string;
       projectPath: string;
       /** Additive: the immutable ULID of the archived session (best-effort). */
       ulid?: string;
       /** Additive: the completion number assigned at archive (best-effort). */
       number?: number;
     }) => Promise<void> | void;
   }
   ```

2. Run: `pnpm run typecheck` — confirm existing `onArchived` consumers still compile (they destructure a subset).
3. Run: `harness validate`
4. Commit: `feat(core): extend onArchived hook info with ulid/number`

### Task 3 (TDD): Assign completion number at archive + surface to hook

**Depends on:** Task 2 | **Files:** `packages/core/src/state/session-archive.ts`, `packages/core/tests/state/session-archive.test.ts` | **Owns:** none

1. Add tests to `packages/core/tests/state/session-archive.test.ts` (new `describe` block, reuse the existing `tmpDir` scaffolding pattern; import `readIdentity` from `../../src/identity/store` and `ensureIdentity` at top):

   ```ts
   import { readIdentity, ensureIdentity } from '../../src/identity/store';
   // ...
   describe('archiveSession — identity completion', () => {
     let tmpDir: string;
     beforeEach(() => {
       tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-identity-test-'));
     });
     afterEach(() => {
       fs.rmSync(tmpDir, { recursive: true, force: true });
     });

     function makeSession(slug: string) {
       const dir = path.join(tmpDir, '.harness', 'sessions', slug);
       fs.mkdirSync(dir, { recursive: true });
       fs.writeFileSync(path.join(dir, 'state.json'), '{"schemaVersion":1}');
       ensureIdentity(path.join(dir, 'identity.json'), { slug, domain: 'session' });
     }

     it('assigns completion number 1,2,… and completedAt on archive', async () => {
       makeSession('sess-a');
       makeSession('sess-b');
       expect((await archiveSession(tmpDir, 'sess-a')).ok).toBe(true);
       expect((await archiveSession(tmpDir, 'sess-b')).ok).toBe(true);

       const base = path.join(tmpDir, '.harness', 'archive', 'sessions');
       const entries = fs.readdirSync(base).filter((e) => !e.startsWith('.'));
       const idA = readIdentity(
         path.join(base, entries.find((e) => e.startsWith('sess-a'))!, 'identity.json')
       );
       const idB = readIdentity(
         path.join(base, entries.find((e) => e.startsWith('sess-b'))!, 'identity.json')
       );
       expect(idA!.number).toBe(1);
       expect(idB!.number).toBe(2);
       expect(typeof idA!.completedAt).toBe('string');
       // counter file exists
       expect(fs.existsSync(path.join(base, '.number-counter'))).toBe(true);
     });

     it('surfaces ulid and number to the onArchived hook', async () => {
       makeSession('sess-hook');
       let received: { ulid?: string; number?: number } = {};
       await archiveSession(tmpDir, 'sess-hook', {
         hooks: {
           onArchived: (info) => {
             received = { ulid: info.ulid, number: info.number };
           },
         },
       });
       expect(typeof received.ulid).toBe('string');
       expect(received.number).toBe(1);
     });

     it('archives fine when no identity.json is present (best-effort)', async () => {
       const dir = path.join(tmpDir, '.harness', 'sessions', 'no-id');
       fs.mkdirSync(dir, { recursive: true });
       fs.writeFileSync(path.join(dir, 'state.json'), '{}');
       const res = await archiveSession(tmpDir, 'no-id');
       expect(res.ok).toBe(true);
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/core test tests/state/session-archive.test.ts` — observe the new tests fail.
3. Edit `packages/core/src/state/session-archive.ts` — add the import near the top:

   ```ts
   import { assignNumber } from '../identity/store';
   ```

4. In `archiveSession`, after the rename/copy block succeeds and BEFORE the `if (options.hooks?.onArchived)` block, insert:

   ```ts
   // Best-effort: allocate the human-friendly completion number against the
   // archived identity. Never blocks the archive (which has already succeeded).
   let ulid: string | undefined;
   let number: number | undefined;
   try {
     const identity = assignNumber(
       path.join(dest, 'identity.json'),
       path.join(archiveBase, '.number-counter')
     );
     if (identity) {
       ulid = identity.ulid;
       number = identity.number ?? undefined;
     }
   } catch {
     // best-effort
   }
   ```

5. Update the `onArchived` call site to pass the additive fields:

   ```ts
   await options.hooks.onArchived({
     sessionId: sessionSlug,
     archiveDir: dest,
     projectPath,
     ulid,
     number,
   });
   ```

6. Run: `pnpm --filter @harness-engineering/core test tests/state/session-archive.test.ts` — observe pass.
7. Run: `harness validate`
8. Commit: `feat(core): assign completion number on session archive`

### Task 4: Backward-compatibility + lint gate

**Depends on:** Task 3 | **Files:** none (verification) | **Category:** integration

1. Run: `pnpm --filter @harness-engineering/core test tests/state/` — confirm all existing state tests still pass.
2. Run: `pnpm --filter @harness-engineering/orchestrator test tests/../src/sessions/archive-hooks.test.ts` (or `pnpm --filter @harness-engineering/orchestrator test archive-hooks`) — confirm the orchestrator `onArchived` consumer still passes with the additive fields.
3. Run: `pnpm run lint`
4. Run: `pnpm run typecheck`
5. Run: `harness validate`
6. Commit (only if any formatting/lint autofix changed files): `chore(core): lint fixups for session identity wiring`

## Notes / Risks

- `[checkpoint:human-verify]` after Task 3: confirm the archived `identity.json` shows `number` + `completedAt` and the `.number-counter` increments as expected across two archives before proceeding to Phase 3.
- The completion counter is per-project at `.harness/archive/sessions/.number-counter`; `.harness/` is gitignored so it never dirties git.
- Changeset is added in Phase 3 (covers all three phases).
