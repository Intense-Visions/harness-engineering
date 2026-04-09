# Microservices: Decomposition

> Design service boundaries using bounded contexts, DDD, and functional cohesion principles.

## When to Use

- You're breaking apart a monolith and need to decide where to draw service boundaries
- You're designing a new system and want to start with the right service granularity
- Your monolith has teams stepping on each other and you want autonomous ownership
- You need to scale or deploy parts of the system independently

## Instructions

**Decomposition strategies — pick the right one:**

**1. Decompose by Subdomain (DDD approach — start here):**

```
Run event storming → identify bounded contexts → each context is a service candidate

Example domains for an e-commerce platform:
- Order Management: place, cancel, track orders
- Inventory: stock levels, reservations, warehouses
- Catalog: products, prices, descriptions, search
- User Accounts: registration, auth, profile
- Payment: charge, refund, payment methods
- Shipping: carriers, tracking, delivery estimation
- Notifications: email, SMS, push dispatch
```

**2. Decompose by Business Capability:**

```
Map each service to a business capability that can be owned by one team:
Capability → Service → Team

"Process Orders" → OrderService → Order Team
"Manage Inventory" → InventoryService → Inventory Team
"Accept Payments" → PaymentService → Payments Team (often a separate subdomain too)
```

**3. Strangler Fig (for monolith migration):**

```
Don't decompose the monolith in one go — extract incrementally:
1. Identify the highest-value or most change-prone module
2. Put an API gateway/facade in front of the monolith
3. Extract one service at a time behind the facade
4. Redirect routes to the new service gradually
5. Delete the monolith code when the service handles all traffic
```

**Service boundary heuristics:**

```typescript
// GOOD service boundary: high cohesion, low coupling
// OrderService owns everything about an order's lifecycle
class OrderService {
  async placeOrder(data: PlaceOrderInput): Promise<Order> {
    /* ... */
  }
  async cancelOrder(orderId: string, reason: string): Promise<void> {
    /* ... */
  }
  async getOrder(orderId: string): Promise<Order> {
    /* ... */
  }
  async listUserOrders(userId: string): Promise<Order[]> {
    /* ... */
  }
}

// BAD: service that spans multiple domains (too broad)
class BusinessService {
  placeOrder() {
    /* Order domain */
  }
  reserveStock() {
    /* Inventory domain — should be separate */
  }
  chargeCard() {
    /* Payment domain — should be separate */
  }
}

// BAD: service that's too granular (chatty, high coupling)
class OrderStatusService {
  // Only manages status — forces callers to compose with OrderService for everything
  getStatus(orderId: string): Promise<OrderStatus> {
    /* ... */
  }
  updateStatus(orderId: string, status: OrderStatus): Promise<void> {
    /* ... */
  }
}
```

**Service communication patterns:**

```typescript
// Synchronous (REST/gRPC) — use for queries and commands needing immediate response
// Order → Payment (charge must succeed before order is confirmed)
const paymentResult = await paymentClient.charge({
  orderId: order.id,
  amount: order.total,
  customerId: order.userId,
});

// Async (events) — use for notifications and eventual consistency
// Order publishes event → Inventory reacts independently
await eventBus.publish('order.placed', {
  orderId: order.id,
  items: order.items,
});
// Inventory service subscribes and reserves stock asynchronously
```

**Service contract checklist:**

```typescript
interface ServiceContract {
  // 1. Clear API boundary — REST, gRPC, or event schema
  // 2. Versioned — breaking changes require a new version
  // 3. Owned — one team is responsible for this service
  // 4. Independent deploy — can deploy without coordinating with others
  // 5. Own data — service has its own database, not shared
  // 6. Failure-isolated — failure doesn't cascade to callers
}
```

## Details

**Service size guidance:**

- Too big: one service has so many responsibilities that different teams need to change it independently
- Too small: services are so fine-grained that completing a business feature requires deploying 10 services
- Right size: one team owns it, one feature usually touches one or two services

**Database per service:** Each service must own its data. Never share a database table across services — it creates tight coupling at the data level. Integration happens via APIs and events, not JOINs.

**Anti-patterns:**

- Distributed monolith: services that call each other synchronously for every operation — same coupling as a monolith but with network latency added
- God service: one service that everyone calls for everything
- Nano-services: a service that's just a single function (one CRUD operation) with its own deployment

**Migration path:**

1. Modularize the monolith first (package boundaries, no circular imports)
2. Extract the module as a service, keeping the monolith as caller initially
3. Cut over traffic gradually (feature flags, percentage rollout)
4. Delete monolith code once new service is stable

## Source

microservices.io/patterns/decomposition/

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
