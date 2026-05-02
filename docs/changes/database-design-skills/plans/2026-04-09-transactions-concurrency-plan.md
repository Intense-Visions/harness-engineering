# Plan: Database Design Skills -- Phase 4: Transactions and Concurrency

**Date:** 2026-04-09
**Spec:** docs/changes/database-design-skills/proposal.md
**Estimated tasks:** 8
**Estimated time:** ~40 minutes

## Goal

Author 7 database knowledge skills covering Transaction Isolation (3) and Concurrency (4) that teach runtime behavior patterns for multi-user database access.

## Observable Truths (Acceptance Criteria)

1. When `ls agents/skills/claude-code/ | grep "^db-"` is run, 36 directories are listed (29 from Phase 1-3 + 7 new: `db-isolation-levels`, `db-read-phenomena`, `db-isolation-selection`, `db-optimistic-locking`, `db-pessimistic-locking`, `db-mvcc`, `db-deadlock-prevention`).
2. Each new skill.yaml passes schema validation: `type: knowledge`, empty `tools: []`, `cognitive_mode: advisory-guide`, `tier: 3`, `state.persistent: false`, `platforms: [claude-code, gemini-cli, cursor, codex]`, and a `metadata.upstream` provenance link.
3. Each new SKILL.md contains all required sections: `## When to Use`, `## Instructions` (with `### Key Concepts`, `### Worked Example`, `### Anti-Patterns`, `### PostgreSQL Specifics`), `## Details` (with `### Advanced Topics`, `### Engine Differences`, `### Real-World Case Studies`), `## Source`, `## Process`, `## Harness Integration`, `## Success Criteria`.
4. Each SKILL.md is 150-250 lines with PostgreSQL-primary examples and at least one MySQL callout where behavior differs materially.
5. No SKILL.md contains ORM-specific syntax (no Prisma/Drizzle code).
6. Each skill.yaml has `related_skills` cross-referencing other `db-*` skills (Phase 1-4) and relevant ORM skills (`prisma-transactions`, `drizzle-transactions`) where applicable.
7. When `harness validate` is run, validation passes.

## File Map

```
CREATE agents/skills/claude-code/db-isolation-levels/skill.yaml
CREATE agents/skills/claude-code/db-isolation-levels/SKILL.md
CREATE agents/skills/claude-code/db-read-phenomena/skill.yaml
CREATE agents/skills/claude-code/db-read-phenomena/SKILL.md
CREATE agents/skills/claude-code/db-isolation-selection/skill.yaml
CREATE agents/skills/claude-code/db-isolation-selection/SKILL.md
CREATE agents/skills/claude-code/db-optimistic-locking/skill.yaml
CREATE agents/skills/claude-code/db-optimistic-locking/SKILL.md
CREATE agents/skills/claude-code/db-pessimistic-locking/skill.yaml
CREATE agents/skills/claude-code/db-pessimistic-locking/SKILL.md
CREATE agents/skills/claude-code/db-mvcc/skill.yaml
CREATE agents/skills/claude-code/db-mvcc/SKILL.md
CREATE agents/skills/claude-code/db-deadlock-prevention/skill.yaml
CREATE agents/skills/claude-code/db-deadlock-prevention/SKILL.md
```

_Skeleton not produced -- rigor level is fast._

## Tasks

All 7 skill-authoring tasks (Tasks 1-7) are **parallelizable** -- they have no dependencies on each other. Task 8 (validation) depends on all 7 completing.

---

### Task 1: Author db-isolation-levels skill

**Depends on:** none
**Parallelizable:** yes (with Tasks 2-7)
**Files:** `agents/skills/claude-code/db-isolation-levels/skill.yaml`, `agents/skills/claude-code/db-isolation-levels/SKILL.md`

1. Create directory `agents/skills/claude-code/db-isolation-levels/`

2. Create `agents/skills/claude-code/db-isolation-levels/skill.yaml`:

```yaml
name: db-isolation-levels
version: '1.0.0'
description: Read uncommitted through serializable -- PostgreSQL's MVCC-based isolation implementation
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - db-read-phenomena
  - db-isolation-selection
  - db-acid-properties
  - db-mvcc
  - db-pessimistic-locking
  - prisma-transactions
  - drizzle-transactions
stack_signals:
  - postgresql
  - mysql
  - database
keywords:
  - isolation-levels
  - read-uncommitted
  - read-committed
  - repeatable-read
  - serializable
  - MVCC
  - transaction-isolation
metadata:
  author: community
  upstream: 'postgresql.org/docs/current/transaction-iso.html'
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/db-isolation-levels/SKILL.md` (150-250 lines):

**Content requirements:**

- Title: `# Isolation Levels`
- Quote: one-sentence summary -- the four SQL standard isolation levels control which concurrent transaction side-effects are visible, with PostgreSQL implementing them via MVCC snapshots rather than locking
- `## When to Use`: choosing transaction isolation for a new feature, debugging phantom reads or non-repeatable reads, understanding why PostgreSQL's "Read Uncommitted" behaves like Read Committed, performance tuning concurrent workloads
- `## Instructions`:
  - `### Key Concepts`: The four levels defined by SQL standard:
    1. **Read Uncommitted** -- can see uncommitted changes from other transactions. PostgreSQL does not implement this; it silently upgrades to Read Committed. MySQL InnoDB supports it (rarely useful).
    2. **Read Committed** (PostgreSQL default) -- each statement sees only data committed before that statement began. Different statements within the same transaction can see different committed snapshots.
    3. **Repeatable Read** -- the transaction sees a snapshot taken at the first non-transaction-control statement. All queries see the same snapshot. PostgreSQL raises a serialization error on write conflicts instead of blocking.
    4. **Serializable** -- full serializable isolation via Serializable Snapshot Isolation (SSI). Transactions appear to execute one at a time. PostgreSQL detects read/write dependency cycles and aborts one transaction.
  - `### Worked Example`: Two-session demonstration showing Read Committed vs Repeatable Read behavior with concurrent UPDATE. Session A begins, reads a row, Session B updates and commits, Session A reads again -- under Read Committed the second read sees the update; under Repeatable Read it does not. Include `SET TRANSACTION ISOLATION LEVEL` syntax.
  - `### Anti-Patterns`:
    1. Using Serializable everywhere "for safety" -- unnecessary serialization failures and retries for workloads that only need Read Committed.
    2. Assuming Repeatable Read prevents all anomalies -- write skew is still possible under PostgreSQL Repeatable Read.
    3. Not handling serialization failures -- Serializable and Repeatable Read can raise `ERROR: could not serialize access`; application code must retry.
  - `### PostgreSQL Specifics`: PostgreSQL's Read Uncommitted is actually Read Committed. PostgreSQL uses SSI (predicate locking) for Serializable, not traditional two-phase locking. `SET default_transaction_isolation` for session-level defaults. `SHOW transaction_isolation` to inspect current level.
- `## Details`:
  - `### Advanced Topics`: SSI implementation -- SIRead locks (predicate locks), rw-dependency tracking, safe snapshot. Performance overhead of Serializable (~5-15% in typical OLTP). `pg_stat_activity.backend_xid` and `pg_stat_activity.backend_xmin` for monitoring.
  - `### Engine Differences`: MySQL InnoDB defaults to Repeatable Read (not Read Committed). MySQL uses gap locking for Repeatable Read (preventing phantom inserts), while PostgreSQL uses MVCC snapshots. MySQL's Serializable uses shared read locks.
  - `### Real-World Case Studies`: Financial reporting system that switched from Read Committed to Repeatable Read to get consistent point-in-time snapshots for end-of-day balance calculations, eliminating inconsistencies in reports that ran during active trading.
- `## Source`: PostgreSQL docs transaction-iso.html, Ports & Grittner "Serializable Snapshot Isolation in PostgreSQL" (VLDB 2012)
- `## Process`: 3-step process
- `## Harness Integration`: knowledge type, no tools or state, related_skills list
- `## Success Criteria`: correct isolation level selected for workload, serialization errors handled with retry logic

4. Verify line count is 150-250: `wc -l agents/skills/claude-code/db-isolation-levels/SKILL.md`
5. Run: `harness validate`
6. Commit: `feat(skills): add db-isolation-levels knowledge skill`

---

### Task 2: Author db-read-phenomena skill

**Depends on:** none
**Parallelizable:** yes (with Tasks 1, 3-7)
**Files:** `agents/skills/claude-code/db-read-phenomena/skill.yaml`, `agents/skills/claude-code/db-read-phenomena/SKILL.md`

1. Create directory `agents/skills/claude-code/db-read-phenomena/`

2. Create `agents/skills/claude-code/db-read-phenomena/skill.yaml`:

```yaml
name: db-read-phenomena
version: '1.0.0'
description: Dirty reads, non-repeatable reads, phantom reads, and serialization anomalies explained with concrete examples
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - db-isolation-levels
  - db-isolation-selection
  - db-acid-properties
  - db-mvcc
  - db-optimistic-locking
  - prisma-transactions
  - drizzle-transactions
stack_signals:
  - postgresql
  - mysql
  - database
keywords:
  - dirty-read
  - non-repeatable-read
  - phantom-read
  - write-skew
  - serialization-anomaly
  - read-phenomena
metadata:
  author: community
  upstream: 'postgresql.org/docs/current/transaction-iso.html#XACT-READ-PHENOMENA'
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/db-read-phenomena/SKILL.md` (150-250 lines):

**Content requirements:**

- Title: `# Read Phenomena`
- Quote: one-sentence summary -- the SQL standard defines three read anomalies (dirty, non-repeatable, phantom) that isolation levels progressively prevent, plus PostgreSQL adds write skew as a fourth anomaly relevant to Serializable
- `## When to Use`: debugging data inconsistencies in concurrent systems, understanding the trade-offs table in `SET TRANSACTION ISOLATION LEVEL` docs, choosing the correct isolation level, explaining why a query "sees stale data"
- `## Instructions`:
  - `### Key Concepts`: Four phenomena with definitions and two-session SQL demonstrations:
    1. **Dirty Read** -- reading uncommitted data from another transaction. If that transaction rolls back, you acted on data that never existed. Not possible in PostgreSQL (even Read Uncommitted prevents this).
    2. **Non-Repeatable Read** -- reading the same row twice in a transaction and getting different values because another transaction committed an UPDATE between reads. Possible under Read Committed. Prevented by Repeatable Read.
    3. **Phantom Read** -- re-executing a query and getting different rows because another transaction committed an INSERT/DELETE that matches the WHERE clause. Possible under Read Committed and (in some engines) Repeatable Read.
    4. **Write Skew** -- two transactions read overlapping data, make decisions based on what they read, and write non-overlapping data that together violate a constraint. Classic example: hospital on-call scheduling where two doctors simultaneously drop their on-call shift, each seeing the other is still on-call. Only prevented by Serializable.
  - Include the SQL standard phenomena vs isolation level matrix table.
  - `### Worked Example`: Write skew scenario -- two-session SQL showing the on-call scheduling problem under Repeatable Read (both succeed, constraint violated) vs Serializable (one aborted).
  - `### Anti-Patterns`:
    1. Ignoring non-repeatable reads in Read Committed -- reading a value, doing computation, then using it for a write without rechecking (the value may have changed).
    2. Believing Repeatable Read prevents all anomalies -- write skew is still possible in PostgreSQL Repeatable Read.
    3. Using SELECT then INSERT without SELECT FOR UPDATE or Serializable -- classic TOCTOU (time-of-check-time-of-use) race condition.
  - `### PostgreSQL Specifics`: PostgreSQL prevents dirty reads at all levels. PostgreSQL Repeatable Read also prevents phantom reads (MVCC snapshot), but not write skew. The phenomena matrix for PostgreSQL differs from the SQL standard minimum.
- `## Details`:
  - `### Advanced Topics`: Read-only transactions (`SET TRANSACTION READ ONLY`) get a deferrable snapshot under Serializable that never aborts. `pg_stat_user_tables.n_tup_hot_updated` as a signal for non-repeatable read risk in hot rows.
  - `### Engine Differences`: MySQL InnoDB uses gap locking to prevent phantom reads under Repeatable Read (a different mechanism than PostgreSQL's MVCC approach). MySQL does not support SSI -- its Serializable uses locking, which prevents write skew but at the cost of concurrency.
  - `### Real-World Case Studies`: Inventory system where concurrent orders both checked stock > 0, both decremented, resulting in negative stock -- a write skew that was invisible under Repeatable Read and required either Serializable isolation or an explicit row lock.
- `## Source`: PostgreSQL docs, Berenson et al. "A Critique of ANSI SQL Isolation Levels" (SIGMOD 1995)
- `## Process`: 3-step process
- `## Harness Integration`: knowledge type, no tools or state
- `## Success Criteria`: developers identify which read phenomenon causes their bug, choose the minimum isolation level that prevents it

4. Verify line count is 150-250: `wc -l agents/skills/claude-code/db-read-phenomena/SKILL.md`
5. Run: `harness validate`
6. Commit: `feat(skills): add db-read-phenomena knowledge skill`

---

### Task 3: Author db-isolation-selection skill

**Depends on:** none
**Parallelizable:** yes (with Tasks 1-2, 4-7)
**Files:** `agents/skills/claude-code/db-isolation-selection/skill.yaml`, `agents/skills/claude-code/db-isolation-selection/SKILL.md`

1. Create directory `agents/skills/claude-code/db-isolation-selection/`

2. Create `agents/skills/claude-code/db-isolation-selection/skill.yaml`:

```yaml
name: db-isolation-selection
version: '1.0.0'
description: Choosing isolation levels for specific workloads -- performance vs correctness trade-offs
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - db-isolation-levels
  - db-read-phenomena
  - db-acid-properties
  - db-optimistic-locking
  - db-pessimistic-locking
  - prisma-transactions
  - drizzle-transactions
stack_signals:
  - postgresql
  - mysql
  - database
keywords:
  - isolation-selection
  - workload-analysis
  - performance-correctness
  - retry-strategy
  - transaction-design
metadata:
  author: community
  upstream: 'postgresql.org/docs/current/transaction-iso.html'
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/db-isolation-selection/SKILL.md` (150-250 lines):

**Content requirements:**

- Title: `# Isolation Level Selection`
- Quote: one-sentence summary -- selecting the right isolation level requires matching the workload's correctness requirements against the performance cost and retry complexity of stricter levels
- `## When to Use`: starting a new feature with transaction requirements, optimizing transaction throughput, debugging serialization failures that seem unnecessary, deciding between isolation level and application-level locking
- `## Instructions`:
  - `### Key Concepts`: Decision framework:
    1. **Read Committed (default, use for most workloads)** -- CRUD operations, form submissions, content management. Low overhead. Works for 90% of web application transactions. Only unsafe when business logic depends on re-reading the same rows within a transaction.
    2. **Repeatable Read** -- reporting queries that must see a consistent snapshot, balance calculations, read-heavy analytics within a transaction. Adds the cost of potential serialization failures on write conflicts.
    3. **Serializable** -- financial transfers, inventory management with complex constraints, any workflow where write skew would violate business invariants. Requires retry logic for every transaction. ~5-15% throughput reduction.
    4. **Alternative to upgrading isolation: explicit locking** -- `SELECT FOR UPDATE` within Read Committed can prevent specific races without the full overhead of Serializable. See `db-pessimistic-locking`.
  - Include a decision table mapping workload types to recommended isolation levels.
  - `### Worked Example`: E-commerce checkout flow decision -- analyzing whether Read Committed with `SELECT FOR UPDATE` on inventory rows is better than Serializable for an order placement system. Show both approaches with SQL and discuss trade-offs (targeted lock vs global serialization overhead).
  - `### Anti-Patterns`:
    1. Setting Serializable as the database default -- all transactions pay the serialization cost, even simple reads.
    2. Choosing isolation level per-table instead of per-transaction -- isolation applies to the transaction, not individual tables.
    3. Upgrading isolation level to "fix bugs" without understanding the root cause -- the bug may be in application logic, not a concurrency anomaly.
    4. No retry loop for Repeatable Read / Serializable -- these levels raise serialization errors by design; the application must handle them.
  - `### PostgreSQL Specifics`: `SET default_transaction_isolation` at session or database level. Per-transaction override with `BEGIN ISOLATION LEVEL SERIALIZABLE`. `idle_in_transaction_session_timeout` to prevent long-running transactions from holding snapshots. Monitor serialization failure rate via `pg_stat_database.conflicts`.
- `## Details`:
  - `### Advanced Topics`: Retry loop implementation pattern (exponential backoff with jitter, max 3 retries). Read-only Serializable transactions with `DEFERRABLE` for zero-abort reporting. Connection pool implications -- transaction-level isolation means pool must not reuse connections mid-transaction.
  - `### Engine Differences`: MySQL defaults to Repeatable Read, so switching to PostgreSQL may require adjusting transaction designs. MySQL's gap locking provides some phantom protection that PostgreSQL handles differently (MVCC). MySQL Serializable uses shared locks (blocking) vs PostgreSQL SSI (optimistic, abort-on-conflict).
  - `### Real-World Case Studies`: SaaS platform that ran all transactions at Serializable, experiencing 15% serialization failure rate during peak hours. Profiling showed 80% of transactions were simple CRUD that only needed Read Committed. Selectively downgrading CRUD to Read Committed and keeping Serializable for billing reduced failure rate to 0.3%.
- `## Source`: PostgreSQL docs, "Designing Data-Intensive Applications" (Kleppmann, Chapter 7)
- `## Process`: 3-step process
- `## Harness Integration`: knowledge type, no tools or state
- `## Success Criteria`: isolation level chosen matches actual workload requirements, retry logic present for Repeatable Read and Serializable transactions

4. Verify line count is 150-250: `wc -l agents/skills/claude-code/db-isolation-selection/SKILL.md`
5. Run: `harness validate`
6. Commit: `feat(skills): add db-isolation-selection knowledge skill`

---

### Task 4: Author db-optimistic-locking skill

**Depends on:** none
**Parallelizable:** yes (with Tasks 1-3, 5-7)
**Files:** `agents/skills/claude-code/db-optimistic-locking/skill.yaml`, `agents/skills/claude-code/db-optimistic-locking/SKILL.md`

1. Create directory `agents/skills/claude-code/db-optimistic-locking/`

2. Create `agents/skills/claude-code/db-optimistic-locking/skill.yaml`:

```yaml
name: db-optimistic-locking
version: '1.0.0'
description: Version columns, conditional updates, conflict detection and retry patterns for optimistic concurrency control
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - db-pessimistic-locking
  - db-mvcc
  - db-isolation-levels
  - db-deadlock-prevention
  - db-acid-properties
  - prisma-transactions
  - drizzle-transactions
stack_signals:
  - postgresql
  - mysql
  - database
keywords:
  - optimistic-locking
  - version-column
  - conditional-update
  - conflict-detection
  - retry-pattern
  - compare-and-swap
  - OCC
metadata:
  author: community
  upstream: 'postgresql.org/docs/current/applevel-consistency.html'
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/db-optimistic-locking/SKILL.md` (150-250 lines):

**Content requirements:**

- Title: `# Optimistic Locking`
- Quote: one-sentence summary -- optimistic locking assumes conflicts are rare, allows concurrent reads without locks, and detects conflicts at write time using version columns or conditional updates
- `## When to Use`: web applications with read-heavy workloads and infrequent write conflicts, edit-and-save workflows (CMS, admin panels), any scenario where holding database locks during user think-time is unacceptable
- `## Instructions`:
  - `### Key Concepts`:
    1. **Version column pattern** -- add an integer `version` column. Read the row (including version). Update with `WHERE id = $1 AND version = $2`, incrementing version. Check `rows_affected` -- if 0, someone else modified the row (conflict). Schema: `ALTER TABLE products ADD COLUMN version INTEGER NOT NULL DEFAULT 0;`
    2. **Timestamp-based** -- use `updated_at` instead of integer version. Less reliable (two updates in the same millisecond) but sometimes sufficient for low-contention workloads.
    3. **Conditional update (compare-and-swap)** -- `UPDATE accounts SET balance = $new WHERE id = $1 AND balance = $old`. No extra column needed, but only works when you can compare the relevant fields.
    4. **Conflict detection and retry** -- when `rows_affected = 0`, re-read the row, re-apply business logic, retry. Limit retries (3-5) with backoff. Return 409 Conflict to the client if retries exhausted.
  - `### Worked Example`: Product inventory update in an e-commerce system. Show the full flow: (1) `SELECT id, name, stock, version FROM products WHERE id = 42;` (2) application decrements stock (3) `UPDATE products SET stock = $1, version = version + 1 WHERE id = 42 AND version = $2;` (4) check result rows (5) retry on conflict. Include the retry loop pseudocode.
  - `### Anti-Patterns`:
    1. Forgetting to check `rows_affected` -- the UPDATE silently does nothing on conflict, and the application assumes success.
    2. Using optimistic locking for high-contention resources -- if conflicts exceed 5-10%, pessimistic locking is more efficient (fewer wasted retries).
    3. Version column not included in every UPDATE -- if any code path updates the row without incrementing version, the version becomes meaningless.
    4. Retrying without re-reading -- the retry must re-read the current state, not just re-execute the same UPDATE.
  - `### PostgreSQL Specifics`: `RETURNING` clause to get the new version in one round trip: `UPDATE ... SET version = version + 1 ... RETURNING version;`. `xmin` system column as a free version indicator (changes on every update), but `xmin` wraps around and is not safe for long-lived comparisons.
- `## Details`:
  - `### Advanced Topics`: Combining optimistic locking with Read Committed -- the `WHERE version = $old` check provides the conflict detection that Read Committed does not. Using `pg_advisory_lock` as a hybrid approach. Optimistic locking in distributed systems (ETags in HTTP, CAS in Redis).
  - `### Engine Differences`: MySQL InnoDB supports the same version column pattern. MySQL's `ROW_COUNT()` function serves the same role as PostgreSQL's returned row count. Both engines handle this at the application level -- it is not a database feature but a pattern.
  - `### Real-World Case Studies`: Content management system where editors frequently edited the same articles. Pessimistic locking caused editors to wait; switching to optimistic locking with version columns and a merge UI for conflicts improved throughput and user experience, with actual conflicts occurring in less than 2% of edits.
- `## Source`: Fowler, "Patterns of Enterprise Application Architecture" (Optimistic Offline Lock), PostgreSQL docs
- `## Process`: 3-step process
- `## Harness Integration`: knowledge type, no tools or state
- `## Success Criteria`: version column present on mutable entities, every UPDATE checks version, retry logic handles conflicts gracefully

4. Verify line count is 150-250: `wc -l agents/skills/claude-code/db-optimistic-locking/SKILL.md`
5. Run: `harness validate`
6. Commit: `feat(skills): add db-optimistic-locking knowledge skill`

---

### Task 5: Author db-pessimistic-locking skill

**Depends on:** none
**Parallelizable:** yes (with Tasks 1-4, 6-7)
**Files:** `agents/skills/claude-code/db-pessimistic-locking/skill.yaml`, `agents/skills/claude-code/db-pessimistic-locking/SKILL.md`

1. Create directory `agents/skills/claude-code/db-pessimistic-locking/`

2. Create `agents/skills/claude-code/db-pessimistic-locking/skill.yaml`:

```yaml
name: db-pessimistic-locking
version: '1.0.0'
description: SELECT FOR UPDATE, lock granularity, lock duration, and row-level locking strategies
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - db-optimistic-locking
  - db-deadlock-prevention
  - db-isolation-levels
  - db-mvcc
  - db-acid-properties
  - prisma-transactions
  - drizzle-transactions
stack_signals:
  - postgresql
  - mysql
  - database
keywords:
  - pessimistic-locking
  - select-for-update
  - row-lock
  - lock-granularity
  - lock-duration
  - exclusive-lock
  - shared-lock
  - FOR-NO-KEY-UPDATE
metadata:
  author: community
  upstream: 'postgresql.org/docs/current/explicit-locking.html'
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/db-pessimistic-locking/SKILL.md` (150-250 lines):

**Content requirements:**

- Title: `# Pessimistic Locking`
- Quote: one-sentence summary -- pessimistic locking acquires locks before modifying data, guaranteeing exclusive access and preventing conflicts at the cost of reduced concurrency
- `## When to Use`: high-contention resources where optimistic retries would be excessive, financial transactions requiring guaranteed exclusive access, inventory decrements where overselling is unacceptable, queue-like processing patterns (`SKIP LOCKED`)
- `## Instructions`:
  - `### Key Concepts`:
    1. **SELECT FOR UPDATE** -- acquires a row-level exclusive lock. Other transactions attempting `FOR UPDATE` or `UPDATE` on the same row block until the lock is released (at `COMMIT`/`ROLLBACK`). `SELECT * FROM accounts WHERE id = 1 FOR UPDATE;`
    2. **Lock modes** -- `FOR UPDATE` (exclusive, blocks all other locks), `FOR NO KEY UPDATE` (blocks other updates but allows `FOR KEY SHARE` -- useful when you update non-key columns), `FOR SHARE` (shared read lock, prevents modifications), `FOR KEY SHARE` (lightest, prevents key changes only).
    3. **NOWAIT and SKIP LOCKED** -- `FOR UPDATE NOWAIT` raises an error immediately instead of waiting. `FOR UPDATE SKIP LOCKED` skips already-locked rows -- essential for job queue patterns.
    4. **Lock duration** -- row locks are held until end of transaction. Keep transactions short to minimize blocking.
  - `### Worked Example`: Job queue processing with `SKIP LOCKED`. Multiple workers pulling tasks: `BEGIN; SELECT * FROM tasks WHERE status = 'pending' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED; UPDATE tasks SET status = 'processing', worker_id = $1 WHERE id = $task_id; COMMIT;` Show how two workers simultaneously dequeue different rows without conflicts.
  - `### Anti-Patterns`:
    1. Locking rows during user think-time -- holding `FOR UPDATE` across an HTTP request-response cycle blocks other users for seconds or minutes.
    2. Locking more rows than needed -- `SELECT * FROM orders FOR UPDATE` without a WHERE clause locks the entire table.
    3. Forgetting `SKIP LOCKED` in queue patterns -- without it, workers serialize on the same row instead of processing in parallel.
    4. Mixing `FOR UPDATE` with `SERIALIZABLE` -- redundant and can cause unexpected serialization failures.
  - `### PostgreSQL Specifics`: `pg_locks` view for monitoring active locks. `lock_timeout` setting to prevent indefinite waits. `deadlock_timeout` (default 1s) controls when PostgreSQL checks for deadlocks. Advisory locks (`pg_advisory_lock`) for application-defined locking outside of row scope.
- `## Details`:
  - `### Advanced Topics`: Advisory locks for distributed coordination -- `pg_advisory_lock(hashtext('resource_name'))`. Table-level locks (`LOCK TABLE`) for bulk operations. `pg_blocking_pids()` function to identify who is blocking whom. Lock escalation -- PostgreSQL does not escalate row locks to table locks (unlike SQL Server).
  - `### Engine Differences`: MySQL InnoDB uses gap locking in addition to row locking under Repeatable Read -- `FOR UPDATE` can lock index gaps, blocking inserts in ranges. PostgreSQL does not use gap locks (MVCC handles phantoms differently). MySQL's `LOCK IN SHARE MODE` is the equivalent of PostgreSQL's `FOR SHARE`.
  - `### Real-World Case Studies`: Ticket booking system that switched from optimistic to pessimistic locking for seat selection. Under high contention (concert on-sale events), optimistic locking caused 40% retry rate. `SELECT FOR UPDATE NOWAIT` with immediate user feedback ("seat unavailable, pick another") reduced conflicts to near zero and improved UX.
- `## Source`: PostgreSQL docs explicit-locking.html, "Designing Data-Intensive Applications" (Kleppmann)
- `## Process`: 3-step process
- `## Harness Integration`: knowledge type, no tools or state
- `## Success Criteria`: row locks scoped to minimum necessary rows, transactions kept short, SKIP LOCKED used for queue patterns, NOWAIT used when immediate feedback is preferred

4. Verify line count is 150-250: `wc -l agents/skills/claude-code/db-pessimistic-locking/SKILL.md`
5. Run: `harness validate`
6. Commit: `feat(skills): add db-pessimistic-locking knowledge skill`

---

### Task 6: Author db-mvcc skill

**Depends on:** none
**Parallelizable:** yes (with Tasks 1-5, 7)
**Files:** `agents/skills/claude-code/db-mvcc/skill.yaml`, `agents/skills/claude-code/db-mvcc/SKILL.md`

1. Create directory `agents/skills/claude-code/db-mvcc/`

2. Create `agents/skills/claude-code/db-mvcc/skill.yaml`:

```yaml
name: db-mvcc
version: '1.0.0'
description: Multi-version concurrency control, snapshot isolation, tuple visibility, and vacuum/bloat management
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - db-isolation-levels
  - db-read-phenomena
  - db-acid-in-practice
  - db-pessimistic-locking
  - db-optimistic-locking
  - db-deadlock-prevention
stack_signals:
  - postgresql
  - mysql
  - database
keywords:
  - MVCC
  - multi-version-concurrency-control
  - snapshot-isolation
  - vacuum
  - autovacuum
  - bloat
  - xmin
  - xmax
  - tuple-visibility
  - dead-tuples
metadata:
  author: community
  upstream: 'postgresql.org/docs/current/mvcc-intro.html'
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/db-mvcc/SKILL.md` (150-250 lines):

**Content requirements:**

- Title: `# MVCC (Multi-Version Concurrency Control)`
- Quote: one-sentence summary -- MVCC allows readers and writers to operate concurrently without blocking each other by maintaining multiple versions of each row, with visibility determined by transaction snapshots
- `## When to Use`: understanding why PostgreSQL does not block reads during writes, debugging table bloat, tuning autovacuum, understanding `xmin`/`xmax` system columns, diagnosing "transaction ID wraparound" warnings
- `## Instructions`:
  - `### Key Concepts`:
    1. **How MVCC works** -- every row has hidden `xmin` (transaction that created it) and `xmax` (transaction that deleted/updated it) columns. An UPDATE creates a new row version and marks the old one as dead. Readers see the version visible to their snapshot.
    2. **Snapshot visibility** -- a transaction takes a snapshot of active transaction IDs. A row is visible if: `xmin` is committed and before the snapshot, and `xmax` is either empty, aborted, or after the snapshot.
    3. **Dead tuples and bloat** -- old row versions are not immediately removed. They accumulate as "dead tuples," causing table bloat (wasted disk space and slower sequential scans).
    4. **VACUUM** -- reclaims dead tuples. `VACUUM` marks space reusable; `VACUUM FULL` compacts the table (requires exclusive lock). Autovacuum runs automatically based on thresholds.
    5. **Transaction ID wraparound** -- transaction IDs are 32-bit. After ~2 billion transactions, wraparound can make all data invisible. Autovacuum's freeze process prevents this.
  - `### Worked Example`: Demonstrate MVCC visibility with `xmin`/`xmax`. `CREATE TABLE demo (id int, val text); INSERT INTO demo VALUES (1, 'a'); SELECT xmin, xmax, * FROM demo;` Show how an UPDATE in another session creates a new tuple with new `xmin` while old tuple gets `xmax` set. Query `pg_stat_user_tables` to show dead tuples accumulating, then `VACUUM VERBOSE demo;` to clean them.
  - `### Anti-Patterns`:
    1. Disabling autovacuum -- dead tuples accumulate, table bloat grows unbounded, eventually causing transaction ID wraparound emergency.
    2. Long-running transactions holding snapshots -- prevents VACUUM from reclaiming any tuples created after the transaction's snapshot, even in other tables.
    3. High-churn UPDATE patterns without monitoring bloat -- tables that receive millions of updates per day can bloat to 10x their actual data size.
    4. Using `VACUUM FULL` in production during business hours -- requires ACCESS EXCLUSIVE lock, blocks all queries.
  - `### PostgreSQL Specifics`: Autovacuum thresholds: `autovacuum_vacuum_threshold` (default 50) + `autovacuum_vacuum_scale_factor` (default 0.2) = vacuum triggers when dead tuples exceed 50 + 20% of table size. `pg_stat_user_tables.n_dead_tup` for monitoring. `pg_bloat_check` extension for detecting bloated tables. Per-table autovacuum tuning with `ALTER TABLE ... SET (autovacuum_vacuum_scale_factor = 0.01)` for high-churn tables.
- `## Details`:
  - `### Advanced Topics`: HOT (Heap-Only Tuples) updates -- if the update does not change indexed columns, PostgreSQL can chain the new version to the old one without updating indexes, significantly reducing bloat. `fillfactor` setting to leave room for HOT updates. Transaction ID wraparound prevention: `age(relfrozenxid)` monitoring, `vacuum_freeze_min_age` tuning. `pg_repack` extension for online table compaction without exclusive locks.
  - `### Engine Differences`: MySQL InnoDB also uses MVCC but stores undo information in a separate undo log (rollback segment) rather than in-place tuple versioning. InnoDB automatically purges old versions from the undo log. No equivalent of PostgreSQL's VACUUM -- InnoDB's purge thread handles cleanup automatically. InnoDB does not suffer from table bloat in the same way, but undo log bloat is possible with long-running transactions.
  - `### Real-World Case Studies`: A high-traffic analytics platform had a 200GB table that grew to 1.8TB due to bloat from frequent small updates with autovacuum defaults. Tuning `autovacuum_vacuum_scale_factor` to 0.01 and `autovacuum_vacuum_cost_delay` to 2ms for that table reduced bloat to 15% and reclaimed 1.5TB of disk space.
- `## Source`: PostgreSQL docs mvcc-intro.html, routine-vacuuming.html
- `## Process`: 3-step process
- `## Harness Integration`: knowledge type, no tools or state
- `## Success Criteria`: autovacuum monitored and tuned for high-churn tables, dead tuple counts tracked, no tables approaching transaction ID wraparound

4. Verify line count is 150-250: `wc -l agents/skills/claude-code/db-mvcc/SKILL.md`
5. Run: `harness validate`
6. Commit: `feat(skills): add db-mvcc knowledge skill`

---

### Task 7: Author db-deadlock-prevention skill

**Depends on:** none
**Parallelizable:** yes (with Tasks 1-6)
**Files:** `agents/skills/claude-code/db-deadlock-prevention/skill.yaml`, `agents/skills/claude-code/db-deadlock-prevention/SKILL.md`

1. Create directory `agents/skills/claude-code/db-deadlock-prevention/`

2. Create `agents/skills/claude-code/db-deadlock-prevention/skill.yaml`:

```yaml
name: db-deadlock-prevention
version: '1.0.0'
description: Lock ordering, timeout strategies, deadlock detection, and resolution patterns
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - db-pessimistic-locking
  - db-optimistic-locking
  - db-mvcc
  - db-isolation-levels
  - db-acid-properties
stack_signals:
  - postgresql
  - mysql
  - database
keywords:
  - deadlock
  - lock-ordering
  - deadlock-detection
  - deadlock-timeout
  - lock-timeout
  - deadlock-prevention
  - lock-graph
metadata:
  author: community
  upstream: 'postgresql.org/docs/current/explicit-locking.html#LOCKING-DEADLOCKS'
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/db-deadlock-prevention/SKILL.md` (150-250 lines):

**Content requirements:**

- Title: `# Deadlock Prevention`
- Quote: one-sentence summary -- deadlocks occur when two or more transactions hold locks and each waits for a lock the other holds; prevention through consistent lock ordering and detection through timeout-based abort resolves them
- `## When to Use`: designing transactions that lock multiple rows, debugging `ERROR: deadlock detected`, setting lock timeout strategies, preventing deadlocks in batch operations
- `## Instructions`:
  - `### Key Concepts`:
    1. **What is a deadlock** -- Transaction A locks row 1, Transaction B locks row 2, then A tries to lock row 2 (blocked) and B tries to lock row 1 (blocked). Neither can proceed. Show a two-session SQL example.
    2. **Lock ordering** -- the primary prevention strategy. All transactions that need to lock multiple rows must lock them in the same order (e.g., ascending primary key). `SELECT * FROM accounts WHERE id IN (1, 2) ORDER BY id FOR UPDATE;` -- sorting by ID guarantees consistent ordering.
    3. **Lock timeout** -- `SET lock_timeout = '5s';` causes the transaction to fail immediately rather than wait indefinitely. Combines with retry logic.
    4. **Deadlock detection** -- PostgreSQL automatically detects deadlocks after `deadlock_timeout` (default 1s) and aborts one transaction with `ERROR: deadlock detected`. The aborted transaction must retry.
    5. **Reducing lock scope** -- lock fewer rows, lock for shorter duration, use `FOR NO KEY UPDATE` instead of `FOR UPDATE` when possible.
  - `### Worked Example`: Bank transfer that avoids deadlocks. Show the naive approach (lock sender then receiver -- deadlock if simultaneous transfers in opposite directions) and the fixed approach (always lock the lower account ID first). Include the SQL for both.
  - `### Anti-Patterns`:
    1. Locking rows in query-result order instead of a deterministic order -- if two queries return the same rows in different orders, deadlock is possible.
    2. Not handling `ERROR: deadlock detected` -- the transaction is already aborted; the application must retry the entire transaction, not just the failed statement.
    3. Setting `deadlock_timeout` too high -- transactions wait longer before detection, wasting connection pool slots.
    4. Acquiring locks incrementally in a loop -- lock all needed rows in one statement (`WHERE id = ANY($1) ORDER BY id FOR UPDATE`) instead of one row at a time.
  - `### PostgreSQL Specifics`: `deadlock_timeout` (default 1s) -- how long to wait before checking for deadlocks. `log_lock_waits = on` logs any lock wait exceeding `deadlock_timeout`. `pg_locks` view joined with `pg_stat_activity` to inspect current lock state. `pg_blocking_pids(pid)` to find blockers.
- `## Details`:
  - `### Advanced Topics`: Deadlock detection algorithm -- PostgreSQL builds a wait-for graph and detects cycles. The victim is chosen to minimize rollback cost. Advisory lock deadlocks -- `pg_advisory_lock` participates in deadlock detection. Batch operations: break large batches into smaller transactions to reduce lock hold time and deadlock window.
  - `### Engine Differences`: MySQL InnoDB detects deadlocks immediately (no timeout-based check) and rolls back the transaction with the fewest row modifications. MySQL's gap locking creates additional deadlock scenarios not present in PostgreSQL -- two transactions inserting into the same gap can deadlock even without explicit locking.
  - `### Real-World Case Studies`: Payment processing system experiencing 50+ deadlocks per hour during peak. Root cause: transfers locked sender and receiver accounts in arbitrary order. Fixing lock ordering (always lock lower account ID first) eliminated deadlocks entirely. Added `log_lock_waits = on` for ongoing monitoring.
- `## Source`: PostgreSQL docs explicit-locking.html, "Transaction Processing" (Gray & Reuter)
- `## Process`: 3-step process
- `## Harness Integration`: knowledge type, no tools or state
- `## Success Criteria`: multi-row locking uses consistent ordering, deadlock detection monitoring enabled, retry logic handles deadlock errors

4. Verify line count is 150-250: `wc -l agents/skills/claude-code/db-deadlock-prevention/SKILL.md`
5. Run: `harness validate`
6. Commit: `feat(skills): add db-deadlock-prevention knowledge skill`

---

### Task 8: Validate all 7 skills and update arch baseline

**Depends on:** Tasks 1-7
**Parallelizable:** no

[checkpoint:human-verify] -- Verify all 7 skills are authored before running validation.

1. Verify all 7 directories exist:

   ```bash
   ls -d agents/skills/claude-code/db-isolation-levels agents/skills/claude-code/db-read-phenomena agents/skills/claude-code/db-isolation-selection agents/skills/claude-code/db-optimistic-locking agents/skills/claude-code/db-pessimistic-locking agents/skills/claude-code/db-mvcc agents/skills/claude-code/db-deadlock-prevention
   ```

2. Verify total db-\* skill count is 36 (29 from Phase 1-3 + 7 new):

   ```bash
   ls -d agents/skills/claude-code/db-* | wc -l
   ```

3. Verify line counts (150-250 each):

   ```bash
   wc -l agents/skills/claude-code/db-isolation-levels/SKILL.md agents/skills/claude-code/db-read-phenomena/SKILL.md agents/skills/claude-code/db-isolation-selection/SKILL.md agents/skills/claude-code/db-optimistic-locking/SKILL.md agents/skills/claude-code/db-pessimistic-locking/SKILL.md agents/skills/claude-code/db-mvcc/SKILL.md agents/skills/claude-code/db-deadlock-prevention/SKILL.md
   ```

4. Run structure tests:

   ```bash
   npx vitest run agents/skills/tests/structure.test.ts
   ```

5. Run schema tests:

   ```bash
   npx vitest run agents/skills/tests/schema.test.ts
   ```

6. Verify no ORM syntax leaked into any new skill:

   ```bash
   grep -r -i "prisma\.\|drizzle\.\|typeorm\.\|sequelize\." agents/skills/claude-code/db-isolation-levels/SKILL.md agents/skills/claude-code/db-read-phenomena/SKILL.md agents/skills/claude-code/db-isolation-selection/SKILL.md agents/skills/claude-code/db-optimistic-locking/SKILL.md agents/skills/claude-code/db-pessimistic-locking/SKILL.md agents/skills/claude-code/db-mvcc/SKILL.md agents/skills/claude-code/db-deadlock-prevention/SKILL.md
   ```

   Expected: no matches.

7. Verify all skill.yaml files have required fields:

   ```bash
   grep -l "cognitive_mode: advisory-guide" agents/skills/claude-code/db-isolation-levels/skill.yaml agents/skills/claude-code/db-read-phenomena/skill.yaml agents/skills/claude-code/db-isolation-selection/skill.yaml agents/skills/claude-code/db-optimistic-locking/skill.yaml agents/skills/claude-code/db-pessimistic-locking/skill.yaml agents/skills/claude-code/db-mvcc/skill.yaml agents/skills/claude-code/db-deadlock-prevention/skill.yaml | wc -l
   ```

   Expected: 7.

8. Verify cross-references to existing ORM skills:

   ```bash
   grep -l "prisma-transactions" agents/skills/claude-code/db-isolation-levels/skill.yaml agents/skills/claude-code/db-read-phenomena/skill.yaml agents/skills/claude-code/db-isolation-selection/skill.yaml agents/skills/claude-code/db-optimistic-locking/skill.yaml agents/skills/claude-code/db-pessimistic-locking/skill.yaml
   ```

   Expected: 5 matches (isolation-levels, read-phenomena, isolation-selection, optimistic-locking, pessimistic-locking).

9. Update arch baseline:

   ```bash
   npx harness check-arch --update-baseline
   ```

10. Run: `harness validate`

11. If all pass, commit: `chore(skills): validate phase 4 transactions and concurrency skills`
