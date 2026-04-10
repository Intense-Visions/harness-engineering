# Dependency Auditing

> Your application is 90% third-party code -- scan it for known vulnerabilities, lock it
> to exact versions, and have a strategy for when a critical CVE drops on a Friday
> afternoon

## When to Use

- Setting up dependency vulnerability scanning for a project
- Responding to a CVE in a direct or transitive dependency
- Designing an update strategy that balances security with stability
- Auditing lockfile integrity to detect supply chain tampering
- Evaluating SCA (Software Composition Analysis) tools
- Meeting compliance requirements for dependency management

## Threat Context

The 2021 Log4Shell vulnerability (CVE-2021-44228, CVSS 10.0) affected nearly every Java
application through the ubiquitous Log4j library -- a single JNDI lookup string in any
user input could trigger remote code execution. Organizations with dependency scanning and
automated update pipelines patched within hours; those without took weeks or months, with
some remaining vulnerable for over a year. The 2018 event-stream npm package compromise
inserted a cryptocurrency-stealing payload targeting the Copay Bitcoin wallet into a
transitive dependency used by millions of projects. The 2022 node-ipc sabotage by its own
maintainer demonstrated that even trusted, widely-used packages can become intentionally
malicious (the maintainer added code to overwrite files on systems with Russian or
Belarusian IP addresses). Your application's security is the security of its weakest
dependency, and most applications have hundreds of transitive dependencies that no
developer has ever reviewed.

## Instructions

1. **Use lockfiles and verify their integrity.** `package-lock.json` (npm), `yarn.lock`,
   `pnpm-lock.yaml`, `Pipfile.lock` (Python), `go.sum` (Go), `Gemfile.lock` (Ruby).
   Lockfiles pin exact versions and record integrity hashes (SHA-512 for npm, SHA-256 for
   Go). Run `npm ci` (not `npm install`) in CI to install exactly what the lockfile
   specifies. `npm ci` deletes `node_modules` and installs from scratch using only the
   lockfile, failing if `package-lock.json` and `package.json` are out of sync. This
   ensures reproducible builds and prevents silent dependency resolution changes.

2. **Scan dependencies in CI.** Run `npm audit`, `pip-audit`, `bundle audit`, or a
   commercial SCA tool (Snyk, Sonatype Nexus, Dependabot, Trivy) in every CI pipeline.
   Fail the build for critical and high severity vulnerabilities -- these represent known
   exploitable weaknesses with public proof-of-concept code. Triage medium and low
   severity vulnerabilities on a weekly cadence. Do not let vulnerability counts
   accumulate into the hundreds, which creates alert fatigue and masks genuine threats.

3. **Understand transitive dependencies.** A direct dependency with zero vulnerabilities
   can bring in a transitive dependency with critical vulnerabilities. `npm ls --all`
   shows the full dependency tree. `npm audit` scans the entire tree, not just direct
   dependencies. Audit the depth of your dependency tree: if your application has 5 direct
   dependencies but 500 transitive dependencies, your actual attack surface is 500
   packages, each of which can introduce vulnerabilities, malicious code, or supply chain
   risk.

4. **Design an update strategy.** Semantic versioning provides a heuristic: patch versions
   (1.2.x) are safe to auto-merge after CI passes, minor versions (1.x.0) are usually
   safe but need testing, major versions (x.0.0) require manual review for breaking
   changes. Use Dependabot or Renovate to automate PR creation for dependency updates.
   Group minor/patch updates into weekly PRs to reduce PR noise. Review major updates
   individually. Set auto-merge for patch updates that pass CI to reduce the backlog.

5. **Maintain a vulnerability response playbook.** When a critical CVE drops: (1) identify
   if the vulnerable package is in your dependency tree (`npm ls <package>`,
   `pip show <package>`, `go mod graph | grep <package>`), (2) check if a patched version
   exists, (3) if yes, update and deploy immediately, (4) if no patch exists, evaluate
   mitigations (WAF rules, input validation, feature flags to disable affected
   functionality), (5) monitor for exploit attempts in logs. The playbook should be
   documented, tested, and executable by any on-call engineer, not just the security team.

6. **Pin and minimize dependencies.** Fewer dependencies mean less attack surface. Before
   adding a dependency, evaluate: can we implement this functionality in 50 lines of
   code? Is the package actively maintained (commits in the last 6 months)? How many
   transitive dependencies does it bring? What is the package's security history? Use
   tools like bundlephobia (npm) to assess the weight. A 2-line utility function does not
   justify adding a package with 40 transitive dependencies.

## Details

### SCA Tool Comparison

| Tool           | Type            | Auto PRs | CI Integration | Best For                             |
| -------------- | --------------- | -------- | -------------- | ------------------------------------ |
| npm audit      | Built-in        | No       | Yes            | Basic JS/TS scanning                 |
| Snyk           | Commercial/Free | Yes      | Yes            | Developer-friendly, comprehensive    |
| Dependabot     | GitHub-native   | Yes      | Yes            | GitHub repos, automatic PRs          |
| Renovate       | Open source     | Yes      | Yes            | Flexible, self-hostable, multi-PM    |
| Trivy          | Open source     | No       | Yes            | Container and filesystem scanning    |
| Sonatype Nexus | Enterprise      | Yes      | Yes            | Policy engine, enterprise compliance |

Recommendation: Dependabot or Renovate for automated update PRs, plus Snyk or Trivy for
vulnerability scanning in CI. The combination of automated PRs and CI scanning covers
both proactive updating and reactive vulnerability detection.

### Supply Chain Attack Taxonomy

- **Typosquatting**: Publishing `express-js` or `expresss` to catch typos of `express`.
  The malicious package has a similar name and may even re-export the real package's
  functionality while executing a payload.
- **Dependency confusion**: Publishing a public package with the same name as a private
  internal package. Package managers may prefer the public registry version, pulling in
  the attacker's code. Mitigate with scoped packages and registry configuration.
- **Maintainer compromise**: Stolen npm tokens, compromised GitHub accounts, or social
  engineering to gain publish access. The event-stream attack used this vector.
- **Malicious update**: A trusted package pushes a version containing malicious code. May
  be intentional (node-ipc) or result of compromised credentials.
- **Build-time compromise**: Modifying CI/CD scripts or build tools (Codecov attack).

### Lockfile Manipulation Attacks

An attacker with PR access can modify the lockfile to point to a different package version
or a malicious registry URL. The lockfile diff is often large, auto-generated, and
skipped during code review. Lockfile-lint and lockfile-lint-api verify that all packages
resolve to the expected registry. Include lockfile review in the code review process:
review the `resolved` URLs in the lockfile for unexpected registries, and reject PRs that
modify the lockfile without corresponding `package.json` changes.

### Emergency Patching Workflow

1. Security advisory received (via email, GitHub advisory, or CVE database alert)
2. Check if the vulnerable package is in any service's dependency tree
3. Identify all affected services and their deployment environments
4. Check if a patched version is available
5. If patched: update lockfile, run tests, deploy to staging, verify, deploy to production
6. If no patch: implement WAF rule or configuration workaround, disable affected feature
   via feature flag, set daily reminder to check for patch
7. Post-incident: add the package to enhanced monitoring, review whether the dependency
   is still necessary

## Anti-Patterns

1. **No lockfile in the repository.** Without a lockfile, `npm install` resolves the
   latest version of every dependency at install time, meaning builds are non-reproducible
   and a malicious update is automatically pulled in on the next install. Always commit
   lockfiles to version control.

2. **Ignoring audit warnings.** "There are 47 moderate vulnerabilities" becomes background
   noise and is ignored entirely. This is how Log4Shell persists in production for months.
   Triage vulnerabilities: fix critical and high immediately, schedule medium and low for
   weekly review, document accepted risks with justification.

3. **Updating dependencies only when something breaks.** Waiting until a production
   incident forces a dependency update means you are always updating under pressure with
   no time for proper testing. Proactive weekly updates are less risky than emergency
   updates under a security incident.

4. **Trusting download counts as a security signal.** Popular packages get compromised
   too -- event-stream had millions of weekly downloads. Evaluate: maintenance activity
   (recent commits), security audit history, dependency depth (fewer transitive deps is
   better), and whether the package has multiple maintainers.

5. **Using `npm install` in CI instead of `npm ci`.** `npm install` can modify the
   lockfile if `package.json` and `package-lock.json` diverge, producing a build with
   different dependency versions than what was tested locally. `npm ci` installs exactly
   what the lockfile specifies and fails on any discrepancy. Use `npm ci` in CI for
   reproducible, auditable builds.
