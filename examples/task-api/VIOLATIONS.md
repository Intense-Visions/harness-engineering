# Try Breaking These Constraints

These exercises demonstrate how harness catches architectural violations in real time.

## 1. Layer Violation: Types importing from Services

In `src/types/task.ts`, add this import at the top:

```typescript
import { createTask } from '../services/task-service';
```

Then run:

```bash
npm run lint
```

**Expected:** `@harness-engineering/no-layer-violation` error. The types layer cannot import from services.

Remove the import when done.

## 2. Layer Violation: Services importing from API

In `src/services/task-service.ts`, add this import at the top:

```typescript
import { router } from '../api/routes';
```

Then run:

```bash
npm run lint
```

**Expected:** `@harness-engineering/no-layer-violation` error. The services layer cannot import from API.

Remove the import when done.

## 3. Forbidden Import

In `src/types/task.ts`, add this import at the top:

```typescript
import { router } from '../api/routes';
```

Then run:

```bash
npm run lint
```

**Expected:** `@harness-engineering/no-forbidden-imports` error. This matches the forbiddenImports rule in harness.config.json.

Remove the import when done.
