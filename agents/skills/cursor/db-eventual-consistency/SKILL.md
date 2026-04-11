# Eventual Consistency

> If no new updates are made, all replicas will eventually converge to the same value -- a consistency model that trades immediate agreement for higher availability and lower latency.

## When to Use

- Designing systems with read replicas where slight staleness is acceptable
- Understanding and measuring replication lag behavior
- Choosing conflict resolution strategies for multi-writer distributed systems
- Working with distributed caches, queues, or event-driven architectures
- Implementing read-your-writes patterns for user-facing applications

## Instructions

### BASE Properties

BASE is the counterpoint to ACID for distributed systems:

- **Basically Available:** The system appears to work most of the time. Individual node failures do not take down the whole system. Partial failures are tolerated.
- **Soft state:** The system's state may change without explicit input because replicas are still converging. A read now and a read 2 seconds later may return different values even if no writes occurred.
- **Eventually consistent:** Given sufficient time without new updates, all replicas converge to the same value. "Sufficient time" is typically milliseconds to seconds but can be longer under load or partition.

**ACID vs. BASE comparison:**

```
ACID                          BASE
────                          ────
Strong consistency            Eventual consistency
Pessimistic (lock first)      Optimistic (resolve later)
Availability sacrifice        Consistency sacrifice
Single-node focus             Distributed-system focus
```

### Replication Lag in PostgreSQL

PostgreSQL streaming replication introduces observable lag between primary and replica:

```sql
-- On the replica: measure how far behind the primary we are
SELECT
  now() - pg_last_xact_replay_timestamp() AS replication_lag;
```

**Real-world scenario:** A user updates their profile name on the primary. The application immediately redirects to a profile page that reads from a replica. The replica has not received the update yet. The user sees their old name -- a classic eventual consistency artifact.

Typical replication lag under normal conditions is 1-100ms. Under write-heavy load or network congestion, it can reach seconds or minutes.

### Convergence Strategy 1: Last-Write-Wins (LWW)

The simplest conflict resolution: the write with the latest timestamp wins.

```sql
-- Two nodes receive concurrent writes for the same row
-- Node A: UPDATE users SET name = 'Alice B.' WHERE id = 1;  -- timestamp 12:00:00.001
-- Node B: UPDATE users SET name = 'Alice C.' WHERE id = 1;  -- timestamp 12:00:00.003

-- LWW resolution: 'Alice C.' wins because its timestamp is later
```

**Problem:** Clock skew between nodes can cause the "earlier" logical write to have a later timestamp. A valid update gets silently discarded. LWW is acceptable only when losing a concurrent update is tolerable (profile pictures, status messages) -- never for counters or financial data.

### Convergence Strategy 2: Version Vectors

Each node maintains a version counter per node. Concurrent writes are detected (not silently resolved) and flagged for manual or application-level resolution.

```
Node A version vector: {A: 3, B: 2}
Node B version vector: {A: 2, B: 3}

-- Neither dominates the other -> conflict detected
-- System flags both versions for resolution
```

Used by: Riak (sibling values), DynamoDB (conditional writes with version checks).

### Convergence Strategy 3: CRDTs

Conflict-free Replicated Data Types are data structures designed to merge automatically without coordination.

**G-Counter example (distributed page view counting):**

```
Node A counter: {A: 150, B: 0, C: 0}   -- A has seen 150 views
Node B counter: {A: 0, B: 230, C: 0}   -- B has seen 230 views
Node C counter: {A: 0, B: 0, C: 95}    -- C has seen 95 views

-- Merge: take max of each node's count
-- Total = 150 + 230 + 95 = 475
```

Each node only increments its own counter. Merging takes the maximum per node. No conflicts possible -- the merge is commutative, associative, and idempotent.

**Common CRDT types:**

- **G-Counter:** Grow-only counter (page views, likes)
- **PN-Counter:** Counter that supports increment and decrement
- **OR-Set:** Observed-Remove Set (shopping cart items, tag sets)
- **LWW-Register:** Single value with last-write-wins semantics

### Convergence Strategy 4: Application-Level Resolution

When business logic determines the merge, no generic strategy works. The system stores all conflicting versions and the application resolves them.

**Example -- shopping cart merge:**

```
User adds item A on their phone:    cart = {A, B}
User adds item C on their laptop:   cart = {B, C}

-- Application resolution: union of both carts
-- Merged cart = {A, B, C}
```

Amazon's Dynamo paper (2007) uses this approach: the shopping cart is a CRDT-like set where the merge function is union.

### Read-Your-Writes Consistency

A pattern that ensures the session that wrote data can immediately read it back, even in an eventually consistent system:

**Option 1 -- route reads to primary after writes:**

```
-- Pseudocode
if (session.has_recent_write):
    read_from(primary)
else:
    read_from(replica)
```

**Option 2 -- wait for replica to catch up:**

```sql
-- PostgreSQL: ensure replica has applied up to this LSN
SELECT pg_last_wal_replay_lsn() >= 'A/B1C2D3E'::pg_lsn;
```

**Option 3 -- synchronous replication for specific transactions:**

```sql
-- On the primary: wait for replica to apply before returning
SET synchronous_commit = remote_apply;
UPDATE users SET name = 'Alice' WHERE id = 1;
```

### Worked Example: Notification Service

A notification service writes new notifications to the primary and reads the notification count from a replica for the badge display. After sending a notification, the count badge does not update for 200ms (replication lag).

Fix: After writing a notification, include the primary's WAL LSN in the response. The frontend sends this LSN with the badge count request. The read path waits for the replica to reach that LSN before querying:

```sql
-- Wait up to 5 seconds for replica to catch up to the given LSN
SELECT pg_wal_replay_wait('0/16B3748'::pg_lsn, 5000);
SELECT COUNT(*) FROM notifications WHERE user_id = 42 AND read = false;
```

### Anti-Patterns

1. **Assuming eventual means "consistent soon enough."** Without measuring actual replication lag, "eventually" could mean seconds or minutes under load. Monitor lag with `pg_stat_replication` and set alerts for unacceptable values.

2. **Using eventual consistency for operations that require read-your-writes.** If a user changes their email and immediately needs to log in with it, eventual consistency on the auth read path causes login failures.

3. **Ignoring conflict resolution strategy.** If two writers can update the same data, you need a conflict resolution strategy. "Conflicts probably will not happen" is not a strategy -- they will happen, and silent data loss is the result.

4. **Treating all reads equally.** Not every read needs strong consistency. Classify your read operations by staleness tolerance and route accordingly.

## Details

### The Consistency Spectrum

From strongest to weakest:

```
Strong (linearizable)    -- Every read sees the latest write. Single source of truth.
Sequential               -- All nodes see operations in the same order (but not necessarily the latest).
Causal                   -- Operations that are causally related are seen in order. Concurrent operations may be seen differently.
Eventual                 -- All replicas converge given enough time. No ordering guarantees.
```

Most applications need causal consistency at minimum for user-facing operations and can tolerate eventual consistency for background or analytics operations.

### PostgreSQL Logical Replication and Conflicts

PostgreSQL logical replication (used for selective table replication and version upgrades) uses last-write-wins by default. If the same row is updated on both publisher and subscriber, the subscriber's local change is overwritten when the publisher's change arrives.

```sql
-- Logical replication conflict handling
ALTER SUBSCRIPTION my_sub SET (disable_on_error = true);
```

Conflicts in logical replication are logged but not automatically resolved. Monitor `pg_stat_subscription` for error states.

### MySQL Callout

MySQL Group Replication offers a "virtually synchronous" mode where transactions are certified (checked for conflicts) across all group members before committing. This provides a stronger consistency guarantee than pure asynchronous replication while maintaining higher availability than fully synchronous replication. It is MySQL's closest equivalent to PostgreSQL's synchronous replication with `remote_apply`.

### Real-World Case Study: E-Commerce Inventory

An e-commerce platform used eventually consistent read replicas for product pages. Inventory counts on product pages were served from replicas with 100-500ms lag. Problem: customers saw "In Stock" on the product page but got "Out of Stock" errors at checkout (which hit the primary).

Solution: A hybrid approach. Product descriptions, images, and reviews were served from replicas (eventual consistency -- staleness is invisible). Inventory counts and prices were served from the primary via a dedicated API endpoint with connection pooling. The extra primary load was minimal (inventory is a single indexed lookup) and eliminated the customer-visible inconsistency.

## Source

- [PostgreSQL Warm Standby](https://www.postgresql.org/docs/current/warm-standby.html)
- [PostgreSQL Streaming Replication](https://www.postgresql.org/docs/current/streaming-replication.html)
- Vogels, W. "Eventually Consistent" (2008)
- Shapiro, M. et al. "A Comprehensive Study of Convergent and Commutative Replicated Data Types" (2011)
- DeCandia, G. et al. "Dynamo: Amazon's Highly Available Key-value Store" (2007)

## Process

1. Read the BASE properties and convergence strategies in this document.
2. Classify each read operation in your system by staleness tolerance, and route reads to primary or replica accordingly.
3. For multi-writer scenarios, choose and implement an explicit conflict resolution strategy before deployment.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-cap-theorem, db-acid-properties

## Success Criteria

- Read operations are classified by staleness tolerance, with critical reads routed to the primary.
- A conflict resolution strategy is explicitly chosen and implemented for any multi-writer data paths.
