# Session Management

> Session tokens are bearer credentials -- generate with CSPRNG, bind to client context, enforce idle and absolute timeouts, and regenerate on privilege changes

## When to Use

- Designing the authentication and session layer of a web application
- Choosing between server-side sessions and JWTs (stateless tokens)
- Reviewing session cookie configuration for security gaps
- Implementing session timeout and revocation policies
- Investigating session hijacking or session fixation vulnerabilities
- Adding "remember me" functionality or concurrent session controls

## Threat Context

Session hijacking -- stealing a valid session token -- gives an attacker full access to the victim's account without knowing the password.
The attack surface is broad:

- **Network sniffing** on unencrypted connections (mitigated by TLS and the Secure cookie flag)
- **Cross-site scripting** that reads `document.cookie` (mitigated by HttpOnly)
- **Session fixation** where the attacker pre-sets the session ID before the victim authenticates
- **Cross-site request forgery** that rides on automatically-attached cookies (mitigated by SameSite)
- **Client-side token theft** from malware, browser extensions, or shared computers

The consequences are severe.
The 2023 Okta support breach exploited stolen session tokens embedded in HAR files (HTTP archive recordings that included cookies) to access customer admin accounts.
The 2022 GitHub OAuth token theft allowed attackers to download private repositories by stealing OAuth session tokens from Heroku and Travis CI integrations.
In both cases, the attackers never needed passwords -- the session token was the credential.

Session management is the bridge between authentication (proving identity) and authorization (enforcing permissions).
A flaw in session management undermines both, regardless of how strong the password hashing or access control system is.

## Instructions

1. **Generate session tokens with a CSPRNG.**
   Use a cryptographically secure pseudorandom number generator to produce tokens with a minimum of 128 bits of entropy (32 hex characters or 22 base64 characters).
   Use the platform's dedicated cryptographic random generator:
   - Node.js: `crypto.randomBytes(32)`
   - Python: `os.urandom(32)` or `secrets.token_hex(32)`
   - Java: `SecureRandom.getInstanceStrong()`
   - Go: `crypto/rand.Read`

   Never use `Math.random()`, sequential database IDs, timestamps, user IDs, or any predictable value.
   The token must be computationally infeasible to guess even if the attacker knows the generation algorithm.

2. **Configure session cookies with all security flags.**
   Every session cookie must have:
   - `Secure`: Transmit only over HTTPS. Prevents session tokens from being exposed on unencrypted connections. Without this flag, a single HTTP request (even caused by a mixed-content resource) leaks the token.
   - `HttpOnly`: Inaccessible to JavaScript via `document.cookie`. Prevents XSS attacks from reading the session token. This is the single most effective mitigation against XSS-based session theft.
   - `SameSite=Lax` (minimum) or `SameSite=Strict`: Controls when cookies are sent on cross-origin requests. `Strict` never sends the cookie on cross-origin requests (maximum protection, but breaks inbound links that should maintain login state). `Lax` sends the cookie on top-level navigations (GET requests from external links) but not on cross-origin subresources or POST requests. Use `Strict` for high-security applications (banking, healthcare); `Lax` for applications where users follow links from email or external sites.
   - `Path=/`: Scope the cookie to the entire application. Avoid overly narrow paths that create confusion about which requests include the session.
   - `Domain`: Set explicitly to the exact domain. Omitting the Domain attribute restricts the cookie to the exact origin (most restrictive and safest default). Setting Domain to a parent domain (e.g., `.example.com`) shares the session across all subdomains, which expands the attack surface.
   - Short `Max-Age` or `Expires`: Align with your absolute timeout policy. For session cookies (no persistence), omit both attributes so the cookie is deleted when the browser closes.

3. **Regenerate the session ID on every authentication state change.**
   After successful login, privilege escalation (entering admin mode, impersonating another user), password change, MFA enrollment, or any change in the user's security context, issue a completely new session token and invalidate the previous one server-side.

   This is the primary defense against session fixation, where an attacker plants a known session ID in the victim's browser (via URL parameter, cookie injection on a subdomain, or meta tag injection) before the victim logs in.
   Without regeneration, the attacker's pre-set session ID becomes authenticated when the victim completes login.

4. **Enforce dual timeouts with server-side tracking.**
   - **Idle timeout** (15-30 minutes for sensitive applications like banking and healthcare; 2-8 hours for low-risk applications): If the user performs no server-recognized activity for this duration, invalidate the session. Track the last-activity timestamp on the server, not the client. Client-side timers are trivially bypassable.
   - **Absolute timeout** (8-24 hours): Maximum session lifetime regardless of activity. Forces periodic re-authentication. Critical for limiting the damage window if a token is stolen -- even an actively-used stolen token expires at the absolute timeout. For high-security contexts, absolute timeouts of 1-4 hours are appropriate.

   Store both timestamps (`last_activity`, `created_at`) in the server-side session record and check both on every request.

5. **Implement immediate server-side revocation.**
   Maintain a server-side session store (database table, Redis, Memcached) that maps session tokens to session records.
   When the user logs out, changes their password, is administratively suspended, or triggers a security event, delete the session record from the store.
   The next request with the old token fails authentication immediately.

   This is the fundamental limitation of stateless JWTs for session management: a JWT cannot be revoked before its `exp` claim without maintaining a server-side blocklist, which negates the stateless benefit.

6. **Bind sessions to client context for theft detection.**
   At session creation, record the client's IP address (or IP prefix for mobile users on carrier NAT), User-Agent string, and optionally the TLS client certificate fingerprint or device identifier.
   On subsequent requests, compare current values against the recorded ones.

   If the IP address changes to a different geographic region, or the User-Agent changes entirely, require step-up authentication (re-enter password or complete MFA) rather than silently accepting the request.
   This does not prevent token theft but limits its utility -- a token stolen and used from a different continent or browser triggers re-authentication.

7. **JWT-specific guidance when JWTs are used for sessions.**
   Keep access token expiry short (5-15 minutes).
   Use a separate refresh token stored in an HttpOnly Secure cookie to obtain new access tokens.
   Store refresh tokens server-side (in a database) for revocability.
   Never store JWTs in localStorage or sessionStorage -- both are accessible to JavaScript and therefore vulnerable to XSS.

   Sign with asymmetric algorithms (RS256, ES256, EdDSA) so that services can verify tokens without possessing the signing key.
   Validate all claims on every request: `iss`, `aud`, `exp`, `nbf`, `sub`.
   Reject tokens with `alg: none` or unexpected algorithms (the `alg` confusion attack).

## Details

### Server-Side Sessions vs. JWTs

Server-side sessions store session state on the server; the session token sent to the client is an opaque random identifier that maps to a server-side record.
JWTs store session state in the token itself (self-contained claims signed by the server).

**Server-side sessions** are inherently revocable (delete the server-side record), support arbitrary session data without size concerns, and do not expose session metadata to the client.
The cost is a session store (Redis or database) that must be available on every request.

**JWTs** are not revocable without a server-side blocklist, which introduces the same infrastructure dependency as server-side sessions while adding complexity.
JWT payloads are base64-encoded (not encrypted) and expose claims to the client and any intermediary.
JWTs grow in size with additional claims and are transmitted on every request.

For most web applications, server-side sessions backed by Redis are simpler, more secure, and more operationally straightforward.
JWTs are appropriate for short-lived access tokens in microservice architectures where an API gateway validates the JWT and downstream services trust the gateway's authentication decision.

### The "Remember Me" Pattern

A persistent login token with a 30-90 day expiry, stored in a separate HttpOnly Secure cookie distinct from the session cookie.

Implementation:

1. Generate a random token (128+ bits)
2. Store it hashed (SHA-256) in a database table alongside the user ID and expiry timestamp
3. Never store the persistent token in plaintext -- if the database is breached, plaintext tokens allow immediate account access

When the session expires but the persistent token is valid, create a new session with restricted privileges: allow reading and browsing but require re-authentication for sensitive operations (changing password, modifying payment methods, accessing sensitive data).

After using the persistent token, rotate it: invalidate the current token and issue a new one.
This limits the window of a stolen persistent token.

### Concurrent Session Controls

Decide whether a user can have multiple simultaneous sessions across devices:

- **Unlimited sessions** (most common): Simple, user-friendly, but a compromised token on one device is not invalidated by activity on another.
- **Limit to N sessions**: When the user exceeds N sessions, revoke the oldest. Provides a natural cap on exposure.
- **Single session only**: Each new login invalidates all previous sessions. Maximum security but poor UX for users with multiple devices.
- **Visibility and selective revocation**: Show the user their active sessions (device, location, last active) and allow them to revoke individual sessions. This is the modern best practice for consumer and enterprise applications alike.

### Session Storage Backend Selection

The session store must support:

- Fast reads on every request (sub-millisecond latency)
- Atomic writes for session creation and update
- TTL-based expiration for automatic cleanup
- Deletion for immediate revocation

Common choices:

- **Redis**: Sub-millisecond latency, built-in TTL, widely supported by session middleware. The most common choice for production session stores.
- **Memcached**: Similar performance to Redis but no persistence. Acceptable for sessions (which are ephemeral) but lost sessions force re-authentication on restart.
- **Database (PostgreSQL, MySQL)**: Higher latency but simpler infrastructure. Acceptable for applications with moderate traffic. Use a TTL column and periodic cleanup job.
- **In-memory (application process)**: Not suitable for production. Sessions are lost on restart and not shared across instances.

### Token Entropy Requirements

OWASP recommends a minimum of 128 bits of entropy for session identifiers.
This produces a token space of 2^128 (approximately 3.4 x 10^38) possible values.

For context: if an attacker can try 10 billion tokens per second, exhausting a 128-bit space would take approximately 10^19 years.
Even with optimistic attack assumptions, 128 bits provides a comfortable margin.

Use 256-bit tokens when defense in depth is warranted (high-security applications, tokens that may be long-lived).

## Anti-Patterns

1. **Session tokens in URLs.**
   Query parameters appear in browser history, server access logs, Referer headers sent to third-party resources, and proxy logs.
   A URL like `/dashboard?session=abc123` leaks the session to every linked resource, every log aggregator, and every browser extension with history access.
   Session tokens must be in cookies (preferred for web applications) or Authorization headers (for APIs).

2. **Not regenerating the session ID after login.**
   This is the textbook session fixation vulnerability.
   The attacker sets the victim's session ID to a known value (via a crafted link, a subdomain cookie injection, or a meta tag).
   The victim logs in.
   The server associates the attacker's known session ID with the victim's authenticated identity.
   The attacker now has an authenticated session.

3. **Storing JWTs in localStorage.**
   `localStorage` is accessible to any JavaScript executing in the page's origin.
   A single XSS vulnerability -- whether from a dependency, a user-generated content rendering flaw, or a third-party script -- can exfiltrate every JWT in localStorage.
   Unlike cookies with HttpOnly, there is no browser-level protection.
   Use HttpOnly Secure cookies for all token storage in web applications.

4. **No idle timeout.**
   A session that lives until the absolute timeout (or forever, if no absolute timeout exists) on an unattended browser is an open door.
   Shared workstations, kiosk computers, stolen laptops, and unlocked phones all provide persistent access to anyone with physical proximity.
   Idle timeouts force re-authentication after periods of inactivity.

5. **Logout that only clears the client-side cookie.**
   If the server-side session record is not invalidated, an attacker who captured the session token before logout can continue using it.
   Server-side invalidation is mandatory.
   The client-side cookie deletion is a UX convenience, not a security control.

6. **Using predictable session identifiers.**
   Sequential database IDs, timestamps, user IDs, or any value an attacker can guess or enumerate.
   If the session token space is predictable, an attacker can iterate through valid tokens without stealing them.
   Session tokens must have at least 128 bits of entropy from a CSPRNG.

7. **Trusting client-reported timeout state.**
   Implementing idle timeout by having client JavaScript report "I am still active" and resetting the server timer.
   An attacker with a stolen token can trivially send keep-alive requests.
   Idle timeout must be measured server-side by tracking the timestamp of the last legitimate request processed.
