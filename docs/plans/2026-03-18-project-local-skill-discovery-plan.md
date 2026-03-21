# Plan: Project-Local Skill Discovery

**Date:** 2026-03-18
**Spec:** docs/changes/project-local-skill-discovery/proposal.md
**Estimated tasks:** 7
**Estimated time:** 14-25 minutes

## Goal

When `harness generate-slash-commands` is run in a project with local skills, it discovers and generates slash commands for those skills. `--include-global` merges built-in skills. `harness create-skill` scaffolds for both platforms.

## Observable Truths (Acceptance Criteria)

1. When `generateSlashCommands()` is called with a project containing `agents/skills/claude-code/my-skill/skill.yaml`, the result includes a slash command for `my-skill`
2. When `generateSlashCommands()` is called in a project with no `agents/skills/` and no `--include-global`, the result contains zero specs
3. When `--include-global` is passed, both project and global built-in skills appear in the results
4. When a project skill and global skill share the same normalized name, the project version wins and the global is dropped
5. When run outside any project context (no `agents/skills/` found), behavior falls back to global skills (backward compat)
6. `generateSkillFiles()` produces `skill.yaml` with `platforms: [claude-code, gemini-cli]`
7. `--skills-dir` still overrides all discovery
8. `--dry-run` output includes `source` field per spec
9. All existing integration tests pass
10. `harness validate` passes

## File Map

- MODIFY `packages/cli/src/utils/paths.ts`
- MODIFY `packages/cli/src/slash-commands/types.ts`
- MODIFY `packages/cli/src/slash-commands/normalize.ts`
- MODIFY `packages/cli/src/commands/generate-slash-commands.ts`
- MODIFY `packages/cli/src/commands/create-skill.ts`
- MODIFY `packages/mcp-server/src/tools/generate-slash-commands.ts`
- MODIFY `packages/cli/tests/slash-commands/integration.test.ts`

## Tasks

### Task 1: Split skill resolution in `paths.ts`

**Depends on:** none
**Files:** `packages/cli/src/utils/paths.ts`

1. Add two new exported functions after `resolveSkillsDir`:

```typescript
/**
 * Resolve project-level skills directory by walking up from cwd.
 * Returns null if no project agents/skills/ directory is found.
 */
export function resolveProjectSkillsDir(cwd?: string): string | null {
  let dir = cwd ?? process.cwd();
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, 'agents', 'skills', 'claude-code');
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Resolve the global (bundled) skills directory shipped with the CLI package.
 */
export function resolveGlobalSkillsDir(): string {
  const agentsDir = findUpDir('agents', 'skills');
  if (agentsDir) {
    return path.join(agentsDir, 'skills', 'claude-code');
  }
  return path.join(__dirname, 'agents', 'skills', 'claude-code');
}
```

2. Run test: `npx vitest run packages/cli/tests/slash-commands/integration.test.ts`
3. Observe: all existing tests pass (no callers changed yet)
4. Run: `harness validate`
5. Commit: `feat(cli): add resolveProjectSkillsDir and resolveGlobalSkillsDir`

---

### Task 2: Add `source` and `skillsBaseDir` to types

**Depends on:** none (parallel with Task 1)
**Files:** `packages/cli/src/slash-commands/types.ts`

1. Add `skillsBaseDir` and `source` fields to `SlashCommandSpec`:

```typescript
export interface SlashCommandSpec {
  name: string;
  namespace: string;
  fullName: string;
  description: string;
  version: string;
  cognitiveMode?: string;
  tools: string[];
  args: SkillArg[];
  skillYamlName: string;
  sourceDir: string;
  skillsBaseDir: string;
  source?: 'project' | 'global';

  prompt: {
    context: string;
    objective: string;
    executionContext: string;
    process: string;
  };
}
```

2. Add `includeGlobal` to `GenerateOptions`:

```typescript
export interface GenerateOptions {
  platforms: Platform[];
  global: boolean;
  includeGlobal: boolean;
  output?: string;
  skillsDir: string;
  dryRun: boolean;
  yes: boolean;
}
```

3. Commit: `feat(cli): add source, skillsBaseDir, and includeGlobal to types`

---

### Task 3: Multi-directory support in `normalize.ts`

**Depends on:** Task 2
**Files:** `packages/cli/src/slash-commands/normalize.ts`

1. Add `SkillSource` interface and change `normalizeSkills` signature to accept `SkillSource[]`:

```typescript
export interface SkillSource {
  dir: string;
  source: 'project' | 'global';
}

export function normalizeSkills(
  skillSources: SkillSource[],
  platforms: Platform[]
): SlashCommandSpec[] {
```

2. Add outer loop over `skillSources`, scanning each directory
3. Change collision handling:
   - Same source collision: throw error (existing behavior)
   - Different source collision: first source wins (skip the later one via `continue`)
4. Add `skillsBaseDir: skillsDir` and `source` to each pushed spec
5. Handle non-existent directories gracefully with `if (!fs.existsSync(skillsDir)) continue;`
6. Run: `npx vitest run packages/cli/tests/slash-commands/integration.test.ts` (expect compile errors — fixed in Task 4)
7. Commit: `feat(cli): normalizeSkills accepts multiple skill sources with collision handling`

---

### Task 4: Wire up `generate-slash-commands.ts`

**Depends on:** Tasks 1, 2, 3
**Files:** `packages/cli/src/commands/generate-slash-commands.ts`

1. Update imports — replace `resolveSkillsDir` with `resolveProjectSkillsDir, resolveGlobalSkillsDir` and add `SkillSource` type
2. Replace skill resolution in `generateSlashCommands`:
   - If `opts.skillsDir` is set: use it as sole source (`source: 'project'`)
   - Else: try `resolveProjectSkillsDir()`, push if found
   - If `opts.includeGlobal` or no project found: push `resolveGlobalSkillsDir()` (avoiding duplicates)
3. Call `normalizeSkills(skillSources, opts.platforms)` with the array
4. Update Gemini rendering to use `spec.skillsBaseDir` instead of `skillsDir`:
   ```typescript
   const mdPath = path.join(spec.skillsBaseDir, spec.sourceDir, 'SKILL.md');
   const yamlPath = path.join(spec.skillsBaseDir, spec.sourceDir, 'skill.yaml');
   ```
5. Add `--include-global` CLI option:
   ```typescript
   .option('--include-global', 'Include built-in global skills alongside project skills', false)
   ```
6. Pass `includeGlobal: opts.includeGlobal` in the action handler
7. Run: `npx vitest run packages/cli/tests/slash-commands/integration.test.ts`
8. Observe: existing tests pass (they use `--skills-dir` which overrides)
9. Run: `harness validate`
10. Commit: `feat(cli): generate-slash-commands discovers project-local skills by default`

---

### Task 5: Default both platforms in `create-skill.ts`

**Depends on:** none (parallel with Tasks 1-4)
**Files:** `packages/cli/src/commands/create-skill.ts`

1. Change line 34 in `buildSkillYaml`:
   - Before: `platforms: ['claude-code'],`
   - After: `platforms: ['claude-code', 'gemini-cli'],`
2. Run: `npx vitest run packages/cli/tests/commands/create-skill.test.ts`
3. Update test assertion if it checks for `platforms: ['claude-code']`
4. Run: `harness validate`
5. Commit: `fix(cli): create-skill scaffolds for both claude-code and gemini-cli platforms`

---

### Task 6: Add `includeGlobal` to MCP tool

**Depends on:** Task 4
**Files:** `packages/mcp-server/src/tools/generate-slash-commands.ts`

1. Add `includeGlobal` property to `inputSchema.properties`:
   ```typescript
   includeGlobal: {
     type: 'boolean',
     description: 'Include built-in global skills alongside project skills',
   },
   ```
2. Add `includeGlobal?: boolean` to handler input type
3. Pass `includeGlobal: input.includeGlobal ?? false` to `generateSlashCommands()`
4. Run: `harness validate`
5. Commit: `feat(mcp): add includeGlobal param to generate_slash_commands tool`

---

### Task 7: Integration tests for project-local discovery

**Depends on:** Tasks 1-4
**Files:** `packages/cli/tests/slash-commands/integration.test.ts`

1. Add `includeGlobal: false` to all existing `generateSlashCommands()` calls
2. Add new `describe('project-local skill discovery')` block with tests:
   - Discovers skills from explicit `skillsDir`
   - `includeGlobal` merges project and global skills
   - Project skill shadows global skill on name collision (test `normalizeSkills` directly)
3. Run: `npx vitest run packages/cli/tests/slash-commands/integration.test.ts`
4. Observe: all tests pass
5. Run: `harness validate`
6. Commit: `test(cli): add integration tests for project-local skill discovery`

## Task Sequencing

```
Task 1 (paths.ts) ──────┐
Task 2 (types.ts) ──────┤
Task 5 (create-skill) ──┤── parallel
                         │
Task 3 (normalize.ts) ──── depends on Task 2
Task 4 (generate-cmd) ──── depends on Tasks 1, 2, 3
Task 6 (MCP tool) ──────── depends on Task 4
Task 7 (tests) ─────────── depends on Tasks 1-4
```
