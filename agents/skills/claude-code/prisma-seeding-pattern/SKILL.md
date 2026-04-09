# Prisma Seeding Pattern

> Seed databases idempotently with prisma/seed.ts, --seed flag, and environment branching

## When to Use

- Populating a development database with test data after `prisma migrate reset`
- Setting up required reference data (roles, categories, config records)
- Creating reproducible test fixtures for integration tests
- Bootstrapping demo environments with sample data

## Instructions

1. **Create the seed file** at `prisma/seed.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Reference data — always needed
  const adminRole = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: { name: 'ADMIN', permissions: ['read', 'write', 'delete'] },
  });

  // Development data — sample records
  const user = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      name: 'Admin User',
      roleId: adminRole.id,
    },
  });

  console.log({ adminRole, user });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
```

2. **Configure the seed command** in `package.json`:

```json
{
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

Use `tsx` or `ts-node` for TypeScript seeds. Ensure the runner is in `devDependencies`.

3. **Make seeds idempotent** — use `upsert` instead of `create` so the seed can run multiple times without duplicating data:

```typescript
await prisma.category.upsert({
  where: { slug: 'technology' },
  update: { name: 'Technology' },
  create: { slug: 'technology', name: 'Technology' },
});
```

4. **Branch by environment** to seed different data for dev, staging, and testing:

```typescript
async function main() {
  await seedReferenceData(); // Always runs

  if (process.env.NODE_ENV !== 'production') {
    await seedDevelopmentData(); // Sample users, posts, etc.
  }

  if (process.env.SEED_DEMO === 'true') {
    await seedDemoData(); // Curated demo content
  }
}
```

5. **Run the seed manually**:

```bash
npx prisma db seed
```

The seed also runs automatically after `prisma migrate reset` and `prisma migrate dev` (when a new migration is created).

6. **Use factories for volume** — when you need many records, use a helper function:

```typescript
function createRandomUser() {
  return {
    email: `user-${crypto.randomUUID()}@example.com`,
    name: `User ${Math.random().toString(36).slice(2)}`,
  };
}

await prisma.user.createMany({
  data: Array.from({ length: 100 }, createRandomUser),
  skipDuplicates: true,
});
```

7. **Seed in correct dependency order** — create parent records before children. For circular dependencies, create records without relations first, then update with connections.

8. **Reset and reseed** in one command:

```bash
npx prisma migrate reset --force
```

This drops the database, applies all migrations, and runs the seed script.

## Details

Prisma seeding runs as a standalone Node.js script invoked by the Prisma CLI. It has full access to Prisma Client and can include any business logic needed to set up the data.

**Seed vs migration data:** Reference data that must exist for the application to function (enum-like lookup tables, system config) belongs in migrations as `INSERT` statements, not in seeds. Seeds are for development convenience; migrations are for production correctness.

**Performance for large seeds:** `createMany` is significantly faster than individual `create` calls because it batches into a single `INSERT` with multiple value tuples. However, `createMany` does not support nested creates — use it for flat data and fall back to `create` for relational data.

**Testing seeds:** Create a separate seed function that returns the created data for use in integration tests:

```typescript
export async function seedTestData(prisma: PrismaClient) {
  const user = await prisma.user.create({ data: { ... } });
  return { user };
}
```

Call this from your test setup with a transaction that rolls back after each test.

**Common mistakes:**

- Not disconnecting the client — the seed script hangs if `prisma.$disconnect()` is not called
- Using `create` instead of `upsert` — the seed fails on second run
- Hardcoding IDs — use `cuid()` or let the database auto-generate. Hardcoded IDs collide across environments
- Seeding production — guard with environment checks and never include `prisma.seed` configuration in production images

## Source

https://prisma.io/docs/orm/prisma-migrate/workflows/seeding

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
