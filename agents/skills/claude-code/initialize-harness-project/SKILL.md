# Initialize Harness Project

> Scaffold a new harness-compliant project or migrate an existing project to the next adoption level. Assess current state, configure personas, generate AGENTS.md, and validate the result.

## When to Use

- Starting a brand new project that should be harness-managed from day one
- Migrating an existing project to harness for the first time
- Upgrading an existing harness project from one adoption level to the next (basic to intermediate, intermediate to advanced)
- When `on_project_init` triggers fire
- NOT when the project is already at the desired adoption level (use harness-onboarding to orient instead)
- NOT when adding a single component to an existing harness project (use add-harness-component)
- NOT when the project has no clear owner or maintainer — harness setup requires someone to own the constraints

## Process

### Phase 1: ASSESS — Determine Current State

1. **Check for existing harness configuration.** Look for `.harness/` directory, `AGENTS.md`, `harness.config.json`, and any skill definitions. Their presence determines whether this is a new project or a migration.

2. **For new projects:** Gather project context — language, framework, test runner, build tool. Ask the human if any of these are undecided. Do not assume defaults.

2b. **For existing projects with detectable frameworks:** Run `harness init` without flags first. The command auto-detects frameworks (FastAPI, Django, Gin, Axum, Spring Boot, Next.js, React+Vite, Vue, Express, NestJS) by scanning project files. Present the detection result to the human and ask for confirmation before proceeding. If detection fails, ask the human to specify `--framework` manually.

3. **For existing projects:** Run `harness validate` to see what is already configured and what is missing. Read `AGENTS.md` if it exists. Identify the current adoption level:
   - **Basic:** Has `AGENTS.md` and `harness.config.json` with project metadata. No layers, no skills, no dependency constraints.
   - **Intermediate:** Has layers defined, dependency constraints between layers, at least one custom skill. `harness check-deps` runs and passes.
   - **Advanced:** Has full persona configuration, custom skills for the team's workflows, state management, learnings capture, and CI integration for `harness validate`.

4. **Recommend the target adoption level.** For new projects, start with basic unless the team has harness experience. For existing projects, recommend one level up from current. Present the recommendation and wait for confirmation.

5. **Classify the project shape — product/service or test-suite?** Check these signals; if any match, the project is a test suite and the rest of this skill's flow changes:
   - Repo or package name matches `*test*`, `*-e2e*`, `*-qa*`, `*-automation*`
   - `package.json` has `@playwright/test`, `cypress`, `webdriverio`, `mocha`, or `testcafe` as a direct dep
   - Top-level `tests/`, `e2e/`, `specs/`, or `playwright/` directories are the primary source tree
   - Config files like `playwright.config.*`, `cypress.config.*`, `wdio.conf.*`
   - No production runtime — build output consumed only by other test repos (shared library)

   **If a test suite:** complete Phase 2 (scaffolding) here, then dispatch to `initialize-test-suite-project` for Phase 3 configuration and Phase 4 verification, then return here for Phase 4 step 4+ (knowledge graph, roadmap question, final commit). The test-suite skill owns archetype selection, layer variants, tags, reporters, and the custom report.

   **If a product/service:** continue with the rest of this skill as written.

### Phase 2: SCAFFOLD — Generate Project Structure

1. **Run `harness init` with the appropriate flags:**
   - New basic JS/TS project: `harness init --level basic`
   - With framework: `harness init --level basic --framework <framework>`
   - Non-JS language: `harness init --language <python|go|rust|java>`
   - Non-JS with framework: `harness init --framework <fastapi|django|gin|axum|spring-boot>`
   - Existing project (auto-detect): `harness init` (no flags -- auto-detection runs)
   - Migration to intermediate: `harness init --level intermediate --migrate`
   - Migration to advanced: `harness init --level advanced --migrate`

   **Supported frameworks:** nextjs, react-vite, vue, express, nestjs, fastapi, django, gin, axum, spring-boot
   **Supported languages:** typescript, python, go, rust, java

2. **Review generated files.** `harness init` creates:
   - `harness.config.json` — Project configuration (name, stack, adoption level)
   - `.harness/` directory — State and learnings storage
   - `AGENTS.md` — Agent instructions (template, needs customization)
   - Layer definitions (intermediate and above)
   - Dependency constraints (intermediate and above)

3. **Do not blindly accept generated content.** Read the generated `AGENTS.md` and `harness.config.json`. Flag anything that looks wrong or incomplete. The scaffolded output is a starting point, not a finished product.

### Phase 3: CONFIGURE — Customize for the Project

1. **Configure personas.** Run `harness persona generate` to create persona definitions based on the project's stack and team structure. Personas define how agents should behave in this project — coding style, communication preferences, constraint strictness.

2. **Customize AGENTS.md.** The generated template needs project-specific content:
   - Project description and purpose
   - Architecture overview (components, layers, data flow)
   - Key conventions the team follows
   - Known constraints and forbidden patterns
   - Links to relevant documentation

3. **For intermediate and above:** Define layer boundaries. Which modules belong to which layers? What are the allowed import directions? Document these in `harness.config.json` and ensure they match the actual codebase structure.

4. **For advanced:** Configure state management (`.harness/state.json` schema), learnings capture (`.harness/learnings.md` conventions), and CI integration hooks.

5. **Configure i18n (all levels).** Ask: "Will this project support multiple languages?" Based on the answer:
   - **Yes:** Invoke `harness-i18n-workflow` configure phase to set up i18n config in `harness.config.json` (source locale, target locales, framework, strictness). Then invoke `harness-i18n-workflow` scaffold phase to create translation file structure and extraction config. Set `i18n.enabled: true`.
   - **No:** Set `i18n.enabled: false` in `harness.config.json`. The `harness-i18n-process` skill will still fire gentle prompts for unconfigured projects when features touch user-facing strings.
   - **Not sure yet:** Skip i18n configuration entirely. Do not set `i18n.enabled`. The project can enable i18n later by running `harness-i18n-workflow` directly.

5b. **Configure design system (non-test-suite projects).** Ask: "Will this project have a UI requiring a design system?" Mirror the i18n step's three-way response shape. Use `emit_interaction`:

    ```json
    emit_interaction({
      type: "question",
      question: {
        text: "Will this project have a UI requiring a design system?",
        options: [
          {
            label: "Yes — capture design intent now",
            pros: ["Records platforms in harness.config.json", "harness-design-system fires automatically on first design-touching feature"],
            cons: ["One extra follow-up question (which platforms)"],
            risk: "low",
            effort: "low"
          },
          {
            label: "No — this project has no UI",
            pros: ["No future design nudges", "Permanent decline recorded"],
            cons: ["Re-running init is required if a UI is added later"],
            risk: "low",
            effort: "low"
          },
          {
            label: "Not sure yet",
            pros: ["Decision deferred without commitment", "Can run harness-design-system later"],
            cons: ["No design.enabled flag set; on_new_feature will prompt later"],
            risk: "low",
            effort: "low"
          }
        ],
        recommendation: { optionIndex: 0, reason: "Most product/service projects benefit from a centralized design system", confidence: "medium" }
      }
    })
    ```

    Based on the answer:
    - **Yes:** Ask a follow-up: "Which platforms? `web`, `mobile`, or both?" Write `design.enabled: true` and `design.platforms: [...]` (a non-empty array of `web` and/or `mobile`) to `harness.config.json`. Inform the user: "Design tokens will be generated when you start your first design-touching feature — `harness-design-system` fires automatically via `on_new_feature`."
    - **No:** Write `design.enabled: false` to `harness.config.json`. Do not write `design.platforms`. The `on_new_feature` trigger respects this flag and will not fire `harness-design-system`.
    - **Not sure yet:** Do not write `design.enabled` or `design.platforms`. The project can enable design later by running `harness-design-system` directly; `on_new_feature` will prompt gently when a feature touches user-facing UI.

    **Skip this step entirely if Phase 1 step 5 classified the project as a test suite.** Test-suite projects have already been routed via Phase 3 step 6 to `initialize-test-suite-project` and have no UI to govern.

6. **Test-suite projects only — dispatch to `initialize-test-suite-project`.** If Phase 1 step 5 classified this as a test suite, invoke `initialize-test-suite-project` now and let it own archetype selection, shared-library decision, layer variants (A self-contained vs B consumer), ESLint flat-config fix, tag taxonomy, reporter stack, custom report, and the "prove the guards fire" verification. Return here for Phase 4 step 4+ (knowledge graph, roadmap, commit). Product and service projects skip this step entirely.

### Phase 4: VALIDATE — Confirm Everything Works

1. **Run `harness validate`** to verify the full configuration. This checks:
   - `harness.config.json` schema validity
   - `AGENTS.md` presence and required sections
   - Layer definitions (if intermediate+)
   - Dependency constraints (if intermediate+)
   - Persona configuration (if configured)

2. **Fix any validation errors before finishing.** Do not leave the project in a half-configured state.

3. **Run `harness check-deps`** (intermediate and above) to verify dependency constraints match the actual codebase. If there are violations, decide with the human: update the constraints or fix the code.

### Build the Initial Knowledge Graph

If the project will use graph-based queries, build the initial knowledge graph now:

```
harness scan [path]
```

This creates the `.harness/graph/` directory and populates it with the project's dependency and relationship data. Subsequent graph queries (impact analysis, dependency health, test advisor) depend on this initial scan.

4. **Set up project roadmap.** Ask: "Set up a project roadmap now? `docs/roadmap.md` tracks features, milestones, and status across your specs and plans." Use `emit_interaction`:

   ```json
   emit_interaction({
     type: "question",
     question: {
       text: "Set up a project roadmap now?",
       options: [
         {
           label: "Yes — create docs/roadmap.md now",
           pros: ["Roadmap visible from day one", "Future specs auto-discovered on next sync"],
           cons: ["Adds one file to the initial commit"],
           risk: "low",
           effort: "low"
         },
         {
           label: "No — skip for now",
           pros: ["Smaller initial footprint"],
           cons: ["Run `/harness:roadmap --create` later when ready"],
           risk: "low",
           effort: "low"
         }
       ],
       recommendation: { optionIndex: 0, reason: "Validation has just passed — a tangible 'project works' signal is the right moment to introduce planning artifacts", confidence: "medium" }
     }
   })
   ```

   Based on the answer:
   - **Yes:** Invoke `harness-roadmap` (skill) or run `/harness:roadmap --create` to create `docs/roadmap.md`. Verify the file exists. The `manage_roadmap` MCP tool is for managing entries in an existing roadmap, not for creating one.
     - **If `design.enabled === true` in `harness.config.json`** (set by Phase 3 step 5b), call `manage_roadmap` with `action: add`, `feature: "Set up design system"`, `status: "planned"`, `milestone: "Current Work"`, `summary: "Run harness-design-system to define palette, typography, and generate W3C DTCG tokens. Deferred from project init — fires on first design-touching feature via on_new_feature."`. Skip silently if `manage_roadmap show` reports a duplicate `(feature, milestone)` pair. This closes the loop between deferred design intent and visible planning work.
   - **No:** Skip silently. The user can still run `/harness:roadmap --create` later — that informational fallback remains valid.

5. **Commit the initialization.** All generated and configured files in a single commit.

## Harness Integration

- **`harness init --level <level> [--framework <framework>] [--language <language>]`** — Scaffold a new project. `--framework` infers language automatically. `--language` without `--framework` gives a bare language scaffold. Running without flags on an existing project directory triggers auto-detection.
- **`harness init --level <level> --migrate`** — Migrate an existing project to the next adoption level, preserving existing configuration.
- **`harness persona generate`** — Generate persona definitions based on project stack and team structure.
- **`harness validate`** — Verify the full project configuration is valid and complete.
- **`harness check-deps`** — Verify dependency constraints match the actual codebase (intermediate and above).
- **`harness-i18n-workflow configure` + `harness-i18n-workflow scaffold`** — Invoked during Phase 3 if the project will support multiple languages. Sets up i18n configuration and translation file structure.
- **`harness-design-system` (deferred via `on_new_feature`)** — Phase 3 step 5b records `design.enabled` + `design.platforms` in `harness.config.json` but does NOT run the full design-system skill. Token generation defers to the first design-touching feature, where `harness-design-system` fires via `on_new_feature` and reads `design.enabled` to decide whether to proceed.
- **`initialize-test-suite-project`** — Sub-skill. Invoked during Phase 3 step 6 when Phase 1 step 5 classified the project as a test suite. Owns archetype selection, shared-library vs in-repo decision, layer variants, tag taxonomy, reporter stack, custom report, and "prove the guards fire" verification.
- **`harness-roadmap` skill** — Phase 4 step 4 invokes this skill (or `/harness:roadmap --create`) when the user opts in to creating `docs/roadmap.md`. The `manage_roadmap` MCP tool does not create roadmaps; it manages entries in an existing one.
- **`manage_roadmap` MCP tool** — Phase 4 step 4, when `design.enabled === true`, calls `manage_roadmap` with `action: add` to insert a `planned` "Set up design system" item under milestone `Current Work` with a summary describing the deferred work.

## Success Criteria

- `harness.config.json` exists and passes schema validation
- `AGENTS.md` exists with project-specific content (not just the template)
- `.harness/` directory exists with appropriate state files
- `harness validate` passes with zero errors
- `harness check-deps` passes (intermediate and above)
- Personas are configured if the project uses them
- The adoption level matches what was agreed upon with the human
- All generated files are committed in a single atomic commit
- i18n configuration is set if the human chose to enable it during init
- For non-test-suite projects, the design-system question was asked and `harness.config.json` reflects the answer: `design.enabled: true` (with `design.platforms` populated) for yes, `design.enabled: false` for no, or absent for not-sure.
- The roadmap question was asked. If the user answered yes, `docs/roadmap.md` exists and was created via `manage_roadmap` (or the documented `/harness:roadmap --create` fallback).
- When `design.enabled === true` AND the user answered yes to the roadmap question, `docs/roadmap.md` contains a `planned` entry titled "Set up design system" under milestone `Current Work` with a summary describing the deferred work. The entry is absent in all other answer combinations.
- For test suites: `initialize-test-suite-project` ran to completion and its Success Criteria are also met

## Rationalizations to Reject

| Rationalization                                                          | Why It Is Wrong                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "The generated AGENTS.md template looks fine -- no need to customize it" | Phase 3 says do not blindly accept generated content. Without project-specific descriptions, agents receive generic instructions.                                                                                                                                               |
| "We should start at the advanced level since we want full coverage"      | The skill recommends basic for new projects. Each level builds on the previous. Jumping to advanced creates misconfigured rules.                                                                                                                                                |
| "I will skip the i18n question to keep setup fast"                       | Phase 3 requires asking about i18n and recording the decision. Skipping creates ambiguity about whether the omission was intentional.                                                                                                                                           |
| "I will skip the design-system question to keep setup fast"              | Phase 3 step 5b requires asking about design and recording the answer in `design.enabled`. Skipping creates ambiguity about whether the omission was intentional and bypasses the linkage between init and the deferred `harness-design-system` invocation on `on_new_feature`. |
| "Validation passed, so the project is ready"                             | Phase 4 includes harness check-deps for intermediate+ projects and knowledge graph initialization. Validation alone is not sufficient.                                                                                                                                          |
| "This is a test suite, we'll configure layers in this skill"             | Phase 3 step 6 dispatches to `initialize-test-suite-project` for archetype selection, layer variants, and the rest. Do not inline test-suite-specific configuration here — the sub-skill owns it and carries the gotchas.                                                       |

## Examples

### Example: New TypeScript Project (Basic Level)

**ASSESS:**

```
Human: "I'm starting a new TypeScript API project using Express and Vitest."
Check for .harness/ — not found. This is a new project.
Recommend: basic level (new project, start simple).
Human confirms: "Basic is fine for now."
```

**SCAFFOLD:**

```bash
harness init --level basic --framework express
# Creates: harness.config.json, .harness/, AGENTS.md (template)
```

**CONFIGURE:**

```
Edit AGENTS.md:
  - Add project description: "REST API for widget management"
  - Add stack: TypeScript, Express, Vitest, PostgreSQL
  - Add conventions: "Use zod for validation, repository pattern for data access"
  - Add constraints: "No direct SQL queries outside repository layer"
  - Ask: "Will this project support multiple languages?"
  - Human: "Yes, Spanish and French."
  - Run harness-i18n-workflow configure (source: en, targets: es, fr)
  - Run harness-i18n-workflow scaffold (creates locales/ directory structure)
```

**VALIDATE:**

```bash
harness validate  # Pass — basic level checks satisfied
git add harness.config.json .harness/ AGENTS.md
git commit -m "feat: initialize harness project at basic level"
```

### Example: New TypeScript Web App with Design and Roadmap

**ASSESS:**

```
Human: "I'm starting a new Next.js web app. Single-language, but it definitely needs a design system."
Check for .harness/ — not found. Recommend: basic level.
Phase 1 step 5 classification: not a test suite (Next.js app with src/, no playwright/cypress).
```

**SCAFFOLD:**

```bash
harness init --level basic --framework nextjs
```

**CONFIGURE (Phase 3):**

```
Step 5 (i18n): "Will this project support multiple languages?"
  Human: "No, English only."
  Result: i18n.enabled = false in harness.config.json.

Step 5b (design): "Will this project have a UI requiring a design system?"
  Human: "Yes."
  Follow-up: "Which platforms? web, mobile, or both?"
  Human: "Web."
  Result: design.enabled = true, design.platforms = ["web"] in harness.config.json.
  Inform: "Design tokens will be generated when you start your first design-touching
  feature — harness-design-system fires automatically via on_new_feature."

Step 6 (test-suite dispatch): skipped (not a test suite).
```

**VALIDATE (Phase 4):**

```
Step 1: harness validate — pass.
Step 3: harness check-deps — pass (basic level, no constraints yet).
Build initial knowledge graph: harness scan — graph populated.

Step 4 (roadmap): "Set up a project roadmap now?"
  Human: "Yes."
  Invoke harness-roadmap (or /harness:roadmap --create) — docs/roadmap.md created.
  design.enabled === true detected → manage_roadmap action: add
    feature: "Set up design system"
    status: planned
    milestone: Current Work
    summary: "Run harness-design-system to define palette, typography, and generate W3C DTCG tokens..."
  Result: docs/roadmap.md contains the planned design item.

Step 5: commit.
```

```bash
git add harness.config.json .harness/ AGENTS.md docs/roadmap.md
git commit -m "feat: initialize harness project with design and roadmap"
```

**Final state:** `harness.config.json` has `design.enabled: true` + `design.platforms: ["web"]`; `docs/roadmap.md` lists "Set up design system" as a `planned` item under `Current Work`; on the first feature touching UI, `on_new_feature` fires `harness-design-system` which reads `design.enabled` and runs the full discover/define/generate/validate flow.

### Example: Migrating Existing Project from Basic to Intermediate

**ASSESS:**

```
Read harness.config.json — level: basic
Read AGENTS.md — exists, has project-specific content
Run: harness validate — passes at basic level
Recommend: intermediate (add layers and dependency constraints)
Human confirms: "Yes, we're ready for layers."
```

**SCAFFOLD:**

```bash
harness init --level intermediate --migrate
# Preserves existing harness.config.json and AGENTS.md
# Adds: layer definitions template, dependency constraints template
```

**CONFIGURE:**

```
Define layers in harness.config.json:
  - presentation: src/routes/, src/middleware/
  - business: src/services/, src/models/
  - data: src/repositories/, src/db/

Define constraints:
  - presentation → business (allowed)
  - business → data (allowed)
  - data → presentation (forbidden)
  - presentation → data (forbidden — must go through business)

Update AGENTS.md with layer documentation.
```

**VALIDATE:**

```bash
harness validate      # Pass — intermediate level checks satisfied
harness check-deps    # Pass — no constraint violations in existing code
git add -A
git commit -m "feat: migrate harness project to intermediate level with layers"
```

### Example: Adoption Level Progression

**Basic (start here):**

- `AGENTS.md` with project context
- `harness.config.json` with metadata
- `harness validate` runs in development

**Intermediate (add structure):**

- Layer definitions and boundaries
- Dependency constraints enforced by `harness check-deps`
- At least one custom skill for team workflows

**Advanced (full integration):**

- Persona configuration for consistent agent behavior
- State management across sessions
- `.harness/learnings.md` capturing institutional knowledge
- `harness validate` runs in CI pipeline
- Custom skills for all common team workflows
