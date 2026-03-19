# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly.

**Do not open a public issue.** Instead, email security concerns to: security@harness-engineering.dev

We will acknowledge receipt within 48 hours and provide a timeline for a fix.

## Supported Versions

| Version | Supported |
| ------- | --------- |
| Latest  | Yes       |

## Built-in Security Scanner

Harness includes a built-in security scanner that runs as part of the CI check pipeline. It detects common vulnerabilities with zero external dependencies.

### What It Checks

| Category        | Rules                      | Severity     | Examples                                           |
| --------------- | -------------------------- | ------------ | -------------------------------------------------- |
| Secrets         | SEC-SEC-001 to SEC-SEC-005 | Error        | AWS keys, API keys, private keys, passwords, JWTs  |
| Injection       | SEC-INJ-001 to SEC-INJ-003 | Error        | eval(), SQL concatenation, command injection       |
| XSS             | SEC-XSS-001 to SEC-XSS-003 | Error        | innerHTML, dangerouslySetInnerHTML, document.write |
| Crypto          | SEC-CRY-001 to SEC-CRY-002 | Error        | MD5/SHA1 for security, hardcoded encryption keys   |
| Path Traversal  | SEC-PTH-001                | Warning      | ../ in file operations                             |
| Network         | SEC-NET-001 to SEC-NET-003 | Warning/Info | CORS wildcards, disabled TLS, HTTP URLs            |
| Deserialization | SEC-DES-001                | Warning      | JSON.parse on untrusted input                      |

### Stack-Adaptive Rules

The scanner automatically detects your tech stack and applies additional rules:

- **Node.js:** Prototype pollution, NoSQL injection
- **Express:** Missing helmet, rate limiting
- **React:** Sensitive data in localStorage
- **Go:** Unsafe pointers, format string injection

### Configuration

Add a `security` section to `harness.config.json`:

```json
{
  "security": {
    "enabled": true,
    "strict": false,
    "rules": {
      "SEC-NET-003": "off"
    },
    "exclude": ["**/node_modules/**", "**/dist/**", "**/*.test.ts"]
  }
}
```

- `strict: true` — Promotes all warnings to errors
- `rules` — Override severity per-rule. Supports wildcards: `"SEC-INJ-*": "off"`
- `exclude` — Glob patterns for files to skip

### Integration Points

- **CI Pipeline:** Runs automatically as the `security` check in `harness ci check`
- **Pre-commit:** Integrated into `harness-pre-commit-review` skill
- **Code Review:** Security phase built into `harness-code-review` and `harness-integrity` skills
- **Deep Audit:** Use `/harness:security-review` for a thorough security audit with AI analysis
- **MCP Tool:** `run_security_scan` available for programmatic access

### Planned Enhancements

- **External tool integration:** Semgrep and Gitleaks support via detect-delegate-merge adapter. When installed, the scanner will delegate to these tools for deeper coverage and report `coverage: enhanced` instead of `baseline`.
- **ESLint security rules:** Security-specific rules generated via `harness-linter.yml`
