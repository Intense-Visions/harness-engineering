# Plan: Feedback Loops Phase 7 — Orchestrator and Cross-Skill Integration

**Date:** 2026-05-05 | **Spec:** `docs/changes/compound-engineering-adoption/feedback-loops/proposal.md` | **Tasks:** 11 | **Time:** ~37 min | **Integration Tier:** medium | **Rigor:** fast

## Goal

Wire the Phase 7 cross-cutting integrations: add orchestrator step 6b (compound directive with mechanical triggers) and replace the `.harness/learnings.md` line with the compound directive in BOTH orchestrator templates; teach `harness-roadmap-pilot` to read the latest pulse report when prioritizing; teach `harness-knowledge-pipeline` Phase 1 EXTRACT to consume `docs/solutions/` as candidate input via a new `BusinessKnowledgeIngestor` method.

## Observable Truths (Acceptance Criteria)

1. `harness.orchestrator.md` (root) contains a step `6b. **Compound (when applicable):**` between step 6 (Code Review) and step 7 (Ship), referencing the four mechanical triggers (a)-(d) from the spec.
2. `templates/orchestrator/harness.orchestrator.md` contains the same step 6b in the same position.
3. The `## Rules` section in BOTH orchestrator files no longer contains the literal string `Document your progress and any learnings in \`.harness/learnings.md\``; it is replaced with a two-bullet (or paragraph) compound directive that (a) instructs `/harness:compound`for non-trivial learnings and (b) clarifies`.harness/learnings.md` is preserved for ephemeral session notes only.
4. `agents/skills/claude-code/harness-roadmap-pilot/SKILL.md` Phase 2 RECOMMEND section instructs the skill to (a) read the most recent file matching `docs/pulse-reports/*.md` (lexically sort, take last), (b) cross-check each candidate item against pulse signal, (c) cite pulse signal in the recommendation rationale when applicable, and (d) soft-fail when no pulse reports exist.
5. `agents/skills/claude-code/harness-knowledge-pipeline/SKILL.md` Phase 1 EXTRACT section lists `docs/solutions/` as a candidate input to `BusinessKnowledgeIngestor`, restricted to knowledge-track docs with stable `last_updated` dates.
6. `packages/graph/src/ingest/BusinessKnowledgeIngestor.ts` exports a new public method (e.g., `ingestSolutions(solutionsDir: string): Promise<IngestResult>`) that walks `docs/solutions/<knowledge-track>/<category>/*.md`, reads frontmatter, validates against `SolutionDocFrontmatterSchema`, filters to `track === 'knowledge-track'`, and adds nodes for accepted entries.
7. A new test in `packages/graph/tests/ingest/BusinessKnowledgeIngestor.solutions.test.ts` exercises: (a) a knowledge-track fixture is ingested as candidate; (b) a bug-track fixture is rejected; (c) a doc with invalid frontmatter is rejected; (d) the empty-dir case returns an empty result without throwing.
8. `npx vitest run packages/graph/tests/ingest/BusinessKnowledgeIngestor.solutions.test.ts` passes (4+ tests).
9. `harness validate` passes after all changes are landed.

## Uncertainties

- [ASSUMPTION] `BusinessKnowledgeIngestor` will be extended with a dedicated method (`ingestSolutions`) rather than a plugin pattern. The current code is method-based with private helpers — adding a sibling public method matches the existing shape. If a plugin pattern existed, the file would already show one.
- [ASSUMPTION] Knowledge-track solutions become `business_concept` nodes (closest match in the existing `BUSINESS_KNOWLEDGE_TYPES` set). Promoting to `business_fact` is mentioned in the spec but `business_fact` is not in the existing set; using `business_concept` keeps Phase 7 tight and defers the new node-type decision to Phase 8 ADR work.
- [DEFERRABLE] Exact wording of the compound directive bullet in `## Rules`. The spec gives a diff hunk to follow verbatim.
- [DEFERRABLE] How "stable last_updated" is enforced. Phase 7 surfaces it in SKILL.md prose; the ingestor records `last_updated` in node metadata but does not yet gate on staleness (left for Phase 8 or a follow-up).

## File Map

- MODIFY `harness.orchestrator.md` (insert step 6b; replace learnings.md rule line)
- MODIFY `templates/orchestrator/harness.orchestrator.md` (same two edits)
- MODIFY `agents/skills/claude-code/harness-roadmap-pilot/SKILL.md` (Phase 2 RECOMMEND pulse signal block)
- MODIFY `agents/skills/claude-code/harness-knowledge-pipeline/SKILL.md` (Phase 1 EXTRACT solutions candidate input)
- MODIFY `packages/graph/src/ingest/BusinessKnowledgeIngestor.ts` (add `ingestSolutions` method; import `SolutionDocFrontmatterSchema` via `@harness-engineering/core`)
- CREATE `packages/graph/tests/ingest/BusinessKnowledgeIngestor.solutions.test.ts`
- CREATE `packages/graph/tests/fixtures/solutions/knowledge-track/architecture-patterns/sample-pattern.md` (test fixture)
- CREATE `packages/graph/tests/fixtures/solutions/bug-track/test-failures/sample-fix.md` (test fixture)
- CREATE `packages/graph/tests/fixtures/solutions/knowledge-track/conventions/invalid-frontmatter.md` (test fixture)

## Skeleton

_Not produced — fast mode skips skeleton (Rigor Levels table)._

## Tasks

### Task 1: Add step 6b to root `harness.orchestrator.md`

**Depends on:** none | **Files:** `harness.orchestrator.md`

1. Open `harness.orchestrator.md`. Locate the line `6. **Code Review:** Use \`/harness:code-review\` and \`/harness:pre-commit-review\``.
2. Insert a new numbered step after step 6's two-line block (before `7. **Ship:**`):

   ```
   6b. **Compound (when applicable):** Run `/harness:compound` when ANY of these
       concrete triggers fired during this issue:
       (a) `/harness:debugging` was invoked at any point (regardless of outcome),
       (b) the fix required more than one commit on the issue branch,
       (c) execution involved >1 attempt (`Attempt Number` above is greater than 1), or
       (d) the change touched a file already listed in the latest hotspot report.
       Otherwise skip silently. The triggers are mechanical — no judgment required.
   ```

3. Save. Do not modify step 7 numbering.
4. Run: `harness validate`
5. Commit: `feat(orchestrator): add step 6b compound directive to root template`

### Task 2: Replace `.harness/learnings.md` rule line in root `harness.orchestrator.md`

**Depends on:** Task 1 | **Files:** `harness.orchestrator.md`

1. In the same file, locate `- Document your progress and any learnings in \`.harness/learnings.md\`.`in the`## Rules` section.
2. Replace that single bullet with:

   ```
   - For non-trivial learnings, run `/harness:compound` (writes structured docs to
     `docs/solutions/<track>/<category>/`). The `.harness/learnings.md` file remains
     for ephemeral session notes only and is not preserved as compounding knowledge.
   ```

3. Confirm the literal string `Document your progress and any learnings in \`.harness/learnings.md\`` no longer appears in the file.
4. Run: `harness validate`
5. Commit: `feat(orchestrator): replace learnings.md rule with compound directive (root template)`

### Task 3: Add step 6b to `templates/orchestrator/harness.orchestrator.md`

**Depends on:** Task 2 | **Files:** `templates/orchestrator/harness.orchestrator.md`

1. Open `templates/orchestrator/harness.orchestrator.md`. Locate step 6 (Code Review) in the `## Standard Workflow` section.
2. Insert the same step 6b block as Task 1 between step 6 and step 7. Do not change step 7 numbering.
3. Save.
4. Run: `harness validate`
5. Commit: `feat(orchestrator): add step 6b compound directive to template copy`

### Task 4: Replace `.harness/learnings.md` rule line in `templates/orchestrator/harness.orchestrator.md`

**Depends on:** Task 3 | **Files:** `templates/orchestrator/harness.orchestrator.md`

1. In the same file, locate the same `- Document your progress and any learnings in \`.harness/learnings.md\`.`bullet in the`## Rules` section.
2. Replace with the same two-line compound directive used in Task 2.
3. Confirm the deprecated literal no longer appears in the file.
4. Run: `harness validate`
5. Commit: `feat(orchestrator): replace learnings.md rule with compound directive (template copy)`

### Task 5: [checkpoint:human-verify] Verify orchestrator template prose

**Depends on:** Task 4 | **Files:** `harness.orchestrator.md`, `templates/orchestrator/harness.orchestrator.md`

1. Show the user a unified diff of both orchestrator files (the four edits from Tasks 1-4 combined).
2. Pause and ask: "Does the prose match the spec's Decision orchestrator-step-6b and the diff hunk in proposal.md? Any wording adjustments before continuing?"
3. On approval, proceed to Task 6. On revision request, edit and re-present.
4. No commit (verification step only).

### Task 6: Update `harness-roadmap-pilot` Phase 2 RECOMMEND with pulse signal reading

**Depends on:** Task 5 | **Files:** `agents/skills/claude-code/harness-roadmap-pilot/SKILL.md`

1. Open the SKILL.md. Locate the `### Phase 2: RECOMMEND -- AI-Assisted Analysis` section.
2. After the existing step `1. For the top 3 candidates, read their spec files (if they exist):` block (and before step `2. Provide a recommendation with reasoning:`), insert a new numbered step `1b`:

   ```
   1b. Read the most recent pulse report (if any):
       - List files matching `docs/pulse-reports/*.md`. Sort lexically (ISO timestamps
         in filenames make this equivalent to chronological order). Take the LAST entry.
       - If the directory is empty or absent, soft-fail: skip this step and proceed
         without pulse signal. Do not block recommendation.
       - For each top-3 candidate, scan the most recent pulse report's Headlines and
         Followups sections for keywords matching the candidate's name, milestone, or
         spec keywords. Note any signal that elevates priority (top followup item
         related to a candidate; an error spike in a candidate's area) or suppresses
         it (recent stable signal in candidate's area).
       - When pulse signal is found, cite it verbatim in the recommendation rationale
         (e.g., "Pulse 2026-05-05_08-00 headline: 'auth errors up 30%' — elevates
         Auth Hardening").
       - Use ONLY the most recent file. If older reports conflict with the most
         recent, ignore the older signal.
   ```

3. Add a new bullet to the `## Success Criteria` list after the existing item 7: `8. When a pulse report exists, the recommendation rationale cites pulse signal for any top-3 candidate whose area is referenced in the pulse Headlines or Followups.` Renumber the existing item 8 to 9.
4. Run: `harness validate`
5. Commit: `feat(roadmap-pilot): cite latest pulse report signal in Phase 2 RECOMMEND`

### Task 7: Update `harness-knowledge-pipeline` Phase 1 EXTRACT with `docs/solutions/` candidate input

**Depends on:** Task 6 | **Files:** `agents/skills/claude-code/harness-knowledge-pipeline/SKILL.md`

1. Open the SKILL.md. Locate the `## Phase 1: EXTRACT` section.
2. After existing step `3. **Connector Sync** (if configured):`, insert a new step `4. **Solutions Candidates** (if `docs/solutions/` exists):`:

   ```
   4. **Solutions Candidates** (if `docs/solutions/` exists): Run
      `BusinessKnowledgeIngestor.ingestSolutions(\"docs/solutions\")` to consume
      knowledge-track post-mortems written by `harness-compound`.
      - Only `docs/solutions/knowledge-track/<category>/*.md` files are candidates;
        bug-track docs are skipped (they are fix playbooks, not structural facts).
      - Each candidate must validate against `SolutionDocFrontmatterSchema` from
        `@harness-engineering/core`. Invalid frontmatter is logged and skipped.
      - Stable `last_updated` (older than configurable threshold; default: not gated
        in Phase 7) is the promotion criterion for `business_concept` graph nodes.
      - Candidates that pass become `business_concept` nodes in the snapshot.
   ```

3. Renumber the existing step 4 (Build Fresh Snapshot) to step 5.
4. Run: `harness validate`
5. Commit: `feat(knowledge-pipeline): register docs/solutions/ as Phase 1 candidate input`

### Task 8 (TDD): Write `BusinessKnowledgeIngestor.ingestSolutions` test fixtures and failing test

**Depends on:** Task 7 | **Files:** `packages/graph/tests/ingest/BusinessKnowledgeIngestor.solutions.test.ts`, `packages/graph/tests/fixtures/solutions/knowledge-track/architecture-patterns/sample-pattern.md`, `packages/graph/tests/fixtures/solutions/bug-track/test-failures/sample-fix.md`, `packages/graph/tests/fixtures/solutions/knowledge-track/conventions/invalid-frontmatter.md`

1. Create fixture `packages/graph/tests/fixtures/solutions/knowledge-track/architecture-patterns/sample-pattern.md`:

   ```markdown
   ---
   track: knowledge-track
   category: architecture-patterns
   module: orchestrator
   tags: [state-machine, leases]
   problem_type: pattern
   last_updated: 2026-04-15
   ---

   # Lease cleanup pattern

   When the orchestrator detects a stalled lease, the cleanup runs a 3-phase
   reconciliation: detect, mark, evict.
   ```

2. Create fixture `packages/graph/tests/fixtures/solutions/bug-track/test-failures/sample-fix.md`:

   ```markdown
   ---
   track: bug-track
   category: test-failures
   module: cli
   tags: [retry, flaky]
   problem_type: bug
   last_updated: 2026-04-20
   ---

   # Retry budget exhaustion fix

   Cap retries at 3 in the test runner.
   ```

3. Create fixture `packages/graph/tests/fixtures/solutions/knowledge-track/conventions/invalid-frontmatter.md`:

   ```markdown
   ---
   track: knowledge-track
   category: not-a-real-category
   module: cli
   tags: [bad]
   problem_type: pattern
   last_updated: not-a-date
   ---

   # Invalid frontmatter doc
   ```

4. Create test file `packages/graph/tests/ingest/BusinessKnowledgeIngestor.solutions.test.ts`:

   ```typescript
   import { describe, it, expect, beforeEach } from 'vitest';
   import * as path from 'node:path';
   import { BusinessKnowledgeIngestor } from '../../src/ingest/BusinessKnowledgeIngestor.js';
   import { GraphStore } from '../../src/store/GraphStore.js';

   const FIXTURES = path.resolve(__dirname, '../fixtures/solutions');

   describe('BusinessKnowledgeIngestor.ingestSolutions', () => {
     let store: GraphStore;
     let ingestor: BusinessKnowledgeIngestor;

     beforeEach(() => {
       store = new GraphStore();
       ingestor = new BusinessKnowledgeIngestor(store);
     });

     it('ingests knowledge-track docs as business_concept nodes', async () => {
       const result = await ingestor.ingestSolutions(FIXTURES);
       const concepts = store.findNodes({ type: 'business_concept' });
       const knowledgeTrackNode = concepts.find((n) =>
         n.path?.includes('architecture-patterns/sample-pattern.md')
       );
       expect(knowledgeTrackNode).toBeDefined();
       expect(result.errors).toEqual([]);
     });

     it('rejects bug-track docs', async () => {
       await ingestor.ingestSolutions(FIXTURES);
       const all = store.findNodes({});
       const bugTrack = all.find((n) => n.path?.includes('bug-track/'));
       expect(bugTrack).toBeUndefined();
     });

     it('rejects docs with invalid frontmatter', async () => {
       const result = await ingestor.ingestSolutions(FIXTURES);
       const all = store.findNodes({});
       const invalid = all.find((n) => n.path?.includes('invalid-frontmatter.md'));
       expect(invalid).toBeUndefined();
       expect(result.errors.some((e) => e.includes('invalid-frontmatter'))).toBe(true);
     });

     it('returns empty result for missing directory', async () => {
       const result = await ingestor.ingestSolutions(path.join(FIXTURES, 'nonexistent'));
       expect(result.nodesAdded).toBe(0);
       expect(result.errors).toEqual([]);
     });
   });
   ```

5. Run: `npx vitest run packages/graph/tests/ingest/BusinessKnowledgeIngestor.solutions.test.ts` — observe failure (method does not exist).
6. Commit: `test(graph): add failing tests for BusinessKnowledgeIngestor.ingestSolutions`

### Task 9 (TDD): Implement `BusinessKnowledgeIngestor.ingestSolutions`

**Depends on:** Task 8 | **Files:** `packages/graph/src/ingest/BusinessKnowledgeIngestor.ts`

1. Open the file. Add an import at the top:

   ```typescript
   import { SolutionDocFrontmatterSchema } from '@harness-engineering/core';
   ```

2. Add a new public method on the class, after `ingest()`:

   ```typescript
   async ingestSolutions(solutionsDir: string): Promise<IngestResult> {
     const start = Date.now();
     const errors: string[] = [];
     let files: string[];
     try {
       files = await this.findMarkdownFiles(solutionsDir);
     } catch {
       return emptyResult(Date.now() - start);
     }

     let nodesAdded = 0;
     for (const filePath of files) {
       try {
         const raw = await fs.readFile(filePath, 'utf-8');
         const parsed = parseSolutionFrontmatter(raw);
         if (!parsed) continue;
         const validation = SolutionDocFrontmatterSchema.safeParse(parsed.frontmatter);
         if (!validation.success) {
           errors.push(`${filePath}: ${validation.error.message}`);
           continue;
         }
         if (validation.data.track !== 'knowledge-track') continue;
         const relPath = path.relative(solutionsDir, filePath).replaceAll('\\', '/');
         const filename = path.basename(filePath, '.md');
         const nodeId = `bk:solutions:${validation.data.module}:${filename}`;
         const titleMatch = parsed.body.match(/^#\s+(.+)$/m);
         const name = titleMatch ? titleMatch[1]!.trim() : filename;
         const node: GraphNode = {
           id: nodeId,
           type: 'business_concept',
           name,
           path: relPath,
           content: parsed.body.trim(),
           metadata: {
             domain: validation.data.module,
             tags: validation.data.tags,
             problem_type: validation.data.problem_type,
             last_updated: validation.data.last_updated,
             source: 'solutions',
             category: validation.data.category,
           },
         };
         this.store.addNode(node);
         nodesAdded++;
       } catch (err) {
         errors.push(`${filePath}: ${err instanceof Error ? err.message : String(err)}`);
       }
     }
     return { nodesAdded, nodesUpdated: 0, edgesAdded: 0, edgesUpdated: 0, errors, durationMs: Date.now() - start };
   }
   ```

3. Add a helper at module bottom (next to existing `parseFrontmatter`):

   ```typescript
   function parseSolutionFrontmatter(
     raw: string
   ): { frontmatter: Record<string, unknown>; body: string } | null {
     const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
     if (!match) return null;
     const yamlBlock = match[1]!;
     const body = match[2]!;
     const frontmatter: Record<string, unknown> = {};
     for (const line of yamlBlock.split('\n')) {
       const kvMatch = line.match(/^(\w+):\s*(.+)$/);
       if (!kvMatch) continue;
       const key = kvMatch[1]!;
       const value = kvMatch[2]!.trim();
       if (value.startsWith('[') && value.endsWith(']')) {
         frontmatter[key] = value
           .slice(1, -1)
           .split(',')
           .map((s) => s.trim());
       } else {
         frontmatter[key] = value;
       }
     }
     return { frontmatter, body };
   }
   ```

4. Run: `npx vitest run packages/graph/tests/ingest/BusinessKnowledgeIngestor.solutions.test.ts` — observe pass (4 tests).
5. Run: `harness validate`
6. Run: `harness check-deps`
7. Commit: `feat(graph): add BusinessKnowledgeIngestor.ingestSolutions for docs/solutions consumption`

### Task 10: Verify the existing `BusinessKnowledgeIngestor` test suite still passes

**Depends on:** Task 9 | **Files:** none

1. Run: `npx vitest run packages/graph/tests/ingest/BusinessKnowledgeIngestor.test.ts`
2. Confirm all existing tests pass (no regression from the new method or import).
3. Run: `npx vitest run packages/graph/tests/ingest/` to confirm the full ingest suite passes.
4. No commit (verification step).

### Task 11: Final `harness validate` and integration smoke check

**Depends on:** Task 10 | **Files:** none | **Category:** integration

1. Run: `harness validate`. Confirm pass.
2. Run: `harness check-deps`. Confirm no new boundary violations.
3. Verify integration points from spec are covered by Phase 7:
   - `harness.orchestrator.md` step 6b: covered by Tasks 1-2.
   - Templated orchestrator copy: covered by Tasks 3-4.
   - `harness-roadmap-pilot` SKILL.md pulse signal: covered by Task 6.
   - `harness-knowledge-pipeline` SKILL.md docs/solutions input: covered by Task 7.
   - `BusinessKnowledgeIngestor` consumption: covered by Tasks 8-9.
4. Confirm out-of-scope items remain untouched:
   - `packages/core/src/state/learnings*.ts` — no changes.
   - MCP `learnings` resource — no changes.
   - AGENTS.md — no changes (Phase 8).
   - ADRs — no changes (Phase 8).
5. No commit (verification step). All Phase 7 commits already landed in Tasks 1-9.

## Integration Points Coverage (from spec)

| Spec subsection                                                                                            | Phase 7 task           |
| ---------------------------------------------------------------------------------------------------------- | ---------------------- |
| Documentation Updates → `harness.orchestrator.md` step 6b + `.harness/learnings.md` deprecation            | Tasks 1-4              |
| Documentation Updates → `harness-knowledge-pipeline` SKILL.md note about `docs/solutions/` candidate input | Task 7                 |
| Documentation Updates → `harness-roadmap-pilot` SKILL.md pulse signal in prioritization                    | Task 6                 |
| Registrations Required → Compound categories registered with `BusinessKnowledgeIngestor`                   | Tasks 8-9              |
| Knowledge Impact → solution-doc → candidate input for `BusinessKnowledgeIngestor`                          | Tasks 8-9              |
| Documentation Updates → `AGENTS.md`, `harness-observability` SKILL.md, conventions doc                     | OUT OF SCOPE (Phase 8) |
| Architectural Decisions → ADR-1..5                                                                         | OUT OF SCOPE (Phase 8) |
