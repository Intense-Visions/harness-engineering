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

1. **Check for existing harness configuration.** Look for `.harness/` directory, `AGENTS.md`, `harness.yaml`, and any skill definitions. Their presence determines whether this is a new project or a migration.

2. **For new projects:** Gather project context — language, framework, test runner, build tool. Ask the human if any of these are undecided. Do not assume defaults.

3. **For existing projects:** Run `harness validate` to see what is already configured and what is missing. Read `AGENTS.md` if it exists. Identify the current adoption level:
   - **Basic:** Has `AGENTS.md` and `harness.yaml` with project metadata. No layers, no skills, no dependency constraints.
   - **Intermediate:** Has layers defined, dependency constraints between layers, at least one custom skill. `harness check-deps` runs and passes.
   - **Advanced:** Has full persona configuration, custom skills for the team's workflows, state management, learnings capture, and CI integration for `harness validate`.

4. **Recommend the target adoption level.** For new projects, start with basic unless the team has harness experience. For existing projects, recommend one level up from current. Present the recommendation and wait for confirmation.

### Phase 2: SCAFFOLD — Generate Project Structure

1. **Run `harness init` with the appropriate flags:**
   - New basic project: `harness init --level basic --framework <framework>`
   - New intermediate project: `harness init --level intermediate --framework <framework>`
   - Migration to intermediate: `harness init --level intermediate --migrate`
   - Migration to advanced: `harness init --level advanced --migrate`

2. **Review generated files.** `harness init` creates:
   - `harness.yaml` — Project configuration (name, stack, adoption level)
   - `.harness/` directory — State and learnings storage
   - `AGENTS.md` — Agent instructions (template, needs customization)
   - Layer definitions (intermediate and above)
   - Dependency constraints (intermediate and above)

3. **Do not blindly accept generated content.** Read the generated `AGENTS.md` and `harness.yaml`. Flag anything that looks wrong or incomplete. The scaffolded output is a starting point, not a finished product.

### Phase 3: CONFIGURE — Customize for the Project

1. **Configure personas.** Run `harness persona generate` to create persona definitions based on the project's stack and team structure. Personas define how agents should behave in this project — coding style, communication preferences, constraint strictness.

2. **Customize AGENTS.md.** The generated template needs project-specific content:
   - Project description and purpose
   - Architecture overview (components, layers, data flow)
   - Key conventions the team follows
   - Known constraints and forbidden patterns
   - Links to relevant documentation

3. **For intermediate and above:** Define layer boundaries. Which modules belong to which layers? What are the allowed import directions? Document these in `harness.yaml` and ensure they match the actual codebase structure.

4. **For advanced:** Configure state management (`.harness/state.json` schema), learnings capture (`.harness/learnings.md` conventions), and CI integration hooks.

5. **Configure i18n (all levels).** Ask: "Will this project support multiple languages?" Based on the answer:
   - **Yes:** Invoke `harness-i18n-workflow` configure phase to set up i18n config in `harness.config.json` (source locale, target locales, framework, strictness). Then invoke `harness-i18n-workflow` scaffold phase to create translation file structure and extraction config. Set `i18n.enabled: true`.
   - **No:** Set `i18n.enabled: false` in `harness.config.json`. The `harness-i18n-process` skill will still fire gentle prompts for unconfigured projects when features touch user-facing strings.
   - **Not sure yet:** Skip i18n configuration entirely. Do not set `i18n.enabled`. The project can enable i18n later by running `harness-i18n-workflow` directly.

### Phase 4: VALIDATE — Confirm Everything Works

1. **Run `harness validate`** to verify the full configuration. This checks:
   - `harness.yaml` schema validity
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

4. **Mention roadmap.** After validation passes, inform the user: "When you are ready to set up a project roadmap, run `/harness:roadmap --create`. This creates a unified `docs/roadmap.md` that tracks features, milestones, and status across your specs and plans." This is informational only — do not create the roadmap automatically.

5. **Commit the initialization.** All generated and configured files in a single commit.

## Harness Integration

- **`harness init --level <level> --framework <framework>`** — Scaffold a new project at the specified adoption level.
- **`harness init --level <level> --migrate`** — Migrate an existing project to the next adoption level, preserving existing configuration.
- **`harness persona generate`** — Generate persona definitions based on project stack and team structure.
- **`harness validate`** — Verify the full project configuration is valid and complete.
- **`harness check-deps`** — Verify dependency constraints match the actual codebase (intermediate and above).
- **`harness-i18n-workflow configure` + `harness-i18n-workflow scaffold`** — Invoked during Phase 3 if the project will support multiple languages. Sets up i18n configuration and translation file structure.
- **Roadmap nudge** — After successful initialization, inform the user about `/harness:roadmap --create` for setting up project-level feature tracking. Informational only; does not create the roadmap.

## Success Criteria

- `harness.yaml` exists and passes schema validation
- `AGENTS.md` exists with project-specific content (not just the template)
- `.harness/` directory exists with appropriate state files
- `harness validate` passes with zero errors
- `harness check-deps` passes (intermediate and above)
- Personas are configured if the project uses them
- The adoption level matches what was agreed upon with the human
- All generated files are committed in a single atomic commit
- i18n configuration is set if the human chose to enable it during init

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
# Creates: harness.yaml, .harness/, AGENTS.md (template)
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
git add harness.yaml .harness/ AGENTS.md
git commit -m "feat: initialize harness project at basic level"
```

### Example: Migrating Existing Project from Basic to Intermediate

**ASSESS:**

```
Read harness.yaml — level: basic
Read AGENTS.md — exists, has project-specific content
Run: harness validate — passes at basic level
Recommend: intermediate (add layers and dependency constraints)
Human confirms: "Yes, we're ready for layers."
```

**SCAFFOLD:**

```bash
harness init --level intermediate --migrate
# Preserves existing harness.yaml and AGENTS.md
# Adds: layer definitions template, dependency constraints template
```

**CONFIGURE:**

```
Define layers in harness.yaml:
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
- `harness.yaml` with metadata
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
