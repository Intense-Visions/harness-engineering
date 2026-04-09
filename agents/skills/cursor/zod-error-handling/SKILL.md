# Zod Error Handling

> Handle Zod validation failures with safeParse, ZodError, error.format, error.flatten, and custom error maps

## When to Use

- Returning field-level validation errors to the client (API responses, form feedback)
- Logging or monitoring validation failures without crashing
- Providing localized or application-specific error messages
- Building a validation error response shape consistent across your API

## Instructions

1. Use `.safeParse()` instead of `.parse()` whenever the caller needs to handle errors — it never throws:

```typescript
import { z } from 'zod';

const UserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  age: z.number().int().min(0),
});

const result = UserSchema.safeParse(rawInput);

if (!result.success) {
  // result.error is a ZodError
  console.error(result.error.issues);
  return { errors: result.error.format() };
}

// result.data is typed
const user = result.data;
```

2. Use `error.format()` to produce a nested error object mirroring the schema shape:

```typescript
const result = UserSchema.safeParse({ name: '', email: 'not-an-email', age: -1 });

if (!result.success) {
  const formatted = result.error.format();
  /*
  {
    _errors: [],
    name: { _errors: ['String must contain at least 1 character(s)'] },
    email: { _errors: ['Invalid email'] },
    age: { _errors: ['Number must be greater than or equal to 0'] }
  }
  */
}
```

3. Use `error.flatten()` for a flat error object — simpler to consume in UI frameworks:

```typescript
const flattened = result.error.flatten();
/*
{
  formErrors: [],           // top-level (non-field) errors
  fieldErrors: {
    name: ['String must contain at least 1 character(s)'],
    email: ['Invalid email'],
    age: ['Number must be greater than or equal to 0']
  }
}
*/

// Access field errors
const nameErrors = flattened.fieldErrors.name ?? [];
```

4. Inspect raw issues for fine-grained error handling:

```typescript
import { z, ZodIssueCode } from 'zod';

const result = UserSchema.safeParse(rawInput);
if (!result.success) {
  for (const issue of result.error.issues) {
    console.log(issue.path); // ['email']
    console.log(issue.code); // 'invalid_string'
    console.log(issue.message); // 'Invalid email'
  }
}
```

5. Use `z.setErrorMap()` to override error messages globally (e.g., for i18n):

```typescript
import { z, ZodErrorMap, ZodIssueCode } from 'zod';

const customErrorMap: ZodErrorMap = (issue, ctx) => {
  if (issue.code === ZodIssueCode.invalid_type) {
    if (issue.expected === 'string') {
      return { message: 'This field requires a text value' };
    }
  }
  if (issue.code === ZodIssueCode.too_small && issue.type === 'string') {
    return { message: `Must be at least ${issue.minimum} characters` };
  }
  return { message: ctx.defaultError };
};

z.setErrorMap(customErrorMap);
```

6. Pass a custom error map per-parse without setting it globally:

```typescript
const result = UserSchema.safeParse(rawInput, {
  errorMap: (issue, ctx) => {
    if (issue.path[0] === 'email') {
      return { message: 'Please enter a valid email address' };
    }
    return { message: ctx.defaultError };
  },
});
```

7. Build a reusable API error response from Zod errors:

```typescript
function formatValidationError(error: z.ZodError): Record<string, string[]> {
  return error.flatten().fieldErrors as Record<string, string[]>;
}

// In a Next.js API route or server action:
const result = CreateUserSchema.safeParse(await req.json());
if (!result.success) {
  return Response.json(
    { success: false, errors: formatValidationError(result.error) },
    { status: 400 }
  );
}
```

## Details

**ZodError structure:**

A `ZodError` is an `Error` subclass with an `issues` array. Each issue has:

| Field     | Type                   | Description                                            |
| --------- | ---------------------- | ------------------------------------------------------ |
| `code`    | `ZodIssueCode`         | The error category (e.g., `invalid_type`, `too_small`) |
| `path`    | `(string \| number)[]` | Path to the failing field                              |
| `message` | `string`               | Human-readable error message                           |

**Checking for specific error types:**

```typescript
import { ZodError, ZodIssueCode } from 'zod';

function isValidationError(err: unknown): err is ZodError {
  return err instanceof ZodError;
}

function hasEmailError(err: ZodError): boolean {
  return err.issues.some(
    (issue) => issue.path.includes('email') && issue.code === ZodIssueCode.invalid_string
  );
}
```

**safeParseAsync:**

For schemas with async refinements or transforms, use `safeParseAsync()`:

```typescript
const result = await UserSchema.safeParseAsync(rawInput);
```

**Logging without sensitive data:**

Before logging Zod errors, sanitize the input to avoid logging passwords or tokens:

```typescript
if (!result.success) {
  logger.warn('Validation failed', {
    issues: result.error.issues.map((i) => ({ path: i.path, code: i.code, message: i.message })),
    // Do NOT log the raw input
  });
}
```

## Source

https://zod.dev/error-handling

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
