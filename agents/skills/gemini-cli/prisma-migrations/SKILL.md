# Prisma Migrations

> Manage database schema evolution with prisma migrate dev/deploy/reset and migration history

## When to Use

- Applying schema changes to the database during development
- Deploying migrations to staging or production environments
- Baselining an existing database for Prisma Migrate adoption
- Resolving migration history conflicts or drift

## Instructions

1. **Development workflow** — after editing `schema.prisma`, run:

```bash
npx prisma migrate dev --name describe_the_change
```

This generates a migration SQL file, applies it, and regenerates Prisma Client.

2. **Production deployment** — never use `migrate dev` in production. Use:

```bash
npx prisma migrate deploy
```

This applies all pending migrations without generating new ones.

3. **Reset the database** (development only) — drops the database, recreates it, applies all migrations, and runs the seed script:

```bash
npx prisma migrate reset
```

4. **Baseline an existing database** — when adopting Prisma Migrate on a database that already has tables:

```bash
mkdir -p prisma/migrations/0_init
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0_init/migration.sql
npx prisma migrate resolve --applied 0_init
```

5. **Check for drift** between the schema and the database:

```bash
npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-schema-datasource prisma/schema.prisma
```

6. **Customize generated SQL** — after `migrate dev` creates a migration file, edit it before committing. Prisma will not overwrite your edits on subsequent runs.

7. **Handle failed migrations** — if a migration partially applied:

```bash
# Fix the database state manually, then mark as applied:
npx prisma migrate resolve --applied MIGRATION_NAME
# Or mark as rolled back:
npx prisma migrate resolve --rolled-back MIGRATION_NAME
```

8. **Shadow database** — `migrate dev` requires a shadow database to detect drift. Configure it explicitly if your provider does not allow automatic creation:

```prisma
datasource db {
  provider          = "postgresql"
  url               = env("DATABASE_URL")
  shadowDatabaseUrl = env("SHADOW_DATABASE_URL")
}
```

9. Always commit migration files (`prisma/migrations/`) to version control. They are the source of truth for production.

10. Never delete or reorder migration directories once they have been applied to any environment.

## Details

Prisma Migrate uses a migrations table (`_prisma_migrations`) to track which migrations have been applied. Each migration is a directory containing a `migration.sql` file and is applied in lexicographic order.

**Migration history vs schema state:** The migration history is the authoritative record. The schema file describes the desired end state. If these diverge (drift), `migrate dev` will detect it via the shadow database.

**Shadow database mechanics:** During `migrate dev`, Prisma creates a temporary shadow database, applies all existing migrations to it, computes the diff against your schema, and generates the new migration. The shadow database is dropped afterward. This means you need `CREATE DATABASE` privileges in development.

**Data migrations:** Prisma generates only DDL (schema changes). If you need DML (data changes — backfills, column value transforms), add raw SQL to the generated migration file before committing.

**Trade-offs:**

- `migrate dev` is safe and reversible (via `reset`), but slow on large schemas due to shadow database overhead
- `migrate deploy` is fast but irreversible — there is no built-in rollback. Write reverse migrations manually if needed
- `db push` skips migration history entirely — use it only for rapid prototyping, never in a shared environment

**Common mistakes:**

- Running `migrate dev` in CI — it generates files and requires a shadow database. Use `migrate deploy` instead
- Deleting migration files to "clean up" — this breaks the migration history for any database that already applied them
- Not testing migrations on a copy of production data before deploying — column type changes or NOT NULL additions can fail on existing data

## Source

https://prisma.io/docs/orm/prisma-migrate
