# API Keys

> API KEY DESIGN IS A SECURITY CONTRACT — ENTROPY REQUIREMENTS PREVENT BRUTE FORCE, SCOPING LIMITS BLAST RADIUS, HASHED STORAGE PREVENTS DATABASE DUMPS FROM BECOMING CREDENTIAL LISTS, AND ROTATION STRATEGY DETERMINES HOW QUICKLY A COMPROMISED KEY CAN BE CONTAINED.

## When to Use

- Designing the API key subsystem for a new developer platform or API product
- Auditing an existing key management implementation for security gaps
- Deciding between query parameter and header transmission for a legacy API migration
- Implementing key rotation for a service that currently uses long-lived static credentials
- Setting policy on key scoping and permission granularity for a multi-tenant API
- Responding to a security incident where an API key was exposed in a public repository
- Writing the API key section of an API style guide or security design document

## Instructions

### Key Concepts

1. **Entropy requirements** — A secure API key must contain at least 128 bits of cryptographic randomness, generating a key of at least 32 characters when base-62 encoded. Use a cryptographically secure random number generator (CSPRNG): `crypto.randomBytes(32)` in Node.js, `secrets.token_urlsafe(32)` in Python, or `SecureRandom` in Java. Dictionary words, sequential IDs, and UUIDs v4 have known entropy floors and predictable structure that makes offline attacks feasible. Prefix the key with a service identifier (`sk_example_`, `ghp_`, `stripe_`) to enable secret scanning tools (GitHub Advanced Security, truffleHog) to detect accidental exposure.

2. **Key scoping and permissions** — Every key must be issued with an explicit permission scope, not as a global admin credential. Scopes should be granular enough to express the minimum privilege needed: `orders:read`, `inventory:write`, `webhooks:manage`. At issuance, the consumer selects the scopes required for their integration; the server enforces them on every request. A key scoped to `orders:read` must not be accepted on a `POST /orders` endpoint. Scoped keys contain breach impact to only the operations the key was authorized for.

3. **Transmission — Authorization header only** — API keys must be transmitted in the `Authorization` header: `Authorization: Bearer sk_example_...` or `Authorization: ApiKey sk_example_...`. Query parameter transmission (`?api_key=...`) exposes the key in access logs, CDN logs, browser history, referrer headers, and URL-sharing patterns. TLS protects header values from eavesdropping; it does not protect query parameters from being logged. Any API accepting credentials via query parameters must be treated as compromised until migrated.

4. **Storage — hash, never store plaintext** — The server must store a one-way hash of the API key, never the key itself. Use HMAC-SHA256 or bcrypt against the key value; store the hash in the database. When validating, hash the incoming key and compare against the stored hash. The full key is shown to the user exactly once at creation time — after that it is irrecoverable. This means a database dump does not give an attacker working credentials. Stripe, GitHub, and Twilio all follow this pattern: their support teams cannot retrieve a key, only revoke it.

5. **Rotation strategy** — Keys must be rotatable without service downtime. The rotation flow: generate new key → consumer updates their configuration → old key is deprecated (still valid) → old key is revoked after a grace period. Overlapping validity windows (new and old key both valid for 24–72 hours) prevent hard cutover outages. For automated rotation, platforms should offer a key rotation API that generates the new key and schedules the old key's revocation in a single call. GitHub, AWS IAM, and HashiCorp Vault all support overlapping key validity during rotation.

6. **Key identification and audit** — Each key should have a stable, non-secret identifier (a key ID or prefix) that appears in audit logs without exposing the key value. `GET /api-keys/key_abc123` returns the key's metadata (scopes, created date, last used, owner) but never the key value. Audit logs should record every request with the key ID and the operation performed — enabling incident response to determine which key was used and what it accessed.

### Worked Example

**Stripe API key design** is the industry reference for API key best practices at scale.

**Key creation — only one exposure:**

```http
POST /v1/restricted_keys
Authorization: Bearer sk_example_master_...
Content-Type: application/x-www-form-urlencoded

name=CI+Pipeline&permissions[orders][read]=true
```

```json
{
  "id": "rk_example_abc123",
  "name": "CI Pipeline",
  "secret": "rk_example_abc123xxxxxxxxxxxxxxxxxxx",
  "permissions": { "orders": ["read"] },
  "created": 1704067200
}
```

The `secret` field is returned only in this response. Stripe's database stores `HMAC-SHA256(secret)`. A subsequent `GET /v1/restricted_keys/rk_example_abc123` returns metadata but never the `secret` field.

**Key transmission — Authorization header:**

```http
GET /v1/charges?limit=10
Authorization: Bearer rk_example_abc123xxxxxxxxxxxxxxxxxxx
```

**Key rotation — overlapping validity:**

```http
POST /v1/restricted_keys/rk_example_abc123/rotate
Authorization: Bearer sk_example_master_...
Content-Type: application/x-www-form-urlencoded

grace_period_hours=48
```

```json
{
  "new_key": { "id": "rk_example_def456", "secret": "rk_example_def456..." },
  "old_key": { "id": "rk_example_abc123", "expires_at": 1704240000 }
}
```

Both keys are valid for 48 hours, giving the consumer time to update their configuration before the old key expires.

### Anti-Patterns

1. **Storing keys in plaintext.** A plaintext key database is a single query away from a complete credential compromise. An attacker with read access to the `api_keys` table can impersonate every customer. Always store hashed values; accept the operational cost of irrecoverable keys as a necessary security trade-off.

2. **Issuing global admin keys for integrations.** Every CI pipeline, partner integration, and internal service that receives a master admin key expands the blast radius of any single key exposure to full account takeover. Scope keys to the minimum required permissions; create separate keys per integration.

3. **Accepting keys in query parameters.** Beyond the log exposure risk, query parameter keys end up in browser bookmarks, shared links, Slack messages, and error report URLs. The migration cost of moving to header transmission is always less than the cost of a key exposure incident from log analysis.

4. **No key rotation mechanism.** Keys that cannot be rotated without a service outage will not be rotated. Teams accept the security risk of old keys indefinitely because the rotation cost is too high. Design overlapping validity windows into the rotation flow from day one.

## Details

### Secret Scanning Integration

The `sk_example_` / `ghp_` / `AIza` prefix patterns used by major API providers enable automated secret scanning to detect accidental key exposure in version control, CI logs, and issue trackers. GitHub Advanced Security, truffleHog, and GitLeaks all ship with detection patterns for known prefixes. When designing a key prefix, register the pattern with the GitHub Secret Scanning Partner Program — GitHub will notify your platform when matching patterns are detected in public repositories, enabling proactive revocation before exploitation. Stripe's partner integration with GitHub has prevented thousands of key exposures since its introduction.

### HMAC Request Signing as an Alternative

For high-security integrations where replay attack prevention matters, HMAC request signing replaces bearer token transmission entirely. The client generates a signature over the request method, path, timestamp, and body using a shared secret: `HMAC-SHA256(secret, "POST\n/orders\n1704067200\n{...body...}")`. The server recomputes the signature and compares. AWS Signature Version 4 and Stripe webhook signatures use this pattern. HMAC signing prevents replay attacks (the timestamp window is typically ±5 minutes) and credential transmission — the secret never appears on the wire.

### Real-World Case Study: GitHub PAT Token Format Migration

In 2021, GitHub migrated from opaque 40-character hex PATs to structured tokens with type prefixes (`ghp_`, `gho_`, `ghs_`, `ghr_`). The motivation: the old format was undetectable by secret scanning — any 40-character hex string could be a GitHub token or a SHA-1 hash. The new format enabled GitHub's secret scanning to detect PATs in public repositories and immediately notify and offer revocation. In the first year post-migration, GitHub detected and auto-revoked over 1.7 million exposed tokens before they were exploited. The lesson: key format is a security feature, not just a UX decision.

## Source

- [OWASP REST Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html)
- [GitHub PAT Token Format Migration](https://github.blog/2021-04-05-behind-githubs-new-authentication-token-formats/)
- [Stripe API Keys Documentation](https://stripe.com/docs/keys)
- [NIST SP 800-132 — Recommendation for Password-Based Key Derivation](https://csrc.nist.gov/publications/detail/sp/800-132/final)
- [Google Secret Manager — Best Practices](https://cloud.google.com/secret-manager/docs/best-practices)

## Process

1. Generate keys using a CSPRNG with at least 128 bits of entropy; prefix with a service identifier for secret scanning compatibility.
2. Store only the HMAC-SHA256 hash of the key in the database; return the full key to the user exactly once at creation time.
3. Require scope selection at key creation time; enforce scopes on every request at the gateway or middleware layer.
4. Implement overlapping validity rotation: new key valid immediately, old key valid for a configurable grace period before revocation.
5. Run `harness validate` to confirm skill files are well-formed and related skills are correctly cross-referenced.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.
- **related_skills:** api-authentication-patterns, owasp-secrets-management, security-authentication, api-rate-limiting

## Success Criteria

- All API keys are generated with at least 128 bits of CSPRNG entropy and a service-specific prefix.
- Keys are stored as one-way hashes (HMAC-SHA256 or bcrypt); the plaintext value is never persisted after the creation response.
- Keys are transmitted exclusively via `Authorization` headers; query parameter transmission is rejected at the gateway.
- Every key has an explicit scope; requests with insufficient scope return 403 before reaching business logic.
- A key rotation flow exists that supports overlapping validity windows with no service downtime.
