# Tailwind CSS Pattern

> Apply Tailwind CSS utility-first patterns for consistent, maintainable component styling

## When to Use

- Styling React components without writing custom CSS files
- Building consistent UIs using a design system constraint
- Rapid prototyping with immediate visual feedback
- Maintaining styles that are co-located with component markup

## Instructions

1. Apply utilities directly on elements. Group by concern: layout, spacing, typography, color, effects.
2. Extract repeated utility combinations into React components, not `@apply` directives. Components are the abstraction layer.
3. Use Tailwind's design tokens (spacing scale, color palette, typography scale) instead of arbitrary values.
4. When arbitrary values are needed, use bracket notation: `w-[calc(100%-2rem)]`, `bg-[#1a1a2e]`.
5. Order utilities consistently: layout > positioning > sizing > spacing > typography > color > effects > responsive > state.
6. Use `@apply` only in base layer styles (global resets, typography defaults), not in component styles.

```tsx
// Good — utilities grouped by concern
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="
      flex flex-col              /* layout */
      rounded-lg                 /* shape */
      p-6 gap-4                  /* spacing */
      bg-white shadow-md         /* visual */
      border border-gray-200     /* border */
      hover:shadow-lg            /* interaction */
      transition-shadow          /* animation */
    "
    >
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      <div className="text-sm text-gray-600">{children}</div>
    </div>
  );
}

// Component is the abstraction — reuse Card, not @apply
function FeatureCard({ feature }: { feature: Feature }) {
  return (
    <Card title={feature.name}>
      <p>{feature.description}</p>
      <Badge variant={feature.status}>{feature.status}</Badge>
    </Card>
  );
}
```

```tsx
// Using Tailwind's design tokens vs arbitrary values
// Prefer tokens
<div className="p-4 text-sm text-gray-700 rounded-md" />

// Use arbitrary only when tokens don't cover it
<div className="p-[18px] text-[13px] text-[#334155] rounded-[5px]" />
```

## Details

**Why utility-first works:** Every utility maps to one CSS property. You never need to name things. You never wonder where a style comes from — it is right on the element. Dead code elimination is automatic (unused utilities are purged).

**Tailwind v4 changes:** Tailwind v4 uses CSS-first configuration instead of `tailwind.config.js`. Theme values are defined in CSS with `@theme`:

```css
@import 'tailwindcss';

@theme {
  --color-primary: #3b82f6;
  --font-sans: 'Inter', sans-serif;
  --breakpoint-3xl: 1920px;
}
```

**Tailwind v3 config:**

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { 50: '#eff6ff', 500: '#3b82f6', 900: '#1e3a8a' },
      },
      spacing: { '18': '4.5rem' },
    },
  },
  plugins: [],
};

export default config;
```

**When to use @apply:** Almost never in components. Use it for:

- Base styles on `body`, `h1`-`h6`, `a` tags in a global stylesheet
- Third-party component overrides where you cannot add classes
- Prose/article content where utility classes are impractical

**Performance:** Tailwind's output is a single CSS file with only the utilities you use. Typical production size: 10-30 KB gzipped. No runtime cost.

## Source

https://tailwindcss.com/docs/utility-first
