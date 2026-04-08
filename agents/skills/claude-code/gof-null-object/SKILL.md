# GOF Null Object

> Eliminate null checks by providing default no-op implementations of interfaces.

## When to Use

- You have many `if (thing !== null)` guards before calling methods on an optional dependency
- You want a "do nothing" default when an optional feature is absent (e.g., optional logger, optional cache, optional analytics)
- You're wiring up optional dependencies that are configured at startup
- You want tests to work without providing real implementations of optional dependencies

## Instructions

**Basic null object for an optional logger:**

```typescript
interface Logger {
  info(message: string, context?: object): void;
  warn(message: string, context?: object): void;
  error(message: string, error?: Error): void;
}

// Real implementation
class ConsoleLogger implements Logger {
  info(message: string, context?: object): void {
    console.log('[INFO]', message, context ?? '');
  }
  warn(message: string, context?: object): void {
    console.warn('[WARN]', message, context ?? '');
  }
  error(message: string, error?: Error): void {
    console.error('[ERROR]', message, error);
  }
}

// Null object — safe no-ops
class NullLogger implements Logger {
  info(_message: string, _context?: object): void {}
  warn(_message: string, _context?: object): void {}
  error(_message: string, _error?: Error): void {}
}

// Consumer — never needs to check if logger is null
class OrderService {
  constructor(
    private readonly repo: OrderRepository,
    private readonly logger: Logger = new NullLogger() // optional, defaults to null object
  ) {}

  async createOrder(data: CreateOrderInput): Promise<Order> {
    this.logger.info('Creating order', { userId: data.userId });
    const order = await this.repo.create(data);
    this.logger.info('Order created', { orderId: order.id });
    return order;
  }
}

// Production
const service = new OrderService(repo, new ConsoleLogger());

// Test / minimal setup — no logging noise
const testService = new OrderService(repo); // uses NullLogger by default
```

**Null object for an optional cache:**

```typescript
interface Cache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<void>;
}

class RedisCache implements Cache {
  constructor(private readonly client: RedisClient) {}

  async get<T>(key: string): Promise<T | null> {
    const val = await this.client.get(key);
    return val ? JSON.parse(val) : null;
  }

  async set<T>(key: string, value: T, ttlMs = 60_000): Promise<void> {
    await this.client.set(key, JSON.stringify(value), 'PX', ttlMs);
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }
}

// Null object — always miss, never store
class NullCache implements Cache {
  async get<T>(_key: string): Promise<T | null> {
    return null;
  } // always cache miss
  async set<T>(_key: string, _value: T, _ttlMs?: number): Promise<void> {} // no-op
  async delete(_key: string): Promise<void> {} // no-op
}

// Service uses cache without null checks
class UserService {
  constructor(
    private readonly db: UserRepository,
    private readonly cache: Cache = new NullCache()
  ) {}

  async findUser(id: string): Promise<User | null> {
    const cached = await this.cache.get<User>(`user:${id}`);
    if (cached) return cached;

    const user = await this.db.findById(id);
    if (user) await this.cache.set(`user:${id}`, user, 300_000);
    return user;
  }
}
```

**Typed null object factory:**

```typescript
// Create a null object automatically from an interface (advanced)
function createNullObject<T extends object>(methods: (keyof T)[]): T {
  const obj = {} as T;
  for (const method of methods) {
    (obj as Record<string | symbol, unknown>)[method as string] = () => {};
  }
  return obj;
}
```

## Details

**Null Object vs. Optional chaining:** Optional chaining (`obj?.method()`) is fine for occasional null checks. Null Object is better when a dependency is consistently optional across many methods — it removes ALL null checks at once, not one at a time.

**Null Object vs. TypeScript optional types:** `Logger | undefined` as a parameter type forces callers to guard. `Logger` (defaulting to `NullLogger`) is simpler — callers provide a real logger or nothing; the service always has a logger.

**Null Object is not the same as `undefined`:** A `NullLogger` is a real object that does nothing. `undefined` throws when you call methods on it. The Null Object makes the absence of a feature safe and explicit.

**Anti-patterns:**

- Null object that returns null/undefined from methods — the calling code then needs null checks again; return safe defaults (empty arrays, zero, empty string)
- Null object that tracks calls for assertions in tests — use a mock/spy instead; null objects should be passive
- Using null objects to mask missing required dependencies — null objects should be for genuinely optional features, not required ones that haven't been wired yet

**For analytics / telemetry (common use case):**

```typescript
interface Analytics {
  track(event: string, properties?: object): void;
  identify(userId: string, traits?: object): void;
}

class NullAnalytics implements Analytics {
  track(_event: string, _properties?: object): void {}
  identify(_userId: string, _traits?: object): void {}
}
```

## Source

refactoring.guru/introduce-null-object
