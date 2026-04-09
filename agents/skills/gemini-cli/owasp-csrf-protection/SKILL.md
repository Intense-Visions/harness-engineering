# OWASP CSRF Protection

> Prevent cross-site request forgery by validating request origin and requiring unpredictable tokens for state-changing operations

## When to Use

- Building any application that uses cookie-based session authentication
- Implementing state-changing API endpoints (POST, PUT, DELETE, PATCH)
- Setting session cookie attributes
- Adding CSRF middleware to an Express or NestJS application
- Auditing forms and AJAX requests for missing CSRF protection

## Instructions

### SameSite Cookies — First Line of Defense

Modern browsers support `SameSite=Strict` or `SameSite=Lax` which blocks CSRF for most cases:

```typescript
res.cookie('session_id', sessionId, {
  httpOnly: true,
  secure: true,
  sameSite: 'strict', // cross-site requests never send this cookie
  maxAge: 15 * 60 * 1000,
});
```

- `Strict` — cookie never sent on cross-site requests (strongest, may break OAuth flows)
- `Lax` — cookie sent on top-level GET navigations, not POST; good balance
- `None` — must pair with `Secure: true` and add CSRF tokens

### Synchronizer Token Pattern

For forms and traditional server-rendered pages:

```typescript
import csrf from 'csurf';

// Express — csurf middleware
const csrfProtection = csrf({ cookie: { sameSite: 'strict', httpOnly: true } });

app.get('/form', csrfProtection, (req, res) => {
  // Pass token to the template
  res.render('form', { csrfToken: req.csrfToken() });
});

app.post('/submit', csrfProtection, (req, res) => {
  // csurf validates _csrf field automatically
  res.json({ ok: true });
});
```

```html
<!-- Include hidden CSRF field in every form -->
<form method="POST" action="/submit">
  <input type="hidden" name="_csrf" value="<%= csrfToken %>" />
  <!-- form fields -->
</form>
```

### Double-Submit Cookie Pattern (Stateless APIs)

For SPAs where the backend is stateless:

```typescript
import crypto from 'crypto';

function csrfMiddleware(req: Request, res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const cookieToken = req.cookies['csrf-token'];
  const headerToken = req.headers['x-csrf-token'];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: 'CSRF validation failed' });
  }
  next();
}

// On session creation, set the cookie
function setCSRFCookie(res: Response) {
  const token = crypto.randomBytes(32).toString('hex');
  res.cookie('csrf-token', token, {
    secure: true,
    sameSite: 'strict',
    // NOT httpOnly — frontend JS must be able to read it
  });
}
```

```typescript
// SPA — send CSRF token on every mutating request
const csrfToken = document.cookie
  .split('; ')
  .find((row) => row.startsWith('csrf-token='))
  ?.split('=')[1];

fetch('/api/update', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrfToken ?? '',
  },
  body: JSON.stringify(data),
});
```

### Origin Header Validation

Simplest approach for API-only backends that don't serve HTML:

```typescript
const ALLOWED_ORIGINS = new Set(['https://app.example.com', 'https://www.example.com']);

function originValidator(req: Request, res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const origin = req.headers.origin || req.headers.referer;
  if (!origin) return res.status(403).json({ error: 'Missing origin' });

  const url = new URL(origin);
  const originBase = `${url.protocol}//${url.host}`;

  if (!ALLOWED_ORIGINS.has(originBase)) {
    return res.status(403).json({ error: 'Invalid origin' });
  }
  next();
}
```

## Details

**CSRF is only possible when:**

1. The browser automatically sends credentials (cookies, Basic auth) with cross-origin requests
2. The server cannot distinguish legitimate from forged requests

**APIs using Bearer tokens in Authorization header are immune to CSRF** — browsers do not automatically send Authorization headers cross-origin. Only protect cookie-authenticated routes.

**Defense selection guide:**

- Cookie session app → `SameSite=Strict` + CSRF token
- SPA + cookie session → `SameSite=Strict` + double-submit cookie
- REST API + Bearer JWT → no CSRF protection needed
- Server-rendered forms → synchronizer token pattern

**NestJS — CsrfGuard:**

```typescript
import { CsrfGuard } from '@tekuconcept/nestjs-csrf';

@UseGuards(CsrfGuard)
@Post('transfer')
transfer(@Body() dto: TransferDto) { ... }
```

## Source

https://owasp.org/www-project-top-ten/

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
