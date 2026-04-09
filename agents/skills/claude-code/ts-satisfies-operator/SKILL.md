# TypeScript Satisfies Operator

> Validate objects against a type without widening using the satisfies keyword

## When to Use

- Validating configuration objects while preserving literal types
- Checking that a value conforms to a type without losing specific type information
- Ensuring exhaustive key coverage in record-like objects
- Replacing `as const` + type annotation patterns with a cleaner alternative

## Instructions

1. **Basic usage** — validate without widening:

```typescript
type Color = 'red' | 'green' | 'blue';
type Colors = Record<string, Color>;

// With type annotation — loses specific key information
const colors: Colors = { primary: 'red', secondary: 'blue' };
colors.tertiary; // No error — any string key is valid

// With satisfies — preserves exact keys AND validates values
const colors = {
  primary: 'red',
  secondary: 'blue',
} satisfies Colors;

colors.primary; // Type: 'red' (not just Color)
colors.tertiary; // Error: property does not exist
```

2. **Configuration objects** — validate shape while keeping literal types:

```typescript
type Route = {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
};

const routes = {
  getUser: { path: '/users/:id', method: 'GET' },
  createUser: { path: '/users', method: 'POST' },
} satisfies Record<string, Route>;

// routes.getUser.method is 'GET' (literal), not 'GET' | 'POST' | 'PUT' | 'DELETE'
```

3. **Combine with `as const`** for full immutability:

```typescript
const config = {
  port: 3000,
  host: 'localhost',
  features: ['auth', 'logging'],
} as const satisfies {
  port: number;
  host: string;
  features: readonly string[];
};

// config.port is 3000 (literal), config.features is readonly ['auth', 'logging']
```

4. **Exhaustive key checking** on enum-keyed objects:

```typescript
type Status = 'draft' | 'published' | 'archived';

const statusLabels = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
} satisfies Record<Status, string>;
// Error if any status is missing
```

5. **Validate callback shapes** without losing return type information:

```typescript
type Handler = (req: Request) => Response | Promise<Response>;

const handlers = {
  home: (req) => new Response('Hello'),
  api: async (req) => Response.json({ ok: true }),
} satisfies Record<string, Handler>;
```

6. **Narrow union types in objects:**

```typescript
type Config = {
  mode: 'development' | 'production';
  debug: boolean;
};

const devConfig = {
  mode: 'development',
  debug: true,
} satisfies Config;

// devConfig.mode is 'development' (literal), not 'development' | 'production'
```

## Details

The `satisfies` operator (TypeScript 4.9+) validates that an expression matches a type without changing the inferred type of the expression. This solves a long-standing tension in TypeScript between type validation and type inference.

**`satisfies` vs type annotation:**

- `const x: Type = value` — validates AND widens the type to `Type`. The specific value types are lost.
- `const x = value satisfies Type` — validates against `Type` but infers the type from `value`. Literal types, specific keys, and narrower unions are preserved.

**`satisfies` vs `as const`:**

- `as const` makes everything readonly and literal but does not validate against a type
- `satisfies` validates against a type but does not make values readonly
- `as const satisfies Type` does both — readonly, literal, and validated

**When to use which:**

- Use `: Type` when you want to enforce a type contract and do not need literals (function parameters, class properties)
- Use `satisfies Type` when you want validation AND literal preservation (config objects, route tables, enum maps)
- Use `as const satisfies Type` when you need immutability AND validation

**Trade-offs:**

- `satisfies` is less familiar to many developers — use it consistently and explain in code review
- Error messages from `satisfies` point to the mismatched property but can be verbose for complex types
- `satisfies` cannot be used with variable declarations that need explicit types for external consumption (exported API surfaces)

## Source

https://typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- The patterns described in this document are applied correctly in the implementation.
- Edge cases and anti-patterns listed in this document are avoided.
