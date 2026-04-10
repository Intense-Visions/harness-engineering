# CI Security Testing

> Run SAST, DAST, SCA, and secrets scanning on every commit -- automated security gates that
> catch vulnerabilities before they reach production

## When to Use

- Setting up a new CI/CD pipeline and need to integrate security scanning from the start
- Adding automated security testing to an existing pipeline that currently has none
- Evaluating SAST, DAST, and SCA tools for your technology stack
- Reducing the time between vulnerability introduction and detection
- Meeting compliance requirements for automated security testing (SOC2, PCI-DSS, ISO 27001)
- Managing false positives from security scanners without disabling them entirely

## Threat Context

Automated security testing in CI catches vulnerabilities at the earliest possible point after
code is written. Without CI security testing, vulnerabilities accumulate silently until a
periodic security review or penetration test discovers them -- by which time hundreds of
vulnerable commits have been deployed, the original developers have moved to other features,
and the fix requires understanding code written weeks or months ago.

The 2021 Codecov supply chain attack exploited a vulnerability in Codecov's Bash Uploader
script to exfiltrate environment variables (including CI secrets) from thousands of CI/CD
pipelines. The attack went undetected for two months because most organizations did not scan
their CI pipeline components for tampering. Pipeline security -- securing the CI/CD system
itself, not just the code it builds -- is as critical as the application security testing the
pipeline performs.

The 2023 CircleCI breach exposed customer secrets stored in CircleCI's environment. The 2024
xz-utils backdoor (CVE-2024-3094) was injected through a compromised maintainer who modified
build scripts. These incidents demonstrate that CI/CD pipelines are high-value targets: they
have access to production credentials, signing keys, and deployment permissions.

## Instructions

1. **Implement Static Application Security Testing (SAST) on every pull request.** SAST
   analyzes source code for vulnerability patterns without executing it. Tool options: CodeQL
   (GitHub, semantic analysis, supports C/C++, Java, JavaScript, Python, Go, Ruby, C#),
   Semgrep (pattern-based, fast, supports 30+ languages, community rules plus custom rules),
   SonarQube (broad language support, code quality plus security). Run SAST on pull requests,
   not just the main branch, so developers see findings before merging. Configure findings as
   PR comments or check annotations, not just dashboard entries.

2. **Implement Software Composition Analysis (SCA) for dependency vulnerabilities.** SCA
   identifies known vulnerabilities in third-party dependencies. Tools: Dependabot (GitHub
   native, auto-creates PRs for vulnerable dependencies), Snyk (broad ecosystem support,
   license compliance), Trivy (container and filesystem scanning, open-source), Grype (Anchore,
   SBOM-based vulnerability matching). Run SCA on every PR and on a daily schedule against the
   main branch (new CVEs are published daily against existing dependencies). Block merges for
   critical and high severity vulnerabilities with known exploits.

3. **Implement secrets scanning to prevent credential leaks.** Secrets scanning detects API
   keys, passwords, tokens, and private keys in source code. Tools: gitleaks (fast, regex-based,
   open-source), truffleHog (entropy-based plus regex, scans git history), GitGuardian
   (commercial, real-time monitoring, broad secret type coverage). Run secrets scanning as a
   pre-commit hook (catches secrets before they enter git history) and in CI (catches secrets
   that bypass the pre-commit hook). Scan the full git history periodically -- a secret committed
   and then deleted is still in the git history and still compromised.

4. **Implement Dynamic Application Security Testing (DAST) against staging environments.** DAST
   tests the running application by sending malicious requests and observing responses. Tools:
   OWASP ZAP (open-source, scriptable, API and web scanning), Burp Suite (commercial, more
   comprehensive, better for complex applications), Nuclei (template-based, fast, good for
   known vulnerability checks). Run DAST against a staging environment deployed from the PR
   branch. Configure authenticated scanning so the scanner tests authenticated endpoints, not
   just the login page. DAST finds runtime vulnerabilities that SAST misses: misconfigured
   headers, exposed error pages, authentication bypasses.

5. **Harden the CI/CD pipeline itself.** The pipeline has access to production secrets,
   deployment credentials, and signing keys -- it is a high-value target. Runner isolation: use
   ephemeral runners that are destroyed after each job (GitHub Actions hosted runners, ephemeral
   self-hosted runners). Secret masking: ensure CI secrets are never printed in logs. Pin
   dependencies: pin GitHub Actions and other CI plugins by SHA, not by tag (a tag can be
   reassigned to point to a malicious commit). Least privilege: CI service accounts should have
   the minimum permissions needed for their specific job, not admin access to the entire
   infrastructure.

6. **Establish a triage and suppression workflow for findings.** Every security scanner produces
   false positives. Without a triage workflow, developers either ignore all findings (alert
   fatigue) or waste time on non-issues. Implement a triage process: new findings are reviewed
   within a defined SLA (24 hours for critical, 1 week for medium). Confirmed findings become
   backlog items with severity-based SLAs. False positives are suppressed with a documented
   justification (code comment, scanner configuration, or triage tool entry). Track the
   false-positive rate per scanner and per rule to identify rules that need tuning or removal.

7. **Measure and report on CI security metrics.** Track: mean time to detect (from commit to
   finding), mean time to remediate (from finding to fix), false-positive rate by scanner and
   rule, findings by severity and category, percentage of PRs with security findings. Report
   these metrics monthly to engineering leadership. The goal is not zero findings -- it is a
   decreasing trend in time-to-detect and time-to-remediate, with a manageable false-positive
   rate that keeps developers engaged rather than fatigued.

## Details

- **SAST: pattern-based vs semantic analysis**: Pattern-based tools (Semgrep) match code against
  known vulnerability patterns using AST matching or regex. They are fast, easy to write custom
  rules for, and have low setup cost. Semantic analysis tools (CodeQL) build a queryable database
  of the code's data flow and control flow, enabling taint tracking (tracing untrusted input
  from source to sink). CodeQL can find vulnerabilities that require understanding data flow
  across multiple functions and files, which pattern matching cannot. Use both: Semgrep for
  fast, broad coverage with custom rules; CodeQL for deep taint analysis on critical code paths.

- **False positive management strategies**: Accept that false positives are inherent in static
  analysis. Strategies to manage them: configure scanner sensitivity (start strict, loosen rules
  with high FP rates), use inline suppression annotations with mandatory justification comments,
  create a central suppressions file reviewed in security champion meetings, track FP rates per
  rule and disable rules with >50% FP rate after investigation, deduplicate findings across
  scanners to avoid reviewing the same issue twice.

- **Pipeline-as-code security**: If the CI configuration (GitHub Actions YAML, Jenkinsfile,
  GitLab CI YAML) is stored in the repository, any developer with commit access can modify the
  pipeline to skip security checks. Mitigations: use CODEOWNERS to require security team
  approval for CI configuration changes, use reusable workflows (GitHub) or templates (GitLab)
  that projects cannot modify, use branch protection rules that require specific checks to pass
  before merging.

- **Scanning schedule strategy**: PR-time scanning (SAST, secrets, SCA): fast feedback, catches
  new introductions. Daily scheduled scanning (SCA against main): catches newly disclosed CVEs
  in existing dependencies. Weekly full DAST scans: comprehensive runtime testing. Monthly
  historical secrets scan: catches secrets committed and deleted in past history. Each cadence
  serves a different detection objective.

## Anti-Patterns

1. **Alert fatigue from untuned scanners.** Deploying a scanner with default rules and no tuning
   generates hundreds of findings, most of which are false positives or low-severity issues.
   Developers learn to ignore the scanner. Start with a small set of high-confidence rules,
   verify that findings are actionable, and gradually expand coverage. A scanner that produces
   10 accurate findings is more valuable than one that produces 500 findings of which 450 are
   false positives.

2. **Security scanning as a separate pipeline stage.** Running security scans in a separate,
   optional pipeline stage that developers can skip or ignore. Security scanning should be
   integrated into the required CI checks -- the same checks that must pass before a PR can be
   merged. If security scanning is optional, it will be skipped when it is inconvenient, which
   is exactly when it is most needed.

3. **Scanning only the main branch instead of pull requests.** Scanning after merge means the
   vulnerability is already in the production codebase when it is detected. The developer who
   introduced it may have moved to another task. Scan pull requests so that findings appear in
   the context of the change that introduced them, when the developer can fix them immediately.

4. **No triage process for findings.** Scanner output dumped into a dashboard that nobody
   reviews. Findings accumulate, the dashboard becomes a graveyard of unresolved issues, and
   the scanner provides no security value. Every finding must have an owner, a severity-based
   SLA, and a tracked resolution (fixed, suppressed with justification, or accepted risk).

5. **Treating scanner output as a compliance checkbox.** Running scanners to satisfy an audit
   requirement without acting on the findings. The audit asks "do you run SAST?" and the answer
   is "yes" -- but the 200 open critical findings tell a different story. Scanners provide value
   only when their findings drive remediation. Track and report the percentage of findings
   remediated within SLA, not just whether the scanner ran.

6. **Hardcoding suppression of findings without review.** Developers adding blanket suppression
   annotations to silence scanner warnings without understanding the finding. Require that all
   suppressions include a justification comment and are reviewed by a security champion or the
   security team. Periodically audit suppressed findings to verify the justification is still
   valid.
