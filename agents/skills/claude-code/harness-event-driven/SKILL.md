# Harness Event-Driven

> Architectural guide for message queues, event sourcing, CQRS, and saga patterns. Maps event flows, designs topic topologies, validates delivery guarantees, and produces event catalog documentation.

## When to Use

- When designing an event-driven architecture for a new service or feature
- When adding Kafka, RabbitMQ, SQS, NATS, or Redis Streams to a project
- When implementing event sourcing with an event store and projections
- When designing CQRS (Command Query Responsibility Segregation) boundaries
- When implementing saga patterns for distributed transactions
- When auditing an existing event-driven system for reliability gaps
- When adding webhooks or async notification flows
- NOT for synchronous API design (use harness-api-design for REST/GraphQL/gRPC)
- NOT for caching with Redis pub/sub (use harness-caching for cache invalidation patterns)
- NOT for database change data capture setup (use harness-database for schema triggers and CDC configuration)
- NOT for monitoring event throughput or latency (use harness-observability for metrics and alerting)

## Process

### Phase 1: DISCOVER -- Map Event Flows and Async Boundaries

1. **Detect the message broker.** Scan for stack signals: `docker-compose.*kafka*` or `kafkajs` imports for Kafka, `docker-compose.*rabbit*` or `amqplib` imports for RabbitMQ, `@aws-sdk/client-sqs` for SQS, `nats` package for NATS, `ioredis` with `xadd`/`xread` for Redis Streams. If the `--broker` argument is provided, use that instead of auto-detection.

2. **Map existing event producers.** Scan `src/**/events/**`, `src/**/queues/**`, and files containing `.publish(`, `.send(`, `.emit(`, `xadd(`, or `producer.send(`. For each producer, record: the event name or topic, the payload shape, and the source module.

3. **Map existing event consumers.** Scan `src/**/handlers/**`, `src/**/subscribers/**`, and files containing `.subscribe(`, `.on(`, `.consume(`, `xread(`, or `consumer.run(`. For each consumer, record: the event name or topic, the handler function, the processing guarantee (at-most-once, at-least-once, exactly-once), and error handling behavior.

4. **Identify async boundaries.** Map where the system transitions from synchronous to asynchronous processing. Common boundaries: HTTP request triggers event publish, database write triggers CDC event, cron job publishes batch events. Record the boundary, the triggering action, and the downstream consumer.

5. **Detect existing patterns.** Classify the architecture: simple pub/sub, event sourcing (event store with projections), CQRS (separate read/write models), saga (multi-step orchestration or choreography), or a mix. Record which patterns are in use and where.

### Phase 2: DESIGN -- Produce Event Schemas and Topic Topology

1. **Define event schemas.** For each new event, produce a schema with: event name (past-tense verb, e.g., `OrderPlaced`), event version, timestamp, correlation ID, causation ID, payload fields with types, and metadata. Use a consistent envelope:

   ```typescript
   interface DomainEvent<T> {
     eventId: string;
     eventType: string;
     version: number;
     timestamp: string; // ISO 8601
     correlationId: string;
     causationId: string;
     aggregateId: string;
     payload: T;
   }
   ```

2. **Design topic topology.** For Kafka: define topics, partition keys (usually aggregate ID for ordering), and consumer groups. For RabbitMQ: define exchanges (topic or fanout), queues, and routing keys. For SQS: define standard vs FIFO queues and dead-letter queues. For NATS: define subjects and queue groups.

3. **Specify delivery guarantees.** For each event flow, declare the required guarantee: at-most-once (fire and forget), at-least-once (acknowledge after processing), or exactly-once (transactional outbox). WHERE at-least-once is specified, THEN the consumer must be idempotent. Document the idempotency strategy (deduplication table, natural idempotency, or idempotency key).

4. **Design error handling.** For each consumer, specify: retry policy (count, backoff strategy), dead-letter queue configuration, poison message handling, and alerting threshold. WHERE a consumer fails after all retries, THEN the message must go to a dead-letter queue -- never silently dropped.

5. **Design saga flows (if applicable).** WHERE the feature requires a distributed transaction, THEN design the saga: list the steps, the compensating actions for each step, the timeout for each step, and the failure modes. Choose orchestration (central coordinator) or choreography (event chain) and justify the choice.

6. **Define ordering requirements.** For each topic or queue, specify whether message ordering matters. WHERE ordering is required, THEN define the partition key that guarantees order. WHERE ordering is not required, THEN document that consumers must handle out-of-order delivery.

### Phase 3: VALIDATE -- Check Delivery Guarantees and Failure Handling

1. **Verify idempotency.** For every at-least-once consumer, trace the handler logic. WHERE the handler performs a side effect (database write, external API call, email send), THEN verify that reprocessing the same event does not cause duplicate effects. Flag consumers that lack an idempotency guard.

2. **Check for lost events.** Trace the publish path for each event. WHERE the event is published after a database write but outside the same transaction, THEN flag the dual-write problem. Recommend the transactional outbox pattern or CDC. WHERE the event is published before the database write, THEN flag the inconsistency risk.

3. **Validate error handling completeness.** For every consumer: verify a dead-letter queue is configured, verify the retry policy has a maximum count (no infinite retries), verify poison messages (permanently unprocessable) are detected and routed separately, verify failed messages are logged with enough context to diagnose and replay.

4. **Check for thundering herd.** WHERE a single event triggers multiple consumers that all query the same database, THEN flag the thundering herd risk. Recommend staggered processing, consumer-side caching, or materialized views.

5. **Validate schema compatibility.** WHERE event schemas have evolved (version > 1), THEN verify backward compatibility. Consumers on version N must handle events from version N+1 (forward compatibility) or version N-1 (backward compatibility). Flag breaking schema changes.

### Phase 4: DOCUMENT -- Generate Event Catalog and Flow Diagrams

1. **Produce event catalog.** For every event in the system, create an entry with: event name, version, producer (service and module), consumers (service and module), payload schema, delivery guarantee, and topic/queue name. Format as a structured document or table.

2. **Generate flow diagrams.** For each major event flow, describe the sequence: triggering action, event published, consumers invoked, downstream effects. Use a textual sequence diagram format:

   ```
   User -> OrderService: POST /orders
   OrderService -> Kafka[order-events]: OrderPlaced (v1)
   Kafka[order-events] -> PaymentService: process payment
   Kafka[order-events] -> InventoryService: reserve stock
   PaymentService -> Kafka[payment-events]: PaymentCompleted
   InventoryService -> Kafka[inventory-events]: StockReserved
   ```

3. **Document dead-letter handling.** For each dead-letter queue, document: the source queue, the retry policy that preceded DLQ routing, the monitoring/alerting configuration, and the manual replay procedure.

4. **Document saga flows.** For each saga, produce a state machine diagram showing: the happy path, each compensation step, timeout behavior, and terminal states (completed, compensated, failed). Include the correlation ID strategy for tracing a saga instance across services.

5. **Produce operational runbook.** For each event flow, document: how to verify messages are flowing (health check), how to replay failed messages from the DLQ, how to pause and resume a consumer, and how to add a new consumer to an existing topic without reprocessing history.

## Harness Integration

- **`harness validate`** -- Run after generating event handlers to confirm project health
- **`harness scan`** -- Refresh the knowledge graph after adding event flow files
- **`query_graph`** -- Trace which services produce and consume a specific event
- **`get_impact`** -- Understand blast radius when modifying an event schema

## Success Criteria

- Message broker was correctly detected or explicitly specified
- All existing event producers and consumers were mapped
- New event schemas include versioning, correlation ID, and typed payloads
- Topic topology matches the ordering and partitioning requirements
- Every at-least-once consumer has a documented idempotency strategy
- Dead-letter queues are configured for every consumer
- No dual-write problems exist (transactional outbox or CDC recommended where needed)
- Event catalog documents all events with producers, consumers, and schemas
- Saga flows include compensating actions and timeout handling

## Examples

### Example: Kafka Event System for Order Processing

**Input:** "Design an event-driven order processing flow with Kafka in our NestJS app."

**Phase 1 -- DISCOVER:**

```
Broker: Kafka (kafkajs 2.x, docker-compose with confluent/cp-kafka)
Existing topics: user-events (UserCreated, UserUpdated)
Existing consumers: notification-service (consumes UserCreated)
Framework: NestJS with @nestjs/microservices
Patterns: Simple pub/sub, no event sourcing or sagas detected
```

**Phase 2 -- DESIGN:**

```
Events:
  OrderPlaced (v1)    - payload: { orderId, userId, items[], totalAmount, currency }
  OrderConfirmed (v1) - payload: { orderId, paymentId, confirmedAt }
  OrderShipped (v1)   - payload: { orderId, trackingNumber, carrier, shippedAt }
  OrderCancelled (v1) - payload: { orderId, reason, cancelledAt }
  PaymentProcessed (v1) - payload: { paymentId, orderId, amount, method, status }
  StockReserved (v1)  - payload: { reservationId, orderId, items[], warehouseId }
  StockReservationFailed (v1) - payload: { orderId, failedItems[], reason }

Topics:
  order-events     - partition key: orderId, partitions: 6, retention: 7d
  payment-events   - partition key: orderId, partitions: 3, retention: 30d
  inventory-events - partition key: orderId, partitions: 3, retention: 7d

Consumer groups:
  payment-service-group     -> order-events (OrderPlaced)
  inventory-service-group   -> order-events (OrderPlaced)
  notification-service-group -> order-events (OrderConfirmed, OrderShipped)
  order-saga-group          -> payment-events, inventory-events

Delivery: at-least-once for all consumers
Idempotency: deduplication table keyed on eventId per consumer
Dead-letter: order-events.DLQ, payment-events.DLQ, inventory-events.DLQ
```

**Phase 2 -- DESIGN (Saga):**

```
OrderSaga (orchestration pattern):
  Step 1: Reserve stock     -> StockReserved / StockReservationFailed
  Step 2: Process payment   -> PaymentProcessed (success) / PaymentProcessed (failed)
  Step 3: Confirm order     -> OrderConfirmed

Compensation:
  Step 2 fails -> release stock reservation (compensate Step 1)
  Step 1 fails -> cancel order immediately (no compensation needed)

Timeout: 30 seconds per step, 2 minutes for full saga
Correlation: orderId across all events
```

**Phase 3 -- VALIDATE:**

```
Idempotency: PASS -- deduplication table design provided for all consumers
Lost events: WARN -- OrderPlaced published after DB write, outside transaction
  -> Recommended: transactional outbox pattern with polling publisher
Error handling: PASS -- DLQ configured for all topics, retry: 3x exponential backoff
Thundering herd: INFO -- OrderPlaced triggers 3 consumers simultaneously
  -> Acceptable: consumers hit different databases
Schema compatibility: N/A -- all events are v1 (new system)
```

### Example: RabbitMQ with Dead-Letter Handling

**Input:** "Add async email notification processing with RabbitMQ to our Express app."

**Phase 1 -- DISCOVER:**

```
Broker: RabbitMQ (amqplib 0.10.x, docker-compose with rabbitmq:3-management)
Existing exchanges: none (greenfield for messaging)
Framework: Express 4.x with Bull for existing job queues
```

**Phase 2 -- DESIGN:**

```
Exchange: notifications (type: topic, durable: true)
Routing keys: notification.email.*, notification.sms.*, notification.push.*

Queues:
  email-notifications:
    binding: notification.email.#
    prefetch: 10
    durable: true
    DLQ: email-notifications.dlq (TTL: 7 days)
    retry: 3x with exponential backoff (1s, 5s, 25s)

  email-notifications.retry:
    binding: (retry exchange)
    message-ttl: varies by retry count
    dead-letter-exchange: notifications (re-route to main queue)

Events:
  notification.email.welcome  - payload: { userId, email, locale }
  notification.email.reset    - payload: { userId, email, resetToken, expiresAt }
  notification.email.invoice  - payload: { userId, email, invoiceId, amount }
```

**Phase 3 -- VALIDATE:**

```
Idempotency: PASS -- email service checks sent_emails table before sending
Lost events: PASS -- publish is fire-and-forget for notifications (at-most-once acceptable)
  -> Note: if delivery guarantee must be stronger, use publisher confirms
Error handling: PASS -- DLQ with 7-day retention, Grafana alert on DLQ depth > 10
```

### Example: Event Sourcing with CQRS

**Input:** "Evaluate our event-sourced inventory system for reliability issues."

**Phase 1 -- DISCOVER:**

```
Broker: NATS JetStream
Event store: PostgreSQL (events table with aggregate_id, sequence, event_type, payload)
Patterns: Event sourcing with CQRS
Read models: inventory_read (materialized from events), stock_levels (materialized view)
Projections: 2 async projectors consuming from events table via polling
```

**Phase 3 -- VALIDATE:**

```
CRITICAL: Projection lag detection missing
  The inventory_read projector has no mechanism to detect or alert when it falls
  behind the event store. A projection that is 1000 events behind will serve stale
  data with no visibility.
  -> Recommend: track projection offset, expose as metric, alert when lag > 100 events

WARN: No snapshot mechanism
  Aggregates are rebuilt from full event history on every load. The StockItem
  aggregate averages 340 events. Rebuild time: ~120ms per load.
  -> Recommend: snapshot every 100 events to cap rebuild to max 100 events

WARN: Event schema migration strategy undefined
  StockAdjusted event has changed shape 3 times (v1, v2, v3) with inline
  version checks in the projector. No formal upcasting pipeline.
  -> Recommend: implement event upcaster that transforms v1/v2 events to v3
  at read time, removing version checks from business logic

PASS: Idempotency via sequence numbers on event store
PASS: Read model rebuild procedure documented in ops runbook
```

## Rationalizations to Reject

| Rationalization                                                                               | Reality                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Our handlers are idempotent enough — we don't need a deduplication table"                    | "Idempotent enough" is not a guarantee. At-least-once delivery means the same message can arrive seconds, minutes, or hours apart. A handler that relies on approximate idempotency (e.g., checking a cache) will produce duplicate side effects when the deduplication window expires or the cache is flushed.                                            |
| "We publish the event right after the database write — it's essentially the same transaction" | Two separate operations are not a transaction regardless of how close together they are. If the process crashes between the database write and the event publish, the write is committed but the event is never sent. Consumers will never see the state change. This is the dual-write problem and it requires the transactional outbox pattern to solve. |
| "The dead-letter queue is configured but nobody monitors it"                                  | An unmonitored DLQ is a silent data loss queue. Failed messages accumulate with no alerting, no replay procedure, and no investigation. A DLQ without monitoring and a replay runbook is a place where business events go to die.                                                                                                                          |
| "Saga compensation is complex — we'll handle failures with manual intervention"               | Manual intervention does not scale and is not available at 3am. A saga that partially completes without compensation leaves the system in a state that requires a human to reconstruct — which means it will not be reconstructed reliably. Every saga step that can fail must have a defined compensating action.                                         |
| "We'll add event versioning when we need to change the schema"                                | Adding versioning to an event schema after consumers are deployed is a breaking change. Consumers expecting version 1 receive an unversioned event and have no way to detect that it is incompatible. Versioning must be in the envelope from the first event in production.                                                                               |

## Gates

- **Every consumer must have a dead-letter queue.** No consumer may silently drop failed messages. WHERE a consumer is configured without a DLQ, THEN the skill must halt and require DLQ configuration before proceeding. Lost messages in production are unrecoverable.
- **At-least-once consumers must be idempotent.** WHERE a consumer uses at-least-once delivery (the default for Kafka, RabbitMQ, and SQS), THEN the handler must have a documented idempotency strategy. A consumer without idempotency will produce duplicate side effects on redelivery.
- **No dual writes without mitigation.** WHERE an event is published outside the same database transaction as the state change it represents, THEN the skill must flag the dual-write risk and recommend the transactional outbox pattern, CDC, or an alternative. Dual writes cause data inconsistency under failure.
- **Saga compensations must be defined for every step.** WHERE a saga pattern is used, THEN every step must have a compensating action. A saga without compensations will leave the system in an inconsistent state when a step fails.

## Escalation

- **Broker not accessible for validation:** When the message broker is not running or not accessible from the development environment, report: "Cannot connect to Kafka/RabbitMQ for topic validation. Design is based on code analysis only. Verify topic configuration matches the design before deploying."
- **Event schema breaking change required:** When a new feature requires a breaking change to an existing event schema, report: "Changing `OrderPlaced.items` from `string[]` to `OrderItem[]` is a breaking change. Consumers on the old schema will fail. Recommend: publish as a new event version (v2) and run both versions in parallel during migration."
- **Consumer processing time exceeds broker timeout:** When analysis shows a consumer handler takes longer than the broker's visibility timeout (SQS) or session timeout (Kafka), report: "The `processInvoice` handler takes ~45 seconds but Kafka's `session.timeout.ms` is 30 seconds. The consumer will be considered dead and rebalance. Increase timeout or refactor handler to publish intermediate progress."
- **Circular event dependencies detected:** When Service A publishes an event that triggers Service B, which publishes an event that triggers Service A, report: "Circular event flow detected: OrderService -> PaymentService -> OrderService. This creates an infinite loop risk. Recommend breaking the cycle with a saga coordinator or combining the logic into a single bounded context."
