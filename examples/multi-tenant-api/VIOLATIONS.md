# Try Breaking These Constraints

Advanced constraint exercises demonstrating the full range of harness enforcement.

## 1. Boundary Schema Violation

In `src/services/user-service.ts`, remove the Zod validation from `createUser`:

Replace:
```typescript
const validated = CreateUserSchema.parse(input);
```

With:
```typescript
const validated = input; // skip validation
```

Then run:

```bash
npm run lint
```

**Expected:** `@harness-engineering/require-boundary-schema` warning. Service functions must validate their inputs.

Restore the Zod validation when done.

## 2. Layer Violation

In `src/types/tenant.ts`, add this import:

```typescript
import { router } from '../api/routes';
```

Then run:

```bash
npm run lint
```

**Expected:** `@harness-engineering/no-layer-violation` and `@harness-engineering/no-forbidden-imports` errors. Types cannot import from API.

Remove the import when done.

## 3. Cross-Artifact Staleness

Edit `docs/specs/tenant-isolation.md` and add a new rule:

```markdown
6. All tenant data must be encrypted at rest
```

But don't implement it. Then run:

```bash
harness validate --cross-check
```

**Expected:** Warning about spec-to-implementation drift. The spec mentions encryption but no code implements it.

Remove the added rule when done.

## 4. Missing Documentation

In `src/services/user-service.ts`, remove the JSDoc comment from `createUser`:

```typescript
// Remove: /** Create a user scoped to a tenant... */
```

Then run:

```bash
npm run lint
```

**Expected:** `@harness-engineering/enforce-doc-exports` warning. Exported functions must have JSDoc.

Restore the JSDoc when done.
