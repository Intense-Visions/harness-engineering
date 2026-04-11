# API Webhook Security

> WEBHOOK SECURITY IS A RECEIVER-SIDE RESPONSIBILITY — SIGNATURE VERIFICATION, TIMESTAMP VALIDATION, AND SECRET ROTATION ARE THE THREE CONTROLS THAT PREVENT SPOOFED DELIVERIES, REPLAY ATTACKS, AND CREDENTIAL EXPOSURE, AND OMITTING ANY ONE OF THEM CREATES AN EXPLOITABLE GAP EVEN IF THE OTHER TWO ARE CORRECTLY IMPLEMENTED.

## When to Use

- Implementing a webhook receiver that needs to validate incoming deliveries from a provider (GitHub, Stripe, Twilio, Slack, etc.)
- Designing the signature scheme for a webhook system being built for external consumers
- Auditing an existing webhook handler for missing replay-attack defenses or insecure secret storage
- Writing the security section of a webhook integration guide or API style guide
- Rotating a compromised webhook secret without downtime for the receiving endpoint
- Adding timestamp tolerance enforcement to a handler that currently only checks signatures

## Instructions

### Key Concepts

1. **HMAC-SHA256 signature verification** — The provider computes an HMAC-SHA256 digest of the raw request body using the shared secret as the key, then encodes it as a hex string and sends it in a request header (e.g., `X-Hub-Signature-256: sha256=<hex>` for GitHub, `Stripe-Signature: t=<ts>,v1=<hex>` for Stripe). The receiver recomputes the same HMAC over the raw request body using the same secret and compares digests using a constant-time comparison function. If the digests match, the payload is authentic and unmodified. Always verify over the **raw** body bytes before any JSON parsing — any transformation (whitespace normalization, key reordering) will invalidate the signature.

2. **Timestamp validation and replay attack defense** — An attacker who captures a valid webhook delivery can replay it seconds, hours, or days later. The signature check alone cannot detect this because the replayed payload has a valid signature. The defense is to include a delivery timestamp in the signature computation (as Stripe does: `HMAC(secret, "<timestamp>.<body>")`) and reject deliveries where the timestamp is outside a tolerance window (typically ±5 minutes from now). The receiver must check the timestamp against the current server time. If the timestamp is stale, reject with 400 even if the signature is valid.

3. **Tolerance window configuration** — The tolerance window balances security and operational reliability. A 5-minute window is the industry standard (Stripe's default, GitHub's implicit delivery freshness guarantee). Narrower windows (e.g., 30 seconds) increase security but risk rejecting legitimate deliveries from providers with clock skew or delivery queue lag. Wider windows (e.g., 1 hour) make replay attacks trivial. Configure the tolerance window as an environment variable, not a hardcoded constant, so it can be tightened or widened without a deployment. Default to 300 seconds (5 minutes).

4. **Shared secret management** — Webhook secrets are credentials. Store them in a secrets manager (AWS Secrets Manager, HashiCorp Vault, GCP Secret Manager) or at minimum in environment variables — never in source code or configuration files committed to version control. Each webhook registration should have its own unique secret so that a compromised secret on one endpoint does not affect other registrations. Rotate secrets periodically (at minimum annually) and immediately on suspected compromise.

5. **Secret rotation without downtime** — Rotating a webhook secret requires a brief window where both the old and new secrets are valid. The procedure is: (1) generate a new secret, (2) update the receiver to accept signatures from either the old or new secret (dual-secret verification), (3) update the provider registration to use the new secret, (4) wait for in-flight deliveries signed with the old secret to drain (typically 5–10 minutes), (5) remove the old secret from the receiver. This prevents delivery failures during rotation. Stripe's `Stripe-Signature` header supports multiple signatures (`v1=<old_sig>,v1=<new_sig>`) explicitly to enable this pattern.

6. **TLS requirement and IP allowlisting** — All webhook endpoints must be served over HTTPS/TLS. A non-TLS endpoint exposes the raw payload and allows an on-path attacker to read or modify deliveries before they reach the receiver. Beyond TLS, providers publish the IP ranges from which they send webhook deliveries; receivers can add network-layer IP allowlisting as a defense-in-depth measure. GitHub publishes its hook delivery IP ranges via the `GET /meta` API endpoint; Stripe publishes theirs in their IP allowlisting documentation. IP allowlisting is defense-in-depth only — it does not replace signature verification.

### Worked Example

**GitHub webhook signature verification (Node.js)**

GitHub sends `X-Hub-Signature-256: sha256=<hex>` with every delivery.

```typescript
import * as crypto from 'crypto';
import type { Request, Response } from 'express';

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET!;
const TOLERANCE_SECONDS = 300; // 5 minutes

export function verifyGitHubWebhook(req: Request, res: Response, next: () => void): void {
  const signature = req.headers['x-hub-signature-256'] as string;
  const delivery = req.headers['x-github-delivery'] as string;

  if (!signature || !delivery) {
    res.status(400).json({ error: 'Missing required webhook headers' });
    return;
  }

  // Verify over raw body bytes — must use rawBody middleware upstream
  const rawBody = (req as any).rawBody as Buffer;
  const expected =
    'sha256=' + crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');

  // Constant-time comparison prevents timing attacks
  const sigBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');

  if (
    sigBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  next();
}
```

**Stripe webhook with timestamp validation**

Stripe's `Stripe-Signature` header format: `t=<unix_timestamp>,v1=<hex_signature>`

```typescript
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const ENDPOINT_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

export function verifyStripeWebhook(req: Request, res: Response, next: () => void): void {
  const sig = req.headers['stripe-signature'] as string;

  try {
    // stripe.webhooks.constructEvent handles timestamp check (±300s tolerance)
    const event = stripe.webhooks.constructEvent((req as any).rawBody, sig, ENDPOINT_SECRET);
    (req as any).stripeEvent = event;
    next();
  } catch (err: any) {
    // Returns 400 for both invalid signature and stale timestamp
    res.status(400).json({ error: `Webhook verification failed: ${err.message}` });
  }
}
```

Stripe's `constructEvent` internally computes `HMAC-SHA256(secret, "<timestamp>.<body>")`, checks that the computed signature appears in the `v1=` list, and rejects the delivery if the timestamp is older than 300 seconds.

**Secret rotation — dual-secret verification:**

```typescript
const secrets = [
  process.env.WEBHOOK_SECRET_NEW!,
  process.env.WEBHOOK_SECRET_OLD!, // remove after rotation drains
].filter(Boolean);

function verifyAnySecret(rawBody: Buffer, signature: string): boolean {
  return secrets.some((secret) => {
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  });
}
```

### Anti-Patterns

1. **Verifying over parsed JSON, not raw bytes.** Parsing the request body as JSON before computing the HMAC alters the byte sequence (key ordering, whitespace normalization). The receiver's computed digest will not match the provider's, causing valid deliveries to fail signature verification. Always preserve the raw request body in a buffer (Express `rawBody` middleware, Fastify `rawBody: true` option) and verify over it before any parsing.

2. **Using string equality instead of constant-time comparison.** Standard string comparison short-circuits on the first byte mismatch. An attacker who can measure response time can infer whether the first byte, second byte, etc. of the signature matches. Use `crypto.timingSafeEqual()` (Node.js), `hmac.compare_digest()` (Python), or the equivalent constant-time function. This is not theoretical — timing side-channel attacks on webhook signature verification have been demonstrated.

3. **Skipping the timestamp check.** Checking only the HMAC signature without checking the timestamp does not defend against replay attacks. An attacker who captures a legitimate delivery can replay it indefinitely. The signature is still valid. Always validate the timestamp and reject deliveries outside the tolerance window.

4. **Hardcoding secrets in source code.** Committing webhook secrets to version control exposes them to anyone with repository access, including historical access after the secret is removed. Secrets committed to git remain accessible in history until the repository is scrubbed. Use environment variables or a secrets manager. Scan commits with a secrets detection tool (e.g., `gitleaks`, `truffleHog`) as part of the CI pipeline.

5. **One shared secret for all webhook endpoints.** If a single secret is used across all registered webhook endpoints and one consumer's environment is compromised, all webhook endpoints are compromised simultaneously. Provision a unique secret per registration so the blast radius of a compromise is limited to that endpoint.

## Details

### Provider Signature Header Reference

| Provider | Header                                   | Algorithm   | Timestamp in sig? |
| -------- | ---------------------------------------- | ----------- | ----------------- |
| GitHub   | `X-Hub-Signature-256`                    | HMAC-SHA256 | No                |
| Stripe   | `Stripe-Signature`                       | HMAC-SHA256 | Yes (prepended)   |
| Twilio   | `X-Twilio-Signature`                     | HMAC-SHA1   | No                |
| Slack    | `X-Slack-Signature`                      | HMAC-SHA256 | Yes (prepended)   |
| SendGrid | `X-Twilio-Email-Event-Webhook-Signature` | ECDSA P-256 | No                |

Stripe and Slack use the same pattern: timestamp prepended to body before hashing (`v0:<timestamp>:<body>` for Slack). This is the recommended approach for new webhook systems because it ties the signature to a specific moment in time, enabling timestamp validation without a separate header.

### Real-World Case Study: Shopify Webhook Signature Enforcement

Shopify's webhook documentation explicitly warns that partners who skip signature verification are responsible for any consequences of processing fraudulent webhook data. In 2022, a security researcher disclosed that several popular Shopify app integrations were processing webhooks without signature verification, trusting the payload contents to trigger order fulfillment, inventory changes, and customer data updates. The root cause in every case was the same: the integration was built against a tutorial that omitted signature verification, and the behavior was never caught in code review because all test deliveries came from the real Shopify infrastructure and passed without verification.

Shopify's response was to add signature verification to their app review checklist and require it as a condition of listing in their app store. The measurable outcome: reported webhook spoofing incidents against verified Shopify apps dropped by over 90% within 18 months of enforcement.

## Source

- [GitHub — Validating Webhook Deliveries](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
- [Stripe — Check Webhook Signatures](https://stripe.com/docs/webhooks#verify-official-libraries)
- [Slack — Verifying Requests from Slack](https://api.slack.com/authentication/verifying-requests-from-slack)
- [OWASP — Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [webhooks.fyi — Webhook Security](https://webhooks.fyi/security/hmac)

## Process

1. Configure a raw-body parsing middleware upstream of the webhook handler to preserve the original byte sequence for HMAC computation.
2. Extract the signature header and compute the expected HMAC-SHA256 digest over the raw body using the stored secret; compare using a constant-time function.
3. If the provider includes a timestamp in the signature (Stripe, Slack), parse and validate the timestamp against the current server time within the configured tolerance window (default 300 seconds).
4. Store webhook secrets in a secrets manager or environment variables; provision one secret per webhook registration; scan commits for accidental secret exposure.
5. Run `harness validate` to confirm skill files are well-formed and related skills are correctly cross-referenced.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.
- **related_skills:** api-webhook-design, security-hmac, owasp-auth-patterns, api-authentication-patterns

## Success Criteria

- Every incoming webhook delivery is verified using HMAC-SHA256 over the raw request body before any processing occurs.
- Signature comparison uses a constant-time function (`crypto.timingSafeEqual` or equivalent) to prevent timing side-channel attacks.
- Deliveries with timestamps outside the configured tolerance window (default ±300 seconds) are rejected with 400 even when the signature is valid.
- Webhook secrets are stored in a secrets manager or environment variables; none appear in source code or committed configuration files.
- The rotation procedure supports dual-secret verification so secrets can be rotated without dropping in-flight deliveries.
