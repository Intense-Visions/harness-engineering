# Svelte Form Actions

> Process HTML form submissions server-side using SvelteKit actions with progressive enhancement via use:enhance

## When to Use

- You need to handle form submissions in SvelteKit with server-side validation and database writes
- You want forms to work without JavaScript (progressive enhancement) and enhance with JS when available
- You are implementing login, registration, CRUD mutations, or any POST-based interaction
- You need to return validation errors back to the page without a full redirect

## Instructions

**Defining actions:**

1. Export an `actions` object from `+page.server.ts`. The default action handles forms with no `action` attribute:

```typescript
// src/routes/contact/+page.server.ts
import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions: Actions = {
  default: async ({ request, locals }) => {
    const data = await request.formData();
    const email = data.get('email') as string;
    const message = data.get('message') as string;

    if (!email || !message) {
      return fail(400, { email, error: 'All fields are required' });
    }

    await sendEmail({ email, message });
    redirect(303, '/contact/success');
  },
};
```

2. Use named actions when a page has multiple forms:

```typescript
export const actions: Actions = {
  login: async ({ request }) => {
    /* ... */
  },
  logout: async ({ cookies }) => {
    cookies.delete('session', { path: '/' });
    redirect(303, '/');
  },
};
```

Target a named action with the `action` attribute:

```html
<form method="POST" action="?/login">
  <form method="POST" action="?/logout"></form>
</form>
```

**Reading form data:**

3. Always use `request.formData()` — it handles multipart/form-data (file uploads) and application/x-www-form-urlencoded:

```typescript
const data = await request.formData();
const name = data.get('name') as string;
const avatar = data.get('avatar') as File;
```

**Returning errors and data:**

4. Use `fail(statusCode, data)` to return validation errors. The page re-renders without redirect; data is available via `form` prop:

```typescript
if (!email.includes('@')) {
  return fail(422, { email, emailError: 'Invalid email address' });
}
```

```svelte
<!-- +page.svelte -->
<script lang="ts">
  import type { ActionData } from './$types'
  let { form }: { form: ActionData } = $props()
</script>

<form method="POST">
  <input name="email" value={form?.email ?? ''} />
  {#if form?.emailError}
    <p class="error">{form.emailError}</p>
  {/if}
  <button>Submit</button>
</form>
```

**Progressive enhancement with use:enhance:**

5. Add `use:enhance` to a form to intercept submission with JavaScript, preventing full-page reloads while keeping the no-JS fallback:

```svelte
<script lang="ts">
  import { enhance } from '$app/forms'
</script>

<form method="POST" use:enhance>
  <input name="title" />
  <button>Save</button>
</form>
```

6. Customize the enhancement callback for loading states and side effects:

```svelte
<script lang="ts">
  import { enhance } from '$app/forms'

  let loading = $state(false)
</script>

<form method="POST" use:enhance={() => {
  loading = true
  return async ({ result, update }) => {
    loading = false
    if (result.type === 'success') {
      await update()  // re-runs load function
    }
  }
}}>
  <button disabled={loading}>
    {loading ? 'Saving...' : 'Save'}
  </button>
</form>
```

**File uploads:**

7. Handle file uploads — `enctype` is set automatically when using `use:enhance`, but set it explicitly for no-JS fallback:

```html
<form method="POST" enctype="multipart/form-data" use:enhance>
  <input type="file" name="avatar" accept="image/*" />
  <button>Upload</button>
</form>
```

```typescript
// +page.server.ts
const avatar = data.get('avatar') as File;
if (avatar.size > 5_000_000) return fail(400, { error: 'File too large' });
const buffer = Buffer.from(await avatar.arrayBuffer());
await uploadToStorage(buffer, avatar.name);
```

## Details

**Action result types:**

| Result type | When                        | `form` prop                              |
| ----------- | --------------------------- | ---------------------------------------- |
| `success`   | Action returns data         | `{ type: 'success', data: ... }`         |
| `failure`   | `fail(status, data)` called | `{ type: 'failure', status, data: ... }` |
| `redirect`  | `redirect()` called         | navigation occurs                        |
| `error`     | Unhandled exception         | error page shown                         |

**Progressive enhancement — how it works:**

Without `use:enhance`, the browser submits the form normally, triggering a full page navigation. With `use:enhance`, SvelteKit intercepts the submit event, sends the request via `fetch`, and applies the result without a full navigation. The page still works without JavaScript.

**Validation libraries:**

Use Zod or Valibot for structured validation in actions:

```typescript
import { z } from 'zod';

const schema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
});

export const actions: Actions = {
  default: async ({ request }) => {
    const formData = await request.formData();
    const result = schema.safeParse(Object.fromEntries(formData));
    if (!result.success) {
      return fail(422, { errors: result.error.flatten().fieldErrors });
    }
    // result.data is typed and validated
  },
};
```

**Cookies in actions:**

Actions have full access to the `cookies` API for setting session tokens:

```typescript
default: async ({ request, cookies }) => {
  const { token } = await authenticate(formData)
  cookies.set('session', token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    maxAge: 60 * 60 * 24 * 7  // 1 week
  })
  redirect(303, '/dashboard')
}
```

## Source

https://kit.svelte.dev/docs/form-actions

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
