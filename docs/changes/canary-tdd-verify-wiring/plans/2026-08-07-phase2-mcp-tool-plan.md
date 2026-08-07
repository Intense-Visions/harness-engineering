# Plan: Phase 2 — MCP tool `canary_discover_test_command`

**Date:** 2026-08-07
**Spec:** docs/changes/canary-tdd-verify-wiring/proposal.md (resolves #913)
**Integration Tier:** medium
**Estimated tasks:** 4
**Estimated time:** 22 minutes

## Goal

Add a total, gracefully-degrading MCP tool `canary_discover_test_command` that probes canary, matches caller-supplied files against the framework registry by longest file-extension suffix (deterministic tie-break), resolves each to a per-file test command, and returns a JSON body the skills branch on — registered alongside `canary_probe` / `canary_recommend_framework`.

## Observable Truths (Acceptance Criteria)

1. When `adapter.probe()` is degraded, the handler returns `{ status: 'degraded', reason, frameworks: [] }` without calling `listFrameworks`.
2. With canary available and `files: ['login.spec.ts']`, the handler returns `{ status: 'available', frameworks: [{ name: 'playwright', command: 'npx --yes playwright test login.spec.ts', matchedFiles: ['login.spec.ts'] }] }`.
3. With `ci: true`, the resolved command has the framework's `ci_flags` appended.
4. Files whose extension matches no framework (or only frameworks that resolve to `null`) produce `{ status: 'available', frameworks: [] }` — never an error.
5. Longest-suffix wins: `login.spec.ts` matches `spec.ts` (playwright) over a bare `ts` framework (e.g. stryker), and stryker is dropped anyway because its command has no `{file}`.
6. On a residual tie (equal suffix length, equal preferred/full score), the earlier-listed registry framework wins (deterministic; playwright over vitest for `spec.ts`).
7. The handler never throws for any input; a default (real) adapter returns a well-formed `{ status }` body regardless of environment.
8. The tool is registered in `server.ts` (import, definitions array, handler map) and exported from `tools/canary.ts`.
9. The tool description contains no internal issue/PR numbers (SHIPPED-body rule).
10. `harness validate` passes.

## File Map

```
MODIFY packages/cli/src/mcp/tools/canary.ts        (+ definition, + longest-suffix matcher, + handler)
MODIFY packages/cli/src/mcp/tools/canary.test.ts   (+ handler tests; add listFrameworks to fakeAdapter)
MODIFY packages/cli/src/mcp/server.ts              (register: import ~L123-128, definitions ~L318, handler map ~L430)
```

> Node 22 required. Tests: `npx vitest run packages/cli/src/mcp/tools/canary.test.ts`.

## Tasks

### Task 1: Add the tool definition + matcher + handler (TDD)

**Depends on:** Phase 1 complete (adapter exposes `listFrameworks`; barrel exports `resolveTestCommand`, `CanaryFrameworkInfo`)
**Files:** `packages/cli/src/mcp/tools/canary.test.ts`, `packages/cli/src/mcp/tools/canary.ts`

1. **RED** — in `packages/cli/src/mcp/tools/canary.test.ts`:

   a. Extend the import: `import { handleCanaryProbe, handleCanaryRecommendFramework, handleCanaryDiscoverTestCommand } from './canary.js';`

   b. Add `listFrameworks` to the `fakeAdapter` defaults so the fake satisfies the widened `CanaryAdapter` interface:

   ```typescript
     reviewTest: async () => [],
     listFrameworks: async () => [],
     ...over,
   ```

   c. Append this describe block. The registry fixture mirrors the real CLI shape (extra keys ignored); it is a plain array of objects passed to the fake `listFrameworks`:

   ```typescript
   const REGISTRY = [
     {
       name: 'playwright',
       languages: ['typescript'],
       file_extensions: ['spec.ts', 'spec.js', 'test.ts', 'test.js'],
       execution_command: 'npx --yes playwright test {file}',
       ci_flags: ['--reporter=list'],
       status: 'preferred',
       tier: 'full',
     },
     {
       name: 'vitest',
       languages: ['typescript'],
       file_extensions: ['test.ts', 'test.js', 'spec.ts', 'spec.js'],
       execution_command: 'npx --yes vitest run {file}',
       ci_flags: ['--reporter=verbose'],
       status: 'preferred',
       tier: 'full',
     },
     {
       name: 'stryker',
       languages: ['typescript'],
       file_extensions: ['js', 'ts'],
       execution_command: 'npx --yes stryker run', // no {file} → not resolvable
       ci_flags: [],
       status: 'supported',
       tier: 'executable',
     },
   ];

   describe('canary_discover_test_command handler', () => {
     const available = (frameworks: unknown[] = REGISTRY) =>
       fakeAdapter({
         probe: async () => ({ status: 'available', version: '5.4.0' }),
         listFrameworks: async () => frameworks as never,
       });

     it('degrades without listing frameworks when probe is degraded', async () => {
       const res = await handleCanaryDiscoverTestCommand(
         { files: ['login.spec.ts'] },
         fakeAdapter({ probe: async () => ({ status: 'degraded', reason: 'not-installed' }) })
       );
       expect(parse(res)).toEqual({ status: 'degraded', reason: 'not-installed', frameworks: [] });
     });

     it('resolves a per-file command from registry truth', async () => {
       const res = await handleCanaryDiscoverTestCommand({ files: ['login.spec.ts'] }, available());
       expect(parse(res)).toEqual({
         status: 'available',
         frameworks: [
           {
             name: 'playwright',
             command: 'npx --yes playwright test login.spec.ts',
             matchedFiles: ['login.spec.ts'],
           },
         ],
       });
     });

     it('appends ci_flags under ci:true', async () => {
       const res = await handleCanaryDiscoverTestCommand(
         { files: ['login.spec.ts'], ci: true },
         available()
       );
       expect(parse(res).frameworks[0].command).toBe(
         'npx --yes playwright test login.spec.ts --reporter=list'
       );
     });

     it('returns no frameworks when nothing matches', async () => {
       const res = await handleCanaryDiscoverTestCommand({ files: ['README.md'] }, available());
       expect(parse(res)).toEqual({ status: 'available', frameworks: [] });
     });

     it('prefers the longest suffix and drops no-{file} whole-suite frameworks', async () => {
       // bar.ts matches only stryker's `ts` (whole-suite, no {file}) → dropped → empty.
       const res = await handleCanaryDiscoverTestCommand({ files: ['bar.ts'] }, available());
       expect(parse(res).frameworks).toEqual([]);
     });

     it('breaks a preferred/full tie by registry order (playwright before vitest)', async () => {
       const res = await handleCanaryDiscoverTestCommand({ files: ['a.spec.ts'] }, available());
       expect(parse(res).frameworks.map((f: { name: string }) => f.name)).toEqual(['playwright']);
     });

     it('groups multiple files under one framework (command uses the first match)', async () => {
       const res = await handleCanaryDiscoverTestCommand(
         { files: ['a.spec.ts', 'b.spec.ts'] },
         available()
       );
       expect(parse(res).frameworks).toEqual([
         {
           name: 'playwright',
           command: 'npx --yes playwright test a.spec.ts',
           matchedFiles: ['a.spec.ts', 'b.spec.ts'],
         },
       ]);
     });

     it('never throws and defaults to available with a real adapter (env-agnostic)', async () => {
       const res = await handleCanaryDiscoverTestCommand({ files: [] });
       expect(['available', 'degraded']).toContain(parse(res).status);
     });
   });
   ```

2. Run: `npx vitest run packages/cli/src/mcp/tools/canary.test.ts`
3. **Observe failure** — `handleCanaryDiscoverTestCommand` is not exported.
4. **GREEN** — in `packages/cli/src/mcp/tools/canary.ts`:

   a. Widen the top import:

   ```typescript
   import {
     createCanaryAdapter,
     resolveTestCommand,
     type CanaryAdapter,
     type CanaryFrameworkInfo,
   } from '@harness-engineering/intelligence';
   ```

   b. Add the definition after `canaryRecommendFrameworkDefinition` (note: **no** issue/PR numbers):

   ```typescript
   export const canaryDiscoverTestCommandDefinition = {
     name: 'canary_discover_test_command',
     description:
       'Resolve the authoritative per-file test command from the canary framework registry. ' +
       'Input { files?: string[], ci?: boolean }. Probes canary first; when unavailable returns ' +
       '{ status: "degraded", reason, frameworks: [] } so the caller falls back to its own ' +
       'command heuristics. When available, matches each file against a framework by longest ' +
       'file-extension suffix (preferring preferred-status / full-tier frameworks, then registry ' +
       'order on ties) and returns { status: "available", frameworks: [{ name, command, ' +
       'matchedFiles[] }] }. Frameworks without a resolvable per-file command (null or ' +
       'non-{file} commands) are omitted. Never runs the resolved command and never throws.',
     inputSchema: {
       type: 'object' as const,
       properties: {
         files: {
           type: 'array',
           items: { type: 'string' },
           description:
             'Candidate test-file paths to match against the registry (e.g. detected spec/test files).',
         },
         ci: {
           type: 'boolean',
           description: "When true, append each framework's ci_flags to the resolved command.",
         },
       },
     },
   };
   ```

   c. Add the pure matcher helpers and the handler at the end of the file:

   ```typescript
   interface DiscoveredFramework {
     name: string;
     command: string;
     matchedFiles: string[];
   }

   /** Negative when `a` should be preferred over `b`: preferred status, then full tier. */
   function tieScore(fw: CanaryFrameworkInfo): number {
     return (fw.status === 'preferred' ? 2 : 0) + (fw.tier === 'full' ? 1 : 0);
   }

   /**
    * Longest file-extension suffix match for one file. Ties are broken first by
    * preferred/full score, then by registry order (first-listed wins — canary lists
    * preferred runners first). Returns null when no extension matches.
    */
   function bestFrameworkForFile(
     file: string,
     frameworks: CanaryFrameworkInfo[]
   ): CanaryFrameworkInfo | null {
     let best: { fw: CanaryFrameworkInfo; len: number } | null = null;
     for (const fw of frameworks) {
       for (const ext of fw.file_extensions) {
         if (!file.endsWith(`.${ext}`)) continue;
         const len = ext.length;
         const better =
           best === null ||
           len > best.len ||
           (len === best.len && tieScore(fw) > tieScore(best.fw));
         if (better) best = { fw, len };
       }
     }
     return best?.fw ?? null;
   }

   export async function handleCanaryDiscoverTestCommand(
     input: { files?: unknown; ci?: unknown },
     adapter: CanaryAdapter = createCanaryAdapter()
   ) {
     const files = Array.isArray(input?.files)
       ? input.files.filter((f): f is string => typeof f === 'string')
       : [];
     const ci = input?.ci === true;

     const probe = await adapter.probe();
     if (probe.status !== 'available') {
       return jsonResponse({ status: 'degraded', reason: probe.reason, frameworks: [] });
     }

     const registry = await adapter.listFrameworks();
     const byName = new Map<string, DiscoveredFramework>();
     for (const file of files) {
       const fw = bestFrameworkForFile(file, registry);
       if (!fw) continue;
       const command = resolveTestCommand(fw, file, { ci });
       if (command === null) continue; // no-{file} / null-command frameworks are omitted
       const existing = byName.get(fw.name);
       if (existing) existing.matchedFiles.push(file);
       else byName.set(fw.name, { name: fw.name, command, matchedFiles: [file] });
     }

     return jsonResponse({ status: 'available', frameworks: [...byName.values()] });
   }
   ```

5. Run: `npx vitest run packages/cli/src/mcp/tools/canary.test.ts`
6. **Observe pass** — all `canary_discover_test_command` cases green; existing canary handler tests unaffected.
7. Run: `harness validate`
8. Commit: `feat(cli): add canary_discover_test_command MCP tool with registry command resolution`

---

### Task 2: Register the tool in the MCP server

**Depends on:** Task 1
**Files:** `packages/cli/src/mcp/server.ts`

1. Extend the canary import block (currently lines 123–128) to add the new symbols:

```typescript
import {
  canaryProbeDefinition,
  handleCanaryProbe,
  canaryRecommendFrameworkDefinition,
  handleCanaryRecommendFramework,
  canaryDiscoverTestCommandDefinition,
  handleCanaryDiscoverTestCommand,
} from './tools/canary.js';
```

2. In the definitions array, add after `canaryRecommendFrameworkDefinition,` (currently line 319):

```typescript
  canaryDiscoverTestCommandDefinition,
```

3. In the handler map, add after the `canary_recommend_framework` entry (currently line 430):

```typescript
  canary_discover_test_command: handleCanaryDiscoverTestCommand as ToolHandler,
```

4. Run: `npx tsc --noEmit -p packages/cli/tsconfig.json`
5. Run: `npx vitest run packages/cli/src/mcp/tools/canary.test.ts`
6. Run: `harness validate`
7. Commit: `feat(cli): register canary_discover_test_command in the MCP server`

---

### Task 3: Confirm boundary + no cross-package bin reference

**Depends on:** Task 2
**Files:** (verification only)

1. Confirm the CLI tool reaches canary only through the adapter (no `canary` bin / `canary-test-cli` reference in `packages/cli/src/mcp/tools/canary.ts`):
   `grep -nE "canary-test-cli|['\"\`]canary['\"\`]" packages/cli/src/mcp/tools/canary.ts` → expect no matches.
2. Run the intelligence boundary test to confirm the seam is intact:
   `npx vitest run packages/intelligence/tests/adapters/canary-boundary.test.ts`
3. Run: `harness check-deps` — no new dependency-layer violations (cli→intelligence is an allowed edge).
4. No commit unless a fix is needed.

---

### Task 4: Full CLI mcp/tools suite green

**Depends on:** Task 3
**Files:** (verification only)

1. Run: `npx vitest run packages/cli/src/mcp/tools/canary.test.ts`
2. **Observe** probe, recommend, and discover suites all green.
3. Run: `harness validate`
4. No commit unless a fix is needed (fold fixes into the relevant prior task).

---

## Traceability Matrix

| Observable Truth                             | Delivered by Task(s) |
| -------------------------------------------- | -------------------- |
| 1. Degraded probe short-circuits             | Task 1               |
| 2. Registry-truth per-file command           | Task 1               |
| 3. `ci_flags` appended under `ci`            | Task 1               |
| 4. No-match → empty, never error             | Task 1               |
| 5. Longest-suffix; no-`{file}` dropped       | Task 1               |
| 6. Deterministic registry-order tie-break    | Task 1               |
| 7. Never throws; env-agnostic default        | Task 1               |
| 8. Registered in server.ts + exported        | Task 1, Task 2       |
| 9. No internal numbers in description        | Task 1               |
| 10. `harness validate` passes                | All tasks            |

## Feasibility note

**Extension-collision semantics.** playwright and vitest share `spec.ts`/`test.ts` and are both `preferred`/`full`, so the matcher's residual tie-break is registry order — playwright wins for both `.spec.ts` and `.test.ts`. This is deterministic and satisfies success criterion 2, but a vitest-only project with `foo.test.ts` would be offered the playwright command. The spec's DETECT wiring (Phase 3) treats canary's result as registry truth for the **test** command; the spec's own RISK section anticipates this and keeps heuristic fallback available. Recommendation (flag for human): in Phase 3, have harness-verify DETECT prefer canary's resolved command only when it does not conflict with a configured project runner (e.g. a `package.json` `test` script naming a different framework), so a vitest project is not overridden to playwright. Alternatively, extend the tool to return **all** tied matches (per the spec RISK "return all matches") and let DETECT pick the configured one. Both are viable; the plan implements the single-best-deterministic form per the task's item-2 wording and notes the reconciliation in Phase 3.
