# Events: Saga Choreography

> Coordinate distributed workflows through event chains and compensation events without an orchestrator.

## When to Use

- You have a multi-step business transaction spanning multiple services
- You want loose coupling — services react to events without a central coordinator
- You need to roll back partial work using compensation events when a step fails
- Your workflow is relatively linear (A → B → C → done) with clear compensation paths
- Prefer choreography over orchestration for simpler flows; use orchestration for complex branching

## Instructions

**Order fulfillment saga (choreography):**

```
ORDER CREATED
    → Payment Service: charge card
        → PAYMENT_PROCESSED
            → Inventory Service: reserve stock
                → INVENTORY_RESERVED
                    → Shipping Service: create shipment
                        → SHIPMENT_CREATED → done

On failure at any step → emit compensation event → previous steps compensate:
PAYMENT_FAILED → saga ends (nothing to compensate)
INVENTORY_FAILED → emit PAYMENT_REFUND_REQUESTED → Payment Service refunds
SHIPPING_FAILED → emit INVENTORY_RELEASE_REQUESTED + PAYMENT_REFUND_REQUESTED
```

**Order service — publishes the saga trigger:**

```typescript
// 1. Create order and publish triggering event
async function createOrder(data: CreateOrderInput): Promise<Order> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: { ...data, status: 'AWAITING_PAYMENT' },
    });

    await tx.outbox.create({
      data: {
        eventType: 'order.created',
        aggregateId: order.id,
        payload: {
          eventId: crypto.randomUUID(),
          orderId: order.id,
          userId: order.userId,
          amount: order.total,
          items: order.items,
        },
      },
    });

    return order;
  });
}

// Listen for saga completion/failure events
consumer.on('order.saga.completed', async ({ orderId }) => {
  await db.order.update({ where: { id: orderId }, data: { status: 'CONFIRMED' } });
});

consumer.on('order.saga.failed', async ({ orderId, reason }) => {
  await db.order.update({
    where: { id: orderId },
    data: { status: 'FAILED', failureReason: reason },
  });
});
```

**Payment service — listens and reacts:**

```typescript
consumer.on('order.created', async (event) => {
  const { orderId, userId, amount } = event;

  try {
    const charge = await stripe.charges.create({
      amount: Math.round(amount * 100),
      currency: 'usd',
      customer: await getStripeCustomerId(userId),
    });

    // Success → publish next saga event
    await publish('payment.processed', {
      eventId: crypto.randomUUID(),
      orderId,
      chargeId: charge.id,
      amount,
    });
  } catch (err) {
    // Failure → publish compensation event
    await publish('payment.failed', {
      eventId: crypto.randomUUID(),
      orderId,
      reason: (err as Error).message,
    });
  }
});

// Compensation — triggered by downstream failure
consumer.on('payment.refund.requested', async ({ orderId, chargeId }) => {
  await stripe.refunds.create({ charge: chargeId });
  await publish('payment.refunded', { eventId: crypto.randomUUID(), orderId, chargeId });
});
```

**Inventory service:**

```typescript
consumer.on('payment.processed', async ({ orderId, chargeId, items }) => {
  try {
    await reserveInventory(items);
    await publish('inventory.reserved', { eventId: crypto.randomUUID(), orderId, chargeId });
  } catch (err) {
    // Cannot reserve → trigger payment compensation
    await publish('inventory.reservation.failed', {
      eventId: crypto.randomUUID(),
      orderId,
      chargeId,
      reason: (err as Error).message,
    });
    // Payment service listens to this and refunds
  }
});

consumer.on('inventory.release.requested', async ({ orderId, items }) => {
  await releaseInventory(items);
  await publish('inventory.released', { eventId: crypto.randomUUID(), orderId });
});
```

## Details

**Choreography vs. Orchestration:**
| | Choreography | Orchestration |
|---|---|---|
| Control | Distributed (each service reacts) | Centralized (saga orchestrator commands) |
| Coupling | Low — services share events | Higher — orchestrator knows all steps |
| Visibility | Hard — no single view of progress | Easy — orchestrator tracks state |
| Complexity | Simple flows | Complex flows, conditional branches |

**Idempotency is mandatory:** Each saga step must be idempotent — events can be redelivered. Use event IDs and the `processed_events` table (see `events-idempotency` skill).

**Anti-patterns:**

- Saga steps that have side effects before the event is committed — use outbox pattern for publishing
- Missing compensation events — if any step doesn't define a compensation, rollback becomes impossible
- Circular compensation chains — A compensates B, B compensates A → infinite loop

**Observability challenge:** With pure choreography, no single place shows the full saga state. Solutions:

1. Correlation IDs on all events (same `sagaId` across all events)
2. A saga tracker service that listens to all events and builds a state view
3. Structured logging with the `sagaId` field for log aggregation queries

## Source

microservices.io/patterns/data/saga.html

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- The patterns described in this document are applied correctly in the implementation.
- Edge cases and anti-patterns listed in this document are avoided.
