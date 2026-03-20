# Enforce Architecture

> Validate architectural layer boundaries and detect dependency violations. No code may violate layer constraints — this is a hard gate, not a suggestion.

## When to Use

- Before approving any pull request or merge
- After writing new imports or module references
- When adding a new module or package to the project
- When `on_pre_commit` or `on_architecture_check` triggers fire
- After refactoring that moves code between layers or modules
- NOT when editing documentation, configuration, or non-code files
- NOT when the violation is intentional and requires a constraint update (escalate instead)

## Process

### Phase 1: Load Constraints

1. **Read `harness.config.json`** to understand the project's architectural constraints. The config defines:
   - **Layers** — ordered list of architectural layers (e.g., `ui -> service -> repository -> domain`)
   - **Dependency rules** — which layers may import from which (typically: layers may only import from layers below them)
   - **Forbidden imports** — specific import paths that are never allowed in certain contexts
   - **Boundary definitions** — which directories/packages belong to which layer

- **Design constraints** — when `design` config exists, also load design constraint rules:
  - Token compliance — components must reference design tokens, not hardcoded values
  - Accessibility compliance — color pairs must meet WCAG contrast ratios
  - Anti-pattern enforcement — project-specific anti-patterns from `design-system/DESIGN.md`
  - Platform binding — tokens must have appropriate platform bindings for enabled platforms

2. **Understand the layer model.** In a typical layered architecture:
   - Higher layers depend on lower layers (UI depends on Service, Service depends on Repository)
   - Lower layers NEVER depend on higher layers (Repository must not import from UI)
   - Same-layer imports may or may not be allowed depending on project config
   - Cross-cutting concerns (logging, config) have their own rules

### Graph-Enhanced Context (when available)

When a knowledge graph exists at `.harness/graph/`, use graph queries for faster, more accurate violation detection:

- `query_graph` — traverse `imports` edges against layer constraint nodes to find all violations in a single query
- `get_relationships` — find all code dependent on a violation target to show the full scope of impact

Graph queries show the complete violation scope (not just the first occurrence per file) and reveal transitive violations that single-file analysis misses. Fall back to file-based commands if no graph is available.

### Phase 2: Run Dependency Checks

1. **Run `harness check-deps`** to analyze all import statements against the constraint model. Capture the full JSON output.

2. **Parse the results.** Each violation includes:
   - The violating file and line number
   - The forbidden import target
   - The source layer and target layer
   - The specific rule being violated

### Phase 3: Analyze Violations

For each violation, determine:

1. **Which layers are involved.** Identify the source file's layer and the imported module's layer. Map them to the constraint model.

2. **What rule is violated.** Common violation types:
   - **Upward dependency** — a lower layer imports from a higher layer (e.g., repository importing from UI). This is the most serious type. It creates coupling that makes the lower layer untestable in isolation.
   - **Skip-layer dependency** — a layer reaches past its immediate neighbor (e.g., UI importing directly from Repository, bypassing Service). This breaks encapsulation and makes the middle layer pointless.
   - **Circular dependency** — two modules or layers depend on each other. This creates fragile coupling where changing either module risks breaking the other.
   - **Forbidden import** — a specific import that is explicitly banned (e.g., importing a database driver outside the repository layer). This prevents implementation details from leaking.
   - **Design constraint violation** — a component uses hardcoded values instead of design tokens, or violates a declared anti-pattern. Severity depends on `design.strictness` in config. These violations surface as DESIGN-xxx codes:
     - `DESIGN-001` [warn] — Hardcoded color/font/spacing instead of token reference
     - `DESIGN-002` [warn] — Value matches a project anti-pattern
     - `DESIGN-003` [error] — WCAG contrast ratio failure (error in strict mode)
     - `DESIGN-004` [info] — Missing platform binding for enabled platform

3. **Explain the impact.** For each violation, state:
   - WHY the constraint exists (what architectural property it protects)
   - WHAT would happen if the violation were allowed to persist
   - HOW it affects testability, maintainability, and changeability

### Phase 4: Guide Resolution

For each violation, provide a specific fix:

- **Upward dependency:** Introduce an interface or abstraction in the lower layer. The higher layer implements it; the lower layer depends only on the abstraction. Alternatively, use dependency injection.
- **Skip-layer dependency:** Route the call through the intermediate layer. Add a method to the Service layer that delegates to the Repository, then have the UI call the Service.
- **Circular dependency:** Break the cycle by extracting shared types into a common module that both can depend on, or restructure so the dependency flows in one direction only.
- **Forbidden import:** Replace the forbidden import with the approved alternative. If no alternative exists, the feature may need to live in a different layer.
- **Design constraint violation:** Replace hardcoded values with token references from `design-system/tokens.json`. For anti-pattern violations, consult `design-system/DESIGN.md` for the project's aesthetic intent and approved alternatives. For contrast failures, use `harness-accessibility` to find compliant color pairs.

## Common Violation Patterns

### Pattern: "I just need one thing from that layer"

A UI component imports a repository function directly because "it is just one query." Fix: add the query to the Service layer. The extra indirection is the architecture working correctly.

### Pattern: "Shared types across layers"

Two layers both need the same type definition. Fix: place shared types in the lowest layer that both depend on, or create a dedicated `types` or `shared` module at the bottom of the layer stack.

### Pattern: "Test utilities importing production code from wrong layer"

Test helpers import across layer boundaries for convenience. Fix: each layer's tests should only import from that layer and below. Test utilities should follow the same constraints as production code.

### Pattern: "Hardcoded colors in components"

A component uses `#3b82f6` directly instead of referencing `color.primary` from the design token system. Fix: import and reference the token. In Tailwind: use the token-mapped utility class. In CSS: use the custom property `var(--color-primary)`.

### Pattern: "Circular dependency through re-exports"

Module A re-exports from Module B, and Module B imports from Module A. The circular dependency is hidden by the re-export. Fix: identify the true dependency direction and remove the reverse path.

## Harness Integration

- **`harness check-deps`** — Primary tool. Analyzes all imports against the layer model defined in `harness.config.json`. Returns structured violation data including file, line, source layer, target layer, and rule violated.
- **`harness check-deps --json`** — Machine-readable output for automated pipelines. Use this when parsing results programmatically.
- **`harness validate`** — Includes dependency checking as part of full project validation. Use when you want a complete health check, not just architecture.
- **`harness-design-system`** — Provides the design token source of truth (`tokens.json`) that constraints validate against.
- **`harness-accessibility`** — Provides WCAG contrast validation used by DESIGN-003 constraints.
- **Design constraint category** — Controlled by `design.strictness` in `harness.config.json`. Design violations surface alongside architectural violations in the same report.

## Success Criteria

- `harness check-deps` reports zero violations
- All imports flow downward through the layer stack (or follow explicitly configured exceptions)
- No circular dependencies exist between modules or layers
- No forbidden imports are present anywhere in the codebase
- Every new module is assigned to the correct layer in the config
- The layer model in `harness.config.json` accurately reflects the intended architecture

## Examples

### Example: Service layer importing from UI layer

**Violation from `harness check-deps`:**

```
VIOLATION: Upward dependency
  File: src/services/user-service.ts:12
  Import: import { UserForm } from '../components/UserForm'
  Source layer: service (level 2)
  Target layer: ui (level 3)
  Rule: service layer must not depend on ui layer
```

**Impact:** The UserService now depends on a React component. It cannot be used in a CLI tool, a background job, or tested without a DOM. The service layer should be framework-agnostic.

**Resolution:**

```typescript
// BEFORE (violating)
import { UserForm } from '../components/UserForm';
const data = UserForm.defaultValues; // using UI defaults in service

// AFTER (fixed)
// Define the defaults where they belong — in the service layer
const DEFAULT_USER_DATA: UserInput = { name: '', email: '' };
```

### Example: Circular dependency between modules

**Violation from `harness check-deps`:**

```
VIOLATION: Circular dependency detected
  Cycle: src/services/order-service.ts -> src/services/inventory-service.ts -> src/services/order-service.ts
  order-service imports checkStock from inventory-service
  inventory-service imports getOrderQuantity from order-service
```

**Resolution:** Extract the shared concern into a new module:

```typescript
// src/services/stock-calculator.ts (new, shared module)
export function calculateRequiredStock(quantity: number, reserved: number): number {
  return quantity - reserved;
}
```

Both services import from `stock-calculator` instead of from each other. The cycle is broken.

## Gates

These are hard stops. Architecture violations are not warnings — they are errors.

- **No code with layer violations may be approved or merged.** If `harness check-deps` reports violations, the code must be fixed before it proceeds.
- **No new modules without layer assignment.** Every new directory or package must be mapped to a layer in `harness.config.json` before code is written in it.
- **No "temporary" violations.** There is no TODO for architecture. Either the code respects the constraints or it does not ship.
- **No suppressing violations without team approval.** If a violation needs to be allowed, the constraint in `harness.config.json` must be explicitly updated with a comment explaining why.

## Escalation

- **When a violation seems impossible to fix within the current architecture:** The architecture may need to evolve. Escalate to the human with a clear explanation of the constraint, the use case, and why they conflict. Propose options: update the constraint, restructure the code, or add a new layer.
- **When `harness check-deps` reports false positives:** Verify the layer assignments in `harness.config.json` are correct. If a file is assigned to the wrong layer, fix the config. If the tool is genuinely wrong, report the issue.
- **When fixing one violation creates another:** This usually indicates a deeper structural issue. Step back and look at the dependency graph as a whole rather than fixing violations one at a time.
- **When the team wants to change the layer model:** This is a significant architectural decision. All existing code must be migrated to the new model. Plan this as a dedicated refactoring effort, not a side task.
