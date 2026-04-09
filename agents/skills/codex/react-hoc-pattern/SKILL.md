# React HOC Pattern

> Extend component behavior by wrapping in a higher-order component

## When to Use

- Adding cross-cutting concerns (logging, authentication gating, analytics) to multiple components without modifying each
- Working with class components that cannot use hooks
- Integrating with third-party libraries that use HOC APIs (Redux `connect`, React Router `withRouter`)
- You want to enhance a component's props without the consumer being aware of the enhancement

## Instructions

1. Create a function that accepts a component and returns a new component.
2. The wrapper component renders the wrapped component, forwarding all props.
3. Add the enhancement (extra props, lifecycle behavior, conditional rendering) in the wrapper.
4. Name the HOC `with<Behavior>` by convention.
5. Forward refs using `React.forwardRef` if the wrapped component uses refs.
6. Set `displayName` on the HOC result for debugging: `WrappedComponent.displayName = \`withAuth(\${Component.displayName})\``.

```typescript
function withAuthentication<P extends object>(
  WrappedComponent: React.ComponentType<P>
) {
  const WithAuth = (props: P) => {
    const { isAuthenticated } = useAuth();
    if (!isAuthenticated) return <Redirect to="/login" />;
    return <WrappedComponent {...props} />;
  };
  WithAuth.displayName = `withAuthentication(${WrappedComponent.displayName ?? WrappedComponent.name})`;
  return WithAuth;
}
```

## Details

HOCs are a functional composition pattern borrowed from functional programming. They were the primary code-reuse mechanism before hooks.

**When to prefer hooks over HOCs:**

- Hooks are simpler, avoid prop name collisions, and are easier to type in TypeScript
- "Wrapper hell" — stacking multiple HOCs creates deeply nested component trees in DevTools
- HOC prop injection can clash if two HOCs inject the same prop name

**Valid HOC use cases in modern React:**

- HOC-based library APIs (Redux, styled-components `withTheme`)
- Class components that cannot use hooks
- Performance optimization with `React.memo` and custom comparison

**TypeScript note:** HOC generic typing requires careful handling of `ComponentProps` and `Omit` to correctly type the enhanced component's props.

## Source

https://patterns.dev/react/hoc-pattern

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
