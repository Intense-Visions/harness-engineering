# Next.js Route Handlers

> Create HTTP endpoints in the App Router using route.ts with typed method exports

## When to Use

- Building REST API endpoints for external consumers or third-party webhooks
- Handling non-mutation requests (GET, HEAD) that should not be Server Actions
- Processing webhook payloads (Stripe, GitHub, CMS) with signature verification
- Implementing file downloads, streaming responses, or custom content types
- Bridging Next.js with external systems that cannot call Server Actions directly

## Instructions

1. Create `app/api/[resource]/route.ts` and export named async functions `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`.
2. Accept `(request: NextRequest)` as the first parameter — use `request.json()`, `request.text()`, or `request.formData()` to parse the body.
3. Return a `Response` or `NextResponse` — use `NextResponse.json(data, { status })` for JSON responses.
4. Access dynamic segments via the second parameter: `({ params }: { params: { id: string } })`.
5. Validate webhook signatures before processing — use `request.text()` to read the raw body (needed for HMAC verification), then parse JSON manually.
6. Set the `runtime` export to `'edge'` for global low-latency endpoints; omit it (defaults to Node.js) when you need Node.js APIs.
7. Add `export const dynamic = 'force-dynamic'` if a GET handler should never be cached (e.g., it reads cookies or returns live data).
8. Prefer Server Actions for mutations triggered by your own UI — Route Handlers are for external integrations.

```typescript
// app/api/posts/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const updateSchema = z.object({ title: z.string().min(1) });

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const post = await db.post.findUnique({ where: { id: params.id } });
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(post);
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ errors: parsed.error.flatten() }, { status: 422 });
  }
  const post = await db.post.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json(post);
}
```

## Details

Route Handlers replace `pages/api/` routes in the App Router. They live at `app/api/**/route.ts` (or any nested location in `app/` that does not conflict with a `page.tsx`). A `route.ts` file and a `page.tsx` file cannot coexist in the same directory.

**Caching behavior:** GET Route Handlers are statically cached by default when they do not read dynamic data (`cookies()`, `headers()`, request body). Use `export const dynamic = 'force-dynamic'` or read from `request` to opt out of caching.

**Webhook pattern:** Stripe and GitHub require reading the raw request body for HMAC signature verification. Read with `await request.text()`, verify the signature, then `JSON.parse()` the body manually. Using `request.json()` first consumes the stream and makes raw body unavailable.

**Streaming responses:** Return a `ReadableStream` in the `Response` body for streaming endpoints. This pattern is common for AI streaming responses (OpenAI, Anthropic SDK).

**CORS:** Route Handlers need explicit CORS headers for cross-origin requests. Handle `OPTIONS` requests and set `Access-Control-Allow-*` headers in both the OPTIONS handler and the main method handlers.

**tRPC integration:** tRPC's Next.js adapter mounts a single Route Handler at `app/api/trpc/[trpc]/route.ts` and delegates all procedure calls through it.

## Source

https://nextjs.org/docs/app/building-your-application/routing/route-handlers
