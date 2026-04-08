# Prisma Type Generation

> Use generated Prisma types like XxxCreateInput, XxxWhereInput, $Enums, and validator utilities

## When to Use

- Typing function parameters that accept Prisma query inputs
- Building type-safe service layers that wrap Prisma operations
- Accessing generated enum types in application code
- Creating DTOs or API schemas that align with the Prisma data model

## Instructions

1. **Regenerate types** after schema changes:

```bash
npx prisma generate
```

This runs automatically after `migrate dev` but must be run manually after editing the schema without migrating.

2. **Import generated types** from `@prisma/client`:

```typescript
import { Prisma, User, Post, Role } from '@prisma/client';
```

- `User`, `Post` — model types (the shape returned by queries)
- `Role` — enum type
- `Prisma` — namespace containing all input/output types

3. **Use input types** for service function parameters:

```typescript
import { Prisma } from '@prisma/client';

async function createUser(data: Prisma.UserCreateInput) {
  return prisma.user.create({ data });
}

async function findUsers(where: Prisma.UserWhereInput) {
  return prisma.user.findMany({ where });
}
```

4. **Access enum values** from the `$Enums` export or directly:

```typescript
import { Role } from '@prisma/client';

// Use as a type
function isAdmin(role: Role): boolean {
  return role === 'ADMIN';
}

// Use enum values
const defaultRole: Role = 'USER';
```

5. **Extract return types** from queries using `Prisma.UserGetPayload`:

```typescript
type UserWithPosts = Prisma.UserGetPayload<{
  include: { posts: true };
}>;

// UserWithPosts = User & { posts: Post[] }
```

6. **Type the result of `select`** queries:

```typescript
type UserSummary = Prisma.UserGetPayload<{
  select: { id: true; name: true; email: true };
}>;

// UserSummary = { id: string; name: string | null; email: string }
```

7. **Use `Prisma.validator`** to create reusable, type-checked query objects:

```typescript
const userWithPosts = Prisma.validator<Prisma.UserDefaultArgs>()({
  include: { posts: true },
});

// Use in queries
const user = await prisma.user.findUnique({
  where: { id },
  ...userWithPosts,
});
```

8. **Type service layers** that return a subset of fields:

```typescript
const userSelect = Prisma.validator<Prisma.UserSelect>()({
  id: true,
  email: true,
  name: true,
});

type PublicUser = Prisma.UserGetPayload<{ select: typeof userSelect }>;

async function getPublicUser(id: string): Promise<PublicUser | null> {
  return prisma.user.findUnique({ where: { id }, select: userSelect });
}
```

9. **Use `Prisma.UserScalarFieldEnum`** for dynamic field selection:

```typescript
const sortableFields = ['createdAt', 'name', 'email'] as const;

function buildOrderBy(field: (typeof sortableFields)[number]): Prisma.UserOrderByWithRelationInput {
  return { [field]: 'desc' };
}
```

10. **Handle `JsonValue`** types from Json fields:

```typescript
import { Prisma } from '@prisma/client';

// Prisma.JsonValue = string | number | boolean | null | Prisma.JsonObject | Prisma.JsonArray
function parseMetadata(json: Prisma.JsonValue): Record<string, unknown> {
  if (typeof json === 'object' && json !== null && !Array.isArray(json)) {
    return json as Record<string, unknown>;
  }
  return {};
}
```

## Details

Prisma generates TypeScript types in `node_modules/.prisma/client/index.d.ts` based on your schema. These types power autocompletion, compile-time checking, and the entire Prisma Client API.

**Type categories:**

- **Model types** (`User`, `Post`) — plain objects representing a full database row
- **Input types** (`UserCreateInput`, `UserUpdateInput`, `UserWhereInput`) — types for query arguments
- **Output types** (`UserGetPayload<T>`) — types derived from specific select/include combinations
- **Enum types** (`Role`, `Status`) — string literal unions matching schema enums
- **Scalar field enums** (`UserScalarFieldEnum`) — union of field name strings

**`UserCreateInput` vs `UserUncheckedCreateInput`:** The `Create` input uses relation fields (`author: { connect: { id } }`). The `Unchecked` variant uses raw foreign keys (`authorId: string`). Both produce the same SQL. Use the standard version for type safety; use the unchecked version when working with raw IDs.

**Keeping types in sync:** Types are generated into `node_modules` and are not committed to version control. Run `prisma generate` in CI before type-checking. Add it to your build pipeline:

```json
{ "scripts": { "build": "prisma generate && tsc" } }
```

**Zod integration:** Use `zod-prisma-types` or `prisma-zod-generator` to auto-generate Zod schemas from your Prisma models. This eliminates manual synchronization between Prisma types and runtime validation:

```prisma
generator zod {
  provider = "zod-prisma-types"
}
```

## Source

https://prisma.io/docs/orm/prisma-client/type-safety
