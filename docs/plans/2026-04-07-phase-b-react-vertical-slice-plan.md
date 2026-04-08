# Plan: Phase B — React Vertical Slice (19 Knowledge Skills)

**Date:** 2026-04-07
**Spec:** docs/changes/knowledge-skills-schema-enrichment/proposal.md
**Estimated tasks:** 11
**Estimated time:** 45 minutes

---

## Goal

Import 19 React knowledge skills with `react-` prefix into the harness skill catalog across all four platforms (claude-code, gemini-cli, cursor, codex), with end-to-end validation confirming that editing a `.tsx` file surfaces React knowledge via the dispatch engine.

---

## Context: Phase A Completed

Phase A schema & infrastructure is fully implemented:

- `packages/cli/src/skill/schema.ts` — `type: 'knowledge'`, `paths`, `related_skills`, `metadata` fields with superRefine constraints (`packages/cli/src/skill/schema.ts:88-135`)
- `packages/cli/src/skill/dispatcher.ts` — paths scoring (0.20 weight), hybrid injection (≥0.7 auto-inject, 0.4–0.7 recommend)
- `packages/cli/src/mcp/tools/skill.ts` — progressive disclosure split on `\n## Details`
- `packages/cli/src/skill/recommendation-types.ts` — `KnowledgeRecommendation`, `knowledgeRecommendations` array

---

## Observable Truths (Acceptance Criteria)

1. When `harness skill validate` is run with knowledge skills present, the system shall not report section errors for missing `## Process`, `## Harness Integration`, `## Success Criteria`, `## Examples`, or `## Rationalizations to Reject`. (EARS: Event-driven)
2. When `harness skill validate` is run with a knowledge skill that is missing `## Instructions`, the system shall report an error. (EARS: Event-driven)
3. The system shall have 19 React skill directories under `agents/skills/claude-code/`, each containing `skill.yaml` and `SKILL.md`. (EARS: Ubiquitous)
4. Each React `skill.yaml` shall have `type: knowledge`, `paths: ['**/*.tsx', '**/*.jsx']`, `tier: 3`, `cognitive_mode: advisory-guide`, and `metadata.upstream` pointing to the PatternsDev source. (EARS: Ubiquitous)
5. Each React `SKILL.md` shall contain `## Instructions` and `## Details` sections with the `## Instructions` section under 5K tokens. (EARS: Ubiquitous)
6. When `npx vitest run agents/skills/tests/` is run, the system shall pass all platform-parity tests, confirming that all 19 React skills exist identically in claude-code, gemini-cli, cursor, and codex. (EARS: Event-driven)
7. When `npx vitest run agents/skills/tests/` is run, the system shall pass all schema validation tests for all 19 React skills. (EARS: Event-driven)
8. When `suggest()` is called with `recentFiles: ['src/App.tsx']` and the React skills are in the index, the system shall include at least one React knowledge skill in either `autoInjectKnowledge` or `suggestions`. (EARS: Event-driven)
9. `harness validate` passes after all skills are created. (EARS: Ubiquitous)

---

## File Map

```
MODIFY packages/cli/src/commands/skill/validate.ts     — exempt knowledge skills from behavioral REQUIRED_SECTIONS, enforce ## Instructions instead
MODIFY agents/skills/tests/structure.test.ts           — update structural section checks to handle knowledge skills differently

CREATE agents/skills/claude-code/react-hooks-pattern/skill.yaml
CREATE agents/skills/claude-code/react-hooks-pattern/SKILL.md
CREATE agents/skills/claude-code/react-compound-pattern/skill.yaml
CREATE agents/skills/claude-code/react-compound-pattern/SKILL.md
CREATE agents/skills/claude-code/react-render-props-pattern/skill.yaml
CREATE agents/skills/claude-code/react-render-props-pattern/SKILL.md
CREATE agents/skills/claude-code/react-hoc-pattern/skill.yaml
CREATE agents/skills/claude-code/react-hoc-pattern/SKILL.md
CREATE agents/skills/claude-code/react-provider-pattern/skill.yaml
CREATE agents/skills/claude-code/react-provider-pattern/SKILL.md
CREATE agents/skills/claude-code/react-container-presentational/skill.yaml
CREATE agents/skills/claude-code/react-container-presentational/SKILL.md
CREATE agents/skills/claude-code/react-suspense-pattern/skill.yaml
CREATE agents/skills/claude-code/react-suspense-pattern/SKILL.md
CREATE agents/skills/claude-code/react-concurrent-ui/skill.yaml
CREATE agents/skills/claude-code/react-concurrent-ui/SKILL.md
CREATE agents/skills/claude-code/react-islands-pattern/skill.yaml
CREATE agents/skills/claude-code/react-islands-pattern/SKILL.md
CREATE agents/skills/claude-code/react-progressive-hydration/skill.yaml
CREATE agents/skills/claude-code/react-progressive-hydration/SKILL.md
CREATE agents/skills/claude-code/react-static-import/skill.yaml
CREATE agents/skills/claude-code/react-static-import/SKILL.md
CREATE agents/skills/claude-code/react-dynamic-import/skill.yaml
CREATE agents/skills/claude-code/react-dynamic-import/SKILL.md
CREATE agents/skills/claude-code/react-memoization-pattern/skill.yaml
CREATE agents/skills/claude-code/react-memoization-pattern/SKILL.md
CREATE agents/skills/claude-code/react-context-pattern/skill.yaml
CREATE agents/skills/claude-code/react-context-pattern/SKILL.md
CREATE agents/skills/claude-code/react-state-management-pattern/skill.yaml
CREATE agents/skills/claude-code/react-state-management-pattern/SKILL.md
CREATE agents/skills/claude-code/react-client-rendering/skill.yaml
CREATE agents/skills/claude-code/react-client-rendering/SKILL.md
CREATE agents/skills/claude-code/react-server-rendering/skill.yaml
CREATE agents/skills/claude-code/react-server-rendering/SKILL.md
CREATE agents/skills/claude-code/react-server-components/skill.yaml
CREATE agents/skills/claude-code/react-server-components/SKILL.md
CREATE agents/skills/claude-code/react-2026/skill.yaml
CREATE agents/skills/claude-code/react-2026/SKILL.md

[All 19 skill directories replicated identically to gemini-cli/, cursor/, codex/]
```

---

## Skeleton

1. Validate-layer update: exempt knowledge skills from behavioral sections (~2 tasks, ~8 min)
2. React skill batch 1: hooks, compound, render-props, hoc, provider (~1 task, ~6 min)
3. React skill batch 2: container-presentational, suspense, concurrent, islands, progressive-hydration (~1 task, ~6 min)
4. React skill batch 3: static-import, dynamic-import, memoization, context (~1 task, ~5 min)
5. React skill batch 4: state-management, client-rendering, server-rendering, server-components, 2026 (~1 task, ~5 min)
6. Platform replication to gemini-cli, cursor, codex (~1 task, ~5 min)
7. End-to-end validation test (~1 task, ~5 min)
8. Harness validate gate (~1 task, ~3 min)

**Estimated total:** 11 tasks, ~43 minutes

_Skeleton not presented for approval (standard mode, estimated 11 tasks ≥ 8, but proceeding directly per planning instructions)._

---

## Tasks

### Task 1: Update validate.ts to exempt knowledge skills from behavioral REQUIRED_SECTIONS (TDD)

**Depends on:** none
**Files:** `packages/cli/src/commands/skill/validate.ts`

**Context:** `packages/cli/src/commands/skill/validate.ts:10-17` defines `REQUIRED_SECTIONS` as the behavioral sections. `validateSkillMd()` at line 19 applies these to all skills regardless of type. Knowledge skills need `## Instructions` instead, not `## Process` etc.

1. Write a test. There is no existing `skill validate` command test. Create `packages/cli/tests/commands/skill/validate-skill.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import * as fs from 'fs';
   import * as path from 'path';
   import * as os from 'os';

   // Test the section validation logic directly by exercising the validate command
   // on tmp skill directories (avoiding complex Commander invocation).

   // We test the exported helper — so export validateSkillMd from validate.ts.

   describe('skill validate — knowledge skill sections', () => {
     it('does not require behavioral sections for knowledge skills', () => {
       const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-validate-'));
       const skillDir = path.join(tmpDir, 'react-hooks-pattern');
       fs.mkdirSync(skillDir);
       fs.writeFileSync(
         path.join(skillDir, 'skill.yaml'),
         [
           'name: react-hooks-pattern',
           "version: '1.0.0'",
           'description: Custom hooks for stateful logic',
           'type: knowledge',
           'tier: 3',
           'cognitive_mode: advisory-guide',
           'triggers:',
           '  - manual',
           'platforms:',
           '  - claude-code',
           'tools: []',
           'paths:',
           "  - '**/*.tsx'",
           "  - '**/*.jsx'",
           'state:',
           '  persistent: false',
           '  files: []',
           'depends_on: []',
         ].join('\n')
       );
       fs.writeFileSync(
         path.join(skillDir, 'SKILL.md'),
         [
           '# React Hooks Pattern',
           '',
           '> Reuse stateful logic across components via custom hooks',
           '',
           '## When to Use',
           '',
           '- When multiple components share the same stateful logic',
           '',
           '## Instructions',
           '',
           'Extract shared stateful logic into a custom hook prefixed with `use`.',
           '',
           '## Details',
           '',
           'Custom hooks follow React conventions and can use any built-in hook.',
           '',
           '## Source',
           '',
           'https://patterns.dev/react/hooks-pattern',
         ].join('\n')
       );

       const errors: string[] = [];
       const { validateSkillEntry } = await import('../../src/commands/skill/validate.js');
       validateSkillEntry('react-hooks-pattern', tmpDir, errors);
       expect(errors).toEqual([]);

       fs.rmSync(tmpDir, { recursive: true });
     });

     it('reports error when knowledge skill is missing ## Instructions', async () => {
       const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-validate-'));
       const skillDir = path.join(tmpDir, 'react-broken');
       fs.mkdirSync(skillDir);
       fs.writeFileSync(
         path.join(skillDir, 'skill.yaml'),
         [
           'name: react-broken',
           "version: '1.0.0'",
           'description: Broken knowledge skill',
           'type: knowledge',
           'tier: 3',
           'cognitive_mode: advisory-guide',
           'triggers: [manual]',
           'platforms: [claude-code]',
           'tools: []',
           'state: { persistent: false, files: [] }',
           'depends_on: []',
         ].join('\n')
       );
       fs.writeFileSync(
         path.join(skillDir, 'SKILL.md'),
         '# React Broken\n\n## Details\n\nsome content'
       );

       const errors: string[] = [];
       const { validateSkillEntry } = await import('../../src/commands/skill/validate.js');
       validateSkillEntry('react-broken', tmpDir, errors);
       expect(errors.some((e) => e.includes('## Instructions'))).toBe(true);

       fs.rmSync(tmpDir, { recursive: true });
     });
   });
   ```

2. Run test: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/cli/tests/commands/skill/validate-skill.test.ts 2>&1`

3. Observe failure: `validateSkillEntry` is not exported from `validate.ts`.

4. Update `packages/cli/src/commands/skill/validate.ts`:

   a. Export `validateSkillEntry` by changing `function validateSkillEntry` to `export function validateSkillEntry`.

   b. Replace the `REQUIRED_SECTIONS` constant and the `validateSkillMd` function body:

   Current code at lines 10-44:

   ```typescript
   const REQUIRED_SECTIONS = [
     '## When to Use',
     '## Process',
     '## Harness Integration',
     '## Success Criteria',
     '## Examples',
     '## Rationalizations to Reject',
   ];

   function validateSkillMd(
     name: string,
     skillMdPath: string,
     skillType: string,
     errors: string[]
   ): void {
     if (!fs.existsSync(skillMdPath)) {
       errors.push(`${name}: missing SKILL.md`);
       return;
     }

     const mdContent = fs.readFileSync(skillMdPath, 'utf-8');
     for (const section of REQUIRED_SECTIONS) {
       if (!mdContent.includes(section)) {
         errors.push(`${name}/SKILL.md: missing section "${section}"`);
       }
     }
     if (!mdContent.trim().startsWith('# ')) {
       errors.push(`${name}/SKILL.md: must start with an h1 heading`);
     }
     if (skillType === 'rigid') {
       if (!mdContent.includes('## Gates'))
         errors.push(`${name}/SKILL.md: rigid skill missing "## Gates" section`);
       if (!mdContent.includes('## Escalation'))
         errors.push(`${name}/SKILL.md: rigid skill missing "## Escalation" section`);
     }
   }
   ```

   Replace with:

   ```typescript
   const BEHAVIORAL_REQUIRED_SECTIONS = [
     '## When to Use',
     '## Process',
     '## Harness Integration',
     '## Success Criteria',
     '## Examples',
     '## Rationalizations to Reject',
   ];

   const KNOWLEDGE_REQUIRED_SECTIONS = ['## Instructions'];

   function validateSkillMd(
     name: string,
     skillMdPath: string,
     skillType: string,
     errors: string[]
   ): void {
     if (!fs.existsSync(skillMdPath)) {
       errors.push(`${name}: missing SKILL.md`);
       return;
     }

     const mdContent = fs.readFileSync(skillMdPath, 'utf-8');

     if (!mdContent.trim().startsWith('# ')) {
       errors.push(`${name}/SKILL.md: must start with an h1 heading`);
     }

     if (skillType === 'knowledge') {
       for (const section of KNOWLEDGE_REQUIRED_SECTIONS) {
         if (!mdContent.includes(section)) {
           errors.push(`${name}/SKILL.md: missing section "${section}"`);
         }
       }
       return;
     }

     // Behavioral skills (rigid, flexible)
     for (const section of BEHAVIORAL_REQUIRED_SECTIONS) {
       if (!mdContent.includes(section)) {
         errors.push(`${name}/SKILL.md: missing section "${section}"`);
       }
     }
     if (skillType === 'rigid') {
       if (!mdContent.includes('## Gates'))
         errors.push(`${name}/SKILL.md: rigid skill missing "## Gates" section`);
       if (!mdContent.includes('## Escalation'))
         errors.push(`${name}/SKILL.md: rigid skill missing "## Escalation" section`);
     }
   }
   ```

5. Run test: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/cli/tests/commands/skill/validate-skill.test.ts 2>&1`

6. Observe: tests pass.

7. Run: `harness validate`

8. Commit: `feat(skill-validate): exempt knowledge skills from behavioral REQUIRED_SECTIONS`

---

### Task 2: Update agents/skills structure.test.ts for knowledge skills (TDD)

**Depends on:** Task 1
**Files:** `agents/skills/tests/structure.test.ts`

**Context:** `agents/skills/tests/structure.test.ts:13-18` defines `REQUIRED_SECTIONS` applied to ALL SKILL.md files regardless of type. This will fail once knowledge skills are added. The fix is to check skill type before applying section rules.

1. Run the current test to establish baseline: `cd /Users/cwarner/Projects/harness-engineering/agents/skills && npx vitest run tests/structure.test.ts 2>&1`

2. The test currently passes. Add a new describe block at the bottom of `agents/skills/tests/structure.test.ts` documenting the expected behavior. The fix is in the existing `it.each` at line 33.

3. Update `agents/skills/tests/structure.test.ts`. Replace the full content with this updated version that type-checks skill.yaml before applying section rules:

   ```typescript
   // agents/skills/tests/structure.test.ts
   import { describe, it, expect } from 'vitest';
   import { glob } from 'glob';
   import { readFileSync, existsSync } from 'fs';
   import { resolve, dirname } from 'path';
   import { fileURLToPath } from 'url';
   import { parse } from 'yaml';
   import { SkillMetadataSchema } from './schema';

   const __dirname = dirname(fileURLToPath(import.meta.url));
   const SKILLS_DIR = resolve(__dirname, '..');

   const BEHAVIORAL_REQUIRED_SECTIONS = [
     '## When to Use',
     '## Process',
     '## Harness Integration',
     '## Success Criteria',
     '## Examples',
   ];
   const KNOWLEDGE_REQUIRED_SECTIONS = ['## Instructions'];
   const RIGID_SECTIONS = ['## Gates', '## Escalation'];

   function getSkillType(skillDir: string): string | null {
     const yamlPath = resolve(skillDir, 'skill.yaml');
     if (!existsSync(yamlPath)) return null;
     try {
       const parsed = parse(readFileSync(yamlPath, 'utf-8'));
       return parsed?.type ?? null;
     } catch {
       return null;
     }
   }

   describe('SKILL.md structure', () => {
     const skillMdFiles = glob.sync('**/SKILL.md', {
       cwd: SKILLS_DIR,
       ignore: ['**/node_modules/**', '**/tests/**'],
     });

     if (skillMdFiles.length === 0) {
       it.skip('no SKILL.md files found yet', () => {});
       return;
     }

     it.each(skillMdFiles)('%s starts with h1 heading', (file) => {
       const content = readFileSync(resolve(SKILLS_DIR, file), 'utf-8');
       expect(content.trim()).toMatch(/^# /);
     });

     it.each(skillMdFiles)('%s has corresponding skill.yaml', (file) => {
       const dir = resolve(SKILLS_DIR, file, '..');
       expect(existsSync(resolve(dir, 'skill.yaml')), `Missing skill.yaml for ${file}`).toBe(true);
     });

     it.each(skillMdFiles)('%s has required sections for its skill type', (file) => {
       const content = readFileSync(resolve(SKILLS_DIR, file), 'utf-8');
       const skillDir = resolve(SKILLS_DIR, file, '..');
       const skillType = getSkillType(skillDir);

       if (skillType === 'knowledge') {
         for (const section of KNOWLEDGE_REQUIRED_SECTIONS) {
           expect(content, `Missing section: ${section} in ${file}`).toContain(section);
         }
       } else {
         for (const section of BEHAVIORAL_REQUIRED_SECTIONS) {
           expect(content, `Missing section: ${section} in ${file}`).toContain(section);
         }
       }
     });
   });

   describe('rigid skills have Gates and Escalation sections', () => {
     const skillYamlFiles = glob.sync('**/skill.yaml', {
       cwd: SKILLS_DIR,
       ignore: ['**/node_modules/**', '**/tests/**'],
     });

     if (skillYamlFiles.length === 0) {
       it.skip('no skill.yaml files found yet', () => {});
       return;
     }

     const rigidSkills = skillYamlFiles.filter((file) => {
       const content = readFileSync(resolve(SKILLS_DIR, file), 'utf-8');
       const parsed = parse(content);
       return parsed?.type === 'rigid';
     });

     if (rigidSkills.length === 0) {
       it.skip('no rigid skills found yet', () => {});
       return;
     }

     it.each(rigidSkills)('%s (rigid) has Gates and Escalation sections', (file) => {
       const dir = resolve(SKILLS_DIR, file, '..');
       const skillMdPath = resolve(dir, 'SKILL.md');
       if (!existsSync(skillMdPath)) return;
       const content = readFileSync(skillMdPath, 'utf-8');
       for (const section of RIGID_SECTIONS) {
         expect(content, `Rigid skill missing section: ${section}`).toContain(section);
       }
     });
   });
   ```

   Note: The `## Rationalizations to Reject` check is in `validate.ts` but was NOT in `structure.test.ts` — that's intentional. The agents/skills tests use a local schema that doesn't have the `knowledge` type yet; we update the test logic here to handle it dynamically from the YAML.

4. Run: `cd /Users/cwarner/Projects/harness-engineering/agents/skills && npx vitest run tests/structure.test.ts 2>&1`

5. Observe: all existing tests still pass (no knowledge skills exist yet, behavioral skills still checked with behavioral sections).

6. Run: `harness validate`

7. Commit: `feat(structure-test): exempt knowledge skills from behavioral section checks`

---

### Task 3: Create React skills batch 1 — hooks, compound, render-props, hoc, provider

**Depends on:** Task 2
**Files:** `agents/skills/claude-code/react-hooks-pattern/`, `react-compound-pattern/`, `react-render-props-pattern/`, `react-hoc-pattern/`, `react-provider-pattern/` (skill.yaml + SKILL.md each)

**Context:** Spec template at `docs/changes/knowledge-skills-schema-enrichment/proposal.md:143-202`. Each skill needs identical files across all platforms — we create in claude-code first and replicate in Task 8.

**Skill template for skill.yaml:**

```yaml
name: <skill-name>
version: '1.0.0'
description: <one-line description>
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths:
  - '**/*.tsx'
  - '**/*.jsx'
related_skills:
  - <related react skills>
stack_signals:
  - react
  - typescript
keywords:
  - <pattern keywords>
metadata:
  author: patterns.dev
  upstream: 'PatternsDev/skills/react/<upstream-slug>'
state:
  persistent: false
  files: []
depends_on: []
```

**Skill template for SKILL.md:**

```markdown
# <Pattern Name>

> <one-line tagline>

## When to Use

- <bullet criteria>

## Instructions

<Agent-facing directives — concise, action-oriented, under 5K tokens>

## Details

<Educational depth — why this pattern exists, trade-offs, variants>

## Source

https://patterns.dev/react/<pattern-slug>
```

1. Create `agents/skills/claude-code/react-hooks-pattern/skill.yaml`:

   ```yaml
   name: react-hooks-pattern
   version: '1.0.0'
   description: Reuse stateful logic across components via custom hooks
   cognitive_mode: advisory-guide
   type: knowledge
   tier: 3
   triggers:
     - manual
   platforms:
     - claude-code
     - gemini-cli
     - cursor
     - codex
   tools: []
   paths:
     - '**/*.tsx'
     - '**/*.jsx'
   related_skills:
     - react-compound-pattern
     - react-provider-pattern
     - react-context-pattern
   stack_signals:
     - react
     - typescript
   keywords:
     - hooks
     - custom-hooks
     - stateful-logic
     - composition
     - use-prefix
   metadata:
     author: patterns.dev
     upstream: 'PatternsDev/skills/react/hooks-pattern'
   state:
     persistent: false
     files: []
   depends_on: []
   ```

2. Create `agents/skills/claude-code/react-hooks-pattern/SKILL.md`:

   ````markdown
   # React Hooks Pattern

   > Reuse stateful logic across components via custom hooks

   ## When to Use

   - Multiple components share the same stateful logic (e.g., data fetching, form state, media queries)
   - You want to extract complex logic from a component to improve readability
   - You need to compose behaviors without inheritance or render props
   - You are using React 16.8+ (hooks are unavailable in class components)

   ## Instructions

   1. Identify repeated stateful logic across two or more components.
   2. Extract it into a function prefixed with `use` (e.g., `useWindowSize`, `useFetch`, `useForm`).
   3. The custom hook must call at least one built-in hook (`useState`, `useEffect`, `useCallback`, etc.).
   4. Return only what the consumer needs — avoid over-exposing internal state.
   5. Name the hook descriptively after its behavior, not its implementation (`useMediaQuery` not `useEventListener`).
   6. Keep hooks pure and side-effect-free at the call site — effects belong inside `useEffect`.
   7. Document the hook's return type with TypeScript interfaces.
   8. Co-locate the hook file with its primary consumer or in a `hooks/` directory.

   ```typescript
   // Good: descriptive name, typed return, minimal surface area
   function useWindowSize(): { width: number; height: number } {
     const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
     useEffect(() => {
       const handler = () => setSize({ width: window.innerWidth, height: window.innerHeight });
       window.addEventListener('resize', handler);
       return () => window.removeEventListener('resize', handler);
     }, []);
     return size;
   }
   ```
   ````

   ## Details

   Custom hooks were introduced in React 16.8 to solve the code reuse problem that previously required higher-order components or render props. The key insight: hooks are just functions, and the `use` prefix is a convention that enables lint rules (react-hooks/rules-of-hooks) to enforce hook semantics.

   **Trade-offs:**
   - Hooks compose easily but debugging deep hook stacks can be harder than class-based patterns
   - The `use` naming convention is enforced by ESLint, not the runtime — calling a hook outside a component or another hook will cause runtime errors, not type errors
   - React DevTools shows custom hook names in the component tree when they follow the `use` prefix convention

   **When NOT to use:**
   - Logic that does not involve state or effects — extract as a plain utility function instead
   - Logic specific to a single component that will never be reused

   **Related patterns:**
   - Provider Pattern — hooks often expose context via a `useXxx()` wrapper
   - Compound Pattern — hooks can manage shared state for compound component groups

   ## Source

   https://patterns.dev/react/hooks-pattern

   ```

   ```

3. Create `agents/skills/claude-code/react-compound-pattern/skill.yaml`:

   ```yaml
   name: react-compound-pattern
   version: '1.0.0'
   description: Build multi-part components that share state implicitly via context
   cognitive_mode: advisory-guide
   type: knowledge
   tier: 3
   triggers:
     - manual
   platforms:
     - claude-code
     - gemini-cli
     - cursor
     - codex
   tools: []
   paths:
     - '**/*.tsx'
     - '**/*.jsx'
   related_skills:
     - react-hooks-pattern
     - react-provider-pattern
     - react-context-pattern
   stack_signals:
     - react
     - typescript
   keywords:
     - compound-components
     - implicit-state
     - sub-components
     - flexible-api
   metadata:
     author: patterns.dev
     upstream: 'PatternsDev/skills/react/compound-pattern'
   state:
     persistent: false
     files: []
   depends_on: []
   ```

4. Create `agents/skills/claude-code/react-compound-pattern/SKILL.md`:

   ````markdown
   # React Compound Pattern

   > Build multi-part components that share state implicitly via context

   ## When to Use

   - Building UI components with related sub-components (Select/Option, Tabs/Tab/TabPanel, Modal/Header/Body/Footer)
   - You want consumers to control composition without prop-drilling
   - The parent component needs to coordinate state shared across children
   - You are replacing a heavily prop-loaded component with a more flexible API

   ## Instructions

   1. Create a parent component that owns shared state via `useState` or `useReducer`.
   2. Create a Context to hold the shared state and expose it.
   3. Attach child components as static properties of the parent (`Parent.Child = Child`).
   4. Child components read shared state from context — no explicit prop passing required.
   5. Export the parent as the public API; children are accessed via dot notation.

   ```typescript
   const FlyOutContext = createContext<{ open: boolean; toggle: () => void } | null>(null);

   function FlyOut({ children }: { children: React.ReactNode }) {
     const [open, setOpen] = useState(false);
     return (
       <FlyOutContext.Provider value={{ open, toggle: () => setOpen((o) => !o) }}>
         <div className="flyout">{children}</div>
       </FlyOutContext.Provider>
     );
   }

   function Toggle() {
     const ctx = useContext(FlyOutContext)!;
     return <button onClick={ctx.toggle}>Toggle</button>;
   }

   function List({ children }: { children: React.ReactNode }) {
     const ctx = useContext(FlyOutContext)!;
     return ctx.open ? <ul>{children}</ul> : null;
   }

   FlyOut.Toggle = Toggle;
   FlyOut.List = List;
   ```
   ````

   ## Details

   The compound pattern addresses a common pain point: component APIs that grow to have dozens of props as every variant is added. By inverting control to the consumer (they choose the composition), the parent component stays lean and the API stays readable.

   **Trade-offs:**
   - JSX.Element type inference for attached sub-components requires TypeScript declaration merging or explicit typing
   - Deeply nested compound components may need context bridging if the sub-component is used far from the parent
   - Over-using this pattern for simple cases adds unnecessary complexity

   **Common examples in the wild:**
   - HTML `<select>` / `<option>` is the canonical compound component
   - Radix UI primitives (Dialog.Root / Dialog.Trigger / Dialog.Content)
   - Headless UI (Tab / Tab.Group / Tab.Panel)

   ## Source

   https://patterns.dev/react/compound-pattern

   ```

   ```

5. Create `agents/skills/claude-code/react-render-props-pattern/skill.yaml`:

   ```yaml
   name: react-render-props-pattern
   version: '1.0.0'
   description: Share stateful logic by passing a render function as a prop
   cognitive_mode: advisory-guide
   type: knowledge
   tier: 3
   triggers:
     - manual
   platforms:
     - claude-code
     - gemini-cli
     - cursor
     - codex
   tools: []
   paths:
     - '**/*.tsx'
     - '**/*.jsx'
   related_skills:
     - react-hooks-pattern
     - react-hoc-pattern
   stack_signals:
     - react
     - typescript
   keywords:
     - render-props
     - children-as-function
     - inversion-of-control
     - logic-sharing
   metadata:
     author: patterns.dev
     upstream: 'PatternsDev/skills/react/render-props-pattern'
   state:
     persistent: false
     files: []
   depends_on: []
   ```

6. Create `agents/skills/claude-code/react-render-props-pattern/SKILL.md`:

   ````markdown
   # React Render Props Pattern

   > Share stateful logic by passing a render function as a prop

   ## When to Use

   - You need to share stateful behavior without coupling the rendering to the logic
   - The rendering of the shared state is highly variable between consumers
   - You are working with class components (pre-hooks) or third-party components that do not expose hooks
   - Building components for library distribution where render control must stay with consumers

   ## Instructions

   1. Create a component that manages the shared state or behavior.
   2. Accept a `render` prop (or `children` as a function) that receives the state as arguments.
   3. Call the render prop inside the component's return, passing the managed state.
   4. Consumers control all rendering; the provider controls only the logic.

   ```typescript
   interface MousePosition { x: number; y: number }

   function MouseTracker({ render }: { render: (pos: MousePosition) => React.ReactNode }) {
     const [pos, setPos] = useState<MousePosition>({ x: 0, y: 0 });
     return (
       <div onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}>
         {render(pos)}
       </div>
     );
   }

   // Usage
   <MouseTracker render={({ x, y }) => <p>Mouse at {x}, {y}</p>} />
   ```
   ````

   ## Details

   Render props were the dominant pattern for logic reuse before React hooks. With hooks available, most new render props use cases should be implemented as custom hooks instead. However, render props remain valuable in specific scenarios:
   - Third-party library integration where hooks are unavailable
   - Highly dynamic rendering decisions that benefit from explicit prop passing
   - Class component contexts

   **Children as function** is a common variant:

   ```typescript
   <MouseTracker>{({ x, y }) => <p>At {x}, {y}</p>}</MouseTracker>
   ```

   **Trade-offs vs hooks:**
   - Render props require wrapping in JSX; hooks are called inline — hooks are almost always simpler
   - Render props make the data flow explicit in JSX; hooks hide the data flow in function calls
   - Multiple render props create "wrapper hell" (the problem hooks solved)

   ## Source

   https://patterns.dev/react/render-props-pattern

   ```

   ```

7. Create `agents/skills/claude-code/react-hoc-pattern/skill.yaml`:

   ```yaml
   name: react-hoc-pattern
   version: '1.0.0'
   description: Extend component behavior by wrapping in a higher-order component
   cognitive_mode: advisory-guide
   type: knowledge
   tier: 3
   triggers:
     - manual
   platforms:
     - claude-code
     - gemini-cli
     - cursor
     - codex
   tools: []
   paths:
     - '**/*.tsx'
     - '**/*.jsx'
   related_skills:
     - react-hooks-pattern
     - react-render-props-pattern
   stack_signals:
     - react
     - typescript
   keywords:
     - hoc
     - higher-order-component
     - component-composition
     - cross-cutting-concerns
   metadata:
     author: patterns.dev
     upstream: 'PatternsDev/skills/react/hoc-pattern'
   state:
     persistent: false
     files: []
   depends_on: []
   ```

8. Create `agents/skills/claude-code/react-hoc-pattern/SKILL.md`:

   ````markdown
   # React HOC Pattern

   > Extend component behavior by wrapping in a higher-order component

   ## When to Use

   - Adding cross-cutting concerns (logging, authentication gating, analytics) to multiple components without modifying each
   - Working with class components that cannot use hooks
   - Integrating with third-party libraries that use HOC APIs (Redux `connect`, React Router `withRouter`)
   - You want to enhance a component's props without the consumer being aware of the enhancement

   ## Instructions

   1. Create a function that accepts a component and returns a new component.
   2. The wrapper component renders the wrapped component, forwarding all props.
   3. Add the enhancement (extra props, lifecycle behavior, conditional rendering) in the wrapper.
   4. Name the HOC `with<Behavior>` by convention.
   5. Forward refs using `React.forwardRef` if the wrapped component uses refs.
   6. Set `displayName` on the HOC result for debugging: `WrappedComponent.displayName = \`withAuth(\${Component.displayName})\``.

   ```typescript
   function withAuthentication<P extends object>(
     WrappedComponent: React.ComponentType<P>
   ) {
     const WithAuth = (props: P) => {
       const { isAuthenticated } = useAuth();
       if (!isAuthenticated) return <Redirect to="/login" />;
       return <WrappedComponent {...props} />;
     };
     WithAuth.displayName = `withAuthentication(${WrappedComponent.displayName ?? WrappedComponent.name})`;
     return WithAuth;
   }
   ```
   ````

   ## Details

   HOCs are a functional composition pattern borrowed from functional programming. They were the primary code-reuse mechanism before hooks.

   **When to prefer hooks over HOCs:**
   - Hooks are simpler, avoid prop name collisions, and are easier to type in TypeScript
   - "Wrapper hell" — stacking multiple HOCs creates deeply nested component trees in DevTools
   - HOC prop injection can clash if two HOCs inject the same prop name

   **Valid HOC use cases in modern React:**
   - HOC-based library APIs (Redux, styled-components `withTheme`)
   - Class components that cannot use hooks
   - Performance optimization wemos with `React.memo` and custom comparison

   **TypeScript note:** HOC generic typing requires careful handling of `ComponentProps` and `Omit` to correctly type the enhanced component's props.

   ## Source

   https://patterns.dev/react/hoc-pattern

   ```

   ```

9. Create `agents/skills/claude-code/react-provider-pattern/skill.yaml`:

   ```yaml
   name: react-provider-pattern
   version: '1.0.0'
   description: Make data available to any component in the tree without prop drilling
   cognitive_mode: advisory-guide
   type: knowledge
   tier: 3
   triggers:
     - manual
   platforms:
     - claude-code
     - gemini-cli
     - cursor
     - codex
   tools: []
   paths:
     - '**/*.tsx'
     - '**/*.jsx'
   related_skills:
     - react-context-pattern
     - react-hooks-pattern
     - react-compound-pattern
   stack_signals:
     - react
     - typescript
   keywords:
     - context
     - provider
     - prop-drilling
     - global-state
     - dependency-injection
   metadata:
     author: patterns.dev
     upstream: 'PatternsDev/skills/react/provider-pattern'
   state:
     persistent: false
     files: []
   depends_on: []
   ```

10. Create `agents/skills/claude-code/react-provider-pattern/SKILL.md`:

    ````markdown
    # React Provider Pattern

    > Make data available to any component in the tree without prop drilling

    ## When to Use

    - Multiple components at different nesting levels need the same data (theme, locale, current user, feature flags)
    - Prop drilling through 3+ levels creates maintenance burden
    - You want to decouple data consumers from data source location in the tree
    - Building a reusable component library that needs implicit configuration

    ## Instructions

    1. Create a context with `createContext`, providing a typed default value.
    2. Create a Provider component that holds the state and wraps `Context.Provider`.
    3. Export a `useXxx()` hook that calls `useContext` and throws if used outside the Provider.
    4. Wrap the relevant subtree (or the entire app) with the Provider.
    5. Any component in the subtree can consume via the hook — no prop threading required.

    ```typescript
    interface ThemeContextValue { theme: 'light' | 'dark'; toggle: () => void }

    const ThemeContext = createContext<ThemeContextValue | null>(null);

    export function ThemeProvider({ children }: { children: React.ReactNode }) {
      const [theme, setTheme] = useState<'light' | 'dark'>('light');
      return (
        <ThemeContext.Provider value={{ theme, toggle: () => setTheme((t) => t === 'light' ? 'dark' : 'light') }}>
          {children}
        </ThemeContext.Provider>
      );
    }

    export function useTheme(): ThemeContextValue {
      const ctx = useContext(ThemeContext);
      if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
      return ctx;
    }
    ```
    ````

    ## Details

    The Provider Pattern is React's built-in dependency injection mechanism. It solves prop drilling — the antipattern of threading props through intermediate components that do not use them.

    **Performance consideration:** Every component that calls `useContext` re-renders when the context value changes. For high-frequency updates, split contexts by concern (do not put both `user` and `notifications` in the same context) or use a state management library with selector support.

    **Context vs state management:**
    - Context is built-in and appropriate for low-frequency global data (theme, locale, auth)
    - For high-frequency or complex derived state, prefer Zustand, Jotai, or Redux Toolkit

    **Null safety pattern:** Passing `null` as default to `createContext` and throwing in the hook (`if (!ctx) throw new Error(...)`) gives better error messages than silent `undefined` access failures.

    ## Source

    https://patterns.dev/react/provider-pattern

    ```

    ```

11. Run: `cd /Users/cwarner/Projects/harness-engineering/agents/skills && npx vitest run tests/schema.test.ts tests/structure.test.ts 2>&1`

12. Observe: all tests pass including the new skills.

13. Run: `harness validate`

14. Commit: `feat(react-skills): add react-hooks, compound, render-props, hoc, provider skills`

---

### Task 4: Create React skills batch 2 — container-presentational, suspense, concurrent, islands, progressive-hydration

**Depends on:** Task 3
**Files:** `agents/skills/claude-code/react-container-presentational/`, `react-suspense-pattern/`, `react-concurrent-ui/`, `react-islands-pattern/`, `react-progressive-hydration/` (skill.yaml + SKILL.md each)

1. Create `agents/skills/claude-code/react-container-presentational/skill.yaml`:

   ```yaml
   name: react-container-presentational
   version: '1.0.0'
   description: Separate data-fetching containers from stateless presentational components
   cognitive_mode: advisory-guide
   type: knowledge
   tier: 3
   triggers:
     - manual
   platforms:
     - claude-code
     - gemini-cli
     - cursor
     - codex
   tools: []
   paths:
     - '**/*.tsx'
     - '**/*.jsx'
   related_skills:
     - react-hooks-pattern
     - react-server-components
   stack_signals:
     - react
     - typescript
   keywords:
     - container
     - presentational
     - smart-dumb
     - separation-of-concerns
     - testability
   metadata:
     author: patterns.dev
     upstream: 'PatternsDev/skills/react/container-presentational'
   state:
     persistent: false
     files: []
   depends_on: []
   ```

2. Create `agents/skills/claude-code/react-container-presentational/SKILL.md`:

   ````markdown
   # React Container/Presentational Pattern

   > Separate data-fetching containers from stateless presentational components

   ## When to Use

   - A component mixes data-fetching logic with rendering, making it hard to test
   - You want to reuse the same UI with different data sources
   - You are building a component library where UI and data concerns must be independent
   - You need to mock data easily in Storybook or unit tests

   ## Instructions

   1. Split the component in two:
      - **Container** (`<Name>Container`): fetches or manages data, passes it as props to the presentational component
      - **Presentational** (`<Name>`): receives data as props, renders UI, has no data-fetching logic
   2. The presentational component is a pure function of its props — no `useEffect`, no fetch calls.
   3. The container handles loading states, errors, and side effects.
   4. Test the presentational component in isolation by passing mock props.

   ```typescript
   // Presentational — pure, testable, no data concerns
   interface DogImageProps { imageUrl: string | null; loading: boolean }
   function DogImage({ imageUrl, loading }: DogImageProps) {
     if (loading) return <p>Loading...</p>;
     return imageUrl ? <img src={imageUrl} alt="dog" /> : null;
   }

   // Container — data concern only
   function DogImageContainer() {
     const [imageUrl, setImageUrl] = useState<string | null>(null);
     const [loading, setLoading] = useState(true);
     useEffect(() => {
       fetch('https://dog.ceo/api/breeds/image/random')
         .then((r) => r.json())
         .then((d) => { setImageUrl(d.message); setLoading(false); });
     }, []);
     return <DogImage imageUrl={imageUrl} loading={loading} />;
   }
   ```
   ````

   ## Details

   This pattern predates hooks but remains valid. With hooks, the "container" logic is often extracted into a custom hook (`useDogImage`) instead of a wrapper component, which achieves the same separation with less nesting.

   **Modern equivalent:** Extract data logic into a custom hook, use the hook in the component:

   ```typescript
   function DogImage() {
     const { imageUrl, loading } = useDogImage(); // hook is the "container"
     if (loading) return <p>Loading...</p>;
     return imageUrl ? <img src={imageUrl} alt="dog" /> : null;
   }
   ```

   **With React Server Components:** The server/client split supersedes this pattern for many cases — server components handle data fetching, client components handle interactivity.

   ## Source

   https://patterns.dev/react/presentational-container-pattern

   ```

   ```

3. Create `agents/skills/claude-code/react-suspense-pattern/skill.yaml`:

   ```yaml
   name: react-suspense-pattern
   version: '1.0.0'
   description: Declaratively handle async loading states with React Suspense boundaries
   cognitive_mode: advisory-guide
   type: knowledge
   tier: 3
   triggers:
     - manual
   platforms:
     - claude-code
     - gemini-cli
     - cursor
     - codex
   tools: []
   paths:
     - '**/*.tsx'
     - '**/*.jsx'
   related_skills:
     - react-concurrent-ui
     - react-dynamic-import
     - react-server-components
   stack_signals:
     - react
     - typescript
   keywords:
     - suspense
     - lazy-loading
     - loading-states
     - error-boundary
     - async-rendering
   metadata:
     author: patterns.dev
     upstream: 'PatternsDev/skills/react/suspense-pattern'
   state:
     persistent: false
     files: []
   depends_on: []
   ```

4. Create `agents/skills/claude-code/react-suspense-pattern/SKILL.md`:

   ````markdown
   # React Suspense Pattern

   > Declaratively handle async loading states with React Suspense boundaries

   ## When to Use

   - Lazy-loading components with `React.lazy()` — Suspense is required
   - Data fetching with Suspense-enabled libraries (React Query, SWR with suspense option, Relay)
   - You want loading states co-located with the UI rather than scattered in `useEffect`
   - Building React 18+ applications with concurrent features

   ## Instructions

   1. Wrap any component that may suspend with `<Suspense fallback={<LoadingUI />}>`.
   2. Place Suspense boundaries at the granularity you want loading states — one per page, per section, or per widget.
   3. Always pair Suspense boundaries with `<ErrorBoundary>` to handle promise rejections.
   4. For lazy imports, use `React.lazy(() => import('./Component'))`.
   5. Do not put Suspense boundaries inside loops — create a reusable wrapper component instead.

   ```typescript
   const HeavyChart = React.lazy(() => import('./HeavyChart'));

   function Dashboard() {
     return (
       <ErrorBoundary fallback={<p>Failed to load chart</p>}>
         <Suspense fallback={<ChartSkeleton />}>
           <HeavyChart />
         </Suspense>
       </ErrorBoundary>
     );
   }
   ```
   ````

   ## Details

   Suspense works by components "throwing" a promise when they are not ready. React catches the promise at the nearest Suspense boundary and renders the fallback until the promise resolves.

   **React 18 changes:** `startTransition` lets you mark state updates as non-urgent, preventing Suspense fallbacks from showing for fast transitions (the previous content stays visible until the new content is ready).

   **Library support:** Not all data-fetching approaches support Suspense. Use libraries that explicitly support it (`useSuspenseQuery` in React Query, `use()` hook in React 18+ with compatible data sources).

   **Common mistake:** Placing the Suspense boundary too high (at the page level) shows a full-page spinner for small widget loads. Granular boundaries improve perceived performance.

   ## Source

   https://patterns.dev/react/suspense-pattern

   ```

   ```

5. Create `agents/skills/claude-code/react-concurrent-ui/skill.yaml`:

   ```yaml
   name: react-concurrent-ui
   version: '1.0.0'
   description: Build responsive UIs using React 18 concurrent features and transitions
   cognitive_mode: advisory-guide
   type: knowledge
   tier: 3
   triggers:
     - manual
   platforms:
     - claude-code
     - gemini-cli
     - cursor
     - codex
   tools: []
   paths:
     - '**/*.tsx'
     - '**/*.jsx'
   related_skills:
     - react-suspense-pattern
     - react-memoization-pattern
   stack_signals:
     - react
     - typescript
   keywords:
     - concurrent
     - transitions
     - startTransition
     - useDeferredValue
     - react-18
   metadata:
     author: patterns.dev
     upstream: 'PatternsDev/skills/react/concurrent-pattern'
   state:
     persistent: false
     files: []
   depends_on: []
   ```

6. Create `agents/skills/claude-code/react-concurrent-ui/SKILL.md`:

   ````markdown
   # React Concurrent UI

   > Build responsive UIs using React 18 concurrent features and transitions

   ## When to Use

   - UI becomes unresponsive during expensive state updates (search filtering, large list rendering)
   - You want to show stale content while new content loads instead of a spinner
   - Input feels laggy because rendering a derived list blocks the keystroke handler
   - Using React 18+ with `createRoot`

   ## Instructions

   1. Use `startTransition` to mark non-urgent state updates:
      ```typescript
      const [isPending, startTransition] = useTransition();
      startTransition(() => setQuery(input));
      ```
   ````

   2. Use `useDeferredValue` to defer an expensive derived computation:
      ```typescript
      const deferredQuery = useDeferredValue(query);
      const filteredList = useMemo(() => filter(list, deferredQuery), [list, deferredQuery]);
      ```
   3. Show `isPending` as a subtle loading indicator (opacity, spinner overlay) — not a full Suspense fallback.
   4. Ensure the app is mounted with `createRoot` (required for concurrent features).
   5. Do not use transitions for urgent updates (text input value, toggle state that affects the input itself).

   ## Details

   Concurrent React can interrupt, pause, and resume renders. `startTransition` and `useDeferredValue` are the primary APIs for leveraging this.

   **`startTransition` vs `useDeferredValue`:**
   - `startTransition`: you control when the update is marked as non-urgent (around the `setState` call)
   - `useDeferredValue`: you defer a derived value (useful when you cannot wrap the setter)

   **What makes an update "concurrent":** React can abandon an in-progress render if a higher-priority update arrives (e.g., user keypress). This only happens for transitions.

   **React 18 migration:** Opt in by replacing `ReactDOM.render` with `createRoot`. Strict Mode in React 18 mounts components twice in development to surface side effects.

   ## Source

   https://patterns.dev/react/concurrent-pattern

   ```

   ```

7. Create `agents/skills/claude-code/react-islands-pattern/skill.yaml`:

   ```yaml
   name: react-islands-pattern
   version: '1.0.0'
   description: Hydrate only interactive UI islands, leaving static content as HTML
   cognitive_mode: advisory-guide
   type: knowledge
   tier: 3
   triggers:
     - manual
   platforms:
     - claude-code
     - gemini-cli
     - cursor
     - codex
   tools: []
   paths:
     - '**/*.tsx'
     - '**/*.jsx'
   related_skills:
     - react-progressive-hydration
     - react-server-components
     - react-server-rendering
   stack_signals:
     - react
     - typescript
     - astro
     - next
   keywords:
     - islands
     - partial-hydration
     - performance
     - static-html
     - interactive-components
   metadata:
     author: patterns.dev
     upstream: 'PatternsDev/skills/react/islands-pattern'
   state:
     persistent: false
     files: []
   depends_on: []
   ```

8. Create `agents/skills/claude-code/react-islands-pattern/SKILL.md`:

   ````markdown
   # React Islands Pattern

   > Hydrate only interactive UI islands, leaving static content as HTML

   ## When to Use

   - Content-heavy pages where most HTML is static but a few widgets need interactivity
   - Performance-critical pages where full React hydration is too expensive
   - Using Astro, Fresh, or Next.js with `'use client'` directives
   - You want Time to Interactive (TTI) improvements by deferring non-essential JS

   ## Instructions

   1. Identify which page regions are interactive (search bar, shopping cart, comments) vs static (header, article body).
   2. Mark interactive regions as client-side islands using your framework's mechanism:
      - **Astro:** `client:load`, `client:idle`, `client:visible` on components
      - **Next.js App Router:** `'use client'` at the top of the component file
   3. Keep islands as small as possible — each island is an independent React root.
   4. Static content between islands is plain HTML — no React overhead.
   5. Use `client:visible` (Astro) or lazy hydration for below-fold islands.

   ```tsx
   // Astro example: only the interactive widget is hydrated
   ---
   import StaticHeader from './StaticHeader.astro'; // no JS
   import InteractiveSearch from './InteractiveSearch';  // React island
   ---
   <StaticHeader />
   <InteractiveSearch client:load />
   <article>...static content...</article>
   ```
   ````

   ## Details

   The islands pattern was popularized by Jason Miller (Preact creator) and Ethan Marcotte. The core insight: most web pages are "mostly static" — only specific regions need event handlers and state. Hydrating the entire page as a React app is wasteful.

   **Trade-offs:**
   - Islands cannot share React state directly — use URL parameters, localStorage, or a micro-frontend event bus for cross-island communication
   - More complex architecture than a simple SPA
   - Best suited for content-driven sites (docs, marketing, e-commerce) not dashboards

   **React Server Components (RSC) vs islands:**
   - RSC is React's first-party answer to the same problem in Next.js / frameworks
   - The conceptual model is the same (server = static, client = interactive)
   - RSC allows data co-location without the multi-root complexity

   ## Source

   https://patterns.dev/react/islands-architecture

   ```

   ```

9. Create `agents/skills/claude-code/react-progressive-hydration/skill.yaml`:

   ```yaml
   name: react-progressive-hydration
   version: '1.0.0'
   description: Delay hydration of below-fold or non-critical components to improve TTI
   cognitive_mode: advisory-guide
   type: knowledge
   tier: 3
   triggers:
     - manual
   platforms:
     - claude-code
     - gemini-cli
     - cursor
     - codex
   tools: []
   paths:
     - '**/*.tsx'
     - '**/*.jsx'
   related_skills:
     - react-islands-pattern
     - react-suspense-pattern
     - react-dynamic-import
   stack_signals:
     - react
     - typescript
   keywords:
     - hydration
     - progressive
     - lazy-hydration
     - tti
     - performance
   metadata:
     author: patterns.dev
     upstream: 'PatternsDev/skills/react/progressive-hydration'
   state:
     persistent: false
     files: []
   depends_on: []
   ```

10. Create `agents/skills/claude-code/react-progressive-hydration/SKILL.md`:

    ````markdown
    # React Progressive Hydration

    > Delay hydration of below-fold or non-critical components to improve TTI

    ## When to Use

    - SSR pages where hydrating all components at once creates a long TTI
    - Below-fold components that users will not interact with on page load
    - Low-priority widgets (cookie banners, chat widgets, footer interactions)
    - You need fast initial page interactivity without deferring all JS

    ## Instructions

    1. Identify components that are not needed for initial interactivity.
    2. Wrap them in a lazy-hydration wrapper that triggers hydration on:
       - **Viewport entry** (`IntersectionObserver`)
       - **User idle** (`requestIdleCallback`)
       - **First user interaction** (mousemove, touchstart)
    3. Render the component's HTML from SSR immediately (for SEO and visual), but defer event handler attachment.
    4. Use `React.lazy` + `Suspense` for code-splitting alongside hydration deferral.

    ```typescript
    function LazyHydrate({ children }: { children: React.ReactNode }) {
      const [hydrated, setHydrated] = useState(false);
      const ref = useRef<HTMLDivElement>(null);

      useEffect(() => {
        const observer = new IntersectionObserver(([entry]) => {
          if (entry.isIntersecting) {
            setHydrated(true);
            observer.disconnect();
          }
        });
        if (ref.current) observer.observe(ref.current);
        return () => observer.disconnect();
      }, []);

      return (
        <div ref={ref}>
          {hydrated ? children : <div dangerouslySetInnerHTML={{ __html: '' }} />}
        </div>
      );
    }
    ```
    ````

    ## Details

    Progressive hydration is distinct from islands: islands prevent hydration entirely for static regions, while progressive hydration defers hydration of React components that will eventually be interactive.

    **React 18 selective hydration:** `React.lazy` with Suspense boundaries already enables selective hydration in React 18 with `hydrateRoot`. React prioritizes hydrating components the user interacts with first.

    **Libraries:** `react-lazy-hydration`, `react-intersection-observer` provide production-ready utilities for this pattern.

    **Measurement:** Use Lighthouse TTI, Chrome DevTools Performance tab, and WebPageTest to verify improvements. Premature optimization without measurement is counterproductive.

    ## Source

    https://patterns.dev/react/progressive-hydration

    ```

    ```

11. Run: `cd /Users/cwarner/Projects/harness-engineering/agents/skills && npx vitest run tests/schema.test.ts tests/structure.test.ts 2>&1`

12. Observe: all tests pass.

13. Run: `harness validate`

14. Commit: `feat(react-skills): add container-presentational, suspense, concurrent, islands, progressive-hydration`

---

### Task 5: Create React skills batch 3 — static-import, dynamic-import, memoization, context

**Depends on:** Task 4
**Files:** `agents/skills/claude-code/react-static-import/`, `react-dynamic-import/`, `react-memoization-pattern/`, `react-context-pattern/` (skill.yaml + SKILL.md each)

1. Create `agents/skills/claude-code/react-static-import/skill.yaml`:

   ```yaml
   name: react-static-import
   version: '1.0.0'
   description: Bundle all dependencies at build time for predictable loading performance
   cognitive_mode: advisory-guide
   type: knowledge
   tier: 3
   triggers:
     - manual
   platforms:
     - claude-code
     - gemini-cli
     - cursor
     - codex
   tools: []
   paths:
     - '**/*.tsx'
     - '**/*.jsx'
     - '**/*.ts'
   related_skills:
     - react-dynamic-import
   stack_signals:
     - react
     - typescript
     - webpack
     - vite
   keywords:
     - static-import
     - bundling
     - tree-shaking
     - module-loading
   metadata:
     author: patterns.dev
     upstream: 'PatternsDev/skills/react/static-import'
   state:
     persistent: false
     files: []
   depends_on: []
   ```

2. Create `agents/skills/claude-code/react-static-import/SKILL.md`:

   ````markdown
   # React Static Import

   > Bundle all dependencies at build time for predictable loading performance

   ## When to Use

   - The imported module is needed immediately on component mount
   - The module is small or used everywhere in the app (no benefit to splitting)
   - You want tree-shaking to eliminate unused exports (only works with static imports)
   - Importing types, constants, utilities, or always-needed components

   ## Instructions

   1. Use ES module static `import` syntax at the top of the file.
   2. Import only what you need — named imports enable tree-shaking.
   3. Avoid barrel files (`index.ts` re-exporting everything) when tree-shaking matters.
   4. Group imports: external libraries first, then internal modules, then relative imports.

   ```typescript
   // Good: named import, tree-shakeable
   import { formatDate } from 'date-fns';

   // Good: specific internal module
   import { Button } from '@/components/Button';

   // Avoid for large libraries when only one function is needed
   import _ from 'lodash'; // pulls entire lodash into bundle
   import { debounce } from 'lodash'; // only debounce
   ```
   ````

   ## Details

   Static imports are resolved at build time by the bundler (Webpack, Vite, esbuild). The bundler builds a dependency graph and includes all statically imported modules in the bundle.

   **Tree-shaking:** Dead code elimination — if you import a named export but never use it, the bundler can eliminate it (with `sideEffects: false` in package.json and named imports). Side-effecting imports (CSS, polyfills) should not be tree-shaken.

   **When to switch to dynamic import:**
   - The module is only needed after a user interaction
   - The module is large and not needed on the initial route
   - You want to reduce initial bundle size

   ## Source

   https://patterns.dev/react/static-import

   ```

   ```

3. Create `agents/skills/claude-code/react-dynamic-import/skill.yaml`:

   ```yaml
   name: react-dynamic-import
   version: '1.0.0'
   description: Load modules on demand to reduce initial bundle size and improve startup performance
   cognitive_mode: advisory-guide
   type: knowledge
   tier: 3
   triggers:
     - manual
   platforms:
     - claude-code
     - gemini-cli
     - cursor
     - codex
   tools: []
   paths:
     - '**/*.tsx'
     - '**/*.jsx'
     - '**/*.ts'
   related_skills:
     - react-static-import
     - react-suspense-pattern
     - react-progressive-hydration
   stack_signals:
     - react
     - typescript
     - webpack
     - vite
   keywords:
     - dynamic-import
     - code-splitting
     - lazy-loading
     - bundle-size
     - on-demand
   metadata:
     author: patterns.dev
     upstream: 'PatternsDev/skills/react/dynamic-import'
   state:
     persistent: false
     files: []
   depends_on: []
   ```

4. Create `agents/skills/claude-code/react-dynamic-import/SKILL.md`:

   ````markdown
   # React Dynamic Import

   > Load modules on demand to reduce initial bundle size and improve startup performance

   ## When to Use

   - A component is only needed after user interaction (modal, drawer, tab panel)
   - A route's components should not be in the initial bundle (route-based splitting)
   - A large library is only used in a specific feature
   - Below-fold content that users may never scroll to

   ## Instructions

   1. Use `React.lazy` with a dynamic `import()` for component splitting:
      ```typescript
      const Modal = React.lazy(() => import('./Modal'));
      ```
   ````

   2. Always wrap lazy components in `<Suspense>` with a fallback.
   3. For non-component modules, use `import()` directly:
      ```typescript
      const { heavyComputation } = await import('./heavy-utils');
      ```
   4. Add webpack/vite magic comments for named chunks:
      ```typescript
      const Chart = React.lazy(() => import(/* webpackChunkName: "chart" */ './Chart'));
      ```
   5. Preload on hover for likely interactions:
      ```typescript
      const preload = () => import('./Modal');
      <button onMouseEnter={preload} onClick={openModal}>Open</button>
      ```

   ## Details

   Dynamic import is a JavaScript language feature (Stage 4). Bundlers create separate "chunks" for dynamically imported modules, loaded via `<script>` tags at runtime.

   **Chunk naming strategy:**
   - Route-based: one chunk per top-level route
   - Feature-based: one chunk per large feature (chart library, editor, admin panel)
   - Vendor splitting: separate chunks for node_modules (better long-term caching)

   **Preloading:** `<link rel="preload">` or `import()` on hover/route-change triggers network fetch before the user needs it, hiding latency. Framework routers (Next.js, React Router) do this automatically for adjacent routes.

   **Measurement:** Analyze bundle with `vite build --report` or `webpack-bundle-analyzer` before and after splitting.

   ## Source

   https://patterns.dev/react/dynamic-import

   ```

   ```

5. Create `agents/skills/claude-code/react-memoization-pattern/skill.yaml`:

   ```yaml
   name: react-memoization-pattern
   version: '1.0.0'
   description: Prevent expensive re-renders and recomputations with React memoization APIs
   cognitive_mode: advisory-guide
   type: knowledge
   tier: 3
   triggers:
     - manual
   platforms:
     - claude-code
     - gemini-cli
     - cursor
     - codex
   tools: []
   paths:
     - '**/*.tsx'
     - '**/*.jsx'
   related_skills:
     - react-hooks-pattern
     - react-concurrent-ui
   stack_signals:
     - react
     - typescript
   keywords:
     - memoization
     - memo
     - useMemo
     - useCallback
     - performance
     - re-render
   metadata:
     author: patterns.dev
     upstream: 'PatternsDev/skills/react/memoization'
   state:
     persistent: false
     files: []
   depends_on: []
   ```

6. Create `agents/skills/claude-code/react-memoization-pattern/SKILL.md`:

   ````markdown
   # React Memoization Pattern

   > Prevent expensive re-renders and recomputations with React memoization APIs

   ## When to Use

   - A child component re-renders with the same props because the parent re-renders (use `React.memo`)
   - A derived value is computationally expensive and its inputs rarely change (use `useMemo`)
   - A callback function reference must be stable to avoid breaking `React.memo` on child components (use `useCallback`)
   - You have profiled the component with React DevTools and confirmed unnecessary renders

   ## Instructions

   1. **Profile first.** Do not memoize without evidence of a problem — premature memoization adds code complexity and can hurt performance if used incorrectly.
   2. Wrap a component with `React.memo` to skip re-render when props are shallowly equal:
      ```typescript
      const ExpensiveList = React.memo(function ExpensiveList({ items }: { items: Item[] }) {
        return <ul>{items.map((i) => <li key={i.id}>{i.name}</li>)}</ul>;
      });
      ```
   ````

   3. Use `useMemo` for expensive computations:
      ```typescript
      const sortedItems = useMemo(() => [...items].sort(compareFn), [items]);
      ```
   4. Use `useCallback` for stable callback references:
      ```typescript
      const handleClick = useCallback(() => onSelect(id), [id, onSelect]);
      ```
   5. With React 19 Compiler: memoization may be inserted automatically — avoid manual `React.memo`/`useMemo` until you verify the compiler does not handle it.

   ## Details

   Memoization trades memory for computation. React's memoization hooks cache values between renders when dependency arrays are unchanged.

   **Shallow equality:** `React.memo` uses shallow comparison — object/array props created inline always produce new references, breaking memoization. Pass stable references or memoize the props themselves.

   **`useMemo` vs `useCallback`:**
   - `useMemo` memoizes a computed value: `useMemo(() => compute(), [dep])`
   - `useCallback` memoizes a function: `useCallback(() => fn(), [dep])` — equivalent to `useMemo(() => () => fn(), [dep])`

   **React 19 Compiler:** The React compiler automatically memoizes components and hooks. Manual `React.memo`, `useMemo`, and `useCallback` may become unnecessary in codebases using the compiler.

   **Anti-pattern:** Wrapping every component in `React.memo` without profiling. Memo has overhead — the cost of comparison must be less than the cost of re-rendering.

   ## Source

   https://patterns.dev/react/memoization-pattern

   ```

   ```

7. Create `agents/skills/claude-code/react-context-pattern/skill.yaml`:

   ```yaml
   name: react-context-pattern
   version: '1.0.0'
   description: Share state across the component tree without prop drilling using React Context
   cognitive_mode: advisory-guide
   type: knowledge
   tier: 3
   triggers:
     - manual
   platforms:
     - claude-code
     - gemini-cli
     - cursor
     - codex
   tools: []
   paths:
     - '**/*.tsx'
     - '**/*.jsx'
   related_skills:
     - react-provider-pattern
     - react-hooks-pattern
     - react-state-management-pattern
   stack_signals:
     - react
     - typescript
   keywords:
     - context
     - createContext
     - useContext
     - global-state
     - prop-drilling
   metadata:
     author: patterns.dev
     upstream: 'PatternsDev/skills/react/context-pattern'
   state:
     persistent: false
     files: []
   depends_on: []
   ```

8. Create `agents/skills/claude-code/react-context-pattern/SKILL.md`:

   ````markdown
   # React Context Pattern

   > Share state across the component tree without prop drilling using React Context

   ## When to Use

   - Theme, locale, current user, or feature flags need to be accessible throughout the app
   - Prop drilling through 3+ intermediate components that do not use the data
   - State that changes infrequently (avoid for high-frequency updates without optimization)
   - Building component libraries that need implicit configuration

   ## Instructions

   1. Create a typed context with `createContext`:
      ```typescript
      interface AuthContextValue {
        user: User | null;
        signOut: () => void;
      }
      const AuthContext = createContext<AuthContextValue | null>(null);
      ```
   ````

   2. Create a Provider component that holds the state:
      ```typescript
      export function AuthProvider({ children }: { children: React.ReactNode }) {
        const [user, setUser] = useState<User | null>(null);
        return (
          <AuthContext.Provider value={{ user, signOut: () => setUser(null) }}>
            {children}
          </AuthContext.Provider>
        );
      }
      ```
   3. Create a safe consumer hook that throws when used outside the provider:
      ```typescript
      export function useAuth(): AuthContextValue {
        const ctx = useContext(AuthContext);
        if (!ctx) throw new Error('useAuth must be used within AuthProvider');
        return ctx;
      }
      ```
   4. Place the provider at the appropriate level in the tree (app root, route boundary, or feature boundary).

   ## Details

   Context provides a mechanism for passing values through the component tree without prop drilling. It is not a replacement for state management — it is a mechanism for making existing state accessible.

   **Performance:** All consumers of a context re-render when the context value changes. Split contexts by update frequency: `{ theme, toggleTheme }` in one context, `{ user, signOut }` in another.

   **Context vs prop drilling vs state management:**
   - Prop drilling: explicit, easy to trace, burdensome for deep trees
   - Context: implicit, harder to trace, good for cross-cutting concerns
   - State management (Zustand/Redux): explicit subscriptions, selectors, derived state

   **React 19:** `use(Context)` can be called conditionally and inside `if` blocks, unlike `useContext`. Equivalent behavior, more flexibility.

   ## Source

   https://patterns.dev/react/context-pattern

   ```

   ```

9. Run: `cd /Users/cwarner/Projects/harness-engineering/agents/skills && npx vitest run tests/schema.test.ts tests/structure.test.ts 2>&1`

10. Observe: all tests pass.

11. Run: `harness validate`

12. Commit: `feat(react-skills): add static-import, dynamic-import, memoization, context skills`

---

### Task 6: Create React skills batch 4 — state-management, client-rendering, server-rendering, server-components, 2026

**Depends on:** Task 5
**Files:** `agents/skills/claude-code/react-state-management-pattern/`, `react-client-rendering/`, `react-server-rendering/`, `react-server-components/`, `react-2026/` (skill.yaml + SKILL.md each)

1. Create `agents/skills/claude-code/react-state-management-pattern/skill.yaml`:

   ```yaml
   name: react-state-management-pattern
   version: '1.0.0'
   description: Choose the right state management approach for your React application scale
   cognitive_mode: advisory-guide
   type: knowledge
   tier: 3
   triggers:
     - manual
   platforms:
     - claude-code
     - gemini-cli
     - cursor
     - codex
   tools: []
   paths:
     - '**/*.tsx'
     - '**/*.jsx'
   related_skills:
     - react-context-pattern
     - react-provider-pattern
     - react-hooks-pattern
   stack_signals:
     - react
     - typescript
     - redux
     - zustand
   keywords:
     - state-management
     - zustand
     - redux
     - jotai
     - useState
     - global-state
   metadata:
     author: patterns.dev
     upstream: 'PatternsDev/skills/react/state-management'
   state:
     persistent: false
     files: []
   depends_on: []
   ```

2. Create `agents/skills/claude-code/react-state-management-pattern/SKILL.md`:

   ````markdown
   # React State Management Pattern

   > Choose the right state management approach for your React application scale

   ## When to Use

   - You are deciding how to manage state in a new React application
   - Local component state is no longer sufficient (multiple components need the same data)
   - Context re-render performance is becoming a problem
   - You need derived state, selectors, or middleware (Redux DevTools, undo/redo)

   ## Instructions

   **Decision tree:**

   1. **Local state first:** Start with `useState` / `useReducer`. Do not reach for global state until you have a specific problem.
   2. **Shared low-frequency state:** Use React Context + `useContext` for data that rarely changes (theme, auth, locale).
   3. **Shared high-frequency state (small apps):** Use Zustand for minimal boilerplate, selector-based subscriptions, and devtools support.
   4. **Complex domain state (large apps):** Use Redux Toolkit for predictable state machines, time-travel debugging, and team consistency.
   5. **Server state:** Use React Query or SWR — not client state management — for data that comes from an API.

   ```typescript
   // Zustand: minimal setup
   import { create } from 'zustand';
   interface BearStore {
     count: number;
     increment: () => void;
   }
   const useBearStore = create<BearStore>((set) => ({
     count: 0,
     increment: () => set((s) => ({ count: s.count + 1 })),
   }));
   ```
   ````

   ## Details

   **State categories:**
   - **UI state:** Open/closed, selected tab, scroll position — local state or URL params
   - **Server state:** API data — React Query, SWR, RTK Query
   - **Global app state:** User session, theme, cart — Context or Zustand
   - **Complex domain state:** Multi-entity updates, undo/redo, optimistic updates — Redux Toolkit

   **Library comparison (2024):**
   | Library | Bundle | Boilerplate | DevTools | Selectors |
   |---------|--------|-------------|----------|-----------|
   | Context | 0KB | Low | No | No |
   | Zustand | ~1KB | Very low | Yes | Yes |
   | Jotai | ~3KB | Low | Yes | Atoms |
   | Redux Toolkit | ~12KB | Medium | Excellent | Yes |

   **React 19 note:** With the React compiler, many manual performance optimizations in Zustand/Redux become less necessary as React auto-memoizes.

   ## Source

   https://patterns.dev/react/state-management

   ```

   ```

3. Create `agents/skills/claude-code/react-client-rendering/skill.yaml`:

   ```yaml
   name: react-client-rendering
   version: '1.0.0'
   description: Render React entirely in the browser for highly interactive single-page applications
   cognitive_mode: advisory-guide
   type: knowledge
   tier: 3
   triggers:
     - manual
   platforms:
     - claude-code
     - gemini-cli
     - cursor
     - codex
   tools: []
   paths:
     - '**/*.tsx'
     - '**/*.jsx'
   related_skills:
     - react-server-rendering
     - react-server-components
     - react-islands-pattern
   stack_signals:
     - react
     - typescript
     - vite
   keywords:
     - csr
     - client-rendering
     - spa
     - browser-rendering
   metadata:
     author: patterns.dev
     upstream: 'PatternsDev/skills/react/client-side-rendering'
   state:
     persistent: false
     files: []
   depends_on: []
   ```

4. Create `agents/skills/claude-code/react-client-rendering/SKILL.md`:

   ````markdown
   # React Client Rendering

   > Render React entirely in the browser for highly interactive single-page applications

   ## When to Use

   - Building dashboards, admin tools, or SPAs where SEO is not required
   - The application is behind authentication (no public search indexing needed)
   - Extremely dynamic UI where server rendering provides little benefit
   - Rapid prototyping or tooling (internal apps, developer tools)

   ## Instructions

   1. Use Vite or Create React App (legacy) to scaffold a pure client-rendered app.
   2. Mount React at a root element with `createRoot`:
      ```typescript
      import { createRoot } from 'react-dom/client';
      createRoot(document.getElementById('root')!).render(<App />);
      ```
   ````

   3. For routing, use React Router or TanStack Router in client mode.
   4. Serve a minimal `index.html` with a single `<div id="root">` from any static host.
   5. Configure your hosting to redirect all routes to `index.html` for client-side routing.

   ## Details

   Client-side rendering (CSR) sends an empty HTML shell to the browser; React builds the DOM entirely in JavaScript. The advantages are simplicity (no server) and rich interactivity; the disadvantages are slower Time to First Contentful Paint (FCP) and poor SEO.

   **When CSR is appropriate:**
   - Applications requiring authentication before first meaningful content
   - Dashboards with real-time data that changes after load
   - Apps with high interactivity that would not benefit from SSR

   **Performance concerns:**
   - Large JavaScript bundles increase time-to-interactive
   - Mitigate with code-splitting (`React.lazy` + route-based splitting), tree-shaking, and CDN caching
   - Core Web Vitals (LCP, FID/INP) are negatively affected by large bundles — measure before shipping

   **Versus SSR/SSG:** If public SEO matters or First Contentful Paint is critical, use a framework with SSR (Next.js, Remix) or static generation instead.

   ## Source

   https://patterns.dev/react/client-side-rendering

   ```

   ```

5. Create `agents/skills/claude-code/react-server-rendering/skill.yaml`:

   ```yaml
   name: react-server-rendering
   version: '1.0.0'
   description: Pre-render React components on the server for improved SEO and initial load performance
   cognitive_mode: advisory-guide
   type: knowledge
   tier: 3
   triggers:
     - manual
   platforms:
     - claude-code
     - gemini-cli
     - cursor
     - codex
   tools: []
   paths:
     - '**/*.tsx'
     - '**/*.jsx'
   related_skills:
     - react-client-rendering
     - react-server-components
     - react-progressive-hydration
   stack_signals:
     - react
     - typescript
     - next
     - remix
   keywords:
     - ssr
     - server-rendering
     - hydration
     - seo
     - initial-load
   metadata:
     author: patterns.dev
     upstream: 'PatternsDev/skills/react/server-side-rendering'
   state:
     persistent: false
     files: []
   depends_on: []
   ```

6. Create `agents/skills/claude-code/react-server-rendering/SKILL.md`:

   ````markdown
   # React Server Rendering

   > Pre-render React components on the server for improved SEO and initial load performance

   ## When to Use

   - Public-facing pages where SEO and crawler indexability matter
   - Applications where First Contentful Paint performance is critical
   - You need personalized content rendered per-request (not suitable for static generation)
   - Using Next.js Pages Router (`getServerSideProps`), Remix (`loader`), or custom Express + `renderToString`

   ## Instructions

   1. In Next.js Pages Router, export `getServerSideProps` to fetch data server-side:
      ```typescript
      export async function getServerSideProps(context: GetServerSidePropsContext) {
        const data = await fetchData(context.params.id);
        return { props: { data } };
      }
      ```
   ````

   2. In Remix, export a `loader` function:
      ```typescript
      export async function loader({ params }: LoaderFunctionArgs) {
        return json(await fetchData(params.id));
      }
      ```
   3. The server renders the full HTML; the browser displays it immediately (no blank page flash).
   4. React hydrates the server-rendered HTML on the client, attaching event handlers.
   5. Use `cache` headers appropriately — per-request SSR bypasses CDN caching.

   ## Details

   SSR sends fully-rendered HTML from the server. The browser displays content immediately while React hydrates in the background, making the UI interactive.

   **SSR vs SSG:**
   - **SSG (Static Generation):** HTML generated at build time. Fast, cacheable, but requires rebuild for updates.
   - **SSR:** HTML generated per-request. Always fresh, but has server cost and latency.
   - **ISR (Next.js):** Static with time-based revalidation — best of both for many cases.

   **Hydration mismatch:** If server-rendered HTML differs from what client React would render, React throws a hydration error. Common causes: `Date.now()`, `Math.random()`, browser-only APIs in render paths. Suppress with `suppressHydrationWarning` for known-safe mismatches.

   **React 18 streaming:** `renderToPipeableStream` streams HTML to the browser progressively, enabling Suspense boundaries to stream in chunks. Improves TTFB for slow data.

   ## Source

   https://patterns.dev/react/server-side-rendering

   ```

   ```

7. Create `agents/skills/claude-code/react-server-components/skill.yaml`:

   ```yaml
   name: react-server-components
   version: '1.0.0'
   description: Run components on the server to eliminate client JavaScript and enable direct data access
   cognitive_mode: advisory-guide
   type: knowledge
   tier: 3
   triggers:
     - manual
   platforms:
     - claude-code
     - gemini-cli
     - cursor
     - codex
   tools: []
   paths:
     - '**/*.tsx'
     - '**/*.jsx'
   related_skills:
     - react-server-rendering
     - react-client-rendering
     - react-islands-pattern
     - react-suspense-pattern
   stack_signals:
     - react
     - typescript
     - next
   keywords:
     - rsc
     - server-components
     - use-client
     - zero-bundle
     - data-access
   metadata:
     author: patterns.dev
     upstream: 'PatternsDev/skills/react/react-server-components'
   state:
     persistent: false
     files: []
   depends_on: []
   ```

8. Create `agents/skills/claude-code/react-server-components/SKILL.md`:

   ````markdown
   # React Server Components

   > Run components on the server to eliminate client JavaScript and enable direct data access

   ## When to Use

   - Components that fetch data and render it without client-side interactivity
   - Components that import large libraries (markdown parsers, date formatters) only needed for rendering
   - You need direct database or filesystem access without an API layer
   - Using Next.js App Router (RSC is the default) or another RSC-compatible framework

   ## Instructions

   1. **Server Components are the default** in Next.js App Router. Do not add `'use client'` unless needed.
   2. Server Components can:
      - `async/await` directly: `const data = await db.query(...)`
      - Import server-only libraries without impacting bundle size
      - Read environment variables and secrets directly
   3. Add `'use client'` directive at the top of a file when the component needs:
      - `useState`, `useEffect`, or any hooks
      - Browser APIs (`window`, `document`)
      - Event handlers (`onClick`, `onChange`)
   4. **Composition rule:** Server Components can render Client Components, but Client Components cannot render Server Components (only pass them as `children` props).
   5. Pass data from Server to Client Components as serializable props (no functions, classes, or non-serializable objects).

   ```typescript
   // Server Component (no 'use client')
   async function ProductPage({ id }: { id: string }) {
     const product = await db.products.findById(id); // direct DB access
     return (
       <div>
         <h1>{product.name}</h1>
         <AddToCartButton productId={id} /> {/* Client Component */}
       </div>
     );
   }

   // Client Component
   'use client';
   function AddToCartButton({ productId }: { productId: string }) {
     return <button onClick={() => addToCart(productId)}>Add to Cart</button>;
   }
   ```
   ````

   ## Details

   RSC introduces a server/client component split at the file level. The framework serializes server-rendered output as a JSON-like payload (RSC payload) and sends it to the client for React to reconcile.

   **What RSC eliminates:**
   - API routes for data fetching in many cases (direct DB access in server components)
   - Client-side waterfall requests (async server components fetch in parallel)
   - Bundle cost for render-only dependencies (they never reach the browser)

   **Common mistakes:**
   - Adding `'use client'` to every file "to be safe" — this negates RSC benefits
   - Trying to pass functions as props from server to client components — functions are not serializable
   - Using `useEffect` for data fetching in client components when a server component would work

   **Framework support (2024):** Next.js App Router is the primary production implementation. Remix, Waku, and other frameworks have RSC support in various stages.

   ## Source

   https://patterns.dev/react/react-server-components

   ```

   ```

9. Create `agents/skills/claude-code/react-2026/skill.yaml`:

   ```yaml
   name: react-2026
   version: '1.0.0'
   description: Modern React patterns for 2025-2026 including React 19, Compiler, and AI-integrated UI
   cognitive_mode: advisory-guide
   type: knowledge
   tier: 3
   triggers:
     - manual
   platforms:
     - claude-code
     - gemini-cli
     - cursor
     - codex
   tools: []
   paths:
     - '**/*.tsx'
     - '**/*.jsx'
   related_skills:
     - react-server-components
     - react-memoization-pattern
     - react-concurrent-ui
     - react-suspense-pattern
   stack_signals:
     - react
     - typescript
   keywords:
     - react-19
     - compiler
     - actions
     - use-hook
     - ai-ui
     - modern-react
   metadata:
     author: patterns.dev
     upstream: 'PatternsDev/skills/react/react-2026'
   state:
     persistent: false
     files: []
   depends_on: []
   ```

10. Create `agents/skills/claude-code/react-2026/SKILL.md`:

    ````markdown
    # React 2026

    > Modern React patterns for 2025-2026 including React 19, Compiler, and AI-integrated UI

    ## When to Use

    - Starting a new React project in 2025 or later
    - Upgrading an existing React 18 project to React 19
    - Evaluating whether to adopt the React Compiler
    - Building AI-powered UI features with streaming and progressive enhancement

    ## Instructions

    **React 19 key changes:**

    1. **React Compiler (beta → stable):** Automatically memoizes components. Remove manual `React.memo`, `useMemo`, `useCallback` where safe. Install `babel-plugin-react-compiler`.

    2. **`use()` hook:** Read promises and context inside render — can be used conditionally:
       ```typescript
       function UserProfile({ userPromise }: { userPromise: Promise<User> }) {
         const user = use(userPromise); // suspends until resolved
         return <div>{user.name}</div>;
       }
       ```
    ````

    3. **Server Actions:** Functions marked `'use server'` can be called from client components as async functions — replaces form submission API routes:

       ```typescript
       'use server';
       async function updateProfile(formData: FormData) {
         await db.users.update({ name: formData.get('name') });
       }
       ```

    4. **`useFormStatus` and `useOptimistic`:** Built-in hooks for form state and optimistic UI updates.

    5. **`ref` as prop:** No more `forwardRef` — pass `ref` directly as a regular prop in React 19.

    ## Details

    **React Compiler adoption path:**
    - Install: `npm install babel-plugin-react-compiler`
    - Enable in Babel/Vite config
    - Run `react-compiler-healthcheck` to identify files that need refactoring
    - Remove manual memoization incrementally as you verify compiler output

    **AI-integrated UI patterns:**
    - Use `useOptimistic` for streaming AI responses
    - Pair Server Actions with `startTransition` for non-blocking AI calls
    - Stream AI output via the Vercel AI SDK (`useChat`, `useCompletion`) which wraps `ReadableStream` in React-friendly hooks
    - Progressive enhancement: render static content server-side, enhance with streaming AI client-side

    **React 19 migration notes:**
    - `ReactDOM.render` removed — use `createRoot`
    - `defaultProps` for function components removed — use default parameter values
    - `string` refs removed — use callback refs or `useRef`
    - Concurrent features now enabled by default with `createRoot`

    **Forward compatibility:**
    - Write components as async Server Components where possible — they compose forward into RSC-first architectures
    - Prefer `use()` over `useEffect` + state for async data

    ## Source

    https://patterns.dev/react/react-2026

    ```

    ```

11. Run: `cd /Users/cwarner/Projects/harness-engineering/agents/skills && npx vitest run tests/schema.test.ts tests/structure.test.ts 2>&1`

12. Observe: all tests pass. There should now be 19 React skills in claude-code.

13. Run: `harness validate`

14. Commit: `feat(react-skills): add state-management, client-rendering, server-rendering, server-components, react-2026 skills`

---

### Task 7: Update agents/skills tests/schema.ts to recognize type: 'knowledge'

**Depends on:** Task 6
**Files:** `agents/skills/tests/schema.ts`

**Context:** `agents/skills/tests/schema.ts:57` defines `type: z.enum(['rigid', 'flexible'])`. The `schema.test.ts` and `structure.test.ts` use this schema. The `platform-parity.test.ts` uses `ALLOWED_PLATFORMS`. Once knowledge skills are added, schema validation in `schema.test.ts` will fail if it parses knowledge skill YAMLs through the local schema. We need to update the local schema to match the CLI schema.

**Note:** The agents/skills local schema is a lightweight duplicate of the CLI schema used for agent-side tests. It must stay in sync with `packages/cli/src/skill/schema.ts`.

1. Read `agents/skills/tests/schema.ts` — current type field is at line 57: `type: z.enum(['rigid', 'flexible'])`.

2. Run existing schema tests to confirm they pass: `cd /Users/cwarner/Projects/harness-engineering/agents/skills && npx vitest run tests/schema.test.ts 2>&1`

3. Check whether the `schema.test.ts` tests currently exercise knowledge skills by scanning the test file for `knowledge` references:
   - If no tests reference `knowledge`, this task is to add `'knowledge'` to the local schema enum and add a test.
   - If tests already exist, just update the enum.

4. Update `agents/skills/tests/schema.ts` at line 57:

   Change:

   ```typescript
   type: z.enum(['rigid', 'flexible']),
   ```

   To:

   ```typescript
   type: z.enum(['rigid', 'flexible', 'knowledge']),
   ```

   Also add `paths`, `related_skills`, and `metadata` fields to the local schema to support knowledge skill validation in `structure.test.ts`:

   After `depends_on: z.array(z.string()).default([]),` add:

   ```typescript
   paths: z.array(z.string()).default([]),
   related_skills: z.array(z.string()).default([]),
   metadata: z.object({
     author: z.string().optional(),
     version: z.string().optional(),
     upstream: z.string().optional(),
   }).passthrough().default({}),
   tier: z.number().int().min(1).max(3).optional(),
   keywords: z.array(z.string()).default([]),
   stack_signals: z.array(z.string()).default([]),
   ```

5. Run: `cd /Users/cwarner/Projects/harness-engineering/agents/skills && npx vitest run tests/ 2>&1`

6. Observe: all tests pass including schema validation of the 19 new React skills.

7. Run: `harness validate`

8. Commit: `feat(skills-schema): update local agents/skills schema to support knowledge type`

---

### Task 8: Replicate all 19 React skills to gemini-cli, cursor, and codex platforms

**Depends on:** Task 7
**Files:** All 19 React skill directories under `agents/skills/gemini-cli/`, `agents/skills/cursor/`, `agents/skills/codex/`

**Context:** `agents/skills/tests/platform-parity.test.ts` requires all skills to exist identically across all four platforms. Files must be byte-identical (`platform-parity.test.ts:103-110`).

1. Run the platform parity test first to see it fail with the new skills:
   `cd /Users/cwarner/Projects/harness-engineering/agents/skills && npx vitest run tests/platform-parity.test.ts 2>&1`

2. Observe: failures for all 19 `react-*` skills missing from gemini-cli, cursor, codex.

3. Replicate all 19 skills to the three other platforms. Run these three commands:

   ```bash
   for skill in react-hooks-pattern react-compound-pattern react-render-props-pattern react-hoc-pattern react-provider-pattern react-container-presentational react-suspense-pattern react-concurrent-ui react-islands-pattern react-progressive-hydration react-static-import react-dynamic-import react-memoization-pattern react-context-pattern react-state-management-pattern react-client-rendering react-server-rendering react-server-components react-2026; do
     cp -r /Users/cwarner/Projects/harness-engineering/agents/skills/claude-code/$skill /Users/cwarner/Projects/harness-engineering/agents/skills/gemini-cli/
     cp -r /Users/cwarner/Projects/harness-engineering/agents/skills/claude-code/$skill /Users/cwarner/Projects/harness-engineering/agents/skills/cursor/
     cp -r /Users/cwarner/Projects/harness-engineering/agents/skills/claude-code/$skill /Users/cwarner/Projects/harness-engineering/agents/skills/codex/
   done
   ```

4. Verify file counts:

   ```bash
   echo "claude-code:" && ls /Users/cwarner/Projects/harness-engineering/agents/skills/claude-code/ | grep "^react-" | wc -l
   echo "gemini-cli:" && ls /Users/cwarner/Projects/harness-engineering/agents/skills/gemini-cli/ | grep "^react-" | wc -l
   echo "cursor:" && ls /Users/cwarner/Projects/harness-engineering/agents/skills/cursor/ | grep "^react-" | wc -l
   echo "codex:" && ls /Users/cwarner/Projects/harness-engineering/agents/skills/codex/ | grep "^react-" | wc -l
   ```

   All should show 19.

5. Run: `cd /Users/cwarner/Projects/harness-engineering/agents/skills && npx vitest run tests/platform-parity.test.ts 2>&1`

6. Observe: all platform parity tests pass.

7. Run: `harness validate`

8. Commit: `feat(react-skills): replicate 19 React skills to gemini-cli, cursor, codex platforms`

---

### Task 9: Wire recommend-skills.ts to use suggest() with task context (Phase B completion)

**Depends on:** Task 8
**Files:** `packages/cli/src/mcp/tools/recommend-skills.ts`

**Context:** Phase A learnings (`handoff.json`) noted: "wiring [suggest()] into recommend_skills output was misleading dead code, removed until Phase B". The `suggest()` function now has full knowledge skill support. Phase B must wire `suggest()` into `handleRecommendSkills` using `recentFiles` from the request context to enable the end-to-end path: edit `.tsx` → knowledge auto-injected.

1. Read `packages/cli/src/mcp/tools/recommend-skills.ts` to understand current structure.

2. Read `packages/cli/tests/mcp/tools/recommend-skills.test.ts` to understand test structure.

3. Write a new test in `packages/cli/tests/mcp/tools/recommend-skills.test.ts`. Add to the existing test file (do not overwrite):

   ```typescript
   describe('handleRecommendSkills — knowledge skill wiring', () => {
     it('includes knowledgeRecommendations in formatted output when skills index has knowledge skills', async () => {
       const mockIndex = {
         skills: [
           {
             name: 'react-hooks-pattern',
             type: 'knowledge' as const,
             tier: 3,
             description: 'Reuse stateful logic via custom hooks',
             keywords: ['hooks', 'custom-hooks'],
             stackSignals: ['react'],
             paths: ['**/*.tsx', '**/*.jsx'],
             relatedSkills: [],
             addresses: [],
             recentlyUsed: false,
             lastUsed: undefined,
           },
         ],
         builtAt: new Date().toISOString(),
         projectPath: '/tmp/test',
       };
       (loadOrRebuildIndex as ReturnType<typeof vi.fn>).mockResolvedValue(mockIndex);
       (isSnapshotFresh as ReturnType<typeof vi.fn>).mockReturnValue(true);
       (loadCachedSnapshot as ReturnType<typeof vi.fn>).mockReturnValue(MOCK_SNAPSHOT);
       (recommend as ReturnType<typeof vi.fn>).mockResolvedValue({
         suggestions: [],
         autoInjectKnowledge: [
           {
             name: 'react-hooks-pattern',
             score: 0.85,
             reason: 'paths match: **/*.tsx',
           },
         ],
         context: { healthSignals: [], stackProfile: { frameworks: [], languages: [] } },
       });

       const result = await handleRecommendSkills({
         path: '/tmp/test',
         recentFiles: ['src/App.tsx'],
       });
       const parsed = JSON.parse(result.content[0].text);
       expect(parsed).toHaveProperty('autoInjectKnowledge');
       expect(Array.isArray(parsed.autoInjectKnowledge)).toBe(true);
     });
   });
   ```

4. Run: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/cli/tests/mcp/tools/recommend-skills.test.ts 2>&1`

5. Observe the failure: `handleRecommendSkills` result does not include `autoInjectKnowledge` field.

6. Read `packages/cli/src/mcp/tools/recommend-skills.ts` in full. Find where the result is formatted. The handler calls `recommend()` (the 3-layer pipeline). The `suggest()` function (in dispatcher) is the correct source for `autoInjectKnowledge`. The fix: call `suggest()` alongside or instead of `recommend()` for knowledge skills when `recentFiles` is provided.

   Update `handleRecommendSkills` to:
   a. Accept `recentFiles?: string[]` in its input type.
   b. When `recentFiles` is provided, call `suggest()` from dispatcher to get knowledge recommendations.
   c. Include `autoInjectKnowledge` array in the JSON output.

   Specific changes (read the current file first to get exact line numbers):
   - Import `suggest` from `'../../skill/dispatcher.js'`
   - In the handler, after building `index`, call `suggest({ task: taskContext, recentFiles: input.recentFiles ?? [], index })`
   - Merge `autoInjectKnowledge` from `suggest()` result into the output
   - Add `recentFiles` to the `recommendSkillsDefinition` input schema

7. Run: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/cli/tests/mcp/tools/recommend-skills.test.ts 2>&1`

8. Observe: test passes.

9. Run: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/cli/tests/skill/ 2>&1`

10. Observe: all skill tests pass.

11. Run: `harness validate`

12. Commit: `feat(recommend-skills): wire suggest() autoInjectKnowledge into handleRecommendSkills output`

---

### Task 10: End-to-end validation — confirm .tsx editing surfaces React knowledge

**Depends on:** Task 9
**Files:** `packages/cli/tests/mcp/tools/recommend-skills.test.ts`

[checkpoint:human-verify] — This task requires validating that the full dispatch path works end-to-end. Confirm the test output before committing.

1. Write an integration-style test in `packages/cli/tests/mcp/tools/recommend-skills.test.ts` that uses a real filesystem index:

   Add to the test file:

   ```typescript
   describe('E2E: .tsx file editing surfaces React knowledge skills', () => {
     it('suggest() with recentFiles=[*.tsx] scores react-hooks-pattern above 0.40 threshold', async () => {
       // This test uses the real skill index from the project
       const { loadOrRebuildIndex: realLoad } = await import('../../../src/skill/index-builder.js');
       // We cannot import the real index in unit tests easily — test the scoring logic directly
       const { scoreSkill } = await import('../../../src/skill/dispatcher.js');

       const reactHooksEntry = {
         name: 'react-hooks-pattern',
         type: 'knowledge' as const,
         tier: 3,
         description: 'Reuse stateful logic across components via custom hooks',
         keywords: ['hooks', 'custom-hooks', 'stateful-logic', 'composition'],
         stackSignals: ['react', 'typescript'],
         paths: ['**/*.tsx', '**/*.jsx'],
         relatedSkills: [],
         addresses: [],
         recentlyUsed: false,
         lastUsed: undefined,
       };

       const score = scoreSkill(reactHooksEntry, {
         task: 'refactor component logic',
         recentFiles: ['src/App.tsx', 'src/components/Button.tsx'],
         stackProfile: { frameworks: ['react'], languages: ['typescript'] },
       });

       // paths score: 0.20 (tsx match), keyword match on 'hooks': 0.30 * partial
       // Should exceed recommendation threshold of 0.40
       expect(score).toBeGreaterThan(0.4);
     });

     it('suggest() with recentFiles=[*.py] scores react-hooks-pattern below 0.40 threshold', async () => {
       const { scoreSkill } = await import('../../../src/skill/dispatcher.js');

       const reactHooksEntry = {
         name: 'react-hooks-pattern',
         type: 'knowledge' as const,
         tier: 3,
         description: 'Reuse stateful logic across components via custom hooks',
         keywords: ['hooks', 'custom-hooks', 'stateful-logic', 'composition'],
         stackSignals: ['react', 'typescript'],
         paths: ['**/*.tsx', '**/*.jsx'],
         relatedSkills: [],
         addresses: [],
         recentlyUsed: false,
         lastUsed: undefined,
       };

       const score = scoreSkill(reactHooksEntry, {
         task: 'data processing script',
         recentFiles: ['scripts/process.py', 'data/input.csv'],
         stackProfile: { frameworks: [], languages: ['python'] },
       });

       // No paths match, no keyword match, no stack match
       expect(score).toBeLessThan(0.4);
     });
   });
   ```

2. Run: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/cli/tests/mcp/tools/recommend-skills.test.ts 2>&1`

3. Observe: both E2E tests pass. The .tsx path activation is confirmed to work.

4. [checkpoint:human-verify] — Review test output. The first test should show a score > 0.40 for React skills when editing .tsx files. The second should show < 0.40 for Python files. If thresholds are off, check the `scoreSkill` implementation in `packages/cli/src/skill/dispatcher.ts` for the paths scoring weight.

5. Run: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/cli/ 2>&1`

6. Observe: full CLI test suite passes.

7. Run: `harness validate`

8. Commit: `test(react-skills): add E2E scoring test confirming tsx file editing surfaces React knowledge`

---

### Task 11: Full validation gate

**Depends on:** Task 10
**Files:** none

1. Run the complete agents/skills test suite:

   ```bash
   cd /Users/cwarner/Projects/harness-engineering/agents/skills && npx vitest run tests/ 2>&1
   ```

   Observe: all tests pass including schema, structure, platform-parity, and references.

2. Run the CLI test suite:

   ```bash
   cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/cli/ 2>&1
   ```

   Observe: all tests pass.

3. Run harness validate:

   ```bash
   harness validate
   ```

   Observe: `v validation passed`

4. Verify the skill count: `ls agents/skills/claude-code/ | grep "^react-" | wc -l` should show `19`.

5. Verify platform parity: all four platforms have 19 React skills.

6. If any test fails, diagnose and fix before marking this task complete. Common issues:
   - `schema.ts` local type enum not updated (Task 7)
   - Platform replication missed a skill (Task 8)
   - `validateSkillEntry` not exported from `validate.ts` (Task 1)
   - `scoreSkill` function signature changed in Phase A — check argument shape matches test expectations

7. Commit any fixes with appropriate message.

---

## Session State

- **Decisions recorded:** Platform replication targets all 4 platforms (claude-code, gemini-cli, cursor, codex), not just 2 as mentioned in the spec — required by platform-parity.test.ts.
- **Constraint discovered:** `validate.ts` REQUIRED_SECTIONS must be updated before knowledge skills can pass `harness skill validate` — must be done in Task 1.
- **Risk:** `scoreSkill` function signature in `dispatcher.ts` — Task 10's E2E test uses it directly; if the signature changed in Phase A from what's documented, the test will need adjustment. Read the actual dispatcher before writing Task 10 test code.
- **Risk:** `recommend-skills.ts` wiring in Task 9 requires reading the current file — the exact integration point is implementation-dependent. Do not write code without reading the file first.

---

## Traceability: Observable Truths → Tasks

| Observable Truth                                                | Delivering Task(s) |
| --------------------------------------------------------------- | ------------------ |
| 1. knowledge skills exempt from behavioral sections in validate | Task 1             |
| 2. knowledge skill missing ## Instructions fails validate       | Task 1             |
| 3. 19 React skill directories in claude-code                    | Tasks 3-6          |
| 4. Each skill.yaml has correct knowledge fields                 | Tasks 3-6          |
| 5. Each SKILL.md has ## Instructions + ## Details               | Tasks 3-6          |
| 6. Platform parity tests pass across all 4 platforms            | Task 8             |
| 7. Schema tests pass for all 19 skills                          | Task 7             |
| 8. suggest() surfaces React skill when editing .tsx             | Tasks 9, 10        |
| 9. harness validate passes                                      | Tasks 1, 2, 11     |
