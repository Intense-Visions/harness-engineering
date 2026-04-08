# CSS Modules

> Scope CSS to components with CSS Modules for collision-free class names and co-located styles

## When to Use

- Writing traditional CSS but needing guaranteed scoped class names
- Projects that prefer CSS files over utility classes
- Combining with Tailwind for component-specific styles that utilities cannot express
- Next.js or Vite projects where CSS Modules work out of the box

## Instructions

1. Name files with `.module.css` suffix: `Button.module.css`. The bundler generates unique class names.
2. Import styles as an object: `import styles from './Button.module.css'`.
3. Apply classes via the styles object: `className={styles.button}`.
4. Use `composes` to inherit styles from other classes or modules.
5. For dynamic classes, use bracket notation: `styles[variant]`.
6. CSS Modules are locally scoped by default. Use `:global(.class)` to escape scoping.

```css
/* Button.module.css */
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  font-weight: 500;
  transition: all 0.2s;
}

.primary {
  composes: button;
  background-color: var(--color-primary);
  color: white;
}

.primary:hover {
  filter: brightness(1.1);
}

.secondary {
  composes: button;
  background-color: var(--color-gray-100);
  color: var(--color-gray-900);
}

.large {
  padding: 0.75rem 1.5rem;
  font-size: 1.125rem;
}

.fullWidth {
  width: 100%;
}
```

```tsx
// Button.tsx
import styles from './Button.module.css';
import clsx from 'clsx';

interface ButtonProps {
  variant?: 'primary' | 'secondary';
  size?: 'default' | 'large';
  fullWidth?: boolean;
  children: React.ReactNode;
}

function Button({ variant = 'primary', size = 'default', fullWidth, children }: ButtonProps) {
  return (
    <button
      className={clsx(
        styles[variant],
        size === 'large' && styles.large,
        fullWidth && styles.fullWidth
      )}
    >
      {children}
    </button>
  );
}
```

## Details

**How it works:** The bundler (Webpack, Vite, Next.js) transforms class names from `.button` to `.Button_button_a1b2c` (component name + class name + hash). This guarantees no collisions between components.

**TypeScript support:** Generate type declarations for CSS Modules:

```bash
# typed-css-modules
npm install -D typed-css-modules
tcm src/

# Or use the Vite plugin
npm install -D vite-plugin-css-modules-typescript
```

This creates `.module.css.d.ts` files:

```typescript
// Button.module.css.d.ts
declare const styles: {
  readonly button: string;
  readonly primary: string;
  readonly secondary: string;
  readonly large: string;
  readonly fullWidth: string;
};
export default styles;
```

**composes keyword:** Inherit styles from other classes:

```css
.base {
  padding: 1rem;
  border-radius: 0.5rem;
}
.error {
  composes: base;
  border: 2px solid red;
}
/* .error gets both base and error styles */

/* Compose from another module */
.card {
  composes: surface from './shared.module.css';
}
```

**:global escape hatch:** Apply a class globally (useful for overriding library styles):

```css
.wrapper :global(.third-party-class) {
  color: red;
}
```

**CSS Modules + Tailwind:** Use CSS Modules for complex styles and Tailwind for utilities:

```tsx
<div className={clsx(styles.card, 'p-4 flex gap-2')}>
```

**When to use CSS Modules vs Tailwind:** CSS Modules are better for complex pseudo-selectors, animations with many keyframes, and teams that prefer traditional CSS. Tailwind is better for rapid iteration and design consistency.

## Source

https://github.com/css-modules/css-modules
