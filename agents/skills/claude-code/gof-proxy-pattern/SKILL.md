# GOF Proxy Pattern

> Control access to an object using virtual, protection, logging, and caching proxy patterns.

## When to Use

- You need to add access control (authorization) around a real object without modifying it
- You want to lazy-initialize an expensive object until it's actually needed (virtual proxy)
- You need transparent caching in front of an expensive operation (caching proxy)
- You want to log or audit all calls to a service without modifying the service

## Instructions

**Caching proxy:**

```typescript
interface UserRepository {
  findById(id: string): Promise<User | null>;
  findAll(): Promise<User[]>;
}

class DatabaseUserRepository implements UserRepository {
  async findById(id: string): Promise<User | null> {
    console.log(`[DB] Fetching user ${id}`);
    return db.query('SELECT * FROM users WHERE id = $1', [id]);
  }

  async findAll(): Promise<User[]> {
    console.log('[DB] Fetching all users');
    return db.query('SELECT * FROM users');
  }
}

class CachingUserRepository implements UserRepository {
  private cache = new Map<string, { user: User | null; expiresAt: number }>();
  private readonly ttl = 60_000; // 1 minute

  constructor(private readonly real: UserRepository) {}

  async findById(id: string): Promise<User | null> {
    const cached = this.cache.get(id);
    if (cached && Date.now() < cached.expiresAt) {
      console.log(`[Cache HIT] user ${id}`);
      return cached.user;
    }
    const user = await this.real.findById(id);
    this.cache.set(id, { user, expiresAt: Date.now() + this.ttl });
    return user;
  }

  async findAll(): Promise<User[]> {
    return this.real.findAll(); // don't cache collection queries
  }

  invalidate(id: string): void {
    this.cache.delete(id);
  }
}

// Wire it up — callers don't know about the cache
const repo: UserRepository = new CachingUserRepository(new DatabaseUserRepository());
```

**Authorization proxy:**

```typescript
interface DocumentService {
  getDocument(id: string): Promise<Document>;
  updateDocument(id: string, content: string): Promise<void>;
  deleteDocument(id: string): Promise<void>;
}

class AuthorizationProxy implements DocumentService {
  constructor(
    private readonly real: DocumentService,
    private readonly getCurrentUser: () => User
  ) {}

  async getDocument(id: string): Promise<Document> {
    const user = this.getCurrentUser();
    if (!user.permissions.includes('document:read')) {
      throw new ForbiddenError('Read permission required');
    }
    return this.real.getDocument(id);
  }

  async updateDocument(id: string, content: string): Promise<void> {
    const user = this.getCurrentUser();
    if (!user.permissions.includes('document:write')) {
      throw new ForbiddenError('Write permission required');
    }
    return this.real.updateDocument(id, content);
  }

  async deleteDocument(id: string): Promise<void> {
    const user = this.getCurrentUser();
    if (!user.permissions.includes('document:delete')) {
      throw new ForbiddenError('Delete permission required');
    }
    return this.real.deleteDocument(id);
  }
}
```

**ES6 Proxy object (meta-programming proxy):**

```typescript
function createLoggingProxy<T extends object>(target: T, label: string): T {
  return new Proxy(target, {
    get(obj, prop: string | symbol) {
      const value = Reflect.get(obj, prop);
      if (typeof value === 'function') {
        return (...args: unknown[]) => {
          console.log(`[${label}] ${String(prop)}(${JSON.stringify(args)})`);
          const result = value.apply(obj, args);
          if (result instanceof Promise) {
            return result.then((r) => {
              console.log(`[${label}] ${String(prop)} → resolved`);
              return r;
            });
          }
          return result;
        };
      }
      return value;
    },
  });
}

const loggingRepo = createLoggingProxy(new DatabaseUserRepository(), 'UserRepo');
await loggingRepo.findById('user-123');
// [UserRepo] findById(["user-123"])
// [DB] Fetching user user-123
// [UserRepo] findById → resolved
```

## Details

**Virtual proxy (lazy initialization):**

```typescript
class LazyPDFDocument {
  private realDoc: PDFDocument | null = null;

  private async getDoc(): Promise<PDFDocument> {
    if (!this.realDoc) {
      this.realDoc = await PDFDocument.load(this.path); // expensive
    }
    return this.realDoc;
  }

  async getPageCount(): Promise<number> {
    return (await this.getDoc()).getPageCount();
  }
}
```

**Proxy vs. Decorator:** Both implement the same interface and wrap an object. The Proxy controls access or lifecycle (authorization, lazy load, caching). The Decorator adds features (stacking behaviors). When your intent is "protect" or "delay", use Proxy. When your intent is "enhance", use Decorator.

**Anti-patterns:**

- Proxy that changes the logical behavior of the target — the proxy should be transparent except for access control/caching
- ES6 Proxy for everything — it adds overhead; use it when you need dynamic property interception, not for simple delegation
- Stacking proxies without documenting the order — creates debugging nightmares

## Source

refactoring.guru/design-patterns/proxy
