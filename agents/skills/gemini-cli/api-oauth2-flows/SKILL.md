# OAuth2 Flows

> OAUTH2 FLOW SELECTION IS DETERMINED BY CLIENT TYPE AND DEPLOYMENT ENVIRONMENT — AUTHORIZATION CODE + PKCE FOR USER-FACING APPS, CLIENT CREDENTIALS FOR MACHINE-TO-MACHINE, DEVICE CODE FOR BROWSERLESS CLIENTS — USING THE WRONG FLOW INTRODUCES CREDENTIAL EXPOSURE VECTORS THAT THE CORRECT FLOW ARCHITECTURALLY ELIMINATES.

## When to Use

- Designing the OAuth2 integration for a new API that supports user-delegated access
- Choosing between authorization code and client credentials for a server-side integration
- Implementing a CLI or IoT device that needs to authenticate without a browser
- Auditing an existing OAuth2 implementation that uses the implicit flow (deprecated)
- Setting refresh token rotation policy for a long-lived user session
- Implementing token introspection for a resource server that needs to validate opaque tokens
- Writing the OAuth2 section of an API style guide or security design document

## Instructions

### Key Concepts

1. **Authorization Code + PKCE — user-delegated access from any client** — The authorization code flow is the correct choice for any client acting on behalf of a human user. PKCE (Proof Key for Code Exchange) is required for all clients — including confidential server-side clients — as of OAuth 2.1. The flow: client generates a `code_verifier` (random 43–128 character string) and a `code_challenge` (SHA-256 hash of the verifier), redirects the user to the authorization server with the challenge, receives an authorization code at the redirect URI, and exchanges the code + verifier for tokens. PKCE prevents authorization code interception attacks by binding the code to the client that initiated the flow.

2. **Client Credentials — machine-to-machine, no user context** — When a server process authenticates as itself (not on behalf of a user), client credentials is the correct flow. The client sends its `client_id` and `client_secret` directly to the token endpoint and receives an access token scoped to the application's permissions. There is no user, no redirect, no consent screen. Access tokens are short-lived (15–60 minutes); there are no refresh tokens in the standard client credentials flow. This flow is appropriate for CI/CD pipelines, backend service calls, batch jobs, and webhook delivery systems.

3. **Device Code — browserless and input-constrained clients** — CLIs, smart TVs, gaming consoles, and IoT devices that cannot open a browser use the device code flow. The device requests a device code and user code from the authorization server, displays the user code and a URL for the user to visit on a different device, and polls the token endpoint until the user completes authorization. GitHub CLI, Google Cloud SDK, and AWS CLI all use this flow for initial authentication. The polling interval must be respected to avoid rate-limit errors.

4. **Implicit Flow — deprecated, do not use** — The implicit flow returned access tokens directly in the redirect URI fragment, bypassing the authorization code exchange step. It was designed for single-page applications before PKCE existed. The fragment is accessible to JavaScript on the page and to browser history, making token theft feasible. RFC 9700 (OAuth 2.1) formally removes the implicit flow. All SPAs must migrate to authorization code + PKCE; the implicit flow must not appear in new implementations.

5. **Refresh Token Rotation** — Refresh tokens enable long-lived sessions without requiring re-authentication. Rotation policy: each refresh token exchange issues a new refresh token and invalidates the old one. If an attacker uses a stolen refresh token, the next legitimate use by the real client will fail (the token was already used), alerting the server to a potential compromise. Auth0, Okta, and GitHub all support refresh token rotation. Refresh tokens should have a configurable absolute expiry (30–90 days) regardless of use.

6. **Token Introspection (RFC 7662)** — Resource servers that receive opaque access tokens cannot validate them locally. Token introspection allows the resource server to query the authorization server: `POST /introspect` with the token value, receiving a JSON response containing `active`, `scope`, `sub`, `exp`, and `client_id`. Cache introspection responses for the token's remaining lifetime to avoid per-request round-trips. JWTs can be validated locally using the issuer's JWKS endpoint, making introspection unnecessary when JWT validation is implemented correctly.

### Worked Example

**GitHub OAuth2 App** illustrates authorization code + PKCE and device code flows in a production system.

**Authorization Code + PKCE — web application flow:**

Step 1 — Generate PKCE values and redirect user:

```
code_verifier = base64url(random_bytes(32))
code_challenge = base64url(SHA256(code_verifier))

GET https://github.com/login/oauth/authorize
  ?client_id=Iv1.abc123
  &redirect_uri=https://app.example.com/callback
  &scope=repo+read:org
  &state=random_csrf_token
  &code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
  &code_challenge_method=S256
```

Step 2 — Exchange code for tokens:

```http
POST https://github.com/login/oauth/access_token
Content-Type: application/json

{
  "client_id": "Iv1.abc123",
  "client_secret": "secret",
  "code": "auth_code_from_redirect",
  "redirect_uri": "https://app.example.com/callback",
  "code_verifier": "original_code_verifier"
}
```

```json
{
  "access_token": "ghu_16C7e42F292c6912E7710c838347Ae178B4a",
  "token_type": "bearer",
  "scope": "repo,read:org",
  "refresh_token": "ghr_1B4a2e77...",
  "refresh_token_expires_in": 15897600
}
```

**Device Code Flow — GitHub CLI:**

```http
POST https://github.com/login/device/code
Content-Type: application/json

{ "client_id": "Iv1.abc123", "scope": "repo" }
```

```json
{
  "device_code": "3584d83530557fdd1f46af8289938c8ef79f9dc5",
  "user_code": "WDJB-MJHT",
  "verification_uri": "https://github.com/login/device",
  "expires_in": 900,
  "interval": 5
}
```

CLI displays: `Visit https://github.com/login/device and enter code WDJB-MJHT`. Polls every 5 seconds until authorization completes.

### Anti-Patterns

1. **Using the implicit flow for SPAs.** The implicit flow returns tokens in the URL fragment, visible to any JavaScript on the page and logged in browser history. Every SPA must use authorization code + PKCE. There is no exception — PKCE is not significantly more complex to implement and eliminates the token-in-fragment exposure entirely.

2. **Client credentials with long-lived tokens.** Access tokens issued via client credentials should expire in 15–60 minutes. Issuing 24-hour or week-long tokens for machine clients means a token theft event gives an attacker prolonged access. Short expiry with automatic re-issue is the correct model; the client simply re-authenticates when the token expires.

3. **Storing OAuth2 access tokens in localStorage.** localStorage is accessible to any JavaScript running on the page, including injected scripts from XSS attacks. Access tokens stored in localStorage are trivially stolen. Store tokens in memory for short-lived use, or use HttpOnly cookies for persistent sessions in browser clients.

4. **Not validating the `state` parameter.** The `state` parameter in the authorization request prevents CSRF attacks during the OAuth2 redirect flow. The client generates a random value, includes it in the authorization request, and validates it on receipt of the callback. Skipping state validation allows an attacker to trick a user into completing an OAuth2 flow the attacker initiated.

## Details

### OAuth 2.1 Consolidation

OAuth 2.1 (in IETF draft as of 2024) consolidates the OAuth 2.0 framework by formalizing the security best practices accumulated over a decade. Key changes: PKCE is required for all authorization code flows (not just public clients), the implicit flow is removed, refresh token rotation is required for public clients, and access tokens must not be transmitted in query parameters. Implementing OAuth 2.1 requirements today is equivalent to implementing OAuth 2.0 + all security BCP (Best Current Practice) recommendations. New implementations should target OAuth 2.1 semantics even before it is formally published.

### Token Introspection Caching

Token introspection round-trips add latency to every protected API request if not cached. Cache the introspection response for the token's remaining lifetime: if the `exp` claim indicates 300 seconds remaining, cache the introspection result for 300 seconds. Use the token's hash as the cache key, not the token itself. Distributed caches (Redis, Memcached) allow all instances of a resource server to share introspection results. For JWTs, skip introspection entirely — validate the signature, issuer, audience, and expiry locally using the JWKS endpoint's public keys.

### Real-World Case Study: Dropbox Implicit Flow Migration

Dropbox migrated their mobile and desktop SDKs from the implicit flow to authorization code + PKCE in 2020 following OAuth 2.0 Security BCP publication. The migration required updating the Dropbox SDK for Android, iOS, and desktop — approximately 2 million active integrations. Dropbox ran both flows in parallel for 18 months, then deprecated implicit flow tokens. Post-migration analysis showed a 40% reduction in token theft incidents reported through their security disclosure program, attributable to eliminating fragment-based token exposure. The migration guide they published became a reference implementation for other providers making the same transition.

## Source

- [OAuth 2.0 — oauth.net/2/](https://oauth.net/2/)
- [RFC 7636 — Proof Key for Code Exchange (PKCE)](https://datatracker.ietf.org/doc/html/rfc7636)
- [RFC 7662 — OAuth 2.0 Token Introspection](https://datatracker.ietf.org/doc/html/rfc7662)
- [OAuth 2.0 Security Best Current Practice](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics)
- [Auth0 — Which OAuth 2.0 Flow Should I Use?](https://auth0.com/docs/get-started/authentication-and-authorization-flow/which-oauth-2-0-flow-should-i-use)

## Process

1. Identify the client type: browser SPA or mobile → authorization code + PKCE; server background process → client credentials; CLI/TV/device → device code.
2. Implement PKCE for all authorization code flows regardless of whether the client is public or confidential.
3. Set access token expiry to 15–60 minutes; configure refresh token rotation with absolute expiry of 30–90 days.
4. Validate the `state` parameter on every authorization code callback; reject callbacks with missing or mismatched state.
5. Run `harness validate` to confirm skill files are well-formed and related skills are correctly cross-referenced.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.
- **related_skills:** api-authentication-patterns, owasp-auth-patterns, security-authentication, api-api-keys

## Success Criteria

- Authorization code flow always includes PKCE; no implicit flow is used in any client type.
- Machine-to-machine integrations use client credentials with access tokens expiring in 15–60 minutes.
- Refresh token rotation is enabled; reuse of a rotated token triggers session revocation.
- The `state` parameter is validated on every authorization code callback.
- Token introspection responses are cached for the token's remaining lifetime; per-request introspection round-trips are eliminated.
