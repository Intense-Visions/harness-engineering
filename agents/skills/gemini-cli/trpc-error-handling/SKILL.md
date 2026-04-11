# tRPC: Error Handling

> Throw typed TRPCErrors in procedures and format them consistently for client consumption

## When to Use

- Returning semantic HTTP-equivalent errors from tRPC procedures (404, 401, 422)
- Formatting error responses with additional metadata (field-level validation errors)
- Handling tRPC errors on the client in `onError` callbacks or error UI
- Logging server-side errors with request context (user ID, input, procedure name)
- Distinguishing between expected errors (validation, not found) and unexpected errors (database failures)

## Instructions

1. Throw `new TRPCError({ code: 'NOT_FOUND', message: '...' })` for expected error conditions — it maps to the appropriate HTTP status.
2. Use `code: 'UNAUTHORIZED'` for unauthenticated requests and `code: 'FORBIDDEN'` for insufficient permissions.
3. Use `code: 'BAD_REQUEST'` for input that passes Zod schema validation but fails business rules.
4. Use `code: 'UNPROCESSABLE_CONTENT'` for field-level validation errors from Zod — pass the `ZodError` as `cause`.
5. Add an `errorFormatter` to `initTRPC.create({ errorFormatter })` to shape error responses and extract Zod validation details.
6. Handle errors on the client in `onError` callbacks of `useMutation` — check `error.data?.code` for the tRPC error code.
7. Never expose internal error messages or stack traces in `INTERNAL_SERVER_ERROR` responses — sanitize in the error formatter.

```typescript
// server/trpc.ts — error formatter with Zod details
import { initTRPC, TRPCError } from '@trpc/server';
import { ZodError } from 'zod';
import superjson from 'superjson';

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

// server/routers/posts.ts — throwing typed errors
import { TRPCError } from '@trpc/server';

const postsRouter = router({
  getById: publicProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const post = await ctx.db.post.findUnique({ where: { id: input.id } });
      if (!post) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Post ${input.id} not found`,
        });
      }
      if (post.status === 'draft' && ctx.session?.user.id !== post.authorId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Draft not accessible' });
      }
      return post;
    }),

  publish: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const post = await ctx.db.post.findUnique({ where: { id: input.id } });
      if (!post) throw new TRPCError({ code: 'NOT_FOUND' });
      if (post.authorId !== ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN' });
      if (post.status === 'published') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Already published' });
      }
      return ctx.db.post.update({ where: { id: input.id }, data: { status: 'published' } });
    }),
});

// Client error handling
const { mutate } = api.posts.publish.useMutation({
  onError: (error) => {
    if (error.data?.code === 'FORBIDDEN') {
      toast.error('You do not have permission to publish this post');
    } else if (error.data?.zodError) {
      // Field-level errors from errorFormatter
      setFieldErrors(error.data.zodError.fieldErrors);
    } else {
      toast.error(error.message);
    }
  },
});
```

## Details

tRPC error codes map to HTTP status codes. The mapping is deterministic and built in:

| tRPC code               | HTTP status |
| ----------------------- | ----------- |
| `BAD_REQUEST`           | 400         |
| `UNAUTHORIZED`          | 401         |
| `FORBIDDEN`             | 403         |
| `NOT_FOUND`             | 404         |
| `CONFLICT`              | 409         |
| `PRECONDITION_FAILED`   | 412         |
| `UNPROCESSABLE_CONTENT` | 422         |
| `TOO_MANY_REQUESTS`     | 429         |
| `INTERNAL_SERVER_ERROR` | 500         |

**Error formatter:** The `errorFormatter` function runs server-side after an error is thrown. It receives the default `shape` (code, message, data) and can augment it. The example above extracts `ZodError.flatten()` details into `data.zodError` so the client can display field-specific error messages.

**`cause` for wrapping:** Pass the original error as `cause` when wrapping: `new TRPCError({ code: 'INTERNAL_SERVER_ERROR', cause: dbError })`. The `cause` is accessible in `errorFormatter` for logging but is not sent to the client.

**Client-side `error.data`:** On the client, `error.data` contains the formatted server response (including `zodError` if you added it). `error.message` is the human-readable message. `error.data?.code` is the tRPC error code string.

**`onError` on the router level:** Configure a global `onError` in the tRPC HTTP adapter to log all procedure errors server-side. This is separate from the `errorFormatter` — `onError` is for side effects (logging to Sentry, Datadog), `errorFormatter` is for shaping the response.

## Source

https://trpc.io/docs/server/error-handling

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.
- **related_skills:** trpc-router-composition, trpc-input-validation, trpc-react-query-integration, next-error-boundaries, api-error-contracts, api-status-codes

## Success Criteria

- The patterns described in this document are applied correctly in the implementation.
- Edge cases and anti-patterns listed in this document are avoided.
