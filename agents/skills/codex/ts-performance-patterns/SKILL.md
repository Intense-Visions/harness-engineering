# TypeScript Performance Patterns

> Reduce TypeScript compilation time and type complexity with targeted optimizations

## When to Use

- TypeScript compilation or IDE type-checking is noticeably slow
- Complex generic types cause "type instantiation is excessively deep" errors
- Large monorepos need faster incremental builds
- IDE autocompletion or hover information is sluggish

## Instructions

1. **Enable incremental compilation:**

```json
{
  "compilerOptions": {
    "incremental": true,
    "tsBuildInfoFile": ".tsbuildinfo"
  }
}
```

2. **Enable `skipLibCheck`** to skip type-checking `.d.ts` files:

```json
{ "compilerOptions": { "skipLibCheck": true } }
```

This is the single biggest compilation speed improvement for most projects.

3. **Use project references** to parallelize and cache builds:

```json
{ "references": [{ "path": "packages/a" }, { "path": "packages/b" }] }
```

Build with `tsc --build` for dependency-aware parallel compilation.

4. **Simplify deep generic types** — break deeply nested generics into named intermediate types:

```typescript
// Slow: deeply nested inline generics
type Bad = Map<string, Array<Promise<Result<Map<string, Set<number>>>>>>;

// Fast: named intermediates
type NumberSets = Map<string, Set<number>>;
type ResultPromises = Array<Promise<Result<NumberSets>>>;
type Good = Map<string, ResultPromises>;
```

5. **Avoid recursive types that expand exponentially:**

```typescript
// Can cause "type instantiation excessively deep" errors
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

// Add a depth limiter
type DeepPartial<T, D extends number = 5> = D extends 0
  ? T
  : { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K], Prev[D]> : T[K] };
type Prev = [never, 0, 1, 2, 3, 4, 5];
```

6. **Use interfaces over type aliases** for object types — interfaces are more efficiently cached:

```typescript
// Faster — interface declaration is cached by name
interface User {
  id: string;
  name: string;
  email: string;
}

// Slower — type alias is re-evaluated each time it's referenced
type User = { id: string; name: string; email: string };
```

7. **Limit union type size** — unions with >25 members can slow down type checking significantly. Group related types:

```typescript
// Slow: 50-member union
type Event = EventA | EventB | EventC | ... | EventAX;

// Faster: grouped unions
type UserEvent = UserCreated | UserUpdated | UserDeleted;
type OrderEvent = OrderPlaced | OrderShipped | OrderCancelled;
type Event = UserEvent | OrderEvent;
```

8. **Use `isolatedModules`** for fast single-file transpilation with esbuild or swc:

```json
{ "compilerOptions": { "isolatedModules": true } }
```

9. **Exclude unnecessary files** from compilation:

```json
{
  "include": ["src"],
  "exclude": ["node_modules", "dist", "**/*.test.ts", "**/*.stories.ts"]
}
```

10. **Profile the compiler** to find bottlenecks:

```bash
tsc --generateTrace ./trace
# Open chrome://tracing and load the trace JSON
```

## Details

TypeScript's type-checker is a constraint solver that runs at compile time. Complex types (deep generics, large unions, recursive mapped types) can cause exponential computation.

**Common performance killers:**

- Recursive conditional types without depth limits
- Large template literal type Cartesian products
- Hundreds of overloaded function signatures
- Deeply nested `infer` chains
- `@ts-ignore` on incorrect code (the checker still processes it)

**Interface vs type alias performance:** Interfaces create named cached entries in the type checker. When the same interface is referenced multiple times, the checker reuses the cached result. Type aliases with intersection types (`A & B & C`) must be re-flattened at each use site.

**`skipLibCheck` justification:** Third-party `.d.ts` files rarely change between builds, and their type errors are not actionable by your team. Skipping them saves 20-40% of compilation time on typical projects.

**Project references trade-offs:**

- Pros: parallel builds, cached compilation, explicit dependency graph
- Cons: more config files, `composite: true` requirement, declaration files must be generated
- Best for: monorepos with 3+ packages. Overkill for single-package projects

**Measuring improvement:** Run `tsc --noEmit --diagnostics` to see check time, program size, and memory usage. Compare before and after optimizations.

## Source

https://typescriptlang.org/docs/handbook/performance.html

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
