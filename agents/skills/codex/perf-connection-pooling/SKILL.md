# Connection Pooling

> Master database connection pooling — pool sizing formulas, connection lifecycle overhead, PgBouncer transaction-mode pooling, serverless connection management, pool monitoring and diagnostics, and configuration for PostgreSQL, MySQL, and managed database services.

## When to Use

- Database connections are exhausted under load ("too many connections" errors)
- Request latency includes 20-50ms for new connection establishment per query
- Serverless functions create excessive database connections on cold starts
- Connection pool is sized too large, consuming database memory and OS resources
- Idle connections accumulate and hit the database's max_connections limit
- A connection leak causes pool exhaustion over hours of uptime
- Multiple application instances share a database with limited connection capacity
- Database failover causes all pooled connections to become stale
- Horizontal scaling of application servers multiplies connection count beyond limits
- Query latency has high variance with spikes correlating to new connection creation

## Instructions

1. **Understand connection overhead.** Each PostgreSQL connection consumes ~5-10MB of RAM on the server and requires a TCP handshake plus TLS negotiation:

   ```
   Connection establishment cost:
   - TCP handshake:      ~0.5ms (same datacenter), ~30ms (cross-region)
   - TLS handshake:      ~2ms (same datacenter), ~60ms (cross-region)
   - PostgreSQL auth:    ~5ms (password), ~10ms (SCRAM-SHA-256)
   - Process creation:   ~2ms (PostgreSQL forks per connection)
   - Total:              ~10ms (local) to ~100ms (cross-region)

   Per-connection memory (PostgreSQL):
   - work_mem:           4MB default (per operation, can be higher)
   - Backend memory:     ~5-10MB base
   - OS resources:       file descriptors, kernel buffers
   ```

2. **Size the pool correctly.** The optimal pool size depends on workload type, not application concurrency:

   ```
   Formula (Brian Brazeal / PostgreSQL wiki):
   pool_size = (core_count * 2) + effective_spindle_count

   For SSD-backed servers:
   pool_size = core_count * 2 + 1

   Example: 4-core database server with SSD
   pool_size = (4 * 2) + 1 = 9 connections

   For I/O-bound workloads (many external API calls during transactions):
   pool_size = core_count * 4
   ```

   The counterintuitive rule: smaller pools perform better. A pool of 10 connections on a 4-core server outperforms a pool of 200 because fewer connections mean less context switching, less lock contention, and less memory pressure.

3. **Configure application-level pooling.** Set min, max, idle timeout, and connection lifetime:

   ```typescript
   // Node.js with pg (node-postgres)
   import { Pool } from 'pg';

   const pool = new Pool({
     host: process.env.DB_HOST,
     max: 10, // maximum connections in pool
     min: 2, // minimum idle connections
     idleTimeoutMillis: 30000, // close idle connections after 30s
     connectionTimeoutMillis: 5000, // fail if connection not acquired in 5s
     maxLifetimeMillis: 1800000, // recycle connections every 30 min
   });

   // Always return connections to the pool
   async function query(sql: string, params?: any[]) {
     const client = await pool.connect();
     try {
       return await client.query(sql, params);
     } finally {
       client.release(); // CRITICAL: always release back to pool
     }
   }
   ```

   ```typescript
   // Prisma connection pool configuration
   // In DATABASE_URL:
   // postgresql://user:pass@host:5432/db?connection_limit=10&pool_timeout=5

   // Or in schema.prisma for more control:
   const prisma = new PrismaClient({
     datasources: {
       db: {
         url: process.env.DATABASE_URL + '?connection_limit=10&pool_timeout=5',
       },
     },
   });
   ```

4. **Deploy PgBouncer for external pooling.** PgBouncer sits between the application and PostgreSQL, multiplexing many client connections onto fewer database connections:

   ```ini
   ; pgbouncer.ini
   [databases]
   myapp = host=pg-primary port=5432 dbname=myapp

   [pgbouncer]
   listen_addr = 0.0.0.0
   listen_port = 6432
   auth_type = scram-sha-256
   auth_file = /etc/pgbouncer/userlist.txt

   ; Pool mode: transaction (recommended), session, or statement
   pool_mode = transaction

   ; Pool sizing
   default_pool_size = 20        ; connections per user/database pair
   max_client_conn = 1000        ; total client connections accepted
   max_db_connections = 50       ; max connections to actual PostgreSQL
   reserve_pool_size = 5         ; extra connections for burst handling

   ; Timeouts
   server_idle_timeout = 60      ; close idle server connections after 60s
   client_idle_timeout = 300     ; close idle client connections after 5min
   query_timeout = 30            ; kill queries running longer than 30s
   ```

   ```
   Architecture:
   [App Server 1] ──┐                     ┌── [PostgreSQL]
   [App Server 2] ──┤── [PgBouncer] ──────┤   max_connections = 100
   [App Server 3] ──┘   1000 clients      └── 50 actual connections
                        → 50 DB conns
   ```

5. **Handle serverless connection challenges.** Serverless functions create new connections on every cold start. Use external pooling:

   ```typescript
   // Neon serverless driver — uses WebSocket, handles pooling externally
   import { neon } from '@neondatabase/serverless';
   const sql = neon(process.env.DATABASE_URL);

   // Supabase with connection pooling (uses PgBouncer internally)
   // Use port 6543 for pooled connections instead of 5432
   // postgresql://user:pass@host:6543/db?pgbouncer=true

   // Prisma with Accelerate (managed connection pooling)
   // DATABASE_URL="prisma://accelerate.prisma-data.net/?api_key=..."

   // AWS RDS Proxy — managed connection pooling for Lambda
   // Configure in AWS console, use proxy endpoint instead of RDS endpoint
   ```

6. **Monitor pool health.** Track pool metrics to diagnose issues before they cause outages:

   ```typescript
   // node-postgres pool events
   pool.on('connect', () => {
     metrics.increment('db.pool.connect');
   });
   pool.on('acquire', () => {
     metrics.increment('db.pool.acquire');
   });
   pool.on('remove', () => {
     metrics.increment('db.pool.remove');
   });
   pool.on('error', (err) => {
     metrics.increment('db.pool.error');
     console.error('Pool error:', err.message);
   });

   // Periodic health check
   setInterval(() => {
     metrics.gauge('db.pool.total', pool.totalCount);
     metrics.gauge('db.pool.idle', pool.idleCount);
     metrics.gauge('db.pool.waiting', pool.waitingCount);

     if (pool.waitingCount > 0) {
       console.warn(`${pool.waitingCount} queries waiting for connections`);
     }
   }, 5000);
   ```

7. **Handle connection failures gracefully.** Connections break due to network issues, database restarts, or failovers:

   ```typescript
   // Retry with exponential backoff for transient connection failures
   async function resilientQuery(sql: string, params?: any[], retries = 3) {
     for (let attempt = 0; attempt < retries; attempt++) {
       try {
         return await pool.query(sql, params);
       } catch (err: any) {
         const isTransient = [
           '57P01', // admin_shutdown
           '57P03', // cannot_connect_now
           '08006', // connection_failure
           '08001', // sqlclient_unable_to_establish_sqlconnection
         ].includes(err.code);

         if (!isTransient || attempt === retries - 1) throw err;
         await new Promise((r) => setTimeout(r, 100 * Math.pow(2, attempt)));
       }
     }
   }
   ```

## Details

### Transaction Mode vs Session Mode (PgBouncer)

In **transaction mode**, PgBouncer assigns a server connection for the duration of a transaction, then returns it to the pool. This achieves the highest multiplexing ratio (1000 clients on 20 connections). Limitation: session-level features (SET, LISTEN/NOTIFY, prepared statements, temporary tables) do not work across transactions. In **session mode**, a server connection is held for the entire client session. Lower multiplexing but full feature compatibility. Most applications should use transaction mode.

### Worked Example: Discord Serverless Migration

Discord migrated their message history API from dedicated servers to serverless functions, which caused connection storms — 10,000 concurrent Lambda invocations each opening a database connection. They deployed PgBouncer on a dedicated instance, configured with `pool_mode = transaction`, `default_pool_size = 25`, and `max_client_conn = 15000`. The PgBouncer instance multiplexes 15,000 Lambda connections onto 25 actual PostgreSQL connections. Result: PostgreSQL CPU dropped from 90% to 35%, and p99 latency decreased from 200ms to 45ms because the database was no longer thrashing with 10,000 concurrent connections.

### Worked Example: Vercel Edge Functions + Neon

Vercel's edge functions run in globally distributed isolates that cannot maintain persistent TCP connections. Neon's serverless driver uses HTTP/WebSocket transport instead of raw TCP, with connection pooling handled by Neon's proxy layer. Each edge function invocation sends a query over HTTP — no connection setup, no pool management. The proxy maintains a warm pool of PostgreSQL connections. Result: cold-start database queries complete in 5-10ms (HTTP overhead) versus 50-100ms (TCP connection establishment), and the PostgreSQL server sees a stable 50 connections regardless of edge function concurrency.

### Anti-Patterns

**Setting pool size equal to max_connections.** If pool_size matches max_connections, one application instance monopolizes all database connections, leaving zero for other services, migration scripts, or admin access. Always reserve 20-30% of max_connections for non-application use.

**Not releasing connections back to the pool.** A missing `client.release()` (or failed `finally` block) causes a connection leak. The pool gradually exhausts. Always release in a finally block or use pool.query() which handles acquisition and release automatically.

**Opening a new pool per request.** Creating a `new Pool()` in a request handler establishes a fresh pool for each request instead of reusing connections. Create the pool once at application startup and reuse it.

**Oversizing the pool.** A pool of 100 connections on a 4-core database causes context-switching overhead and lock contention that degrades throughput. Start with `(cores * 2) + 1` and increase only with load testing evidence.

## Source

- PostgreSQL wiki: Number Of Database Connections — https://wiki.postgresql.org/wiki/Number_Of_Database_Connections
- PgBouncer documentation — https://www.pgbouncer.org/config.html
- node-postgres: Pooling — https://node-postgres.com/features/pooling
- Neon serverless driver — https://neon.tech/docs/serverless/serverless-driver

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- Connection pool size follows the (cores \* 2) + 1 formula as a starting point.
- All database interactions use pooled connections with proper release handling.
- External pooling (PgBouncer or managed proxy) is deployed for multi-instance or serverless architectures.
- Pool metrics (total, idle, waiting) are monitored with alerts on exhaustion.
- No connection leaks exist (verified by monitoring idle count stability over time).
