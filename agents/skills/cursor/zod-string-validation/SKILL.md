# Zod String Validation

> Validate and transform strings with Zod's min, max, email, url, regex, trim, and custom error messages

## When to Use

- Validating user-facing string inputs: emails, URLs, passwords, usernames, phone numbers
- Enforcing length constraints on text fields
- Sanitizing strings by trimming or lowercasing before storing
- Providing user-friendly error messages instead of Zod's defaults

## Instructions

1. Start with `z.string()` and chain validators in order from most permissive to most restrictive:

```typescript
import { z } from 'zod';

const UsernameSchema = z
  .string()
  .min(3, 'Username must be at least 3 characters')
  .max(20, 'Username cannot exceed 20 characters')
  .regex(/^[a-z0-9_]+$/, 'Only lowercase letters, numbers, and underscores');
```

2. Use built-in format validators for common patterns:

```typescript
const ContactSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  website: z.string().url('Enter a valid URL').optional(),
  phone: z
    .string()
    .regex(/^\+?[1-9]\d{7,14}$/, 'Enter a valid phone number')
    .optional(),
});
```

3. Chain `.trim()` before length checks so whitespace does not count toward limits:

```typescript
const TitleSchema = z
  .string()
  .trim()
  .min(1, 'Title is required')
  .max(100, 'Title cannot exceed 100 characters');
```

4. Use `.toLowerCase()` and `.toUpperCase()` for normalization (these are transforms):

```typescript
const EmailSchema = z.string().trim().toLowerCase().email('Enter a valid email address');
```

5. Use `.transform()` for custom string shaping — the output type can differ from string:

```typescript
const SlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((val) => val.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''));

// SlugSchema.parse('  Hello World! ') → 'hello-world'
```

6. Use `.startsWith()` and `.endsWith()` for prefix/suffix constraints:

```typescript
const ApiKeySchema = z
  .string()
  .startsWith('sk_', 'API keys must start with sk_')
  .length(32, 'API key must be exactly 32 characters');
```

7. Use `.includes()` for substring requirements:

```typescript
const PasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .includes('@', { message: 'Password must contain @' }); // rarely used, prefer regex
```

8. Use `.ip()` for IP address validation (v4, v6, or both):

```typescript
const IpSchema = z.string().ip({ version: 'v4', message: 'Must be a valid IPv4 address' });
const AnyIpSchema = z.string().ip(); // accepts v4 and v6
```

9. Use `.datetime()` for ISO 8601 datetime strings:

```typescript
const TimestampSchema = z.string().datetime({ message: 'Must be ISO 8601 format' });
// Accepts: '2024-01-15T10:30:00Z', '2024-01-15T10:30:00.000Z'
```

10. Use `.uuid()` and `.cuid()` for ID format validation:

```typescript
const IdSchema = z.union([z.string().uuid(), z.string().cuid()]);
```

## Details

**Custom error messages:**

Every Zod string method accepts either a string message or an options object:

```typescript
// Short form
z.string().min(8, 'Too short');

// Long form — useful when you need to customize the error code or path
z.string().min(8, { message: 'Password must be at least 8 characters', path: ['password'] });
```

**Order matters for transforms:**

`.trim()`, `.toLowerCase()`, and `.toUpperCase()` are transforms under the hood. They run in order during parsing. Always put them before validation checks:

```typescript
// Correct: trim before min check
z.string().trim().min(1, 'Required');

// Wrong: min check runs on untrimmed string, '   ' passes
z.string().min(1).trim();
```

**Distinguishing empty vs absent:**

```typescript
// Required, non-empty string
const Required = z.string().min(1, 'This field is required');

// Optional but non-empty when present
const OptionalNonEmpty = z.string().min(1).optional();

// Empty string treated as absent (common for HTML forms)
const FormField = z
  .string()
  .transform((val) => (val === '' ? undefined : val))
  .optional();
```

**Regex complexity:**

For complex patterns, extract the regex to a named constant for testability:

```typescript
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const SlugSchema = z.string().regex(SLUG_PATTERN, 'Invalid slug format');
```

**When NOT to use string validators directly:**

- For object-level string fields with cross-field dependencies — use `.superRefine()` on the parent object (see `zod-transform-refine`)
- For async uniqueness checks (e.g., email already taken) — use async refinements (see `zod-async-validation`)

## Source

https://zod.dev/api#strings
