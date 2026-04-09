# Prisma Schema Design

> Design Prisma schemas with datasource, generator, models, field types, and field attributes

## When to Use

- Creating a new Prisma project and defining the initial schema
- Adding new models or fields to an existing Prisma schema
- Choosing the correct field types, attributes, and defaults for a data model
- Configuring datasource (PostgreSQL, MySQL, SQLite) and generator blocks

## Instructions

1. Start every schema with a `datasource` block specifying the provider and connection string via `env()`:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

2. Add a `generator` block for Prisma Client. Place it immediately after the datasource:

```prisma
generator client {
  provider = "prisma-client-js"
}
```

3. Define models with PascalCase names. Every model must have exactly one `@id` field or a `@@id` composite key:

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  role      Role     @default(USER)
  posts     Post[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

4. Use the correct scalar types: `String`, `Int`, `BigInt`, `Float`, `Decimal`, `Boolean`, `DateTime`, `Json`, `Bytes`. Append `?` for optional fields.

5. Apply field-level attributes in this order: `@id`, `@unique`, `@default(...)`, `@map("column_name")`, `@db.VarChar(255)`.

6. Use `@@map("table_name")` to decouple Prisma model names from database table names when working with legacy databases.

7. Use `@@unique([fieldA, fieldB])` for composite unique constraints and `@@index([fieldA, fieldB])` for composite indexes.

8. Define enums at the schema level and reference them as field types:

```prisma
enum Role {
  USER
  ADMIN
  MODERATOR
}
```

9. Use `@default(autoincrement())` for integer IDs, `@default(cuid())` or `@default(uuid())` for string IDs. Prefer `cuid()` unless your system requires UUID format.

10. Add `@updatedAt` to a `DateTime` field to auto-set the timestamp on every update. Only one `@updatedAt` per model.

## Details

Prisma schema is the single source of truth for your database structure and the generated TypeScript client. The schema file (`prisma/schema.prisma`) is declarative and uses its own DSL.

**Datasource providers:** `postgresql`, `mysql`, `sqlite`, `sqlserver`, `mongodb`, `cockroachdb`. Each provider supports a different subset of native types (e.g., `@db.VarChar(255)` for PostgreSQL, `@db.Text` for MySQL).

**Native type annotations** let you override the default database column type. Without them, Prisma maps scalar types to sensible defaults (e.g., `String` maps to `text` on PostgreSQL). Use `@db.VarChar(n)` when you need a length constraint at the database level.

**Multi-file schemas** are supported via the `prismaSchemaFolder` preview feature. Split large schemas into multiple `.prisma` files within the `prisma/schema/` directory.

**Trade-offs:**

- `cuid()` IDs are shorter and URL-safe but not a standard format; `uuid()` is universally recognized but longer
- `Json` fields bypass Prisma's type system — validate JSON content at the application layer or use Zod
- `@default(now())` is evaluated at the database level; `@default(dbgenerated("gen_random_uuid()"))` delegates to database functions
- `Decimal` preserves precision for financial data; `Float` introduces IEEE 754 rounding

**Common mistakes:**

- Forgetting `@updatedAt` means the field stays at its initial value forever
- Using `Int` for IDs on tables that will exceed 2.1 billion rows — use `BigInt` instead
- Not adding `@@index` on foreign key fields — Prisma does not create indexes automatically for relation fields

## Source

https://prisma.io/docs/orm/prisma-schema

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
