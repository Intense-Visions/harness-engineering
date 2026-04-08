# React Render Props Pattern

> Share stateful logic by passing a render function as a prop

## When to Use

- You need to share stateful behavior without coupling the rendering to the logic
- The rendering of the shared state is highly variable between consumers
- You are working with class components (pre-hooks) or third-party components that do not expose hooks
- Building components for library distribution where render control must stay with consumers

## Instructions

1. Create a component that manages the shared state or behavior.
2. Accept a `render` prop (or `children` as a function) that receives the state as arguments.
3. Call the render prop inside the component's return, passing the managed state.
4. Consumers control all rendering; the provider controls only the logic.

```typescript
interface MousePosition { x: number; y: number }

function MouseTracker({ render }: { render: (pos: MousePosition) => React.ReactNode }) {
  const [pos, setPos] = useState<MousePosition>({ x: 0, y: 0 });
  return (
    <div onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}>
      {render(pos)}
    </div>
  );
}

// Usage
<MouseTracker render={({ x, y }) => <p>Mouse at {x}, {y}</p>} />
```

## Details

Render props were the dominant pattern for logic reuse before React hooks. With hooks available, most new render props use cases should be implemented as custom hooks instead. However, render props remain valuable in specific scenarios:

- Third-party library integration where hooks are unavailable
- Highly dynamic rendering decisions that benefit from explicit prop passing
- Class component contexts

**Children as function** is a common variant:

```typescript
<MouseTracker>{({ x, y }) => <p>At {x}, {y}</p>}</MouseTracker>
```

**Trade-offs vs hooks:**

- Render props require wrapping in JSX; hooks are called inline — hooks are almost always simpler
- Render props make the data flow explicit in JSX; hooks hide the data flow in function calls
- Multiple render props create "wrapper hell" (the problem hooks solved)

## Source

https://patterns.dev/react/render-props-pattern
