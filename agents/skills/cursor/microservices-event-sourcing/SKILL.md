# Microservices: Event Sourcing

> Store state as an immutable sequence of events with projections, snapshots, and replay.

## When to Use

- You need a complete audit trail of all changes to business entities
- You want to time-travel: replay events to reconstruct state at any point in time
- You're building CQRS — event sourcing naturally separates write (commands/events) from read (projections)
- You need to recover from bugs by replaying events with a fixed handler
- Financial systems, inventory tracking, or any domain where "how did we get here?" matters

## Instructions

**Core types:**

```typescript
// Base domain event
interface DomainEvent {
  readonly eventId: string;
  readonly eventType: string;
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  readonly occurredAt: string; // ISO 8601
}

// Aggregate root base class
abstract class EventSourcedAggregate {
  private _version = 0;
  private _uncommittedEvents: DomainEvent[] = [];

  get version(): number {
    return this._version;
  }

  protected apply(event: DomainEvent): void {
    this.when(event); // update state
    this._version++;
    this._uncommittedEvents.push(event);
  }

  // Each subclass implements: dispatch to specific state-update methods
  protected abstract when(event: DomainEvent): void;

  // Reconstruct from stored events (no side effects)
  rehydrate(events: DomainEvent[]): void {
    for (const event of events) {
      this.when(event);
      this._version++;
    }
  }

  pullUncommittedEvents(): DomainEvent[] {
    const events = [...this._uncommittedEvents];
    this._uncommittedEvents = [];
    return events;
  }
}
```

**Order aggregate:**

```typescript
// Events
interface OrderCreated extends DomainEvent {
  eventType: 'order.created';
  userId: string;
  items: { productId: string; quantity: number; unitPrice: number }[];
}

interface OrderPaid extends DomainEvent {
  eventType: 'order.paid';
  chargeId: string;
  amount: number;
}

interface OrderShipped extends DomainEvent {
  eventType: 'order.shipped';
  trackingNumber: string;
  carrier: string;
}

interface OrderCancelled extends DomainEvent {
  eventType: 'order.cancelled';
  reason: string;
}

type OrderEvent = OrderCreated | OrderPaid | OrderShipped | OrderCancelled;

// Aggregate
class Order extends EventSourcedAggregate {
  private status: 'pending' | 'paid' | 'shipped' | 'cancelled' = 'pending';
  private userId = '';
  private items: OrderEvent extends OrderCreated ? OrderCreated['items'] : never = [];
  id = '';

  static create(id: string, userId: string, items: OrderCreated['items']): Order {
    const order = new Order();
    order.id = id;
    order.apply({
      eventId: crypto.randomUUID(),
      eventType: 'order.created',
      aggregateId: id,
      aggregateVersion: 0,
      occurredAt: new Date().toISOString(),
      userId,
      items,
    } as OrderCreated);
    return order;
  }

  pay(chargeId: string, amount: number): void {
    if (this.status !== 'pending') throw new Error('Order is not pending');
    this.apply({
      eventId: crypto.randomUUID(),
      eventType: 'order.paid',
      aggregateId: this.id,
      aggregateVersion: this.version,
      occurredAt: new Date().toISOString(),
      chargeId,
      amount,
    } as OrderPaid);
  }

  ship(trackingNumber: string, carrier: string): void {
    if (this.status !== 'paid') throw new Error('Order must be paid before shipping');
    this.apply({
      eventId: crypto.randomUUID(),
      eventType: 'order.shipped',
      aggregateId: this.id,
      aggregateVersion: this.version,
      occurredAt: new Date().toISOString(),
      trackingNumber,
      carrier,
    } as OrderShipped);
  }

  protected when(event: DomainEvent): void {
    const e = event as OrderEvent;
    switch (e.eventType) {
      case 'order.created':
        this.id = e.aggregateId;
        this.userId = e.userId;
        this.status = 'pending';
        break;
      case 'order.paid':
        this.status = 'paid';
        break;
      case 'order.shipped':
        this.status = 'shipped';
        break;
      case 'order.cancelled':
        this.status = 'cancelled';
        break;
    }
  }
}
```

**Event store:**

```typescript
class PostgresEventStore {
  async append(events: DomainEvent[], expectedVersion: number): Promise<void> {
    await this.db.$transaction(async (tx) => {
      // Optimistic concurrency check
      const current = await tx.eventStore.count({
        where: { aggregateId: events[0].aggregateId },
      });
      if (current !== expectedVersion) {
        throw new ConcurrencyError(`Expected version ${expectedVersion}, got ${current}`);
      }

      await tx.eventStore.createMany({
        data: events.map((e, i) => ({
          eventId: e.eventId,
          eventType: e.eventType,
          aggregateId: e.aggregateId,
          aggregateVersion: expectedVersion + i,
          occurredAt: new Date(e.occurredAt),
          payload: e,
        })),
      });
    });
  }

  async load(aggregateId: string, fromVersion = 0): Promise<DomainEvent[]> {
    const records = await this.db.eventStore.findMany({
      where: { aggregateId, aggregateVersion: { gte: fromVersion } },
      orderBy: { aggregateVersion: 'asc' },
    });
    return records.map((r) => r.payload as DomainEvent);
  }
}

// Repository
class OrderRepository {
  async save(order: Order): Promise<void> {
    const events = order.pullUncommittedEvents();
    if (events.length === 0) return;
    const expectedVersion = order.version - events.length;
    await this.eventStore.append(events, expectedVersion);
  }

  async findById(orderId: string): Promise<Order> {
    const events = await this.eventStore.load(orderId);
    if (events.length === 0) throw new Error(`Order ${orderId} not found`);
    const order = new Order();
    order.id = orderId;
    order.rehydrate(events);
    return order;
  }
}
```

## Details

**Projections:** Read-side views built by replaying events. They can be rebuilt at any time from the event store.

```typescript
// Projection: build a simple read model
class OrderSummaryProjection {
  private summaries = new Map<string, { status: string; total: number }>();

  handle(event: DomainEvent): void {
    const e = event as OrderEvent;
    switch (e.eventType) {
      case 'order.created':
        this.summaries.set(e.aggregateId, {
          status: 'pending',
          total: e.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
        });
        break;
      case 'order.paid':
        this.summaries.get(e.aggregateId)!.status = 'paid';
        break;
    }
  }
}
```

**Snapshots:** After N events, persist a snapshot so rehydration doesn't replay from the beginning.

**Anti-patterns:**

- Storing commands instead of events — events are facts (what happened), commands are intents
- Mutable events — events are immutable; never update them
- Using event sourcing for simple CRUD entities that don't need audit trails — adds unnecessary complexity

## Source

microservices.io/patterns/data/event-sourcing.html

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
