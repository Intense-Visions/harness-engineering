# Harness Containerization

> Dockerfile review, Kubernetes manifest validation, and container optimization. Smaller images, safer containers, correct orchestration.

## When to Use

- When reviewing Dockerfiles for image size, security, and layer efficiency
- When auditing Kubernetes manifests, Helm charts, or docker-compose files
- On PRs that modify container configuration files
- NOT for CI/CD pipeline design (use harness-deployment)
- NOT for infrastructure provisioning (use harness-infrastructure-as-code)
- NOT for application-level security review (use harness-security-review)

## Process

### Phase 1: SCAN -- Discover Container Configuration

1. **Locate container files.** Search the project for container-related configuration:
   - `Dockerfile`, `Dockerfile.*` (multi-target builds)
   - `docker-compose.yml`, `docker-compose.*.yml` (override files)
   - `.dockerignore`
   - `k8s/`, `kubernetes/`, `manifests/` directories
   - `helm/`, `charts/` directories
   - `skaffold.yaml`, `tilt.json` (dev tooling)

2. **Identify base images.** Parse each Dockerfile for FROM directives:
   - Record base image name, tag, and digest (if pinned)
   - Flag images using `latest` tag
   - Flag images from untrusted registries
   - Note multi-stage build structure (builder vs. runtime stages)

3. **Inventory Kubernetes resources.** Parse manifest files and record:
   - Resource types (Deployment, Service, ConfigMap, Secret, Ingress, HPA)
   - Namespaces used
   - Image references in pod specs
   - Resource requests and limits
   - Volume mounts and persistent volume claims

4. **Detect Helm usage.** If Helm charts exist:
   - Parse `Chart.yaml` for version and dependencies
   - Parse `values.yaml` for configurable parameters
   - Identify template files and their output resource types

5. **Present scan summary:**

   ```
   Container Scan:
     Dockerfiles: 2 (app, worker)
     Compose files: 1 (docker-compose.yml + docker-compose.dev.yml)
     K8s manifests: 8 resources across 2 namespaces
     Helm charts: 1 (app chart with 3 subcharts)
     Base images: node:20-alpine, python:3.12-slim
   ```

---

### Phase 2: ANALYZE -- Evaluate Best Practices

1. **Analyze Dockerfile layer efficiency.** Check each Dockerfile for:
   - COPY/ADD placement relative to dependency installation (cache busting)
   - Multi-stage builds separating build dependencies from runtime
   - Layer count optimization (combining related RUN commands)
   - Unnecessary files copied into the image (node_modules, .git, tests)
   - `.dockerignore` completeness

2. **Check container security posture.** Evaluate:
   - Running as non-root user (USER directive present)
   - No secrets in build args or environment variables
   - Base image currency (is the tag reasonably current)
   - HEALTHCHECK directive present
   - Read-only filesystem where possible
   - No privileged mode in compose or K8s specs
   - Security contexts in Kubernetes pod specs (runAsNonRoot, readOnlyRootFilesystem)

3. **Evaluate Kubernetes resource definitions.** For each Deployment/StatefulSet:
   - Resource requests and limits are set (CPU and memory)
   - Liveness and readiness probes are configured
   - Pod disruption budgets exist for production workloads
   - Horizontal pod autoscaler is configured where appropriate
   - Image pull policy is set (Always for mutable tags, IfNotPresent for digests)

4. **Analyze docker-compose configuration.** Check for:
   - Service dependency ordering (depends_on with health checks)
   - Volume mount correctness (host paths vs. named volumes)
   - Network isolation between services
   - Environment variable management (env_file vs. inline)
   - Port mapping conflicts

5. **Check image tag strategy.** Verify:
   - Production images use immutable tags (semver or digest)
   - Development images use descriptive tags (branch name, commit SHA)
   - No `latest` tag in production manifests
   - Registry URL is consistent across all references

---

### Phase 3: OPTIMIZE -- Recommend Improvements

1. **Recommend image size reduction.** For each Dockerfile:
   - Switch to minimal base images (alpine, distroless, scratch)
   - Remove build-only dependencies in multi-stage builds
   - Use `.dockerignore` to exclude test files, docs, and dev configs
   - Estimate size savings for each recommendation

2. **Recommend build performance improvements.**
   - Reorder COPY directives to maximize layer cache hits
   - Use BuildKit features (cache mounts for package managers)
   - Split slow-changing layers (OS packages) from fast-changing layers (app code)
   - Example for Node.js:

     ```dockerfile
     # Good: dependency layer cached separately
     COPY package.json package-lock.json ./
     RUN npm ci --production
     COPY src/ ./src/
     ```

3. **Recommend Kubernetes improvements.**
   - Add missing resource limits with reasonable defaults
   - Configure probes with appropriate initial delays and periods
   - Add pod anti-affinity for high-availability workloads
   - Recommend namespace isolation for multi-tenant clusters
   - Add network policies to restrict pod-to-pod communication

4. **Recommend security hardening.**
   - Add non-root USER directive with specific UID
   - Add security context to Kubernetes pods
   - Pin base images to digest for supply chain security
   - Remove unnecessary capabilities (drop ALL, add only what is needed)

5. **Generate optimization summary with estimated impact:**

   ```
   Optimization Summary:
     Image size: 850MB -> ~180MB (switch to alpine + multi-stage)
     Build time: ~4m -> ~2m (layer reordering + cache mounts)
     Security: 3 findings (non-root, capabilities, image pinning)
     K8s: 5 resources missing resource limits
   ```

---

### Phase 4: VALIDATE -- Verify Configuration Correctness

1. **Validate Dockerfile syntax.** Run `docker build --check` or parse for common errors:
   - Invalid instruction ordering (e.g., CMD before COPY)
   - Missing required arguments
   - Deprecated instructions (MAINTAINER)
   - Shell form vs. exec form for CMD/ENTRYPOINT

2. **Validate Kubernetes manifests.** Check for:
   - Valid YAML structure
   - Required fields present (apiVersion, kind, metadata, spec)
   - Label selectors match between Deployment and Service
   - Port numbers are consistent across Service and container specs
   - ConfigMap and Secret references resolve to existing resources

3. **Validate Helm charts.** If Helm is used:
   - `helm lint` passes
   - Template rendering with default values produces valid manifests
   - Values schema matches actual usage in templates
   - Dependencies are declared and version-locked

4. **Validate docker-compose.** Check for:
   - Valid YAML and compose file version
   - All referenced images exist or have build contexts
   - Port mappings do not conflict
   - Named volumes are declared in the top-level volumes section
   - Networks are declared before use

5. **Generate validation report:**

   ```
   Container Validation: [PASS/WARN/FAIL]

   Dockerfiles: PASS (2/2 valid)
   K8s manifests: WARN (label mismatch in worker-service.yaml)
   Helm chart: PASS (lint clean)
   Compose: PASS (valid structure)

   Issues:
     1. k8s/worker-service.yaml: selector "app: worker" does not match
        deployment label "app: worker-v2" -- requests will not route
   ```

---

## Harness Integration

- **`harness skill run harness-containerization`** -- Primary invocation for container review.
- **`harness validate`** -- Run after configuration changes to verify project health.
- **`harness check-deps`** -- Verify container tooling dependencies are available.
- **`emit_interaction`** -- Present optimization recommendations and gather decisions.

## Success Criteria

- All container configuration files in the project are discovered and cataloged
- Dockerfiles are analyzed for layer efficiency, security, and size
- Kubernetes manifests are validated for correctness and best practices
- Resource requests and limits are verified for all production workloads
- Image tag strategy is evaluated (no `latest` in production)
- Optimization recommendations include estimated impact

## Examples

### Example: Node.js Monorepo with Docker and Kubernetes

```
Phase 1: SCAN
  Found: Dockerfile (app), Dockerfile.worker, docker-compose.dev.yml
  K8s: 12 manifests in k8s/ (2 Deployments, 2 Services, 2 ConfigMaps,
       2 HPA, 2 Ingress, 2 PDB)
  Base images: node:20 (not alpine), node:20 (worker)

Phase 2: ANALYZE
  Dockerfile issues:
    - node:20 full image (940MB) -- use node:20-alpine (180MB)
    - No .dockerignore -- node_modules and .git copied into image
    - No USER directive -- running as root
    - No HEALTHCHECK
  K8s issues:
    - worker deployment missing memory limits
    - No network policies defined
    - Liveness probe on /healthz but no readiness probe

Phase 3: OPTIMIZE
  1. Switch to node:20-alpine -- saves ~760MB per image
  2. Add .dockerignore with node_modules, .git, tests, docs
  3. Add multi-stage build: builder stage for npm ci, runtime for app
  4. Add USER node (UID 1000) after COPY
  5. Add readiness probe on /ready endpoint
  6. Add memory limit of 512Mi to worker deployment

Phase 4: VALIDATE
  Dockerfiles: WARN (2 security findings, 1 size finding)
  K8s manifests: WARN (missing limits, missing readiness probe)
  Compose: PASS
  Result: WARN -- 6 actionable improvements identified
```

### Example: Python FastAPI with Helm and Distroless

```
Phase 1: SCAN
  Found: Dockerfile (multi-stage with distroless runtime)
  Helm chart: charts/api/ with values.yaml
  Base images: python:3.12-slim (builder), gcr.io/distroless/python3 (runtime)

Phase 2: ANALYZE
  Dockerfile: Well-structured multi-stage build
    - Builder installs dependencies, runtime copies only venv
    - Distroless base (no shell, minimal attack surface)
    - Non-root user configured
  Helm:
    - Resource limits set in values.yaml
    - Probes configured with appropriate timeouts
    - HPA configured for 2-10 replicas

Phase 3: OPTIMIZE
  Minor recommendations only:
    - Pin distroless image to digest for reproducibility
    - Add --mount=type=cache for pip downloads in builder stage
    - Add pod anti-affinity to spread replicas across nodes

Phase 4: VALIDATE
  Dockerfile: PASS
  Helm lint: PASS
  Template render: PASS (all values resolve)
  Result: PASS -- well-configured container setup
```

## Gates

- **No `latest` tag in production manifests.** Production Kubernetes manifests or compose files using `latest` image tags are blocking findings. Immutable tags or digests are required.
- **No containers running as root in production.** Missing USER directive in Dockerfiles or missing security context in K8s pods targeting production are blocking findings.
- **No missing resource limits in production.** Kubernetes Deployments without CPU and memory limits are blocking warnings for production namespaces.
- **No invalid manifest references.** Label selector mismatches between Services and Deployments, or ConfigMap/Secret references to nonexistent resources, are blocking errors.

## Escalation

- **When base images have known CVEs:** Flag the specific CVEs and recommend upgrading to a patched version. If no patched version exists, recommend an alternative base image and document the migration path.
- **When Kubernetes manifest complexity exceeds review scope:** For clusters with 50+ resources, recommend focusing on changed resources only (`--changed-only` flag) and scheduling a full audit separately.
- **When Helm chart dependencies are outdated:** Report the version gap and recommend updating. If the update includes breaking changes, flag it as a decision point and present the changelog.
- **When docker-compose is used for production:** Flag this as an architectural concern. Docker Compose is appropriate for development but production workloads should use an orchestrator (Kubernetes, ECS, Cloud Run). Present migration options.
