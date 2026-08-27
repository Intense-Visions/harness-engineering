# Plan: Compiled Comprehension Substrate — Phase 1 (Core compiler + store)

**Date:** 2026-08-27 | **Spec:** `docs/changes/compiled-comprehension-substrate/proposal.md` (Implementation Order phase 1) | **Tasks:** 8 (+1 preflight) | **Time:** ~34 min | **Integration Tier:** medium

## Goal

Deliver the pure, IO/provider-injected core of the comprehension substrate — the unit model, source-hash provenance, markdown+frontmatter (de)serialization, the `ComprehensionStore`, and the `compileModule` orchestrator with its `extractStatic`/`generateSemantic` seams — fully unit-tested with **no LLM, no git, no CLI wiring**.

## Scope boundary (what this phase is NOT)

- No LLM calls, no `AnalysisProvider`, no `claude`-CLI. `generateSemantic` exists only as an injected type + a test double.
- No git / `deriveChangedSurface` / invalidation. No `harness comprehend` CLI. No `gather_context` / MCP wiring. No serve-time gate consumer (the gate _logic_ — hash recompute + compare — lands in Phase 2; this phase only ships the `computeSourceHash` primitive it will use).
- No `.gitignore` un-ignore, no config schema, no ADRs, no docs. Those are Phases 2–6.

## Success criteria this phase enables

- **SC4 (no-credential invariant):** `compileModule` with no `generateSemantic` (or one that returns `null`) produces a valid static-only unit (`semantic: absent`) with **zero** credential/LLM access.
- **SC2 (no silent staleness) foundation:** `computeSourceHash` folds directory _membership_ into the digest so an added/removed file changes the hash — the primitive Phase 2's serve-time gate compares against.
- Foundation for **all** other SCs (the store + unit model + compiler seam).

## Skills (from `SKILLS.md` — Reference tier only; no Apply-tier matches)

- `ts-testing-types` — every TDD task (store/compiler/serialize/hash unit tests).
- `ts-type-guards` — frontmatter/unit parsing guards (Task 3).
- `ts-zod-integration` — _not this phase_ (semantic `responseSchema` is Phase 3).

## Observable Truths (Acceptance Criteria)

1. `computeSourceHash(files)` returns a 64-char lowercase hex SHA-256; it is order-independent (same set in any order ⇒ same hash), changes when any member file's **content** changes, and changes when a file is **added or removed** from the set (membership folded in). (EARS — Event-driven: _When a file is added to or removed from the module directory, the system shall produce a different `sourceHash`._)
2. `serializeUnit` → `parseUnit` round-trips: `serializeUnit(parseUnit(serializeUnit(u))) === serializeUnit(u)` for a canonical unit, preserving all provenance fields and all populated body sections.
3. A `semantic: absent` unit serializes with **no** `## Summary` / `## Invariants` sections and parses back with `summary === ''` and `invariants === []`.
4. `ComprehensionStore.path(module)` yields `.harness/comprehension/<module>/_module.md` with posix (`/`) separators on every OS; `write(unit)` then `read(unit.provenance.module)` returns a unit whose `serializeUnit` output is byte-equal to the written one.
5. `ComprehensionStore.list()` returns every unit under the root regardless of tree depth, sorted by path.
6. `compileModule(module, files, { extractStatic })` (no `generateSemantic`) returns `semantic: 'absent'`, `model: null`, populated `interfaceContract`/`dependencySlice` from the injected extractor, a computed `sourceHash`, and sorted `members` — with the extractor being the only injected call and no LLM/credential touched. (EARS — Unwanted: _If no semantic generator resolves, then the system shall not call an LLM and shall emit a static-only unit._)
7. `compileModule(..., { extractStatic, generateSemantic })` where the double returns a result yields `semantic: 'present'` with the double's `summary`, `invariants`, and resolved `model`; a `generateSemantic` returning `null` yields the same static-only unit as (6).
8. `createNodeComprehensionIO()` round-trips a unit through a real temp directory: `writeFile` creates missing parent dirs, and `listUnitPaths` finds nested `_module.md` files and returns `/`-normalized paths.
9. After `pnpm run generate:barrels`, the new `comprehension` exports (`ComprehensionStore`, `compileModule`, `computeSourceHash`, unit types) are importable from `@harness-engineering/core`, and `node scripts/generate-core-barrel.mjs --check` passes.
10. `pnpm --filter @harness-engineering/core exec tsc --noEmit` and the full `comprehension` test suite pass; `harness validate` shows no NEW regressions vs. the pre-existing baseline.

## Uncertainties

- [ASSUMPTION] Reusing the exported `quoteYamlScalar` from `packages/core/src/roadmap/store/yaml-scalar.ts` is acceptable cross-module coupling within core (DRY over duplication). If a reviewer prefers isolation, copy the 4-line helper into `comprehension/` instead — Task 3 is the only affected task.
- [ASSUMPTION] A **new** `ComprehensionIO` interface (not the roadmap `ShardIO`) is the right seam, because the comprehension store is a _tree_ (recursive unit discovery) whereas `ShardIO.listDir` is single-level. `ComprehensionIO.listUnitPaths(root)` pushes the recursion into the adapter, keeping the store pure. (Spec says "injected `ShardIO` (node-io.ts pattern)" — read as _the pattern_, not the literal type.)
- [ASSUMPTION] `members` are stored as sorted **basenames** (matches the spec's frontmatter example `members: [parse.ts, serialize.ts, ...]`); `computeSourceHash` uses the full `SourceFile.path` for membership so nested paths still disambiguate.
- [DEFERRABLE] Exact rendered shape of `interfaceContract` / `dependencySlice` markdown — this phase treats them as opaque strings supplied by the injected extractor; the concrete AST renderer is Phase 3+.
- [DEFERRABLE] Byte-exactness of the serialized frontmatter beyond round-trip idempotence (e.g. key ordering vs. any future tool) — the hand-emitted fixed-order frontmatter mirrors `serializeShard`'s determinism contract.

## File Map

- CREATE `packages/core/src/comprehension/types.ts`
- CREATE `packages/core/src/comprehension/source-hash.ts`
- CREATE `packages/core/tests/comprehension/source-hash.test.ts`
- CREATE `packages/core/src/comprehension/serialize.ts`
- CREATE `packages/core/tests/comprehension/serialize.test.ts`
- CREATE `packages/core/src/comprehension/store.ts`
- CREATE `packages/core/tests/comprehension/store.test.ts`
- CREATE `packages/core/src/comprehension/node-io.ts`
- CREATE `packages/core/tests/comprehension/node-io.test.ts`
- CREATE `packages/core/src/comprehension/compile.ts`
- CREATE `packages/core/tests/comprehension/compile.test.ts`
- CREATE `packages/core/src/comprehension/index.ts`
- MODIFY `scripts/generate-core-barrel.mjs` (add `comprehension` DIR_COMMENTS entry)
- MODIFY `packages/core/src/index.ts` (regenerated barrel — auto-written, do not hand-edit)

## Skeleton

1. Foundation types + hash primitive (~2 tasks, ~8 min) — `types.ts`, `source-hash.ts`+test
2. Serialization + store + node adapter (~3 tasks, ~16 min) — `serialize.ts`, `store.ts`, `node-io.ts` (+tests)
3. Compiler orchestrator (~1 task, ~5 min) — `compile.ts`+test (SC4 static-only path)
4. Module + core barrel wiring (~2 tasks, ~5 min) — `index.ts`, DIR_COMMENTS + regen

**Estimated total:** 8 tasks (+1 preflight), ~34 minutes.
_Skeleton approved: proceeding autonomously per invocation (standard rigor, 8 tasks; the invoking agent requested a complete written plan rather than an interactive skeleton gate)._

## Parallelization notes

- Task 2 (`source-hash`) and Task 3 (`serialize`) are independent once Task 1 lands (both depend only on `types.ts`, touch disjoint files) → wave-parallel candidates.
- All other comprehension tasks own overlapping paths under `src/comprehension/**` and are genuinely sequential (type + module-graph dependencies), so they serialize by design.

---

## Tasks

### Task 0 (preflight): Install + build worktree deps

**Depends on:** none | **Files:** _(none — environment only)_ | **Category:** integration

This is a fresh worktree: `node_modules` is absent and `@harness-engineering/types` `dist` is missing, so `tsc`/`vitest` cannot resolve workspace types until built (repo memory: fresh-worktree-build-and-validate). No commit.

1. From the worktree root, run: `pnpm install`
2. Build workspace deps so `@harness-engineering/types` resolves: `pnpm --filter @harness-engineering/types build` (or `pnpm -w run build` / `turbo build` for the full graph).
3. Sanity-check: `pnpm --filter @harness-engineering/core exec tsc --noEmit` runs (pre-existing state; may report unrelated baseline issues — that is fine).

> Node version: use the repo's `.nvmrc` Node (22), not a shell default of 24 — `better-sqlite3` ABI mismatches otherwise (repo memory). This phase touches no native modules, but the build graph does.

---

### Task 1: Define the comprehension unit model + injection seams

**Depends on:** Task 0 | **Files:** `packages/core/src/comprehension/types.ts` | **Owns:** `packages/core/src/comprehension/types.ts`
**Skills:** `ts-type-guards` (reference)

Pure types only — no runtime behavior, so verification is `tsc --noEmit` (mirrors the roadmap store's types-first task).

1. Create `packages/core/src/comprehension/types.ts`:

```ts
/**
 * Comprehension unit model + compiler injection seams.
 *
 * Pure types only — no IO, no LLM. The concrete `extractStatic` (graph AST) and
 * `generateSemantic` (AnalysisProvider) adapters are wired by the CLI/MCP layer
 * in LATER phases; this module defines the seams (D5) and a stub-friendly
 * contract so the compiler stays IO/provider-injected and unit-testable.
 */

/** Current unit schema version. */
export const SCHEMA_VERSION = 1 as const;

/** Compiler component versions, stamped into provenance. */
export const COMPILER_VERSION = { static: '1.0.0', semantic: '1.0.0' } as const;

/** On-disk provenance frontmatter for a comprehension unit. */
export interface ComprehensionProvenance {
  /** Schema version of the unit format. */
  schemaVersion: 1;
  /** Module path (source directory), posix-separated, repo-relative. */
  module: string;
  /** Full SHA-256 over directory membership + sorted member-file contents. */
  sourceHash: string;
  /** ISO-8601 timestamp of compilation. */
  compiledAt: string;
  /** Compiler component versions. */
  compiler: { static: string; semantic: string };
  /** Resolved model id for the semantic half, or null when static-only. */
  model: string | null;
  /** Whether the semantic half is present. `absent` ⇒ static-only unit. */
  semantic: 'present' | 'absent';
  /** Sorted member-file basenames enumerated at compile time. */
  members: string[];
}

/** A source file fed to the compiler: repo/module-relative path + contents. */
export interface SourceFile {
  /** Module-relative or repo-relative path, posix-separated. */
  path: string;
  /** Full file contents. */
  content: string;
}

/** Static-extraction output: the exact, always-fresh half of a unit. */
export interface StaticExtraction {
  /** Exported symbols + signatures (rendered markdown for the fenced body). */
  interfaceContract: string;
  /** Imports out / importers in (rendered markdown for the fenced body). */
  dependencySlice: string;
}

/** Bounded input to the semantic generator (static-feeds-semantic, D1). */
export interface SemanticInput {
  module: string;
  interfaceContract: string;
  dependencySlice: string;
  sourceFiles: SourceFile[];
}

/** Semantic-generation output: the advisory, hard-cached half of a unit. */
export interface SemanticGeneration {
  /** Prose summary (token-capped). */
  summary: string;
  /** Invariant list. */
  invariants: string[];
  /** Model id that produced this, or null if the adapter reported none. */
  model?: string | null;
}

/** Injected static extractor. Always called; cheap; language-aware adapter. */
export type ExtractStatic = (
  sourceFiles: SourceFile[]
) => StaticExtraction | Promise<StaticExtraction>;

/**
 * Injected semantic generator. Returns `null` when no provider resolves (the
 * no-credential path, SC4) — the compiler then emits a static-only unit. Must
 * not throw for a merely-missing provider.
 */
export type GenerateSemantic = (
  input: SemanticInput
) => SemanticGeneration | null | Promise<SemanticGeneration | null>;

/** A fully-assembled comprehension unit: provenance + body sections. */
export interface ComprehensionUnit {
  provenance: ComprehensionProvenance;
  /** Prose summary; empty string when `semantic: absent`. */
  summary: string;
  /** Invariant list; empty when `semantic: absent`. */
  invariants: string[];
  /** Exported symbols + signatures (static). */
  interfaceContract: string;
  /** Imports out / importers in (static). */
  dependencySlice: string;
}
```

2. Run: `pnpm --filter @harness-engineering/core exec tsc --noEmit`
3. Commit: `feat(comprehension): define unit model and compiler injection seams`

---

### Task 2: Implement `computeSourceHash` (membership-folded SHA-256)

**Depends on:** Task 1 | **Files:** `packages/core/src/comprehension/source-hash.ts`, `packages/core/tests/comprehension/source-hash.test.ts` | **Owns:** `packages/core/src/comprehension/source-hash.ts`
**Skills:** `ts-testing-types` (reference)

TDD. Delivers Observable Truth 1 (SC2 foundation).

1. Create `packages/core/tests/comprehension/source-hash.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeSourceHash } from '../../src/comprehension/source-hash';
import type { SourceFile } from '../../src/comprehension/types';

const files: SourceFile[] = [
  { path: 'a.ts', content: 'export const a = 1;' },
  { path: 'b.ts', content: 'export const b = 2;' },
];

describe('computeSourceHash', () => {
  it('returns a 64-char lowercase hex sha256', () => {
    const h = computeSourceHash(files);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is order-independent (same set, any order ⇒ same hash)', () => {
    expect(computeSourceHash(files)).toBe(computeSourceHash([...files].reverse()));
  });

  it('changes when a member file content changes', () => {
    const changed = [{ ...files[0], content: 'export const a = 999;' }, files[1]];
    expect(computeSourceHash(changed)).not.toBe(computeSourceHash(files));
  });

  it('changes when a file is ADDED to the membership set', () => {
    const added = [...files, { path: 'c.ts', content: 'export const c = 3;' }];
    expect(computeSourceHash(added)).not.toBe(computeSourceHash(files));
  });

  it('changes when a file is REMOVED from the membership set', () => {
    expect(computeSourceHash([files[0]])).not.toBe(computeSourceHash(files));
  });

  it('distinguishes a content moved between files (length-prefixed boundaries)', () => {
    const a = [
      { path: 'x.ts', content: 'ab' },
      { path: 'y.ts', content: 'c' },
    ];
    const b = [
      { path: 'x.ts', content: 'a' },
      { path: 'y.ts', content: 'bc' },
    ];
    expect(computeSourceHash(a)).not.toBe(computeSourceHash(b));
  });
});
```

2. Run — observe failure: `pnpm --filter @harness-engineering/core exec vitest run tests/comprehension/source-hash.test.ts`
3. Create `packages/core/src/comprehension/source-hash.ts`:

```ts
import * as crypto from 'node:crypto';
import type { SourceFile } from './types';

/**
 * Full SHA-256 over the module's current directory membership + sorted
 * member-file contents. The sole correctness authority (D7): a full-length
 * digest, NOT the 32-bit truncated `ingestUtils.hash` (explicitly "not for
 * security" and too weak to be the correctness authority here).
 *
 * Membership is folded in by hashing each file's PATH alongside its CONTENT, so
 * adding or removing a file in the directory changes the hash — closing the
 * newly-added-file staleness gap (SC2). Files are sorted by path for
 * determinism regardless of enumeration order. Path and content are
 * length-prefixed so no boundary is ambiguous (a rename + content shuffle
 * cannot collide).
 */
export function computeSourceHash(sourceFiles: SourceFile[]): string {
  const sorted = [...sourceFiles].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const h = crypto.createHash('sha256');
  for (const f of sorted) {
    h.update(String(f.path.length));
    h.update('\0');
    h.update(f.path);
    h.update('\0');
    h.update(String(f.content.length));
    h.update('\0');
    h.update(f.content);
    h.update('\0');
  }
  return h.digest('hex');
}
```

4. Run — observe pass: `pnpm --filter @harness-engineering/core exec vitest run tests/comprehension/source-hash.test.ts`
5. Run: `harness validate`
6. Commit: `feat(comprehension): membership-folded sha256 source hash`

---

### Task 3: Implement unit (de)serialization (markdown + YAML frontmatter)

**Depends on:** Task 1 | **Files:** `packages/core/src/comprehension/serialize.ts`, `packages/core/tests/comprehension/serialize.test.ts` | **Owns:** `packages/core/src/comprehension/serialize.ts`
**Skills:** `ts-type-guards`, `ts-testing-types` (reference)

TDD. Delivers Observable Truths 2 + 3. Reuses `gray-matter` (already a core dep) for parse and the exported `quoteYamlScalar` for byte-stable emit; hand-emits frontmatter in fixed key order (mirrors `serializeShard` — `matter.stringify` is NOT byte-stable).

1. Create `packages/core/tests/comprehension/serialize.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseUnit, serializeUnit } from '../../src/comprehension/serialize';
import type { ComprehensionUnit } from '../../src/comprehension/types';
import { SCHEMA_VERSION, COMPILER_VERSION } from '../../src/comprehension/types';

function present(): ComprehensionUnit {
  return {
    provenance: {
      schemaVersion: SCHEMA_VERSION,
      module: 'packages/core/src/roadmap',
      sourceHash: 'a'.repeat(64),
      compiledAt: '2026-08-27T00:00:00.000Z',
      compiler: { static: COMPILER_VERSION.static, semantic: COMPILER_VERSION.semantic },
      model: 'claude-haiku',
      semantic: 'present',
      members: ['parse.ts', 'serialize.ts'],
    },
    summary: 'Parses and serializes roadmaps.',
    invariants: ['round-trips byte-stably', 'never mutates input'],
    interfaceContract: 'export function parseRoadmap(md: string): Result<Roadmap>',
    dependencySlice: 'imports: gray-matter\nimporters: cli/roadmap',
  };
}

function absent(): ComprehensionUnit {
  const u = present();
  return {
    ...u,
    provenance: { ...u.provenance, semantic: 'absent', model: null },
    summary: '',
    invariants: [],
  };
}

describe('comprehension serialize/parse', () => {
  it('round-trips a present (full) unit idempotently', () => {
    const md = serializeUnit(present());
    const parsed = parseUnit(md);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(serializeUnit(parsed.value)).toBe(md);
  });

  it('preserves all provenance fields through a round-trip', () => {
    const parsed = parseUnit(serializeUnit(present()));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.provenance).toEqual(present().provenance);
  });

  it('absent unit omits Summary/Invariants sections and parses empty', () => {
    const md = serializeUnit(absent());
    expect(md).not.toContain('## Summary');
    expect(md).not.toContain('## Invariants');
    expect(md).toContain('## Interface Contract');
    const parsed = parseUnit(md);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.summary).toBe('');
      expect(parsed.value.invariants).toEqual([]);
    }
  });

  it('rejects an invalid semantic value', () => {
    const bad = serializeUnit(present()).replace('semantic: present', 'semantic: maybe');
    expect(parseUnit(bad).ok).toBe(false);
  });

  it('rejects missing sourceHash', () => {
    const bad = serializeUnit(present()).replace(/sourceHash: "[a]+"\n/, '');
    expect(parseUnit(bad).ok).toBe(false);
  });
});
```

2. Run — observe failure: `pnpm --filter @harness-engineering/core exec vitest run tests/comprehension/serialize.test.ts`
3. Create `packages/core/src/comprehension/serialize.ts`:

````ts
import matter from 'gray-matter';
import type { Result } from '@harness-engineering/types';
import { Ok, Err } from '@harness-engineering/types';
import { quoteYamlScalar } from '../roadmap/store/yaml-scalar';
import type { ComprehensionUnit, ComprehensionProvenance } from './types';
import { SCHEMA_VERSION } from './types';

const H_SUMMARY = '## Summary';
const H_INVARIANTS = '## Invariants';
const H_INTERFACE = '## Interface Contract';
const H_DEPS = '## Dependency Slice';

/**
 * Serialize a `ComprehensionUnit` to markdown + hand-emitted YAML frontmatter.
 * Frontmatter is emitted in fixed key order for byte-determinism (mirrors
 * `serializeShard`; `matter.stringify` key ordering/quoting is not stable).
 * Free-form scalars are double-quoted via `quoteYamlScalar` so colons/booleans
 * round-trip. `semantic: absent` units omit the LLM sections entirely — the
 * static sections are always emitted (fenced), even when empty.
 */
export function serializeUnit(unit: ComprehensionUnit): string {
  const p = unit.provenance;
  const fm = [
    '---',
    `schemaVersion: ${p.schemaVersion}`,
    `module: ${quoteYamlScalar(p.module)}`,
    `sourceHash: ${quoteYamlScalar(p.sourceHash)}`,
    `compiledAt: ${quoteYamlScalar(p.compiledAt)}`,
    `compiler: { static: ${quoteYamlScalar(p.compiler.static)}, semantic: ${quoteYamlScalar(
      p.compiler.semantic
    )} }`,
    `model: ${p.model === null ? 'null' : quoteYamlScalar(p.model)}`,
    `semantic: ${p.semantic}`,
    `members: [${p.members.map(quoteYamlScalar).join(', ')}]`,
    '---',
    '',
  ];
  const body: string[] = [];
  if (p.semantic === 'present') {
    body.push(H_SUMMARY, '', unit.summary.trim(), '');
    body.push(H_INVARIANTS, '');
    for (const inv of unit.invariants) body.push(`- ${inv}`);
    body.push('');
  }
  body.push(H_INTERFACE, '', '```ts', unit.interfaceContract.trim(), '```', '');
  body.push(H_DEPS, '', '```', unit.dependencySlice.trim(), '```', '');
  return [...fm, ...body].join('\n').replace(/\n+$/, '\n');
}

/** Validate + coerce provenance from parsed frontmatter. */
function parseProvenance(data: Record<string, unknown>): Result<ComprehensionProvenance> {
  const module = data.module;
  if (typeof module !== 'string' || module.length === 0) {
    return Err(new Error('Comprehension frontmatter missing required field: module'));
  }
  const sourceHash = data.sourceHash;
  if (typeof sourceHash !== 'string' || sourceHash.length === 0) {
    return Err(new Error(`Comprehension "${module}" missing required field: sourceHash`));
  }
  const semantic = data.semantic;
  if (semantic !== 'present' && semantic !== 'absent') {
    return Err(new Error(`Comprehension "${module}" has invalid semantic: "${String(semantic)}"`));
  }
  const compilerRaw = (data.compiler ?? {}) as Record<string, unknown>;
  const compiler = {
    static: typeof compilerRaw.static === 'string' ? compilerRaw.static : '',
    semantic: typeof compilerRaw.semantic === 'string' ? compilerRaw.semantic : '',
  };
  const model = data.model === null || data.model === undefined ? null : String(data.model);
  const members = Array.isArray(data.members) ? data.members.map((m) => String(m)) : [];
  const compiledAt = typeof data.compiledAt === 'string' ? data.compiledAt : '';
  return Ok({
    schemaVersion: SCHEMA_VERSION,
    module,
    sourceHash,
    compiledAt,
    compiler,
    model,
    semantic,
    members,
  });
}

/** Extract the trimmed body text under a `## <heading>` up to the next `## `. */
function sectionText(content: string, heading: string): string {
  const lines = content.split('\n');
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (start === -1) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
}

/** Extract `- ` bullet items under a heading. */
function sectionList(content: string, heading: string): string[] {
  return sectionText(content, heading)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim());
}

/** Extract the inner text of a single fenced block under a heading. */
function sectionFenced(content: string, heading: string): string {
  const body = sectionText(content, heading);
  const m = body.match(/^```[^\n]*\n([\s\S]*?)\n?```$/);
  return (m ? m[1] : body).trim();
}

/**
 * Parse a comprehension unit markdown string into a `ComprehensionUnit`.
 * Frontmatter is parsed via gray-matter and validated field-by-field (authority
 * in TS — the unit shape is never trusted raw). `semantic: absent` units yield
 * empty summary/invariants regardless of body content.
 */
export function parseUnit(md: string): Result<ComprehensionUnit> {
  let data: Record<string, unknown>;
  let content: string;
  try {
    const parsed = matter(md);
    data = parsed.data as Record<string, unknown>;
    content = parsed.content;
  } catch (err) {
    return Err(new Error(`Comprehension frontmatter is not valid YAML: ${(err as Error).message}`));
  }
  const prov = parseProvenance(data);
  if (!prov.ok) return prov;
  const isPresent = prov.value.semantic === 'present';
  return Ok({
    provenance: prov.value,
    summary: isPresent ? sectionText(content, 'Summary') : '',
    invariants: isPresent ? sectionList(content, 'Invariants') : [],
    interfaceContract: sectionFenced(content, 'Interface Contract'),
    dependencySlice: sectionFenced(content, 'Dependency Slice'),
  });
}
````

4. Run — observe pass: `pnpm --filter @harness-engineering/core exec vitest run tests/comprehension/serialize.test.ts`
5. Run: `harness validate`
6. Commit: `feat(comprehension): markdown + frontmatter unit (de)serialization`

---

### Task 4: Implement `ComprehensionStore` + `ComprehensionIO` seam

**Depends on:** Task 1, Task 3 | **Files:** `packages/core/src/comprehension/store.ts`, `packages/core/tests/comprehension/store.test.ts` | **Owns:** `packages/core/src/comprehension/store.ts`
**Skills:** `ts-testing-types` (reference)

TDD with an in-memory `ComprehensionIO` double (mirrors the roadmap `makeShardIO` pattern). Delivers Observable Truths 4 + 5.

1. Create `packages/core/tests/comprehension/store.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ComprehensionStore, COMPREHENSION_ROOT, UNIT_FILE } from '../../src/comprehension/store';
import type { ComprehensionIO } from '../../src/comprehension/store';
import { serializeUnit } from '../../src/comprehension/serialize';
import type { ComprehensionUnit } from '../../src/comprehension/types';
import { SCHEMA_VERSION, COMPILER_VERSION } from '../../src/comprehension/types';

function unit(module: string): ComprehensionUnit {
  return {
    provenance: {
      schemaVersion: SCHEMA_VERSION,
      module,
      sourceHash: 'b'.repeat(64),
      compiledAt: '2026-08-27T00:00:00.000Z',
      compiler: { static: COMPILER_VERSION.static, semantic: COMPILER_VERSION.semantic },
      model: null,
      semantic: 'absent',
      members: ['x.ts'],
    },
    summary: '',
    invariants: [],
    interfaceContract: 'export const x: number',
    dependencySlice: 'imports: none',
  };
}

function makeIO() {
  const files = new Map<string, string>();
  const io: ComprehensionIO = {
    readFile: async (p) => {
      const v = files.get(p);
      if (v === undefined) throw new Error(`ENOENT: ${p}`);
      return v;
    },
    writeFile: async (p, d) => {
      files.set(p, d);
    },
    listUnitPaths: async (root) =>
      [...files.keys()].filter((p) => p.startsWith(`${root}/`) && p.endsWith(`/${UNIT_FILE}`)),
  };
  return { io, files };
}

describe('ComprehensionStore', () => {
  it('path() is posix, rooted, and _module.md-terminated', () => {
    const store = new ComprehensionStore({ io: makeIO().io });
    expect(store.path('packages/core/src/roadmap')).toBe(
      `${COMPREHENSION_ROOT}/packages/core/src/roadmap/${UNIT_FILE}`
    );
  });

  it('path() normalizes backslashes to posix', () => {
    const store = new ComprehensionStore({ io: makeIO().io });
    expect(store.path('packages\\core\\src')).toBe(
      `${COMPREHENSION_ROOT}/packages/core/src/${UNIT_FILE}`
    );
  });

  it('write() then read() round-trips byte-stably', async () => {
    const { io } = makeIO();
    const store = new ComprehensionStore({ io });
    const u = unit('a/b');
    expect((await store.write(u)).ok).toBe(true);
    const r = await store.read('a/b');
    expect(r.ok).toBe(true);
    if (r.ok) expect(serializeUnit(r.value)).toBe(serializeUnit(u));
  });

  it('read() of a missing module returns Err', async () => {
    const store = new ComprehensionStore({ io: makeIO().io });
    expect((await store.read('nope')).ok).toBe(false);
  });

  it('list() returns every unit at any tree depth, sorted', async () => {
    const { io } = makeIO();
    const store = new ComprehensionStore({ io });
    await store.write(unit('z/deep/nested'));
    await store.write(unit('a'));
    const r = await store.list();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.map((u) => u.provenance.module)).toEqual(['a', 'z/deep/nested']);
  });
});
```

2. Run — observe failure: `pnpm --filter @harness-engineering/core exec vitest run tests/comprehension/store.test.ts`
3. Create `packages/core/src/comprehension/store.ts`:

```ts
import type { Result } from '@harness-engineering/types';
import { Ok, Err } from '@harness-engineering/types';
import type { ComprehensionUnit } from './types';
import { parseUnit, serializeUnit } from './serialize';

/** Filename of a per-module comprehension unit. */
export const UNIT_FILE = '_module.md';

/** Default committed root for the comprehension shard tree. */
export const COMPREHENSION_ROOT = '.harness/comprehension';

/**
 * Injected file IO for the comprehension shard tree (node-io.ts pattern).
 * Unlike the roadmap `ShardIO` (single-level `listDir`), comprehension is a
 * TREE, so unit discovery is a dedicated recursive `listUnitPaths(root)` — the
 * recursion lives in the adapter, keeping the store pure.
 */
export interface ComprehensionIO {
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
  /** `/`-normalized paths to every `_module.md` under `root` (recursive). */
  listUnitPaths(root: string): Promise<string[]>;
}

function joinPosix(...parts: string[]): string {
  return parts.join('/').replaceAll('\\', '/').replace(/\/+/g, '/');
}

/**
 * Tree-mirrored comprehension store: one `_module.md` per module directory under
 * `root`. Mirrors `ShardStore`'s IO-injected discipline (D5) — all fs access is
 * via the injected `ComprehensionIO`; the store itself is pure and testable.
 */
export class ComprehensionStore {
  private readonly root: string;
  private readonly io: ComprehensionIO;

  constructor(options: { root?: string; io: ComprehensionIO }) {
    this.root = (options.root ?? COMPREHENSION_ROOT).replaceAll('\\', '/');
    this.io = options.io;
  }

  /** Tree-mirrored on-disk path for a module (posix, Windows-safe). */
  path(module: string): string {
    return joinPosix(this.root, module.replaceAll('\\', '/'), UNIT_FILE);
  }

  async read(module: string): Promise<Result<ComprehensionUnit>> {
    let content: string;
    try {
      content = await this.io.readFile(this.path(module));
    } catch (err) {
      return Err(
        new Error(`Comprehension unit not found for "${module}": ${(err as Error).message}`)
      );
    }
    return parseUnit(content);
  }

  async write(unit: ComprehensionUnit): Promise<Result<void>> {
    try {
      await this.io.writeFile(this.path(unit.provenance.module), serializeUnit(unit));
    } catch (err) {
      return Err(
        new Error(
          `Failed to write comprehension unit "${unit.provenance.module}": ${(err as Error).message}`
        )
      );
    }
    return Ok(undefined);
  }

  async list(): Promise<Result<ComprehensionUnit[]>> {
    let paths: string[];
    try {
      paths = await this.io.listUnitPaths(this.root);
    } catch (err) {
      return Err(
        new Error(
          `Failed to list comprehension units under ${this.root}: ${(err as Error).message}`
        )
      );
    }
    const units: ComprehensionUnit[] = [];
    for (const p of [...paths].sort()) {
      let content: string;
      try {
        content = await this.io.readFile(p);
      } catch (err) {
        return Err(new Error(`Failed to read comprehension unit ${p}: ${(err as Error).message}`));
      }
      const parsed = parseUnit(content);
      if (!parsed.ok) return parsed;
      units.push(parsed.value);
    }
    return Ok(units);
  }
}
```

4. Run — observe pass: `pnpm --filter @harness-engineering/core exec vitest run tests/comprehension/store.test.ts`
5. Run: `harness validate`
6. Commit: `feat(comprehension): tree-mirrored ComprehensionStore over injected IO`

---

### Task 5: Implement the node-fs `ComprehensionIO` adapter

**Depends on:** Task 4 | **Files:** `packages/core/src/comprehension/node-io.ts`, `packages/core/tests/comprehension/node-io.test.ts` | **Owns:** `packages/core/src/comprehension/node-io.ts`
**Skills:** `ts-testing-types` (reference)

TDD against a real temp directory — the only fs-touching file (mirrors `createNodeRoadmapIO`). Delivers Observable Truth 8.

1. Create `packages/core/tests/comprehension/node-io.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { createNodeComprehensionIO } from '../../src/comprehension/node-io';
import { ComprehensionStore } from '../../src/comprehension/store';
import type { ComprehensionUnit } from '../../src/comprehension/types';
import { SCHEMA_VERSION, COMPILER_VERSION } from '../../src/comprehension/types';

let root = '';
afterEach(async () => {
  if (root) await fsp.rm(root, { recursive: true, force: true });
});

function unit(module: string): ComprehensionUnit {
  return {
    provenance: {
      schemaVersion: SCHEMA_VERSION,
      module,
      sourceHash: 'c'.repeat(64),
      compiledAt: '2026-08-27T00:00:00.000Z',
      compiler: { static: COMPILER_VERSION.static, semantic: COMPILER_VERSION.semantic },
      model: null,
      semantic: 'absent',
      members: ['m.ts'],
    },
    summary: '',
    invariants: [],
    interfaceContract: 'export const m: 1',
    dependencySlice: 'imports: none',
  };
}

describe('createNodeComprehensionIO', () => {
  it('writeFile creates parent dirs; read round-trips through a real dir', async () => {
    root = await fsp.mkdtemp(path.join(os.tmpdir(), 'comprehension-'));
    const store = new ComprehensionStore({ root, io: createNodeComprehensionIO() });
    expect((await store.write(unit('deep/nested/mod'))).ok).toBe(true);
    const r = await store.read('deep/nested/mod');
    expect(r.ok).toBe(true);
  });

  it('listUnitPaths finds nested units and returns posix paths', async () => {
    root = await fsp.mkdtemp(path.join(os.tmpdir(), 'comprehension-'));
    const store = new ComprehensionStore({ root, io: createNodeComprehensionIO() });
    await store.write(unit('a'));
    await store.write(unit('x/y/z'));
    const r = await store.list();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.map((u) => u.provenance.module).sort()).toEqual(['a', 'x/y/z']);
  });

  it('listUnitPaths returns empty for an absent root (no throw)', async () => {
    const io = createNodeComprehensionIO();
    expect(await io.listUnitPaths(path.join(os.tmpdir(), 'does-not-exist-xyz'))).toEqual([]);
  });
});
```

2. Run — observe failure: `pnpm --filter @harness-engineering/core exec vitest run tests/comprehension/node-io.test.ts`
3. Create `packages/core/src/comprehension/node-io.ts`:

```ts
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import type { ComprehensionIO } from './store';
import { UNIT_FILE } from './store';

/**
 * Node-fs `ComprehensionIO` — the only node:fs binding for the comprehension
 * store (mirrors `createNodeRoadmapIO`). `writeFile` creates missing parent
 * dirs so first-time tree-mirrored writes succeed; `listUnitPaths` walks the
 * tree, returns `/`-normalized paths, and treats an absent root as "no units"
 * (no throw) so a fresh repo lists cleanly.
 */
export function createNodeComprehensionIO(): ComprehensionIO {
  return {
    readFile: (p) => fsp.readFile(p, 'utf-8'),
    writeFile: async (p, data) => {
      await fsp.mkdir(path.dirname(p), { recursive: true });
      await fsp.writeFile(p, data, 'utf-8');
    },
    listUnitPaths: async (root) => {
      const out: string[] = [];
      async function walk(dir: string): Promise<void> {
        let entries: import('node:fs').Dirent[];
        try {
          entries = await fsp.readdir(dir, { withFileTypes: true });
        } catch {
          return; // absent dir ⇒ no units
        }
        for (const e of entries) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) await walk(full);
          else if (e.name === UNIT_FILE) out.push(full.replaceAll('\\', '/'));
        }
      }
      await walk(root);
      return out;
    },
  };
}
```

4. Run — observe pass: `pnpm --filter @harness-engineering/core exec vitest run tests/comprehension/node-io.test.ts`
5. Run: `harness validate`
6. Commit: `feat(comprehension): node-fs ComprehensionIO adapter`

---

### Task 6: Implement `compileModule` orchestrator (static-only + full)

**Depends on:** Task 1, Task 2, Task 3 | **Files:** `packages/core/src/comprehension/compile.ts`, `packages/core/tests/comprehension/compile.test.ts` | **Owns:** `packages/core/src/comprehension/compile.ts`
**Skills:** `ts-testing-types` (reference)

TDD with stub `extractStatic`/`generateSemantic` doubles. Delivers Observable Truths 6 + 7 (**SC4 no-credential static-only path**).

1. Create `packages/core/tests/comprehension/compile.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { compileModule } from '../../src/comprehension/compile';
import { computeSourceHash } from '../../src/comprehension/source-hash';
import type { SourceFile, ExtractStatic, GenerateSemantic } from '../../src/comprehension/types';
import { COMPILER_VERSION } from '../../src/comprehension/types';

const files: SourceFile[] = [
  { path: 'src/b.ts', content: 'export const b = 2;' },
  { path: 'src/a.ts', content: 'export const a = 1;' },
];

const extractStatic: ExtractStatic = () => ({
  interfaceContract: 'export const a: number',
  dependencySlice: 'imports: none',
});

const now = () => new Date('2026-08-27T12:00:00.000Z');

describe('compileModule', () => {
  it('static-only (no generateSemantic): semantic absent, no LLM (SC4)', async () => {
    const unit = await compileModule('src', files, { extractStatic, now });
    expect(unit.provenance.semantic).toBe('absent');
    expect(unit.provenance.model).toBeNull();
    expect(unit.summary).toBe('');
    expect(unit.invariants).toEqual([]);
    expect(unit.interfaceContract).toBe('export const a: number');
    expect(unit.dependencySlice).toBe('imports: none');
    expect(unit.provenance.sourceHash).toBe(computeSourceHash(files));
    expect(unit.provenance.members).toEqual(['a.ts', 'b.ts']); // sorted basenames
    expect(unit.provenance.compiler).toEqual(COMPILER_VERSION);
    expect(unit.provenance.compiledAt).toBe('2026-08-27T12:00:00.000Z');
  });

  it('always calls extractStatic; never calls a provider when none given', async () => {
    const spy = vi.fn(extractStatic);
    await compileModule('src', files, { extractStatic: spy, now });
    expect(spy).toHaveBeenCalledOnce();
  });

  it('full: generateSemantic result ⇒ semantic present + model', async () => {
    const gen: GenerateSemantic = () => ({
      summary: 'does things',
      invariants: ['inv1'],
      model: 'claude-haiku',
    });
    const unit = await compileModule('src', files, { extractStatic, generateSemantic: gen, now });
    expect(unit.provenance.semantic).toBe('present');
    expect(unit.provenance.model).toBe('claude-haiku');
    expect(unit.summary).toBe('does things');
    expect(unit.invariants).toEqual(['inv1']);
  });

  it('generateSemantic returning null ⇒ static-only (no-credential path)', async () => {
    const gen: GenerateSemantic = () => null;
    const unit = await compileModule('src', files, { extractStatic, generateSemantic: gen, now });
    expect(unit.provenance.semantic).toBe('absent');
    expect(unit.provenance.model).toBeNull();
  });

  it('feeds the static half into the semantic input (static-feeds-semantic)', async () => {
    const gen = vi.fn<GenerateSemantic>(() => null);
    await compileModule('src', files, { extractStatic, generateSemantic: gen, now });
    expect(gen).toHaveBeenCalledWith(
      expect.objectContaining({
        module: 'src',
        interfaceContract: 'export const a: number',
        dependencySlice: 'imports: none',
      })
    );
  });
});
```

2. Run — observe failure: `pnpm --filter @harness-engineering/core exec vitest run tests/comprehension/compile.test.ts`
3. Create `packages/core/src/comprehension/compile.ts`:

```ts
import type { ComprehensionUnit, ExtractStatic, GenerateSemantic, SourceFile } from './types';
import { COMPILER_VERSION, SCHEMA_VERSION } from './types';
import { computeSourceHash } from './source-hash';

export interface CompileOptions {
  /** Always called — the cheap, exact static half. */
  extractStatic: ExtractStatic;
  /** Optional — the advisory semantic half. Absent/null ⇒ static-only (SC4). */
  generateSemantic?: GenerateSemantic;
  /** Injected clock for deterministic `compiledAt` (defaults to real now). */
  now?: () => Date;
}

/** Sorted, de-duplicated member basenames (matches the frontmatter contract). */
function memberBasenames(sourceFiles: SourceFile[]): string[] {
  const bases = sourceFiles.map((f) => {
    const norm = f.path.replaceAll('\\', '/');
    return norm.slice(norm.lastIndexOf('/') + 1);
  });
  return [...new Set(bases)].sort();
}

/**
 * Compile one module's comprehension unit. PURE orchestration (D5): every
 * IO/LLM effect enters via the injected `extractStatic` (always called) and the
 * optional `generateSemantic`. With no `generateSemantic` — or when it returns
 * `null` (the no-credential path, SC4) — the unit is emitted static-only
 * (`semantic: absent`). This function never calls an LLM, git, or fs itself and
 * requires no credential.
 */
export async function compileModule(
  module: string,
  sourceFiles: SourceFile[],
  opts: CompileOptions
): Promise<ComprehensionUnit> {
  const sourceHash = computeSourceHash(sourceFiles);
  const members = memberBasenames(sourceFiles);
  const { interfaceContract, dependencySlice } = await opts.extractStatic(sourceFiles);

  let summary = '';
  let invariants: string[] = [];
  let model: string | null = null;
  let semantic: 'present' | 'absent' = 'absent';

  if (opts.generateSemantic) {
    const result = await opts.generateSemantic({
      module,
      interfaceContract,
      dependencySlice,
      sourceFiles,
    });
    if (result) {
      summary = result.summary;
      invariants = result.invariants;
      model = result.model ?? null;
      semantic = 'present';
    }
  }

  const now = (opts.now ?? (() => new Date()))();
  return {
    provenance: {
      schemaVersion: SCHEMA_VERSION,
      module: module.replaceAll('\\', '/'),
      sourceHash,
      compiledAt: now.toISOString(),
      compiler: { static: COMPILER_VERSION.static, semantic: COMPILER_VERSION.semantic },
      model,
      semantic,
      members,
    },
    summary,
    invariants,
    interfaceContract,
    dependencySlice,
  };
}
```

4. Run — observe pass: `pnpm --filter @harness-engineering/core exec vitest run tests/comprehension/compile.test.ts`
5. Run: `harness validate`
6. Commit: `feat(comprehension): compileModule orchestrator with static-only path`

---

### Task 7: Add the module barrel `index.ts`

**Depends on:** Task 2, Task 3, Task 4, Task 5, Task 6 | **Files:** `packages/core/src/comprehension/index.ts` | **Owns:** `packages/core/src/comprehension/index.ts`

The module barrel — required so the core-barrel generator auto-discovers `comprehension` (it only picks up dirs containing `index.ts`).

1. Create `packages/core/src/comprehension/index.ts`:

```ts
/**
 * Comprehension module — the per-module compiled comprehension substrate.
 *
 * IO/provider-injected (D5): store fs access via `ComprehensionIO`, and the
 * static/semantic halves via injected `extractStatic`/`generateSemantic`. This
 * layer is PURE and LLM-free; concrete AST + AnalysisProvider adapters wire in
 * later phases. `computeSourceHash` is the sole correctness primitive (D7).
 */
export type {
  ComprehensionUnit,
  ComprehensionProvenance,
  SourceFile,
  StaticExtraction,
  SemanticGeneration,
  SemanticInput,
  ExtractStatic,
  GenerateSemantic,
} from './types';
export { COMPILER_VERSION, SCHEMA_VERSION } from './types';
export { computeSourceHash } from './source-hash';
export { parseUnit, serializeUnit } from './serialize';
export { ComprehensionStore, UNIT_FILE, COMPREHENSION_ROOT } from './store';
export type { ComprehensionIO } from './store';
export { createNodeComprehensionIO } from './node-io';
export { compileModule } from './compile';
export type { CompileOptions } from './compile';
```

2. Run: `pnpm --filter @harness-engineering/core exec tsc --noEmit`
3. Commit: `feat(comprehension): module barrel exports`

---

### Task 8: Wire `comprehension` into the core barrel + regenerate

**Depends on:** Task 7 | **Files:** `scripts/generate-core-barrel.mjs`, `packages/core/src/index.ts` | **Category:** integration

`[checkpoint:human-verify]` — after this task, pause and show the executor's `harness validate` result + the new barrel diff so the human can confirm the Phase 1 vertical slice compiles and exports cleanly before Phase 2 (serve-time gate) begins.

The generator auto-discovers any `src/` dir with an `index.ts`, but a `DIR_COMMENTS` entry controls its JSDoc + canonical ordering (repo memory: core-barrel-curated-allowlist). Add the entry, then regenerate — `packages/core/src/index.ts` is auto-written, never hand-edited.

1. Edit `scripts/generate-core-barrel.mjs` — add to the `DIR_COMMENTS` object (place near the `roadmap` entry for readability):

```js
  comprehension:
    'Comprehension module — per-module compiled comprehension units (unit model, source-hash provenance, markdown store, IO/provider-injected compiler).',
```

2. Regenerate the barrel: `pnpm run generate:barrels`
3. Verify freshness: `node scripts/generate-core-barrel.mjs --check` (must print "Core barrel is up to date.")
4. Confirm the new exports resolve from the package root — `pnpm --filter @harness-engineering/core exec tsc --noEmit` (the regenerated `packages/core/src/index.ts` now contains `export * from './comprehension';`).
5. Run the full module suite: `pnpm --filter @harness-engineering/core exec vitest run tests/comprehension`
6. Run: `harness validate`
7. Commit: `feat(comprehension): export comprehension module from core barrel`

---

## Dependency graph (wave view)

- Wave 1: Task 1
- Wave 2: Task 2, Task 3 _(parallel — disjoint files, both depend only on Task 1)_
- Wave 3: Task 4 _(needs 1, 3)_, Task 6 _(needs 1, 2, 3)_ _(parallel — disjoint files)_
- Wave 4: Task 5 _(needs 4)_
- Wave 5: Task 7 _(needs 2–6)_
- Wave 6: Task 8 _(needs 7)_ — checkpoint

## Validation traceability

| Observable truth                     | Delivered by                |
| ------------------------------------ | --------------------------- |
| 1 (hash membership/content)          | Task 2                      |
| 2, 3 (round-trip, absent sections)   | Task 3                      |
| 4, 5 (store path/round-trip/list)    | Task 4                      |
| 6, 7 (compile static-only/full, SC4) | Task 6                      |
| 8 (node adapter tmpdir)              | Task 5                      |
| 9 (barrel exports)                   | Task 8                      |
| 10 (typecheck + suite + validate)    | Tasks 1–8 (final in Task 8) |

## Notes for the executor

- **`harness validate` binary:** the worktree `packages/cli/dist` is not built; use the global `harness` on PATH (it reads this dir's config), or build the CLI first. `check-deps` currently passes; `validate` reports ~469 **pre-existing** design-token color warnings in unrelated CLI test files — treat only NEW issues as regressions (repo memory: harness-ci-check-baseline-fps).
- **Pre-commit arch gate is fail-closed** and may require `harness check-arch --update-baseline` if a red-on-main baseline blocks commits (repo memory). Build the CLI before committing if the pre-commit hook needs it.
- **Do not hand-edit `packages/core/src/index.ts`** — it is auto-generated; only edit `scripts/generate-core-barrel.mjs` and regenerate.
- **Windows-safe:** every stored path uses `/` (the repo normalizes IO paths to `/`); `path()` and `listUnitPaths` normalize backslashes. Node fs accepts `/` on Windows.
