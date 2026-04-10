# Graph Relationships in Relational Databases

> Modeling vertices and edges in SQL tables for social graphs, dependency networks, and recommendation systems with recursive queries -- and knowing when SQL stops being practical.

## When to Use

- Social connections (followers, friends, blocking relationships)
- Dependency graphs (package managers, build systems, task dependencies)
- Recommendation engines (user-item-user collaborative filtering)
- Fraud detection networks (transaction chains between accounts)
- Any many-to-many relationship with path traversal queries where the graph is secondary to the primary relational model

## Instructions

### Key Concepts

**Basic graph schema** -- vertices (nodes) and edges (relationships):

```sql
CREATE TABLE vertices (
  id         serial PRIMARY KEY,
  label      varchar NOT NULL,
  properties jsonb DEFAULT '{}'
);

CREATE TABLE edges (
  id         serial PRIMARY KEY,
  source_id  int NOT NULL REFERENCES vertices(id) ON DELETE CASCADE,
  target_id  int NOT NULL REFERENCES vertices(id) ON DELETE CASCADE,
  label      varchar NOT NULL,
  weight     float DEFAULT 1.0,
  properties jsonb DEFAULT '{}'
);

CREATE INDEX idx_edges_source ON edges (source_id);
CREATE INDEX idx_edges_target ON edges (target_id);
```

**Directed vs undirected:** For undirected graphs, either store both directions (A->B and B->A) or query with `WHERE source_id = ? OR target_id = ?`. Storing both directions doubles storage but simplifies and speeds up queries.

**Path queries via recursive CTE:**

```sql
-- All nodes reachable from vertex 1 within 3 hops
WITH RECURSIVE reachable AS (
  SELECT target_id AS id, 1 AS hops, ARRAY[source_id, target_id] AS path
  FROM edges WHERE source_id = 1

  UNION ALL

  SELECT e.target_id, r.hops + 1, r.path || e.target_id
  FROM edges e
  JOIN reachable r ON e.source_id = r.id
  WHERE r.hops < 3
    AND e.target_id != ALL(r.path)  -- cycle detection
)
SELECT DISTINCT id, hops FROM reachable;
```

The `path` array tracks visited nodes for cycle detection. The `hops < 3` clause bounds traversal depth.

**When SQL stops being practical:**

- Variable-length paths exceeding 5-6 hops
- Graph algorithms (PageRank, community detection, betweenness centrality)
- Real-time traversals on graphs with more than 10M edges
- Pattern matching across multiple edge types simultaneously

At these thresholds, consider a dedicated graph database (Neo4j, Amazon Neptune) or a graph extension (Apache AGE for PostgreSQL).

### Worked Example

Social network "people you may know" (friends-of-friends):

```sql
CREATE TABLE users (
  id   serial PRIMARY KEY,
  name varchar NOT NULL
);

CREATE TABLE friendships (
  user_id   int NOT NULL REFERENCES users(id),
  friend_id int NOT NULL REFERENCES users(id),
  PRIMARY KEY (user_id, friend_id)
);

CREATE INDEX idx_friendships_friend ON friendships (friend_id);
```

**Direct friends of user 1:**

```sql
SELECT u.* FROM users u
JOIN friendships f ON u.id = f.friend_id
WHERE f.user_id = 1;
```

**Friends-of-friends (2-hop) excluding direct friends:**

```sql
WITH direct_friends AS (
  SELECT friend_id FROM friendships WHERE user_id = 1
),
friends_of_friends AS (
  SELECT DISTINCT f2.friend_id
  FROM friendships f1
  JOIN friendships f2 ON f1.friend_id = f2.user_id
  WHERE f1.user_id = 1
    AND f2.friend_id != 1
    AND f2.friend_id NOT IN (SELECT friend_id FROM direct_friends)
)
SELECT u.*, count(*) AS mutual_friends
FROM friends_of_friends fof
JOIN friendships f ON fof.friend_id = f.friend_id
JOIN direct_friends df ON f.user_id = df.friend_id
JOIN users u ON u.id = fof.friend_id
GROUP BY u.id, u.name
ORDER BY mutual_friends DESC;
```

**The performance cliff:** On a graph with 1M edges, 2-hop traversal completes in ~50ms. 3-hop: ~2 seconds. 4-hop: timeout. Each additional hop multiplies the working set by the average node degree.

### Anti-Patterns

1. **Storing graph data in a single self-join table when traversal depth varies.** Use proper vertex/edge tables with indexes on both source and target.
2. **Unbounded recursive CTEs on user-generated graphs.** Without depth limits, a densely connected graph causes infinite loops or memory exhaustion. Always include a `hops < N` bound.
3. **Using SQL for graph algorithms.** PageRank, shortest-path-with-weights (Dijkstra), and community detection are impractical in SQL. Use a graph DB or application-layer library (NetworkX, igraph).
4. **Not indexing both `source_id` and `target_id` on the edges table.** Reverse traversals (who points to X?) are common and require the target index.
5. **Modeling everything as a graph.** If your queries are primarily key-value or tabular, adding graph structure adds complexity without benefit.

### PostgreSQL Specifics

**Apache AGE extension** adds the Cypher query language to PostgreSQL:

```sql
-- After installing AGE extension
SELECT * FROM cypher('social_graph', $$
  MATCH (a:User {name: 'Alice'})-[:FRIENDS_WITH*2..3]-(b:User)
  WHERE a <> b
  RETURN DISTINCT b.name
$$) AS (name agtype);
```

AGE allows graph queries without leaving PostgreSQL -- useful when the graph is a secondary concern alongside relational data.

**Recursive CTE with CYCLE clause** (PostgreSQL 14+):

```sql
WITH RECURSIVE paths AS (
  SELECT source_id, target_id, 1 AS depth FROM edges WHERE source_id = 1
  UNION ALL
  SELECT p.source_id, e.target_id, p.depth + 1
  FROM paths p JOIN edges e ON p.target_id = e.source_id
  WHERE p.depth < 5
)
CYCLE target_id SET is_cycle USING path
SELECT * FROM paths WHERE NOT is_cycle;
```

**JSONB properties** on vertices and edges enable flexible schema evolution. Add a GIN index for filtered graph queries: `CREATE INDEX ON vertices USING gin (properties);`.

## Details

### Advanced Topics

**Weighted shortest path (Dijkstra in SQL):** Technically possible with recursive CTEs tracking cumulative weight, but impractical for large graphs. Each step explores all outgoing edges, and pruning (stopping when a shorter path is already found) requires subquery tricks that the optimizer handles poorly. For weighted shortest path, export to an application-layer library.

**Bidirectional search:** Start from both source and target, meeting in the middle. Reduces traversal from O(b^d) to O(2 \* b^(d/2)) where b is branching factor and d is depth. Implementable in SQL with two recursive CTEs joined on intersection, but complex to write correctly.

**Materialized graph views:** Pre-compute common traversals (e.g., 2-hop friend connections) in a materialized table. Refresh periodically. Trades storage and freshness for query speed.

**Hybrid architecture:** Use PostgreSQL for transactional graph storage and integrity. Export to Neo4j or NetworkX for analytics (PageRank, community detection, path algorithms). This avoids a full migration to a graph database while enabling graph-native operations where SQL falls short.

### Engine Differences

MySQL 8.0+ supports recursive CTEs for graph traversal with compatible syntax.

Key MySQL differences:

- MySQL lacks the `CYCLE` clause -- cycle detection requires manual path tracking with a VARCHAR or JSON column
- MySQL lacks JSONB -- use `JSON` column type with generated columns for indexing vertex/edge properties
- No Apache AGE equivalent for MySQL
- MySQL's `cte_max_recursion_depth` (default 1000) limits traversal depth
- MySQL recursive CTE performance is comparable to PostgreSQL for shallow traversals (under 5 hops)

### Real-World Case Studies

**Fraud detection platform modeling transaction networks.** 5M accounts as vertices, 50M transactions as edges. The core query: "who transacted with someone who transacted with suspect X?" (2-hop). PostgreSQL with indexed edges: 120ms for 2-hop queries. 3-hop queries: 8 seconds -- unacceptable for real-time alerting. The team moved 3+ hop analysis to Neo4j while keeping transactional data and 1-2 hop queries in PostgreSQL. The hybrid approach saved 6 months of engineering time compared to a full migration to a graph database. PostgreSQL handles ACID transactions on account balances; Neo4j handles network pattern detection.

## Source

- [PostgreSQL WITH RECURSIVE](https://www.postgresql.org/docs/current/queries-with.html)
- [Apache AGE](https://age.apache.org/)

## Process

1. Read the key concepts to understand vertex/edge schema design and recursive CTE traversal patterns.
2. Apply bounded recursive queries with cycle detection for graph traversal in SQL.
3. Verify with EXPLAIN ANALYZE that traversal queries use indexes and complete within acceptable latency at each hop count.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-adjacency-list, db-closure-table, db-hierarchical-data, db-query-rewriting

## Success Criteria

- Graph queries are bounded by depth (max hops specified).
- Performance is validated with EXPLAIN ANALYZE at each hop count to detect performance cliffs.
- A dedicated graph DB is considered when traversal regularly exceeds 3-4 hops on large datasets.
- Both source and target columns on the edges table are indexed.
