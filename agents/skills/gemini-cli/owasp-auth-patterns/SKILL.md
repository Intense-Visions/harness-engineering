# OWASP Auth Patterns

> Implement authentication that resists credential stuffing, session hijacking, and token theft

## When to Use

- Building login, registration, or password-reset flows
- Implementing JWT-based API authentication
- Designing session management for web applications
- Adding OAuth2 / OIDC provider integration
- Auditing existing auth code for broken auth vulnerabilities

## Instructions

### Password Storage

Never store plaintext or MD5/SHA1 passwords. Use adaptive hashing:

```typescript
import * as argon2 from 'argon2';
import * as bcrypt from 'bcrypt';

// Argon2id — preferred (winner of Password Hashing Competition)
async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536, // 64 MiB
    timeCost: 3,
    parallelism: 4,
  });
}

async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

// bcrypt — acceptable alternative, saltRounds >= 12
const hash = await bcrypt.hash(password, 12);
const valid = await bcrypt.compare(password, hash);
```

### JWT Best Practices

```typescript
import jwt from 'jsonwebtoken';

// Sign — short-lived access tokens + long-lived refresh tokens
function signAccessToken(payload: { sub: string; roles: string[] }): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: '15m', // short-lived
    algorithm: 'HS256',
    issuer: 'api.example.com',
    audience: 'api.example.com',
  });
}

// Verify — always validate algorithm explicitly to prevent alg:none attacks
function verifyToken(token: string): jwt.JwtPayload {
  return jwt.verify(token, process.env.JWT_SECRET!, {
    algorithms: ['HS256'], // NEVER omit this
    issuer: 'api.example.com',
    audience: 'api.example.com',
  }) as jwt.JwtPayload;
}
```

### Refresh Token Rotation

Rotate refresh tokens on every use. Detect reuse (theft signal).

```typescript
async function refreshAccessToken(refreshToken: string) {
  const stored = await db.refreshToken.findUnique({ where: { token: refreshToken } });

  if (!stored) throw new UnauthorizedException('Invalid refresh token');
  if (stored.usedAt) {
    // Reuse detected — potential theft. Revoke all tokens for this user.
    await db.refreshToken.deleteMany({ where: { userId: stored.userId } });
    throw new UnauthorizedException('Token reuse detected');
  }
  if (stored.expiresAt < new Date()) {
    throw new UnauthorizedException('Refresh token expired');
  }

  // Mark old token as used
  await db.refreshToken.update({ where: { id: stored.id }, data: { usedAt: new Date() } });

  // Issue new token pair
  const newRefreshToken = crypto.randomBytes(32).toString('hex');
  await db.refreshToken.create({
    data: {
      token: newRefreshToken,
      userId: stored.userId,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    },
  });

  return {
    accessToken: signAccessToken({ sub: stored.userId, roles: stored.roles }),
    refreshToken: newRefreshToken,
  };
}
```

### Session Security

For cookie-based sessions:

```typescript
import session from 'express-session';
import RedisStore from 'connect-redis';

app.use(
  session({
    store: new RedisStore({ client: redisClient }),
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true, // prevent JS access
      secure: true, // HTTPS only
      sameSite: 'strict', // CSRF protection
      maxAge: 15 * 60 * 1000, // 15 minutes
    },
    genid: () => crypto.randomUUID(), // cryptographically random IDs
  })
);

// Regenerate session ID after login to prevent session fixation
app.post('/login', async (req, res) => {
  const user = await authenticate(req.body);
  req.session.regenerate((err) => {
    if (err) throw err;
    req.session.userId = user.id;
    res.json({ ok: true });
  });
});
```

### Account Lockout and Rate Limiting

```typescript
import rateLimit from 'express-rate-limit';

// Limit login attempts per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  message: 'Too many login attempts, please try again later',
});

app.post('/login', loginLimiter, loginHandler);
```

## Details

**Token storage:**

- Access tokens: memory (JS variable) — not localStorage (XSS risk), not cookies without httpOnly
- Refresh tokens: httpOnly, Secure, SameSite=Strict cookies OR secure server-side storage

**Credential stuffing defenses:**

- Rate limiting per IP and per username
- CAPTCHA on repeated failures
- Leaked credential checking (HaveIBeenPwned API)

**Logout:**

- JWTs cannot be "invalidated" client-side — maintain a server-side revocation list (Redis blocklist) keyed by `jti` claim, or use short-lived tokens with refresh rotation

**Multi-factor authentication:**

- TOTP (time-based OTP) via `otplib`
- WebAuthn/passkeys via `@simplewebauthn/server` for phishing-resistant auth

## Source

https://owasp.org/www-project-top-ten/

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.
- **related_skills:** nestjs-guards-pattern, owasp-secrets-management, owasp-cryptography, security-credential-storage, security-session-management, security-mfa-design, security-authentication-flows, security-rbac-design, api-authentication-patterns, api-oauth2-flows

## Success Criteria

- The patterns described in this document are applied correctly in the implementation.
- Edge cases and anti-patterns listed in this document are avoided.
