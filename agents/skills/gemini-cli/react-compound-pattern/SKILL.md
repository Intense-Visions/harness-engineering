# React Compound Pattern

> Build multi-part components that share state implicitly via context

## When to Use

- Building UI components with related sub-components (Select/Option, Tabs/Tab/TabPanel, Modal/Header/Body/Footer)
- You want consumers to control composition without prop-drilling
- The parent component needs to coordinate state shared across children
- You are replacing a heavily prop-loaded component with a more flexible API

## Instructions

1. Create a parent component that owns shared state via `useState` or `useReducer`.
2. Create a Context to hold the shared state and expose it.
3. Attach child components as static properties of the parent (`Parent.Child = Child`).
4. Child components read shared state from context — no explicit prop passing required.
5. Export the parent as the public API; children are accessed via dot notation.

```typescript
const FlyOutContext = createContext<{ open: boolean; toggle: () => void } | null>(null);

function FlyOut({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <FlyOutContext.Provider value={{ open, toggle: () => setOpen((o) => !o) }}>
      <div className="flyout">{children}</div>
    </FlyOutContext.Provider>
  );
}

function Toggle() {
  const ctx = useContext(FlyOutContext)!;
  return <button onClick={ctx.toggle}>Toggle</button>;
}

function List({ children }: { children: React.ReactNode }) {
  const ctx = useContext(FlyOutContext)!;
  return ctx.open ? <ul>{children}</ul> : null;
}

FlyOut.Toggle = Toggle;
FlyOut.List = List;
```

## Details

The compound pattern addresses a common pain point: component APIs that grow to have dozens of props as every variant is added. By inverting control to the consumer (they choose the composition), the parent component stays lean and the API stays readable.

**Trade-offs:**

- JSX.Element type inference for attached sub-components requires TypeScript declaration merging or explicit typing
- Deeply nested compound components may need context bridging if the sub-component is used far from the parent
- Over-using this pattern for simple cases adds unnecessary complexity

**Common examples in the wild:**

- HTML `<select>` / `<option>` is the canonical compound component
- Radix UI primitives (Dialog.Root / Dialog.Trigger / Dialog.Content)
- Headless UI (Tab / Tab.Group / Tab.Panel)

## Source

https://patterns.dev/react/compound-pattern
