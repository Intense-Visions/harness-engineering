# Next.js Middleware

> Run code at the edge before a request completes — redirect, rewrite, or modify responses

## When to Use

- Protecting routes based on authentication or authorization state
- Redirecting users based on locale, geolocation, or A/B test bucket
- Rewriting URLs for feature flags or multi-tenant routing
- Injecting headers into requests or responses for security (CSP, CORS)
- Rate limiting or bot detection at the edge before hitting the server

## Instructions

1. Create `middleware.ts` at the project root (or `src/middleware.ts` if using `src/` layout).
2. Export a default `middleware` function that accepts a `NextRequest` and returns a `NextResponse` or `void`.
3. Export a `config` object with a `matcher` array to scope middleware to specific paths — avoid running middleware on `_next/static`, `_next/image`, and static assets.
4. Use `NextResponse.redirect()` for permanent redirects and `NextResponse.rewrite()` to proxy the request to a different URL without changing the browser URL.
5. Read cookies with `request.cookies.get('name')` and set them on the response with `response.cookies.set()`.
6. Use `NextResponse.next()` with modified headers to pass custom headers to Server Components via `headers()`.
7. Keep middleware fast — it runs on every matched request on the Edge Runtime. Avoid heavy computation, large imports, or network calls where latency matters.
8. Do not import Node.js-only modules — the Edge Runtime only supports a subset of Web APIs.

```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('auth-token')?.value;
  const isProtected = request.nextUrl.pathname.startsWith('/dashboard');

  if (isProtected && !token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Pass a custom header to Server Components
  const response = NextResponse.next();
  response.headers.set('x-pathname', request.nextUrl.pathname);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
```

## Details

Next.js Middleware runs on the Vercel Edge Network (or a compatible edge runtime) before the request reaches the server. It uses the Edge Runtime — a lightweight V8 environment with Web APIs but without Node.js built-ins like `fs`, `path`, or `crypto` (use `globalThis.crypto` instead).

**Matcher syntax:** The `matcher` array supports path patterns, negative lookaheads, and regex. The example pattern is the recommended baseline: it excludes Next.js internals and static file extensions. Middleware that matches every request including static assets is a common performance mistake.

**Reading server component headers:** Middleware can inject headers into the request via `request.headers.set()` before calling `NextResponse.next({ request })`. These headers are accessible in Server Components via `import { headers } from 'next/headers'`. This pattern passes request-time context (user ID, locale, tenant) without touching cookies.

**Edge vs Node.js runtime:** Middleware always runs on the Edge Runtime. Route Handlers and Server Components can opt into the Edge Runtime with `export const runtime = 'edge'`, but this is optional and has the same Node.js API limitations.

**Auth libraries:** NextAuth.js / Auth.js provides a `auth()` middleware helper that integrates with the middleware pattern. Using it avoids manually parsing JWTs in middleware.

## Source

https://nextjs.org/docs/app/building-your-application/routing/middleware

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
