# Prisma Relations Pattern

> Model one-to-one, one-to-many, many-to-many, and self-relations with @relation in Prisma

## When to Use

- Adding foreign key relationships between Prisma models
- Modeling one-to-one, one-to-many, or many-to-many associations
- Creating self-referential relations (e.g., manager/employee, parent/child)
- Resolving ambiguous relations when two models have multiple connections

## Instructions

1. **One-to-many** — place the scalar foreign key and `@relation` on the "many" side. The "one" side gets an array field:

```prisma
model User {
  id    String @id @default(cuid())
  posts Post[]
}

model Post {
  id       String @id @default(cuid())
  author   User   @relation(fields: [authorId], references: [id])
  authorId String
}
```

2. **One-to-one** — identical to one-to-many but the relation field is singular on both sides. Add `@unique` to the foreign key:

```prisma
model User {
  id      String   @id @default(cuid())
  profile Profile?
}

model Profile {
  id     String @id @default(cuid())
  user   User   @relation(fields: [userId], references: [id])
  userId String @unique
}
```

3. **Many-to-many (implicit)** — use array fields on both sides. Prisma creates the join table automatically:

```prisma
model Post {
  id   String @id @default(cuid())
  tags Tag[]
}

model Tag {
  id    String @id @default(cuid())
  posts Post[]
}
```

4. **Many-to-many (explicit)** — create an explicit join model when you need extra fields on the relationship:

```prisma
model PostTag {
  post   Post   @relation(fields: [postId], references: [id])
  postId String
  tag    Tag    @relation(fields: [tagId], references: [id])
  tagId  String
  assignedAt DateTime @default(now())

  @@id([postId, tagId])
}
```

5. **Self-relations** — reference the same model. Use named `@relation` to disambiguate:

```prisma
model Employee {
  id         String     @id @default(cuid())
  manager    Employee?  @relation("ManagerReports", fields: [managerId], references: [id])
  managerId  String?
  reports    Employee[] @relation("ManagerReports")
}
```

6. **Disambiguate multiple relations** between the same two models using the relation name string:

```prisma
model User {
  id            String @id @default(cuid())
  writtenPosts  Post[] @relation("Author")
  editedPosts   Post[] @relation("Editor")
}

model Post {
  id       String @id @default(cuid())
  author   User   @relation("Author", fields: [authorId], references: [id])
  authorId String
  editor   User?  @relation("Editor", fields: [editorId], references: [id])
  editorId String?
}
```

7. **Referential actions** — set `onDelete` and `onUpdate` behavior:

```prisma
author User @relation(fields: [authorId], references: [id], onDelete: Cascade, onUpdate: Cascade)
```

Options: `Cascade`, `Restrict`, `NoAction`, `SetNull`, `SetDefault`.

8. Always add `@@index([foreignKeyField])` on relation scalar fields for query performance.

## Details

Prisma relations are defined at the Prisma schema level and map to foreign keys in the database. The `@relation` attribute is required on the side that stores the foreign key (the scalar field side).

**Implicit vs explicit many-to-many:** Implicit join tables follow the naming convention `_ModelAToModelB` (alphabetical). You cannot query the join table directly or add columns to it. Switch to explicit if you ever need metadata on the relationship.

**Referential integrity modes:**

- `foreignKeys` (default for relational databases) — enforced by the database
- `prisma` — enforced by Prisma Client at the application level, required for databases that do not support foreign keys (e.g., PlanetScale with Vitess)

**Cascade gotchas:**

- `onDelete: Cascade` on a required relation means deleting a parent deletes all children — this is often not what you want for audit-sensitive data
- `onDelete: SetNull` requires the foreign key field to be optional (`String?`)
- The default referential action varies by provider — PostgreSQL defaults to `NoAction`, which throws on violation

**Performance considerations:**

- Every `include` on a relation triggers an additional SQL query (not a JOIN). For deeply nested includes, consider using raw queries with explicit JOINs
- Implicit many-to-many creates an unindexed join table — add indexes manually via a migration if query performance degrades

## Source

https://prisma.io/docs/orm/prisma-schema/data-model/relations
