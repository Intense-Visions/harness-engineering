# Connection Pooling

> External connection poolers like PgBouncer sit between the application and database, multiplexing many application connections onto fewer database connections to prevent connection exhaustion.

## When to Use

- Application has more processes/threads than the database can handle with direct connections
- Seeing `FATAL: too many connections` errors in PostgreSQL logs
- Running a microservices architecture where each service opens its own connection pool
- Deploying to serverless environments where connection reuse is difficult
- Tuning PgBouncer or a similar pooler for a production workload

## Instructions

### Key Concepts

**1. Why Pool Externally**

PostgreSQL forks a backend process for each connection. Each process consumes 5-10 MB of memory. At 500 connections, that is 2.5-5 GB of memory just for connection overhead, plus contention on shared resources like `ProcArrayLock`. An external pooler holds a small number of database connections (20-100) and multiplexes thousands of application connections onto them.

**2. PgBouncer Pool Modes**

```ini
; pgbouncer.ini

[databases]
mydb = host=127.0.0.1 port=5432 dbname=mydb

[pgbouncer]
listen_port = 6432
pool_mode = transaction   ; session | transaction | statement
max_client_conn = 1000    ; max application connections to PgBouncer
default_pool_size = 25    ; database connections per user/database pair
reserve_pool_size = 5     ; extra connections for burst traffic
reserve_pool_timeout = 3  ; seconds before reserve pool activates
```

**Session mode:** A database connection is assigned when the client connects and released when the client disconnects. Safest but least efficient -- almost no multiplexing benefit.

**Transaction mode:** A database connection is assigned at `BEGIN` and released at `COMMIT`/`ROLLBACK`. Best balance of safety and efficiency. Most production deployments use this mode.

**Statement mode:** A database connection is assigned per statement. Only works for simple, autocommit queries. Breaks multi-statement transactions.

**3. Transaction Mode Limitations**

In transaction mode, session-level state is lost between transactions:

```sql
-- These features BREAK in transaction mode:
SET search_path = 'tenant_1';  -- lost after transaction ends
PREPARE my_stmt AS SELECT ...;  -- lost after transaction ends
LISTEN channel_name;            -- lost after transaction ends
CREATE TEMP TABLE tmp (...);    -- lost after transaction ends

-- These features WORK in transaction mode:
BEGIN; ... COMMIT;              -- transactions work normally
SET LOCAL search_path = '...';  -- scoped to transaction, OK
```

**4. Pool Sizing Formula**

```
default_pool_size = max_database_connections / number_of_pooler_instances

Example:
  PostgreSQL max_connections = 100
  Reserved for superuser/monitoring = 10
  Available for application = 90
  PgBouncer instances = 2

  default_pool_size = 90 / 2 = 45 per instance
```

The `max_client_conn` can be much larger because PgBouncer queues requests when all database connections are busy.

### Worked Example

A SaaS platform runs 12 microservices, each maintaining a connection pool of 20 connections. That is 240 direct connections, but the PostgreSQL instance only supports 100.

```ini
; pgbouncer.ini
[databases]
saasdb = host=db.internal port=5432 dbname=saasdb

[pgbouncer]
listen_port = 6432
pool_mode = transaction
max_client_conn = 500
default_pool_size = 40
reserve_pool_size = 10
reserve_pool_timeout = 3
server_idle_timeout = 300
server_lifetime = 3600
log_connections = 0
log_disconnections = 0
```

Each microservice connects to PgBouncer on port 6432 instead of PostgreSQL on port 5432. PgBouncer maintains 40 real database connections and queues excess requests. The 12 services can open up to 500 connections to PgBouncer combined, but only 40-50 database connections are active at any time.

Monitor with the PgBouncer admin console:

```sql
-- Connect to PgBouncer admin
psql -p 6432 -U pgbouncer pgbouncer

-- Check pool status
SHOW POOLS;
-- cl_active: application connections actively using a database connection
-- cl_waiting: application connections waiting for a database connection
-- sv_active: database connections processing a query
-- sv_idle: database connections idle and available

-- Check connection counts
SHOW STATS;
```

### Anti-Patterns

1. **Setting `default_pool_size` equal to `max_connections`.** This defeats the purpose of pooling. The pool size should be a fraction of max_connections, leaving room for superuser connections, monitoring, and burst capacity.

2. **Using session mode with short-lived connections.** Session mode holds a database connection for the entire client session. If clients connect, run one query, and disconnect, session mode provides zero multiplexing benefit and adds latency from PgBouncer's overhead.

3. **Using `PREPARE` statements in transaction mode.** Prepared statements are session-level state. In transaction mode, the next transaction may get a different backend connection where the prepared statement does not exist, causing `ERROR: prepared statement does not exist`.

4. **Running PgBouncer and the application on the same host without connection limits.** If the application opens more connections than PgBouncer can queue, both PgBouncer and the application compete for the same CPU and memory. Run PgBouncer on a dedicated host or set strict `max_client_conn` limits.

5. **Not monitoring `cl_waiting`.** If `cl_waiting` is consistently above zero, application connections are waiting for database connections. Either increase `default_pool_size` (if the database can handle it) or optimize query performance to release connections faster.

### PostgreSQL Specifics

- PostgreSQL 14+ built-in connection pooling is limited to `connection_pool_size` for parallel query workers; it does not pool client connections. External pooling is still required.
- `pgbouncer_fdw` provides PgBouncer stats as PostgreSQL foreign tables for integration with monitoring dashboards.
- Supabase Vibes uses PgBouncer in transaction mode by default for serverless deployments.
- AWS RDS Proxy and Google Cloud SQL Auth Proxy provide managed pooling with IAM authentication.

## Details

### Advanced Topics

**Application-Level vs External Pooling:** Most application frameworks include a built-in connection pool (e.g., HikariCP for Java, database/sql for Go). These manage connections within a single process. External poolers like PgBouncer manage connections across all processes. Use both: the application pool manages per-process concurrency, and PgBouncer manages database-level concurrency.

**Multi-Database Pooling:**

```ini
[databases]
db1 = host=primary.db port=5432 dbname=db1
db2 = host=primary.db port=5432 dbname=db2
db1_ro = host=replica.db port=5432 dbname=db1
```

Route read queries to replicas by connecting to `db1_ro` instead of `db1`.

**PgBouncer Authentication:**

```ini
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt
; Or delegate to PostgreSQL:
auth_type = hba
auth_hba_file = /etc/pgbouncer/pg_hba.conf
```

### Engine Differences

MySQL's connection model differs fundamentally: MySQL uses one thread per connection rather than one process per connection. Threads are lighter-weight (typically 256KB-1MB stack per thread vs 5-10MB per PostgreSQL process). MySQL handles more concurrent connections natively, but thread contention becomes a bottleneck beyond a few thousand connections.

ProxySQL serves a similar role to PgBouncer for MySQL. It supports query routing, connection multiplexing, and read-write splitting. ProxySQL uses a regex-based query routing system that is more feature-rich than PgBouncer but more complex to configure.

### Real-World Case Studies

A ride-sharing platform ran 200 microservices, each with a pool of 10 connections, totaling 2,000 direct database connections. PostgreSQL was spending more time managing connections than processing queries. Deploying PgBouncer in transaction mode with `default_pool_size = 80` and `max_client_conn = 5000` reduced actual database connections from 2,000 to 80. Query latency at p99 dropped from 450ms to 120ms because PostgreSQL's shared buffer management was no longer thrashing. The `cl_waiting` metric showed occasional queuing during peak hours, resolved by increasing `default_pool_size` to 100.

## Source

- [PgBouncer Documentation](https://www.pgbouncer.org/)
- [PostgreSQL Connection Handling](https://www.postgresql.org/docs/current/runtime-config-connection.html)

## Process

1. Deploy PgBouncer between the application and PostgreSQL; start with `pool_mode = transaction`.
2. Set `default_pool_size` to `(max_connections - reserved) / pooler_instances`.
3. Update application connection strings to point to PgBouncer's port.
4. Monitor `SHOW POOLS` for `cl_waiting` and `sv_idle` to tune pool sizing.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-connection-sizing, db-acid-in-practice, db-isolation-levels
