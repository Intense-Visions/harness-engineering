# Harness Deployment

> CI/CD pipeline analysis, deployment strategy design, and environment management. From commit to production with confidence.

## When to Use

- When setting up or reviewing CI/CD pipelines for a new or existing project
- When evaluating deployment strategies (blue-green, canary, rolling) for a service
- When auditing environment separation and promotion workflows
- NOT for container image building or registry management (use harness-containerization)
- NOT for infrastructure provisioning (use harness-infrastructure-as-code)
- NOT for application performance under load (use harness-perf)

## Process

### Phase 1: DETECT -- Identify Pipeline and Environment Configuration

1. **Scan for CI/CD configuration files.** Search the project root for pipeline definitions:
   - `.github/workflows/*.yml` -- GitHub Actions
   - `.gitlab-ci.yml` -- GitLab CI
   - `Jenkinsfile` -- Jenkins
   - `.circleci/config.yml` -- CircleCI
   - `bitbucket-pipelines.yml` -- Bitbucket Pipelines
   - `azure-pipelines.yml` -- Azure DevOps
   - `deploy/`, `scripts/deploy*` -- custom deployment scripts

2. **Identify deployment targets.** Parse pipeline files for deployment steps and extract:
   - Target environments (dev, staging, production)
   - Deployment mechanisms (kubectl apply, aws ecs update-service, serverless deploy, rsync)
   - Cloud provider and region information
   - Container registry references

3. **Detect environment configuration.** Look for environment-specific config:
   - `.env.production`, `.env.staging` files
   - Environment variable injection in pipeline definitions
   - Secret references (GitHub Secrets, GitLab CI variables, Vault paths)
   - Feature flag provider configuration per environment

4. **Map the deployment topology.** Build a summary of what gets deployed where:
   - Service name, pipeline file, target environment, deployment mechanism
   - Dependencies between services (deploy order constraints)
   - Manual approval gates vs. automatic promotion

5. **Present detection summary.** Output the discovered topology before proceeding:

   ```
   Deployment Topology:
     Platform: GitHub Actions
     Pipelines: 3 workflow files
     Environments: dev, staging, production
     Strategy: Rolling (detected from kubectl rolling-update)
     Approval gates: production (manual)
   ```

---

### Phase 2: ANALYZE -- Evaluate Pipeline Quality and Gaps

1. **Check pipeline stage completeness.** A mature pipeline includes these stages. Flag any that are missing:
   - Build and compile
   - Unit tests
   - Integration tests
   - Security scan (SAST/DAST)
   - Artifact packaging
   - Deploy to staging
   - Smoke tests post-deploy
   - Deploy to production
   - Post-deploy verification

2. **Evaluate environment isolation.** Verify that environments are properly separated:
   - Staging and production use different credentials
   - Environment-specific variables are not shared across environments
   - Database connections point to the correct environment
   - No hardcoded production URLs in non-production configs

3. **Check deployment safety mechanisms.** Verify the pipeline includes:
   - Rollback procedures (automatic or documented manual)
   - Health checks after deployment
   - Timeout configuration on deployment steps
   - Concurrency controls (prevent parallel deploys to the same environment)
   - Branch protection rules that gate production deploys

4. **Analyze pipeline performance.** Identify bottlenecks:
   - Steps that could run in parallel but are sequential
   - Missing caching (dependencies, build artifacts, Docker layers)
   - Redundant steps across workflows
   - Total pipeline duration from commit to production

5. **Check secret hygiene in pipelines.** Verify:
   - No secrets hardcoded in pipeline files
   - Secrets are scoped to the minimum required environment
   - Secret rotation is possible without pipeline changes
   - OIDC or workload identity is used where available instead of long-lived credentials

---

### Phase 3: DESIGN -- Recommend Strategy Improvements

1. **Recommend deployment strategy.** Based on the service characteristics:
   - **Rolling** -- suitable for stateless services with backward-compatible changes
   - **Blue-green** -- suitable when zero-downtime cutover is required and rollback must be instant
   - **Canary** -- suitable for high-traffic services where gradual validation reduces blast radius
   - **Recreate** -- suitable only for development environments or when downtime is acceptable

2. **Design missing pipeline stages.** For each gap identified in Phase 2, provide:
   - The stage definition in the project's CI/CD platform syntax
   - Where it fits in the pipeline order
   - What tools or services it requires
   - Example configuration snippet

3. **Recommend environment promotion workflow.** Design the path from commit to production:
   - Automatic promotion from dev to staging after tests pass
   - Manual approval gate before production (with notification to the team channel)
   - Smoke test suite that runs post-deploy in each environment
   - Rollback trigger conditions (error rate spike, health check failure)

4. **Design rollback procedure.** Every deployment must have a documented rollback:
   - For container deployments: revert to previous image tag
   - For serverless: revert to previous function version
   - For database migrations: backward-compatible migration strategy
   - Maximum rollback time target (e.g., under 5 minutes)

5. **Recommend monitoring integration.** Connect deployment events to observability:
   - Deploy markers in APM tools (Datadog, New Relic, Grafana)
   - Automated alerts on error rate increase after deploy
   - Deployment frequency and lead time tracking

---

### Phase 4: VALIDATE -- Verify Pipeline Correctness

1. **Lint pipeline configuration.** Run syntax validation:
   - GitHub Actions: `actionlint` or YAML schema validation
   - GitLab CI: `gitlab-ci-lint` API endpoint
   - Jenkinsfile: Groovy syntax check
   - General: YAML structure validation for all config files

2. **Verify environment variable completeness.** For each environment:
   - All required variables are defined
   - No placeholder values remain (TODO, CHANGEME, xxx)
   - Variables referenced in code exist in the pipeline configuration

3. **Verify branch protection alignment.** Confirm that:
   - Production deploy pipelines only trigger from protected branches
   - Required status checks match the pipeline stages
   - Force-push is disabled on deployment branches

4. **Generate deployment readiness report.** Summarize findings:

   ```
   Deployment Readiness: [PASS/WARN/FAIL]

   Pipeline stages: 7/9 present (missing: security scan, smoke tests)
   Environment isolation: PASS
   Rollback procedure: WARN (documented but not automated)
   Secret hygiene: PASS
   Pipeline performance: 12m avg (recommend parallelizing test stages)

   Recommendations:
     1. Add SAST scan stage between build and deploy
     2. Add post-deploy smoke test stage
     3. Automate rollback on health check failure
   ```

5. **Present results.** Use `emit_interaction` to deliver the report and ask whether to proceed with implementing recommendations.

---

## Harness Integration

- **`harness skill run harness-deployment`** -- Primary invocation for deployment analysis.
- **`harness validate`** -- Run after any pipeline configuration changes to verify project health.
- **`harness check-deps`** -- Verify deployment script dependencies are available.
- **`emit_interaction`** -- Present deployment readiness report and gather decisions on strategy.

## Success Criteria

- All CI/CD configuration files in the project are identified and cataloged
- Pipeline stage completeness is assessed against the standard checklist
- Environment isolation is verified with no cross-environment credential leakage
- A deployment strategy recommendation is provided with rationale
- Rollback procedures are documented or flagged as missing
- Pipeline lint passes without errors

## Examples

### Example: Node.js API with GitHub Actions

```
Phase 1: DETECT
  Found: .github/workflows/ci.yml, .github/workflows/deploy.yml
  Environments: staging (auto), production (manual dispatch)
  Strategy: Rolling (kubectl set image)
  Registry: ghcr.io/org/api-server

Phase 2: ANALYZE
  Missing stages: security scan, post-deploy smoke tests
  Environment isolation: PASS
  Secret hygiene: WARN -- AWS_ACCESS_KEY_ID used instead of OIDC
  Pipeline duration: 18m (test and lint run sequentially)

Phase 3: DESIGN
  Recommendation: Add trivy scan after Docker build
  Recommendation: Switch to AWS OIDC for keyless authentication
  Recommendation: Parallelize lint and test jobs (saves ~4m)
  Recommendation: Add smoke test job after deploy-staging

Phase 4: VALIDATE
  actionlint: PASS
  Environment variables: PASS
  Branch protection: WARN -- main branch allows force-push
  Result: WARN -- 3 recommendations, 1 security improvement needed
```

### Example: Python Service with GitLab CI and Canary Deploy

```
Phase 1: DETECT
  Found: .gitlab-ci.yml with 5 stages
  Environments: dev, staging, production
  Strategy: Canary (Istio VirtualService weight shifting)
  Registry: registry.gitlab.com/org/service

Phase 2: ANALYZE
  All 9 standard stages present
  Environment isolation: PASS
  Canary configuration: 5% -> 25% -> 75% -> 100% over 30 minutes
  Rollback: Automatic on 5xx rate > 1%

Phase 3: DESIGN
  Current strategy is well-configured. Minor recommendations:
  - Add canary duration metrics to Grafana dashboard
  - Add deployment event annotation to Prometheus
  - Consider adding a manual gate between 75% and 100%

Phase 4: VALIDATE
  GitLab CI lint: PASS
  Environment variables: PASS
  Branch protection: PASS
  Result: PASS -- pipeline is production-ready
```

## Gates

- **No production deploy without staging validation.** If the pipeline allows direct-to-production deployment without a prior staging step, flag as a blocking issue.
- **No long-lived credentials in pipelines.** Hardcoded secrets or long-lived access keys in pipeline files are blocking findings. OIDC or short-lived tokens must be used.
- **No deploy without rollback.** Every deployment target must have a documented or automated rollback mechanism. Missing rollback is a blocking warning.
- **No skipping pipeline lint.** Pipeline configuration must pass syntax validation before recommendations are made.

## Evidence Requirements

When this skill makes claims about existing code, architecture, or behavior,
it MUST cite evidence using one of:

1. **File reference:** `file:line` format (e.g., `src/auth.ts:42`)
2. **Code pattern reference:** `file` with description (e.g., `src/utils/hash.ts` —
   "existing bcrypt wrapper")
3. **Test/command output:** Inline or referenced output from a test run or CLI command
4. **Session evidence:** Write to the `evidence` session section via `manage_state`

**Uncited claims:** Technical assertions without citations MUST be prefixed with
`[UNVERIFIED]`. Example: `[UNVERIFIED] The auth middleware supports refresh tokens`.

## Red Flags

### Universal

These apply to ALL skills. If you catch yourself doing any of these, STOP.

- **"I believe the codebase does X"** — Stop. Read the code and cite a file:line
  reference. Belief is not evidence.
- **"Let me recommend [pattern] for this"** without checking existing patterns — Stop.
  Search the codebase first. The project may already have a convention.
- **"While we're here, we should also [unrelated improvement]"** — Stop. Flag the idea
  but do not expand scope beyond the stated task.

### Domain-Specific

- **"Deploying without a health check endpoint"** — Stop. Without health checks, the orchestrator cannot detect failed deployments. Add health checks before deploying.
- **"Skipping canary deployment, it's a small change"** — Stop. Small changes cause outages too. Follow the deployment policy regardless of change size.
- **"Rolling back manually if something goes wrong"** — Stop. Manual rollback under incident pressure fails. Automate rollback before deploying.
- **"We can update the runbook after the deploy"** — Stop. If the deployment changes operational behavior, update the runbook first. Stale runbooks during incidents cause escalations.

## Rationalizations to Reject

| Rationalization                                | Reality                                                                                                                                |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| "It's just a config change, not a code change" | Config changes cause outages at the same rate as code changes. Deploy them with the same rigor and rollback strategy.                  |
| "We tested this in staging"                    | Staging is not production. Traffic patterns, data volume, and edge cases differ. Staging success does not guarantee production safety. |
| "Downtime will be brief"                       | Brief is not zero. Quantify the expected impact and communicate it to stakeholders before deploying.                                   |

## Escalation

- **When the CI/CD platform is unsupported:** Report which platform was detected and that analysis is limited to general best practices. Recommend the user provide platform-specific documentation for deeper analysis.
- **When secrets are found hardcoded in pipeline files:** Immediately flag as a critical finding. Do not proceed with strategy recommendations until secrets are remediated. Recommend rotating the exposed credentials.
- **When multiple deployment strategies are mixed across environments:** This is valid (e.g., rolling for staging, canary for production). Analyze each independently and verify the promotion workflow handles the strategy transition.
- **When pipeline configuration is generated by a tool (Terraform, Pulumi):** Analyze the generated output but note that fixes must be applied to the generator configuration, not the output files.
