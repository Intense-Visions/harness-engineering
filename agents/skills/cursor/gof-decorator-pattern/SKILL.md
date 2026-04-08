# GOF Decorator Pattern

> Attach additional behavior to objects at runtime by wrapping them in decorator objects.

## When to Use

- You want to add behavior to individual objects without affecting other objects of the same class
- Subclassing would create a combinatorial explosion of classes for each feature combination
- You need to stack multiple behaviors in a flexible order at runtime
- The behavior you're adding is cross-cutting (logging, caching, validation, retry) and belongs outside core logic

## Instructions

**Classic structural decorator:**

```typescript
// Component interface
interface DataSource {
  write(data: string): Promise<void>;
  read(): Promise<string>;
}

// Concrete component
class FileDataSource implements DataSource {
  constructor(private readonly path: string) {}

  async write(data: string): Promise<void> {
    // Write to file
    console.log(`Writing to ${this.path}: ${data}`);
  }

  async read(): Promise<string> {
    // Read from file
    return `data from ${this.path}`;
  }
}

// Base decorator — implements the interface and wraps a component
abstract class DataSourceDecorator implements DataSource {
  constructor(protected readonly wrapped: DataSource) {}

  async write(data: string): Promise<void> {
    return this.wrapped.write(data);
  }

  async read(): Promise<string> {
    return this.wrapped.read();
  }
}

// Concrete decorator: encryption
class EncryptionDecorator extends DataSourceDecorator {
  async write(data: string): Promise<void> {
    const encrypted = Buffer.from(data).toString('base64'); // simplified
    await this.wrapped.write(encrypted);
  }

  async read(): Promise<string> {
    const data = await this.wrapped.read();
    return Buffer.from(data, 'base64').toString('utf8'); // simplified
  }
}

// Concrete decorator: compression
class CompressionDecorator extends DataSourceDecorator {
  async write(data: string): Promise<void> {
    const compressed = `[compressed:${data}]`; // simplified
    await this.wrapped.write(compressed);
  }

  async read(): Promise<string> {
    const data = await this.wrapped.read();
    return data.replace(/^\[compressed:/, '').replace(/\]$/, '');
  }
}

// Stack decorators in any order
const source: DataSource = new CompressionDecorator(
  new EncryptionDecorator(new FileDataSource('/data/users.dat'))
);

await source.write('hello world');
```

**Function-based decorator (idiomatic TypeScript for async functions):**

```typescript
type AsyncFn<T extends unknown[], R> = (...args: T) => Promise<R>;

// Retry decorator
function withRetry<T extends unknown[], R>(
  fn: AsyncFn<T, R>,
  maxAttempts = 3,
  delayMs = 500
): AsyncFn<T, R> {
  return async (...args: T): Promise<R> => {
    let lastError: Error;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn(...args);
      } catch (err) {
        lastError = err as Error;
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, delayMs * attempt));
        }
      }
    }
    throw lastError!;
  };
}

// Cache decorator
function withCache<T extends unknown[], R>(fn: AsyncFn<T, R>, ttlMs = 60_000): AsyncFn<T, R> {
  const cache = new Map<string, { value: R; expiresAt: number }>();
  return async (...args: T): Promise<R> => {
    const key = JSON.stringify(args);
    const cached = cache.get(key);
    if (cached && Date.now() < cached.expiresAt) return cached.value;
    const value = await fn(...args);
    cache.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  };
}

// Compose decorators
const fetchUser = async (id: string): Promise<User> => {
  return db.users.findOneOrFail(id);
};

const robustFetchUser = withCache(withRetry(fetchUser, 3), 30_000);
```

## Details

**Decorator vs. Proxy:** Both wrap an object. The Decorator adds behavior; the Proxy controls access. In practice the implementation is similar — the distinction is intent. Use Decorator for feature stacking (logging, caching), use Proxy for access control (authorization, lazy loading).

**TypeScript class decorators vs. GOF Decorator pattern:** TypeScript's `@Decorator` syntax is a different mechanism (metaprogramming on class metadata). The GOF Decorator is a runtime object-wrapping pattern. The GOF pattern works without `experimentalDecorators` and is preferred for production code.

**Anti-patterns:**

- Decorator that reads but doesn't write — all interface methods must be delegated, even if the decorator only augments one
- Decorators with ordering dependencies — if the order matters, document it clearly or use a pipeline builder
- Too many decorator layers — consider a middleware pipeline instead when you have more than 3-4 stacked behaviors

**Middleware pipeline (alternative for many cross-cutting concerns):**

```typescript
type Middleware<T> = (value: T, next: () => Promise<T>) => Promise<T>;

async function pipeline<T>(value: T, middlewares: Middleware<T>[]): Promise<T> {
  const run = async (index: number): Promise<T> => {
    if (index >= middlewares.length) return value;
    return middlewares[index](value, () => run(index + 1));
  };
  return run(0);
}
```

## Source

refactoring.guru/design-patterns/decorator
