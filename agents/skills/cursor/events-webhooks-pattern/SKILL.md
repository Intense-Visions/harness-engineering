# Events: Webhooks Pattern

> Implement reliable webhook delivery with retry backoff, signature verification, and queuing.

## When to Use

- You need to notify external systems when events happen in your system (push, not poll)
- You're building a platform where developers register callback URLs (Stripe, GitHub, Twilio style)
- You want to decouple your system from external consumers via HTTP callbacks
- You need to deliver events reliably with retries and failure handling

## Instructions

**Webhook sender with retry and signature:**

```typescript
import crypto from 'crypto';

interface WebhookEndpoint {
  id: string;
  url: string;
  secret: string;
  events: string[]; // subscribed event types
  enabled: boolean;
}

interface WebhookDelivery {
  id: string;
  endpointId: string;
  eventType: string;
  payload: object;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
  nextRetryAt?: Date;
}

class WebhookSender {
  // Sign the payload with HMAC-SHA256
  private sign(payload: string, secret: string): string {
    return 'sha256=' + crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
  }

  async deliver(endpoint: WebhookEndpoint, delivery: WebhookDelivery): Promise<boolean> {
    const body = JSON.stringify({
      id: delivery.id,
      type: delivery.eventType,
      created: new Date().toISOString(),
      data: delivery.payload,
    });

    const signature = this.sign(body, endpoint.secret);

    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Id': delivery.id,
          'X-Webhook-Timestamp': Date.now().toString(),
          'User-Agent': 'MyPlatform-Webhooks/1.0',
        },
        body,
        signal: AbortSignal.timeout(10_000), // 10 second timeout
      });

      // 2xx = success, 3xx redirect = fail, 4xx = fail (don't retry client errors), 5xx = retry
      if (response.ok) {
        await this.markDelivered(delivery.id);
        return true;
      }

      if (response.status >= 400 && response.status < 500) {
        // Client error — endpoint is broken, don't retry
        await this.markFailed(delivery.id, `HTTP ${response.status}`);
        return false;
      }

      throw new Error(`HTTP ${response.status}`);
    } catch (err) {
      await this.scheduleRetry(delivery, (err as Error).message);
      return false;
    }
  }

  // Exponential backoff with jitter
  private async scheduleRetry(delivery: WebhookDelivery, error: string): Promise<void> {
    const MAX_ATTEMPTS = 10;
    if (delivery.attempts >= MAX_ATTEMPTS) {
      await this.markFailed(delivery.id, `Max retries exceeded: ${error}`);
      return;
    }

    // 5s, 25s, 125s, 625s, ... up to ~17 hours
    const baseDelay = 5_000 * Math.pow(5, delivery.attempts);
    const jitter = Math.random() * 0.2 * baseDelay; // ±20% jitter
    const delay = Math.min(baseDelay + jitter, 17 * 60 * 60 * 1000);

    const nextRetryAt = new Date(Date.now() + delay);
    await this.db.webhookDelivery.update({
      where: { id: delivery.id },
      data: { attempts: { increment: 1 }, nextRetryAt, lastError: error },
    });
  }

  private async markDelivered(id: string): Promise<void> {
    await this.db.webhookDelivery.update({
      where: { id },
      data: { status: 'delivered', deliveredAt: new Date() },
    });
  }

  private async markFailed(id: string, error: string): Promise<void> {
    await this.db.webhookDelivery.update({
      where: { id },
      data: { status: 'failed', lastError: error },
    });
  }
}
```

**Webhook receiver — verify signature:**

```typescript
import express from 'express';
import crypto from 'crypto';

function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expected =
    'sha256=' + crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');

  // Use timingSafeEqual to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false; // different lengths
  }
}

app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['stripe-signature'] as string;
  const payload = req.body.toString('utf8'); // must be raw body, not parsed JSON

  if (!verifyWebhookSignature(payload, signature, process.env.WEBHOOK_SECRET!)) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  const event = JSON.parse(payload);

  // Respond quickly — offload processing to queue
  res.status(200).json({ received: true });

  // Process async (don't block the response)
  processWebhookAsync(event).catch(console.error);
});
```

## Details

**Respond fast, process async:** Webhook senders time out (often 10-30s). Respond `200 OK` immediately and enqueue the event for processing. Never do heavy work in the webhook handler.

**Idempotency:** Webhooks can be retried. The receiver must be idempotent — use the event `id` field to deduplicate (see `events-idempotency` skill).

**Anti-patterns:**

- Not verifying the signature — anyone can spoof webhook events
- Blocking on webhook processing before returning 200 — causes timeouts and retries
- No retry logic — a single temporary failure permanently loses the event
- Retrying on 4xx responses — if the endpoint returns 400, retrying won't help; it's a client-side bug

**Webhook database schema:**

```sql
CREATE TABLE webhook_endpoints (
  id         UUID PRIMARY KEY,
  url        TEXT NOT NULL,
  secret     TEXT NOT NULL, -- store encrypted
  events     TEXT[] NOT NULL,
  enabled    BOOLEAN DEFAULT TRUE
);

CREATE TABLE webhook_deliveries (
  id          UUID PRIMARY KEY,
  endpoint_id UUID REFERENCES webhook_endpoints(id),
  event_type  TEXT NOT NULL,
  payload     JSONB NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  attempts    INT NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  delivered_at  TIMESTAMPTZ,
  last_error  TEXT
);
```

## Source

microservices.io/patterns/communication-style/messaging.html

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.
- **related_skills:** events-pubsub-pattern, events-idempotency, node-crypto-patterns, api-webhook-design, api-webhook-security

## Success Criteria

- The patterns described in this document are applied correctly in the implementation.
- Edge cases and anti-patterns listed in this document are avoided.
