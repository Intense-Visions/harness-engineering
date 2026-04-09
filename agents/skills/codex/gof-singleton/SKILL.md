# GOF Singleton

> Ensure a class has exactly one instance using module-level singletons and WeakRef patterns.

## When to Use

- You need a single shared instance of a resource (database connection pool, logger, config)
- You want to control access to a shared resource and lazy-initialize it
- You see repeated `new Service()` calls across the codebase that all should share one instance
- NOT when you need one instance per request or per test (use dependency injection instead)

## Instructions

**Prefer module-level singletons over class-based singletons in TypeScript.** Node.js module caching gives you singleton behavior for free.

**Module-level singleton (preferred):**

```typescript
// db.ts — Node's module cache guarantees one instance
import { Pool } from 'pg';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
```

**Class-based singleton (when interface polymorphism matters):**

```typescript
class Logger {
  private static instance: Logger | null = null;
  private readonly prefix: string;

  private constructor(prefix: string) {
    this.prefix = prefix;
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger('[App]');
    }
    return Logger.instance;
  }

  log(message: string): void {
    console.log(`${this.prefix} ${new Date().toISOString()} ${message}`);
  }
}

// Usage
const logger = Logger.getInstance();
logger.log('Server started');
```

**Reset for testing — always expose a reset method or use a factory:**

```typescript
class ConfigStore {
  private static instance: ConfigStore | null = null;

  static getInstance(): ConfigStore {
    if (!ConfigStore.instance) {
      ConfigStore.instance = new ConfigStore();
    }
    return ConfigStore.instance;
  }

  // Only for tests — do not expose in production API
  static _reset(): void {
    ConfigStore.instance = null;
  }
}
```

**WeakRef variant (allows GC when no other references exist):**

```typescript
class ExpensiveCache {
  private static ref: WeakRef<ExpensiveCache> | null = null;

  static getInstance(): ExpensiveCache {
    const existing = ExpensiveCache.ref?.deref();
    if (existing) return existing;
    const instance = new ExpensiveCache();
    ExpensiveCache.ref = new WeakRef(instance);
    return instance;
  }
}
```

## Details

**Why module-level beats class-based:** TypeScript compiles to CommonJS or ESM. In CommonJS, `require()` caches modules — the first `require('./db')` runs the module, subsequent calls return the cached export. This is a singleton. In ESM, the module instance is also cached per URL. Class-based singletons add ceremony without benefit in most cases.

**Anti-patterns:**

- Global mutable state disguised as a singleton — prefer immutable config objects
- Singletons that make testing impossible — always allow injection or reset
- Singleton holding a connection without lifecycle management — always handle cleanup
- Thread-safe double-checked locking in TypeScript — Node.js is single-threaded, this is unnecessary

**When to use dependency injection instead:**

```typescript
// Prefer this for services that need to be tested or swapped
class OrderService {
  constructor(private readonly db: DatabasePool) {}
}

// Wire at app start
const db = getPool();
const orderService = new OrderService(db);
```

**Singleton vs. service locator:** A singleton is discoverable from anywhere; a service locator is explicit injection. Singletons are fine for infrastructure (logger, config, pool) but anti-patterns for business logic.

**Lazy initialization matters for startup cost:** Do not initialize singletons at import time if they open connections — use lazy `getInstance()` so tests don't need live infrastructure to import a module.

## Source

refactoring.guru/design-patterns/singleton

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
