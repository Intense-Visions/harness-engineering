# React Memoization Pattern

> Prevent expensive re-renders and recomputations with React memoization APIs

## When to Use

- A child component re-renders with the same props because the parent re-renders (use `React.memo`)
- A derived value is computationally expensive and its inputs rarely change (use `useMemo`)
- A callback function reference must be stable to avoid breaking `React.memo` on child components (use `useCallback`)
- You have profiled the component with React DevTools and confirmed unnecessary renders

## Instructions

1. **Profile first.** Do not memoize without evidence of a problem — premature memoization adds code complexity and can hurt performance if used incorrectly.
2. Wrap a component with `React.memo` to skip re-render when props are shallowly equal:
   ```typescript
   const ExpensiveList = React.memo(function ExpensiveList({ items }: { items: Item[] }) {
     return <ul>{items.map((i) => <li key={i.id}>{i.name}</li>)}</ul>;
   });
   ```
3. Use `useMemo` for expensive computations:
   ```typescript
   const sortedItems = useMemo(() => [...items].sort(compareFn), [items]);
   ```
4. Use `useCallback` for stable callback references:
   ```typescript
   const handleClick = useCallback(() => onSelect(id), [id, onSelect]);
   ```
5. With React 19 Compiler: memoization may be inserted automatically — avoid manual `React.memo`/`useMemo` until you verify the compiler does not handle it.

## Details

Memoization trades memory for computation. React's memoization hooks cache values between renders when dependency arrays are unchanged.

**Shallow equality:** `React.memo` uses shallow comparison — object/array props created inline always produce new references, breaking memoization. Pass stable references or memoize the props themselves.

**`useMemo` vs `useCallback`:**

- `useMemo` memoizes a computed value: `useMemo(() => compute(), [dep])`
- `useCallback` memoizes a function: `useCallback(() => fn(), [dep])` — equivalent to `useMemo(() => () => fn(), [dep])`

**React 19 Compiler:** The React compiler automatically memoizes components and hooks. Manual `React.memo`, `useMemo`, and `useCallback` may become unnecessary in codebases using the compiler.

**Anti-pattern:** Wrapping every component in `React.memo` without profiling. Memo has overhead — the cost of comparison must be less than the cost of re-rendering.

## Source

https://patterns.dev/react/memoization-pattern

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
