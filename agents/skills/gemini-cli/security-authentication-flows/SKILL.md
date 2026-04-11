# Authentication Flows

> Login, registration, password reset, magic links, and SSO -- each flow has distinct attack surfaces and each must be hardened independently

## When to Use

- Designing authentication for a new application from scratch
- Adding password reset, magic link, or SSO to an existing system
- Auditing existing authentication flows for enumeration, fixation, or brute-force vulnerabilities
- Integrating OAuth 2.0 / OIDC with an identity provider
- Implementing passwordless authentication

## Threat Context

Authentication flows are the primary target for credential stuffing (automated login attempts using breached credentials), account enumeration (determining valid usernames via differing error messages or response times), and session fixation (forcing a known session ID before authentication). The 2021 Facebook data scrape extracted 533 million phone numbers by exploiting the "forgot password" flow's account enumeration behavior -- the flow revealed whether a phone number was registered.

Password reset flows are frequently the weakest link: the 2012 Dropbox breach started with a reused password, but the 2016 disclosure of 68 million accounts was enabled by password reset token predictability. The 2020 SolarWinds SAML golden ticket attack demonstrated that SSO misconfiguration can compromise an entire organization from a single forged assertion. OAuth misconfiguration (open redirects, missing state validation) has been exploited in attacks against Microsoft, Facebook, and Google accounts.

## Instructions

1. **Login flow.** Return identical error messages for "user not found" and "wrong password" -- both should produce "Invalid credentials." Responses must be identical in content, HTTP status code, response size, and timing. Enforce rate limiting per username and per IP: 5 failed attempts trigger a 15-minute lockout per account, 20 failed attempts from one IP trigger a CAPTCHA. Issue a new session ID after successful login (prevents session fixation). Set session cookies with `Secure`, `HttpOnly`, and `SameSite=Lax` flags. Log every authentication attempt (success and failure) with timestamp, IP, user agent, and outcome for security monitoring.

2. **Registration flow.** Validate email ownership before account activation by sending a verification link containing a CSPRNG token (128+ bits). Set token expiration to 24 hours. Prevent account enumeration: if the email already exists, still display "verification email sent" to the registering user, but send the existing account holder a notification ("someone tried to register with your email -- if this was not you, no action is needed"). Never reveal whether an email is already registered through the registration API response, response timing, or HTTP status code.

3. **Password reset flow.** Generate a CSPRNG token (128+ bits), single-use, expiring in 1 hour. Send via email. On submission, invalidate the token immediately (single use prevents the link from being reused if intercepted). Do not reveal whether the email exists -- always display "If an account with this email exists, we sent a reset link." Rate-limit reset requests per email address (max 3 per hour) and per IP (max 10 per hour). When a user changes their password from an authenticated session, require the current password or a fresh MFA challenge to prevent session-hijack-to-password-change attacks.

4. **Magic link flow.** A passwordless authentication flow: user enters email, receives a link containing a CSPRNG token, clicks to authenticate. The token must be single-use, short-lived (15 minutes maximum), and ideally bound to the requesting session or device fingerprint to prevent link forwarding. Email becomes the sole authentication factor -- this means email account compromise equals application account compromise. Evaluate whether this trade-off is acceptable for your threat model. Magic links are vulnerable to email interception, forwarding, and preview pane rendering (some email clients and security scanners fetch URLs automatically, potentially consuming the single-use token).

5. **SSO / OAuth 2.0 / OIDC integration.** Use Authorization Code flow with PKCE (RFC 7636) for all clients, including server-side applications. PKCE prevents authorization code interception even if the redirect happens over an insecure channel. Validate the `state` parameter to prevent CSRF on the OAuth callback. Validate the `nonce` in the ID token to prevent replay attacks. Validate the token issuer (`iss`), audience (`aud`), and expiration (`exp`). Verify the token signature using the IdP's published JWKS. Never use the Implicit flow -- it exposes tokens in URL fragments, browser history, and referrer headers. OAuth 2.1 formally deprecates the Implicit flow.

6. **Account lockout vs rate limiting.** Hard lockout (disable the account after N failed attempts) enables denial of service: an attacker can lock out any targeted account by intentionally submitting wrong passwords repeatedly. Prefer progressive delays: attempts 1-5 are instant, attempts 6-10 incur a 30-second delay, attempts 11+ incur a 5-minute delay and CAPTCHA. Combine per-account delays with per-IP rate limiting and global anomaly detection (alert on distributed credential stuffing patterns: many accounts failing from many IPs at elevated rates).

## Details

### Account Enumeration Taxonomy

Applications leak account existence through multiple channels, and all must be addressed simultaneously:

- **Error message differences:** "User not found" vs "Wrong password" directly reveals registration status. Return identical messages for all failure modes.

- **Timing differences:** Password hash comparison takes measurable time (bcrypt at cost 12 takes ~250ms), but returning immediately for non-existent users is fast (~1ms). An attacker can distinguish registered from unregistered accounts by measuring response time. Defense: always hash a dummy password even when the user does not exist, ensuring constant processing time regardless of account existence.

- **HTTP status codes:** Returning 404 for non-existent users and 401 for wrong passwords leaks the same information as different error messages. Use the same status code (401 or 200 with error body) for both cases.

- **Response body size:** Different error messages may have different byte lengths, detectable even over TLS (traffic analysis). Pad responses to identical sizes or use a generic response structure.

- **Registration and reset flows:** "This email is already registered" on the registration form and "No account with this email" on the reset form both reveal account existence. Both must be addressed with the same "always succeed" pattern described in the Instructions section.

### OAuth 2.0 / OIDC Security Checklist

A complete OAuth/OIDC integration must verify all of the following. Missing any single check creates an exploitable vulnerability:

1. **`state` parameter:** Generate a CSPRNG value, store in the session, include in the authorization request, verify on callback. Prevents CSRF attacks that link the victim's account to the attacker's IdP identity.

2. **PKCE (`code_verifier` / `code_challenge`):** Generate a random verifier, hash it as the challenge, send the challenge in the authorization request, send the verifier in the token exchange. Prevents authorization code interception.

3. **`nonce` in ID token:** Include a random nonce in the authorization request, verify it appears in the returned ID token. Prevents token replay from a previous authentication session.

4. **Issuer (`iss`) validation:** The ID token issuer must match the expected IdP. Prevents token substitution from a different IdP.

5. **Audience (`aud`) validation:** The ID token audience must include your client ID. Prevents tokens intended for a different application from being accepted by yours.

6. **Signature verification:** Verify the ID token signature using the IdP's JWKS endpoint keys. Cache keys but support rotation (refetch on `kid` mismatch).

7. **Expiration (`exp`) and issued-at (`iat`):** Reject expired tokens. Reject tokens with `iat` too far in the past (clock skew tolerance of 30-60 seconds is typical).

8. **`redirect_uri` validation:** The callback URL must exactly match the registered redirect URI. No wildcards, no path traversal, no open redirects.

9. **Token storage:** Store access tokens and refresh tokens in httpOnly cookies or server-side sessions. Never in localStorage (XSS-extractable) or URL parameters (logged everywhere).

10. **Token refresh with rotation:** When refreshing, the IdP should issue a new refresh token and invalidate the old one. This limits the window of exposure for a stolen refresh token.

### Passwordless Authentication Comparison

| Method                   | Phishing Resistant | Email Dependent      | Device Dependent             | Recovery Complexity   |
| ------------------------ | ------------------ | -------------------- | ---------------------------- | --------------------- |
| Magic links              | No                 | Yes                  | No                           | Low (email access)    |
| WebAuthn/Passkeys        | Yes                | No                   | Yes (synced passkeys reduce) | Medium (backup key)   |
| Email OTP (6-digit code) | No                 | Yes                  | No                           | Low (email access)    |
| SMS OTP                  | No                 | No (phone dependent) | Yes                          | Medium (SIM recovery) |

Magic links and email OTP are functionally equivalent in security -- both depend entirely on email account security. WebAuthn/passkeys are the only phishing-resistant passwordless option. Synced passkeys (iCloud, Google) reduce device dependency but introduce cloud account security as a dependency. For high-security applications, non-synced hardware keys (YubiKey) provide the strongest guarantees at the cost of recovery complexity.

### Credential Stuffing Defense Architecture

Credential stuffing is the automated injection of breached username/password pairs into login forms. At scale, attackers use botnets to distribute attempts across thousands of IP addresses, defeating simple per-IP rate limiting.

A layered defense architecture:

1. **Layer 1 -- Rate limiting:** Per-account limits (5 failures per 15 minutes), per-IP limits (20 failures per hour), and global limits (alert on >1000 failures per minute across all accounts).
2. **Layer 2 -- CAPTCHA escalation:** After exceeding the per-account threshold, require CAPTCHA. Use invisible CAPTCHA initially (no friction for legitimate users) and escalate to interactive CAPTCHA after further failures.
3. **Layer 3 -- Credential breach checking:** On successful login, check the password against known breach databases (Have I Been Pwned API with k-anonymity, or a local bloom filter of breached password hashes). If the password appears in a breach database, force a password change.
4. **Layer 4 -- Anomaly detection:** Monitor login patterns for distributed attacks (many accounts failing from many IPs in a short window). This catches botnets that stay under per-IP limits.
5. **Layer 5 -- MFA:** The strongest defense. Even if the credential is valid, the attacker cannot complete authentication without the second factor.

### Session Fixation Prevention

The session fixation attack proceeds in three steps:

1. The attacker obtains a valid, unauthenticated session ID from the application (by visiting the login page).
2. The attacker injects this session ID into the victim's browser via a URL parameter like `?JSESSIONID=abc123`, cookie injection through a subdomain the attacker controls, or a meta tag injection via XSS.
3. The victim logs in using the attacker's session ID. The server authenticates the session but does not change the ID. The attacker now holds an authenticated session because they know the session ID.

Defense: always regenerate the session ID upon successful authentication. In most frameworks this is an explicit call:

- **Express (Node.js):** `request.session.regenerate(callback)`
- **Java Servlet:** `session.invalidate()` followed by `request.getSession(true)`
- **Rails:** `request.reset_session` or `request.session.options[:renew] = true`
- **Django:** `request.session.cycle_key()`
- **Flask:** `session.regenerate()` (with Flask-Session)
- **Spring Security:** Handled automatically by `SessionFixationProtectionStrategy`

Never accept session IDs from URL parameters -- session IDs must travel exclusively in cookies with `Secure`, `HttpOnly`, and `SameSite` attributes.

### Authentication Event Logging

Every authentication-related event should be logged for security monitoring, incident response, and compliance:

- **Login success:** Timestamp, user ID, IP address, user agent, authentication method (password, SSO, magic link, passkey), MFA method used, session ID (hashed)
- **Login failure:** Timestamp, attempted user ID, IP address, user agent, failure reason (invalid credentials, account locked, MFA failed, expired token)
- **Password change:** Timestamp, user ID, IP address, method (authenticated change vs reset token)
- **Password reset request:** Timestamp, email address, IP address (do not log whether the email exists)
- **MFA enrollment/removal:** Timestamp, user ID, factor type added or removed, IP address
- **Session termination:** Timestamp, user ID, reason (logout, timeout, forced invalidation)
- **OAuth events:** Authorization grants, token issuance, token refresh, token revocation, IdP errors

Store authentication logs separately from application logs with longer retention (1-2 years for compliance). Make them immutable (append-only) and tamper-evident. Alert on anomalous patterns: geographic impossibility, credential stuffing signatures, sudden spikes in failed MFA, and unusual OAuth grant patterns.

Authentication logs are the primary data source for detecting account compromise after the fact and for forensic investigation during incident response. They must be detailed enough to reconstruct the full authentication timeline for any user account.

### Choosing an Authentication Architecture

When designing authentication for a new application, choose one of these standard architectures based on the application type:

- **Server-rendered web application:** Session-based authentication with server-side session storage. Cookies carry the session ID. Password + MFA for authentication. CSRF protection via SameSite cookies and CSRF tokens.

- **Single-page application (SPA):** Backend-for-Frontend (BFF) pattern with the BFF server handling OAuth/OIDC and storing tokens server-side. The SPA communicates with the BFF via httpOnly session cookies. Avoid storing tokens in localStorage or sessionStorage.

- **Mobile application:** OAuth 2.0 Authorization Code with PKCE. Store tokens in the platform's secure storage (iOS Keychain, Android Keystore). Use refresh token rotation.

- **API service (machine-to-machine):** OAuth 2.0 Client Credentials flow with short-lived access tokens. Rotate client secrets on a schedule. Consider mTLS for service identity.

- **Microservices internal:** JWT tokens issued by a central auth service, verified by each microservice using the auth service's public key (JWKS). Short expiration (5-15 minutes) with no refresh -- services re-authenticate from the gateway token.

## Anti-Patterns

1. **Different error messages for login failures.** "User not found" vs "Incorrect password" reveals which emails are registered. This information fuels credential stuffing (confirms valid targets) and social engineering (confirms the victim uses your service). Always return "Invalid credentials" regardless of the specific failure mode.

2. **Password reset tokens that are predictable.** Using sequential IDs, timestamps, MD5(email), or any deterministic derivation as reset tokens. Tokens must be 128+ bits of CSPRNG output. Predictable tokens enable unauthenticated account takeover -- the most critical vulnerability class in web applications.

3. **OAuth Implicit flow.** Tokens in URL fragments are logged by web servers, proxy servers, browser extensions, and appear in referrer headers when navigating away from the page. The Implicit flow was formally deprecated by OAuth 2.1. Use Authorization Code with PKCE for all client types including SPAs.

4. **Storing OAuth tokens in localStorage.** Any XSS vulnerability can extract tokens from localStorage via `window.localStorage.getItem()`. Store access tokens in httpOnly, Secure cookies or in server-side sessions. If tokens must be accessible to client-side JavaScript (SPA architecture), use a Backend-for-Frontend (BFF) pattern that keeps tokens server-side and proxies authenticated requests.

5. **No rate limiting on login or password reset.** Without rate limiting, attackers can attempt millions of credential combinations per hour (credential stuffing) or flood the target with reset emails (email bombing, which may also trigger the email provider's rate limits and block legitimate emails to the victim). Rate limit by account, by IP, and apply global anomaly detection thresholds.

6. **Account lockout without progressive delays.** Hard lockout after 5 failures enables denial of service against any targeted user. An attacker who knows the victim's email can lock them out indefinitely by submitting wrong passwords. Use progressive delays (increasing wait time per failed attempt) and CAPTCHA escalation instead of binary lockout. Combine with per-IP rate limiting to catch distributed attacks.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** security-credential-storage, security-session-management, security-mfa-design, security-cryptographic-randomness, owasp-auth-patterns, owasp-csrf-protection, api-authentication-patterns

## Success Criteria

- The patterns described in this document are applied correctly in the implementation.
- Edge cases and anti-patterns listed in this document are avoided.
