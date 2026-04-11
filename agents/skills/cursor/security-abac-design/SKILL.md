# Attribute-Based Access Control

> Evaluate access decisions using attributes of the subject, resource, action, and environment -- eliminating role explosion by expressing authorization as policy rules over contextual data

## When to Use

- Role explosion makes RBAC unmanageable (too many role combinations needed)
- Authorization decisions depend on resource attributes (classification level, owner, department, region)
- Access rules vary by context (time of day, device posture, geographic location, risk score)
- Compliance requires fine-grained, auditable access policies (healthcare, finance, government)
- Migrating from hardcoded if/else authorization to a policy engine
- Implementing data-level access control (row-level or field-level security)

## Threat Context

The complexity of authorization logic is itself a vulnerability surface. Hardcoded if/else authorization scattered across a codebase accumulates inconsistencies: one endpoint checks department, another does not; one checks classification level, another checks role name. The 2023 Microsoft Power Platform vulnerability exposed customer data because one API endpoint checked authentication but not the tenant isolation attribute -- a single missed attribute check exposed cross-tenant data.

The 2019 Capital One breach exploited an SSRF vulnerability that was amplified by overly broad IAM permissions -- ABAC-style attribute constraints on the IAM role (restricting by resource tags and source IP) would have contained the blast radius to the specific application's resources rather than the entire S3 estate. ABAC centralizes policy evaluation, making it auditable, testable, and consistent across all enforcement points. However, poorly designed ABAC policies can themselves become opaque -- a policy engine that no one on the team understands produces a false sense of security.

## Instructions

1. **Identify the four attribute categories.** Every ABAC decision evaluates attributes from four categories:
   - **Subject attributes:** User ID, roles, department, clearance level, employment status, device trust level, authentication strength
   - **Resource attributes:** Owner, classification, creation date, department, sensitivity label, data residency region
   - **Action attributes:** Read, write, delete, approve, export, share, escalate
   - **Environment attributes:** Current time, IP address, device trust posture, request risk score, network zone (internal/external)

   Access decisions are predicates evaluated over combinations of these attributes. The richer the attribute model, the more precise the policy -- but also the more complex to maintain and debug.

2. **Write policies as rules, not code.** Use a dedicated policy language or engine: OPA/Rego, Cedar (AWS), Casbin, or XACML. Policies should read like business rules, not imperative code. Example in pseudo-policy:

   ```
   ALLOW action:read
   ON resource
   WHERE resource.classification <= subject.clearance
     AND resource.department == subject.department
     AND environment.time BETWEEN 09:00 AND 18:00
   ```

   Separating policy from application code means: policy changes do not require code deployments, code reviews of policy changes focus on business intent rather than implementation details, and the entire policy corpus can be audited independently of the application.

3. **Implement the PDP/PEP architecture.** The four components of a well-structured ABAC system:
   - **Policy Decision Point (PDP):** Evaluates requests against policies, returns allow/deny with reason. This is the policy engine (OPA, Cedar, etc.).
   - **Policy Enforcement Point (PEP):** Intercepts application requests and calls the PDP before allowing the operation. Typically implemented as middleware, a gateway filter, or a service mesh sidecar.
   - **Policy Information Point (PIP):** Provides attribute values the PDP needs but that are not in the request (e.g., looking up the user's department from the directory, fetching the resource's classification from a metadata store).
   - **Policy Administration Point (PAP):** Manages the policy lifecycle: create, version, test, deploy, audit, and rollback policies.

4. **Default deny.** If no policy explicitly allows the action, deny it. This is the fundamental safety property of ABAC. Every access must be explicitly authorized by at least one matching policy rule. When deploying ABAC to an existing system, start in audit mode (log decisions but do not enforce deny) to discover existing access patterns, then transition to enforcement mode once policies cover all legitimate access.

5. **Design for auditability.** Log every policy decision with: the request attributes (subject, resource, action, environment), the policies evaluated, the matching policy (or lack thereof), and the decision (allow/deny with the specific reason). This decision log is critical for compliance (SOC2, HIPAA, GDPR Article 30), debugging authorization errors reported by users, and detecting policy drift over time. Make the log machine-parseable (structured JSON) for automated analysis and alerting.

6. **Test policies like code.** Write unit tests for policies: given these subject/resource/action/environment attributes, the decision should be allow/deny. Test boundary conditions: what happens when an attribute is missing? What happens when multiple policies apply and one allows while another denies? What happens when environment conditions change (time, network)? Use the policy engine's built-in test framework: OPA has `opa test`, Cedar has `cedar validate` and property-based testing support, Casbin has built-in model testing.

## Details

### ABAC vs RBAC Decision Matrix

RBAC is sufficient when access depends primarily on who the user is (their assigned role). ABAC is needed when access depends on what the resource is, when the access happens, where the user is, or how the resource is classified.

The diagnostic signal for role explosion: if you are encoding attributes into role names to achieve required granularity, you need ABAC. Examples of role name encoding that signals ABAC is needed:

- `us-east-classified-editor` (region + classification + permission baked into role)
- `cardiology-physician-read` (department + role + action baked into role)
- `external-contractor-limited-weekday` (trust level + employment type + scope + time baked into role)

Each new dimension multiplies the role count. Three regions, four departments, three classification levels, and two permission levels creates 72 roles. Adding a fifth dimension (time-based access) doubles it to 144 roles. ABAC expresses this as a handful of composable policy rules that evaluate attributes dynamically at decision time.

RBAC and ABAC are not mutually exclusive. A common pattern: use RBAC for coarse-grained feature access (which sections of the application a user can reach) and ABAC for fine-grained data access within those features (which specific records the user can view or modify based on classification, department, and context).

### Policy Engine Comparison

| Engine     | Language                   | Deployment Model          | Strengths                                                                   | Weaknesses                                                |
| ---------- | -------------------------- | ------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------- |
| OPA / Rego | Rego (Datalog-inspired)    | Sidecar, library, server  | General-purpose, Kubernetes-native, large ecosystem, rich tooling           | Rego learning curve, not purpose-built for authorization  |
| Cedar      | Cedar (type-safe)          | Library (Rust, Java, Go)  | Designed for authorization, fast evaluation, formally analyzable, type-safe | AWS-originated, smaller ecosystem, newer                  |
| Casbin     | Model config + policy file | Embedded library          | Easy integration, supports RBAC/ABAC/ReBAC, many language bindings          | No built-in PDP server, library-only deployment           |
| XACML      | XML                        | Server (WSO2, Axiomatics) | Industry standard, rich attribute model, mature specification               | XML verbosity, steep learning curve, heavy infrastructure |

Recommendation: Cedar for greenfield authorization services (type safety, fast evaluation, formal analysis tools). OPA for infrastructure and Kubernetes policy (admission control, network policy, cloud resource policy). Casbin for quick integration into existing applications where embedding a library is preferred over deploying a separate service.

### Worked Example -- Healthcare Data Access

**Subject:** Dr. Smith (role: physician, department: cardiology, hospital: General Hospital, employment_status: active)

**Resource:** Patient record #1234 (department: cardiology, classification: PHI, treating_physician: dr-smith, created: 2024-01-15)

**Policy in pseudo-Cedar:**

```
permit(
  principal in Role::"physician",
  action == Action::"read",
  resource is PatientRecord
) when {
  principal.employment_status == "active" &&
  (resource.treating_physician == principal.id ||
   resource.department == principal.department) &&
  context.network in ["hospital_internal", "vpn_authenticated"]
};
```

This policy allows Dr. Smith to read patient records in cardiology or records where she is the treating physician, but only from the hospital network or VPN. Adding a time constraint (`context.time.hour >= 6 && context.time.hour <= 22`) or a device trust check (`context.device_trust >= "managed"`) modifies the policy without any application code changes.

If Dr. Smith transfers to the neurology department, her `department` attribute changes in the directory, and she automatically loses access to cardiology records she is not treating -- no role reassignment, no permission matrix update, no code change. The policy adapts because it evaluates live attributes, not static role assignments.

### Migrating from RBAC to ABAC

Most systems start with RBAC and evolve toward ABAC as authorization requirements grow more complex. A phased migration approach:

1. **Identify ABAC candidates:** Audit existing authorization checks for patterns that encode attributes into role names, hardcode resource properties in if/else chains, or require frequent role creation for new business scenarios. These are ABAC candidates.

2. **Deploy the policy engine in shadow mode:** Run the ABAC engine alongside existing authorization. Log ABAC decisions without enforcing them. Compare ABAC decisions to existing RBAC decisions to verify policy correctness.

3. **Migrate one resource type at a time:** Start with the resource type that has the most complex authorization rules (usually the one causing the most role proliferation). Write ABAC policies for that resource type, test thoroughly, then switch enforcement.

4. **Keep RBAC for simple cases:** Not everything needs ABAC. Feature-level access ("can this user access the admin panel?") is well-served by RBAC. Data-level access ("can this user read this specific patient record?") benefits from ABAC. Use both models where each excels.

### Performance Considerations

ABAC policy evaluation adds latency to every authorization-gated request. At scale, this latency must be managed:

- **Policy compilation:** Pre-compile policies into optimized decision structures (decision tables, decision trees) at deploy time rather than interpreting policy text at each request. Cedar and OPA both support ahead-of-time compilation.

- **Attribute caching:** Cache frequently accessed subject and resource attributes with short TTLs (30-60 seconds). Stale attributes introduce a consistency window where revoked access may still be granted -- size the TTL to match your risk tolerance and the sensitivity of the data being protected.

- **Partial evaluation:** Pre-compute policy decisions for known attribute combinations and cache the results. When a request arrives matching a cached combination, return the cached decision without full evaluation.

- **Co-locate PDP with PEP:** Deploy the policy engine as a sidecar container or embedded library rather than a remote centralized service. Network round-trips to a remote PDP add 1-5ms per request; a co-located PDP adds microseconds.

- **Batch evaluation:** When rendering a list of resources (e.g., a file listing or record table), batch the authorization checks into a single PDP call rather than making one call per resource. Most policy engines support batch check APIs.

### ABAC and Compliance

ABAC naturally supports compliance requirements because every decision is logged with full attribute context:

- **HIPAA:** Access to PHI must be limited to authorized individuals with a treatment relationship. ABAC policies encode this directly: `resource.type == "PHI" AND (subject.role == "treating_physician" OR subject.has_treatment_relationship(resource.patient_id))`.

- **GDPR Article 25 (Data Protection by Design):** ABAC enables data minimization by restricting access to specific data fields based on purpose. A marketing analyst can see aggregate data but not individual records. A support agent can see the customer name but not the full payment details.

- **SOC2 CC6.1 (Logical Access):** Requires that access is restricted based on the principle of least privilege. ABAC decision logs provide direct evidence of this: every access was evaluated against policies, and the decision (allow/deny) with full context is recorded.

- **PCI-DSS Requirement 7:** Restrict access to cardholder data by business need to know. ABAC policies can encode cardholder data access rules centrally, and the decision log serves as audit evidence.

## Anti-Patterns

1. **ABAC without centralized policy management.** Scattering attribute checks across the codebase (`if user.dept == resource.dept && user.clearance >= resource.level`) is ad-hoc conditional authorization with extra complexity, not ABAC. True ABAC requires a policy engine to centralize evaluation, provide decision logging, enable policy testing independent of application code, and support policy versioning and rollback.

2. **Over-specifying policies.** Policies with 10+ attribute conditions are difficult to understand, test, maintain, and explain to auditors. If a policy requires more than 5 conditions, decompose it into composable sub-policies with descriptive names: `is_treating_physician`, `is_on_trusted_network`, `has_sufficient_clearance`. Composition makes policies readable, testable, and reusable.

3. **Missing attribute validation.** If the PDP accepts attribute values without validating their source and integrity, an attacker who can manipulate attribute values (e.g., setting their own clearance level via an unprotected API, spoofing IP addresses, manipulating request headers) can bypass all policies. Attribute sources must be authoritative (directory service, identity provider, device management platform) and tamper-proof (signed tokens, server-side lookups, not client-supplied values).

4. **No fallback for missing attributes.** If a required attribute is unavailable (PIP is down, user record is incomplete, device posture check times out), the policy must default to deny. Silently skipping an attribute condition because the value is null transforms a transient infrastructure issue into a privilege escalation. Design policies to handle missing attributes explicitly with a deny default.

5. **Policy drift from business intent.** ABAC policies can diverge from actual business requirements when modified incrementally without review. Treat policy changes with the same rigor as production code changes: version control in a repository, peer review by someone who understands the business rules, automated testing against known-good and known-bad access scenarios, and staged rollout (audit mode before enforcement mode).
