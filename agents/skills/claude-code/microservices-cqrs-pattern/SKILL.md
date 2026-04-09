# Microservices: CQRS Pattern

> Separate read and write models to optimize query and command performance independently.

## When to Use

- Read and write workloads have very different performance and scaling requirements
- You need complex read models (joins, aggregations, denormalized views) that conflict with normalized write models
- You're implementing event sourcing and need a separate read side
- Some queries are slow because the write model's schema is optimized for writes, not reads
- You need multiple read models from the same data (different clients need different views)

## Instructions

**CQRS without event sourcing (simple model separation):**

```typescript
// Commands — write side
interface CreateOrderCommand {
  userId: string;
  items: { productId: string; quantity: number }[];
  shippingAddress: Address;
}

interface UpdateOrderStatusCommand {
  orderId: string;
  status: 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
  note?: string;
}

// Command handlers — use the normalized write DB
class OrderCommandHandler {
  constructor(private readonly db: PrismaClient) {}

  async handleCreate(cmd: CreateOrderCommand): Promise<string> {
    const prices = await this.db.product.findMany({
      where: { id: { in: cmd.items.map((i) => i.productId) } },
      select: { id: true, price: true },
    });

    const priceMap = new Map(prices.map((p) => [p.id, p.price]));
    const total = cmd.items.reduce(
      (sum, item) => sum + priceMap.get(item.productId)! * item.quantity,
      0
    );

    const order = await this.db.order.create({
      data: {
        userId: cmd.userId,
        status: 'pending',
        total,
        shippingAddress: cmd.shippingAddress,
        items: { create: cmd.items.map((i) => ({ ...i, unitPrice: priceMap.get(i.productId)! })) },
      },
    });

    // Synchronously update read model (or via event)
    await this.updateReadModel(order.id);
    return order.id;
  }

  async handleUpdateStatus(cmd: UpdateOrderStatusCommand): Promise<void> {
    await this.db.order.update({
      where: { id: cmd.orderId },
      data: { status: cmd.status },
    });
    await this.updateReadModel(cmd.orderId);
  }

  private async updateReadModel(orderId: string): Promise<void> {
    // Rebuild the denormalized read model
    const order = await this.db.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: true } }, user: true },
    });

    if (order) {
      await this.readDb.orderSummary.upsert({
        where: { orderId },
        update: buildOrderSummary(order),
        create: buildOrderSummary(order),
      });
    }
  }
}

// Queries — read side with denormalized read DB
interface OrderListItem {
  orderId: string;
  status: string;
  customerName: string;
  total: number;
  itemCount: number;
  placedAt: Date;
}

class OrderQueryHandler {
  constructor(private readonly readDb: ReadDatabase) {}

  async listUserOrders(userId: string, cursor?: string): Promise<OrderListItem[]> {
    // Fast query on the denormalized read model — no joins needed
    return this.readDb.orderSummary.findMany({
      where: { userId },
      orderBy: { placedAt: 'desc' },
      take: 20,
      cursor: cursor ? { id: cursor } : undefined,
      select: {
        orderId: true,
        status: true,
        customerName: true,
        total: true,
        itemCount: true,
        placedAt: true,
      },
    });
  }

  async getOrderDetail(orderId: string): Promise<OrderDetail | null> {
    return this.readDb.orderDetail.findUnique({ where: { orderId } });
  }
}
```

**CQRS with event-driven read model sync:**

```typescript
// Write side emits events
class OrderCommandHandler {
  async handleCreate(cmd: CreateOrderCommand): Promise<string> {
    const order = await this.writeDb.order.create({ data: { ...cmd } });
    // Emit integration event — read side reacts
    await this.eventBus.publish('order.created', {
      orderId: order.id,
      userId: order.userId,
      items: order.items,
      total: order.total,
      createdAt: order.createdAt.toISOString(),
    });
    return order.id;
  }
}

// Read side subscription — builds the read model asynchronously
class OrderReadModelProjector {
  constructor(private readonly readDb: ReadDatabase) {}

  async onOrderCreated(event: OrderCreatedEvent): Promise<void> {
    await this.readDb.orderSummary.create({
      data: {
        orderId: event.orderId,
        userId: event.userId,
        status: 'pending',
        total: event.total,
        itemCount: event.items.length,
        placedAt: new Date(event.createdAt),
        customerName: await this.fetchCustomerName(event.userId), // denormalized
      },
    });
  }

  async onOrderStatusUpdated(event: OrderStatusUpdatedEvent): Promise<void> {
    await this.readDb.orderSummary.update({
      where: { orderId: event.orderId },
      data: { status: event.status },
    });
  }
}
```

**API layer — route to command or query handler:**

```typescript
// Commands → write side
app.post('/orders', async (req, res) => {
  const orderId = await commandHandler.handleCreate(req.body);
  res.status(201).json({ orderId });
});

app.patch('/orders/:id/status', async (req, res) => {
  await commandHandler.handleUpdateStatus({ orderId: req.params.id, ...req.body });
  res.status(204).send();
});

// Queries → read side
app.get('/orders', async (req, res) => {
  const orders = await queryHandler.listUserOrders(req.user.id, req.query.cursor as string);
  res.json(orders);
});

app.get('/orders/:id', async (req, res) => {
  const order = await queryHandler.getOrderDetail(req.params.id);
  if (!order) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(order);
});
```

## Details

**Eventual consistency:** When the read model is updated asynchronously (event-driven), there's a window where reads may be stale. This is acceptable for most use cases. For cases where the caller must immediately see their own write, use synchronous read model updates or direct redirect to the write model for the first read.

**Read model per use case:** You can have multiple read models from the same write data:

- `order_summary` — list view (lightweight)
- `order_detail` — full view with items
- `order_analytics` — aggregated for reporting

**Anti-patterns:**

- Using the write model for reads (misses the point of CQRS)
- Sharing a database schema between write and read sides — they should be independently optimizable
- Applying CQRS to every service — only apply where read/write imbalance is real

**When to start simple:** CQRS adds operational complexity. Start with a single model. Introduce CQRS when you can measure that reads are slow because of write model constraints.

## Source

microservices.io/patterns/data/cqrs.html

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
