# Zod Transform and Refine

> Transform and validate data with Zod's transform, refine, superRefine, and preprocess APIs

## When to Use

- Converting parsed data to a different shape or type after validation (e.g., string to Date, string to number)
- Adding custom validation logic beyond what built-in validators support
- Implementing cross-field validation within a single schema
- Pre-processing raw input before Zod's normal validation runs (e.g., JSON.parse, trimming)

## Instructions

1. Use `.transform()` to reshape or convert validated data — the output type can differ from the input type:

```typescript
import { z } from 'zod';

// String to number
const NumericStringSchema = z.string().transform((val) => parseInt(val, 10));
// Input type: string, Output type: number

// String to Date
const DateStringSchema = z
  .string()
  .datetime()
  .transform((val) => new Date(val));
// Input type: string, Output type: Date

// Object reshaping
const RawUserSchema = z
  .object({
    first_name: z.string(),
    last_name: z.string(),
    email_address: z.string().email(),
  })
  .transform(({ first_name, last_name, email_address }) => ({
    displayName: `${first_name} ${last_name}`,
    email: email_address,
  }));
```

2. Use `.refine()` for single-failure custom validation — the predicate returns true to pass, false to fail:

```typescript
const PasswordSchema = z
  .object({
    password: z.string().min(8),
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'], // which field the error should appear on
  });
```

3. Use `.superRefine()` for multi-failure validation — you control exactly how many issues to add:

```typescript
const RegisterSchema = z
  .object({
    username: z.string(),
    password: z.string(),
    age: z.number(),
  })
  .superRefine((data, ctx) => {
    if (data.password.length < 8) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_small,
        minimum: 8,
        type: 'string',
        inclusive: true,
        message: 'Password must be at least 8 characters',
        path: ['password'],
      });
    }

    if (data.age < 18) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Must be 18 or older to register',
        path: ['age'],
      });
    }
  });
```

4. Use `z.preprocess()` to transform raw input before validation — useful for coercing from non-standard sources:

```typescript
// Parse JSON string before validating the object
const JsonBodySchema = z.preprocess(
  (val) => (typeof val === 'string' ? JSON.parse(val) : val),
  z.object({ name: z.string(), count: z.number() })
);

// Convert empty string to undefined (common for HTML form inputs)
const OptionalStringSchema = z.preprocess(
  (val) => (val === '' ? undefined : val),
  z.string().optional()
);

// Coerce comma-separated string to array
const CsvArraySchema = z.preprocess(
  (val) => (typeof val === 'string' ? val.split(',').map((s) => s.trim()) : val),
  z.array(z.string())
);
```

5. Chain transforms and refinements together with `.pipe()`:

```typescript
const AgeFromStringSchema = z.string().transform(Number).pipe(z.number().int().min(0).max(150));
// First converts to number, then validates the number
```

6. Use `.transform()` with async operations — but then you must use `.parseAsync()`:

```typescript
const SlugCheckSchema = z.string().transform(async (slug) => {
  const exists = await db.post.findUnique({ where: { slug } });
  return { slug, exists: !!exists };
});

const result = await SlugCheckSchema.parseAsync('my-post');
// { slug: 'my-post', exists: true }
```

## Details

**Input vs output types:**

When you use `.transform()`, the schema has different input and output types. `z.infer` gives the output type. To get the input type, use `z.input<typeof Schema>`:

```typescript
const ProcessedSchema = z
  .object({
    date: z.string().datetime(),
  })
  .transform(({ date }) => ({ date: new Date(date), year: new Date(date).getFullYear() }));

type Input = z.input<typeof ProcessedSchema>; // { date: string }
type Output = z.infer<typeof ProcessedSchema>; // { date: Date; year: number }
```

**Refine vs superRefine — when to choose:**

| Scenario                           | Use                                                 |
| ---------------------------------- | --------------------------------------------------- |
| Single conditional check           | `.refine()`                                         |
| Multiple independent checks        | `.superRefine()`                                    |
| Type narrowing (e.g., `data is X`) | `.superRefine()` with `ctx.addIssue` + return NEVER |
| Async validation                   | `.refine(async fn)` or `.superRefine(async fn)`     |

**Accessing sibling fields in refinement:**

`.refine()` on an object gives access to all fields — useful for cross-field constraints:

```typescript
const DateRangeSchema = z
  .object({
    startDate: z.date(),
    endDate: z.date(),
  })
  .refine((data) => data.endDate > data.startDate, {
    message: 'End date must be after start date',
    path: ['endDate'],
  });
```

**Preprocess vs coerce:**

`z.preprocess()` runs before Zod's type check. `z.coerce` is a Zod-managed conversion. Prefer `z.coerce` for numeric/boolean coercion from strings; use `z.preprocess()` for anything more complex.

## Source

https://zod.dev/api#transform
