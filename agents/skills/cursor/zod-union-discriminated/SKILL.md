# Zod Union and Discriminated Union

> Model variant types with z.union, z.discriminatedUnion, z.intersection, and type narrowing

## When to Use

- Modeling a field that can be one of several different shapes (tagged union / ADT pattern)
- Validating polymorphic API payloads where a `type` field determines the shape
- Combining two schemas where all fields from both must be present (intersection)
- Narrowing parsed output to a specific variant using the discriminant field

## Instructions

1. Use `z.union()` for a simple union of schemas — Zod tries each option in order:

```typescript
import { z } from 'zod';

const StringOrNumberSchema = z.union([z.string(), z.number()]);
// Accepts: 'hello', 42
// Rejects: true, null, {}

const IdSchema = z.union([z.string().uuid(), z.number().int().positive()]);
```

2. Use `z.discriminatedUnion()` when variants share a literal discriminant field — it is significantly faster than `z.union()` because it selects the branch before trying to parse:

```typescript
const NotificationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('email'),
    to: z.string().email(),
    subject: z.string(),
    body: z.string(),
  }),
  z.object({
    type: z.literal('sms'),
    phone: z.string(),
    message: z.string().max(160),
  }),
  z.object({
    type: z.literal('push'),
    deviceToken: z.string(),
    title: z.string(),
    body: z.string(),
  }),
]);

type Notification = z.infer<typeof NotificationSchema>;
// { type: 'email'; to: string; subject: string; body: string }
// | { type: 'sms'; phone: string; message: string }
// | { type: 'push'; deviceToken: string; title: string; body: string }
```

3. Narrow the discriminated union in application code using the discriminant field:

```typescript
function handleNotification(notification: Notification) {
  switch (notification.type) {
    case 'email':
      // TypeScript knows: notification.to, notification.subject, notification.body
      sendEmail(notification.to, notification.subject, notification.body);
      break;
    case 'sms':
      // TypeScript knows: notification.phone, notification.message
      sendSms(notification.phone, notification.message);
      break;
    case 'push':
      sendPush(notification.deviceToken, notification.title, notification.body);
      break;
  }
}
```

4. Use `z.intersection()` when all fields from both schemas must be present simultaneously:

```typescript
const TimestampedSchema = z.object({
  createdAt: z.date(),
  updatedAt: z.date(),
});

const NamedSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
});

const TimestampedNamedSchema = z.intersection(TimestampedSchema, NamedSchema);
// Equivalent to: { createdAt: Date; updatedAt: Date; name: string; description?: string }

// Note: .merge() is usually preferred over z.intersection() for object schemas
const PreferredSchema = NamedSchema.merge(TimestampedSchema);
```

5. Use `z.discriminatedUnion()` with nested discriminants by chaining:

```typescript
const EventSchema = z.discriminatedUnion('category', [
  z.object({
    category: z.literal('user'),
    action: z.discriminatedUnion('type', [
      z.object({ type: z.literal('created'), userId: z.string() }),
      z.object({ type: z.literal('deleted'), userId: z.string(), reason: z.string() }),
    ]),
  }),
  z.object({
    category: z.literal('system'),
    code: z.number(),
    message: z.string(),
  }),
]);
```

6. Use `.options` to access individual variants of a union for reuse:

```typescript
const [EmailNotifSchema, SmsNotifSchema, PushNotifSchema] = NotificationSchema.options;
```

## Details

**`z.union()` vs `z.discriminatedUnion()` — performance:**

`z.union()` tries each schema in order and returns the first success. For 10 variants, this means up to 10 full parse attempts. `z.discriminatedUnion()` uses the discriminant field as a lookup key — it selects exactly one branch regardless of how many variants exist. Always prefer `z.discriminatedUnion()` when your union has a shared literal field.

**Common discriminant field names:**

`type`, `kind`, `tag`, `variant`, `event`, `action` — pick one and be consistent across your codebase.

**Branded types with unions:**

```typescript
const SuccessSchema = z.object({ success: z.literal(true), data: z.unknown() });
const ErrorSchema = z.object({ success: z.literal(false), error: z.string() });
const ResultSchema = z.discriminatedUnion('success', [SuccessSchema, ErrorSchema]);
type Result<T> = { success: true; data: T } | { success: false; error: string };
```

**Intersection caveats:**

`z.intersection()` does not merge — it validates both schemas independently. Overlapping keys must satisfy both constraints:

```typescript
const A = z.object({ age: z.number().min(0) });
const B = z.object({ age: z.number().max(120) });
const AB = z.intersection(A, B);
// age must satisfy both: >= 0 AND <= 120
```

## Source

https://zod.dev/api#unions

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
