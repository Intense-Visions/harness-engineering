# Plan: Tier Infrastructure

**Date:** 2026-03-27
**Spec:** docs/changes/domain-skill-tiers/proposal.md
**Estimated tasks:** 9
**Estimated time:** 36 minutes

## Goal

The harness skill system supports three-tier loading with a `search_skills` MCP tool for catalog discovery and an intelligent dispatcher that suggests relevant domain skills when workflow skills start.

## Observable Truths (Acceptance Criteria)

1. When `harness generate-slash-commands` runs, only skills with `tier: 1` or `tier: 2` produce slash commands. Skills with `tier: 3`, `internal: true`, or no tier field are excluded.
2. When an agent calls `search_skills("database migration")`, the MCP tool returns ranked results from `.harness/skills-index.json` with name, description, keywords, phases, and score.
3. When `.harness/skills-index.json` is stale (skill directories changed since last build), `search_skills` rebuilds the index before returning results.
4. When a Tier 1 workflow skill starts, the dispatcher injects a "Suggested Domain Skills" notice with up to 3 relevant catalog skills based on task keywords + stack signals.
5. When `harness.config.json` contains `skills.tierOverrides`, the overridden tier values are respected in both slash-command generation and catalog indexing.
6. When `harness.config.json` contains `skills.alwaysSuggest` or `skills.neverSuggest`, the dispatcher respects these overrides.
7. The `SkillMetadataSchema` validates `tier`, `internal`, `keywords`, and `stack_signals` fields.
8. `.harness/stack-profile.json` is generated on first `search_skills` call, containing detected file signals and matched domains.
9. All existing 49 skill.yaml files have a `tier` field matching their classification from the spec.
10. `npx vitest run` passes for all new and modified test files.
11. `harness validate` passes.

## File Map

```
MODIFY packages/cli/src/skill/schema.ts                       (add tier, internal, keywords, stack_signals)
CREATE packages/cli/src/skill/index-builder.ts                 (build and cache skills-index.json)
CREATE packages/cli/src/skill/index-builder.test.ts            (tests)
CREATE packages/cli/src/skill/stack-profile.ts                 (detect project tech stack)
CREATE packages/cli/src/skill/stack-profile.test.ts            (tests)
CREATE packages/cli/src/skill/dispatcher.ts                    (score and suggest catalog skills)
CREATE packages/cli/src/skill/dispatcher.test.ts               (tests)
CREATE packages/cli/src/mcp/tools/search-skills.ts             (search_skills MCP tool)
MODIFY packages/cli/src/mcp/server.ts                          (register search_skills tool)
MODIFY packages/cli/src/slash-commands/normalize.ts            (tier filter)
MODIFY packages/cli/src/slash-commands/normalize.test.ts       (test tier filtering)
MODIFY packages/cli/src/config/loader.ts                       (add skills config section)
MODIFY packages/cli/src/mcp/tools/skill.ts                     (inject dispatcher suggestions)
MODIFY 49 existing skill.yaml files (claude-code + gemini-cli) (add tier field)
```

## Tasks

### Task 1: Extend SkillMetadataSchema

**Depends on:** none
**Files:** packages/cli/src/skill/schema.ts

1. Add these fields to the `SkillMetadataSchema` Zod object after the `repository` field:
   ```typescript
   tier: z.number().int().min(1).max(3).optional(),
   internal: z.boolean().default(false),
   keywords: z.array(z.string()).default([]),
   stack_signals: z.array(z.string()).default([]),
   ```
2. Export the inferred type if not already exported:
   ```typescript
   export type SkillMetadata = z.infer<typeof SkillMetadataSchema>;
   ```
3. Run: `npx vitest run packages/cli/src/skill/`
4. Run: `harness validate`
5. Commit: `feat(skill): add tier, internal, keywords, stack_signals to SkillMetadataSchema`

### Task 2: Add tier filter to slash-command generation

**Depends on:** Task 1
**Files:** packages/cli/src/slash-commands/normalize.ts, packages/cli/src/slash-commands/normalize.test.ts

1. In `normalize.ts`, after the platform filter (line ~50 `if (!matchesPlatform) continue;`), add:
   ```typescript
   const tier = result.data.tier;
   const isInternal = result.data.internal;
   if (tier === 3 || isInternal) continue;
   ```
2. Add tests in `normalize.test.ts`:
   - `excludes tier 3 skills from slash commands`
   - `excludes internal skills from slash commands`
   - `includes tier 1 and tier 2 skills`
   - `includes skills without tier field (backward compat)`
3. Run: `npx vitest run packages/cli/src/slash-commands/`
4. Run: `harness validate`
5. Commit: `feat(slash-commands): filter by tier — only Tier 1 and 2 generate slash commands`

### Task 3: Create index builder

**Depends on:** Task 1
**Files:** packages/cli/src/skill/index-builder.ts, packages/cli/src/skill/index-builder.test.ts

1. Create `index-builder.ts` with:
   - `SkillIndexEntry` interface: tier, description, keywords, stackSignals, cognitiveMode, phases, source
   - `SkillsIndex` interface: version, hash, generatedAt, skills record
   - `computeSkillsDirHash(skillsDirs)`: SHA-256 of skill.yaml file mtimes
   - `buildIndex(platform, projectRoot)`: scan all skill dirs, parse skill.yaml, index Tier 3 and community skills
   - `loadOrRebuildIndex(platform, projectRoot)`: read `.harness/skills-index.json`, compare hash, rebuild if stale
2. Create tests:
   - `computeSkillsDirHash` returns consistent hash
   - `buildIndex` produces correct entries from skill dirs
   - `buildIndex` skips invalid skill.yaml
   - `buildIndex` only indexes Tier 3 skills
   - `loadOrRebuildIndex` returns cached when hash matches
   - `loadOrRebuildIndex` rebuilds when hash differs
3. Run: `npx vitest run packages/cli/src/skill/index-builder.test.ts`
4. Run: `harness validate`
5. Commit: `feat(skill): add index builder with hash-based staleness detection`

### Task 4: Create stack profile generator

**Depends on:** none
**Files:** packages/cli/src/skill/stack-profile.ts, packages/cli/src/skill/stack-profile.test.ts

1. Create `stack-profile.ts` with:
   - `StackProfile` interface: generatedAt, signals record, detectedDomains array
   - `SIGNAL_DOMAIN_MAP`: mapping of file patterns to domain names (Dockerfile → containerization, prisma/schema.prisma → database, etc.)
   - `generateStackProfile(projectRoot)`: glob each signal pattern, record presence, derive domains
   - `loadOrGenerateProfile(projectRoot)`: cache to `.harness/stack-profile.json`
2. Create tests:
   - Detects present signals correctly
   - Marks absent signals as false
   - Derives correct domains from signals
   - Caches profile to disk
   - Returns cached profile if exists
3. Run: `npx vitest run packages/cli/src/skill/stack-profile.test.ts`
4. Run: `harness validate`
5. Commit: `feat(skill): add stack profile generator for tech stack detection`

### Task 5: Create dispatcher

**Depends on:** Task 3, Task 4
**Files:** packages/cli/src/skill/dispatcher.ts, packages/cli/src/skill/dispatcher.test.ts

1. Create `dispatcher.ts` with:
   - `TIER_1_SKILLS` set of 7 workflow skill names
   - `isTier1Skill(name)`: check membership
   - `scoreSkill(entry, queryTerms, profile, recentFiles)`: weighted score = 0.5*keyword + 0.3*stack + 0.2\*recency
   - `suggest(index, taskDescription, profile, recentFiles, config?)`: score all catalog skills, filter ≥0.4, return top 3
   - `formatSuggestions(suggestions)`: render markdown notice block
   - `DispatcherConfig` interface: alwaysSuggest, neverSuggest arrays
2. Create tests:
   - `isTier1Skill` returns true/false correctly
   - `scoreSkill` high score for keyword matches
   - `scoreSkill` returns 0 for no matches
   - `suggest` returns top 3 above threshold
   - `suggest` excludes neverSuggest skills
   - `suggest` includes alwaysSuggest even below threshold
   - `formatSuggestions` returns empty for no suggestions
   - `formatSuggestions` returns formatted markdown
3. Run: `npx vitest run packages/cli/src/skill/dispatcher.test.ts`
4. Run: `harness validate`
5. Commit: `feat(skill): add intelligent dispatcher with keyword and stack-signal scoring`

### Task 6: Create search_skills MCP tool

**Depends on:** Task 3
**Files:** packages/cli/src/mcp/tools/search-skills.ts, packages/cli/src/mcp/server.ts

1. Create `search-skills.ts` with:
   - `searchSkillsDefinition`: name, description, inputSchema (query required, path optional, platform optional)
   - `handleSearchSkills(input)`: load index, load profile, score skills by keyword+stack match, return top 5 as JSON
2. In `server.ts`:
   - Import definition and handler
   - Add `searchSkillsDefinition` to TOOL_DEFINITIONS array
   - Add `search_skills: handleSearchSkills as ToolHandler` to TOOL_HANDLERS
3. Run: `npx vitest run packages/cli/src/mcp/`
4. Run: `harness validate`
5. Commit: `feat(mcp): add search_skills tool for catalog discovery`

### Task 7: Inject dispatcher into skill loading

**Depends on:** Task 5, Task 6
**Files:** packages/cli/src/mcp/tools/skill.ts

1. In `handleRunSkill`, after SKILL.md content is loaded, add:

   ```typescript
   import { isTier1Skill, suggest, formatSuggestions } from '../../skill/dispatcher.js';
   import { loadOrRebuildIndex } from '../../skill/index-builder.js';
   import { loadOrGenerateProfile } from '../../skill/stack-profile.js';

   if (isTier1Skill(skillName)) {
     try {
       const index = loadOrRebuildIndex(platform, projectRoot);
       const profile = loadOrGenerateProfile(projectRoot);
       const suggestions = suggest(index, taskDesc, profile, [], config?.skills);
       const suggestionText = formatSuggestions(suggestions);
       if (suggestionText) content += suggestionText;
     } catch {
       /* never block skill loading */
     }
   }
   ```

2. Run: `npx vitest run packages/cli/src/mcp/tools/`
3. Run: `harness validate`
4. Commit: `feat(skill): inject dispatcher suggestions when Tier 1 workflow skills load`

### Task 8: Add skills config section

**Depends on:** Task 1
**Files:** packages/cli/src/config/loader.ts

1. Add to `HarnessConfigSchema`:
   ```typescript
   skills: z.object({
     alwaysSuggest: z.array(z.string()).default([]),
     neverSuggest: z.array(z.string()).default([]),
     tierOverrides: z.record(z.string(), z.number().int().min(1).max(3)).default({}),
   }).optional(),
   ```
2. Wire tierOverrides into normalize.ts: read config, apply overrides before tier filtering.
3. Run: `npx vitest run packages/cli/src/config/`
4. Run: `harness validate`
5. Commit: `feat(config): add skills section to harness.config.json for tier overrides and suggestion control`

### Task 9: Add tier field to all 49 existing skill.yaml files

[checkpoint:human-verify]

**Depends on:** Task 1
**Files:** All 49 skill.yaml files in agents/skills/claude-code/ and agents/skills/gemini-cli/

1. Add `tier: 1` to: harness-brainstorming, harness-planning, harness-execution, harness-autopilot, harness-tdd, harness-debugging, harness-refactoring, harness-skill-authoring, harness-onboarding, initialize-harness-project, add-harness-component
2. Add `tier: 2` to: harness-integrity, harness-verify, harness-code-review, harness-release-readiness, harness-docs-pipeline, harness-codebase-cleanup, harness-enforce-architecture, harness-detect-doc-drift, harness-cleanup-dead-code, harness-dependency-health, harness-hotspot-detector, harness-security-scan, harness-perf, harness-impact-analysis, harness-test-advisor, harness-soundness-review
3. Add `tier: 3` to: harness-design, harness-design-system, harness-design-web, harness-design-mobile, harness-accessibility, harness-i18n, harness-i18n-workflow, harness-i18n-process, harness-security-review, harness-perf-tdd, harness-diagnostics, harness-git-workflow, harness-roadmap, harness-pre-commit-review
4. Add `internal: true` to: harness-align-documentation, harness-validate-context-engineering, harness-check-mechanical-constraints, harness-parallel-agents, harness-state-management, harness-knowledge-mapper
5. Apply same changes to gemini-cli copies (platform parity).
6. Run: `npx vitest run agents/skills/tests/`
7. Run: `harness validate`
8. Commit: `feat(skills): add tier classification to all 49 existing skill.yaml files`
