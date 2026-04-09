# TypeScript Decorator Patterns

> Implement class, method, and property decorators with reflect-metadata in TypeScript

## When to Use

- Adding cross-cutting concerns (logging, validation, caching) to classes and methods
- Working with frameworks that use decorators (NestJS, TypeORM, Angular)
- Implementing dependency injection with metadata reflection
- Creating reusable, declarative annotations for class members

## Instructions

1. **Enable decorators** in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

2. **Class decorator** — wraps or replaces the class constructor:

```typescript
function Sealed(constructor: Function) {
  Object.seal(constructor);
  Object.seal(constructor.prototype);
}

@Sealed
class Greeter {
  greeting: string;
  constructor(message: string) {
    this.greeting = message;
  }
}
```

3. **Method decorator** — intercepts method calls:

```typescript
function Log(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const original = descriptor.value;
  descriptor.value = function (...args: any[]) {
    console.log(`Calling ${propertyKey} with`, args);
    const result = original.apply(this, args);
    console.log(`${propertyKey} returned`, result);
    return result;
  };
}

class Calculator {
  @Log
  add(a: number, b: number): number {
    return a + b;
  }
}
```

4. **Property decorator:**

```typescript
function MinLength(min: number) {
  return function (target: any, propertyKey: string) {
    let value: string;
    Object.defineProperty(target, propertyKey, {
      get: () => value,
      set: (newValue: string) => {
        if (newValue.length < min) throw new Error(`${propertyKey} must be at least ${min} chars`);
        value = newValue;
      },
    });
  };
}

class User {
  @MinLength(3)
  name: string = '';
}
```

5. **Parameter decorator** — marks parameters for injection or validation:

```typescript
function Inject(token: string) {
  return function (target: any, propertyKey: string | undefined, parameterIndex: number) {
    const existingInjections = Reflect.getOwnMetadata('injections', target) || [];
    existingInjections.push({ index: parameterIndex, token });
    Reflect.defineMetadata('injections', existingInjections, target);
  };
}
```

6. **Decorator factory** — return a decorator from a function to accept configuration:

```typescript
function Retry(attempts: number, delay: number) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const original = descriptor.value;
    descriptor.value = async function (...args: any[]) {
      for (let i = 0; i < attempts; i++) {
        try {
          return await original.apply(this, args);
        } catch (e) {
          if (i === attempts - 1) throw e;
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    };
  };
}

class ApiClient {
  @Retry(3, 1000)
  async fetchData(): Promise<Data> {
    /* ... */
  }
}
```

7. **Decorator composition** — decorators apply bottom-up:

```typescript
class Service {
  @Log // Applied second (outer)
  @Retry(3, 100) // Applied first (inner)
  async getData(): Promise<Data> {
    /* ... */
  }
}
```

## Details

TypeScript decorators are an implementation of the TC39 Stage 3 decorators proposal (legacy version). They execute at class definition time, not at runtime method invocation.

**Decorator execution order:**

1. Parameter decorators (left to right per parameter)
2. Method and property decorators (top to bottom per class member)
3. Class decorators (bottom to top if multiple)

**`emitDecoratorMetadata`** uses `reflect-metadata` to emit type information that decorators can read at runtime. This powers dependency injection in NestJS and TypeORM. Install `reflect-metadata` and import it once at the entry point.

**TC39 Stage 3 decorators (2023+):** TypeScript 5.0+ supports the new standard decorators syntax WITHOUT `experimentalDecorators`. The new syntax is different from the legacy syntax — they use a different function signature and do not support parameter decorators or metadata emission by default.

**Legacy vs Stage 3:**

- Legacy: `function Dec(target, key, descriptor)` — widely used in NestJS, Angular, TypeORM
- Stage 3: `function Dec(value, context)` — new standard, limited framework adoption so far
- If you use NestJS or Angular, continue with `experimentalDecorators: true`

**Trade-offs:**

- Decorators add powerful metaprogramming capabilities — but hide behavior behind annotations
- `emitDecoratorMetadata` increases bundle size with reflection metadata
- Decorator type safety is limited — the decorator function signature uses `any` for targets
- Debuggability suffers when multiple decorators transform a method — stack traces point to the decorator wrapper, not the original method

## Source

https://typescriptlang.org/docs/handbook/decorators.html

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
