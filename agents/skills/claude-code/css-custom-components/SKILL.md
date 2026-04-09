# Custom Styled Components

> Build reusable styled components with Tailwind, CVA variants, and polymorphic prop patterns

## When to Use

- Creating a component library or design system with Tailwind
- Building components that need variant props AND className overrides
- Making components that can render as different HTML elements (`as` prop)
- Structuring a `components/ui/` directory following shadcn/ui patterns

## Instructions

1. Combine CVA (variants) + cn (merge) + forwardRef (DOM access) for every shared component.
2. Extend the native HTML element's props so consumers can pass any valid attribute.
3. Always accept and merge `className` so consumers can override styles.
4. Use `React.forwardRef` for components that wrap native elements (needed for Radix, tooltips, focus management).
5. Export both the component and its variant function for reuse.
6. Support the `asChild` pattern (via Radix's `Slot`) for polymorphic rendering.

```tsx
// components/ui/button.tsx — complete production pattern
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-white hover:bg-destructive/90',
        outline: 'border border-border bg-background hover:bg-muted/50',
        secondary: 'bg-muted/30 text-foreground hover:bg-muted/50',
        ghost: 'hover:bg-muted/50',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
```

```tsx
// Usage
<Button>Default</Button>
<Button variant="destructive" size="lg">Delete</Button>
<Button variant="ghost" className="w-full">Full Width Ghost</Button>

{/* asChild — renders as a link, not a button */}
<Button asChild variant="link">
  <a href="/docs">Documentation</a>
</Button>
```

```tsx
// components/ui/input.tsx — simple styled wrapper
import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm ring-offset-background',
          'file:border-0 file:bg-transparent file:text-sm file:font-medium',
          'placeholder:text-muted',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
```

## Details

**The asChild pattern:** Instead of an `as` prop (which breaks TypeScript), `asChild` uses Radix's `Slot` component to merge props onto the child element. The Button renders as whatever element is its child:

```tsx
<Button asChild>
  <Link href="/dashboard">Go to Dashboard</Link>
</Button>
// Renders as <a> with all Button styles + Link behavior
```

**Component file structure:**

```
components/
  ui/
    button.tsx      # CVA + forwardRef + cn
    input.tsx       # forwardRef + cn
    dialog.tsx      # Radix Dialog + Tailwind
    card.tsx        # Compound component (Card, CardHeader, CardContent, CardFooter)
```

**Compound components:**

```tsx
function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border bg-card shadow-sm', className)} {...props} />;
}

function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />;
}

function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-6 pt-0', className)} {...props} />;
}

export { Card, CardHeader, CardContent };
```

**Rules for component APIs:**

- Always extend the native element's HTML attributes
- Always accept and merge `className`
- Always use `forwardRef` for DOM elements
- Use CVA for multi-variant components
- Use simple `cn()` for single-style components

## Source

https://ui.shadcn.com/docs

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
