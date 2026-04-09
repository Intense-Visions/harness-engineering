# Dependency Security

> Manage third-party dependency risks with auditing, lockfiles, automated scanning, and supply chain hardening

## When to Use

- Adding new dependencies to a project
- Setting up automated vulnerability scanning in CI
- Responding to a CVE in a dependency
- Reviewing the dependency tree for unnecessary packages
- Hardening the supply chain against typosquatting and malicious packages

## Instructions

1. **Run `npm audit` regularly and in CI.** It checks installed packages against the npm advisory database for known vulnerabilities.

```bash
# Check for vulnerabilities
npm audit

# Fix automatically where possible
npm audit fix

# Only report high and critical severity
npm audit --audit-level=high

# CI gate — fail build on high/critical vulnerabilities
npm audit --audit-level=high --production
```

2. **Always commit lockfiles.** `package-lock.json`, `yarn.lock`, or `pnpm-lock.yaml` pin exact dependency versions. Without a lockfile, `npm install` can silently install different (potentially compromised) versions.

3. **Set up automated dependency updates with Dependabot or Renovate.**

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    open-pull-requests-limit: 10
    groups:
      dev-dependencies:
        dependency-type: development
        update-types: [minor, patch]
      production-dependencies:
        dependency-type: production
        update-types: [patch]
    ignore:
      - dependency-name: '*'
        update-types: ['version-update:semver-major']
```

4. **Review new dependencies before adding them.** Check these criteria:

```bash
# Check package health signals
npm info <package> # Last publish date, maintainers, weekly downloads
npx is-my-dep-secure <package> # Security audit

# Manual checklist:
# - Actively maintained? (commits within last 6 months)
# - Trusted maintainer? (known individual or organization)
# - Reasonable download count? (not a typosquat of a popular package)
# - Small dependency tree? (fewer transitive deps = smaller attack surface)
# - License compatible? (MIT, Apache-2.0, ISC are safe for commercial use)
```

5. **Use `--ignore-scripts` for untrusted packages.** Postinstall scripts can execute arbitrary code. Disable them globally and whitelist trusted packages.

```bash
# Disable all lifecycle scripts globally
npm config set ignore-scripts true

# Allow specific packages
npx allow-scripts

# Or use package.json
{
  "scripts": {
    "preinstall": "npx only-allow pnpm"
  }
}
```

6. **Pin critical production dependencies.** For security-sensitive packages (auth, crypto, parsing), use exact versions instead of semver ranges.

```json
{
  "dependencies": {
    "jsonwebtoken": "9.0.2",
    "bcrypt": "5.1.1",
    "helmet": "7.1.0"
  }
}
```

7. **Monitor for vulnerabilities continuously.** Use GitHub's security alerts, Snyk, or Socket.dev for real-time notifications when new CVEs affect your dependencies.

```yaml
# GitHub Actions — run audit on every PR
- name: Security audit
  run: npm audit --audit-level=high --production
```

8. **Remove unused dependencies.** Dead dependencies still introduce risk. Use `depcheck` to find unused packages.

```bash
npx depcheck
# Lists unused dependencies, missing dependencies, and unused devDependencies
```

9. **Use Subresource Integrity (SRI) for CDN-loaded scripts.** If loading JavaScript from a CDN, use `integrity` attributes to verify the script has not been tampered with.

```html
<script
  src="https://cdn.example.com/lib.js"
  integrity="sha384-abc123..."
  crossorigin="anonymous"
></script>
```

10. **Keep Node.js itself updated.** The runtime has its own vulnerability history. Use LTS versions and update when security patches are released.

## Details

**Supply chain attack vectors:**

- **Typosquatting:** `lodas` instead of `lodash` — a malicious package with a similar name
- **Dependency confusion:** A public package with the same name as an internal package — npm may pull the public one
- **Maintainer compromise:** Legitimate package maintainer's account is hacked (e.g., event-stream incident)
- **Malicious postinstall scripts:** Code runs during `npm install` before you ever import the package

**Dependency confusion prevention:** Use scoped packages (`@company/utils`), configure `.npmrc` to point to your private registry for scoped packages, and use `npm-package-arg` to detect resolution anomalies.

```ini
# .npmrc
@company:registry=https://npm.company.com/
```

**SBOM (Software Bill of Materials):** Generate an SBOM for compliance and audit trails. Use `cyclonedx-npm` or `spdx-sbom-generator` to produce machine-readable dependency inventories.

**When to accept audit findings:** Some vulnerabilities are in dev dependencies that never run in production, or in code paths your application does not exercise. Document accepted risks rather than ignoring them silently.

**Common mistakes:**

- Ignoring `npm audit` output because "everything still works"
- Not committing the lockfile (different installs on different machines)
- Using `npm audit fix --force` without reviewing breaking changes
- Installing packages from unverified registries
- Running `npm install` in production instead of `npm ci` (lockfile not respected)

## Source

https://cheatsheetseries.owasp.org/cheatsheets/Vulnerable_and_Outdated_Components_Cheat_Sheet.html

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
