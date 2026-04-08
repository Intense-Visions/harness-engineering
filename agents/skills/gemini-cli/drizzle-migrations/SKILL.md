# Drizzle Migrations

> Manage Drizzle schema evolution with drizzle-kit generate/push/migrate and introspect

## When to Use

- Generating SQL migration files from schema changes
- Applying migrations to development or production databases
- Prototyping schema changes rapidly with `push`
- Introspecting an existing database to generate a Drizzle schema

## Instructions

1. **Configure drizzle-kit** in `drizzle.config.ts`:

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

2. **Generate a migration** after editing the schema:

```bash
npx drizzle-kit generate
```

This creates a SQL migration file in the `out` directory (e.g., `drizzle/0001_add_posts_table.sql`).

3. **Apply migrations** programmatically at startup:

```typescript
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db } from './db';

await migrate(db, { migrationsFolder: './drizzle' });
```

4. **Push for rapid prototyping** — applies schema changes directly without generating migration files:

```bash
npx drizzle-kit push
```

Use `push` only in development. It does not create reversible migration history.

5. **Introspect an existing database** to generate a Drizzle schema:

```bash
npx drizzle-kit introspect
```

This creates a TypeScript schema file matching the current database structure.

6. **Review generated SQL** before applying. Open the migration file and verify:
   - Column types match your intent
   - Destructive operations (DROP, ALTER TYPE) are safe
   - Data migration steps are included where needed

7. **Custom migration SQL** — edit generated files to add data migrations:

```sql
-- Generated: add status column
ALTER TABLE "posts" ADD COLUMN "status" text DEFAULT 'draft' NOT NULL;

-- Custom: backfill existing records
UPDATE "posts" SET "status" = 'published' WHERE "published" = true;
```

8. **Check for migration issues** before generating:

```bash
npx drizzle-kit check
```

9. **Drop migrations** that have not been applied (development only):

```bash
npx drizzle-kit drop
```

## Details

Drizzle Kit is the CLI companion to Drizzle ORM. It reads your TypeScript schema and generates SQL migration files by diffing the schema against the migration history.

**Migration tracking:** Drizzle creates a `__drizzle_migrations` table in the database to track which migrations have been applied. Each migration is identified by its filename hash.

**`generate` vs `push`:** `generate` creates versioned, reversible migration files for production workflows. `push` applies changes directly — fast for prototyping but leaves no history. Never use `push` in environments shared with other developers or in CI/CD.

**Migration file structure:**

```
drizzle/
  0000_initial.sql
  0001_add_posts.sql
  0002_add_comments.sql
  meta/
    0000_snapshot.json
    0001_snapshot.json
    _journal.json
```

The `meta/` directory contains schema snapshots that drizzle-kit uses to compute diffs. Do not edit these files.

**Programmatic migration:** Unlike Prisma's `migrate deploy` CLI command, Drizzle recommends running migrations in application code at startup. This works well for serverless environments where you cannot run CLI commands.

**Trade-offs:**

- No shadow database needed — Drizzle diffs against snapshots, not a separate database
- Migration files are plain SQL — easy to review but no built-in rollback mechanism
- `push` is fast but dangerous — it can drop columns without warning in development
- No built-in `reset` command — drop the database manually and re-run migrations for a clean slate

## Source

https://orm.drizzle.team/docs/migrations
