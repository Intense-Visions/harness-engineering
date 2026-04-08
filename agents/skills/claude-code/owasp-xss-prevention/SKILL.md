# OWASP XSS Prevention

> Block script injection by encoding output, sanitizing HTML, and enforcing Content Security Policy

## When to Use

- Rendering user-supplied content in HTML templates or React components
- Building rich text editors or comment/markdown systems
- Setting up HTTP security headers for a web application
- Auditing code that uses `innerHTML`, `dangerouslySetInnerHTML`, or `eval`
- Implementing server-side rendering with dynamic user data

## Instructions

### React — Avoid dangerouslySetInnerHTML

React auto-escapes JSX expressions. The main risk is `dangerouslySetInnerHTML`:

```tsx
// BAD — direct HTML injection
function Comment({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

// GOOD — sanitize with DOMPurify before rendering
import DOMPurify from 'dompurify';

function Comment({ html }: { html: string }) {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'ul', 'li', 'p'],
    ALLOWED_ATTR: ['href', 'rel', 'target'],
  });
  return <div dangerouslySetInnerHTML={{ __html: clean }} />;
}
```

### Server-Side Output Encoding

In Express/NestJS template engines, always use auto-escaping. For raw HTML responses:

```typescript
import escapeHtml from 'escape-html';

// Escapes <, >, &, ", ' — safe for HTML context
const safeOutput = escapeHtml(userInput);

// For HTML attribute context — additional encoding needed
function encodeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
```

### Content Security Policy

CSP is the strongest browser-level defense. Set via HTTP header (not meta tag):

```typescript
import helmet from 'helmet';

app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'nonce-{NONCE}'"], // nonce-based is better than unsafe-inline
      styleSrc: ["'self'", "'unsafe-inline'"], // Tailwind requires this (or use nonces)
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: [],
    },
  })
);
```

For nonce-based CSP with Next.js or Express:

```typescript
import crypto from 'crypto';

function cspMiddleware(req: Request, res: Response, next: NextFunction) {
  const nonce = crypto.randomBytes(16).toString('base64');
  res.locals.cspNonce = nonce;
  res.setHeader(
    'Content-Security-Policy',
    `script-src 'self' 'nonce-${nonce}'; object-src 'none';`
  );
  next();
}
```

### DOM XSS — Dangerous Sinks

Avoid these JavaScript APIs with user input:

```typescript
// DANGEROUS SINKS — never pass untrusted data to these
element.innerHTML = userInput; // use textContent instead
document.write(userInput);
eval(userInput);
setTimeout(userInput, 0); // string form of setTimeout
location.href = userInput; // validate URL schema first
element.setAttribute('src', userInput); // validate URL schema
```

```typescript
// SAFE alternatives
element.textContent = userInput; // no HTML parsing
element.setAttribute('data-val', userInput); // data attributes are safe

// URL validation before href/src assignment
function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}
```

## Details

**Three XSS types:**

- **Reflected** — payload in request URL reflected immediately in response
- **Stored** — payload persisted (database/comments) and rendered to other users
- **DOM-based** — payload processed entirely in the browser via dangerous JS sinks

**Defense priority:**

1. Avoid dangerous sinks (structural — most effective)
2. Output encoding per context (HTML, attribute, JS, URL, CSS contexts have different rules)
3. Input sanitization (DOMPurify for HTML, allowlist for other contexts)
4. CSP as last line of defense (catches mistakes)

**DOMPurify server-side (SSR/Node):**

```typescript
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window as any);
const clean = DOMPurify.sanitize(dirty);
```

## Source

https://owasp.org/www-project-top-ten/
