# CAP Theorem

> In a distributed system, when a network partition occurs, you must choose between consistency (every read returns the most recent write) and availability (every non-failing node returns a response) -- you cannot have both simultaneously.

## When to Use

- Choosing between distributed database architectures
- Evaluating consistency vs. availability tradeoffs for a specific feature
- Designing systems that span multiple datacenters or availability zones
- Understanding why your read replica returns stale data during network issues
- Deciding between synchronous and asynchronous replication

## Instructions

### The Three Properties

**Consistency (C):** Linearizability -- every read receives the most recent write or an error. All nodes see the same data at the same time. This is NOT the same as ACID consistency (constraint satisfaction). CAP consistency is about distributed agreement on the current value.

**Availability (A):** Every request to a non-failing node receives a response (not an error), though it may not contain the most recent write. The system continues to operate even if some nodes cannot communicate.

**Partition Tolerance (P):** The system continues to operate despite arbitrary message loss or delay between nodes. Network partitions are not a choice -- they happen in every distributed system. Cables get cut, switches fail, cloud AZs lose connectivity.

### The Theorem in Practice

Since partitions are inevitable in distributed systems, the real choice is between C and A during a partition. During normal operation (no partition), you can have all three.

**Concrete scenario:**

Two PostgreSQL nodes (Primary in US-East, Replica in EU-West). The network link between them fails.

- **CP choice (synchronous replication):** Primary refuses writes because it cannot confirm the replica received them. Reads on the replica are blocked or return errors. System is consistent but unavailable in the partitioned region.
- **AP choice (asynchronous replication):** Primary continues accepting writes. Replica serves reads from its last-known state (stale). System is available but reads may return outdated data.

### CP Systems in Practice

**PostgreSQL with synchronous replication:**

```sql
-- postgresql.conf on primary
synchronous_standby_names = 'replica1'
```

With this configuration, `COMMIT` does not return until the replica confirms it received the WAL. If the replica is unreachable, writes block -- the system trades availability for consistency.

Other CP systems: etcd, ZooKeeper, Consul, Google Spanner (uses TrueTime to achieve CP with high availability through consensus).

### AP Systems in Practice

**PostgreSQL with asynchronous replication:**

The default replication mode. The primary writes to WAL, sends it to replicas asynchronously, and returns `COMMIT` immediately. During a partition, the primary keeps writing and replicas serve increasingly stale data.

Other AP systems: Cassandra (tunable per query), DynamoDB (default mode), CouchDB, DNS.

### Worked Example: Per-Operation Consistency Tuning

Most production systems do not pick one side globally. Instead, they tune consistency per operation:

```
Operation                  Consistency     Why
─────────────────────────  ──────────────  ──────────────────────────
Read account balance       Strong (CP)     Financial accuracy required
Read product catalog       Eventual (AP)   Stale price for 2 seconds is acceptable
Read user profile          Eventual (AP)   Name/avatar lag is invisible
Write payment              Strong (CP)     Double-charge prevention
Write analytics event      Eventual (AP)   Losing one event is tolerable
```

DynamoDB makes this explicit: `ConsistentRead: true` routes to the leader (strong), `ConsistentRead: false` routes to any replica (eventual).

### Worked Example: Multi-Region PostgreSQL

A SaaS application deploys PostgreSQL in US-East (primary) and EU-West (replica).

- **Read traffic:** EU users read from the EU replica. They see data that is typically 50-200ms behind the primary. For most pages, this is invisible.
- **Write traffic:** All writes go to the US-East primary. EU write latency is ~150ms round-trip.
- **During partition:** EU users can still read (stale data). EU writes fail until the partition heals.

This is an AP configuration for reads and a CP configuration for writes -- a common hybrid approach.

### Anti-Patterns

1. **Using CAP to justify eventual consistency when strong consistency is achievable.** If your system runs on a single PostgreSQL node, CAP does not apply. CAP is about distributed systems with network partitions between nodes.

2. **Treating single-node PostgreSQL as a "CAP choice."** A single-node database is not a distributed system. It provides strong consistency by default. CAP becomes relevant only when you add replication or distribute data.

3. **Claiming a system is "CA" (consistent and available, not partition-tolerant).** This is impossible in a network. Every real distributed system experiences partitions. A "CA" system is just one that has not been tested under partition conditions.

4. **Using CAP as the sole criterion for database selection.** CAP tells you about behavior during partitions. It says nothing about performance, query language, operational complexity, cost, or ecosystem maturity.

## Details

### Common Misunderstandings

**"Pick 2 of 3" is misleading.** You always need P (partitions happen whether you want them or not). The real choice is C vs. A during partitions. During normal operation, all three are achievable.

**CAP says nothing about latency.** A system can be "consistent" under CAP but take 10 seconds to respond. CAP guarantees are about correctness, not performance.

**CAP applies only during partitions.** During normal operation, most systems provide both consistency and availability. The tradeoff is triggered only when nodes cannot communicate.

### The PACELC Extension

PACELC extends CAP to address behavior during normal operation:

- **P**artition: choose **A** or **C**
- **E**lse (no partition): choose **L**atency or **C**onsistency

Examples:

- PostgreSQL synchronous replication: PC/EC (consistent always, higher latency)
- PostgreSQL asynchronous replication: PA/EL (available during partition, low latency normally)
- DynamoDB: PA/EL by default, PC/EC when `ConsistentRead: true`
- Cassandra: PA/EL or PC/EC depending on consistency level per query

PACELC is more useful for engineering decisions because it covers the common case (no partition) where the latency/consistency tradeoff matters most.

### Kleppmann's Critique

Martin Kleppmann's 2015 article "Please stop calling databases CP or AP" argues that CAP is too imprecise for real engineering decisions:

- CAP's definition of "consistency" (linearizability) is just one of many consistency models
- CAP's definition of "availability" (every non-failing node responds) is stricter than practical availability
- Real systems offer a spectrum of consistency guarantees, not a binary choice
- Better to describe a system's specific guarantees than to label it "CP" or "AP"

This is correct. Use CAP as a mental model for understanding the fundamental tradeoff, but describe your system's actual guarantees in concrete terms.

### Real-World Case Study: Global Chat Application

A messaging platform deployed Cassandra across 5 regions for chat history. Default consistency level was `ONE` (AP -- lowest latency, eventual consistency). Problem: users occasionally saw messages out of order or missed recent messages when reading from a different region than they wrote to.

Solution: Changed write consistency to `LOCAL_QUORUM` (majority of nodes in the local datacenter must confirm) and read consistency to `LOCAL_QUORUM`. This provided strong consistency within each region while maintaining availability across regions. Cross-region reads were still eventually consistent, but users rarely read chat history from a different region than they posted from.

## Source

- Brewer, E. "Towards Robust Distributed Systems" (PODC 2000 Keynote)
- Gilbert, S. & Lynch, N. "Brewer's Conjecture and the Feasibility of Consistent, Available, Partition-Tolerant Web Services" (2002)
- Kleppmann, M. "Please stop calling databases CP or AP" (2015)
- Brewer, E. "CAP Twelve Years Later" (2012), [arxiv.org/abs/1509.05393](https://arxiv.org/abs/1509.05393)

## Process

1. Read the CAP property definitions and the common misunderstandings in this document.
2. For each data operation in your system, determine whether strong consistency or availability is the priority during network partitions.
3. Configure replication and consistency settings per operation based on business requirements, not as a blanket system-wide choice.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** db-eventual-consistency, db-acid-properties

## Success Criteria

- Consistency vs. availability tradeoffs are evaluated per operation, not per system.
- CAP is used as a mental model for distributed systems, not misapplied to single-node databases.
