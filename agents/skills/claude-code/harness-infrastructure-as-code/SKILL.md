# Harness Infrastructure as Code

> Terraform, CloudFormation, and Pulumi analysis. Module structure, state management, drift prevention, and security posture for infrastructure definitions.

## When to Use

- When reviewing or designing Terraform, CloudFormation, or Pulumi configurations
- When auditing IaC module structure, naming conventions, and state management
- On PRs that modify infrastructure definitions or add new cloud resources
- NOT for CI/CD pipeline configuration (use harness-deployment)
- NOT for container orchestration (use harness-containerization)
- NOT for application-level security (use harness-security-review)

## Process

### Phase 1: DETECT -- Identify IaC Tool and Structure

1. **Detect IaC tooling.** Scan the project for infrastructure definitions:
   - `*.tf` files -- Terraform (HCL)
   - `terraform/` directory with `.terraform.lock.hcl`
   - `cloudformation/`, `*.template.yaml`, `*.template.json` -- CloudFormation
   - `Pulumi.yaml`, `Pulumi.*.yaml` -- Pulumi
   - `cdk.json`, `cdk.out/` -- AWS CDK
   - `infrastructure/`, `infra/` -- common IaC directories

2. **Identify provider and backend.** Parse configuration for:
   - Cloud providers (AWS, GCP, Azure) and their versions
   - State backend (S3, GCS, Azure Blob, Terraform Cloud, local)
   - Provider authentication method (environment variables, profiles, OIDC)
   - Lock file presence and provider version constraints

3. **Map module structure.** Build a dependency tree of modules:
   - Root modules and their child module references
   - Module source types (local path, registry, git)
   - Module versioning (pinned vs. unpinned)
   - Input variables and output values per module
   - Shared modules used across multiple root configurations

4. **Detect environment separation.** Identify how environments are managed:
   - Workspaces (Terraform workspaces)
   - Directory-per-environment (`environments/dev/`, `environments/prod/`)
   - Variable files per environment (`terraform.tfvars`, `prod.tfvars`)
   - Backend configuration per environment

5. **Present detection summary:**

   ```
   IaC Detection:
     Tool: Terraform v1.7
     Provider: AWS (us-east-1, us-west-2)
     Backend: S3 with DynamoDB locking
     Modules: 8 local, 3 registry
     Environments: dev, staging, prod (directory-per-env)
     State files: 3 (one per environment)
   ```

---

### Phase 2: ANALYZE -- Evaluate Patterns and Anti-Patterns

1. **Check state management.** Verify state is properly configured:
   - Remote backend with locking (not local state for shared infrastructure)
   - State encryption at rest enabled
   - State file does not contain secrets in plain text
   - State is segmented per environment (no single state file for all environments)
   - Backend configuration uses variables, not hardcoded values

2. **Evaluate module design.** Check modules for:
   - Single responsibility (one module does one thing)
   - Input validation (variable validation blocks or type constraints)
   - Output completeness (downstream consumers can get what they need)
   - No hardcoded values that should be variables
   - README or documentation for each module
   - Consistent naming conventions across modules

3. **Check resource naming and tagging.** Verify:
   - Resources follow a consistent naming convention (e.g., `{project}-{env}-{resource}`)
   - Required tags are present on all taggable resources (environment, team, cost-center)
   - Tag values are consistent (no mix of "prod" and "production")
   - Names do not contain environment-specific values in shared modules

4. **Analyze dependency management.** Check for:
   - Provider version constraints (required_providers block)
   - Module version pinning (exact version or range)
   - Lock file committed to version control
   - No circular dependencies between modules
   - Implicit dependencies are made explicit with depends_on where needed

5. **Check for common anti-patterns:**
   - Monolithic root modules (everything in one configuration)
   - Hardcoded AMI IDs, account numbers, or region values
   - Resources created outside of IaC (drift risk)
   - Overly permissive IAM policies (wildcards on actions or resources)
   - Missing lifecycle rules (prevent_destroy on critical resources)

---

### Phase 3: DESIGN -- Recommend Structure and Patterns

1. **Recommend module decomposition.** If monolithic configurations are detected:
   - Propose a module hierarchy based on service boundaries
   - Separate networking, compute, storage, and security into distinct modules
   - Design shared modules for common patterns (e.g., tagged S3 bucket, VPC)
   - Provide module interface design (inputs, outputs)

2. **Design state management strategy.** Recommend:
   - One state file per environment per service
   - Remote backend with encryption and locking
   - State import plan for any resources created outside IaC
   - Cross-state data sharing via `terraform_remote_state` or SSM parameters

3. **Recommend drift detection workflow.** Design a process to catch manual changes:
   - Scheduled `terraform plan` in CI to detect drift
   - Alert on any planned changes that were not initiated by a PR
   - Runbook for reconciling detected drift (import vs. revert)
   - Tag resources as IaC-managed for auditability

4. **Design environment promotion.** Recommend a workflow for infrastructure changes:
   - Changes applied to dev first, then promoted to staging, then production
   - Variable files per environment with appropriate overrides
   - Approval gates before production applies
   - Plan output reviewed as part of PR process

5. **Recommend security hardening.** For each provider:
   - Least-privilege IAM roles for IaC execution
   - No inline policies (use managed policies or policy documents)
   - Encryption enabled by default on all storage resources
   - Network security groups with explicit deny rules
   - Sensitive variables marked with `sensitive = true`

---

### Phase 4: VALIDATE -- Verify Configuration Correctness

1. **Run static analysis.** Execute available validation tools:
   - Terraform: `terraform validate`, `terraform fmt -check`
   - CloudFormation: `cfn-lint` or `aws cloudformation validate-template`
   - Pulumi: type checking via the chosen language runtime
   - CDK: `cdk synth` to verify template generation
   - General: `tflint`, `checkov`, or `tfsec` for security checks

2. **Verify variable completeness.** For each root module:
   - All declared variables have descriptions
   - Required variables have no default values
   - Optional variables have sensible defaults
   - Variable types are specific (not `any`)
   - Validation blocks exist for constrained values (e.g., allowed regions)

3. **Check plan safety.** If a plan output is available:
   - No unexpected resource deletions
   - No changes to resources marked with `prevent_destroy`
   - Replacements are expected (not caused by force-new arguments)
   - Plan matches the intended change described in the PR

4. **Verify security posture.** Run security-focused checks:
   - No public S3 buckets or storage accounts
   - No security groups allowing 0.0.0.0/0 on sensitive ports
   - Encryption enabled on RDS, EBS, S3, and other storage
   - IAM policies follow least privilege
   - No credentials or secrets in variable defaults or outputs

5. **Generate validation report:**

   ```
   IaC Validation: [PASS/WARN/FAIL]

   Format check: PASS (all files formatted)
   Validate: PASS (no syntax errors)
   Security scan: WARN (2 findings)
     - modules/storage/main.tf: S3 bucket missing server-side encryption
     - modules/network/main.tf: security group allows 0.0.0.0/0 on port 22
   Module design: WARN (3 modules missing input validation)
   State management: PASS (remote backend with locking)

   Recommendations:
     1. Add aws_s3_bucket_server_side_encryption_configuration resource
     2. Restrict SSH access to VPN CIDR range
     3. Add variable validation blocks to network, compute, and storage modules
   ```

---

## Harness Integration

- **`harness skill run harness-infrastructure-as-code`** -- Primary invocation for IaC analysis.
- **`harness validate`** -- Run after configuration changes to verify project health.
- **`harness check-deps`** -- Verify IaC tool dependencies are installed.
- **`emit_interaction`** -- Present design recommendations and gather decisions on module structure.

## Success Criteria

- IaC tooling, provider, and backend are correctly identified
- Module structure is mapped with dependency relationships
- State management is verified as remote, encrypted, and locked
- Resource naming and tagging follow consistent conventions
- Security posture is evaluated with no critical findings unaddressed
- Static analysis tools pass without errors

## Examples

### Example: Terraform AWS Multi-Environment Setup

```
Phase 1: DETECT
  Tool: Terraform v1.6.4
  Provider: AWS (hashicorp/aws ~> 5.0)
  Backend: S3 (us-east-1) with DynamoDB locking
  Modules: 5 local (vpc, ecs, rds, s3, iam), 2 registry (datadog, cloudwatch)
  Environments: dev, staging, prod (directory-per-env with shared modules)

Phase 2: ANALYZE
  State management: PASS (remote, encrypted, locked, per-env)
  Module design: WARN
    - modules/ecs has 450 lines -- recommend splitting into ecs-cluster
      and ecs-service modules
    - modules/rds missing variable validation for instance_class
  Naming: PASS (consistent {project}-{env}-{resource} pattern)
  Tags: WARN (cost-center tag missing on 3 resources)
  Anti-patterns: 1 hardcoded AMI in modules/ecs/main.tf

Phase 3: DESIGN
  1. Split modules/ecs into ecs-cluster and ecs-service
  2. Add data source for AMI lookup instead of hardcoded value
  3. Add variable validation: instance_class must be db.t3.* or db.r6g.*
  4. Add cost-center tag to default_tags in provider configuration
  5. Add scheduled terraform plan for drift detection in CI

Phase 4: VALIDATE
  terraform fmt: PASS
  terraform validate: PASS
  tfsec: WARN (2 findings -- see above)
  checkov: PASS
  Result: WARN -- 5 improvements recommended, no blocking issues
```

### Example: CloudFormation with CDK

```
Phase 1: DETECT
  Tool: AWS CDK v2.120 (TypeScript)
  Provider: AWS (us-west-2)
  Backend: CloudFormation (managed by CDK)
  Stacks: 3 (NetworkStack, ComputeStack, StorageStack)
  Environments: dev and prod via CDK context

Phase 2: ANALYZE
  Stack design: PASS (clean separation by concern)
  Cross-stack references: PASS (using CfnOutput and Fn::ImportValue)
  Security: WARN
    - ComputeStack: EC2 instance has public IP and open SSH
    - StorageStack: DynamoDB table missing point-in-time recovery
  CDK constructs: Using L2 constructs (good -- higher abstraction)

Phase 3: DESIGN
  1. Add bastion host pattern instead of direct SSH to EC2
  2. Enable point-in-time recovery on DynamoDB table
  3. Add cdk-nag for automated security checks in synthesis
  4. Add stack-level tags via Tags.of(stack).add()

Phase 4: VALIDATE
  cdk synth: PASS (3 templates generated)
  cfn-lint: PASS (all templates valid)
  Security: WARN (2 findings)
  Result: WARN -- 2 security improvements needed
```

## Gates

- **No local state for shared infrastructure.** Terraform configurations managing shared resources must use a remote backend with locking. Local state is blocking for any non-experimental configuration.
- **No unpinned provider versions.** Provider version constraints must be explicit. Using `>=` without an upper bound or omitting version constraints entirely is a blocking finding.
- **No public access to sensitive resources.** S3 buckets, databases, or storage accounts with public access enabled are blocking security findings.
- **No credentials in IaC files.** Hardcoded access keys, passwords, or tokens in Terraform variables, CloudFormation parameters, or Pulumi configuration are blocking findings.

## Escalation

- **When state is corrupted or diverged:** Do not attempt automatic recovery. Report the state of divergence, recommend `terraform state pull` for backup, and advise manual reconciliation with a plan review before any apply.
- **When resources exist outside IaC management:** Recommend a phased import strategy. Provide `terraform import` commands for each resource and note that import does not generate configuration -- the HCL must be written manually.
- **When module versions are significantly outdated:** Present the version gap and changelog summary. If breaking changes exist, recommend a separate PR for the upgrade with a plan review before applying.
- **When IaC tool version conflicts exist between team members:** Recommend pinning the tool version in `.terraform-version` (tfenv) or `Pulumi.yaml` and adding version checks to CI.
