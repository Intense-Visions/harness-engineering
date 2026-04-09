# Next.js Authentication Patterns

> Implement authentication with session handling, middleware guards, and Auth.js integration

## When to Use

- Protecting pages and API routes from unauthenticated access
- Implementing login, logout, and session refresh flows
- Reading the current user in Server Components and Route Handlers
- Setting up role-based access control (RBAC) at the middleware level
- Integrating OAuth providers (Google, GitHub) or credential-based auth

## Instructions

1. Use Auth.js (formerly NextAuth.js) v5 for a batteries-included auth layer — it handles OAuth, JWTs, sessions, and CSRF.
2. Create `auth.ts` at the project root to configure providers, callbacks, and session strategy.
3. Protect routes in `middleware.ts` using the Auth.js `auth` export — redirect unauthenticated users before the page renders.
4. Access the session in Server Components with `auth()` — never trust client-supplied user data.
5. Access the session in Client Components with `useSession()` from `next-auth/react` — wrap the app in `<SessionProvider>` in a Client Component layout wrapper.
6. Use `signIn()` and `signOut()` from `next-auth/react` in Client Components, or call them from Server Actions for progressive enhancement.
7. Validate authorization (role checks) in Route Handlers and Server Actions — middleware only covers page routes by default.
8. Store sensitive user attributes (roles, permissions) in the JWT callback and expose them through the session callback — never rely solely on client state.

```typescript
// auth.ts — Auth.js v5 configuration
import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.role = user.role; // persist role in JWT
      return token;
    },
    async session({ session, token }) {
      session.user.role = token.role as string; // expose in session
      return session;
    },
  },
});

// middleware.ts — route protection
export { auth as middleware } from '@/auth';

export const config = {
  matcher: ['/dashboard/:path*', '/api/protected/:path*'],
};

// app/dashboard/page.tsx — server-side session access
import { auth } from '@/auth';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect('/login');
  if (session.user.role !== 'admin') redirect('/unauthorized');
  return <Dashboard user={session.user} />;
}
```

## Details

Auth.js v5 is designed for the App Router and provides `auth()` as both a middleware function and a server-side session accessor. The same function works in middleware, Server Components, Route Handlers, and Server Actions.

**Session strategies:** Auth.js supports JWT sessions (stateless, stored in cookies) and database sessions (stateful, stored in your database). JWT is simpler to deploy; database sessions allow true session revocation. Use database sessions when you need to invalidate sessions on logout or role changes.

**Middleware guard scope:** The Auth.js middleware `auth` export only protects routes matched by `config.matcher`. API Route Handlers and Server Actions are not automatically protected — always call `auth()` and check the session inside them independently.

**Role-based access:** Store roles in the JWT payload via the `jwt` callback. The JWT is signed and cannot be tampered with client-side. Read `session.user.role` in Server Components to make authorization decisions. Never read roles from URL parameters or request bodies for authorization.

**OAuth callback URL:** OAuth providers require registering the callback URL: `https://yourdomain.com/api/auth/callback/github`. In development, use `http://localhost:3000/api/auth/callback/github`. Auth.js handles the callback route via the `handlers` export mounted at `app/api/auth/[...nextauth]/route.ts`.

**PKCE and security:** Auth.js automatically uses PKCE for OAuth flows and includes CSRF protection for credential login. Do not re-implement these manually.

## Source

https://nextjs.org/docs/app/building-your-application/authentication

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
