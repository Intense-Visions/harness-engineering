# Plan: Central Telemetry Phase 1 -- Types and Consent Module

**Date:** 2026-04-10
**Spec:** docs/changes/central-telemetry/proposal.md
**Estimated tasks:** 7
**Estimated time:** ~30 minutes

## Goal

Add telemetry types to `packages/types`, implement the consent module and install-id module in `packages/core/src/telemetry/`, extend the config schema with `telemetry.enabled`, and add gitignore entries for telemetry runtime files -- with full test coverage for consent logic and env var overrides.

## Observable Truths (Acceptance Criteria)

1. `packages/types/src/telemetry.ts` exists and exports `TelemetryConfig`, `ConsentState`, and `TelemetryEvent` interfaces.
2. `packages/types/src/index.ts` re-exports all three telemetry types.
3. When `DO_NOT_TRACK=1` is set, `resolveConsent()` returns `{ allowed: false }` regardless of config -- verified by unit test.
4. When `HARNESS_TELEMETRY_OPTOUT=1` is set, `resolveConsent()` returns `{ allowed: false }` regardless of config -- verified by unit test.
5. When config has `telemetry.enabled: false`, `resolveConsent()` returns `{ allowed: false }` -- verified by unit test.
6. When no env vars block and config allows, `resolveConsent()` returns `{ allowed: true, installId: <uuid>, identity: <merged> }` -- verified by unit test.
7. `getOrCreateInstallId()` creates a UUIDv4 at `.harness/.install-id` on first call and returns the same value on subsequent calls -- verified by unit test.
8. `packages/cli/src/config/schema.ts` includes `telemetry: z.object({ enabled: z.boolean().default(true) }).optional()` in `HarnessConfigSchema`.
9. `.harness/.gitignore` includes `.install-id` and `telemetry.json` entries.
10. `npx vitest run packages/core/tests/telemetry/` passes all tests.
11. `harness validate` passes.

## File Map

```
CREATE  packages/types/src/telemetry.ts
MODIFY  packages/types/src/index.ts (add telemetry re-exports)
CREATE  packages/core/src/telemetry/index.ts
CREATE  packages/core/src/telemetry/consent.ts
CREATE  packages/core/src/telemetry/install-id.ts
MODIFY  packages/core/src/index.ts (add telemetry re-export)
MODIFY  packages/cli/src/config/schema.ts (add telemetry field)
MODIFY  .harness/.gitignore (add .install-id and telemetry.json)
CREATE  packages/core/tests/telemetry/consent.test.ts
CREATE  packages/core/tests/telemetry/install-id.test.ts
```

_Skeleton not produced -- task count (7) below threshold (8)._

## Tasks

### Task 1: Define telemetry types in packages/types

**Depends on:** none
**Files:** `packages/types/src/telemetry.ts`, `packages/types/src/index.ts`

1. Create `packages/types/src/telemetry.ts`:

```typescript
/**
 * Project-level telemetry configuration stored in harness.config.json.
 * Only the on/off toggle lives here -- identity is in .harness/telemetry.json.
 */
export interface TelemetryConfig {
  /** Whether telemetry collection is enabled. Default: true. */
  enabled: boolean;
}

/**
 * Optional identity fields stored in .harness/telemetry.json (gitignored).
 * Each field is independently opt-in.
 */
export interface TelemetryIdentity {
  project?: string;
  team?: string;
  alias?: string;
}

/**
 * Resolved consent state after merging env vars, config, and identity file.
 */
export interface ConsentState {
  /** false if DO_NOT_TRACK, HARNESS_TELEMETRY_OPTOUT, or config disabled */
  allowed: boolean;
  /** Only populated when allowed is true */
  identity: TelemetryIdentity;
  /** UUIDv4 install ID -- only populated when allowed is true */
  installId: string;
}

/**
 * A single telemetry event payload for PostHog HTTP batch API.
 */
export interface TelemetryEvent {
  /** Event name, e.g. "skill_invocation", "session_end" */
  event: string;
  /** installId (anonymous) or alias (identified) */
  distinctId: string;
  properties: {
    installId: string;
    os: string;
    nodeVersion: string;
    harnessVersion: string;
    skillName?: string;
    duration?: number;
    outcome?: 'success' | 'failure';
    phasesReached?: string[];
    project?: string;
    team?: string;
  };
  /** ISO 8601 timestamp */
  timestamp: string;
}
```

2. Add re-exports to `packages/types/src/index.ts`. Append after the `// --- Caching / Stability Classification ---` block:

```typescript
// --- Telemetry ---
export type { TelemetryConfig, TelemetryIdentity, ConsentState, TelemetryEvent } from './telemetry';
```

3. Run: `npx tsc --noEmit -p packages/types/tsconfig.json`
4. Run: `harness validate`
5. Commit: `feat(types): add TelemetryConfig, ConsentState, and TelemetryEvent types`

---

### Task 2: Add gitignore entries for telemetry runtime files

**Depends on:** none
**Files:** `.harness/.gitignore`

1. Append to `.harness/.gitignore` after the existing `events.jsonl` line:

```
.install-id
telemetry.json
.telemetry-notice-shown
```

2. Verify: `git check-ignore .harness/.install-id .harness/telemetry.json .harness/.telemetry-notice-shown` should list all three paths.
3. Run: `harness validate`
4. Commit: `chore: gitignore telemetry runtime files (.install-id, telemetry.json)`

---

### Task 3: Extend config schema with telemetry.enabled

**Depends on:** none
**Files:** `packages/cli/src/config/schema.ts`

1. In `packages/cli/src/config/schema.ts`, add a new field to `HarnessConfigSchema` after the `adoption` field (around line 349):

```typescript
  /** Central telemetry collection settings */
  telemetry: z
    .object({
      /** Whether anonymous telemetry is enabled (default: true) */
      enabled: z.boolean().default(true),
    })
    .optional(),
```

2. Run: `npx tsc --noEmit -p packages/cli/tsconfig.json`
3. Run: `harness validate`
4. Commit: `feat(config): add telemetry.enabled to HarnessConfigSchema`

---

### Task 4: Implement install-id module with TDD

**Depends on:** Task 1
**Files:** `packages/core/src/telemetry/install-id.ts`, `packages/core/tests/telemetry/install-id.test.ts`

1. Create test file `packages/core/tests/telemetry/install-id.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getOrCreateInstallId } from '../../src/telemetry/install-id';

describe('getOrCreateInstallId', () => {
  const tmpDir = path.join(__dirname, '__test-tmp-install-id__');
  const installIdFile = path.join(tmpDir, '.harness', '.install-id');

  beforeEach(() => {
    fs.mkdirSync(path.join(tmpDir, '.harness'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a new UUIDv4 when .install-id does not exist', () => {
    const id = getOrCreateInstallId(tmpDir);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(fs.existsSync(installIdFile)).toBe(true);
  });

  it('returns the same ID on subsequent calls', () => {
    const first = getOrCreateInstallId(tmpDir);
    const second = getOrCreateInstallId(tmpDir);
    expect(first).toBe(second);
  });

  it('reads an existing install ID from disk', () => {
    const existingId = '12345678-1234-4abc-8abc-123456789abc';
    fs.writeFileSync(installIdFile, existingId, 'utf-8');
    const id = getOrCreateInstallId(tmpDir);
    expect(id).toBe(existingId);
  });

  it('trims whitespace from stored ID', () => {
    const existingId = '12345678-1234-4abc-8abc-123456789abc';
    fs.writeFileSync(installIdFile, `  ${existingId}  \n`, 'utf-8');
    const id = getOrCreateInstallId(tmpDir);
    expect(id).toBe(existingId);
  });

  it('creates .harness directory if it does not exist', () => {
    fs.rmSync(path.join(tmpDir, '.harness'), { recursive: true, force: true });
    const id = getOrCreateInstallId(tmpDir);
    expect(id).toMatch(/^[0-9a-f]{8}-/);
    expect(fs.existsSync(installIdFile)).toBe(true);
  });
});
```

2. Run test: `npx vitest run packages/core/tests/telemetry/install-id.test.ts`
3. Observe failure: module not found.

4. Create implementation `packages/core/src/telemetry/install-id.ts`:

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

/**
 * Reads or creates a persistent UUIDv4 install ID at `.harness/.install-id`.
 *
 * The ID is anonymous -- it correlates events from the same machine without
 * containing any PII. Created on first telemetry call, reused thereafter.
 */
export function getOrCreateInstallId(projectRoot: string): string {
  const harnessDir = path.join(projectRoot, '.harness');
  const installIdFile = path.join(harnessDir, '.install-id');

  // Try to read existing ID
  try {
    const existing = fs.readFileSync(installIdFile, 'utf-8').trim();
    if (existing.length > 0) {
      return existing;
    }
  } catch {
    // File does not exist -- create it below
  }

  // Generate new UUIDv4
  const id = crypto.randomUUID();

  // Ensure .harness directory exists
  fs.mkdirSync(harnessDir, { recursive: true });
  fs.writeFileSync(installIdFile, id, 'utf-8');

  return id;
}
```

5. Run test: `npx vitest run packages/core/tests/telemetry/install-id.test.ts`
6. Observe: all tests pass.
7. Run: `harness validate`
8. Commit: `feat(telemetry): implement install-id persistence with UUIDv4`

---

### Task 5: Implement consent module with TDD

**Depends on:** Task 1, Task 4
**Files:** `packages/core/src/telemetry/consent.ts`, `packages/core/tests/telemetry/consent.test.ts`

1. Create test file `packages/core/tests/telemetry/consent.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveConsent } from '../../src/telemetry/consent';

describe('resolveConsent', () => {
  const tmpDir = path.join(__dirname, '__test-tmp-consent__');
  const harnessDir = path.join(tmpDir, '.harness');
  const installIdFile = path.join(harnessDir, '.install-id');
  const telemetryJsonFile = path.join(harnessDir, 'telemetry.json');

  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.DO_NOT_TRACK;
    delete process.env.HARNESS_TELEMETRY_OPTOUT;
    fs.mkdirSync(harnessDir, { recursive: true });
  });

  afterEach(() => {
    process.env = originalEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // --- Env var blocking ---

  it('returns allowed:false when DO_NOT_TRACK=1', () => {
    process.env.DO_NOT_TRACK = '1';
    const result = resolveConsent(tmpDir, { enabled: true });
    expect(result.allowed).toBe(false);
    expect(result.installId).toBe('');
  });

  it('returns allowed:false when HARNESS_TELEMETRY_OPTOUT=1', () => {
    process.env.HARNESS_TELEMETRY_OPTOUT = '1';
    const result = resolveConsent(tmpDir, { enabled: true });
    expect(result.allowed).toBe(false);
    expect(result.installId).toBe('');
  });

  it('ignores DO_NOT_TRACK when value is not "1"', () => {
    process.env.DO_NOT_TRACK = 'false';
    const result = resolveConsent(tmpDir, { enabled: true });
    expect(result.allowed).toBe(true);
  });

  it('ignores HARNESS_TELEMETRY_OPTOUT when value is not "1"', () => {
    process.env.HARNESS_TELEMETRY_OPTOUT = '0';
    const result = resolveConsent(tmpDir, { enabled: true });
    expect(result.allowed).toBe(true);
  });

  // --- Config blocking ---

  it('returns allowed:false when config.enabled is false', () => {
    const result = resolveConsent(tmpDir, { enabled: false });
    expect(result.allowed).toBe(false);
  });

  // --- Env vars override config ---

  it('DO_NOT_TRACK=1 overrides config enabled:true', () => {
    process.env.DO_NOT_TRACK = '1';
    const result = resolveConsent(tmpDir, { enabled: true });
    expect(result.allowed).toBe(false);
  });

  // --- Allowed path ---

  it('returns allowed:true with installId when no blockers', () => {
    const result = resolveConsent(tmpDir, { enabled: true });
    expect(result.allowed).toBe(true);
    expect(result.installId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(result.identity).toEqual({});
  });

  it('returns identity fields from .harness/telemetry.json', () => {
    fs.writeFileSync(
      telemetryJsonFile,
      JSON.stringify({ identity: { project: 'myapp', team: 'platform' } }),
      'utf-8'
    );
    const result = resolveConsent(tmpDir, { enabled: true });
    expect(result.allowed).toBe(true);
    expect(result.identity).toEqual({ project: 'myapp', team: 'platform' });
  });

  it('returns empty identity when telemetry.json does not exist', () => {
    const result = resolveConsent(tmpDir, { enabled: true });
    expect(result.identity).toEqual({});
  });

  it('returns empty identity when telemetry.json is malformed', () => {
    fs.writeFileSync(telemetryJsonFile, 'not json', 'utf-8');
    const result = resolveConsent(tmpDir, { enabled: true });
    expect(result.identity).toEqual({});
  });

  it('defaults config to enabled:true when undefined', () => {
    const result = resolveConsent(tmpDir, undefined);
    expect(result.allowed).toBe(true);
  });
});
```

2. Run test: `npx vitest run packages/core/tests/telemetry/consent.test.ts`
3. Observe failure: module not found.

4. Create implementation `packages/core/src/telemetry/consent.ts`:

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ConsentState, TelemetryConfig, TelemetryIdentity } from '@harness-engineering/types';
import { getOrCreateInstallId } from './install-id';

/**
 * Reads optional identity fields from `.harness/telemetry.json`.
 * Returns empty object if the file is missing or malformed.
 */
function readIdentity(projectRoot: string): TelemetryIdentity {
  const filePath = path.join(projectRoot, '.harness', 'telemetry.json');
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.identity) {
      const { project, team, alias } = parsed.identity;
      const identity: TelemetryIdentity = {};
      if (typeof project === 'string') identity.project = project;
      if (typeof team === 'string') identity.team = team;
      if (typeof alias === 'string') identity.alias = alias;
      return identity;
    }
    return {};
  } catch {
    return {};
  }
}

const DISALLOWED: ConsentState = { allowed: false, identity: {}, installId: '' };

/**
 * Resolves telemetry consent by checking (in order):
 * 1. DO_NOT_TRACK=1 env var (ecosystem standard)
 * 2. HARNESS_TELEMETRY_OPTOUT=1 env var
 * 3. config.enabled (from harness.config.json telemetry section)
 *
 * If allowed, reads install ID and optional identity fields.
 */
export function resolveConsent(
  projectRoot: string,
  config: TelemetryConfig | undefined
): ConsentState {
  // Env vars always win
  if (process.env.DO_NOT_TRACK === '1') return DISALLOWED;
  if (process.env.HARNESS_TELEMETRY_OPTOUT === '1') return DISALLOWED;

  // Config check (default to enabled)
  const enabled = config?.enabled ?? true;
  if (!enabled) return DISALLOWED;

  // Telemetry is allowed -- gather identity and install ID
  const installId = getOrCreateInstallId(projectRoot);
  const identity = readIdentity(projectRoot);

  return { allowed: true, installId, identity };
}
```

5. Run test: `npx vitest run packages/core/tests/telemetry/consent.test.ts`
6. Observe: all tests pass.
7. Run: `harness validate`
8. Commit: `feat(telemetry): implement consent resolution with env var and config checks`

---

### Task 6: Create telemetry barrel export and wire into core

**Depends on:** Task 4, Task 5
**Files:** `packages/core/src/telemetry/index.ts`, `packages/core/src/index.ts`

1. Create `packages/core/src/telemetry/index.ts`:

```typescript
export { resolveConsent } from './consent';
export { getOrCreateInstallId } from './install-id';
```

2. Add re-export to `packages/core/src/index.ts`. Append after the `// --- Caching ---` block (before the `VERSION` constant):

```typescript
/**
 * Telemetry module for consent resolution and install identity.
 */
export { resolveConsent, getOrCreateInstallId } from './telemetry';
```

3. Run: `npx tsc --noEmit -p packages/core/tsconfig.json`
4. Run all telemetry tests: `npx vitest run packages/core/tests/telemetry/`
5. Observe: all tests pass.
6. Run: `harness validate`
7. Commit: `feat(telemetry): wire consent and install-id into core barrel export`

---

### Task 7: Final validation and cross-check

**Depends on:** Task 1, Task 2, Task 3, Task 4, Task 5, Task 6

[checkpoint:human-verify]

1. Run full test suite for core: `npx vitest run --project core` (or `npx vitest run` from packages/core).
2. Run: `npx tsc --noEmit -p packages/types/tsconfig.json`
3. Run: `npx tsc --noEmit -p packages/core/tsconfig.json`
4. Run: `npx tsc --noEmit -p packages/cli/tsconfig.json`
5. Run: `harness validate`
6. Verify observable truths:
   - `packages/types/src/telemetry.ts` exists with `TelemetryConfig`, `ConsentState`, `TelemetryEvent`.
   - `packages/types/src/index.ts` re-exports them.
   - `packages/core/src/telemetry/consent.ts` exports `resolveConsent`.
   - `packages/core/src/telemetry/install-id.ts` exports `getOrCreateInstallId`.
   - `packages/cli/src/config/schema.ts` has `telemetry` field in `HarnessConfigSchema`.
   - `.harness/.gitignore` has `.install-id`, `telemetry.json`, `.telemetry-notice-shown`.
   - `git check-ignore .harness/.install-id .harness/telemetry.json .harness/.telemetry-notice-shown` lists all three.
7. No commit needed -- this is a verification-only task.
