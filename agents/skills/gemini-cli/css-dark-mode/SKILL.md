# Dark Mode with Tailwind

> Implement dark mode with Tailwind's dark variant, CSS custom properties, and user preference detection

## When to Use

- Adding dark mode to an existing Tailwind application
- Supporting system preference detection and manual theme switching
- Using CSS variables so that one set of utilities works in both themes
- Persisting the user's theme choice across sessions

## Instructions

1. Choose a strategy: `class` (manual toggle via `.dark` class on `<html>`) or `media` (follows OS preference). Use `class` for manual control.
2. Define color tokens as CSS variables with light and dark values. Use Tailwind's `dark:` prefix for overrides.
3. Prefer the CSS variable approach over per-element `dark:` classes — it scales better with many components.
4. Detect the user's preference with `window.matchMedia('(prefers-color-scheme: dark)')`. Store their choice in localStorage.
5. Apply the theme class before first paint to prevent flash of wrong theme (FOWT).

```typescript
// tailwind.config.ts
const config: Config = {
  darkMode: 'class', // Enable class-based dark mode
  // ...
};
```

```css
/* styles/globals.css */
@layer base {
  :root {
    --background: 255 255 255;
    --foreground: 17 24 39;
    --card: 249 250 251;
    --primary: 59 130 246;
    --muted: 107 114 128;
    --border: 229 231 235;
  }

  .dark {
    --background: 15 23 42;
    --foreground: 248 250 252;
    --card: 30 41 59;
    --primary: 96 165 250;
    --muted: 148 163 184;
    --border: 51 65 85;
  }
}
```

```typescript
// hooks/use-theme.ts
import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'system';
    return (localStorage.getItem('theme') as Theme) ?? 'system';
  });

  useEffect(() => {
    const root = document.documentElement;

    function applyTheme(t: Theme) {
      if (t === 'system') {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        root.classList.toggle('dark', isDark);
      } else {
        root.classList.toggle('dark', t === 'dark');
      }
    }

    applyTheme(theme);

    // Listen for OS preference changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (theme === 'system') applyTheme('system');
    };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    localStorage.setItem('theme', t);
  };

  return { theme, setTheme };
}
```

```tsx
// Prevent flash of wrong theme — add to <head> in your HTML/layout
<script
  dangerouslySetInnerHTML={{
    __html: `
  (function() {
    var theme = localStorage.getItem('theme');
    if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    }
  })();
`,
  }}
/>
```

## Details

**CSS variable approach vs `dark:` prefix:**

```tsx
// Per-element dark: classes (verbose, repetitive)
<div className="bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-700">

// CSS variable approach (clean, DRY)
<div className="bg-background text-foreground border-border">
// Colors switch automatically via CSS variables
```

**Approach comparison:**

- **`dark:` prefix:** Simple, no CSS variables needed. Gets verbose with many elements.
- **CSS variables:** Define once, works everywhere. Best for design systems with many components.
- **Both:** Use CSS variables for common patterns, `dark:` for one-off overrides.

**Next.js with next-themes:**

```tsx
import { ThemeProvider } from 'next-themes';

function App({ children }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
    </ThemeProvider>
  );
}
```

**Images and dark mode:** Provide dark-mode variants for images, or use CSS filters:

```tsx
<img className="dark:invert dark:brightness-90" src="/logo.svg" alt="Logo" />
// Or use next/image with dark mode source
```

**Testing dark mode:** In browser DevTools, toggle the `dark` class on `<html>`. Or use DevTools > Rendering > Emulate CSS media feature `prefers-color-scheme: dark`.

## Source

https://tailwindcss.com/docs/dark-mode
