# React Container/Presentational Pattern

> Separate data-fetching containers from stateless presentational components

## When to Use

- A component mixes data-fetching logic with rendering, making it hard to test
- You want to reuse the same UI with different data sources
- You are building a component library where UI and data concerns must be independent
- You need to mock data easily in Storybook or unit tests

## Instructions

1. Split the component in two:
   - **Container** (`<Name>Container`): fetches or manages data, passes it as props to the presentational component
   - **Presentational** (`<Name>`): receives data as props, renders UI, has no data-fetching logic
2. The presentational component is a pure function of its props — no `useEffect`, no fetch calls.
3. The container handles loading states, errors, and side effects.
4. Test the presentational component in isolation by passing mock props.

```typescript
// Presentational — pure, testable, no data concerns
interface DogImageProps { imageUrl: string | null; loading: boolean }
function DogImage({ imageUrl, loading }: DogImageProps) {
  if (loading) return <p>Loading...</p>;
  return imageUrl ? <img src={imageUrl} alt="dog" /> : null;
}

// Container — data concern only
function DogImageContainer() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch('https://dog.ceo/api/breeds/image/random')
      .then((r) => r.json())
      .then((d) => { setImageUrl(d.message); setLoading(false); });
  }, []);
  return <DogImage imageUrl={imageUrl} loading={loading} />;
}
```

## Details

This pattern predates hooks but remains valid. With hooks, the "container" logic is often extracted into a custom hook (`useDogImage`) instead of a wrapper component, which achieves the same separation with less nesting.

**Modern equivalent:** Extract data logic into a custom hook, use the hook in the component:

```typescript
function DogImage() {
  const { imageUrl, loading } = useDogImage(); // hook is the "container"
  if (loading) return <p>Loading...</p>;
  return imageUrl ? <img src={imageUrl} alt="dog" /> : null;
}
```

**With React Server Components:** The server/client split supersedes this pattern for many cases — server components handle data fetching, client components handle interactivity.

## Source

https://patterns.dev/react/presentational-container-pattern

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
