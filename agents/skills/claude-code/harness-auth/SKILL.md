# Harness Auth

> OAuth2, JWT, RBAC/ABAC, session management, and MFA pattern analysis. Detects authentication and authorization mechanisms, evaluates security posture against OWASP guidelines, and recommends improvements for token lifecycle, permission models, and multi-factor authentication.

## When to Use

- When implementing or modifying authentication flows (login, registration, password reset, OAuth2)
- On PRs that change authorization logic, middleware guards, or permission models
- To audit existing auth implementation for security vulnerabilities and best practice compliance
- NOT for network-level security or infrastructure hardening (use harness-security-review)
- NOT for compliance framework audits (use harness-compliance for SOC2/HIPAA/GDPR)
- NOT for secrets management or credential rotation (use harness-secrets)

## Process

### Phase 1: DETECT -- Identify Auth Mechanisms and Providers

1. **Discover authentication providers.** Scan the codebase for auth framework usage:
   - Passport.js: `passport.use()`, strategy configurations, `passport.authenticate()` calls
   - NextAuth.js / Auth.js: `next-auth` config, provider definitions, callback handlers
   - Auth0: `@auth0/nextjs-auth0`, `auth0-js`, management API client initialization
   - Firebase Auth: `firebase/auth`, `signInWithPopup`, `onAuthStateChanged` usage
   - Custom: JWT signing/verification, bcrypt hashing, session store initialization
   - Spring Security: `@EnableWebSecurity`, `SecurityFilterChain`, `UserDetailsService`
   - ASP.NET Identity: `AddAuthentication()`, `[Authorize]` attributes, `ClaimsPrincipal`

2. **Map token flows.** Trace the authentication lifecycle:
   - Token issuance: Where and how are JWTs or session tokens created?
   - Token storage: Cookie (httpOnly, secure, sameSite?), localStorage, sessionStorage, or in-memory?
   - Token refresh: Is there a refresh token flow? What is the access token lifetime?
   - Token revocation: Can tokens be invalidated before expiry? Is there a blocklist?
   - Token propagation: How are tokens passed between services (Authorization header, cookie, custom header)?

3. **Identify authorization models.** Determine how permissions are enforced:
   - RBAC: Role definitions, role-to-permission mappings, role assignment to users
   - ABAC: Attribute-based policies, policy evaluation engine, context attributes
   - ACL: Per-resource access control lists, ownership checks
   - Middleware guards: Express middleware, NestJS guards, Spring interceptors, ASP.NET policies
   - Route-level: Declarative route protection, public vs protected route definitions

4. **Check for MFA implementation.** Look for multi-factor authentication:
   - TOTP: `otplib`, `speakeasy`, Google Authenticator integration
   - SMS/Email OTP: Twilio, SendGrid verification flows
   - WebAuthn/FIDO2: `@simplewebauthn/server`, hardware key registration
   - Recovery codes: Generation, storage, and redemption logic

5. **Inventory session management.** If sessions are used:
   - Session store: Redis, database, in-memory, or cookie-based
   - Session lifecycle: creation, renewal, expiry, and destruction
   - Concurrent session handling: single-session enforcement, session listing

---

### Phase 2: ANALYZE -- Evaluate Security Posture

1. **Check JWT implementation against OWASP guidelines.** Verify:
   - Algorithm is explicitly set (no `alg: none` vulnerability)
   - Secret/key is sufficiently strong (RS256/ES256 preferred over HS256 for distributed systems)
   - Token lifetime is appropriate (access: 15-60 min, refresh: 7-30 days)
   - Claims include `iss`, `aud`, `exp`, `iat`, and `sub` at minimum
   - Tokens are validated on every request, not just on login
   - JWTs are not stored in localStorage (XSS vulnerability)

2. **Evaluate OAuth2/OIDC flows.** If OAuth2 is used:
   - Is PKCE used for public clients (SPAs, mobile apps)?
   - Are redirect URIs strictly validated (no open redirect)?
   - Is the state parameter used to prevent CSRF?
   - Are scopes minimized to the principle of least privilege?
   - Is token exchange happening server-side (not exposing client secret)?

3. **Assess password handling.** If password authentication exists:
   - Hashing algorithm: bcrypt, scrypt, or argon2 (not MD5, SHA-1, or SHA-256 without salt)
   - Salt: unique per user, generated with cryptographic RNG
   - Password policy: minimum length, complexity requirements, breach database check
   - Rate limiting on login attempts (brute force protection)
   - Account lockout or CAPTCHA after failed attempts

4. **Review authorization enforcement.** For each protected resource:
   - Is authorization checked at the API layer (not just the UI)?
   - Are there IDOR (Insecure Direct Object Reference) vulnerabilities?
   - Is the permission check granular enough (not just "is authenticated")?
   - Are admin routes protected by role checks, not just authentication?
   - Is horizontal privilege escalation prevented (user A cannot access user B's data)?

5. **Check session security.** If sessions are used:
   - Session ID entropy: cryptographically random, sufficient length
   - Cookie flags: `httpOnly`, `secure`, `sameSite=Strict` or `sameSite=Lax`
   - Session fixation prevention: regenerate ID on login
   - Session timeout: absolute and idle timeout configured
   - CSRF protection: token-based or SameSite cookie

---

### Phase 3: DESIGN -- Recommend Improvements

1. **Token lifecycle improvements.** Based on analysis findings:
   - Recommend specific token lifetimes with rationale
   - Design refresh token rotation (one-time-use refresh tokens with family tracking)
   - Propose token revocation strategy (blocklist in Redis with TTL matching token expiry)
   - If using JWTs in cookies: recommend cookie configuration (httpOnly, secure, sameSite, path, domain)

2. **Permission model design.** Based on the application's needs:
   - For simple apps: RBAC with predefined roles (admin, editor, viewer)
   - For multi-tenant apps: RBAC with tenant-scoped roles
   - For complex resource access: ABAC with policy engine (CASL, Casbin, Open Policy Agent)
   - Generate permission matrix: roles/attributes x resources x actions

3. **MFA implementation plan.** If MFA is missing or incomplete:
   - Recommend TOTP as baseline (widely supported, no SMS dependency)
   - Design enrollment flow: QR code generation, backup codes, verification step
   - Design authentication flow: primary factor -> MFA challenge -> session creation
   - Recommend WebAuthn as optional upgrade path for phishing resistance

4. **Security hardening recommendations.** Prioritized by risk:
   - P0: Fix any authentication bypass, broken access control, or token vulnerability
   - P1: Add missing CSRF protection, fix insecure token storage, add rate limiting
   - P2: Implement MFA, add session management improvements, enhance logging
   - P3: Add breach notification flow, implement progressive security (step-up auth)

5. **Generate implementation guidance.** Produce:
   - Middleware/guard code templates for the project's framework
   - Migration plan for moving from insecure to secure token storage
   - Database schema for RBAC tables (users, roles, permissions, user_roles)
   - Configuration templates for OAuth2 providers

---

### Phase 4: VALIDATE -- Verify Against OWASP and Common Vulnerabilities

1. **OWASP Authentication Verification.** Check against OWASP ASVS (Application Security Verification Standard) Level 2:
   - V2.1: Password security (hashing, policy, breach check)
   - V2.2: General authenticator security (MFA, recovery codes)
   - V2.5: Credential recovery (secure reset flow, no secret questions)
   - V2.7: Out-of-band verification (email/SMS verification security)
   - V2.8: Single or multi-factor authentication (session binding)

2. **OWASP Authorization Verification.** Check against OWASP ASVS:
   - V4.1: Access control design (deny by default, least privilege)
   - V4.2: Operation-level access control (every API endpoint protected)
   - V4.3: Data-level access control (row-level security, tenant isolation)

3. **Test coverage verification.** Check that auth logic is tested:
   - Authentication tests: valid login, invalid credentials, expired tokens, refresh flow
   - Authorization tests: permitted access, denied access, privilege escalation attempt
   - Edge cases: expired session, concurrent sessions, token replay, CSRF
   - Integration tests: full OAuth2 flow with mocked provider

4. **Verify logging and monitoring.** Confirm security events are logged:
   - Successful and failed login attempts with timestamps and IP addresses
   - Password changes and account recovery events
   - Permission changes and role assignments
   - Token refresh and revocation events
   - Log format must not include passwords, tokens, or session IDs

5. **Produce the auth audit report.** Output a structured summary:
   - Authentication mechanism inventory
   - OWASP ASVS compliance status by section
   - Prioritized findings with severity and remediation
   - Permission model diagram or matrix
   - Recommended implementation timeline

---

## Harness Integration

- **`harness skill run harness-auth`** -- Primary CLI entry point. Runs all four phases.
- **`harness validate`** -- Run after implementing auth changes to verify project integrity.
- **`harness check-deps`** -- Verify auth library dependencies are properly declared and up to date.
- **`emit_interaction`** -- Used at permission model design (checkpoint:decision) when choosing between RBAC and ABAC, and before recommending OAuth2 provider changes.
- **`Glob`** -- Discover auth middleware, guard files, policy definitions, and session configurations.
- **`Grep`** -- Search for JWT signing, password hashing, token validation, and authorization checks.
- **`Write`** -- Generate permission matrices, migration plans, and middleware templates.
- **`Edit`** -- Update existing auth middleware, guards, and token configurations.

## Success Criteria

- All authentication providers and token flows are mapped with specific file locations
- JWT implementation is checked against all OWASP ASVS V2 requirements
- Authorization model is documented with a permission matrix covering all roles and resources
- Every finding includes a severity level, specific file location, and concrete remediation step
- Token storage recommendations specify exact cookie flags or storage mechanism
- Security event logging is verified to capture auth events without leaking sensitive data

## Examples

### Example: Next.js Application with NextAuth.js and Prisma

```
Phase 1: DETECT
  Provider: NextAuth.js v4 in src/app/api/auth/[...nextauth]/route.ts
  Strategies: Google OAuth2, GitHub OAuth2, email/password (credentials provider)
  Token flow: JWT mode, access token in httpOnly cookie, 30-day expiry
  Authorization: Custom middleware in src/middleware.ts checking session.user.role
  Roles: admin, member (stored in User table via Prisma)
  MFA: Not implemented
  Session store: JWT-based (no server-side session)

Phase 2: ANALYZE
  Findings:
    [HIGH] JWT expiry 30 days is excessive — recommend 1 hour with refresh token
    [HIGH] Credentials provider uses bcrypt cost factor 8 — recommend 12
    [MEDIUM] No PKCE on OAuth2 flows (NextAuth handles this but verify config)
    [MEDIUM] No rate limiting on /api/auth/callback/credentials
    [LOW] Role check only in middleware — no API-level authorization guards
    [LOW] No audit logging for login events

Phase 3: DESIGN
  Recommendations:
    1. Switch to database sessions with 1-hour access, 7-day refresh
    2. Increase bcrypt rounds to 12 in credentials provider
    3. Add rate-limiter-flexible middleware on auth endpoints (5 attempts/15min)
    4. Create src/lib/guards/requireRole.ts middleware for API routes
    5. Add TOTP MFA via otplib with QR enrollment flow
    6. Add auth event logging to audit table via Prisma middleware

Phase 4: VALIDATE
  OWASP ASVS V2 status:
    V2.1 Password Security: PARTIAL (hashing OK, cost factor low, no breach check)
    V2.2 Authenticator Security: FAIL (no MFA)
    V2.5 Credential Recovery: PASS (email-based reset via NextAuth)
    V4.1 Access Control Design: PARTIAL (roles exist, enforcement incomplete)
  Test coverage: 60% — missing tests for role escalation and token expiry
```

### Example: NestJS API with Passport.js, JWT, and CASL

```
Phase 1: DETECT
  Provider: Passport.js with passport-jwt and passport-local strategies
  Token flow:
    - Access token: RS256 JWT, 15-min expiry, in Authorization header
    - Refresh token: opaque, 30-day expiry, in httpOnly cookie
    - Token refresh endpoint: POST /auth/refresh
  Authorization: CASL abilities defined in src/casl/ability.factory.ts
  Roles: super-admin, org-admin, member, viewer (stored in PostgreSQL)
  MFA: TOTP via speakeasy, WebAuthn via @simplewebauthn/server
  Session: Stateless JWT (no server-side session)

Phase 2: ANALYZE
  Findings:
    [HIGH] Refresh token not rotated on use — token replay possible
    [MEDIUM] CASL abilities not checked on 3 admin endpoints (src/admin/admin.controller.ts)
    [MEDIUM] No token blocklist — revoked tokens valid until expiry
    [LOW] WebAuthn registration does not verify attestation
    [LOW] Login failure logging does not include client IP

Phase 3: DESIGN
  Recommendations:
    1. Implement refresh token rotation with family tracking in Redis
       - On refresh: invalidate old token, issue new pair
       - On reuse of old token: revoke entire token family (detect theft)
    2. Add @CheckPolicies() decorator to admin.controller.ts endpoints
    3. Add Redis-backed token blocklist with TTL = access token lifetime
    4. Add attestation verification for WebAuthn with expected origin check
    5. Enhance auth logging with IP, user-agent, and geolocation

Phase 4: VALIDATE
  OWASP ASVS V2 status:
    V2.1 Password Security: PASS
    V2.2 Authenticator Security: PASS (TOTP + WebAuthn)
    V2.8 Multi-Factor: PASS
    V4.1 Access Control: PARTIAL (CASL defined, 3 endpoints uncovered)
    V4.3 Data-Level: PASS (CASL policies include tenant isolation)
  Test coverage: 85% — missing tests for token family revocation
```

## Gates

- **No authentication bypass findings left unresolved.** Any finding that allows unauthenticated access to a protected resource is a P0 blocker. The auth audit cannot be marked complete while bypass vulnerabilities exist.
- **No tokens stored in localStorage.** JWTs or session tokens in localStorage are accessible via XSS. This is a blocking finding. Tokens must be stored in httpOnly cookies or secure server-side sessions.
- **No plaintext or weakly hashed passwords.** MD5, SHA-1, or unsalted SHA-256 for password storage is a blocking finding. Passwords must use bcrypt (cost 12+), scrypt, or argon2id.
- **No authorization checks skipped at the API layer.** UI-only authorization is not authorization. Every API endpoint that serves user-specific or role-restricted data must enforce permissions server-side.

## Escalation

- **When the auth architecture requires a fundamental redesign:** Report: "The current auth implementation has [N] high-severity findings that require architectural changes (e.g., switching from localStorage tokens to httpOnly cookies). This is not a patch — recommend a dedicated auth migration sprint with a rollback plan."
- **When third-party auth provider documentation is insufficient:** Report: "The [provider] SDK does not document [specific behavior]. Recommend testing the behavior empirically in a sandbox environment and documenting the findings in the project's auth architecture doc."
- **When MFA adoption requires UX changes beyond the auth layer:** Report: "Implementing MFA requires changes to [login flow, account settings, recovery flow]. Coordinate with the frontend team to design the enrollment and challenge UX before implementing the backend."
- **When the permission model is too simple for current requirements:** Report: "The current RBAC model with [N] roles cannot express [specific access pattern]. Recommend evaluating ABAC with [CASL/Casbin/OPA] to support attribute-based policies. This is a significant migration — plan for 2-3 sprints."
