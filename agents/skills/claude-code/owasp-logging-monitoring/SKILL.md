# Security Logging and Monitoring

> Implement security logging and monitoring to detect attacks, support incident response, and maintain audit trails

## When to Use

- Setting up application logging for security events
- Implementing audit trails for compliance (SOC 2, HIPAA, PCI DSS)
- Building alerting for suspicious activity (brute force, privilege escalation)
- Reviewing logging practices after a security incident
- Choosing between logging frameworks and SIEM solutions

## Instructions

1. **Use structured logging with a consistent format.** JSON-structured logs are parseable by log aggregation tools and enable querying.

```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  redact: ['req.headers.authorization', 'password', 'ssn', 'creditCard'],
  timestamp: pino.stdTimeFunctions.isoTime,
});
```

2. **Log security-relevant events.** At minimum, log these categories:

```typescript
// Authentication events
logger.info({ event: 'auth.login.success', userId, ip, userAgent }, 'User logged in');
logger.warn({ event: 'auth.login.failure', email, ip, reason: 'invalid_password' }, 'Login failed');
logger.warn(
  { event: 'auth.login.locked', email, ip, attempts },
  'Account locked after failed attempts'
);
logger.info({ event: 'auth.logout', userId }, 'User logged out');
logger.info({ event: 'auth.password.changed', userId }, 'Password changed');

// Authorization events
logger.warn({ event: 'authz.denied', userId, resource, action }, 'Access denied');
logger.warn(
  { event: 'authz.escalation', userId, fromRole, toRole },
  'Privilege escalation attempt'
);

// Data access events
logger.info({ event: 'data.export', userId, recordCount }, 'Data exported');
logger.info({ event: 'data.delete', userId, resourceType, resourceId }, 'Record deleted');

// Input validation events
logger.warn({ event: 'input.validation', ip, field, reason }, 'Suspicious input rejected');

// System events
logger.error({ event: 'system.error', error: err.message, stack: err.stack }, 'Unhandled error');
logger.info({ event: 'system.startup', version, environment }, 'Application started');
```

3. **Never log sensitive data.** Passwords, tokens, credit card numbers, SSNs, and PII must be redacted or excluded. Configure your logger to redact sensitive fields automatically.

```typescript
// Pino redaction
const logger = pino({
  redact: {
    paths: [
      'password',
      'token',
      'req.headers.authorization',
      'req.headers.cookie',
      'creditCard',
      'ssn',
      '*.password',
      '*.token',
    ],
    censor: '[REDACTED]',
  },
});

// Manual redaction for dynamic fields
function sanitizeForLogging(obj: Record<string, unknown>): Record<string, unknown> {
  const sensitive = new Set(['password', 'token', 'secret', 'ssn', 'creditCard']);
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, sensitive.has(k) ? '[REDACTED]' : v])
  );
}
```

4. **Add request context to every log entry.** Use a request ID, user ID, and session ID to correlate logs across a single request and user session.

```typescript
import { randomUUID } from 'node:crypto';

app.use((req, res, next) => {
  req.requestId = (req.headers['x-request-id'] as string) ?? randomUUID();
  req.log = logger.child({
    requestId: req.requestId,
    userId: req.user?.id,
    ip: req.ip,
    method: req.method,
    path: req.path,
  });
  res.setHeader('X-Request-Id', req.requestId);
  next();
});
```

5. **Implement middleware to log all HTTP requests.**

```typescript
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const logFn =
      res.statusCode >= 500 ? req.log.error : res.statusCode >= 400 ? req.log.warn : req.log.info;

    logFn(
      {
        event: 'http.request',
        status: res.statusCode,
        duration,
        contentLength: res.getHeader('content-length'),
      },
      `${req.method} ${req.path} ${res.statusCode} ${duration}ms`
    );
  });

  next();
});
```

6. **Set up alerting for suspicious patterns.** Define alert rules for:
   - Multiple failed login attempts from the same IP (> 5 in 5 minutes)
   - Login from a new country or device
   - Privilege escalation attempts
   - Unusual data access patterns (bulk exports, after-hours access)
   - Sudden spike in 4xx or 5xx errors

7. **Ship logs to a centralized aggregation service.** Do not rely on local log files — use Datadog, Elastic/ELK, Splunk, or CloudWatch for centralized storage, search, and alerting.

8. **Implement audit logs for compliance-sensitive operations.** Audit logs are immutable, timestamped records of who did what and when.

```typescript
interface AuditEntry {
  timestamp: string;
  actor: { userId: string; ip: string; userAgent: string };
  action: string;
  resource: { type: string; id: string };
  changes?: { field: string; from: unknown; to: unknown }[];
  result: 'success' | 'failure';
}

async function auditLog(entry: AuditEntry): Promise<void> {
  // Write to append-only store (database, S3, dedicated audit service)
  await db.auditLogs.create({ data: entry });
  logger.info({ event: 'audit', ...entry }, `Audit: ${entry.action}`);
}
```

9. **Set log retention policies.** Balance storage costs with compliance requirements. Common retention periods: 90 days for general logs, 1 year for security events, 7 years for financial audit logs.

10. **Test your logging and alerting.** Regularly verify that security events generate the expected logs and that alerts fire correctly. Include logging verification in security testing.

## Details

**OWASP Top 10 A09 — Security Logging and Monitoring Failures:** Insufficient logging delays detection of breaches. The average time to detect a breach is 200+ days. Proper logging reduces this to hours or days.

**Log levels for security events:**

- `ERROR`: System failures, unhandled exceptions, security control failures
- `WARN`: Failed authentication, authorization denials, input validation failures, rate limiting triggered
- `INFO`: Successful authentication, significant user actions, configuration changes
- `DEBUG`: Detailed request/response data (never in production for security events)

**Log injection prevention:** User-controlled data in log messages can inject fake log entries. Use structured logging (JSON fields) instead of string interpolation. Never do `logger.info('User logged in: ' + username)` — use `logger.info({ username }, 'User logged in')`.

**Compliance requirements:**

- **SOC 2:** Log access to sensitive data, authentication events, system changes
- **HIPAA:** Log access to PHI, including read access
- **PCI DSS:** Log all access to cardholder data, authentication events, and admin actions with 1-year retention
- **GDPR:** Log data processing activities, data subject requests

**Common mistakes:**

- Logging passwords, tokens, or PII in plain text
- Using `console.log` instead of a structured logger
- Not correlating logs across microservices (missing request IDs)
- Logging to local files without rotation (disk fills up)
- Setting up alerting but never testing if alerts actually fire

## Source

https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
