# Microservices: Saga Pattern

> Coordinate distributed transactions using choreography and orchestration sagas with compensation.

## When to Use

- A business transaction spans multiple services and you can't use a distributed 2-phase commit
- You need eventual consistency with rollback capability when any step fails
- You're processing orders, bookings, financial transfers, or any multi-step workflow
- You need visibility into the overall progress of a multi-step distributed operation

## Instructions

**Orchestration saga (central coordinator — use for complex flows):**

```typescript
// The saga orchestrator is a state machine that commands each service

type SagaState =
  | { step: 'pending' }
  | { step: 'payment_pending'; orderId: string }
  | { step: 'payment_complete'; orderId: string; chargeId: string }
  | { step: 'inventory_pending'; orderId: string; chargeId: string }
  | { step: 'inventory_reserved'; orderId: string; chargeId: string; reservationId: string }
  | { step: 'completed'; orderId: string }
  | { step: 'compensating'; failedAt: string; reason: string }
  | { step: 'failed'; reason: string };

class OrderSagaOrchestrator {
  constructor(
    private readonly paymentService: PaymentServiceClient,
    private readonly inventoryService: InventoryServiceClient,
    private readonly shippingService: ShippingServiceClient,
    private readonly db: SagaRepository
  ) {}

  async execute(sagaId: string, input: OrderSagaInput): Promise<void> {
    await this.db.updateState(sagaId, { step: 'payment_pending', orderId: input.orderId });

    // Step 1: Process payment
    let chargeId: string;
    try {
      const result = await this.paymentService.charge({
        orderId: input.orderId,
        userId: input.userId,
        amount: input.amount,
      });
      chargeId = result.chargeId;
    } catch (err) {
      await this.db.updateState(sagaId, { step: 'failed', reason: 'Payment failed' });
      return;
    }

    await this.db.updateState(sagaId, {
      step: 'payment_complete',
      orderId: input.orderId,
      chargeId,
    });

    // Step 2: Reserve inventory
    let reservationId: string;
    try {
      const result = await this.inventoryService.reserve({
        orderId: input.orderId,
        items: input.items,
      });
      reservationId = result.reservationId;
    } catch (err) {
      // Compensate: refund payment
      await this.compensate(sagaId, chargeId, null, 'Inventory unavailable');
      return;
    }

    await this.db.updateState(sagaId, {
      step: 'inventory_reserved',
      orderId: input.orderId,
      chargeId,
      reservationId,
    });

    // Step 3: Create shipment
    try {
      await this.shippingService.createShipment({ orderId: input.orderId, address: input.address });
    } catch (err) {
      // Compensate: release inventory AND refund payment
      await this.compensate(sagaId, chargeId, reservationId, 'Shipping failed');
      return;
    }

    await this.db.updateState(sagaId, { step: 'completed', orderId: input.orderId });
  }

  private async compensate(
    sagaId: string,
    chargeId: string,
    reservationId: string | null,
    reason: string
  ): Promise<void> {
    await this.db.updateState(sagaId, { step: 'compensating', failedAt: 'shipping', reason });

    // Compensate in reverse order
    if (reservationId) {
      await this.inventoryService
        .releaseReservation(reservationId)
        .catch((e) => console.error('Compensation failed: release inventory', e));
    }

    await this.paymentService
      .refund(chargeId)
      .catch((e) => console.error('Compensation failed: refund', e));

    await this.db.updateState(sagaId, { step: 'failed', reason });
  }
}

// Saga table
/*
CREATE TABLE sagas (
  id          UUID PRIMARY KEY,
  type        TEXT NOT NULL,
  state       JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
*/
```

**Saga step with idempotency (compensatable operations must be idempotent):**

```typescript
class PaymentServiceClient {
  async charge(input: ChargeInput): Promise<ChargeResult> {
    const idempotencyKey = `saga:${input.orderId}:charge`;
    const response = await fetch(`${this.baseUrl}/charges`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) throw new Error(`Charge failed: HTTP ${response.status}`);
    return response.json();
  }

  async refund(chargeId: string): Promise<void> {
    const idempotencyKey = `refund:${chargeId}`;
    const response = await fetch(`${this.baseUrl}/charges/${chargeId}/refund`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
    });
    if (!response.ok) throw new Error(`Refund failed: HTTP ${response.status}`);
  }
}
```

## Details

**Choreography vs. Orchestration (recap):**

- **Choreography:** Services react to events. No central coordinator. Good for simple flows.
- **Orchestration:** A saga object commands each service. Central visibility. Better for complex flows with branching.

**Pivot transaction:** The point of no return in a saga. Before the pivot, all steps can be compensated. After the pivot, steps must complete (they don't roll back — they may need "forward recovery").

**Anti-patterns:**

- Compensation that can also fail — use retries with backoff; log and alert on persistent compensation failures
- Not persisting saga state — if the orchestrator crashes mid-saga, you have no way to resume
- Synchronous saga steps that all use 2PC under the hood — defeats the purpose; use async or accept eventual consistency

**Saga vs. Two-Phase Commit:** 2PC is synchronous and requires all participants to be available simultaneously. Saga is asynchronous and tolerant of temporary failures. 2PC guarantees strong consistency; Saga guarantees eventual consistency with compensating transactions.

**Monitoring:** Expose saga state via a monitoring dashboard or query endpoint. Alert on sagas stuck in `compensating` or `pending` states beyond a threshold.

## Source

microservices.io/patterns/data/saga.html
