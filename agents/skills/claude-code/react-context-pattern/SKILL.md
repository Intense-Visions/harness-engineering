# React Context Pattern

> Share state across the component tree without prop drilling using React Context

## When to Use

- Theme, locale, current user, or feature flags need to be accessible throughout the app
- Prop drilling through 3+ intermediate components that do not use the data
- State that changes infrequently (avoid for high-frequency updates without optimization)
- Building component libraries that need implicit configuration

## Instructions

1. Create a typed context with `createContext`:
   ```typescript
   interface AuthContextValue {
     user: User | null;
     signOut: () => void;
   }
   const AuthContext = createContext<AuthContextValue | null>(null);
   ```
2. Create a Provider component that holds the state:
   ```typescript
   export function AuthProvider({ children }: { children: React.ReactNode }) {
     const [user, setUser] = useState<User | null>(null);
     return (
       <AuthContext.Provider value={{ user, signOut: () => setUser(null) }}>
         {children}
       </AuthContext.Provider>
     );
   }
   ```
3. Create a safe consumer hook that throws when used outside the provider:
   ```typescript
   export function useAuth(): AuthContextValue {
     const ctx = useContext(AuthContext);
     if (!ctx) throw new Error('useAuth must be used within AuthProvider');
     return ctx;
   }
   ```
4. Place the provider at the appropriate level in the tree (app root, route boundary, or feature boundary).

## Details

Context provides a mechanism for passing values through the component tree without prop drilling. It is not a replacement for state management — it is a mechanism for making existing state accessible.

**Performance:** All consumers of a context re-render when the context value changes. Split contexts by update frequency: `{ theme, toggleTheme }` in one context, `{ user, signOut }` in another.

**Context vs prop drilling vs state management:**

- Prop drilling: explicit, easy to trace, burdensome for deep trees
- Context: implicit, harder to trace, good for cross-cutting concerns
- State management (Zustand/Redux): explicit subscriptions, selectors, derived state

**React 19:** `use(Context)` can be called conditionally and inside `if` blocks, unlike `useContext`. Equivalent behavior, more flexibility.

## Source

https://patterns.dev/react/context-pattern

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
