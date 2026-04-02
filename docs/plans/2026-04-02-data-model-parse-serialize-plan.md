# Plan: Data Model & Parse/Serialize Extensions (Roadmap Sync Phase 1)

**Date:** 2026-04-02
**Spec:** docs/changes/roadmap-sync-pilot/proposal.md
**Estimated tasks:** 6
**Estimated time:** 25 minutes

## Goal

Extend the roadmap data model with `assignee`, `priority`, `externalId` fields on `RoadmapFeature`, add `AssignmentRecord` type and `assignmentHistory` on `Roadmap`, and extend `parseRoadmap`/`serializeRoadmap` for round-trip fidelity with both new and legacy roadmaps.

## Observable Truths (Acceptance Criteria)

1. When `Assignee`, `Priority`, and `External-ID` fields are present in a roadmap.md feature block, `parseRoadmap` shall produce a `RoadmapFeature` with `assignee`, `priority`, and `externalId` populated as typed values. (Success Criterion 1)
2. When `Assignee`, `Priority`, and `External-ID` fields are absent (legacy roadmap), `parseRoadmap` shall produce a `RoadmapFeature` with `assignee: null`, `priority: null`, and `externalId: null`. (Backward compatibility)
3. When an `## Assignment History` section with a markdown table is present, `parseRoadmap` shall produce `assignmentHistory` as an `AssignmentRecord[]` with `feature`, `assignee`, `action`, and `date` fields. (Success Criterion 2)
4. When an `## Assignment History` section is present, `parseMilestones` shall stop before it (sentinel behavior). The heading shall not be treated as a milestone. (Success Criterion 16)
5. When no `## Assignment History` section exists, `parseRoadmap` shall produce `assignmentHistory: []`. (Backward compatibility)
6. `serializeRoadmap` shall reproduce the original markdown with round-trip fidelity for roadmaps containing the new fields, including the `## Assignment History` table.
7. `serializeRoadmap` shall NOT emit `Assignee`, `Priority`, `External-ID` lines or `## Assignment History` section when all values are null/empty (legacy output unchanged).
8. `cd packages/core && npx vitest run tests/roadmap/` shall pass with all existing tests plus new tests (target: 50+ tests total).
9. `npx harness validate` shall pass.

## File Map

- MODIFY `packages/types/src/index.ts` (add `Priority` type, extend `RoadmapFeature`, add `AssignmentRecord`, extend `Roadmap`)
- MODIFY `packages/core/src/roadmap/parse.ts` (new field parsing, assignment history sentinel + parser)
- MODIFY `packages/core/src/roadmap/serialize.ts` (new field serialization, assignment history table)
- MODIFY `packages/core/tests/roadmap/fixtures.ts` (add new fixture variants)
- CREATE `packages/core/tests/roadmap/parse-extended.test.ts` (tests for new parse features)
- CREATE `packages/core/tests/roadmap/serialize-extended.test.ts` (tests for new serialize features)

## Tasks

### Task 1: Extend types with Priority, assignee, externalId, AssignmentRecord

**Depends on:** none
**Files:** `packages/types/src/index.ts`

1. In `packages/types/src/index.ts`, add the `Priority` type after the `FeatureStatus` type:

   ```typescript
   /**
    * Priority override levels for roadmap features.
    * When present, priority replaces positional ordering as the primary sort key.
    */
   export type Priority = 'P0' | 'P1' | 'P2' | 'P3';
   ```

2. Extend `RoadmapFeature` with three new fields (add after `summary`):

   ```typescript
   export interface RoadmapFeature {
     /** Feature name (from the H3 heading, without "Feature:" prefix) */
     name: string;
     /** Current status */
     status: FeatureStatus;
     /** Relative path to the spec file, or null if none */
     spec: string | null;
     /** Relative paths to plan files */
     plans: string[];
     /** Names of blocking features (textual references) */
     blockedBy: string[];
     /** One-line summary */
     summary: string;
     /** GitHub username, email, or display name — null if unassigned */
     assignee: string | null;
     /** Optional priority override — null uses positional ordering */
     priority: Priority | null;
     /** External tracker ID (e.g., "github:owner/repo#42") — null if not synced */
     externalId: string | null;
   }
   ```

3. Add `AssignmentRecord` interface after `RoadmapMilestone`:

   ```typescript
   /**
    * A single record in the assignment history log.
    * Reassignment produces two records: 'unassigned' for previous, 'assigned' for new.
    */
   export interface AssignmentRecord {
     /** Feature name */
     feature: string;
     /** Assignee identifier (username, email, or display name) */
     assignee: string;
     /** What happened */
     action: 'assigned' | 'completed' | 'unassigned';
     /** ISO date string (YYYY-MM-DD) */
     date: string;
   }
   ```

4. Extend the `Roadmap` interface with `assignmentHistory`:

   ```typescript
   export interface Roadmap {
     /** Parsed frontmatter */
     frontmatter: RoadmapFrontmatter;
     /** Milestones in document order (including Backlog) */
     milestones: RoadmapMilestone[];
     /** Assignment history records, in document order */
     assignmentHistory: AssignmentRecord[];
   }
   ```

5. Run: `npx harness validate`
6. Commit: `feat(types): add Priority, assignee, externalId to RoadmapFeature and AssignmentRecord type`

### Task 2: Fix existing tests and fixtures for new type shape

**Depends on:** Task 1
**Files:** `packages/core/tests/roadmap/fixtures.ts`, `packages/core/src/roadmap/parse.ts`, `packages/core/src/roadmap/serialize.ts`

After Task 1, the `RoadmapFeature` type requires three new fields and `Roadmap` requires `assignmentHistory`. All existing code and fixtures must be updated to compile. This task makes the codebase compile and existing tests pass again.

1. Update `packages/core/tests/roadmap/fixtures.ts` — add `assignee: null`, `priority: null`, `externalId: null` to every `RoadmapFeature` object in `VALID_ROADMAP` and `EMPTY_BACKLOG`. Add `assignmentHistory: []` to every `Roadmap` object:

   In `VALID_ROADMAP`, each feature gets:

   ```typescript
   assignee: null,
   priority: null,
   externalId: null,
   ```

   Both `VALID_ROADMAP` and `EMPTY_BACKLOG` get:

   ```typescript
   assignmentHistory: [],
   ```

2. Update `packages/core/src/roadmap/parse.ts` — in `parseFeatureFields`, add the three new fields to the returned object (all defaulting to null for now; proper parsing comes in Task 3):

   ```typescript
   return Ok({
     name,
     status: statusRaw as FeatureStatus,
     spec: specRaw === EM_DASH ? null : specRaw,
     plans,
     blockedBy,
     summary: fieldMap.get('Summary') ?? '',
     assignee: null,
     priority: null,
     externalId: null,
   });
   ```

3. Update `packages/core/src/roadmap/parse.ts` — in `parseRoadmap`, add `assignmentHistory: []` to the returned object:

   ```typescript
   return Ok({
     frontmatter: fmResult.value,
     milestones: milestonesResult.value,
     assignmentHistory: [],
   });
   ```

4. Run: `cd packages/core && npx vitest run tests/roadmap/`
5. Observe: all 31 existing tests pass.
6. Run: `npx harness validate`
7. Commit: `fix(roadmap): update fixtures and defaults for extended RoadmapFeature and Roadmap types`

### Task 3: Add extended parse fixtures and tests

**Depends on:** Task 2
**Files:** `packages/core/tests/roadmap/fixtures.ts`, `packages/core/tests/roadmap/parse-extended.test.ts`

1. Add new fixtures to `packages/core/tests/roadmap/fixtures.ts`:

   ```typescript
   /**
    * Roadmap markdown with extended fields (assignee, priority, external-id).
    */
   export const EXTENDED_FIELDS_MD = `---
   project: harness-engineering
   version: 1
   last_synced: 2026-04-01T10:00:00Z
   last_manual_edit: 2026-04-01T09:00:00Z
   ---
   
   # Roadmap
   
   ## MVP Release
   
   ### Core Library Design
   
   - **Status:** in-progress
   - **Spec:** docs/changes/core-library-design/proposal.md
   - **Summary:** Design and implement core module structure
   - **Blockers:** \u2014
   - **Plan:** docs/plans/2026-03-01-core-library-plan.md
   - **Assignee:** @cwarner
   - **Priority:** P1
   - **External-ID:** github:harness-eng/harness#42
   
   ### Graph Connector
   
   - **Status:** planned
   - **Spec:** docs/changes/graph-connector/proposal.md
   - **Summary:** Graph-based code navigation
   - **Blockers:** Core Library Design
   - **Plan:** \u2014
   - **Assignee:** \u2014
   - **Priority:** P2
   - **External-ID:** \u2014
   
   ## Backlog
   
   ### Future Item
   
   - **Status:** backlog
   - **Spec:** \u2014
   - **Summary:** Something for later
   - **Blockers:** \u2014
   - **Plan:** \u2014
   `;

   export const EXTENDED_FIELDS_ROADMAP: Roadmap = {
     frontmatter: {
       project: 'harness-engineering',
       version: 1,
       lastSynced: '2026-04-01T10:00:00Z',
       lastManualEdit: '2026-04-01T09:00:00Z',
     },
     milestones: [
       {
         name: 'MVP Release',
         isBacklog: false,
         features: [
           {
             name: 'Core Library Design',
             status: 'in-progress',
             spec: 'docs/changes/core-library-design/proposal.md',
             plans: ['docs/plans/2026-03-01-core-library-plan.md'],
             blockedBy: [],
             summary: 'Design and implement core module structure',
             assignee: '@cwarner',
             priority: 'P1',
             externalId: 'github:harness-eng/harness#42',
           },
           {
             name: 'Graph Connector',
             status: 'planned',
             spec: 'docs/changes/graph-connector/proposal.md',
             plans: [],
             blockedBy: ['Core Library Design'],
             summary: 'Graph-based code navigation',
             assignee: null,
             priority: 'P2',
             externalId: null,
           },
         ],
       },
       {
         name: 'Backlog',
         isBacklog: true,
         features: [
           {
             name: 'Future Item',
             status: 'backlog',
             spec: null,
             plans: [],
             blockedBy: [],
             summary: 'Something for later',
             assignee: null,
             priority: null,
             externalId: null,
           },
         ],
       },
     ],
     assignmentHistory: [],
   };

   /**
    * Roadmap markdown with assignment history section.
    */
   export const HISTORY_MD = `---
   project: harness-engineering
   version: 1
   last_synced: 2026-04-01T10:00:00Z
   last_manual_edit: 2026-04-01T09:00:00Z
   ---
   
   # Roadmap
   
   ## MVP Release
   
   ### Core Library Design
   
   - **Status:** done
   - **Spec:** docs/changes/core-library-design/proposal.md
   - **Summary:** Core module structure
   - **Blockers:** \u2014
   - **Plan:** docs/plans/2026-03-01-core-library-plan.md
   - **Assignee:** @cwarner
   - **Priority:** P0
   - **External-ID:** github:harness-eng/harness#42
   
   ## Assignment History
   | Feature | Assignee | Action | Date |
   |---------|----------|--------|------|
   | Core Library Design | @cwarner | assigned | 2026-03-15 |
   | Core Library Design | @cwarner | completed | 2026-04-01 |
   `;

   export const HISTORY_ROADMAP: Roadmap = {
     frontmatter: {
       project: 'harness-engineering',
       version: 1,
       lastSynced: '2026-04-01T10:00:00Z',
       lastManualEdit: '2026-04-01T09:00:00Z',
     },
     milestones: [
       {
         name: 'MVP Release',
         isBacklog: false,
         features: [
           {
             name: 'Core Library Design',
             status: 'done',
             spec: 'docs/changes/core-library-design/proposal.md',
             plans: ['docs/plans/2026-03-01-core-library-plan.md'],
             blockedBy: [],
             summary: 'Core module structure',
             assignee: '@cwarner',
             priority: 'P0',
             externalId: 'github:harness-eng/harness#42',
           },
         ],
       },
     ],
     assignmentHistory: [
       {
         feature: 'Core Library Design',
         assignee: '@cwarner',
         action: 'assigned',
         date: '2026-03-15',
       },
       {
         feature: 'Core Library Design',
         assignee: '@cwarner',
         action: 'completed',
         date: '2026-04-01',
       },
     ],
   };
   ```

   **IMPORTANT:** The `EXTENDED_FIELDS_MD` and `HISTORY_MD` strings must NOT have leading whitespace on lines. The template literal indentation shown above is for plan readability only. In the actual file, each line within the template literal must start at column 0 (no leading spaces). This is critical for the markdown parser regex patterns (`/^## /gm`, `/^### /gm`, `/^- \*\*/gm`) which anchor on `^`.

2. Create `packages/core/tests/roadmap/parse-extended.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { parseRoadmap } from '../../src/roadmap/parse';
   import {
     EXTENDED_FIELDS_MD,
     EXTENDED_FIELDS_ROADMAP,
     HISTORY_MD,
     HISTORY_ROADMAP,
     VALID_ROADMAP_MD,
   } from './fixtures';

   describe('parseRoadmap() — extended fields', () => {
     describe('assignee, priority, externalId', () => {
       it('parses all three new fields when present', () => {
         const result = parseRoadmap(EXTENDED_FIELDS_MD);
         expect(result.ok).toBe(true);
         if (!result.ok) return;
         const core = result.value.milestones[0]?.features[0];
         expect(core?.assignee).toBe('@cwarner');
         expect(core?.priority).toBe('P1');
         expect(core?.externalId).toBe('github:harness-eng/harness#42');
       });

       it('parses em-dash as null for new fields', () => {
         const result = parseRoadmap(EXTENDED_FIELDS_MD);
         expect(result.ok).toBe(true);
         if (!result.ok) return;
         const graph = result.value.milestones[0]?.features[1];
         expect(graph?.assignee).toBeNull();
         expect(graph?.priority).toBe('P2');
         expect(graph?.externalId).toBeNull();
       });

       it('defaults new fields to null when absent (legacy roadmap)', () => {
         const result = parseRoadmap(VALID_ROADMAP_MD);
         expect(result.ok).toBe(true);
         if (!result.ok) return;
         const feature = result.value.milestones[0]?.features[0];
         expect(feature?.assignee).toBeNull();
         expect(feature?.priority).toBeNull();
         expect(feature?.externalId).toBeNull();
       });

       it('parses the full extended roadmap to match expected object', () => {
         const result = parseRoadmap(EXTENDED_FIELDS_MD);
         expect(result.ok).toBe(true);
         if (!result.ok) return;
         expect(result.value).toEqual(EXTENDED_FIELDS_ROADMAP);
       });

       it('returns Err for invalid priority value', () => {
         const md = EXTENDED_FIELDS_MD.replace('P1', 'P5');
         const result = parseRoadmap(md);
         expect(result.ok).toBe(false);
         if (result.ok) return;
         expect(result.error.message).toMatch(/priority/i);
       });
     });

     describe('assignment history', () => {
       it('parses assignment history table into AssignmentRecord[]', () => {
         const result = parseRoadmap(HISTORY_MD);
         expect(result.ok).toBe(true);
         if (!result.ok) return;
         expect(result.value.assignmentHistory).toHaveLength(2);
         expect(result.value.assignmentHistory[0]).toEqual({
           feature: 'Core Library Design',
           assignee: '@cwarner',
           action: 'assigned',
           date: '2026-03-15',
         });
       });

       it('does not treat Assignment History heading as a milestone', () => {
         const result = parseRoadmap(HISTORY_MD);
         expect(result.ok).toBe(true);
         if (!result.ok) return;
         expect(result.value.milestones).toHaveLength(1);
         expect(result.value.milestones[0]?.name).toBe('MVP Release');
       });

       it('produces empty assignmentHistory when section is absent', () => {
         const result = parseRoadmap(VALID_ROADMAP_MD);
         expect(result.ok).toBe(true);
         if (!result.ok) return;
         expect(result.value.assignmentHistory).toEqual([]);
       });

       it('parses the full history roadmap to match expected object', () => {
         const result = parseRoadmap(HISTORY_MD);
         expect(result.ok).toBe(true);
         if (!result.ok) return;
         expect(result.value).toEqual(HISTORY_ROADMAP);
       });
     });
   });
   ```

3. Run: `cd packages/core && npx vitest run tests/roadmap/parse-extended.test.ts`
4. Observe: tests fail (fields still default to null, history not parsed).
5. Run: `npx harness validate`
6. Commit: `test(roadmap): add extended field and assignment history parse test fixtures`

### Task 4: Implement extended field parsing and assignment history parser

**Depends on:** Task 3
**Files:** `packages/core/src/roadmap/parse.ts`

1. Add `Priority` to the import from types at the top of `parse.ts`:

   ```typescript
   import type {
     Roadmap,
     RoadmapFrontmatter,
     RoadmapMilestone,
     RoadmapFeature,
     FeatureStatus,
     Priority,
     AssignmentRecord,
     Result,
   } from '@harness-engineering/types';
   ```

2. Add a valid priorities set after `VALID_STATUSES`:

   ```typescript
   const VALID_PRIORITIES: ReadonlySet<string> = new Set(['P0', 'P1', 'P2', 'P3']);
   ```

3. Update `parseFeatureFields` to extract the three new fields from the field map:

   ```typescript
   function parseFeatureFields(name: string, body: string): Result<RoadmapFeature> {
     const fieldMap = extractFieldMap(body);

     const statusRaw = fieldMap.get('Status');
     if (!statusRaw || !VALID_STATUSES.has(statusRaw)) {
       return Err(
         new Error(
           `Feature "${name}" has invalid status: "${statusRaw ?? '(missing)'}". ` +
             `Valid statuses: ${[...VALID_STATUSES].join(', ')}`
         )
       );
     }

     const specRaw = fieldMap.get('Spec') ?? EM_DASH;
     const plans = parseListField(fieldMap, 'Plans', 'Plan');
     const blockedBy = parseListField(fieldMap, 'Blocked by', 'Blockers');

     // New extended fields
     const assigneeRaw = fieldMap.get('Assignee') ?? EM_DASH;
     const priorityRaw = fieldMap.get('Priority') ?? EM_DASH;
     const externalIdRaw = fieldMap.get('External-ID') ?? EM_DASH;

     // Validate priority if present
     if (priorityRaw !== EM_DASH && !VALID_PRIORITIES.has(priorityRaw)) {
       return Err(
         new Error(
           `Feature "${name}" has invalid priority: "${priorityRaw}". ` +
             `Valid priorities: ${[...VALID_PRIORITIES].join(', ')}`
         )
       );
     }

     return Ok({
       name,
       status: statusRaw as FeatureStatus,
       spec: specRaw === EM_DASH ? null : specRaw,
       plans,
       blockedBy,
       summary: fieldMap.get('Summary') ?? '',
       assignee: assigneeRaw === EM_DASH ? null : assigneeRaw,
       priority: priorityRaw === EM_DASH ? null : (priorityRaw as Priority),
       externalId: externalIdRaw === EM_DASH ? null : externalIdRaw,
     });
   }
   ```

4. Update `parseMilestones` to stop at `## Assignment History` (sentinel):

   ```typescript
   function parseMilestones(body: string): Result<RoadmapMilestone[]> {
     const milestones: RoadmapMilestone[] = [];
     const h2Pattern = /^## (.+)$/gm;
     const h2Matches: Array<{ heading: string; startIndex: number; fullMatch: string }> = [];
     let match: RegExpExecArray | null;
     while ((match = h2Pattern.exec(body)) !== null) {
       // Sentinel: stop before Assignment History
       if (match[1] === 'Assignment History') break;
       h2Matches.push({ heading: match[1]!, startIndex: match.index, fullMatch: match[0] });
     }

     for (let i = 0; i < h2Matches.length; i++) {
       const h2 = h2Matches[i]!;
       const nextStart = i + 1 < h2Matches.length ? h2Matches[i + 1]!.startIndex : body.length;
       const sectionBody = body.slice(h2.startIndex + h2.fullMatch.length, nextStart);

       const isBacklog = h2.heading === 'Backlog';
       const milestoneName = isBacklog ? 'Backlog' : h2.heading.replace(/^Milestone:\s*/, '');

       const featuresResult = parseFeatures(sectionBody);
       if (!featuresResult.ok) return featuresResult;

       milestones.push({
         name: milestoneName,
         isBacklog,
         features: featuresResult.value,
       });
     }

     return Ok(milestones);
   }
   ```

   **WAIT** — there is a subtlety. When the sentinel is hit, the `nextStart` for the last milestone before `## Assignment History` should be the start of `## Assignment History`, NOT `body.length`. With the current loop that already works because we collect all h2Matches up to (but not including) the sentinel, and the last milestone's section extends to `body.length`. But `body.length` would include the assignment history content. We need to trim it.

   Fix: after collecting h2Matches, compute a `bodyEnd` that is the start of `## Assignment History` if it exists:

   ```typescript
   function parseMilestones(body: string): Result<RoadmapMilestone[]> {
     const milestones: RoadmapMilestone[] = [];
     const h2Pattern = /^## (.+)$/gm;
     const h2Matches: Array<{ heading: string; startIndex: number; fullMatch: string }> = [];
     let match: RegExpExecArray | null;
     let bodyEnd = body.length;
     while ((match = h2Pattern.exec(body)) !== null) {
       if (match[1] === 'Assignment History') {
         bodyEnd = match.index;
         break;
       }
       h2Matches.push({ heading: match[1]!, startIndex: match.index, fullMatch: match[0] });
     }

     for (let i = 0; i < h2Matches.length; i++) {
       const h2 = h2Matches[i]!;
       const nextStart = i + 1 < h2Matches.length ? h2Matches[i + 1]!.startIndex : bodyEnd;
       const sectionBody = body.slice(h2.startIndex + h2.fullMatch.length, nextStart);

       const isBacklog = h2.heading === 'Backlog';
       const milestoneName = isBacklog ? 'Backlog' : h2.heading.replace(/^Milestone:\s*/, '');

       const featuresResult = parseFeatures(sectionBody);
       if (!featuresResult.ok) return featuresResult;

       milestones.push({
         name: milestoneName,
         isBacklog,
         features: featuresResult.value,
       });
     }

     return Ok(milestones);
   }
   ```

5. Add the `parseAssignmentHistory` function:

   ```typescript
   function parseAssignmentHistory(body: string): Result<AssignmentRecord[]> {
     const historyMatch = body.match(/^## Assignment History\s*\n/m);
     if (!historyMatch || historyMatch.index === undefined) return Ok([]);

     const historyStart = historyMatch.index + historyMatch[0].length;
     const historyBody = body.slice(historyStart);

     const records: AssignmentRecord[] = [];
     // Parse markdown table rows (skip header and separator)
     const lines = historyBody.split('\n');
     let pastHeader = false;
     for (const line of lines) {
       const trimmed = line.trim();
       if (!trimmed.startsWith('|')) continue;
       // Skip header row and separator row
       if (!pastHeader) {
         if (trimmed.match(/^\|[-\s|]+\|$/)) {
           pastHeader = true;
         }
         continue;
       }
       // Parse data row: | Feature | Assignee | Action | Date |
       const cells = trimmed
         .split('|')
         .map((c) => c.trim())
         .filter((c) => c.length > 0);
       if (cells.length < 4) continue;

       const action = cells[2] as AssignmentRecord['action'];
       if (!['assigned', 'completed', 'unassigned'].includes(action)) continue;

       records.push({
         feature: cells[0]!,
         assignee: cells[1]!,
         action,
         date: cells[3]!,
       });
     }

     return Ok(records);
   }
   ```

6. Update `parseRoadmap` to call `parseAssignmentHistory`:

   ```typescript
   export function parseRoadmap(markdown: string): Result<Roadmap> {
     const fmMatch = markdown.match(/^---\n([\s\S]*?)\n---/);
     if (!fmMatch) {
       return Err(new Error('Missing or malformed YAML frontmatter'));
     }

     const fmResult = parseFrontmatter(fmMatch[1]!);
     if (!fmResult.ok) return fmResult;

     const body = markdown.slice(fmMatch[0].length);
     const milestonesResult = parseMilestones(body);
     if (!milestonesResult.ok) return milestonesResult;

     const historyResult = parseAssignmentHistory(body);
     if (!historyResult.ok) return historyResult;

     return Ok({
       frontmatter: fmResult.value,
       milestones: milestonesResult.value,
       assignmentHistory: historyResult.value,
     });
   }
   ```

7. Run: `cd packages/core && npx vitest run tests/roadmap/parse-extended.test.ts`
8. Observe: all new tests pass.
9. Run: `cd packages/core && npx vitest run tests/roadmap/parse.test.ts`
10. Observe: all existing tests still pass.
11. Run: `npx harness validate`
12. Commit: `feat(roadmap): parse assignee, priority, externalId fields and assignment history section`

### Task 5: Add extended serialize tests

**Depends on:** Task 4
**Files:** `packages/core/tests/roadmap/serialize-extended.test.ts`

1. Create `packages/core/tests/roadmap/serialize-extended.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { serializeRoadmap } from '../../src/roadmap/serialize';
   import { parseRoadmap } from '../../src/roadmap/parse';
   import {
     EXTENDED_FIELDS_MD,
     EXTENDED_FIELDS_ROADMAP,
     HISTORY_MD,
     HISTORY_ROADMAP,
     VALID_ROADMAP_MD,
     VALID_ROADMAP,
   } from './fixtures';

   describe('serializeRoadmap() — extended fields', () => {
     it('serializes assignee, priority, external-id when present', () => {
       const result = serializeRoadmap(EXTENDED_FIELDS_ROADMAP);
       expect(result).toContain('- **Assignee:** @cwarner');
       expect(result).toContain('- **Priority:** P1');
       expect(result).toContain('- **External-ID:** github:harness-eng/harness#42');
     });

     it('omits new fields when all are null (legacy output)', () => {
       const result = serializeRoadmap(VALID_ROADMAP);
       expect(result).not.toContain('**Assignee:**');
       expect(result).not.toContain('**Priority:**');
       expect(result).not.toContain('**External-ID:**');
     });

     it('uses em-dash for null assignee when other extended fields present', () => {
       const result = serializeRoadmap(EXTENDED_FIELDS_ROADMAP);
       // Graph Connector has assignee: null but priority: P2
       expect(result).toContain('- **Assignee:** \u2014');
       expect(result).toContain('- **Priority:** P2');
     });

     it('serializes assignment history table', () => {
       const result = serializeRoadmap(HISTORY_ROADMAP);
       expect(result).toContain('## Assignment History');
       expect(result).toContain('| Core Library Design | @cwarner | assigned | 2026-03-15 |');
       expect(result).toContain('| Core Library Design | @cwarner | completed | 2026-04-01 |');
     });

     it('omits assignment history section when empty', () => {
       const result = serializeRoadmap(VALID_ROADMAP);
       expect(result).not.toContain('Assignment History');
     });

     it('round-trips: parse then serialize extended fields', () => {
       const parseResult = parseRoadmap(EXTENDED_FIELDS_MD);
       expect(parseResult.ok).toBe(true);
       if (!parseResult.ok) return;
       const serialized = serializeRoadmap(parseResult.value);
       expect(serialized).toBe(EXTENDED_FIELDS_MD);
     });

     it('round-trips: parse then serialize with assignment history', () => {
       const parseResult = parseRoadmap(HISTORY_MD);
       expect(parseResult.ok).toBe(true);
       if (!parseResult.ok) return;
       const serialized = serializeRoadmap(parseResult.value);
       expect(serialized).toBe(HISTORY_MD);
     });

     it('round-trips: legacy roadmap unchanged after type extension', () => {
       const parseResult = parseRoadmap(VALID_ROADMAP_MD);
       expect(parseResult.ok).toBe(true);
       if (!parseResult.ok) return;
       const serialized = serializeRoadmap(parseResult.value);
       expect(serialized).toBe(VALID_ROADMAP_MD);
     });
   });
   ```

2. Run: `cd packages/core && npx vitest run tests/roadmap/serialize-extended.test.ts`
3. Observe: tests fail (serialize does not yet output new fields or history).
4. Run: `npx harness validate`
5. Commit: `test(roadmap): add extended field and assignment history serialize tests`

### Task 6: Implement extended field serialization and assignment history output

**Depends on:** Task 5
**Files:** `packages/core/src/roadmap/serialize.ts`

1. Add `AssignmentRecord` to imports:

   ```typescript
   import type {
     Roadmap,
     RoadmapMilestone,
     RoadmapFeature,
     AssignmentRecord,
   } from '@harness-engineering/types';
   ```

2. Update `serializeFeature` to conditionally emit new fields. The rule: emit Assignee/Priority/External-ID lines only when the feature has at least one non-null extended field. This preserves legacy output when all three are null:

   ```typescript
   function serializeFeature(feature: RoadmapFeature): string[] {
     const spec = feature.spec ?? EM_DASH;
     const plans = feature.plans.length > 0 ? feature.plans.join(', ') : EM_DASH;
     const blockedBy = feature.blockedBy.length > 0 ? feature.blockedBy.join(', ') : EM_DASH;

     const lines = [
       `### ${feature.name}`,
       '',
       `- **Status:** ${feature.status}`,
       `- **Spec:** ${spec}`,
       `- **Summary:** ${feature.summary}`,
       `- **Blockers:** ${blockedBy}`,
       `- **Plan:** ${plans}`,
     ];

     // Emit extended fields only when at least one is non-null
     const hasExtended =
       feature.assignee !== null || feature.priority !== null || feature.externalId !== null;
     if (hasExtended) {
       lines.push(`- **Assignee:** ${feature.assignee ?? EM_DASH}`);
       lines.push(`- **Priority:** ${feature.priority ?? EM_DASH}`);
       lines.push(`- **External-ID:** ${feature.externalId ?? EM_DASH}`);
     }

     return lines;
   }
   ```

3. Update `serializeRoadmap` to emit the assignment history section after milestones:

   ```typescript
   export function serializeRoadmap(roadmap: Roadmap): string {
     const lines: string[] = [];

     // Frontmatter
     lines.push('---');
     lines.push(`project: ${roadmap.frontmatter.project}`);
     lines.push(`version: ${roadmap.frontmatter.version}`);
     if (roadmap.frontmatter.created) {
       lines.push(`created: ${roadmap.frontmatter.created}`);
     }
     if (roadmap.frontmatter.updated) {
       lines.push(`updated: ${roadmap.frontmatter.updated}`);
     }
     lines.push(`last_synced: ${roadmap.frontmatter.lastSynced}`);
     lines.push(`last_manual_edit: ${roadmap.frontmatter.lastManualEdit}`);
     lines.push('---');
     lines.push('');
     lines.push('# Roadmap');

     for (const milestone of roadmap.milestones) {
       lines.push('');
       lines.push(serializeMilestoneHeading(milestone));
       for (const feature of milestone.features) {
         lines.push('');
         lines.push(...serializeFeature(feature));
       }
     }

     // Assignment history section (omit if empty)
     if (roadmap.assignmentHistory && roadmap.assignmentHistory.length > 0) {
       lines.push('');
       lines.push(...serializeAssignmentHistory(roadmap.assignmentHistory));
     }

     lines.push('');
     return lines.join('\n');
   }
   ```

4. Add the `serializeAssignmentHistory` function:

   ```typescript
   function serializeAssignmentHistory(records: AssignmentRecord[]): string[] {
     const lines = [
       '## Assignment History',
       '| Feature | Assignee | Action | Date |',
       '|---------|----------|--------|------|',
     ];
     for (const record of records) {
       lines.push(`| ${record.feature} | ${record.assignee} | ${record.action} | ${record.date} |`);
     }
     return lines;
   }
   ```

5. Run: `cd packages/core && npx vitest run tests/roadmap/serialize-extended.test.ts`
6. Observe: all new serialize tests pass.
7. Run: `cd packages/core && npx vitest run tests/roadmap/`
8. Observe: ALL roadmap tests pass (existing + new).
9. Run: `npx harness validate`
10. Commit: `feat(roadmap): serialize assignee, priority, externalId fields and assignment history section`

**NOTE on round-trip fidelity:** The round-trip tests (`parse -> serialize -> compare`) are the ultimate verification. They will only pass if the fixture markdown strings exactly match what the serializer produces. During execution, if a round-trip test fails, compare the actual output with the expected fixture character-by-character (whitespace, newlines, trailing newline) and adjust the fixture to match the canonical serialized form.

## Traceability

| Observable Truth                        | Delivered By                             |
| --------------------------------------- | ---------------------------------------- |
| 1. New fields parsed when present       | Task 4 (implementation), Task 3 (test)   |
| 2. Legacy fields default to null        | Task 2 (defaults), Task 3 (test)         |
| 3. Assignment history parsed            | Task 4 (implementation), Task 3 (test)   |
| 4. Sentinel behavior                    | Task 4 (implementation), Task 3 (test)   |
| 5. Empty history when absent            | Task 2 (default), Task 3 (test)          |
| 6. Serialize round-trip with new fields | Task 6 (implementation), Task 5 (test)   |
| 7. Legacy output unchanged              | Task 6 (conditional emit), Task 5 (test) |
| 8. All tests pass                       | Task 6 (final run)                       |
| 9. harness validate passes              | Every task                               |
