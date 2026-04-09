# CSS Layout Patterns

> Build common layouts with Tailwind flexbox and grid utilities for dashboard, marketing, and app shells

## When to Use

- Building page layouts: sidebar + content, header + main + footer, holy grail
- Creating card grids, form layouts, and navigation bars
- Centering content horizontally and vertically
- Implementing sticky headers, fixed sidebars, and scrollable content areas

## Instructions

1. Use flexbox (`flex`) for one-dimensional layouts (rows or columns). Use grid (`grid`) for two-dimensional layouts.
2. Use `gap-*` for spacing between items instead of margin. It is consistent and does not add space to the outer edges.
3. Use `min-h-screen` on the root layout to ensure it fills the viewport.
4. Use `overflow-auto` on scrollable regions with fixed-height parents.
5. Use `sticky top-0` for elements that should stick during scroll.

```tsx
// App shell: sidebar + header + scrollable content
function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-gray-50">
      {/* Fixed sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <Logo />
        </div>
        <nav className="flex-1 overflow-y-auto p-4">
          <NavLinks />
        </nav>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Sticky header */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center px-6 shrink-0">
          <SearchBar />
          <UserMenu />
        </header>

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}

// Centered content (both axes)
function CenteredPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-8">{children}</div>
    </div>
  );
}

// Holy grail layout
function MarketingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-16 border-b flex items-center px-6">Header</header>
      <main className="flex-1 container mx-auto px-4 py-8">Content</main>
      <footer className="h-24 border-t flex items-center px-6">Footer</footer>
    </div>
  );
}

// Auto-fit card grid
function CardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-6">{children}</div>
  );
}

// Two-column form layout
function FormLayout() {
  return (
    <form className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
      <div className="space-y-1">
        <label className="text-sm font-medium">First Name</label>
        <input className="w-full border rounded-md px-3 py-2" />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">Last Name</label>
        <input className="w-full border rounded-md px-3 py-2" />
      </div>
      <div className="md:col-span-2 space-y-1">
        <label className="text-sm font-medium">Email</label>
        <input className="w-full border rounded-md px-3 py-2" type="email" />
      </div>
    </form>
  );
}
```

## Details

**Flexbox vs Grid decision:**

- **Flexbox:** Content determines size. Items flow in one direction. Good for navbars, button groups, card rows.
- **Grid:** Layout determines size. Items placed in both dimensions. Good for page layouts, card grids, dashboards.

**Common flexbox patterns:**

- `flex items-center justify-between` — space between with vertical centering (header, toolbar)
- `flex flex-col gap-4` — vertical stack with consistent gaps (form, sidebar)
- `flex flex-wrap gap-4` — wrapping row with gaps (tag list, button group)
- `flex-1` on a child — fill remaining space (main content area)

**Common grid patterns:**

- `grid grid-cols-3 gap-6` — fixed columns
- `grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))]` — responsive auto-fill
- `grid grid-cols-[200px_1fr]` — sidebar + content
- `grid grid-rows-[auto_1fr_auto]` — header + content + footer

**Sticky element gotchas:**

- `sticky` requires the parent to have scrollable overflow
- `sticky` does not work inside `overflow: hidden` containers
- Use `z-10` or similar on sticky elements to prevent content from overlapping

**The `container` utility:** Centers content with responsive max-widths. Configure in Tailwind:

```typescript
theme: {
  container: {
    center: true,
    padding: '1rem',
    screens: { '2xl': '1400px' },
  },
},
```

## Source

https://tailwindcss.com/docs/flex

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
