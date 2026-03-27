# Harness Database

> Advisory guide for schema design, migrations, ORM patterns, and migration safety. Detects your ORM, analyzes schema health, produces safe migrations, and validates backward compatibility.

## When to Use

- When designing a new database schema for a feature
- When writing or reviewing migration files (Prisma, Drizzle, Knex, TypeORM, Sequelize, raw SQL)
- When evaluating schema normalization, indexing, or relationship design
- When checking migration safety before deploying to production
- When adding a new model or entity to an existing ORM setup
- When troubleshooting slow queries caused by missing indexes or poor schema design
- NOT for API endpoint design that exposes database models (use harness-api-design for that)
- NOT for caching layers in front of the database (use harness-caching for Redis/Memcached strategy)
- NOT for data validation at the application layer (use harness-data-validation for Zod/Joi schemas)
- NOT for event sourcing storage patterns (use harness-event-driven for event store design)

## Process

### Phase 1: DETECT -- Identify Database Engine and ORM

1. **Identify the ORM or query builder.** Scan for stack signals: `prisma/schema.prisma` for Prisma, `drizzle.config.*` for Drizzle, `knexfile.*` for Knex, `typeorm.config.*` or `ormconfig.*` for TypeORM, `sequelize.config.*` or `.sequelizerc` for Sequelize. If the `--orm` argument is provided, use that instead of auto-detection.

2. **Identify the database engine.** Parse the ORM configuration for the connection string or provider field. Detect PostgreSQL, MySQL, SQLite, MongoDB, or SQL Server. Record the engine version if specified in the config or docker-compose file.

3. **Map existing schema.** For Prisma, parse `schema.prisma` for models, relations, and indexes. For Drizzle, parse table definitions in `src/**/schema.*`. For Knex/raw SQL, scan the `migrations/` directory and reconstruct the current schema state. For TypeORM/Sequelize, scan entity or model files.

4. **Assess migration state.** List pending migrations (not yet applied). Check for migration gaps (missing sequence numbers) or conflicts (multiple migrations with the same timestamp). WHERE a migration history table is accessible, THEN compare applied vs. on-disk migrations.

5. **Catalog existing patterns.** Record naming conventions (snake_case vs camelCase for columns), soft-delete patterns (`deletedAt` column), audit patterns (`createdAt`, `updatedAt`), and relationship styles (join tables vs embedded references). These become the baseline for new schema work.

### Phase 2: ANALYZE -- Evaluate Schema Design

1. **Check normalization.** Identify denormalized data that may cause update anomalies. Flag tables with repeated groups of columns (e.g., `address1`, `address2`, `address3`) that should be a separate table. Distinguish intentional denormalization (for read performance) from accidental duplication.

2. **Evaluate indexing.** For every foreign key column, verify an index exists. For columns used in WHERE clauses or ORDER BY (inferred from query patterns in the codebase), check for supporting indexes. Flag tables with more than 8 indexes (write performance concern) or zero indexes beyond the primary key.

3. **Analyze relationships.** Verify that every foreign key has a corresponding ON DELETE action (CASCADE, SET NULL, or RESTRICT). Flag orphan risk where ON DELETE is not specified. Check for circular references that may complicate migrations or deletes.

4. **Review data types.** Flag columns using overly broad types (e.g., `TEXT` where `VARCHAR(255)` suffices, `FLOAT` for monetary values instead of `DECIMAL`). Check for missing NOT NULL constraints on fields that should never be null. Verify ENUM types are used appropriately.

5. **Check for N+1 query patterns.** Scan ORM usage in the codebase for eager vs lazy loading configuration. WHERE a model is loaded in a loop without includes/joins, THEN flag the N+1 risk with a specific file and line reference.

### Phase 3: ADVISE -- Produce Schema Changes and Migrations

1. **Generate schema changes.** Based on the feature requirements and phase 2 analysis, produce the schema modifications. For Prisma, write the `schema.prisma` model additions. For Drizzle, write the table definition. For Knex, write the migration `up` and `down` functions. Match the project's existing conventions.

2. **Write migration files.** Generate the migration in the ORM's native format. For Prisma: `npx prisma migrate dev --name <name>`. For Drizzle: `npx drizzle-kit generate`. For Knex: `npx knex migrate:make <name>`. Include both `up` (apply) and `down` (rollback) logic.

3. **Add indexes for the new schema.** For every foreign key in the new schema, include an index. For columns that will be used in filters or sorting (based on the feature requirements), include a covering index. Justify each index with the expected query pattern.

4. **Handle seed data.** WHERE the new schema requires initial data (enum lookup tables, default configuration rows), THEN include a seed script or migration data insertion. Separate structural migrations from data migrations.

5. **Produce ORM pattern recommendations.** For the new models, recommend the query patterns: which relations to eager-load by default, where to use transactions, and how to handle optimistic locking if the feature requires concurrent writes.

### Phase 4: VALIDATE -- Verify Migration Safety

1. **Check backward compatibility.** WHERE the migration drops a column, renames a table, or changes a column type, THEN flag it as a destructive migration. Destructive migrations require a multi-step deployment: add new column, backfill data, deploy code using new column, drop old column.

2. **Verify rollback safety.** Run the `down` migration mentally (or actually if a test database is available). Confirm that rolling back does not lose data. WHERE the `up` migration drops a column, THEN the `down` migration cannot restore it -- flag this as an irreversible migration.

3. **Check for long-running locks.** WHERE the migration adds a NOT NULL column to a large table without a default value, THEN flag it: the database will lock the table for a full rewrite. Recommend adding the column as nullable first, backfilling, then adding the constraint. WHERE the migration creates an index on a large table, THEN recommend `CREATE INDEX CONCURRENTLY` (PostgreSQL) or equivalent.

4. **Validate constraint additions.** WHERE a new UNIQUE constraint is added, THEN verify existing data will not violate it. WHERE a new FOREIGN KEY is added, THEN verify the referenced table and column exist and have an index. WHERE a CHECK constraint is added, THEN verify the expression syntax is valid for the target engine.

5. **Run migration dry-run.** WHERE a test database connection is available, THEN run the migration in a transaction and roll it back. Report success or failure. WHERE no database is available, THEN validate the migration SQL syntax against the target engine's dialect.

## Harness Integration

- **`harness validate`** -- Run after generating migrations to confirm project health
- **`harness scan`** -- Refresh the knowledge graph after adding new model files
- **`query_graph`** -- Trace which services depend on a table before modifying it
- **`get_impact`** -- Understand blast radius when modifying a shared schema table

## Success Criteria

- ORM and database engine were correctly detected or explicitly specified
- Existing schema conventions were identified and followed in new designs
- Every new table has appropriate indexes, constraints, and foreign key actions
- Migration files include both `up` and `down` logic
- Destructive migrations are flagged and a safe multi-step deployment plan is provided
- No long-running table locks are introduced without explicit warning
- N+1 query risks are identified for new models
- Migration SQL syntax is valid for the target database engine

## Examples

### Example: Prisma Schema Addition for a Comments Feature

**Input:** "Add a comments model to our Prisma/PostgreSQL app."

**Phase 1 -- DETECT:**

```
ORM: Prisma 5.x
Engine: PostgreSQL 15 (from DATABASE_URL in .env.example)
Existing models: User, Post, Category
Conventions: camelCase fields, @updatedAt on all models, soft deletes (deletedAt DateTime?)
Migrations: 12 applied, 0 pending, no gaps
```

**Phase 2 -- ANALYZE:**

```
Normalization: PASS -- no denormalized data detected
Indexing: WARN -- Post.authorId has no index (FK without index)
Relationships: PASS -- all FKs have onDelete specified
Data types: PASS
N+1 risk: WARN -- src/routes/posts.ts:42 loads post.author in a loop without include
```

**Phase 3 -- ADVISE:**

```prisma
model Comment {
  id        String   @id @default(cuid())
  body      String
  postId    String
  post      Post     @relation(fields: [postId], references: [id], onDelete: Cascade)
  authorId  String
  author    User     @relation(fields: [authorId], references: [id], onDelete: Cascade)
  parentId  String?
  parent    Comment? @relation("CommentReplies", fields: [parentId], references: [id], onDelete: Cascade)
  replies   Comment[] @relation("CommentReplies")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?

  @@index([postId])
  @@index([authorId])
  @@index([parentId])
}
```

Migration generated: `npx prisma migrate dev --name add-comments`

**Phase 4 -- VALIDATE:**

```
Backward compatibility: PASS -- additive change only
Rollback safety: PASS -- dropping Comment table is safe (no data loss for existing tables)
Lock risk: PASS -- new table, no ALTER on existing tables
Constraints: PASS -- all FK targets exist and are indexed
```

### Example: Knex Migration Safety Check

**Input:** "Review this migration that adds a required email column to the users table."

**Phase 1 -- DETECT:**

```
ORM: Knex 3.x
Engine: PostgreSQL 14
Existing schema: users (id, name, created_at), posts (id, user_id, title, body)
```

**Phase 4 -- VALIDATE (fast-path for --check-migrations):**

```
DANGER: Migration adds NOT NULL column 'email' to users table without a default value.

Impact: PostgreSQL will attempt to rewrite the entire users table, acquiring an
ACCESS EXCLUSIVE lock. If the users table has >10K rows, this will block all
reads and writes for the duration.

Existing rows will fail the NOT NULL constraint, causing the migration to abort.

Recommended safe approach (3-step migration):

Step 1 (migration: add-email-nullable):
  exports.up = (knex) => knex.schema.alterTable('users', (t) => {
    t.string('email', 255);  // nullable first
    t.index('email');
  });

Step 2 (data migration: backfill-emails):
  exports.up = async (knex) => {
    await knex.raw(`
      UPDATE users SET email = name || '@placeholder.example'
      WHERE email IS NULL
    `);
  };

Step 3 (migration: enforce-email-not-null):
  exports.up = (knex) => knex.schema.alterTable('users', (t) => {
    t.string('email', 255).notNullable().alter();
  });
```

### Example: Drizzle Schema for Multi-Tenant SaaS

**Input:** "Design a multi-tenant schema with row-level security for our Drizzle/PostgreSQL app."

**Phase 1 -- DETECT:**

```
ORM: Drizzle 0.30.x
Engine: PostgreSQL 16
Config: drizzle.config.ts (schema: ./src/db/schema.ts)
Existing tables: none (greenfield)
```

**Phase 3 -- ADVISE:**

```typescript
// src/db/schema.ts
import { pgTable, text, timestamp, uuid, index } from 'drizzle-orm/pg-core';

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    name: text('name').notNull(),
    role: text('role', { enum: ['owner', 'admin', 'member'] })
      .notNull()
      .default('member'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    tenantIdx: index('users_tenant_id_idx').on(table.tenantId),
    emailTenantUnique: index('users_email_tenant_unique').on(table.email, table.tenantId).unique(),
  })
);
```

Row-level security policy:

```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON users
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

## Gates

- **Destructive migrations must not proceed without flagging.** WHERE a migration drops a column, drops a table, renames a column, or changes a column type, THEN the skill must halt and present a safe multi-step alternative. Silently executing destructive DDL against production is not recoverable.
- **Every foreign key must have an ON DELETE action.** No foreign key may be created without an explicit `onDelete` (CASCADE, SET NULL, or RESTRICT). The database default (NO ACTION) creates orphan rows and constraint violation errors during deletes.
- **Migration files must include rollback logic.** Every `up` function must have a corresponding `down` function. WHERE a migration is irreversible (data loss on rollback), THEN it must be explicitly marked as such with a comment explaining why.
- **No migrations that lock large tables without warning.** WHERE a migration performs an ALTER TABLE that acquires an ACCESS EXCLUSIVE lock on a table estimated to have more than 10,000 rows, THEN the skill must flag the lock risk and suggest a non-locking alternative.

## Escalation

- **Production data at risk:** When a migration would delete or overwrite existing data (DROP COLUMN, column type change that truncates), report: "This migration will permanently delete data in column `X`. Provide a data backup confirmation or approve a non-destructive alternative (add new column, backfill, drop old) before proceeding."
- **ORM auto-detection fails:** When no ORM configuration file is found and no `--orm` flag is provided, report: "No ORM detected. Found raw `.sql` files in `migrations/`. Specify the ORM with `--orm` or confirm this is a raw SQL migration project."
- **Schema conflicts between team members:** When two pending migrations modify the same table, report: "Migrations `20240315_add_email` and `20240316_add_phone` both ALTER the `users` table. These must be reviewed together to avoid lock contention and ordering issues. Recommend merging into a single migration."
- **Database engine feature not available:** When the recommended approach uses a feature not available in the detected engine version (e.g., `CREATE INDEX CONCURRENTLY` is PostgreSQL-only), report: "The recommended non-locking index creation is not available in MySQL 5.7. Alternative: schedule the migration during a maintenance window or upgrade to MySQL 8.0+ which supports `ALGORITHM=INPLACE`."
