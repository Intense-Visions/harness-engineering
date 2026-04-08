# React Context Pattern

> Manage shared state with React Context and useReducer for prop-drilling avoidance and scoped state

## When to Use

- Sharing state across a component subtree without passing props through intermediate components
- Theme, locale, auth, or feature flag state that many components read but rarely changes
- Scoped state that should reset when a part of the tree unmounts
- Small applications where adding Zustand/Jotai/Redux is unnecessary overhead

## Instructions

1. Create a context with `createContext`. Provide a meaningful default or `null` with a type assertion.
2. Create a Provider component that encapsulates state logic (useState or useReducer) and passes values via `value`.
3. Create a custom hook (`useAuth`, `useTheme`) that calls `useContext` and throws if used outside the Provider.
4. Split context into two: one for state, one for dispatch/actions. This prevents components that only dispatch from re-rendering on state changes.
5. Memoize the context value with `useMemo` to prevent unnecessary re-renders of consumers.
6. Keep context values small and stable — large objects that change frequently cause all consumers to re-render.

```typescript
// contexts/auth-context.tsx
import { createContext, useContext, useReducer, useMemo, ReactNode } from 'react';

interface User { id: string; name: string; }

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
}

type AuthAction =
  | { type: 'LOGIN'; user: User }
  | { type: 'LOGOUT' };

type AuthDispatch = (action: AuthAction) => void;

const AuthStateContext = createContext<AuthState | null>(null);
const AuthDispatchContext = createContext<AuthDispatch | null>(null);

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'LOGIN':
      return { user: action.user, isAuthenticated: true };
    case 'LOGOUT':
      return { user: null, isAuthenticated: false };
    default:
      return state;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, {
    user: null,
    isAuthenticated: false,
  });

  // Memoize to prevent re-renders when AuthProvider's parent re-renders
  const stateValue = useMemo(() => state, [state]);

  return (
    <AuthStateContext.Provider value={stateValue}>
      <AuthDispatchContext.Provider value={dispatch}>
        {children}
      </AuthDispatchContext.Provider>
    </AuthStateContext.Provider>
  );
}

export function useAuthState(): AuthState {
  const context = useContext(AuthStateContext);
  if (!context) throw new Error('useAuthState must be used within AuthProvider');
  return context;
}

export function useAuthDispatch(): AuthDispatch {
  const context = useContext(AuthDispatchContext);
  if (!context) throw new Error('useAuthDispatch must be used within AuthProvider');
  return context;
}
```

```typescript
// Usage
function LoginButton() {
  const dispatch = useAuthDispatch(); // Does NOT re-render when auth state changes
  return <button onClick={() => dispatch({ type: 'LOGIN', user: { id: '1', name: 'Alice' } })}>Login</button>;
}

function UserBadge() {
  const { user } = useAuthState(); // Re-renders when auth state changes
  return user ? <span>{user.name}</span> : null;
}
```

## Details

**Why split state and dispatch contexts:** When the context value is `{ state, dispatch }`, every consumer re-renders when state changes — even components that only call dispatch. Separate contexts solve this.

**Context vs external state libraries:**

- Context re-renders ALL consumers when the value changes — no selector mechanism
- Context is scoped to a subtree — external stores are global
- Context requires no extra dependencies — it is built into React
- Context is best for low-frequency updates (auth, theme). For high-frequency updates (forms, animations), use Zustand or Jotai

**useReducer vs useState:** Use `useReducer` when state has multiple sub-values, when the next state depends on the previous state, or when you want to decouple state logic from the Provider component.

**Performance optimization:** For large subtrees, wrap children in `React.memo` or use the split-context pattern. For truly high-performance needs, switch to an external store.

**Testing:**

```typescript
function renderWithAuth(ui: ReactNode, initialState?: Partial<AuthState>) {
  return render(<AuthProvider>{ui}</AuthProvider>);
}
```

**Common mistakes:**

- Putting too much in context (entire app state) — this defeats React's component-level rendering model
- Creating context with an empty object default (`createContext({})`) — hides bugs where the provider is missing
- Not memoizing the context value — a new object on every render causes all consumers to re-render

## Source

https://react.dev/learn/passing-data-deeply-with-context
