# Client-Side Rendering

> Master client-side rendering performance — SPA rendering optimization, reducing unnecessary re-renders, skeleton screen patterns, progressive rendering strategies, virtual DOM efficiency, React performance profiling, and concurrent rendering features for responsive user interfaces.

## When to Use

- A SPA has slow initial render due to large JavaScript bundles
- React DevTools Profiler shows components re-rendering unnecessarily
- User interactions feel sluggish (INP > 200ms) in a client-rendered application
- Skeleton screens are needed to improve perceived performance during data fetching
- State changes in parent components cause expensive child re-renders
- A dashboard with many widgets re-renders all widgets when one updates
- Form inputs lag because typing triggers expensive renders in unrelated components
- List rendering with hundreds of items causes visible frame drops
- Transitioning between views in a SPA shows blank content instead of loading states
- React concurrent features (useTransition, useDeferredValue) could improve responsiveness

## Instructions

1. **Profile rendering with React DevTools Profiler.** Identify which components render, why, and how long they take:

   ```
   1. Open React DevTools → Profiler tab
   2. Click "Record" → interact with the application → "Stop"
   3. Examine the flame chart:
      - Gray components: did not render
      - Colored components: rendered (warmer = slower)
      - "Why did this render?" shows the trigger
   4. Look for:
      - Components rendering on unrelated state changes
      - Large subtrees re-rendering for small changes
      - Components rendering >16ms (frame budget)
   ```

2. **Prevent unnecessary re-renders with memoization.** Use React.memo, useMemo, and useCallback strategically:

   ```typescript
   // React.memo: skip re-render when props are unchanged
   const ExpensiveList = React.memo(function ExpensiveList({
     items,
     onItemClick,
   }: {
     items: Item[];
     onItemClick: (id: string) => void;
   }) {
     return (
       <ul>
         {items.map(item => (
           <ListItem key={item.id} item={item} onClick={onItemClick} />
         ))}
       </ul>
     );
   });

   // Parent: stabilize callback reference
   function Dashboard() {
     const [items, setItems] = useState<Item[]>([]);
     const [selectedId, setSelectedId] = useState<string | null>(null);

     // useCallback: stable reference across renders
     const handleItemClick = useCallback((id: string) => {
       setSelectedId(id);
     }, []);

     return (
       <>
         <Sidebar selectedId={selectedId} />
         <ExpensiveList items={items} onItemClick={handleItemClick} />
       </>
     );
   }
   ```

3. **Implement skeleton screens for data-loading states.** Skeletons reduce perceived load time by 15-30%:

   ```typescript
   function ProductCardSkeleton() {
     return (
       <div className="product-card">
         <div className="skeleton skeleton-image" />
         <div className="skeleton skeleton-title" />
         <div className="skeleton skeleton-price" />
       </div>
     );
   }

   function ProductGrid() {
     const { data, isLoading } = useProducts();

     if (isLoading) {
       return (
         <div className="grid">
           {Array.from({ length: 12 }, (_, i) => (
             <ProductCardSkeleton key={i} />
           ))}
         </div>
       );
     }

     return (
       <div className="grid">
         {data.map(product => (
           <ProductCard key={product.id} product={product} />
         ))}
       </div>
     );
   }
   ```

   ```css
   .skeleton {
     background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
     background-size: 200% 100%;
     animation: shimmer 1.5s infinite;
     border-radius: 4px;
   }
   .skeleton-image {
     width: 100%;
     aspect-ratio: 1;
   }
   .skeleton-title {
     width: 80%;
     height: 20px;
     margin-top: 12px;
   }
   .skeleton-price {
     width: 40%;
     height: 16px;
     margin-top: 8px;
   }

   @keyframes shimmer {
     0% {
       background-position: 200% 0;
     }
     100% {
       background-position: -200% 0;
     }
   }
   ```

4. **Use concurrent rendering for responsive interactions.** React 18 concurrent features prevent expensive renders from blocking user input:

   ```typescript
   import { useTransition, useDeferredValue } from 'react';

   // useTransition: mark state updates as non-urgent
   function SearchPage() {
     const [query, setQuery] = useState('');
     const [results, setResults] = useState<Result[]>([]);
     const [isPending, startTransition] = useTransition();

     function handleSearch(e: React.ChangeEvent<HTMLInputElement>) {
       const value = e.target.value;
       setQuery(value);  // urgent: update input immediately

       startTransition(() => {
         // non-urgent: can be interrupted by user input
         const filtered = filterResults(allData, value);
         setResults(filtered);
       });
     }

     return (
       <>
         <input value={query} onChange={handleSearch} />
         {isPending && <Spinner />}
         <ResultsList results={results} />
       </>
     );
   }

   // useDeferredValue: defer expensive re-renders
   function FilteredList({ filter }: { filter: string }) {
     const deferredFilter = useDeferredValue(filter);
     const isStale = filter !== deferredFilter;

     // ExpensiveList re-renders with the deferred (older) value
     // while the input updates immediately with the current value
     return (
       <div style={{ opacity: isStale ? 0.7 : 1 }}>
         <ExpensiveList filter={deferredFilter} />
       </div>
     );
   }
   ```

5. **Optimize list rendering.** Large lists are the most common CSR performance problem:

   ```typescript
   // Key stability: use stable IDs, not array index
   // Bad: items.map((item, index) => <Item key={index} ... />)
   // Good: items.map(item => <Item key={item.id} ... />)

   // Avoid creating new objects/arrays in render
   // Bad: <List items={data.filter(d => d.active)} />
   // Good:
   const activeItems = useMemo(
     () => data.filter(d => d.active),
     [data]
   );
   return <List items={activeItems} />;

   // For very long lists (1000+), use virtualization
   // See: perf-lazy-loading skill for virtual scrolling patterns
   ```

6. **Batch state updates for fewer renders.** React 18 automatically batches state updates in all contexts:

   ```typescript
   // React 18: all state updates are batched automatically
   // This triggers ONE re-render, not three:
   async function handleSubmit() {
     const data = await fetchData();
     setItems(data.items); // batched
     setTotal(data.total); // batched
     setLoading(false); // batched → single re-render
   }

   // When you need to force a synchronous update (rare):
   import { flushSync } from 'react-dom';
   flushSync(() => {
     setMeasurement(value); // renders immediately
   });
   // DOM is updated here — safe to measure
   const height = ref.current.offsetHeight;
   ```

7. **Profile with the Performance panel.** Beyond React DevTools, the Chrome Performance panel shows the full picture:

   ```
   1. Performance tab → Record → interact → Stop
   2. Look for:
      - Long Tasks (>50ms) in the Main thread
      - Scripting vs Rendering vs Painting breakdown
      - React commit phases (look for "React" in the call stack)
   3. Common findings:
      - Large component trees re-rendering: many short React frames
      - Single expensive computation: one long scripting block
      - Layout thrashing: alternating "Recalculate Style" and "Layout"
   ```

## Details

### Virtual DOM Reconciliation Cost

React's reconciliation algorithm diffs the previous and next virtual DOM trees to determine minimal DOM updates. The diffing itself is O(n) where n is the number of elements. For 1000 list items, the diff cost is ~1-5ms. The expensive part is DOM mutation: inserting, moving, or removing real DOM nodes costs ~0.1-0.5ms each. This is why stable keys are critical — they help React match elements across renders and minimize DOM mutations.

### Worked Example: Figma File Browser

Figma's file browser renders thousands of file thumbnails in a grid. They use windowed rendering (only rendering files in the viewport plus a buffer) combined with React.memo on individual file cards. State management uses Zustand with selector-based subscriptions so that selecting a file does not re-render all file cards. The search input uses useDeferredValue to keep typing responsive while the filtered file list updates in the background. Result: smooth 60fps scrolling through 10,000+ files with <50ms INP on interactions.

### Worked Example: Linear Issue Tracker

Linear's issue list renders hundreds of issues with complex status indicators, assignees, labels, and priority badges. They achieve instant-feeling interactions by: (1) optimistic updates — the UI updates before the server confirms, (2) fine-grained state subscriptions — clicking an issue's status only re-renders that row, (3) CSS transitions instead of React-driven animations for status changes, (4) skeleton screens that match the exact layout of loaded content. The result is a <50ms INP for issue status changes and zero layout shift during loading transitions.

### Anti-Patterns

**Premature memoization.** Wrapping every component in React.memo adds comparison overhead. Only memoize components that: (a) receive complex props and render frequently, (b) are expensive to render (>5ms), or (c) sit below state that changes frequently. Profile first, memoize second.

**State in the wrong component.** Lifting state too high causes entire subtrees to re-render on every state change. Keep state as close to where it is used as possible. A search filter state should live in the search component, not in the page root.

**Creating objects in JSX props.** `<Child style={{ color: 'red' }} />` creates a new object on every render, defeating React.memo. Extract constant objects outside the component or use useMemo for dynamic objects.

**Synchronous heavy computation during render.** Computing 10,000-item filters or sorting inside a render function blocks the frame. Move heavy computation to a Web Worker or use useDeferredValue so the main thread stays responsive.

## Source

- React: Performance — https://react.dev/learn/render-and-commit
- React: useTransition — https://react.dev/reference/react/useTransition
- React: Profiler — https://react.dev/reference/react/Profiler
- web.dev: Rendering performance — https://web.dev/articles/rendering-performance

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- React DevTools Profiler shows no unnecessary re-renders on common interactions.
- All loading states use skeleton screens that match loaded content dimensions.
- useTransition or useDeferredValue is used for expensive filtering/sorting operations.
- List rendering uses stable keys and memoized items where beneficial.
- INP is under 200ms for all common user interactions.
