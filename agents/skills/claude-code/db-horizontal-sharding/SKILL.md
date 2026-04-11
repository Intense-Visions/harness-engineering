# Horizontal Sharding

> Distributing rows of a table across multiple database instances (shards) to scale beyond the capacity of a single server, with careful attention to shard key selection and cross-shard query complexity.

## When to Use

- A single PostgreSQL instance cannot handle the write volume or storage requirements
- Vertical scaling (bigger hardware) has reached its practical or cost limit
- Multi-tenant applications where tenants can be isolated to separate databases
- Read-heavy workloads that have already exhausted read replicas
- Planning data architecture for a system expected to grow beyond 10 TB

## Instructions

### Key Concepts

**1. What Is Horizontal Sharding**

Horizontal sharding splits a table's rows across multiple independent database instances. Each shard holds a subset of the data. The application or a routing layer determines which shard to query based on the shard key.

```
Unsharded:  [All orders in one database]

Sharded:    Shard 0: orders where tenant_id % 4 = 0
            Shard 1: orders where tenant_id % 4 = 1
            Shard 2: orders where tenant_id % 4 = 2
            Shard 3: orders where tenant_id % 4 = 3
```

**2. Shard Key Selection**

The shard key determines data distribution. A good shard key:

- Is present in every query (avoids cross-shard scatter)
- Distributes data evenly (avoids hot shards)
- Is immutable or rarely changes (avoids shard migration)
- Aligns with the application's access pattern

```
Good shard keys:
  tenant_id   -- multi-tenant SaaS (queries always filter by tenant)
  user_id     -- social platforms (queries center on a user)
  region      -- geographically distributed systems

Bad shard keys:
  created_at  -- all new writes go to the latest shard (hot shard)
  status      -- highly skewed: most rows are 'active'
  email       -- rarely used as a query filter
```

**3. Shard Routing**

```python
# Hash-based routing (application layer)
def get_shard(tenant_id: int, num_shards: int) -> int:
    return tenant_id % num_shards

# Lookup-table routing (more flexible, supports resharding)
# shard_map table: tenant_id -> shard_id
def get_shard(tenant_id: int) -> int:
    return db.query("SELECT shard_id FROM shard_map WHERE tenant_id = %s", tenant_id)
```

**4. Cross-Shard Queries**

Queries that do not include the shard key must fan out to all shards:

```sql
-- Shard-local (fast): shard key in WHERE
SELECT * FROM orders WHERE tenant_id = 42 AND status = 'pending';

-- Cross-shard (slow): no shard key, must query all shards
SELECT count(*) FROM orders WHERE status = 'pending';
-- The routing layer sends this to every shard and aggregates results
```

Minimize cross-shard queries by colocating related data on the same shard.

**5. Consistent Hashing**

Simple modulo hashing (`tenant_id % N`) requires rehashing all data when adding a shard. Consistent hashing maps keys to a ring, so adding a shard only moves keys from adjacent positions:

```
Hash ring: 0 -------- 1 -------- 2 -------- 3 -------- 0
           |  Shard A  |  Shard B  |  Shard C  |  Shard A |

Adding Shard D between B and C:
           |  Shard A  |  Shard B  | D | Shard C |  Shard A |
-- Only keys between B and D move; all other keys stay put
```

### Worked Example

Scenario: a B2B SaaS platform with 10,000 tenants needs to shard the orders table by `tenant_id`.

```sql
-- Step 1: Create shard mapping
CREATE TABLE shard_map (
  tenant_id INT PRIMARY KEY,
  shard_id INT NOT NULL
);

-- Assign tenants to 4 shards using consistent hashing
INSERT INTO shard_map (tenant_id, shard_id)
SELECT id, consistent_hash(id, 4) FROM tenants;

-- Step 2: On each shard, create the orders table
CREATE TABLE orders (
  id BIGSERIAL,
  tenant_id INT NOT NULL,
  total NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

-- Step 3: Application routing (pseudocode)
-- shard = lookup_shard(tenant_id)
-- connection = get_connection(shard)
-- connection.execute("INSERT INTO orders ...")

-- Step 4: Cross-shard aggregation (admin dashboard)
-- Fan out to all shards and merge:
results = []
for shard in all_shards:
    r = shard.query("SELECT count(*), sum(total) FROM orders WHERE created_at > '2024-01-01'")
    results.append(r)
total_count = sum(r.count for r in results)
total_revenue = sum(r.total for r in results)
```

Using Citus for transparent sharding in PostgreSQL:

```sql
-- Citus extension: distributed tables on PostgreSQL
CREATE EXTENSION citus;

-- Designate worker nodes
SELECT citus_add_node('worker1', 5432);
SELECT citus_add_node('worker2', 5432);

-- Distribute the orders table by tenant_id
SELECT create_distributed_table('orders', 'tenant_id');

-- Queries route automatically:
SELECT * FROM orders WHERE tenant_id = 42;
-- Citus routes to the correct worker node
```

### Anti-Patterns

1. **Sharding too early.** Sharding adds enormous complexity: cross-shard joins, distributed transactions, operational overhead. A single well-tuned PostgreSQL instance handles most workloads up to several TB. Exhaust vertical scaling and read replicas before sharding.

2. **Choosing a shard key with high cardinality skew.** If 80% of rows have `status = 'active'`, sharding by `status` puts 80% of data on one shard. Analyze value distribution before choosing a shard key.

3. **Allowing cross-shard joins in application queries.** Cross-shard joins require fetching data from multiple shards and joining in the application or routing layer. This is slow and error-prone. Colocate related tables on the same shard.

4. **Not planning for resharding.** If you start with 4 shards and outgrow them, adding a 5th shard with modulo hashing requires moving ~20% of all data. Use consistent hashing or a lookup table from the start.

5. **Sharding without addressing the cross-shard transaction problem.** Distributed transactions (two-phase commit) across shards are slow and complex. Design the data model so transactions stay within a single shard.

### PostgreSQL Specifics

- **Citus** (open-source extension): adds distributed table support to PostgreSQL. Handles shard routing, cross-shard queries, and colocation transparently. Best option for PostgreSQL-native sharding.
- **postgres_fdw**: query remote PostgreSQL servers from a coordinator node. Useful for simple cross-shard reads but does not support distributed writes or transactions.
- **Logical replication**: move data between shards using logical replication slots for resharding with minimal downtime.
- **pg_dump/pg_restore with --table**: extract a single shard's data for backup or migration.

## Details

### Advanced Topics

**Resharding Strategies:**

1. **Split shard:** Take shard A's data, filter by new hash range, move half to new shard B. Use logical replication to minimize downtime.
2. **Consistent hashing with virtual nodes:** Map each physical shard to multiple points on the hash ring. Adding a physical shard reassigns virtual nodes, moving less data.
3. **Lookup table migration:** Update the shard_map for tenants being moved, then migrate their data. Application reads the shard_map for every request, so routing updates automatically.

**Colocation:**

```sql
-- In Citus, colocate related tables so joins stay shard-local
SELECT create_distributed_table('orders', 'tenant_id');
SELECT create_distributed_table('order_items', 'tenant_id',
  colocate_with => 'orders');

-- This join is shard-local (fast):
SELECT o.id, oi.product_id FROM orders o
  JOIN order_items oi ON o.id = oi.order_id AND o.tenant_id = oi.tenant_id
  WHERE o.tenant_id = 42;
```

**Global Tables (Reference Tables):** Small, rarely-changing tables (countries, currencies, config) are replicated to every shard so joins do not require cross-shard communication.

### Engine Differences

MySQL sharding is typically done via **Vitess** (YouTube's sharding middleware) or application-level routing. Vitess provides a SQL-aware proxy that routes queries based on a `vindex` (virtual index). It supports resharding, cross-shard queries, and distributed transactions. Vitess is more mature for MySQL sharding than Citus is for PostgreSQL, having been in production at YouTube since 2011.

MySQL's native partitioning is single-instance only -- it does not distribute across servers. For multi-server sharding, an external solution like Vitess or ProxySQL is required.

### Real-World Case Studies

Notion sharded their PostgreSQL database to handle growth beyond a single instance. They sharded by `workspace_id` (their tenant key), ensuring all data for a workspace lives on the same shard. The migration from a single database to sharded architecture took 6 months. Key decisions: consistent hashing with virtual nodes for future resharding, Citus for transparent routing, and a lookup table for workspace-to-shard mapping. Cross-shard queries were eliminated by colocating all workspace-related tables. After sharding, write throughput increased 4x and they could add capacity by adding shards without downtime.

## Source

- [Citus Documentation](https://docs.citusdata.com/en/stable/)
- [Vitess Documentation](https://vitess.io/docs/)
- Kleppmann, M. "Designing Data-Intensive Applications" (2017), Chapter 6

## Process

1. Exhaust vertical scaling and read replicas before considering sharding.
2. Select a shard key based on dominant query patterns and even data distribution.
3. Implement shard routing (consistent hashing or lookup table) and colocate related tables.
4. Plan the resharding strategy before the first shard is created.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-table-partitioning, db-vertical-partitioning, db-cap-theorem, db-eventual-consistency

## Success Criteria

- Sharding is adopted only after vertical scaling and read replicas are insufficient.
- The shard key is present in all dominant query patterns, distributes data evenly, and is immutable.
- Related tables are colocated on the same shard to avoid cross-shard joins.
- A resharding strategy (consistent hashing or lookup table) is in place before the first shard is created.
