# Test Snapshot Patterns

> Use snapshot testing selectively for stable outputs, knowing when to avoid it

## When to Use

- Testing serialized output (JSON, HTML, error messages) that should not change unexpectedly
- Verifying component render output for regression detection
- Capturing complex object shapes that are tedious to assert manually
- NOT for rapidly changing UI or non-deterministic output

## Instructions

1. **Basic snapshot:**

```typescript
it('serializes user data correctly', () => {
  const user = formatUser({ id: '1', name: 'Alice', email: 'alice@test.com' });

  expect(user).toMatchSnapshot();
});
```

First run creates the snapshot file. Subsequent runs compare against it.

2. **Inline snapshots** — store the expected value in the test file:

```typescript
it('formats the error message', () => {
  const error = formatError({ code: 404, resource: 'User' });

  expect(error).toMatchInlineSnapshot(`"User not found (404)"`);
});
```

Vitest/Jest auto-fills the inline snapshot on first run.

3. **Snapshot specific properties:**

```typescript
it('creates a user with generated fields', () => {
  const user = createUser({ name: 'Alice' });

  expect(user).toMatchSnapshot({
    id: expect.any(String),
    createdAt: expect.any(Date),
  });
});
```

This snapshots the structure but uses matchers for non-deterministic fields.

4. **Update snapshots** when intentional changes occur:

```bash
vitest --update  # or vitest -u
```

Review the diff before committing updated snapshots.

5. **Prefer inline snapshots for small values** — they are easier to review in PRs:

```typescript
it('generates correct SQL', () => {
  const query = buildQuery({ table: 'users', where: { role: 'admin' } });

  expect(query).toMatchInlineSnapshot(`
    "SELECT * FROM users WHERE role = 'admin'"
  `);
});
```

6. **Snapshot file-based output** for large payloads:

```typescript
it('generates correct API response', () => {
  const response = buildResponse(testData);
  expect(response).toMatchSnapshot(); // Stored in __snapshots__/
});
```

7. **Avoid snapshots for:**
   - UI components that change frequently (use specific assertions instead)
   - Non-deterministic output (timestamps, random IDs)
   - Very large objects (snapshots become unreadable)
   - Behavior testing (use explicit assertions)

8. **Good snapshot candidates:**
   - Serialization formats (JSON output, GraphQL schema)
   - Error messages and validation output
   - Configuration generation
   - CLI output formatting

## Details

Snapshot testing captures the serialized output of a value and compares it against a stored reference. It is a regression detection tool — it tells you when output changes, but not whether the change is correct.

**Snapshot workflow:**

1. First run: snapshot is created and stored (in `__snapshots__/` or inline)
2. Subsequent runs: output is compared against the stored snapshot
3. On mismatch: test fails with a diff
4. To accept the change: run with `--update` flag and review the diff

**Snapshot hygiene:**

- Review snapshot diffs in PRs as carefully as code changes
- Delete snapshots for removed tests — stale snapshots cause confusion
- Keep snapshots small — large snapshots are rubber-stamped in review
- Use `toMatchInlineSnapshot` for values under 5 lines — inline snapshots are easier to review

**`toMatchSnapshot` vs `toMatchInlineSnapshot`:**

- File-based: stored separately, good for large output, harder to review in PRs
- Inline: stored in the test file, easy to review, best for small values

**Trade-offs:**

- Snapshots catch unintentional changes with minimal effort — but also flag intentional changes, requiring update ceremonies
- Large snapshot files are easy to create — but become "approve without reading" in code review
- Inline snapshots are reviewable — but clutter test files with literal output
- Snapshot tests are fast to write — but can mask poor test design (asserting everything instead of specific behavior)

## Source

https://vitest.dev/guide/snapshot.html
