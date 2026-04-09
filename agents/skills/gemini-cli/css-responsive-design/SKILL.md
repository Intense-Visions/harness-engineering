# Responsive Design with Tailwind

> Build responsive layouts with Tailwind's mobile-first breakpoints, container queries, and fluid typography

## When to Use

- Adapting layouts for mobile, tablet, and desktop screens
- Building components that respond to their container size (not just viewport)
- Creating fluid typography that scales smoothly between breakpoints
- Showing/hiding elements based on screen size

## Instructions

1. Design mobile-first: write base styles for mobile, then add breakpoint prefixes for larger screens.
2. Tailwind breakpoints are min-width: `sm:` means "640px and above", not "only small screens".
3. Use container queries (`@container`) for components that should respond to their parent's width, not the viewport.
4. Prefer fluid layouts (flex, grid, percentages) over fixed breakpoint-based layouts.
5. Test at actual device widths, not just breakpoints (320px, 375px, 414px for phones; 768px, 1024px for tablets).
6. Use `max-*:` prefix for max-width queries when you need to target only small screens.

```tsx
// Mobile-first responsive card grid
function ProductGrid({ products }: { products: Product[] }) {
  return (
    <div
      className="
      grid gap-4
      grid-cols-1            /* mobile: single column */
      sm:grid-cols-2         /* 640px+: two columns */
      lg:grid-cols-3         /* 1024px+: three columns */
      xl:grid-cols-4         /* 1280px+: four columns */
    "
    >
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}

// Responsive navigation
function Header() {
  return (
    <header className="flex items-center justify-between p-4">
      <Logo />
      {/* Hidden on mobile, visible on desktop */}
      <nav className="hidden md:flex gap-6">
        <NavLink href="/features">Features</NavLink>
        <NavLink href="/pricing">Pricing</NavLink>
      </nav>
      {/* Visible on mobile, hidden on desktop */}
      <MobileMenuButton className="md:hidden" />
    </header>
  );
}

// Responsive typography and spacing
function Hero() {
  return (
    <section
      className="
      px-4 py-12          /* mobile spacing */
      md:px-8 md:py-20    /* tablet spacing */
      lg:px-16 lg:py-32   /* desktop spacing */
    "
    >
      <h1
        className="
        text-3xl            /* mobile: 30px */
        md:text-5xl         /* tablet: 48px */
        lg:text-6xl         /* desktop: 60px */
        font-bold leading-tight
      "
      >
        Ship faster with confidence
      </h1>
    </section>
  );
}
```

## Details

**Tailwind breakpoints (default):**

| Prefix | Min-width | Typical target           |
| ------ | --------- | ------------------------ |
| `sm:`  | 640px     | Large phones (landscape) |
| `md:`  | 768px     | Tablets                  |
| `lg:`  | 1024px    | Small laptops            |
| `xl:`  | 1280px    | Desktops                 |
| `2xl:` | 1536px    | Large desktops           |

**Container queries** (Tailwind v3.3+):

```tsx
// The component adapts to its container width, not the viewport
function Sidebar({ children }: { children: React.ReactNode }) {
  return (
    <div className="@container">
      <div
        className="
        flex flex-col gap-2
        @md:flex-row @md:gap-4    /* when container is 448px+ */
        @lg:gap-6                  /* when container is 512px+ */
      "
      >
        {children}
      </div>
    </div>
  );
}
```

**Fluid typography** (clamp-based):

```typescript
// tailwind.config.ts
extend: {
  fontSize: {
    fluid: ['clamp(1rem, 0.5rem + 1.5vw, 1.5rem)', { lineHeight: '1.5' }],
    'fluid-lg': ['clamp(1.5rem, 1rem + 2vw, 3rem)', { lineHeight: '1.2' }],
  },
},
```

**Max-width queries** (Tailwind v3.2+):

```tsx
// Target ONLY mobile
<div className="max-md:text-center max-md:px-4">
  Only centered with extra padding on screens below 768px
</div>
```

**Common mistakes:**

- Writing desktop-first styles then overriding for mobile (reverse of how Tailwind works)
- Using `hidden` without a breakpoint visibility pair (content is lost)
- Fixed widths that break on small screens (`w-96` on mobile)
- Not testing between breakpoints (360px-639px range is critical)

## Source

https://tailwindcss.com/docs/responsive-design

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
