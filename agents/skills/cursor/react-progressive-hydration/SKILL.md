# React Progressive Hydration

> Delay hydration of below-fold or non-critical components to improve TTI

## When to Use

- SSR pages where hydrating all components at once creates a long TTI
- Below-fold components that users will not interact with on page load
- Low-priority widgets (cookie banners, chat widgets, footer interactions)
- You need fast initial page interactivity without deferring all JS

## Instructions

1. Identify components that are not needed for initial interactivity.
2. Wrap them in a lazy-hydration wrapper that triggers hydration on:
   - **Viewport entry** (`IntersectionObserver`)
   - **User idle** (`requestIdleCallback`)
   - **First user interaction** (mousemove, touchstart)
3. Render the component's HTML from SSR immediately (for SEO and visual), but defer event handler attachment.
4. Use `React.lazy` + `Suspense` for code-splitting alongside hydration deferral.

```typescript
function LazyHydrate({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setHydrated(true);
        observer.disconnect();
      }
    });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref}>
      {hydrated ? children : <div dangerouslySetInnerHTML={{ __html: '' }} />}
    </div>
  );
}
```

## Details

Progressive hydration is distinct from islands: islands prevent hydration entirely for static regions, while progressive hydration defers hydration of React components that will eventually be interactive.

**React 18 selective hydration:** `React.lazy` with Suspense boundaries already enables selective hydration in React 18 with `hydrateRoot`. React prioritizes hydrating components the user interacts with first.

**Libraries:** `react-lazy-hydration`, `react-intersection-observer` provide production-ready utilities for this pattern.

**Measurement:** Use Lighthouse TTI, Chrome DevTools Performance tab, and WebPageTest to verify improvements. Premature optimization without measurement is counterproductive.

## Source

https://patterns.dev/react/progressive-hydration

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
