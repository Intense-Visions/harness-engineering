# TypeScript Async Patterns

> Type async/await, Promise chains, and concurrent patterns correctly in TypeScript

## When to Use

- Typing async functions and their return values
- Handling errors in async code with proper types
- Running concurrent operations with Promise.all, Promise.allSettled, Promise.race
- Creating typed async utilities and middleware

## Instructions

1. **Async function return types** — always return `Promise<T>`:

```typescript
async function getUser(id: string): Promise<User> {
  const response = await fetch(`/api/users/${id}`);
  return response.json();
}
```

2. **Type Promise.all** — preserves tuple types:

```typescript
const [user, posts, settings] = await Promise.all([
  getUser(userId), // Promise<User>
  getUserPosts(userId), // Promise<Post[]>
  getSettings(), // Promise<Settings>
]);
// Types: [User, Post[], Settings]
```

3. **Promise.allSettled** — returns settled results with status:

```typescript
const results = await Promise.allSettled([fetchUser(), fetchPosts()]);

for (const result of results) {
  if (result.status === 'fulfilled') {
    console.log(result.value); // Type: User | Post[] (union of all types)
  } else {
    console.log(result.reason); // Type: any
  }
}
```

4. **Promise.race** — returns the type of the first resolved:

```typescript
const result = await Promise.race([
  fetchData(), // Promise<Data>
  timeout(5000), // Promise<never>
]);
// Type: Data (never is absorbed)
```

5. **Typed error handling** — catch blocks receive `unknown`:

```typescript
async function fetchUser(id: string): Promise<User> {
  try {
    const res = await fetch(`/api/users/${id}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to fetch user: ${error.message}`);
    }
    throw error;
  }
}
```

6. **Result type pattern** — avoid exceptions for expected failures:

```typescript
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

async function safeFetch<T>(url: string): Promise<Result<T>> {
  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false, error: new Error(`HTTP ${res.status}`) };
    return { ok: true, value: await res.json() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
}
```

7. **Typed retry logic:**

```typescript
async function retry<T>(
  fn: () => Promise<T>,
  options: { retries: number; delay: number }
): Promise<T> {
  for (let i = 0; i <= options.retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === options.retries) throw error;
      await new Promise((r) => setTimeout(r, options.delay * (i + 1)));
    }
  }
  throw new Error('Unreachable');
}
```

8. **Concurrent execution with concurrency limit:**

```typescript
async function mapConcurrent<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = [];
  const executing = new Set<Promise<void>>();

  for (const item of items) {
    const p = fn(item).then((result) => {
      results.push(result);
    });
    executing.add(p);
    p.finally(() => executing.delete(p));

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}
```

9. **AsyncIterable for streaming data:**

```typescript
async function* paginate<T>(
  fetchPage: (cursor?: string) => Promise<{ data: T[]; nextCursor?: string }>
): AsyncGenerator<T> {
  let cursor: string | undefined;
  do {
    const page = await fetchPage(cursor);
    yield* page.data;
    cursor = page.nextCursor;
  } while (cursor);
}

for await (const user of paginate(fetchUsers)) {
  console.log(user);
}
```

## Details

TypeScript types async code through the `Promise<T>` generic type. The `await` keyword unwraps `Promise<T>` to `T`, and `async` functions always return `Promise<T>`.

**`Awaited<T>` utility type:** Recursively unwraps nested Promises. `Awaited<Promise<Promise<string>>>` is `string`. Useful for typing the result of `Promise.all` and similar utilities.

**Error typing limitations:** `catch` blocks and `.catch()` callbacks receive `unknown` (with `useUnknownInCatchVariables`). TypeScript cannot track which errors a function might throw. This is by design — any function can throw any error. Use the Result pattern for typed error handling.

**`void` vs `undefined` in async:** An async function with no return statement returns `Promise<void>`, not `Promise<undefined>`. These are subtly different — `void` means "ignore the return value," `undefined` means "the value is undefined."

**Unhandled rejection risks:** Forgetting to `await` a Promise means errors are unhandled. TypeScript does not warn about unawaited promises by default — use the `@typescript-eslint/no-floating-promises` rule.

**Trade-offs:**

- `Promise.all` fails fast — if one promise rejects, the entire result rejects. Use `Promise.allSettled` when partial success is acceptable
- Async generators are powerful but hard to debug and have poor error propagation
- The Result pattern avoids exceptions but adds verbosity — use it for expected failures (API errors), not unexpected ones (null references)

## Source

https://typescriptlang.org/docs/handbook/release-notes/typescript-4-7.html
