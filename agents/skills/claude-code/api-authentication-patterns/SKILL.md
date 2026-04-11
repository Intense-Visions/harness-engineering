# API Authentication Patterns

> API AUTHENTICATION PATTERNS MAP CLIENT TYPE, TRUST LEVEL, AND TOKEN LIFETIME TO THE CORRECT CREDENTIAL SCHEME — CHOOSING THE WRONG MECHANISM (E.G., API KEYS FOR USER-DELEGATED ACCESS) INTRODUCES AUDIT GAPS, OVER-PRIVILEGED TOKENS, AND REVOCATION FAILURES THAT COMPROMISE EVERY API ENDPOINT DOWNSTREAM.

## When to Use

- Designing the authentication strategy for a new API before any endpoint work begins
- Auditing an existing API that mixes credential schemes inconsistently across endpoints
- Evaluating whether a service-to-service integration should use API keys, mTLS, or client credentials OAuth2
- Selecting the token format (opaque vs. JWT) for a new identity provider integration
- Writing the authentication section of an API style guide or security design document
- Determining appropriate token lifetimes and refresh policies for a consumer-facing API
- Responding to a security review finding that identifies authentication as a weak point

## Instructions

### Key Concepts

1. **Credential scheme selection by client type** — The client type determines the correct auth scheme. Machine-to-machine server clients with no user context use API keys or OAuth2 client credentials. End-user clients acting on behalf of a human use OAuth2 authorization code + PKCE. Embedded hardware or CLIs without a browser use OAuth2 device code. High-security system integrations use mTLS. Mixing schemes (e.g., using API keys for delegated user access) produces tokens that cannot be scoped to a user, cannot be revoked per-user, and fail compliance audits.

2. **Token lifetime and revocation tradeoffs** — Short-lived tokens (JWTs with 15-minute expiry) reduce the blast radius of credential theft but require frequent refresh round-trips. Long-lived tokens (API keys, refresh tokens) need explicit revocation infrastructure. Opaque tokens allow instant server-side revocation; JWTs require a block-list or short expiry to achieve equivalent security. Choose based on the sensitivity of the API and the cost of revocation infrastructure.

3. **Bearer token transmission** — All credential schemes transmit the credential in the `Authorization` header using the appropriate scheme prefix: `Authorization: Bearer <token>` for OAuth2/JWT, `Authorization: ApiKey <key>` or `Authorization: Bearer <key>` for API keys. Query parameter transmission (`?api_key=...`) exposes credentials in server logs, browser history, and referrer headers and must not be used for production APIs. Header transmission is the only acceptable default.

4. **Scope and permission granularity** — Credentials should carry the minimum permissions needed for their intended use. OAuth2 scopes (`read:users`, `write:orders`) express this at the authorization layer. API keys should be scoped to a service or integration, not to a global admin credential. mTLS certificates encode identity in the subject and can be restricted by certificate policy to specific operations. Over-permissioned credentials are the primary cause of lateral movement in API breaches.

5. **Trust levels and network position** — Internal service mesh calls between fully trusted services in the same VPC may use mTLS with mutual certificate validation. Public internet clients use token-based schemes where the server is the only trust anchor. Partner integrations with known counterparties are candidates for client credentials OAuth2 with registered client IDs. Trust level determines whether the server validates only the token signature or also validates the calling network identity.

6. **Multi-factor and step-up authentication** — Sensitive operations (payment confirmation, account deletion, privilege escalation) should require step-up authentication even when the session is already authenticated. OAuth2 supports this via the `acr_values` and `max_age` parameters, which request a higher assurance level or require recent re-authentication. Step-up flows keep the baseline token lifetime short while protecting high-risk operations without forcing a full re-login for every request.

### Worked Example

**GitHub's API authentication landscape** illustrates how a single production API serves all four client types with distinct schemes.

**Personal access token (API key model) — server scripts and CI:**

```http
GET /repos/octocat/Hello-World
Authorization: Bearer ghp_1234567890abcdef
```

GitHub PATs are scoped at creation (e.g., `repo`, `read:org`) and are associated with the creating user. Rotating them requires generating a new token through the GitHub UI and updating all consumers.

**OAuth2 authorization code + PKCE — user-delegated GitHub Apps:**

```http
GET /user
Authorization: Bearer ghu_oauthAccessToken
```

The OAuth2 flow issues a short-lived `ghu_` access token and a long-lived refresh token. GitHub Apps can request only the scopes required for their function and tokens are revocable per installation.

**GitHub App installation tokens — machine-to-machine (client credentials analog):**

```http
POST /app/installations/12345678/access_tokens
Authorization: Bearer <signed-JWT-from-private-key>

→ 201 Created
{ "token": "ghs_xxxx", "expires_at": "2024-01-01T01:00:00Z" }
```

Installation tokens expire in 1 hour and are scoped to the repositories the app is installed on — demonstrating minimum-privilege machine tokens.

### Anti-Patterns

1. **Using a single admin API key for all integrations.** Issuing one key with full access to every partner, CI pipeline, and internal service means any single compromise grants full access. Every integration must receive its own credential scoped to only the operations it requires.

2. **Passing credentials in query parameters.** `GET /api/orders?api_key=sk_live_...` logs the key in every access log, CDN log, browser history entry, and referrer header. This is a data breach waiting for a log aggregator. Always use `Authorization` headers.

3. **JWTs without expiry or revocation.** A JWT with `"exp": null` or a 10-year expiry is an irrevocable credential. If the signing key leaks, all issued tokens are permanently compromised until the key rotates. Use 15–60 minute expiry with refresh token rotation, or maintain a server-side revocation list.

4. **Treating authentication and authorization as the same problem.** Authentication confirms identity ("who is this client?"); authorization determines permission ("can this client do this operation?"). Mixing them — using different API keys for different permission levels instead of scopes — creates credential sprawl and makes permission audits impossible.

## Details

### mTLS for Service-to-Service Authentication

Mutual TLS authenticates both the client and server using X.509 certificates, making it the highest assurance scheme for internal service mesh calls. The client presents a certificate signed by a trusted CA; the server validates it against its trust store and extracts the client identity from the subject. Unlike token-based schemes, mTLS has no credential to steal from memory — the private key never leaves the client process. Istio, Linkerd, and AWS App Mesh provision mTLS automatically between mesh-enrolled services using short-lived certificates rotated by the control plane. The cost is certificate lifecycle management and the requirement that all services are mesh-enrolled.

### JWT Validation Requirements

A server accepting JWTs must validate: the signature against the JWKS endpoint of the issuer, the `iss` (issuer) claim matches the expected identity provider, the `aud` (audience) claim contains the API's identifier, the `exp` (expiration) has not passed, and the `nbf` (not before) has passed. Skipping any validation — especially `aud` — allows tokens issued for other services to be replayed against your API.

### Real-World Case Study: Twilio Auth Scheme Migration

Twilio's API originally used HTTP Basic Auth with Account SID and Auth Token, passing credentials on every request. After observing widespread Auth Token exposure in public GitHub repositories (their long-lived master credential), Twilio introduced API Keys — short-lived rotating credentials scoped to individual integrations. Customers who adopted API Keys reduced their credential breach surface by 90%: a leaked API key could be revoked immediately without rotating the master Auth Token, which would invalidate all integrations simultaneously. Twilio's documentation now defaults all code examples to API Keys, steering new integrations away from the master credential pattern.

## Source

- [Auth0 — Authentication and Authorization Flows](https://auth0.com/docs/get-started/authentication-and-authorization-flow)
- [OWASP REST Security Cheat Sheet — Authentication](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html)
- [RFC 6749 — The OAuth 2.0 Authorization Framework](https://datatracker.ietf.org/doc/html/rfc6749)
- [Google API Design Guide — Authentication](https://cloud.google.com/apis/design/security)
- [GitHub Authentication Documentation](https://docs.github.com/en/rest/authentication)

## Process

1. Identify the client type for each integration: browser user, mobile user, server-to-server, CLI, or embedded device — each maps to a specific auth scheme.
2. Define token lifetimes: access tokens 15–60 minutes, refresh tokens 30–90 days with rotation, API keys indefinite with explicit rotation policy.
3. Assign minimum required scopes to each credential at issuance time; document scope definitions in the API style guide.
4. Implement `Authorization` header transmission everywhere; reject query parameter credentials at the gateway with a 400 response and a developer-facing error message.
5. Run `harness validate` to confirm skill files are well-formed and related skills are correctly cross-referenced.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.
- **related_skills:** api-api-keys, api-oauth2-flows, security-authentication, owasp-auth-patterns, api-rate-limiting

## Success Criteria

- Every API integration uses a credential scoped to only the operations it requires, with no shared admin credentials across integrations.
- All credential transmission uses `Authorization` headers; query parameter credential passing is blocked at the gateway.
- Token expiry is set on all issued tokens; JWTs have a maximum 60-minute lifetime unless a refresh flow is in place.
- Authentication scheme selection is documented per client type in the API style guide.
- Step-up authentication is required for sensitive operations (payment, deletion, privilege change) regardless of existing session state.
