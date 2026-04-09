# Component Variants with CVA

> Build type-safe component variants with class-variance-authority for consistent, composable styling APIs

## When to Use

- Components with multiple visual variants (size, color, shape)
- Building a design system with enforced variant combinations
- Replacing complex conditional className logic with declarative APIs
- Wanting TypeScript autocompletion and validation for component style props

## Instructions

1. Install `class-variance-authority`: `npm install class-variance-authority`.
2. Define variants with `cva()` — base classes first, then variant definitions.
3. Use `defaultVariants` to avoid requiring every prop.
4. Use `compoundVariants` for styles that apply only when specific variant combinations are active.
5. Extract the variant props type with `VariantProps<typeof variantFn>` for TypeScript.
6. Combine with `tailwind-merge` (via `cn()` helper) to allow className overrides.

```typescript
// components/button.tsx
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  // Base styles — always applied
  'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500',
        secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 focus-visible:ring-gray-500',
        destructive: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500',
        ghost: 'hover:bg-gray-100 hover:text-gray-900',
        link: 'text-blue-600 underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    compoundVariants: [
      // Ghost + sm gets tighter padding
      { variant: 'ghost', size: 'sm', className: 'px-2' },
    ],
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
```

```typescript
// Usage
<Button>Default Primary Medium</Button>
<Button variant="destructive" size="lg">Delete Account</Button>
<Button variant="ghost" size="sm">Cancel</Button>
<Button className="w-full">Full Width Override</Button>
```

## Details

**The cn() helper** combines `clsx` and `tailwind-merge` for safe class merging:

```typescript
// lib/utils.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

**Why cva over conditional strings:** Without cva:

```typescript
// Messy, error-prone, no type safety
className={`btn ${variant === 'primary' ? 'bg-blue-600 text-white' : ''} ${variant === 'secondary' ? 'bg-gray-100' : ''} ${size === 'lg' ? 'h-12 px-6' : 'h-10 px-4'}`}
```

**compoundVariants:** Apply classes only when a specific combination of variants is active. Useful for design exceptions:

```typescript
compoundVariants: [
  { variant: 'primary', size: 'lg', className: 'text-lg font-bold' },
  { variant: 'destructive', size: 'sm', className: 'font-bold' },
],
```

**Extending variants:** If a component wraps another, extend its variants:

```typescript
const alertVariants = cva('rounded-lg p-4 border', {
  variants: {
    severity: {
      info: 'bg-blue-50 border-blue-200 text-blue-800',
      warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
      error: 'bg-red-50 border-red-200 text-red-800',
    },
  },
  defaultVariants: { severity: 'info' },
});
```

**shadcn/ui pattern:** shadcn/ui uses this exact pattern (cva + cn + VariantProps) for all components. If you are building a component library, this is the industry standard approach.

## Source

https://cva.style/docs

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
