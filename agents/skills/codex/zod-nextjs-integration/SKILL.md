# Zod Next.js Integration

> Validate Next.js server actions, API routes, and form data with Zod schemas

## When to Use

- Validating inputs to Next.js server actions (App Router)
- Parsing and validating request bodies in API route handlers
- Handling form data validation with `useFormState` / `useActionState`
- Validating search params and dynamic route segments

## Instructions

1. Validate server action inputs — the action receives `FormData` or typed arguments:

```typescript
'use server';
import { z } from 'zod';
import { redirect } from 'next/navigation';

const CreatePostSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100),
  content: z.string().min(10, 'Content is too short'),
  published: z.coerce.boolean().default(false),
});

export async function createPost(formData: FormData) {
  const result = CreatePostSchema.safeParse({
    title: formData.get('title'),
    content: formData.get('content'),
    published: formData.get('published'),
  });

  if (!result.success) {
    return { success: false, errors: result.error.flatten().fieldErrors };
  }

  const post = await db.post.create({ data: result.data });
  redirect(`/posts/${post.id}`);
}
```

2. Use `useActionState` (React 19) or `useFormState` with typed state:

```typescript
'use client'
import { useActionState } from 'react'
import { createPost } from './actions'

type FormState = {
  success: boolean
  errors?: { title?: string[]; content?: string[] }
}

const initialState: FormState = { success: false }

export function CreatePostForm() {
  const [state, formAction, isPending] = useActionState(createPost, initialState)

  return (
    <form action={formAction}>
      <input name="title" />
      {state.errors?.title && <p>{state.errors.title[0]}</p>}

      <textarea name="content" />
      {state.errors?.content && <p>{state.errors.content[0]}</p>}

      <button disabled={isPending}>Create</button>
    </form>
  )
}
```

3. Validate API route handler inputs in the App Router:

```typescript
import { z } from 'zod';
import { NextRequest, NextResponse } from 'next/server';

const CreateUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(['admin', 'viewer']).default('viewer'),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const result = CreateUserSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { success: false, errors: result.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const user = await db.user.create({ data: result.data });
  return NextResponse.json({ success: true, user }, { status: 201 });
}
```

4. Validate search params:

```typescript
import { z } from 'zod';

const SearchParamsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  query: z.string().optional(),
  sort: z.enum(['asc', 'desc']).default('desc'),
});

// In a Server Component:
export default function Page({ searchParams }: { searchParams: Record<string, string> }) {
  const params = SearchParamsSchema.parse(searchParams);
  // params.page, params.limit, params.query, params.sort are all properly typed
}
```

5. Validate dynamic route params:

```typescript
const RouteParamsSchema = z.object({
  id: z.string().uuid('Invalid post ID format'),
});

export default async function PostPage({ params }: { params: { id: string } }) {
  const result = RouteParamsSchema.safeParse(params);
  if (!result.success) {
    notFound();
  }
  const post = await db.post.findUniqueOrThrow({ where: { id: result.data.id } });
  // ...
}
```

6. Create a reusable validation wrapper for server actions:

```typescript
import { z } from 'zod';

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; errors: Record<string, string[]> };

export function createValidatedAction<TSchema extends z.ZodSchema, TResult>(
  schema: TSchema,
  handler: (data: z.infer<TSchema>) => Promise<TResult>
) {
  return async (formData: FormData): Promise<ActionResult<TResult>> => {
    const rawData = Object.fromEntries(formData.entries());
    const result = schema.safeParse(rawData);

    if (!result.success) {
      return {
        success: false,
        errors: result.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const data = await handler(result.data);
    return { success: true, data };
  };
}

// Usage:
export const createPost = createValidatedAction(CreatePostSchema, async (data) => {
  return db.post.create({ data });
});
```

## Details

**FormData coercion:**

All form values come in as strings. Use `z.coerce` for non-string fields: `z.coerce.number()`, `z.coerce.boolean()`, `z.coerce.date()`. Checkbox values are `'on'` or absent — coerce with:

```typescript
const boolField = z.preprocess(
  (val) => val === 'on' || val === 'true' || val === true,
  z.boolean()
);
```

**File inputs:**

```typescript
const FileSchema = z.object({
  file: z
    .instanceof(File)
    .refine((f) => f.size < 5 * 1024 * 1024, 'File must be under 5MB')
    .refine((f) => ['image/jpeg', 'image/png'].includes(f.type), 'Must be JPEG or PNG'),
});
```

**tRPC integration:**

In tRPC procedures, pass Zod schemas directly to `.input()`:

```typescript
const postRouter = router({
  create: protectedProcedure.input(CreatePostSchema).mutation(({ ctx, input }) => {
    // input is fully typed as z.infer<typeof CreatePostSchema>
    return ctx.db.post.create({ data: input });
  }),
});
```

## Source

https://zod.dev

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
