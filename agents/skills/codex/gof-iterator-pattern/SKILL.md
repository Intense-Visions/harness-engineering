# GOF Iterator Pattern

> Traverse collections with Symbol.iterator and generators for lazy, composable sequences.

## When to Use

- You need to traverse a custom data structure (tree, graph, linked list) in a standard way
- You want lazy evaluation — produce values on demand rather than materializing a whole collection
- You need to compose multiple iteration sequences (map, filter, take) without creating intermediate arrays
- You want `for...of` loop support on a custom class

## Instructions

**Custom iterable class:**

```typescript
class LinkedList<T> {
  private head: { value: T; next: { value: T; next: unknown } | null } | null = null;

  prepend(value: T): this {
    this.head = { value, next: this.head };
    return this;
  }

  [Symbol.iterator](): Iterator<T> {
    let current = this.head;
    return {
      next(): IteratorResult<T> {
        if (current === null) return { done: true, value: undefined as T };
        const value = current.value;
        current = current.next as typeof current;
        return { done: false, value };
      },
    };
  }
}

const list = new LinkedList<number>().prepend(3).prepend(2).prepend(1);
for (const value of list) {
  console.log(value); // 1, 2, 3
}
console.log([...list]); // [1, 2, 3]
```

**Generator functions for lazy sequences:**

```typescript
// Infinite sequence — safe because it's lazy
function* naturals(start = 1): Generator<number> {
  let n = start;
  while (true) yield n++;
}

// Take first N values without materializing the infinite sequence
function* take<T>(iterable: Iterable<T>, n: number): Generator<T> {
  let count = 0;
  for (const value of iterable) {
    if (count >= n) break;
    yield value;
    count++;
  }
}

function* map<T, U>(iterable: Iterable<T>, fn: (value: T) => U): Generator<U> {
  for (const value of iterable) yield fn(value);
}

function* filter<T>(iterable: Iterable<T>, pred: (value: T) => boolean): Generator<T> {
  for (const value of iterable) if (pred(value)) yield value;
}

// Compose lazily — no intermediate arrays
const first10Evens = [
  ...take(
    filter(naturals(), (n) => n % 2 === 0),
    10
  ),
];
console.log(first10Evens); // [2, 4, 6, 8, 10, 12, 14, 16, 18, 20]
```

**Async iterator for paginated APIs:**

```typescript
async function* paginatedUsers(pageSize = 100): AsyncGenerator<User> {
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const { users, total } = await fetchUsers({ page, pageSize });
    for (const user of users) yield user;
    page++;
    hasMore = page * pageSize < total;
  }
}

// Process all users without loading everything into memory
for await (const user of paginatedUsers(50)) {
  await processUser(user);
}
```

**Tree traversal iterator:**

```typescript
interface TreeNode<T> {
  value: T;
  children: TreeNode<T>[];
}

function* depthFirst<T>(node: TreeNode<T>): Generator<T> {
  yield node.value;
  for (const child of node.children) {
    yield* depthFirst(child); // delegate to recursive generator
  }
}

function* breadthFirst<T>(root: TreeNode<T>): Generator<T> {
  const queue: TreeNode<T>[] = [root];
  while (queue.length > 0) {
    const node = queue.shift()!;
    yield node.value;
    queue.push(...node.children);
  }
}
```

## Details

**Generator return types in TypeScript:**

- `Generator<Yield, Return, Next>` — synchronous generator
- `AsyncGenerator<Yield, Return, Next>` — async generator (use `async function*` and `for await`)
- `Iterable<T>` — any object with `[Symbol.iterator]()`
- `AsyncIterable<T>` — any object with `[Symbol.asyncIterator]()`

**Performance:** Generators are lazy — they compute values only when requested. This is critical for large datasets. Compare:

```typescript
// Eager — allocates entire array in memory
const users = await db.findAll(); // 1M rows
const emails = users.map((u) => u.email);

// Lazy — streams one at a time
for await (const user of db.stream()) {
  // cursor-based
  await sendEmail(user.email);
}
```

**Anti-patterns:**

- Returning an array from a class when a generator would suffice — arrays allocate all at once
- Forgetting to handle the `return()` and `throw()` iterator protocol methods — important for cleanup in async iterators
- Async generators without error handling — unhandled rejections inside `async function*` are hard to trace

**Built-in iterables:** Arrays, Maps, Sets, Strings, and `arguments` all implement the iterator protocol. Use this as a baseline — your custom collections should too.

## Source

refactoring.guru/design-patterns/iterator

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
