# Tailwind Merge

> Resolve Tailwind class conflicts intelligently with tailwind-merge for safe className composition and overrides

## When to Use

- Components that accept a `className` prop for consumer overrides
- Merging base styles with conditional styles without conflicts
- Building reusable components where `px-4` should be overridable by `px-8`
- Any situation where two Tailwind classes conflict (e.g., `text-red-500` and `text-blue-500`)

## Instructions

1. Install `tailwind-merge` and `clsx`: `npm install tailwind-merge clsx`.
2. Create a `cn()` utility that combines both. Use it everywhere instead of raw `className` concatenation.
3. The last conflicting class wins. `cn('px-4', 'px-8')` outputs `px-8`, not `px-4 px-8`.
4. `tailwind-merge` understands Tailwind's class groups — it knows `p-4` and `px-4` conflict partially, `text-red-500` and `text-blue-500` conflict fully.
5. Use `cn()` in all component className props to allow safe overrides.

```typescript
// lib/utils.ts — the cn() helper
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

```tsx
// Component that supports className overrides
function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-lg border border-gray-200 bg-white p-6 shadow-sm', // defaults
        className // consumer can override any of these
      )}
    >
      {children}
    </div>
  );
}

// Usage — override padding and remove shadow
<Card className="p-4 shadow-none">Compact card</Card>;
// Output: "rounded-lg border border-gray-200 bg-white p-4"
// p-6 was replaced by p-4, shadow-sm was replaced by shadow-none
```

```tsx
// Conditional classes with cn()
function Alert({ variant, className }: { variant: 'info' | 'error'; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-md p-4 text-sm',
        variant === 'info' && 'bg-blue-50 text-blue-700 border-blue-200',
        variant === 'error' && 'bg-red-50 text-red-700 border-red-200',
        className
      )}
    ></div>
  );
}

// Override just the background
<Alert variant="info" className="bg-blue-100" />;
// bg-blue-50 is replaced by bg-blue-100, text and border unchanged
```

## Details

**Why not just string concatenation?** CSS specificity is not determined by class order — `class="px-4 px-8"` applies whichever rule comes last in the stylesheet, which depends on Tailwind's generated order, not your class string order. `tailwind-merge` resolves this by removing the conflicting class.

**What tailwind-merge knows:**

- `p-4` and `px-8` conflict on the x-axis padding (px-8 wins for x, p-4 applies to y)
- `text-red-500` and `text-blue-500` conflict (same property: color)
- `text-lg` and `text-red-500` do NOT conflict (font-size vs color)
- `rounded-lg` and `rounded-none` conflict (border-radius)
- `hover:bg-red-500` and `hover:bg-blue-500` conflict (same pseudo + property)

**clsx role in cn():** `clsx` handles conditional logic (booleans, arrays, objects). `twMerge` handles conflict resolution. Together:

```typescript
cn(
  'base-class', // always applied
  isActive && 'bg-blue-500', // conditional (clsx)
  { 'font-bold': isBold }, // object syntax (clsx)
  className // override (twMerge resolves conflicts)
);
```

**Custom tailwind-merge config:** If you extended Tailwind with custom utilities, tell tailwind-merge about them:

```typescript
import { extendTailwindMerge } from 'tailwind-merge';

const customTwMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'custom-size': ['size-sm', 'size-md', 'size-lg'],
    },
  },
});
```

**Performance:** `tailwind-merge` caches results. The first call for a given input is ~0.1ms; subsequent calls are ~0.001ms. No measurable impact on render performance.

## Source

https://github.com/dcastil/tailwind-merge

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
