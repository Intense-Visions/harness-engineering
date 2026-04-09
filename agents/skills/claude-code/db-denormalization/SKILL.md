# Denormalization

> Intentionally introducing controlled redundancy into a normalized schema to eliminate expensive joins or aggregations, applied only after measured proof of a performance problem.

## When to Use

- Optimizing read-heavy workloads where join latency is the bottleneck
- Building dashboard or reporting queries that aggregate across many tables
- Reducing query complexity for frequently accessed data paths
- Caching computed aggregates that are expensive to recalculate on every read
- Designing CQRS read models separate from the write-optimized normalized schema

## Instructions

The cardinal rule: **normalize first, denormalize only when you have measured proof of a performance problem.** Denormalization trades write complexity and consistency risk for read performance.

### Technique 1: Precomputed Columns

Store a derived value directly on the parent row instead of computing it on every read.

**Example -- order total stored on the orders table:**

```sql
ALTER TABLE orders ADD COLUMN total NUMERIC(10,2);

-- Trigger to keep it consistent
CREATE OR REPLACE FUNCTION update_order_total()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE orders
  SET total = (
    SELECT COALESCE(SUM(line_price * quantity), 0)
    FROM order_items
    WHERE order_id = COALESCE(NEW.order_id, OLD.order_id)
  )
  WHERE id = COALESCE(NEW.order_id, OLD.order_id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_order_total
AFTER INSERT OR UPDATE OR DELETE ON order_items
FOR EACH ROW EXECUTE FUNCTION update_order_total();
```

Now `SELECT id, total FROM orders WHERE customer_id = 42` avoids joining and summing order_items entirely.

### Technique 2: Materialized Views

Create a precomputed query result that refreshes on demand.

```sql
CREATE MATERIALIZED VIEW monthly_sales AS
SELECT
  date_trunc('month', o.order_date) AS month,
  p.category,
  COUNT(*) AS order_count,
  SUM(oi.line_price * oi.quantity) AS revenue
FROM orders o
JOIN order_items oi ON o.id = oi.order_id
JOIN products p ON oi.product_id = p.id
GROUP BY 1, 2;

CREATE UNIQUE INDEX idx_monthly_sales ON monthly_sales (month, category);

-- Refresh without blocking reads
REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_sales;
```

Use materialized views when: the underlying data changes infrequently relative to reads, exact real-time accuracy is not required, and the query is expensive (multiple joins, aggregations).

### Technique 3: Duplicated Columns for Join Avoidance

Copy a frequently-read column into a table that would otherwise require a join.

**Example -- customer name on orders:**

```sql
ALTER TABLE orders ADD COLUMN customer_name TEXT;

-- Application-level sync on order creation
INSERT INTO orders (customer_id, customer_name, order_date, total)
SELECT 42, c.name, CURRENT_DATE, 0
FROM customers c WHERE c.id = 42;
```

The consistency risk: if the customer changes their name, `orders.customer_name` becomes stale. Mitigation options:

1. **Trigger-based sync:** A trigger on `customers` updates all related `orders` rows. Expensive for high-volume updates.
2. **Accept staleness:** For historical records (invoices, receipts), the name at time of order is actually the correct business value.
3. **Application-level sync:** Update both tables in the same transaction.

### Technique 4: Summary Tables for Analytics

Pre-aggregate data on a schedule for dashboard queries.

```sql
CREATE TABLE daily_metrics (
  metric_date DATE PRIMARY KEY,
  new_users   INT NOT NULL DEFAULT 0,
  orders      INT NOT NULL DEFAULT 0,
  revenue     NUMERIC(12,2) NOT NULL DEFAULT 0
);

-- Scheduled job (pg_cron or application cron) refreshes daily
INSERT INTO daily_metrics (metric_date, new_users, orders, revenue)
SELECT
  CURRENT_DATE - 1,
  (SELECT COUNT(*) FROM users WHERE created_at::date = CURRENT_DATE - 1),
  (SELECT COUNT(*) FROM orders WHERE order_date = CURRENT_DATE - 1),
  (SELECT COALESCE(SUM(total), 0) FROM orders WHERE order_date = CURRENT_DATE - 1)
ON CONFLICT (metric_date) DO UPDATE SET
  new_users = EXCLUDED.new_users,
  orders = EXCLUDED.orders,
  revenue = EXCLUDED.revenue;
```

### Anti-Patterns

1. **Denormalizing without measurement.** "This join might be slow" is not evidence. Run `EXPLAIN ANALYZE`, measure actual query latency, and confirm the join is the bottleneck before duplicating data.
2. **Denormalizing when an index would suffice.** Often a missing index produces the same symptoms as a costly join. Add the index first, measure again, then consider denormalization.
3. **Treating denormalization as the default.** Starting with a denormalized schema makes future requirements unpredictable. Normalize first, denormalize the specific hot paths you identify.
4. **Forgetting the consistency tax.** Every denormalized copy is a consistency obligation. If you cannot implement a reliable sync mechanism (trigger, application logic, scheduled refresh), do not denormalize.

### Worked Example: E-Commerce Product Listing

A product listing page shows product name, average rating, and review count. The normalized query joins `products`, `reviews`, and computes `AVG(rating)` and `COUNT(*)` per product. At 10M reviews, this query takes 800ms.

Solution: Add `avg_rating NUMERIC(3,2)` and `review_count INT` columns to `products`. A trigger on `reviews` updates both columns. The listing query becomes a simple single-table scan at 3ms.

## Details

### Decision Framework

1. **Measure.** Run `EXPLAIN ANALYZE` on the slow query. Identify whether the bottleneck is a join, an aggregation, or a sequential scan.
2. **Index first.** If a missing index explains the cost, add it. Re-measure.
3. **Choose the lightest denormalization.** Prefer materialized views (no schema change, easy to drop) over duplicated columns (schema change, trigger required) over summary tables (separate refresh logic).
4. **Implement consistency.** For every denormalized copy, define when and how it refreshes. Document the staleness window.

### PostgreSQL Materialized View Refresh Strategies

- **Manual:** `REFRESH MATERIALIZED VIEW mv_name;` -- takes an exclusive lock, blocks reads during refresh.
- **Concurrent:** `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_name;` -- requires a unique index, does not block reads, but is slower.
- **Scheduled:** Use `pg_cron` to refresh on a cadence: `SELECT cron.schedule('0 * * * *', 'REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_sales');`
- **Application-triggered:** Refresh after a batch write completes. Best when writes are infrequent and bursty.

### MySQL Callout

MySQL does not support materialized views natively. The common workaround is a regular table populated by a scheduled event or application logic. MySQL also lacks `CONCURRENTLY` refresh semantics -- refreshing a surrogate materialized view requires either a full table swap (rename trick) or accepting a lock during the refresh window.

### Real-World Case Study: Social Media Feed

A social platform normalized posts, likes, comments, and shares into separate tables. The home feed query joined 5 tables with aggregations, taking 2+ seconds at scale. The team added a `feed_items` denormalized table: one row per post with precomputed `like_count`, `comment_count`, `share_count`, and `author_name`. Triggers on each source table kept the feed current. Feed query latency dropped to 15ms. The consistency tax: 4 triggers, one maintenance job for orphan cleanup, and a monthly audit query to detect drift.

## Source

- [PostgreSQL Materialized Views](https://www.postgresql.org/docs/current/rules-materializedviews.html)
- Kleppmann, M. "Designing Data-Intensive Applications" (2017), Chapter 3
- PostgreSQL Wiki: Materialized View Refresh Strategies

## Process

1. Read the techniques and decision framework in this document.
2. Measure the actual query performance to confirm a denormalization need exists.
3. Apply the lightest denormalization technique that solves the measured problem, and implement the consistency mechanism.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-first-normal-form, db-second-normal-form, db-third-normal-form

## Success Criteria

- Denormalization is applied only to measured performance bottlenecks, not as a default design pattern.
- Every denormalized copy has a documented consistency mechanism (trigger, application sync, or scheduled refresh).
