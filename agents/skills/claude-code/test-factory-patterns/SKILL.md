# Test Factory Patterns

> Build maintainable test data using factory functions, builders, and faker.js

## When to Use

- Creating test data for unit and integration tests
- Reducing duplication in test setup across test files
- Generating realistic fake data for testing edge cases
- Building complex object graphs with sensible defaults

## Instructions

1. **Simple factory function** with defaults and overrides:

```typescript
function createUser(overrides?: Partial<User>): User {
  return {
    id: crypto.randomUUID(),
    name: 'Test User',
    email: `user-${crypto.randomUUID().slice(0, 8)}@test.com`,
    role: 'user',
    createdAt: new Date(),
    ...overrides,
  };
}

// Usage
const admin = createUser({ role: 'admin', name: 'Admin' });
const alice = createUser({ name: 'Alice' });
```

2. **Factory with faker.js** for realistic data:

```typescript
import { faker } from '@faker-js/faker';

function createUser(overrides?: Partial<User>): User {
  return {
    id: faker.string.uuid(),
    name: faker.person.fullName(),
    email: faker.internet.email(),
    role: 'user',
    avatar: faker.image.avatar(),
    createdAt: faker.date.past(),
    ...overrides,
  };
}
```

3. **Builder pattern** for complex objects:

```typescript
class UserBuilder {
  private data: Partial<User> = {};

  withName(name: string): this {
    this.data.name = name;
    return this;
  }
  withRole(role: Role): this {
    this.data.role = role;
    return this;
  }
  withEmail(email: string): this {
    this.data.email = email;
    return this;
  }
  asAdmin(): this {
    this.data.role = 'admin';
    return this;
  }

  build(): User {
    return createUser(this.data);
  }
}

// Usage
const admin = new UserBuilder().withName('Alice').asAdmin().build();
```

4. **Factory for related entities:**

```typescript
function createPost(
  overrides?: Partial<Post> & { author?: Partial<User> }
): Post & { author: User } {
  const author = createUser(overrides?.author);
  return {
    id: crypto.randomUUID(),
    title: faker.lorem.sentence(),
    content: faker.lorem.paragraphs(3),
    authorId: author.id,
    published: false,
    createdAt: new Date(),
    ...overrides,
    author,
  };
}
```

5. **Batch factory** for lists:

```typescript
function createUsers(count: number, overrides?: Partial<User>): User[] {
  return Array.from({ length: count }, () => createUser(overrides));
}

const tenAdmins = createUsers(10, { role: 'admin' });
```

6. **Deterministic factories** for snapshot testing:

```typescript
faker.seed(42); // Same seed = same data every run

function createDeterministicUser(): User {
  return createUser(); // Always generates the same sequence
}
```

7. **Database factory** for integration tests:

```typescript
async function createDbUser(prisma: PrismaClient, overrides?: Partial<User>) {
  const data = createUser(overrides);
  return prisma.user.create({
    data: {
      email: data.email,
      name: data.name,
      role: data.role,
    },
  });
}

// In tests
const user = await createDbUser(prisma, { role: 'admin' });
```

8. **Organize factories** in a central file:

```typescript
// test/factories/index.ts
export { createUser, createUsers, UserBuilder } from './user-factory';
export { createPost, createPosts } from './post-factory';
export { createOrder } from './order-factory';
```

## Details

Test factories centralize test data creation, providing consistent defaults while allowing per-test customization. They eliminate the "copy-paste test setup" anti-pattern.

**Factory vs fixture vs seed:**

- **Factory** — creates data programmatically with overrides. Best for unit and integration tests
- **Fixture** — static data loaded from files (JSON, SQL). Best for large, stable datasets
- **Seed** — populates a database for development. Factories can be used inside seeds

**Faker.js tips:**

- `faker.seed(n)` makes all subsequent calls deterministic — use for reproducible tests
- `faker.helpers.arrayElement(['a', 'b', 'c'])` picks randomly from a list
- `faker.helpers.multiple(fn, { count: 5 })` generates multiple values

**Factory design principles:**

- Default values should produce a valid object (passes all validation)
- Override only what matters for the test — defaults handle the rest
- Unique values (email, ID) should be generated, not hardcoded — prevents constraint violations
- Related objects should be creatable together (post + author)

**Trade-offs:**

- Factories reduce test setup duplication — but add a maintenance surface (factory changes can break many tests)
- Faker generates realistic data — but can produce edge cases unexpectedly (very long names, unicode characters)
- Builders are expressive — but verbose for simple objects. Use plain factories for objects with fewer than 5 fields
- Deterministic seeds help snapshots — but hide randomized testing benefits

## Source

https://vitest.dev/guide/
