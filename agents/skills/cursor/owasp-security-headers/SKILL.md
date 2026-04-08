# HTTP Security Headers

> Configure HTTP security headers to protect against XSS, clickjacking, MIME sniffing, and information leakage

## When to Use

- Setting up a new web application or API
- Hardening an existing application's HTTP responses
- Implementing Content Security Policy (CSP)
- Preventing clickjacking, MIME sniffing, and protocol downgrade attacks
- Preparing for a security audit or penetration test

## Instructions

1. **Use Helmet.js to set secure defaults.** Helmet configures most security headers with sensible defaults in one line.

```bash
npm install helmet
```

```typescript
import helmet from 'helmet';

app.use(helmet());
```

This sets: `Content-Security-Policy`, `Cross-Origin-Embedder-Policy`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, `X-DNS-Prefetch-Control`, `X-Frame-Options`, `Strict-Transport-Security`, `X-Download-Options`, `X-Content-Type-Options`, `Origin-Agent-Cluster`, `X-Permitted-Cross-Domain-Policies`, `Referrer-Policy`, `X-XSS-Protection` (disabled — see below).

2. **Configure Content-Security-Policy (CSP) explicitly.** CSP is the most important security header. It controls which resources the browser is allowed to load, preventing XSS and data injection.

```typescript
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'strict-dynamic'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // Inline styles needed for most UI frameworks
        imgSrc: ["'self'", 'data:', 'https://cdn.example.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        connectSrc: ["'self'", 'https://api.example.com'],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: [],
      },
    },
  })
);
```

3. **Enable Strict-Transport-Security (HSTS)** to force HTTPS for all future requests.

```typescript
app.use(
  helmet({
    strictTransportSecurity: {
      maxAge: 63072000, // 2 years in seconds
      includeSubDomains: true,
      preload: true, // Submit to HSTS preload list
    },
  })
);
```

After enabling, submit your domain to https://hstspreload.org/ for inclusion in browser preload lists.

4. **Prevent clickjacking with `X-Frame-Options` and `frame-ancestors` CSP directive.**

```typescript
// X-Frame-Options (legacy, but still needed for older browsers)
// Set by Helmet: SAMEORIGIN by default

// CSP frame-ancestors (modern, preferred)
contentSecurityPolicy: {
  directives: {
    frameAncestors: ["'self'"], // Or "'none'" to block all framing
  },
}
```

5. **Prevent MIME type sniffing with `X-Content-Type-Options: nosniff`.** Without this, browsers may interpret a file as a different MIME type than declared, enabling XSS via uploaded files.

```
X-Content-Type-Options: nosniff
```

Set by Helmet by default. Ensure all responses include correct `Content-Type` headers.

6. **Control referrer information with `Referrer-Policy`.** Prevent leaking URLs (which may contain tokens or sensitive data) in the `Referer` header.

```typescript
app.use(
  helmet({
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
);
```

Options from most restrictive to least:

- `no-referrer` — never send referrer
- `same-origin` — send referrer only for same-origin requests
- `strict-origin-when-cross-origin` (recommended) — full URL for same-origin, origin only for cross-origin HTTPS, nothing for downgrades
- `origin` — send only the origin, not the full URL

7. **Set `Permissions-Policy` to disable unnecessary browser features.**

```typescript
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(self)');
  next();
});
```

This prevents embedded third-party content from accessing device APIs even if your page includes it.

8. **Set Cross-Origin headers for isolation.**

```typescript
// Prevent your resources from being loaded by other origins
res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

// Prevent other pages from getting a reference to your window
res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
```

9. **Remove headers that leak server information.**

```typescript
app.disable('x-powered-by'); // Removes "X-Powered-By: Express"
// Also remove Server header at the reverse proxy level
```

10. **Deploy CSP in report-only mode first** to identify violations before enforcing.

```typescript
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        // ... your policy
        reportUri: '/api/csp-report',
      },
      reportOnly: true, // Log violations without blocking
    },
  })
);

// Collect CSP violation reports
app.post('/api/csp-report', express.json({ type: 'application/csp-report' }), (req, res) => {
  logger.warn({ event: 'csp.violation', report: req.body }, 'CSP violation');
  res.sendStatus(204);
});
```

## Details

**Essential headers checklist:**

| Header                       | Purpose                          | Value                                          |
| ---------------------------- | -------------------------------- | ---------------------------------------------- |
| Content-Security-Policy      | XSS prevention, resource control | `default-src 'self'; script-src 'self'`        |
| Strict-Transport-Security    | Force HTTPS                      | `max-age=63072000; includeSubDomains; preload` |
| X-Content-Type-Options       | Prevent MIME sniffing            | `nosniff`                                      |
| X-Frame-Options              | Prevent clickjacking             | `DENY` or `SAMEORIGIN`                         |
| Referrer-Policy              | Control referrer leakage         | `strict-origin-when-cross-origin`              |
| Permissions-Policy           | Disable unused browser APIs      | `camera=(), microphone=()`                     |
| Cross-Origin-Opener-Policy   | Window isolation                 | `same-origin`                                  |
| Cross-Origin-Resource-Policy | Resource isolation               | `same-origin`                                  |

**CSP `'strict-dynamic'` explained:** When `'strict-dynamic'` is present in `script-src`, dynamically created scripts inherit trust from the script that created them. This allows legitimate runtime-generated scripts (bundler chunks, lazy-loaded modules) while still blocking injected scripts. Pair with nonce-based CSP for maximum security.

**Nonce-based CSP for inline scripts:**

```typescript
app.use((req, res, next) => {
  const nonce = crypto.randomBytes(16).toString('base64');
  res.locals.cspNonce = nonce;
  res.setHeader('Content-Security-Policy', `script-src 'nonce-${nonce}' 'strict-dynamic'`);
  next();
});
```

```html
<script nonce="<%= cspNonce %>">
  /* inline script is allowed */
</script>
```

**API-only applications:** For APIs that do not serve HTML, a minimal header set suffices: `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, `Cache-Control: no-store` (for sensitive data), and `Content-Type: application/json`.

**Testing headers:** Use https://securityheaders.com or https://observatory.mozilla.org to scan your application and get a grade.

**Common mistakes:**

- Setting CSP to `'unsafe-inline' 'unsafe-eval'` (defeats the purpose of CSP)
- Not testing CSP before enforcing (breaks legitimate functionality)
- Missing HSTS on API subdomains (cookie theft via HTTP)
- Setting `X-Frame-Options: ALLOW-FROM` (deprecated, unsupported in modern browsers — use `frame-ancestors`)

## Source

https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html
