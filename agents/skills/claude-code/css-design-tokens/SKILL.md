# CSS Design Tokens

> Define and manage design tokens for colors, spacing, typography, and effects in Tailwind CSS

## When to Use

- Establishing a consistent design system across an application
- Mapping brand colors, spacing scales, and typography to Tailwind utilities
- Supporting multiple themes (light/dark, brand variants) via CSS variables
- Bridging design tool tokens (Figma) to code

## Instructions

1. Define tokens as CSS custom properties in your global stylesheet. Reference them in Tailwind config.
2. Use semantic token names (`--color-primary`, `--color-surface`) instead of absolute names (`--blue-500`).
3. Extend Tailwind's theme in `tailwind.config.ts` to map tokens to utility classes.
4. Use CSS variables for values that change at runtime (theme switching). Use static config for values that never change.
5. Structure tokens in layers: primitive (raw values), semantic (purpose-based aliases), component (component-specific).

```css
/* styles/tokens.css — primitive + semantic layers */
@layer base {
  :root {
    /* Primitive tokens — raw values */
    --blue-50: 239 246 255;
    --blue-500: 59 130 246;
    --blue-900: 30 58 138;
    --gray-50: 249 250 251;
    --gray-900: 17 24 39;
    --radius-sm: 0.25rem;
    --radius-md: 0.375rem;
    --radius-lg: 0.5rem;

    /* Semantic tokens — map to purpose */
    --color-primary: var(--blue-500);
    --color-primary-foreground: 255 255 255;
    --color-background: var(--gray-50);
    --color-foreground: var(--gray-900);
    --color-muted: 107 114 128;
    --color-border: 229 231 235;
    --color-destructive: 239 68 68;
    --radius-default: var(--radius-md);
  }

  .dark {
    --color-primary: var(--blue-500);
    --color-primary-foreground: 255 255 255;
    --color-background: 15 23 42;
    --color-foreground: 248 250 252;
    --color-muted: 148 163 184;
    --color-border: 51 65 85;
  }
}
```

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'rgb(var(--color-primary) / <alpha-value>)',
          foreground: 'rgb(var(--color-primary-foreground) / <alpha-value>)',
        },
        background: 'rgb(var(--color-background) / <alpha-value>)',
        foreground: 'rgb(var(--color-foreground) / <alpha-value>)',
        muted: 'rgb(var(--color-muted) / <alpha-value>)',
        border: 'rgb(var(--color-border) / <alpha-value>)',
        destructive: 'rgb(var(--color-destructive) / <alpha-value>)',
      },
      borderRadius: {
        DEFAULT: 'var(--radius-default)',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
      },
    },
  },
};

export default config;
```

```tsx
// Usage — semantic utilities
<div className="bg-background text-foreground border-border rounded p-4">
  <h1 className="text-primary">Welcome</h1>
  <button className="bg-primary text-primary-foreground rounded px-4 py-2">Get Started</button>
</div>
// These utilities automatically adapt to light/dark theme via CSS variables
```

## Details

**RGB channel pattern:** Store colors as space-separated RGB channels (`59 130 246`) instead of full values (`#3b82f6`). This enables Tailwind's opacity modifier: `bg-primary/50` generates `rgba(59, 130, 246, 0.5)`.

**Tailwind v4 tokens:** In v4, tokens are defined directly in CSS with `@theme`:

```css
@import 'tailwindcss';

@theme {
  --color-primary: oklch(0.6 0.2 260);
  --color-surface: oklch(0.98 0 0);
  --spacing-18: 4.5rem;
  --font-display: 'Cal Sans', sans-serif;
}
```

**Token hierarchy:**

1. **Primitive:** `--blue-500: 59 130 246` — raw color, never used directly in components
2. **Semantic:** `--color-primary: var(--blue-500)` — purpose-based, used in utilities
3. **Component:** `--button-bg: var(--color-primary)` — optional, for complex component theming

**Figma-to-code workflow:** Export tokens from Figma (via Tokens Studio or Style Dictionary), generate CSS variables, import into your token stylesheet. Changes propagate automatically through the semantic layer.

**Typography tokens:**

```typescript
extend: {
  fontFamily: {
    sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
    mono: ['var(--font-mono)', 'monospace'],
  },
  fontSize: {
    'display': ['3.5rem', { lineHeight: '1.1', fontWeight: '700' }],
    'heading': ['2rem', { lineHeight: '1.25', fontWeight: '600' }],
  },
},
```

## Source

https://tailwindcss.com/docs/theme
