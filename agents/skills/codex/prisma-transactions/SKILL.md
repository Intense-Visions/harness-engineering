# Prisma Transactions

> Execute atomic operations with Prisma $transaction, interactive transactions, and nested writes

## When to Use

- Performing multiple database operations that must all succeed or all fail
- Transferring data between records (e.g., balance transfers, inventory moves)
- Executing a sequence of reads and writes that depend on each other
- Running batch operations that need rollback on partial failure

## Instructions

1. **Sequential transaction** — pass an array of Prisma operations. They execute in order within a single transaction:

```typescript
const [order, payment] = await prisma.$transaction([
  prisma.order.create({ data: { userId, total: 99.99 } }),
  prisma.payment.create({ data: { userId, amount: 99.99, status: 'PENDING' } }),
]);
```

2. **Interactive transaction** — pass an async callback for operations that depend on intermediate results:

```typescript
const transfer = await prisma.$transaction(async (tx) => {
  const sender = await tx.account.update({
    where: { id: senderId },
    data: { balance: { decrement: amount } },
  });

  if (sender.balance < 0) {
    throw new Error('Insufficient funds');
  }

  const receiver = await tx.account.update({
    where: { id: receiverId },
    data: { balance: { increment: amount } },
  });

  return { sender, receiver };
});
```

Throwing inside the callback rolls back the entire transaction.

3. **Set isolation level** to control read consistency:

```typescript
await prisma.$transaction(
  async (tx) => {
    /* ... */
  },
  { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
);
```

4. **Set timeout** for long-running transactions:

```typescript
await prisma.$transaction(
  async (tx) => {
    /* ... */
  },
  { maxWait: 5000, timeout: 10000 }
);
```

- `maxWait` — maximum time to wait for a connection from the pool (ms)
- `timeout` — maximum time the transaction can run before auto-rollback (ms)

5. **Nested writes are implicit transactions** — a single `create`/`update` with nested operations is already atomic:

```typescript
// This is already transactional — no $transaction wrapper needed
const user = await prisma.user.create({
  data: {
    email: 'user@example.com',
    profile: { create: { bio: 'Hello' } },
    posts: { create: [{ title: 'Post 1' }, { title: 'Post 2' }] },
  },
});
```

6. **Use the `tx` client** inside interactive transactions, not the global `prisma` client. Queries on the global client run outside the transaction.

7. **Batch operations** — combine `createMany`, `updateMany`, and `deleteMany` in a sequential transaction for bulk operations:

```typescript
await prisma.$transaction([
  prisma.notification.deleteMany({ where: { read: true, createdAt: { lt: cutoff } } }),
  prisma.auditLog.create({ data: { action: 'CLEANUP', count: deletedCount } }),
]);
```

## Details

Prisma supports two transaction modes: sequential (array) and interactive (callback). Both produce a real database transaction with ACID guarantees.

**Sequential vs interactive:** Sequential transactions execute all operations in order but you cannot read intermediate results. Interactive transactions give you a transaction-scoped client (`tx`) that lets you read and branch on results. Use sequential for independent writes; use interactive when operations depend on each other.

**Isolation levels:** `ReadUncommitted`, `ReadCommitted`, `RepeatableRead`, `Serializable`. The default varies by provider (PostgreSQL defaults to `ReadCommitted`). Higher isolation levels prevent more anomalies but increase lock contention and deadlock risk.

**Interactive transaction pitfalls:**

- Keep transactions short — long-running transactions hold locks and block other connections
- Avoid external API calls inside transactions — if the API is slow, the transaction holds locks needlessly
- The `tx` client is only valid inside the callback — do not pass it to background jobs
- Default timeout is 5 seconds. Increase it explicitly for migrations or batch operations

**Nested writes vs explicit transactions:** Nested writes (connect, create, connectOrCreate within a single operation) are cleaner and more performant than wrapping individual operations in `$transaction`. Use explicit transactions only when you need conditional logic between operations.

**Deadlocks:** If two transactions lock the same rows in different order, the database detects the deadlock and aborts one transaction. Prisma surfaces this as error code `P2034`. Retry the transaction in application code:

```typescript
async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (e.code === 'P2034' && i < retries - 1) continue;
      throw e;
    }
  }
  throw new Error('Unreachable');
}
```

## Source

https://prisma.io/docs/orm/prisma-client/queries/transactions

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
