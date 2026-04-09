# Drizzle Transactions

> Execute atomic Drizzle operations with db.transaction(), nested transactions, and rollback semantics

## When to Use

- Performing multiple database operations that must succeed or fail atomically
- Implementing business logic with read-then-write patterns
- Ensuring consistency when modifying related records
- Using savepoints for partial rollback within a larger transaction

## Instructions

1. **Basic transaction** — pass an async callback:

```typescript
const result = await db.transaction(async (tx) => {
  const [sender] = await tx
    .update(accounts)
    .set({ balance: sql`${accounts.balance} - ${amount}` })
    .where(eq(accounts.id, senderId))
    .returning();

  if (sender.balance < 0) {
    tx.rollback(); // Rolls back the entire transaction
  }

  const [receiver] = await tx
    .update(accounts)
    .set({ balance: sql`${accounts.balance} + ${amount}` })
    .where(eq(accounts.id, receiverId))
    .returning();

  return { sender, receiver };
});
```

2. **Use `tx` for all queries** inside the callback. Using `db` instead of `tx` runs queries outside the transaction.

3. **Rollback** — call `tx.rollback()` or throw an error:

```typescript
await db.transaction(async (tx) => {
  await tx.insert(orders).values({ userId, total });
  const inventory = await tx.query.products.findFirst({
    where: eq(products.id, productId),
  });

  if (!inventory || inventory.stock < quantity) {
    throw new Error('Insufficient stock'); // Triggers rollback
  }

  await tx
    .update(products)
    .set({ stock: sql`${products.stock} - ${quantity}` })
    .where(eq(products.id, productId));
});
```

4. **Nested transactions (savepoints):**

```typescript
await db.transaction(async (tx) => {
  await tx.insert(orders).values(orderData);

  try {
    await tx.transaction(async (tx2) => {
      await tx2.insert(notifications).values(notifData);
      // If this fails, only the inner savepoint rolls back
    });
  } catch {
    // Order still committed; notification failed silently
  }
});
```

5. **Transaction configuration** (PostgreSQL):

```typescript
await db.transaction(
  async (tx) => {
    // ...
  },
  {
    isolationLevel: 'serializable',
    accessMode: 'read write',
    deferrable: true,
  }
);
```

6. **Batch operations in a transaction:**

```typescript
await db.transaction(async (tx) => {
  for (const item of items) {
    await tx
      .update(inventory)
      .set({ stock: sql`${inventory.stock} - ${item.qty}` })
      .where(eq(inventory.sku, item.sku));
  }
});
```

## Details

Drizzle transactions use the underlying database driver's transaction support. The `tx` object is a transaction-scoped Drizzle client with the same query API as `db`.

**`tx.rollback()`:** This throws a special error that Drizzle catches to trigger rollback. Do not catch this error inside the transaction callback. The transaction function returns `never` after `tx.rollback()`.

**Nested transactions use savepoints.** On PostgreSQL and MySQL, nested `tx.transaction()` calls translate to `SAVEPOINT` / `ROLLBACK TO SAVEPOINT`. SQLite does not support savepoints in all drivers.

**Isolation levels (PostgreSQL):**

- `read uncommitted` — rarely used, same as `read committed` on PostgreSQL
- `read committed` (default) — each statement sees committed data as of statement start
- `repeatable read` — all statements see committed data as of transaction start
- `serializable` — full serializability, detects and aborts conflicting transactions

**Connection handling:** A transaction holds one database connection for its entire duration. Keep transactions short to avoid connection pool exhaustion. Avoid external HTTP calls, file I/O, or long computations inside transactions.

**Trade-offs:**

- `tx.rollback()` uses exceptions for control flow, which can be surprising — do not wrap it in try/catch inside the transaction
- Serializable isolation prevents anomalies but may abort transactions under contention — implement retry logic
- Nested transactions (savepoints) add complexity — use them sparingly for optional side effects

## Source

https://orm.drizzle.team/docs/transactions

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
