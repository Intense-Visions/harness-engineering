# Zustand React Patterns

> Optimize Zustand re-renders with selectors, shallow comparison, useShallow, and transient subscriptions

## When to Use

- Components re-render too often because they subscribe to the entire store
- Selecting multiple values from a store without causing extra re-renders
- Subscribing to state changes outside the React render cycle (animations, event handlers)
- Building performance-sensitive UIs with large stores

## Instructions

1. Always use a selector: `useStore((s) => s.field)` instead of `useStore()`. This subscribes only to `field`.
2. When selecting multiple fields, use `useShallow` to prevent re-renders when the object shape is the same.
3. For derived values, compute them in the selector — avoid storing derived data.
4. Use `useStore.subscribe` for transient updates that should not trigger re-renders (animations, logging).
5. Use `useStoreWithEqualityFn` for custom equality comparisons beyond shallow.

```typescript
// Selecting single values — optimal by default
function Counter() {
  const count = useStore((s) => s.count); // Re-renders only when count changes
  const increment = useStore((s) => s.increment); // Functions are stable references
  return <button onClick={increment}>{count}</button>;
}

// Selecting multiple values — use useShallow
import { useShallow } from 'zustand/react/shallow';

function UserProfile() {
  // Without useShallow: re-renders on ANY store change because { name, email } is a new object every time
  // With useShallow: re-renders only when name OR email change
  const { name, email } = useStore(
    useShallow((s) => ({ name: s.user.name, email: s.user.email }))
  );
  return <div>{name} ({email})</div>;
}

// Alternative: select as array
function UserProfile2() {
  const [name, email] = useStore(
    useShallow((s) => [s.user.name, s.user.email])
  );
  return <div>{name} ({email})</div>;
}
```

```typescript
// Transient subscriptions — no re-renders
function AnimatedElement() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Subscribe to position changes without re-rendering
    const unsub = useStore.subscribe(
      (state) => state.position,
      (position) => {
        if (ref.current) {
          ref.current.style.transform = `translateX(${position}px)`;
        }
      }
    );
    return unsub;
  }, []);

  return <div ref={ref}>Moving element</div>;
}
```

## Details

**Why selectors matter for performance:** Zustand uses `Object.is` to compare the previous and next selector results. If the selector returns a new object every time (`(s) => ({ a: s.a, b: s.b })`), the comparison always fails and the component re-renders. `useShallow` uses shallow equality instead.

**Selector stability patterns:**

```typescript
// Bad — new function reference every render
<List onSelect={(id) => useStore.getState().selectItem(id)} />

// Good — stable selector
const selectItem = useStore((s) => s.selectItem);
<List onSelect={selectItem} />
```

**Auto-generating selectors:** Create a helper that generates individual property selectors:

```typescript
type WithSelectors<S> = S extends { getState: () => infer T }
  ? S & { use: { [K in keyof T]: () => T[K] } }
  : never;

const createSelectors = <S extends StoreApi<object>>(_store: S) => {
  const store = _store as WithSelectors<typeof _store>;
  store.use = {};
  for (const k of Object.keys(store.getState())) {
    (store.use as any)[k] = () => store((s: any) => s[k]);
  }
  return store;
};

// Usage: const count = useStore.use.count();
```

**subscribe with selector (Zustand v4+):** The `subscribe` method accepts a selector and an equality function for targeted external subscriptions:

```typescript
useStore.subscribe(
  (state) => state.count, // selector
  (count, prevCount) => {
    // listener
    console.log('Count changed:', prevCount, '->', count);
  },
  { equalityFn: Object.is } // optional, default is Object.is
);
```

## Source

https://zustand.docs.pmnd.rs/guides/prevent-rerenders-with-use-shallow
