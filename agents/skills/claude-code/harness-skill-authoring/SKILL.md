# Harness Skill Authoring

> Create and extend harness skills following the rich skill format. Define purpose, choose type, write skill.yaml and SKILL.md with all required sections, validate, and test.

## When to Use

- Creating a new skill for a team's recurring workflow
- Extending an existing skill with new phases, gates, or examples
- Converting an informal process ("how we do code reviews") into a formal harness skill
- When a team notices they repeat the same multi-step process and wants to codify it
- NOT when running an existing skill (use the skill directly)
- NOT when listing or discovering skills (use `harness skill list`)
- NOT when the process is a one-off task that will not recur

## Process

### Phase 1: DEFINE — Establish the Skill's Purpose

1. **Identify the recurring process.** What does the team do repeatedly? Name it. Describe it in one sentence. This becomes the skill's `description` in `skill.yaml` and the blockquote summary in `SKILL.md`.

2. **Define the scope boundary.** A good skill does one thing well. If the process has distinct phases that could be done independently, consider whether it should be multiple skills. Signs of a skill that is too broad: more than 6 phases, multiple unrelated triggers, trying to serve two different audiences.

3. **Identify the trigger conditions.** When should this skill activate?
   - `manual` — Only when explicitly invoked
   - `on_new_feature` — When starting a new feature
   - `on_bug_fix` — When fixing a bug
   - `on_pr_review` — When reviewing a pull request
   - `on_project_init` — When initializing or entering a project
   - Multiple triggers are fine if the skill genuinely applies to all of them

4. **Determine required tools.** What tools does the skill need? Common sets:
   - Read-only analysis: `Read`, `Glob`, `Grep`
   - Code modification: `Read`, `Write`, `Edit`, `Glob`, `Grep`, `Bash`
   - Full workflow: all of the above plus specialized tools

### Phase 2: CHOOSE TYPE — Rigid or Flexible

1. **Choose rigid when:**
   - The process has strict ordering that must not be violated
   - Skipping steps causes real damage (data loss, security holes, broken deployments)
   - Compliance or policy requires auditability of each step
   - The process includes mandatory checkpoints where human approval is needed
   - Examples: TDD cycle, deployment pipeline, security audit, database migration

2. **Choose flexible when:**
   - The process has recommended steps but the order can adapt to context
   - The agent should use judgment about which steps to emphasize
   - Different situations call for different subsets of the process
   - The process is more about guidelines than rigid procedure
   - Examples: code review, onboarding, brainstorming, project initialization

3. **Key difference in SKILL.md:** Rigid skills require `## Gates` and `## Escalation` sections. Flexible skills may omit them (though they can include them if useful).

### Phase 3: WRITE SKILL.YAML — Define Metadata

1. **Create the skill directory** under `agents/skills/<platform>/<skill-name>/`.

2. **Write `skill.yaml`** with all required fields:

```yaml
name: <skill-name> # Kebab-case, matches directory name
version: '1.0.0' # Semver
description: <one-line summary> # What this skill does
triggers:
  - <trigger-1>
  - <trigger-2>
platforms:
  - claude-code # Which agent platforms support this skill
tools:
  - <tool-1> # Tools the skill requires
  - <tool-2>
cli:
  command: harness skill run <skill-name>
  args:
    - name: <arg-name>
      description: <arg-description>
      required: <true|false>
mcp:
  tool: run_skill
  input:
    skill: <skill-name>
type: <rigid|flexible>
state:
  persistent: <true|false> # Does this skill maintain state across sessions?
  files:
    - <state-file-path> # List state files if persistent
depends_on:
  - <prerequisite-skill> # Skills that must be available (not necessarily run first)
```

3. **Validate the YAML.** Ensure proper indentation, correct field names, and valid values. The `name` field must match the directory name exactly.

### Phase 4: WRITE SKILL.MD — Author the Skill Content

1. **Start with the heading and summary:**

```markdown
# <Skill Name>

> <One-sentence description of what the skill does and why.>
```

2. **Write `## When to Use`.** Include both positive (when TO use) and negative (when NOT to use) conditions. Be specific. Negative conditions prevent misapplication and point to the correct alternative skill.

3. **Write `## Process`.** This is the core of the skill. Guidelines for writing good process sections:
   - **Use phases to organize.** Group related steps into named phases (e.g., ASSESS, IMPLEMENT, VERIFY). Each phase should have a clear purpose and completion criteria.
   - **Number every step.** Steps within a phase are numbered. This makes them referenceable ("go back to Phase 2, step 3").
   - **Be prescriptive about actions.** Say "Run `harness validate`" not "consider validating." Say "Read the file" not "you might want to read the file."
   - **Include decision points.** When the process branches, state the conditions clearly: "If X, do A. If Y, do B."
   - **State what NOT to do.** Prohibitions prevent common mistakes: "Do not proceed to Phase 3 if validation fails."
   - **For rigid skills:** Add an Iron Law at the top — the one inviolable principle. Then define phases with mandatory ordering and explicit gates between them.
   - **For flexible skills:** Describe the recommended flow but acknowledge that adaptation is expected. Focus on outcomes rather than exact commands.

4. **Write `## Harness Integration`.** List every harness CLI command the skill uses, with a brief description of when to use it. This section connects the skill to the harness toolchain.

5. **Write `## Success Criteria`.** Define how to know the skill was executed well. Each criterion should be observable and verifiable — not subjective.

6. **Write `## Examples`.** At least one concrete example showing the full process from start to finish. Use realistic project names, file paths, and commands. Show both the commands and their expected outputs.

7. **For rigid skills, write `## Gates`.** Gates are hard stops — conditions that must be true to proceed. Each gate should state what happens if violated. Format: "**<condition> = <consequence>.**"

8. **For rigid skills, write `## Escalation`.** Define when to stop and ask for help. Each escalation condition should describe the symptom, the likely cause, and what to report.

9. **Write `## Rationalizations to Reject`.** Every user-facing skill must include this section. It contains domain-specific rationalizations that prevent agents from skipping steps with plausible-sounding excuses. Format requirements:
   - **Table format:** `| Rationalization | Reality |` with a header separator row
   - **3-8 entries** per skill, each specific to the skill's domain
   - **No generic filler.** Every entry must address a rationalization that is plausible in the context of this specific skill
   - **Do not repeat universal rationalizations.** The following three are always in effect for all skills and must NOT appear in individual skill tables:

   | Rationalization         | Reality                                                                     |
   | ----------------------- | --------------------------------------------------------------------------- |
   | "It's probably fine"    | "Probably" is not evidence. Verify before asserting.                        |
   | "This is best practice" | Best practice in what context? Cite the source and confirm it applies here. |
   | "We can fix it later"   | If worth flagging, document now with a concrete follow-up plan.             |

   Example of a good domain-specific entry (for a code review skill):

   | Rationalization                               | Reality                                                                                                                                    |
   | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
   | "The tests pass so the logic must be correct" | Passing tests prove the tested paths work. They say nothing about untested paths, edge cases, or whether the tests themselves are correct. |

### Phase 5: VALIDATE — Verify the Skill

1. **Run `harness skill validate`** to check:
   - `skill.yaml` has all required fields and valid values
   - `SKILL.md` has all required sections (`## When to Use`, `## Process`, `## Harness Integration`, `## Success Criteria`, `## Examples`, `## Rationalizations to Reject`)
   - Rigid skills have `## Gates` and `## Escalation` sections
   - The `name` in `skill.yaml` matches the directory name
   - Referenced tools exist
   - Referenced dependencies exist

2. **Fix any validation errors.** Common issues:
   - Missing required section in `SKILL.md`
   - `name` field does not match directory name
   - Invalid trigger name
   - Missing `type` field in `skill.yaml`

3. **Test by running the skill:** `harness skill run <name>`. Verify it loads correctly and the process instructions make sense in context.

### Skill Quality Checklist

Evaluate every skill along two dimensions:

|                             | **Clear activation**                | **Ambiguous activation**                | **Missing activation** |
| --------------------------- | ----------------------------------- | --------------------------------------- | ---------------------- |
| **Specific implementation** | Good skill                          | Wasted — good instructions nobody finds | Broken                 |
| **Vague implementation**    | Trap — agents activate but flounder | Bad skill                               | Empty shell            |
| **Missing implementation**  | Stub                                | Stub                                    | Does not exist         |

- **Good skill** = clear activation + specific implementation. The agent knows when to use it and exactly what to do.
- **Clear activation + vague implementation** = trap. The skill fires correctly but the agent has no concrete instructions, leading to inconsistent results.
- **Ambiguous activation + specific implementation** = wasted. Great instructions that never get used because the agent does not know when to activate the skill.

Use this checklist as a final quality gate before declaring a skill complete.

## Harness Integration

- **`harness skill validate`** — Validate a skill's `skill.yaml` and `SKILL.md` against the schema and structure requirements.
- **`harness skill run <name>`** — Execute a skill to test it in context.
- **`harness skill list`** — List all available skills, useful for checking that a new skill appears after creation.
- **`harness add skill <name> --type <type>`** — Scaffold a new skill directory with template files (alternative to manual creation).

## Success Criteria

- `skill.yaml` exists with all required fields and passes schema validation
- `SKILL.md` exists with all required sections filled with substantive content (not placeholders)
- The skill name in `skill.yaml` matches the directory name
- `harness skill validate` passes with zero errors
- The process section has clear, numbered, actionable steps organized into phases
- When to Use includes both positive and negative conditions
- At least one concrete example demonstrates the full process
- Rigid skills include Gates and Escalation sections with specific conditions and consequences
- The skill can be loaded and run with `harness skill run <name>`

## Rationalizations to Reject

| Rationalization                                                         | Reality                                                                                                                                  |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| "This skill is too simple to need all required sections"                | Every section exists for a reason. A short section is fine; a missing section means the skill was not fully thought through.             |
| "The process section covers it — no need for explicit success criteria" | Process describes what to do. Success criteria describe how to know it worked. They serve different purposes.                            |
| "Rationalizations to Reject is meta — this skill does not need it"      | This section is required for all user-facing skills, including this one. No exceptions.                                                  |
| "I will add examples later once the skill is proven"                    | Examples are a required section. A skill without examples forces the agent to guess at correct behavior. Write at least one example now. |
| "The When to Use section is obvious from the name"                      | Negative conditions (when NOT to use) prevent misapplication. The skill name conveys nothing about boundary conditions.                  |

## Examples

### Example: Creating a Flexible Skill for Database Migration Review

**DEFINE:**

```
Process: The team reviews database migrations before applying them.
Scope: Review only — not creating or applying migrations.
Triggers: manual (invoked when a migration PR is opened).
Tools: Read, Glob, Grep, Bash.
```

**CHOOSE TYPE:** Flexible — the review steps can vary based on migration complexity. Some migrations need data impact analysis, others do not.

**WRITE skill.yaml:**

```yaml
name: review-db-migration
version: '1.0.0'
description: Review database migration files for safety and correctness
triggers:
  - manual
platforms:
  - claude-code
tools:
  - Read
  - Glob
  - Grep
  - Bash
cli:
  command: harness skill run review-db-migration
  args:
    - name: migration-file
      description: Path to the migration file to review
      required: true
mcp:
  tool: run_skill
  input:
    skill: review-db-migration
type: flexible
state:
  persistent: false
  files: []
depends_on: []
```

**WRITE SKILL.md:**

```markdown
# Review Database Migration

> Review database migration files for safety, correctness, and
> reversibility before they are applied to any environment.

## When to Use

- When a new migration file has been created and needs review
- When a migration PR is opened
- NOT when writing migrations (write first, then review)
- NOT when applying migrations to environments (that is a deployment concern)

## Process

### Phase 1: ANALYZE — Understand the Migration

1. Read the migration file completely...
   [... full process content ...]

## Harness Integration

- `harness validate` — Verify project health after migration review
  [... etc ...]
```

**VALIDATE:**

```bash
harness skill validate review-db-migration  # Pass
harness skill run review-db-migration       # Loads correctly
```

### Example: Creating a Rigid Skill for Release Deployment

**DEFINE:**

```
Process: Deploy a release to production. Strict ordering — cannot skip steps.
Triggers: manual.
Tools: Bash, Read, Glob.
```

**CHOOSE TYPE:** Rigid — skipping the smoke test or rollback verification step could cause production outages. Mandatory checkpoints for human approval before each environment promotion.

**WRITE SKILL.md (key rigid sections):**

```markdown
## Gates

- **Tests must pass before build.** If the test suite fails, do not
  proceed to build. Fix the tests first.
- **Staging must be verified before production.** If staging smoke tests
  fail, do not promote to production. Roll back staging and investigate.
- **Human approval required at each promotion.** Use [checkpoint:human-verify]
  before promoting from staging to production. No auto-promotion.

## Escalation

- **When staging smoke tests fail on a test that passed locally:**
  Report: "Smoke test [name] fails in staging but passes locally.
  Likely cause: environment-specific configuration or data difference.
  Need to investigate before proceeding."
- **When rollback verification fails:** This is critical. Report immediately:
  "Rollback to version [X] failed. Current state: [description].
  Manual intervention required."
```
