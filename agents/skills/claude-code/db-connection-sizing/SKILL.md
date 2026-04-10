# Connection Sizing

> Tuning max_connections, understanding per-connection memory overhead, and right-sizing database connections for on-premise and serverless environments.

## When to Use

- Setting `max_connections` for a new PostgreSQL deployment
- Debugging `FATAL: too many connections` errors
- Estimating memory requirements for a database server
- Deploying to serverless platforms with connection limits (Neon, Supabase, PlanetScale)
- Deciding whether to add replicas or increase connection limits

## Instructions

### Key Concepts

**1. Per-Connection Memory Cost**

Each PostgreSQL connection is a separate OS process. Memory per connection:

```
Base process overhead:     ~5-10 MB
work_mem (per sort/hash):  4 MB default (can be higher)
temp_buffers:              8 MB default
maintenance_work_mem:      64 MB (only during VACUUM, CREATE INDEX)

Worst case per connection: 10 MB base + work_mem * active_operations
```

A server with 16 GB RAM cannot safely support 1,000 connections. At 10 MB per connection, that is 10 GB just for connection overhead, leaving little for `shared_buffers` and OS cache.

**2. The max_connections Formula**

```
max_connections = (available_ram - shared_buffers - os_reserve)
                  / per_connection_memory

Example:
  Total RAM:           32 GB
  shared_buffers:       8 GB (25% of RAM)
  OS and file cache:    8 GB
  Available:           16 GB
  Per connection:      10 MB (conservative)

  max_connections = 16 GB / 10 MB = 1,600

  Practical max: ~400 (to leave headroom for work_mem spikes)
```

Conservative rule of thumb: set `max_connections` to 2-4x the number of CPU cores for OLTP workloads. A 16-core server should start with 50-100 connections.

**3. work_mem Impact**

`work_mem` is allocated per sort or hash operation, not per connection. A single complex query can allocate `work_mem` multiple times:

```sql
-- This query might allocate work_mem 3 times:
-- once for the sort, once for the hash join, once for the subquery
SELECT * FROM orders o
  JOIN customers c ON o.customer_id = c.id
  WHERE o.total > (SELECT avg(total) FROM orders)
  ORDER BY o.created_at;

-- If work_mem = 256MB and 50 connections run this simultaneously:
-- Memory spike: 50 * 256MB * 3 = 37.5 GB (likely OOM)
```

Set `work_mem` conservatively at the server level and increase it per-session for analytical queries:

```sql
-- Server-level: conservative
ALTER SYSTEM SET work_mem = '16MB';

-- Per-session for analytics:
SET work_mem = '256MB';
SELECT ... complex analytical query ...;
RESET work_mem;
```

**4. Reserved Connections**

Always reserve connections for administrative access:

```sql
-- postgresql.conf
max_connections = 100
superuser_reserved_connections = 3  -- default

-- PostgreSQL 16+ adds:
reserved_connections = 5  -- for pg_use_reserved_connections role
```

When all 100 connections are used, the 3 reserved superuser connections let DBAs connect to diagnose and fix the issue.

### Worked Example

Sizing connections for a web application on a 16-core, 64 GB server:

```
Step 1: Allocate shared_buffers
  shared_buffers = 16 GB (25% of 64 GB)

Step 2: Reserve OS memory
  OS and file cache = 16 GB

Step 3: Calculate available memory for connections
  Available = 64 - 16 - 16 = 32 GB

Step 4: Estimate per-connection memory
  Base: 10 MB
  work_mem: 16 MB (default, low)
  Conservative per-connection: 26 MB

Step 5: Calculate max_connections
  max_connections = 32 GB / 26 MB = ~1,230
  Practical limit (with headroom): 400

Step 6: Configure
  max_connections = 400
  superuser_reserved_connections = 5
  Application pool: 395 available
  Per-service pool: 395 / 8 services = ~49 per service

Step 7: Add PgBouncer for multiplexing
  PgBouncer default_pool_size = 100
  PgBouncer max_client_conn = 2000
  Each service can open up to 250 connections to PgBouncer
```

Verify under load:

```sql
-- Current connection count
SELECT count(*) FROM pg_stat_activity;

-- Memory per backend (approximate)
SELECT pg_size_pretty(sum(allocated_bytes))
FROM pg_backend_memory_contexts
WHERE pid = pg_backend_pid();
```

### Anti-Patterns

1. **Setting `max_connections = 1000` on a small instance.** Even if connections are mostly idle, each consumes base memory and contends for lightweight locks. More connections does not mean more throughput. Beyond a threshold, throughput decreases due to contention.

2. **Setting `work_mem` high globally.** `work_mem = 1GB` globally with 100 connections can cause 100+ GB of memory allocation during peak sort operations. Set it low globally and increase per-session when needed.

3. **Not accounting for connection pools in each service.** If 10 services each maintain a pool of 50 connections, the database needs 500 connections minimum. Map out all connection sources before setting `max_connections`.

4. **Ignoring monitoring connections.** Prometheus exporters, pgAgent, logical replication slots, and backup tools all consume connections. Reserve 10-20 connections beyond what application services need.

5. **Using the same sizing for OLTP and OLAP.** OLTP queries are short and need many connections with low `work_mem`. OLAP queries are long and need few connections with high `work_mem`. Size each workload separately or use separate connection pools.

### PostgreSQL Specifics

- `pg_stat_activity` shows all active connections, their state, and current query.
- `pg_backend_memory_contexts` (PostgreSQL 14+) shows per-backend memory allocation breakdown.
- `idle_in_transaction_session_timeout` kills connections that sit in an open transaction without activity.
- `statement_timeout` prevents runaway queries from holding connections indefinitely.
- `tcp_keepalives_idle`, `tcp_keepalives_interval`, `tcp_keepalives_count` detect and close dead connections.

## Details

### Advanced Topics

**Serverless Connection Constraints:**

Serverless PostgreSQL providers impose strict connection limits:

| Provider    | Free Tier   | Pro Tier | Pooler Mode         |
| ----------- | ----------- | -------- | ------------------- |
| Neon        | 100         | 500      | Built-in, tx mode   |
| Supabase    | 60          | 200      | PgBouncer, tx mode  |
| PlanetScale | N/A (MySQL) | 10K      | ProxySQL            |
| AWS RDS     | Instance    | Instance | RDS Proxy available |

For serverless, always use a connection pooler. Direct connections from serverless functions (Lambda, Vercel Functions) create and destroy connections rapidly, exhausting the pool.

**Connection Lifecycle Tuning:**

```ini
# postgresql.conf
tcp_keepalives_idle = 60      # detect dead connections after 60s
tcp_keepalives_interval = 10  # probe every 10s after idle timeout
tcp_keepalives_count = 3      # close after 3 failed probes

idle_in_transaction_session_timeout = '30s'  # kill idle-in-tx
statement_timeout = '30s'                     # kill long queries
```

**Connection Pooling Interaction:**

```
Application Pool (per service) → PgBouncer → PostgreSQL
      50 connections          →  100 slots → max_connections = 120

Application sees: 50 connections (fast, local)
PgBouncer sees: 100 database connections to manage
PostgreSQL sees: 100 backends (+ 20 reserved)
```

### Engine Differences

MySQL uses threads, not processes. Per-thread memory is significantly lower (~256KB-1MB stack plus per-thread buffers). MySQL can handle 5,000+ connections on the same hardware where PostgreSQL struggles at 500. However, MySQL's thread scheduler contention becomes the bottleneck at high connection counts. `thread_pool` plugin (Enterprise or MariaDB) helps by grouping threads.

MySQL's `max_connections` default is 151. The equivalent memory calculation uses `sort_buffer_size`, `join_buffer_size`, and `read_buffer_size` per connection instead of `work_mem`.

### Real-World Case Studies

An e-commerce platform set `max_connections = 2000` and `work_mem = 512MB` on a 64 GB server. During a flash sale, 800 concurrent connections each ran queries with hash joins, allocating multiple `work_mem` segments. The OOM killer terminated PostgreSQL at 800 connections. The fix: reduce `max_connections` to 200, set `work_mem = 32MB` globally, add PgBouncer with `default_pool_size = 80` and `max_client_conn = 3000`. The same flash sale load ran smoothly on 80 database connections with PgBouncer queuing excess requests. Peak memory usage dropped from 64 GB (OOM) to 28 GB.

## Source

- [PostgreSQL Connection Settings](https://www.postgresql.org/docs/current/runtime-config-connection.html)
- [PostgreSQL Memory Configuration](https://www.postgresql.org/docs/current/runtime-config-resource.html)
- Celko, J. "SQL for Smarties" (2010)

## Process

1. Calculate per-connection memory cost (base + work_mem + temp_buffers).
2. Set `max_connections` based on available RAM after shared_buffers and OS reservation.
3. Reserve connections for superuser and monitoring tools.
4. Deploy a connection pooler (PgBouncer) to multiplex application connections beyond the database limit.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-connection-pooling, db-acid-in-practice
