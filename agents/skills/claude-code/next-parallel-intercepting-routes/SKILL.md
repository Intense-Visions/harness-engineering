# Next.js Parallel and Intercepting Routes

> Render multiple pages simultaneously in one layout and intercept routes for modal patterns

## When to Use

- Building modal UIs that show a page in an overlay while keeping the background page visible
- Displaying different views in side-by-side slots within a layout (dashboard tabs, split views)
- Implementing photo gallery lightbox patterns where direct URL access shows the full page
- Creating conditional UI based on authentication or application state within a layout
- Building tabbed interfaces where each tab has its own URL and loading/error state

## Instructions

1. Create parallel route slots with `@slotName/` folders inside a layout's directory — each slot becomes a prop in `layout.tsx`.
2. Define `default.tsx` in each slot directory to render when the slot has no matching route — prevents the slot from 404ing.
3. Intercept a route by prefixing its folder with `(.)` (same level), `(..)` (one level up), `(..)(..)` (two levels up), or `(...)` (root).
4. Pair an intercepting route with a parallel slot: clicking a link shows the modal (intercepting route in the `@modal` slot); navigating directly or refreshing shows the full page.
5. Use `useRouter().back()` or a Link to close modals — do not manage modal open state in React state when URLs are involved.
6. Keep `default.tsx` returning `null` for modal slots that have no default state (slot is empty when no modal is open).

```
app/
  layout.tsx          ← receives @modal as a prop
  @modal/
    (.)photos/[id]/
      page.tsx        ← renders as modal when navigating from /photos
    default.tsx       ← returns null (no modal by default)
  photos/
    [id]/
      page.tsx        ← renders as full page on direct URL access or refresh
    page.tsx          ← photo grid
```

```typescript
// app/layout.tsx — parallel route slot as a prop
export default function RootLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <html>
      <body>
        {children}
        {modal} {/* renders modal content or null */}
      </body>
    </html>
  );
}

// app/@modal/(.)photos/[id]/page.tsx — intercepting route modal
import { Modal } from '@/components/modal';

export default function PhotoModal({ params }: { params: { id: string } }) {
  return (
    <Modal>
      <Photo id={params.id} />
    </Modal>
  );
}
```

## Details

Parallel routes and intercepting routes solve a specific UX problem: showing a resource at two different levels of UI (modal vs full page) depending on navigation context, while keeping the URL meaningful.

**Soft vs hard navigation:** When a user clicks a `<Link>` to `/photos/42` from within the app, Next.js performs a soft navigation and renders the intercepting route (`@modal/(.)photos/[id]`) inside the modal slot. When the user refreshes or navigates directly to `/photos/42`, Next.js performs a hard navigation and renders the actual `photos/[id]/page.tsx` as a full page. The URL is identical in both cases.

**`default.tsx` is mandatory:** Without `default.tsx` in each parallel slot, Next.js throws a 404 when a route renders but no matching slot exists. The default file specifies what to render in that slot when it has no active content.

**Slot naming:** Slot folder names (e.g., `@modal`, `@sidebar`, `@team`) become prop names in the parent layout. The `children` prop is equivalent to an implicit `@children` slot.

**Intercepting route notation:** `(.)` matches routes at the same route segment level (most common for modals). `(..)` goes one segment up. `(...)` matches from the app root. The notation mirrors relative filesystem path traversal.

**Trade-offs:** Parallel routes add directory nesting. Complex slot combinations can be hard to debug — use the Next.js DevTools panel to inspect active slots. Avoid over-using this pattern; simple state-based modals are sufficient when URL-sharing is not a requirement.

## Source

https://nextjs.org/docs/app/building-your-application/routing/parallel-routes
