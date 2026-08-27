# Plan: Serve-time hash gate + `gather_context` comprehension constituent (Phase 2)

**Date:** 2026-08-27 | **Spec:** `docs/changes/compiled-comprehension-substrate/proposal.md` (Implementation Order phase 2) | **Tasks:** 8 | **Time:** ~34 min | **Integration Tier:** medium

## Goal

Serve compiled comprehension units to agents as primary context, guarded by an LLM-free serve-time hash gate that never serves a source-stale unit — delivering the correct, credential-free vertical slice (SC2, SC4) on top of the phase-1 core module.

## Observable Truths (Acceptance Criteria)

1. **[SC2, unit]** `serveGate(unit, reader)` returns `{ serve: true, unit }` when the reader's current enumeration hashes (via `computeSourceHash`) to `unit.provenance.sourceHash`; it returns `{ serve: false, reason: 'source-stale', module, recompile: true }` on ANY mismatch — a member file's content change, a membership add/remove, or a deleted/absent module directory. (Task 1)
2. `createNodeModuleSourceReader(projectRoot).readModuleSource(module)` enumerates the module directory's direct source files as module-relative posix `SourceFile[]` and returns `null` for an absent directory. (Task 2)
3. `renderServedUnit(unit)` returns compact served-form markdown: body sections plus a single `sourceHash` provenance line, no full frontmatter; a `semantic: absent` unit omits Summary/Invariants. (Task 3)
4. `import { serveGate, createNodeModuleSourceReader, renderServedUnit, type ServeVerdict, type ModuleSourceReader } from '@harness-engineering/core'` resolves; `pnpm run generate:barrels:check` passes. (Task 4)
5. The `gather_context` tool's `include` enum, `IncludeKey` type, and default include set all contain `comprehension` (default-on). (Task 5)
6. **[SC2 integration + SC4]** When `.harness/comprehension/` holds a fresh unit and a source-stale unit, `handleGatherContext({ include: ['comprehension'] })` returns the fresh unit in the served block (detailed mode) / counts (summary mode), drops the source-stale unit and reports it under a recompile signal, runs with **zero LLM and no credential** (no provider imported, no API-key env needed), and returns `null`/empty gracefully when `.harness/comprehension/` is absent. (Task 7)
7. `LOCAL_STAGE_PROMPT_TEMPLATE` contains the guidance: comprehension units are the agent's primary understanding — read raw source only for the edit region. (Task 8)

## NFR Targets

_No NFR dimension elicited for this phase (the correctness spine is deterministic and LLM-free; performance/security/scalability/resilience targets are out of scope). Section intentionally minimal._

## File Map

- CREATE `packages/core/src/comprehension/serve-gate.ts`
- CREATE `packages/core/tests/comprehension/serve-gate.test.ts`
- MODIFY `packages/core/src/comprehension/node-io.ts` (add `createNodeModuleSourceReader`)
- MODIFY `packages/core/tests/comprehension/node-io.test.ts` (add reader tests)
- CREATE `packages/core/src/comprehension/render.ts`
- CREATE `packages/core/tests/comprehension/render.test.ts`
- MODIFY `packages/core/src/comprehension/index.ts` (export new symbols)
- MODIFY `packages/core/src/index.ts` (barrel regen — expected no diff; `comprehension` is a star module)
- MODIFY `packages/cli/src/mcp/tools/gather-context.ts` (schema/type/default set + comprehension constituent)
- MODIFY `packages/cli/tests/mcp/tools/gather-context.test.ts` (update include-enum assertion)
- CREATE `packages/cli/tests/mcp/tools/gather-context-comprehension.test.ts` (SC2 + SC4 integration)
- MODIFY `packages/orchestrator/src/workflow/local-stage-prompt.ts` (guidance text)
- MODIFY `packages/orchestrator/src/workflow/local-stage-prompt.test.ts` (assert guidance substring)

## Skeleton

1. Core serve gate + node reader + served renderer, each TDD (~3 tasks, ~13 min)
2. Core barrel exports (~1 task, ~3 min)
3. `gather_context` schema + constituent + integration tests (~3 tasks, ~15 min)
4. Orchestrator stage-prompt guidance (~1 task, ~3 min)

**Estimated total:** 8 tasks, ~34 minutes. _Skeleton approved: pending._

## Key contract & concerns

- **Enumeration is the shared correctness contract.** `createNodeModuleSourceReader` defines the canonical module-directory enumeration (direct source files, non-recursive per D3, keyed by module-relative posix basename). The serve gate recomputes `sourceHash` from it, so it MUST match how the compiler enumerated when the unit was written. **Phase 4's `harness comprehend` compile path MUST reuse `createNodeModuleSourceReader` (single source of truth) or recomputed hashes will never match compiled hashes.** Flagged for the phase-4 plan.
- **`ComprehensionStore` root is relative.** `COMPREHENSION_ROOT` = `.harness/comprehension` (cwd-relative). The constituent MUST pass an absolute, posix-normalized `root` = `<projectPath>/.harness/comprehension`, else it reads the wrong tree.
- **Additive + graceful.** `comprehension` is default-on but `listUnitPaths` on an absent root returns `[]` (no throw), so projects without `.harness/comprehension/` degrade silently.

---

## Tasks

### Task 1: Serve-time hash gate (pure, LLM-free) — TDD

**Depends on:** none | **Files:** `packages/core/src/comprehension/serve-gate.ts`, `packages/core/tests/comprehension/serve-gate.test.ts` | **Owns:** `packages/core/src/comprehension/serve-gate.ts` | **Category:** implementation

1. Create `packages/core/tests/comprehension/serve-gate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { serveGate } from '../../src/comprehension/serve-gate';
import type { ModuleSourceReader } from '../../src/comprehension/serve-gate';
import { computeSourceHash } from '../../src/comprehension/source-hash';
import type { ComprehensionUnit, SourceFile } from '../../src/comprehension/types';
import { SCHEMA_VERSION, COMPILER_VERSION } from '../../src/comprehension/types';

const FILES: SourceFile[] = [
  { path: 'a.ts', content: 'export const a = 1;' },
  { path: 'b.ts', content: 'export const b = 2;' },
];

function unit(sourceHash: string): ComprehensionUnit {
  return {
    provenance: {
      schemaVersion: SCHEMA_VERSION,
      module: 'pkg/mod',
      sourceHash,
      compiledAt: '2026-08-27T00:00:00.000Z',
      compiler: { static: COMPILER_VERSION.static, semantic: COMPILER_VERSION.semantic },
      model: null,
      semantic: 'absent',
      members: ['a.ts', 'b.ts'],
    },
    summary: '',
    invariants: [],
    interfaceContract: 'export const a: 1',
    dependencySlice: 'imports: none',
  };
}

function reader(files: SourceFile[] | null): ModuleSourceReader {
  return { readModuleSource: async () => files };
}

describe('serveGate (serve-time hash gate, D7/SC2)', () => {
  it('serves a unit whose stored hash matches current enumeration', async () => {
    const v = await serveGate(unit(computeSourceHash(FILES)), reader(FILES));
    expect(v.serve).toBe(true);
    if (v.serve) expect(v.unit.provenance.module).toBe('pkg/mod');
  });

  it('refuses when a member file content changed (source-stale + recompile)', async () => {
    const changed = [FILES[0], { path: 'b.ts', content: 'export const b = 3;' }];
    const v = await serveGate(unit(computeSourceHash(FILES)), reader(changed));
    expect(v).toEqual({ serve: false, reason: 'source-stale', module: 'pkg/mod', recompile: true });
  });

  it('refuses on a membership delta (added file)', async () => {
    const added = [...FILES, { path: 'c.ts', content: 'export const c = 3;' }];
    const v = await serveGate(unit(computeSourceHash(FILES)), reader(added));
    expect(v.serve).toBe(false);
  });

  it('refuses when the module directory is absent (null enumeration)', async () => {
    const v = await serveGate(unit(computeSourceHash(FILES)), reader(null));
    expect(v.serve).toBe(false);
    if (!v.serve) expect(v.recompile).toBe(true);
  });
});
```

2. Run: `pnpm --filter @harness-engineering/core test -- serve-gate` — observe failure (module missing).
3. Create `packages/core/src/comprehension/serve-gate.ts`:

```ts
import type { ComprehensionUnit, SourceFile } from './types';
import { computeSourceHash } from './source-hash';

/**
 * Injected directory-enumeration IO for the serve-time gate (D5/D7). Returns the
 * module directory's CURRENT source files (module-relative posix path + content),
 * or `null` when the directory is absent/deleted. The concrete node adapter is
 * `createNodeModuleSourceReader`; tests inject a fake. This is the ONLY IO the
 * gate performs — no LLM, no credential (SC4).
 */
export interface ModuleSourceReader {
  readModuleSource(module: string): Promise<SourceFile[] | null>;
}

/** Serve-gate verdict: serve a fresh unit, or refuse a source-stale one. */
export type ServeVerdict =
  | { serve: true; unit: ComprehensionUnit }
  | { serve: false; reason: 'source-stale'; module: string; recompile: true };

/**
 * The serve-time hash gate — the sole correctness authority (D7), LLM-free.
 * Re-enumerates the module's current membership + contents via the injected
 * reader, recomputes `sourceHash` with the SAME primitive the compiler used
 * (`computeSourceHash`), and refuses to serve on any mismatch: a content change,
 * a membership delta (add/remove — folded into the hash), or a deleted directory
 * (`null` enumeration). A refusal carries a recompile signal so callers fall back
 * to graph/source. Requires no LLM and no credential.
 */
export async function serveGate(
  unit: ComprehensionUnit,
  reader: ModuleSourceReader
): Promise<ServeVerdict> {
  const module = unit.provenance.module;
  const current = await reader.readModuleSource(module);
  if (current === null) {
    return { serve: false, reason: 'source-stale', module, recompile: true };
  }
  if (computeSourceHash(current) !== unit.provenance.sourceHash) {
    return { serve: false, reason: 'source-stale', module, recompile: true };
  }
  return { serve: true, unit };
}
```

4. Run: `pnpm --filter @harness-engineering/core test -- serve-gate` — observe pass.
5. Run: `harness validate`
6. Commit: `feat(comprehension): add LLM-free serve-time hash gate (SC2)`

### Task 2: Node module-source reader (canonical enumeration) — TDD

**Depends on:** Task 1 | **Files:** `packages/core/src/comprehension/node-io.ts`, `packages/core/tests/comprehension/node-io.test.ts` | **Owns:** `packages/core/src/comprehension/node-io.ts` | **Category:** implementation

> Depends on Task 1 only because the reader implements the `ModuleSourceReader` type from `serve-gate.ts`.

1. Add to `packages/core/tests/comprehension/node-io.test.ts` (append a new `describe` block; keep existing tests intact):

```ts
import { createNodeModuleSourceReader } from '../../src/comprehension/node-io';
import { computeSourceHash } from '../../src/comprehension/source-hash';

describe('createNodeModuleSourceReader (canonical enumeration)', () => {
  it('enumerates direct source files keyed by module-relative basename', async () => {
    root = await fsp.mkdtemp(path.join(os.tmpdir(), 'comprehension-src-'));
    const mod = path.join(root, 'pkg', 'mod');
    await fsp.mkdir(mod, { recursive: true });
    await fsp.writeFile(path.join(mod, 'a.ts'), 'export const a = 1;');
    await fsp.writeFile(path.join(mod, 'b.ts'), 'export const b = 2;');
    await fsp.writeFile(path.join(mod, 'README.md'), 'ignored'); // non-source ext
    const files = await createNodeModuleSourceReader(root).readModuleSource('pkg/mod');
    expect(files?.map((f) => f.path).sort()).toEqual(['a.ts', 'b.ts']);
    // Stable hash: reader output feeds computeSourceHash deterministically.
    expect(typeof computeSourceHash(files!)).toBe('string');
  });

  it('returns null for an absent module directory', async () => {
    root = await fsp.mkdtemp(path.join(os.tmpdir(), 'comprehension-src-'));
    expect(await createNodeModuleSourceReader(root).readModuleSource('nope/gone')).toBeNull();
  });

  it('does not recurse into nested sub-directories (module = directory, D3)', async () => {
    root = await fsp.mkdtemp(path.join(os.tmpdir(), 'comprehension-src-'));
    const mod = path.join(root, 'm');
    await fsp.mkdir(path.join(mod, 'sub'), { recursive: true });
    await fsp.writeFile(path.join(mod, 'top.ts'), 'export const t = 1;');
    await fsp.writeFile(path.join(mod, 'sub', 'deep.ts'), 'export const d = 1;');
    const files = await createNodeModuleSourceReader(root).readModuleSource('m');
    expect(files?.map((f) => f.path)).toEqual(['top.ts']);
  });
});
```

2. Run: `pnpm --filter @harness-engineering/core test -- node-io` — observe failure.
3. Add to `packages/core/src/comprehension/node-io.ts` (new imports at top + exported function; keep `createNodeComprehensionIO` unchanged):

```ts
import type { ModuleSourceReader } from './serve-gate';
import type { SourceFile } from './types';

/** Default source-file extensions the module-source reader enumerates. */
const DEFAULT_SOURCE_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.rs',
  '.go',
  '.java',
  '.rb',
];

/**
 * Node-fs `ModuleSourceReader` — the CANONICAL module-directory enumeration used
 * by the serve-time gate (and, in a later phase, the compiler, so the recomputed
 * hash matches the compiled one — single source of truth). Enumerates the module
 * directory's DIRECT source files (non-recursive: a nested directory is its own
 * module, D3), keys each `SourceFile.path` by its module-relative posix basename,
 * and returns `null` when the directory is absent (a deleted module → source-stale
 * at the gate). No LLM, no credential.
 */
export function createNodeModuleSourceReader(
  projectRoot: string,
  options: { extensions?: string[] } = {}
): ModuleSourceReader {
  const exts = new Set(options.extensions ?? DEFAULT_SOURCE_EXTENSIONS);
  return {
    readModuleSource: async (module) => {
      const dir = path.join(projectRoot, module);
      let entries: import('node:fs').Dirent[];
      try {
        entries = await fsp.readdir(dir, { withFileTypes: true });
      } catch {
        return null; // absent/deleted module dir ⇒ source-stale at the gate
      }
      const files: SourceFile[] = [];
      for (const e of entries) {
        if (!e.isFile() || !exts.has(path.extname(e.name))) continue;
        files.push({ path: e.name, content: await fsp.readFile(path.join(dir, e.name), 'utf-8') });
      }
      return files;
    },
  };
}
```

4. Run: `pnpm --filter @harness-engineering/core test -- node-io` — observe pass.
5. Run: `harness validate`
6. Commit: `feat(comprehension): add canonical node module-source reader`

### Task 3: Served (wire) renderer — TDD

**Depends on:** none | **Files:** `packages/core/src/comprehension/render.ts`, `packages/core/tests/comprehension/render.test.ts` | **Owns:** `packages/core/src/comprehension/render.ts` | **Category:** implementation

1. Create `packages/core/tests/comprehension/render.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderServedUnit } from '../../src/comprehension/render';
import type { ComprehensionUnit } from '../../src/comprehension/types';
import { SCHEMA_VERSION, COMPILER_VERSION } from '../../src/comprehension/types';

function base(semantic: 'present' | 'absent'): ComprehensionUnit {
  return {
    provenance: {
      schemaVersion: SCHEMA_VERSION,
      module: 'pkg/mod',
      sourceHash: 'a'.repeat(64),
      compiledAt: '2026-08-27T00:00:00.000Z',
      compiler: { static: COMPILER_VERSION.static, semantic: COMPILER_VERSION.semantic },
      model: null,
      semantic,
      members: ['a.ts'],
    },
    summary: 'Does the thing.',
    invariants: ['always X'],
    interfaceContract: 'export const a: 1',
    dependencySlice: 'imports: none',
  };
}

describe('renderServedUnit (served wire format)', () => {
  it('collapses provenance to a single sourceHash line — no full frontmatter', () => {
    const md = renderServedUnit(base('present'));
    expect(md).toContain('a'.repeat(64));
    expect(md).not.toContain('schemaVersion:');
    expect(md).not.toContain('compiledAt:');
  });

  it('renders static sections always and semantic sections when present', () => {
    const md = renderServedUnit(base('present'));
    expect(md).toContain('## Interface Contract');
    expect(md).toContain('## Dependency Slice');
    expect(md).toContain('Does the thing.');
    expect(md).toContain('always X');
  });

  it('omits Summary/Invariants for a static-only (semantic: absent) unit', () => {
    const md = renderServedUnit(base('absent'));
    expect(md).not.toContain('## Summary');
    expect(md).not.toContain('## Invariants');
    expect(md).toContain('## Interface Contract');
  });
});
```

2. Run: `pnpm --filter @harness-engineering/core test -- render` — observe failure.
3. Create `packages/core/src/comprehension/render.ts`:

````ts
import type { ComprehensionUnit } from './types';

/**
 * Render a unit to its compact SERVED (wire) form: the body sections as markdown
 * with provenance collapsed to a single `sourceHash` line — no full frontmatter.
 * Markdown is ~15–30% cheaper than pretty-JSON and read natively by models. A
 * `semantic: absent` unit omits Summary/Invariants (static-only). The LLM half is
 * framed as advisory (truth-vs-freshness: the semantic half is advisory, the
 * static half is exact).
 */
export function renderServedUnit(unit: ComprehensionUnit): string {
  const p = unit.provenance;
  const out: string[] = [`# ${p.module}`, `<!-- sourceHash: ${p.sourceHash} -->`, ''];
  if (p.semantic === 'present') {
    out.push('## Summary (advisory)', '', unit.summary.trim(), '');
    if (unit.invariants.length > 0) {
      out.push('## Invariants (advisory)', '');
      for (const inv of unit.invariants) out.push(`- ${inv}`);
      out.push('');
    }
  }
  out.push('## Interface Contract', '', '```ts', unit.interfaceContract.trim(), '```', '');
  out.push('## Dependency Slice', '', '```', unit.dependencySlice.trim(), '```', '');
  return out.join('\n').replace(/\n+$/, '\n');
}
````

4. Run: `pnpm --filter @harness-engineering/core test -- render` — observe pass.
5. Run: `harness validate`
6. Commit: `feat(comprehension): add served wire-format renderer`

### Task 4: Export new symbols + regenerate core barrel

**Depends on:** Task 1, Task 2, Task 3 | **Files:** `packages/core/src/comprehension/index.ts`, `packages/core/src/index.ts` | **Owns:** `packages/core/src/comprehension/index.ts` | **Category:** integration

1. Add to `packages/core/src/comprehension/index.ts` (after the existing `compile` exports):

```ts
export { serveGate } from './serve-gate';
export type { ServeVerdict, ModuleSourceReader } from './serve-gate';
export { createNodeModuleSourceReader } from './node-io';
export { renderServedUnit } from './render';
```

2. Regenerate the barrel: `node scripts/generate-core-barrel.mjs`
   (`comprehension` is a star module — `export * from './comprehension'` — so `packages/core/src/index.ts` is expected to show no diff; the new symbols are already re-exported transitively. Run it to be certain.)
3. Verify barrels are in sync: `pnpm run generate:barrels:check`
4. Confirm resolution: `pnpm --filter @harness-engineering/core build` (dts emits the new exports).
5. Run: `harness validate`
6. Commit: `feat(comprehension): export serve gate, module-source reader, renderer`

### Task 5: Add `comprehension` to gather_context schema, type, and default include set

**Depends on:** none | **Files:** `packages/cli/src/mcp/tools/gather-context.ts`, `packages/cli/tests/mcp/tools/gather-context.test.ts` | **Owns:** — (shares `gather-context.ts` with Task 7, sequenced before it) | **Category:** implementation

> Schema-only change (no core symbols). Sequenced before Task 7 to avoid a same-file collision.

1. Update the existing include-enum assertion in `packages/cli/tests/mcp/tools/gather-context.test.ts` (the `it('include enum has all constituent names', ...)` block) to append `'comprehension'`:

```ts
expect(includeProp.items.enum).toEqual([
  'state',
  'learnings',
  'handoff',
  'graph',
  'validation',
  'sessions',
  'events',
  'businessKnowledge',
  'comprehension',
]);
```

2. Run: `pnpm --filter @harness-engineering/cli test -- gather-context.test` — observe the enum test fail.
3. In `packages/cli/src/mcp/tools/gather-context.ts`, add `'comprehension'` in three places:
   - The `IncludeKey` union (after `'businessKnowledge'`): `| 'comprehension'`.
   - The `include` inputSchema enum array (after `'businessKnowledge'`): `'comprehension',`.
   - The default include set on the `includeSet` line:

```ts
const includeSet = new Set<IncludeKey>(
  input.include ?? [
    'state',
    'learnings',
    'handoff',
    'graph',
    'validation',
    'businessKnowledge',
    'comprehension',
  ]
);
```

4. Run: `pnpm --filter @harness-engineering/cli test -- gather-context.test` — observe pass.
5. Run: `harness validate`
6. Commit: `feat(gather-context): register default-on comprehension include`

### Task 6: [checkpoint:human-verify] — confirm core slice before CLI wiring

**Depends on:** Task 4, Task 5 | **Files:** none | **Category:** checkpoint

`[checkpoint:human-verify]` Pause and show: (a) `pnpm --filter @harness-engineering/core test -- comprehension` all green, (b) `pnpm run generate:barrels:check` green. Confirm the serve gate + reader + renderer + exports are sound before wiring the MCP constituent. Wait for confirmation.

### Task 7: Wire the `comprehension` constituent into gather_context — TDD (SC2 + SC4)

**Depends on:** Task 4, Task 5, Task 6 | **Files:** `packages/cli/src/mcp/tools/gather-context.ts`, `packages/cli/tests/mcp/tools/gather-context-comprehension.test.ts` | **Owns:** `packages/cli/src/mcp/tools/gather-context.ts` | **Category:** implementation

1. Create `packages/cli/tests/mcp/tools/gather-context-comprehension.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fsp from 'node:fs/promises';
import {
  ComprehensionStore,
  createNodeComprehensionIO,
  createNodeModuleSourceReader,
  computeSourceHash,
  COMPILER_VERSION,
  SCHEMA_VERSION,
} from '@harness-engineering/core';
import type { ComprehensionUnit } from '@harness-engineering/core';
import { handleGatherContext } from '../../../src/mcp/tools/gather-context';

let root = '';
beforeEach(async () => {
  root = await fsp.mkdtemp(path.join(os.tmpdir(), 'gc-comp-'));
});
afterEach(async () => {
  if (root) await fsp.rm(root, { recursive: true, force: true });
});

async function writeModule(module: string, files: Record<string, string>) {
  const dir = path.join(root, module);
  await fsp.mkdir(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    await fsp.writeFile(path.join(dir, name), content);
  }
}

function unit(module: string, sourceHash: string): ComprehensionUnit {
  return {
    provenance: {
      schemaVersion: SCHEMA_VERSION,
      module,
      sourceHash,
      compiledAt: '2026-08-27T00:00:00.000Z',
      compiler: { static: COMPILER_VERSION.static, semantic: COMPILER_VERSION.semantic },
      model: null,
      semantic: 'absent', // static-only unit is valid this phase (SC4)
      members: Object.keys({ 'a.ts': 1 }),
    },
    summary: '',
    invariants: [],
    interfaceContract: `export const from_${module.replace(/\W/g, '_')}: 1`,
    dependencySlice: 'imports: none',
  };
}

async function seed(module: string, files: Record<string, string>, hash: string) {
  await writeModule(module, files);
  const store = new ComprehensionStore({
    root: `${root.replaceAll('\\', '/')}/.harness/comprehension`,
    io: createNodeComprehensionIO(),
  });
  const r = await store.write(unit(module, hash));
  expect(r.ok).toBe(true);
}

describe('gather_context comprehension constituent (SC2, SC4)', () => {
  it('serves a fresh unit and drops a source-stale one with a recompile signal (SC2)', async () => {
    const freshFiles = { 'a.ts': 'export const a = 1;' };
    const freshHash = computeSourceHash(
      (await createNodeModuleSourceReader(root).readModuleSource('pkg/fresh'))!
    );
    // seed fresh AFTER computing hash from the written files:
    await writeModule('pkg/fresh', freshFiles);
    await seed(
      'pkg/fresh',
      freshFiles,
      computeSourceHash((await createNodeModuleSourceReader(root).readModuleSource('pkg/fresh'))!)
    );
    await seed('pkg/stale', { 'a.ts': 'export const a = 1;' }, 'd'.repeat(64)); // wrong hash

    const res = await handleGatherContext({
      path: root,
      intent: 'understand modules',
      include: ['comprehension'],
      mode: 'detailed',
    });
    const parsed = JSON.parse(res.content[0].text);
    const served: Array<{ module: string }> = parsed.comprehension.served;
    expect(served.map((s) => s.module)).toContain('pkg/fresh');
    expect(served.map((s) => s.module)).not.toContain('pkg/stale');
    expect(parsed.comprehension.stale.map((s: { module: string }) => s.module)).toContain(
      'pkg/stale'
    );
  });

  it('runs the whole serve path with zero LLM / no credential (SC4)', async () => {
    const saved = {
      key: process.env.ANTHROPIC_API_KEY,
      base: process.env.HARNESS_ANALYSIS_BASE_URL,
    };
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.HARNESS_ANALYSIS_BASE_URL;
    try {
      const files = { 'a.ts': 'export const a = 1;' };
      await writeModule('m', files);
      await seed(
        'm',
        files,
        computeSourceHash((await createNodeModuleSourceReader(root).readModuleSource('m'))!)
      );
      const res = await handleGatherContext({
        path: root,
        intent: 'x',
        include: ['comprehension'],
        mode: 'detailed',
      });
      const parsed = JSON.parse(res.content[0].text);
      expect(parsed.comprehension.served.map((s: { module: string }) => s.module)).toContain('m');
      expect(parsed.meta.errors).toEqual([]);
    } finally {
      if (saved.key) process.env.ANTHROPIC_API_KEY = saved.key;
      if (saved.base) process.env.HARNESS_ANALYSIS_BASE_URL = saved.base;
    }
  });

  it('summary mode returns counts, not full markdown', async () => {
    const files = { 'a.ts': 'export const a = 1;' };
    await writeModule('m', files);
    await seed(
      'm',
      files,
      computeSourceHash((await createNodeModuleSourceReader(root).readModuleSource('m'))!)
    );
    const res = await handleGatherContext({ path: root, intent: 'x', include: ['comprehension'] });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.comprehension).toHaveProperty('unitsServed', 1);
    expect(parsed.comprehension).not.toHaveProperty('served');
  });

  it('is gracefully absent when .harness/comprehension/ does not exist', async () => {
    const res = await handleGatherContext({ path: root, intent: 'x', include: ['comprehension'] });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.comprehension.unitsAvailable).toBe(0);
    expect(parsed.meta.errors).toEqual([]);
  });
});
```

2. Run: `pnpm --filter @harness-engineering/cli test -- gather-context-comprehension` — observe failure.
3. In `packages/cli/src/mcp/tools/gather-context.ts`, add the constituent promise alongside the others (after `businessKnowledgePromise`):

```ts
const comprehensionPromise = includeSet.has('comprehension')
  ? (async () => {
      const core = await import('@harness-engineering/core');
      const store = new core.ComprehensionStore({
        root: `${projectPath.replaceAll('\\', '/')}/${core.COMPREHENSION_ROOT}`,
        io: core.createNodeComprehensionIO(),
      });
      const listed = await store.list();
      if (!listed.ok) return null;
      const reader = core.createNodeModuleSourceReader(projectPath);
      const tokenBudget = input.tokenBudget ?? 4000;
      const charBudget = tokenBudget * 4;
      const served: Array<{ module: string; markdown: string }> = [];
      const stale: Array<{ module: string; recompile: true }> = [];
      let totalChars = 0;
      for (const unit of listed.value) {
        const verdict = await core.serveGate(unit, reader);
        if (!verdict.serve) {
          stale.push({ module: verdict.module, recompile: true });
          continue;
        }
        const markdown = core.renderServedUnit(verdict.unit);
        if (totalChars + markdown.length > charBudget && served.length > 0) continue;
        served.push({ module: unit.provenance.module, markdown });
        totalChars += markdown.length;
      }
      return {
        served,
        stale,
        unitsAvailable: listed.value.length,
        unitsServed: served.length,
        tokenBudget,
      };
    })()
  : Promise.resolve(null);
```

4. Add `comprehensionPromise` to the `Promise.allSettled([...])` array and its destructured result (`comprehensionResult`) at the end of the array. Then extract it:

```ts
const comprehensionRaw = extract(comprehensionResult, 'comprehension') as {
  served: Array<{ module: string; markdown: string }>;
  stale: Array<{ module: string; recompile: true }>;
  unitsAvailable: number;
  unitsServed: number;
  tokenBudget: number;
} | null;
```

5. Build the summary/detailed output (near `outputValidation`):

```ts
const outputComprehension =
  comprehensionRaw == null
    ? null
    : mode === 'summary'
      ? {
          unitsAvailable: comprehensionRaw.unitsAvailable,
          unitsServed: comprehensionRaw.unitsServed,
          staleDropped: comprehensionRaw.stale.length,
          recompile: comprehensionRaw.stale.map((s) => s.module),
        }
      : comprehensionRaw;
```

6. Add `comprehension: outputComprehension,` to the `output` object literal (after `businessKnowledge`).
7. Run: `pnpm --filter @harness-engineering/cli test -- gather-context-comprehension` — observe pass.
8. Run the full gather_context suites to catch any exact-shape assertions and confirm the default-on constituent did not regress them: `pnpm --filter @harness-engineering/cli test -- gather-context`. Fix any exact output-shape assertion by allowing the new `comprehension` field.
9. Run: `harness validate` and `harness check-deps`
10. Commit: `feat(gather-context): serve comprehension units via the hash gate (SC2, SC4)`

### Task 8: Update the local stage-prompt guidance text — TDD

**Depends on:** none | **Files:** `packages/orchestrator/src/workflow/local-stage-prompt.ts`, `packages/orchestrator/src/workflow/local-stage-prompt.test.ts` | **Owns:** `packages/orchestrator/src/workflow/local-stage-prompt.ts` | **Category:** integration

1. Add to `packages/orchestrator/src/workflow/local-stage-prompt.test.ts` (inside the `describe('LOCAL_STAGE_PROMPT_TEMPLATE', ...)` block):

```ts
it('frames comprehension units as the agent primary understanding', () => {
  expect(LOCAL_STAGE_PROMPT_TEMPLATE).toContain(
    'comprehension units are your primary understanding'
  );
});
```

2. Run: `pnpm --filter @harness-engineering/orchestrator test -- local-stage-prompt` — observe failure.
3. In `packages/orchestrator/src/workflow/local-stage-prompt.ts`, extend the intro tool-usage sentence in `LOCAL_STAGE_PROMPT_TEMPLATE`. After the existing clause that mentions pulling context with `harness__gather_context`, append:

```
When \`harness__gather_context\` returns comprehension units, comprehension units are your primary understanding — read raw source only for your edit region.
```

(Insert as guidance text within the template string; touch only the guidance sentence, keep all other bytes — including the `<<<BEGIN>>>`/`<<<END>>>` fencing — intact.) 4. Run: `pnpm --filter @harness-engineering/orchestrator test -- local-stage-prompt` — observe pass. 5. Run: `harness validate` 6. Commit: `feat(orchestrator): frame comprehension units as primary understanding`

---

## Sequencing & parallelism

- **Wave 1 (parallel):** Task 1, Task 3, Task 8 (distinct files, no shared state). Task 2 follows Task 1 (needs the `ModuleSourceReader` type) but is otherwise independent.
- **Wave 2:** Task 4 (needs Tasks 1–3). Task 5 may run any time (schema-only, distinct file).
- **Gate:** Task 6 checkpoint after Tasks 4 + 5.
- **Wave 3:** Task 7 (needs Tasks 4, 5, 6; shares `gather-context.ts` with Task 5 → strictly after it).

## Validation

- Every observable truth traces to a task: SC2 → Tasks 1 + 7; SC4 → Task 7; exports → Task 4; schema → Task 5; served format → Task 3; enumeration → Task 2; prompt → Task 8.
- Every code task is TDD (test → fail → implement → pass) and ends with `harness validate`.
- `.harness/failures.md` reviewed: no known-failure pattern matches (this is additive, IO-injected, LLM-free).
