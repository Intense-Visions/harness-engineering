# Check Mechanical Constraints

> Run all mechanical constraint checks: linter rules, boundary schemas, and forbidden imports. These are automated, enforceable rules — if it can be checked by a machine, it must be.

## When to Use

- Before every commit (ideally via pre-commit hook)
- Before submitting a pull request for review
- After any code generation or automated refactoring
- When `on_pre_commit` or `on_validate` triggers fire
- After resolving merge conflicts (constraints may have been silently violated)
- NOT as a substitute for code review — mechanical constraints catch structural issues, not logic errors
- NOT when only editing non-code files (docs, config) unless those files have their own schema constraints

## Process

### Phase 1: Run All Checks

1. **Run `harness validate`** to check project-wide constraints: file structure, naming conventions, required files, and configuration validity.

2. **Run `harness linter validate`** to check all linter rules: code style, import restrictions, forbidden patterns, and boundary schemas.

3. **Run `harness check-deps`** to check architectural layer boundaries. This is included here because dependency violations are mechanical — they can be detected purely from import statements and the constraint config.

4. **Capture all output.** Combine results from all three commands into a single violation list for triage.

### Phase 2: Categorize Violations by Severity

Organize violations into three tiers:

**Tier 1 — Errors (must fix before commit):**

- Forbidden imports (importing banned modules)
- Layer boundary violations (importing across architectural boundaries)
- Schema violations (config files that do not match required schema)
- Missing required files (every package must have index.ts, etc.)

**Tier 2 — Warnings (must fix before merge):**

- Naming convention violations (wrong casing, wrong prefix)
- Import ordering issues
- Unused exports detected by linter
- Documentation file references that do not resolve

**Tier 3 — Info (fix when convenient):**

- Style suggestions (formatting that does not affect behavior)
- Complexity warnings (functions exceeding thresholds)
- Minor inconsistencies with project conventions

### Phase 3: Auto-Fix Where Safe

Some violations can be fixed automatically without risk:

- **Import ordering** — reorder imports to match the configured convention. This never changes behavior.
- **Formatting** — apply the project's formatter (prettier, etc.). Pure whitespace and style changes.
- **Simple forbidden imports** — when a forbidden import has a known replacement (e.g., `import lodash` to `import lodash-es`), apply the substitution.
- **Missing trailing commas, semicolons** — mechanical formatting fixes.

**Rules for auto-fix:**

- ONLY auto-fix violations that cannot change runtime behavior
- Run the test suite after auto-fixing to confirm nothing broke
- Present the auto-fix diff to the user for awareness (do not silently change code)
- If unsure whether a fix is safe, do NOT auto-fix — report it for manual resolution

### Phase 4: Report Remaining Violations

For each violation that was not auto-fixed, report:

1. **File and line number** — exact location of the violation
2. **Rule name** — which constraint was violated
3. **What it protects against** — why this rule exists (see reference below)
4. **How to fix** — specific guidance for resolving this type of violation
5. **Severity tier** — whether it blocks commit, merge, or is informational

## What Each Constraint Type Protects Against

### Forbidden Imports

**Protects against:** Implementation detail leakage and unwanted coupling. When a library is forbidden in a layer, it is because using it there would create a dependency that makes the layer harder to test, replace, or maintain. Example: forbidding `fs` in the UI layer ensures UI code never directly accesses the filesystem.

### Layer Boundaries

**Protects against:** Architectural erosion. Without enforced boundaries, codebases gradually become a tangle where everything depends on everything. Layer boundaries ensure changes in one area do not ripple unpredictably through the whole system.

### Boundary Schemas

**Protects against:** Configuration drift and invalid state. When config files must match a schema, you catch invalid configurations at lint time rather than at runtime. This prevents deployment failures and hard-to-debug runtime errors.

### Naming Conventions

**Protects against:** Cognitive overhead and inconsistency. Consistent naming means developers (human and AI) can predict file locations, function names, and module structure without searching. It also ensures automated tools that rely on naming patterns continue to work.

### Required File Rules

**Protects against:** Incomplete modules. When every package must have an `index.ts` or every component must have a test file, you ensure that the project structure remains complete and navigable.

### Import Ordering

**Protects against:** Merge conflicts and readability issues. Consistent import ordering reduces git conflicts when multiple developers add imports to the same file. It also makes imports scannable at a glance.

## Harness Integration

- **`harness validate`** — Project-wide structural validation. Checks file structure, naming conventions, required files, and configuration schemas.
- **`harness validate --json`** — Machine-readable output for parsing and categorization.
- **`harness linter validate`** — Runs all configured linter rules. Checks code patterns, import restrictions, and style conventions.
- **`harness check-deps`** — Architectural boundary enforcement. Checks all imports against the layer model.
- **`harness check-deps --json`** — Machine-readable dependency check output.

## Success Criteria

- All three commands (`harness validate`, `harness linter validate`, `harness check-deps`) pass with zero errors
- All Tier 1 violations are resolved before any commit
- All Tier 2 violations are resolved before any merge to main
- Auto-fixed changes are verified by running the test suite
- No violations are suppressed without explicit team approval and a documented reason

## Rationalizations to Reject

| Rationalization                                                                       | Why It Is Wrong                                                                                                                         |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| "This forbidden import is just for one utility function -- I will suppress it inline" | The gate says no suppressing rules without documentation. Undocumented suppressions accumulate and erode the constraint system.         |
| "The auto-fix looks right, so I do not need to re-run tests"                          | The gate says no auto-fix without test verification. Even import reordering can break code that depends on module initialization order. |
| "This is just a Tier 2 warning -- it can wait until after merge"                      | Tier 2 violations must be resolved before merge to main. Warnings that accumulate on main become the new baseline.                      |
| "The linter rule does not make sense for this project, so I will just disable it"     | Propose a config change with justification, do not disable the rule inline. Fix it at the configuration level.                          |

## Examples

### Example: Forbidden import detected

**Violation:**

```
ERROR [forbidden-import] src/components/Dashboard.tsx:3
  Import 'pg' is forbidden in layer 'ui'
  Rule: ui layer must not import database drivers
```

**What it protects against:** The UI layer importing a PostgreSQL driver means UI code could execute raw SQL queries, bypassing the service and repository layers entirely. This breaks testability (tests need a real database) and security (SQL injection risk from UI layer).

**Fix:** Remove the direct database call. Add the needed query to the appropriate repository, expose it through the service layer, and call the service from the UI component.

### Example: Auto-fixable import ordering

**Violation:**

```
WARNING [import-order] src/services/auth-service.ts:1-8
  Imports are not in the configured order
  Expected: builtin -> external -> internal -> relative
  Found: relative -> external -> builtin
```

**Auto-fix applied:**

```typescript
// BEFORE
import { hashPassword } from './utils';
import bcrypt from 'bcrypt';
import { createHash } from 'crypto';

// AFTER (auto-fixed)
import { createHash } from 'crypto';
import bcrypt from 'bcrypt';
import { hashPassword } from './utils';
```

Tests re-run: all passing. No behavioral change.

### Example: Schema violation in config

**Violation:**

```
ERROR [schema-violation] harness.config.json:24
  Property 'layers[2].allowedImports' must be an array of strings
  Found: number (42)
  Schema: harness-config-schema.json#/properties/layers/items/properties/allowedImports
```

**What it protects against:** An invalid config means `harness check-deps` will either crash or silently skip validation. The layer constraints would not be enforced, allowing violations to slip through undetected.

**Fix:** Correct the config value to be a valid string array: `"allowedImports": ["@shared/types", "@shared/utils"]`.

## Gates

These are hard stops. Mechanical constraints are non-negotiable.

- **No commits with Tier 1 violations.** Errors must be resolved before the code is committed. No exceptions.
- **No merges with Tier 2 violations.** Warnings must be resolved before merging to the main branch.
- **No suppressing rules without documentation.** If a rule must be disabled for a specific line or file, the suppression comment must explain WHY (not just disable the rule).
- **No auto-fix without test verification.** Every auto-fix must be followed by a test run to confirm no behavioral change.

## Escalation

- **When a rule seems wrong for the project:** Rules are configured in `harness.config.json` and linter configs. If a rule does not fit, propose a config change with justification. Do not disable the rule inline.
- **When a violation cannot be fixed without a larger refactor:** Document the violation, create a task for the refactor, and get team approval for a temporary inline suppression with a TODO linking to the task.
- **When auto-fix produces unexpected changes:** Undo the auto-fix, report the issue, and fix manually. Auto-fix tools are not infallible.
- **When multiple constraints conflict:** The stricter constraint wins. If `harness validate` says a file is required but `harness linter validate` says its contents violate a rule, fix the contents to satisfy both. Escalate if truly irreconcilable.
