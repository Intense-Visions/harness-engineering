# Next.js Server Actions

> Mutate server-side data directly from components using async functions — no API route required

## When to Use

- Submitting forms that create, update, or delete data
- Implementing progressive enhancement (forms that work without JavaScript)
- Replacing simple API routes that only handle POST mutations
- Executing server-side logic triggered by user interaction in a Server or Client Component
- Managing pending state and validation errors for form submissions

## Instructions

1. Declare a Server Action by adding `'use server'` at the top of an async function or at the top of a module containing only server functions.
2. Use Server Actions directly in `<form action={myAction}>` for progressive enhancement — the form works without JavaScript.
3. Use `useFormStatus()` from `react-dom` inside a child component to access pending state during form submission.
4. Use `useFormState()` (renamed to `useActionState()` in React 19) to capture the return value of a Server Action and display validation errors.
5. Always validate inputs on the server — never trust client-supplied data even when using TypeScript.
6. Return structured error objects from Server Actions rather than throwing — thrown errors reach the nearest error boundary.
7. Call `revalidatePath()` or `revalidateTag()` after mutations to purge stale cached data.
8. Use Server Actions in Client Components by importing them — the function reference is serialized as a server reference, not executed client-side.
9. Never expose sensitive business logic in the action's return value — only return what the UI needs.

```typescript
// app/actions/create-post.ts
'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

const schema = z.object({ title: z.string().min(1).max(200) });

export async function createPost(prevState: unknown, formData: FormData) {
  const parsed = schema.safeParse({ title: formData.get('title') });
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }
  await db.post.create({ data: { title: parsed.data.title } });
  revalidatePath('/posts');
  return { errors: null };
}

// app/posts/new/page.tsx
'use client';
import { useFormState, useFormStatus } from 'react-dom';
import { createPost } from '@/app/actions/create-post';

function SubmitButton() {
  const { pending } = useFormStatus();
  return <button disabled={pending}>{pending ? 'Saving...' : 'Save'}</button>;
}

export default function NewPostPage() {
  const [state, action] = useFormState(createPost, null);
  return (
    <form action={action}>
      <input name="title" />
      {state?.errors?.title && <p>{state.errors.title}</p>}
      <SubmitButton />
    </form>
  );
}
```

## Details

Server Actions compile to POST requests under the hood — Next.js generates a unique action ID and routes the request to the server function at runtime. This means they work in environments without JavaScript (progressive enhancement) and do not require a separate API endpoint.

**Progressive enhancement:** When a `<form action={serverAction}>` is rendered, the native HTML form submission triggers the Server Action even if client-side JS has not loaded. Enhance the experience with `useFormStatus` only after hydration.

**Revalidation:** After a mutation, the Data Cache and Full Route Cache entries for affected paths remain stale until explicitly invalidated. Call `revalidatePath('/path')` to purge by route or `revalidateTag('tag')` to purge by cache tag — both are imported from `next/cache`.

**Error handling:** Throwing inside a Server Action propagates the error to the nearest React error boundary. For user-facing validation errors, return a structured error object from the action instead of throwing.

**Security:** Server Actions are POST endpoints — they are subject to CSRF by nature (cookies are sent automatically by browsers). Next.js includes built-in CSRF protection via origin checking in Server Actions. Do not disable this protection.

**React 19 rename:** `useFormState` is renamed to `useActionState` in React 19 and moved from `react-dom` to `react`. Both work in Next.js 14/15 — prefer `useActionState` in new code.

## Source

https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations

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
