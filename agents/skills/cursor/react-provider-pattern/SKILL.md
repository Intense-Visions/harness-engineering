# React Provider Pattern

> Make data available to any component in the tree without prop drilling

## When to Use

- Multiple components at different nesting levels need the same data (theme, locale, current user, feature flags)
- Prop drilling through 3+ levels creates maintenance burden
- You want to decouple data consumers from data source location in the tree
- Building a reusable component library that needs implicit configuration

## Instructions

1. Create a context with `createContext`, providing a typed default value.
2. Create a Provider component that holds the state and wraps `Context.Provider`.
3. Export a `useXxx()` hook that calls `useContext` and throws if used outside the Provider.
4. Wrap the relevant subtree (or the entire app) with the Provider.
5. Any component in the subtree can consume via the hook — no prop threading required.

```typescript
interface ThemeContextValue { theme: 'light' | 'dark'; toggle: () => void }

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  return (
    <ThemeContext.Provider value={{ theme, toggle: () => setTheme((t) => t === 'light' ? 'dark' : 'light') }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
```

## Details

The Provider Pattern is React's built-in dependency injection mechanism. It solves prop drilling — the antipattern of threading props through intermediate components that do not use them.

**Performance consideration:** Every component that calls `useContext` re-renders when the context value changes. For high-frequency updates, split contexts by concern (do not put both `user` and `notifications` in the same context) or use a state management library with selector support.

**Context vs state management:**

- Context is built-in and appropriate for low-frequency global data (theme, locale, auth)
- For high-frequency or complex derived state, prefer Zustand, Jotai, or Redux Toolkit

**Null safety pattern:** Passing `null` as default to `createContext` and throwing in the hook (`if (!ctx) throw new Error(...)`) gives better error messages than silent `undefined` access failures.

## Source

https://patterns.dev/react/provider-pattern
