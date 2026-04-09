# React 2026

> Modern React patterns for 2025-2026 including React 19, Compiler, and AI-integrated UI

## When to Use

- Starting a new React project in 2025 or later
- Upgrading an existing React 18 project to React 19
- Evaluating whether to adopt the React Compiler
- Building AI-powered UI features with streaming and progressive enhancement

## Instructions

**React 19 key changes:**

1. **React Compiler (beta to stable):** Automatically memoizes components. Remove manual `React.memo`, `useMemo`, `useCallback` where safe. Install `babel-plugin-react-compiler`.

2. **`use()` hook:** Read promises and context inside render — can be used conditionally:

   ```typescript
   function UserProfile({ userPromise }: { userPromise: Promise<User> }) {
     const user = use(userPromise); // suspends until resolved
     return <div>{user.name}</div>;
   }
   ```

3. **Server Actions:** Functions marked `'use server'` can be called from client components as async functions — replaces form submission API routes:

   ```typescript
   'use server';
   async function updateProfile(formData: FormData) {
     await db.users.update({ name: formData.get('name') });
   }
   ```

4. **`useFormStatus` and `useOptimistic`:** Built-in hooks for form state and optimistic UI updates.

5. **`ref` as prop:** No more `forwardRef` — pass `ref` directly as a regular prop in React 19.

## Details

**React Compiler adoption path:**

- Install: `npm install babel-plugin-react-compiler`
- Enable in Babel/Vite config
- Run `react-compiler-healthcheck` to identify files that need refactoring
- Remove manual memoization incrementally as you verify compiler output

**AI-integrated UI patterns:**

- Use `useOptimistic` for streaming AI responses
- Pair Server Actions with `startTransition` for non-blocking AI calls
- Stream AI output via the Vercel AI SDK (`useChat`, `useCompletion`) which wraps `ReadableStream` in React-friendly hooks
- Progressive enhancement: render static content server-side, enhance with streaming AI client-side

**React 19 migration notes:**

- `ReactDOM.render` removed — use `createRoot`
- `defaultProps` for function components removed — use default parameter values
- `string` refs removed — use callback refs or `useRef`
- Concurrent features now enabled by default with `createRoot`

**Forward compatibility:**

- Write components as async Server Components where possible — they compose forward into RSC-first architectures
- Prefer `use()` over `useEffect` + state for async data

## Source

https://patterns.dev/react/react-2026

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
