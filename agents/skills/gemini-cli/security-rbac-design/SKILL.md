# RBAC Design

> Assign permissions to roles, assign roles to users -- simple, auditable, and sufficient for most applications when combined with resource-level checks

## When to Use

- Designing an authorization system for a new application
- Evaluating whether RBAC is the right model (vs ABAC or ReBAC) for your use case
- Refactoring an ad-hoc permission system into a structured model
- Adding multi-tenancy authorization to an existing application
- Auditing role assignments for principle of least privilege compliance
- Preventing role explosion as the application grows

## Threat Context

Authorization failures are the number one vulnerability category in the OWASP Top 10 (A01:2021 -- Broken Access Control), having risen from fifth place in the 2017 edition.
The category encompasses multiple distinct attack classes:

- **Horizontal privilege escalation**: Accessing another user's data by manipulating an ID parameter (Insecure Direct Object Reference, or IDOR)
- **Vertical privilege escalation**: Accessing admin functions as a regular user by directly calling privileged API endpoints
- **Missing function-level access control**: API endpoints that exist but lack any permission check at all

The 2019 Capital One breach exploited a misconfigured IAM role that had overly broad S3 access permissions, exposing 106 million customer records.
The 2021 Parler data scrape was possible because the API lacked authorization checks on content enumeration -- sequential IDs with no ownership verification allowed downloading every post.
The 2023 Microsoft Power Platform vulnerability exposed customer data because an API endpoint checked authentication (is the user logged in?) but not authorization (does the user have permission to access this specific tenant's data?).

A well-designed RBAC system with enforced resource-level checks eliminates these attack classes by ensuring that every operation is checked against both the user's permissions (what operations can they perform?) and the resource's ownership (do they have access to this specific resource?).

## Instructions

1. **Start with the permission model, not the roles.**
   Identify the resources in your system (users, orders, projects, documents, invoices, reports) and the operations that can be performed on them (create, read, update, delete, approve, publish, export, archive).
   Define permissions as `resource:operation` pairs:
   - `orders:read`, `orders:create`, `orders:approve`
   - `users:manage`, `users:read`
   - `reports:export`, `reports:create`

   Be granular enough to enforce least privilege (separating `orders:read` from `orders:approve` prevents a viewer from approving orders) but not so granular that the model becomes unmanageable (do not create separate permissions for every field of every resource).

2. **Define roles as named collections of permissions.**
   A role is a set of permissions that corresponds to a job function.
   Common starter roles for a business application:
   - `viewer`: Read-only access to relevant resources (`orders:read`, `reports:read`)
   - `editor`: Read and write access (`orders:read`, `orders:create`, `orders:update`)
   - `manager`: Editor permissions plus approval capabilities (`orders:approve`, `users:read`)
   - `admin`: Full access to the application's resources (`users:manage`, `settings:update`, plus all lower permissions)
   - `owner`: Admin plus billing, subscription, and organization-level settings

   Permission checks evaluate: "Does the union of the user's assigned roles include the required permission for this operation?"

3. **Apply the principle of least privilege rigorously.**
   Every user, service account, API key, and automated process should have the minimum permissions required for its current function -- nothing more.
   Default to no access and grant permissions explicitly through role assignment.

   When an employee changes roles, revoke the old role and assign the new one; do not accumulate roles.
   Review role assignments quarterly and after every organizational change.
   Dormant accounts (no login in 90 days) should be flagged for review and potential deactivation.

4. **Implement role hierarchies with explicit documentation.**
   Role inheritance (admin inherits all manager permissions, manager inherits all editor permissions, editor inherits all viewer permissions) reduces duplication and simplifies assignment.

   However, hierarchies create implicit permissions that are difficult to audit -- when an admin inherits from a chain of four roles, the effective permission set is not immediately visible.
   Mitigate this by:
   - Documenting the inheritance chain explicitly in code or configuration
   - Providing a tool or API that "expands" a role to show its complete effective permission set
   - Writing tests that assert the exact permission set for each role

5. **Add resource-level checks (object-level authorization).**
   RBAC roles alone answer the question "Can this user perform this operation type?" but not "Can this user perform this operation on this specific resource?"
   A user with `orders:read` permission must only be able to read orders that belong to them or their organization, not all orders in the system.

   Implement ownership checks on every data access:

   ```
   user.hasPermission('orders:read') AND order.belongsTo(user.organization)
   ```

   This prevents IDOR vulnerabilities, which are the most common authorization flaw in web applications.
   The permission check and the ownership check are both mandatory -- neither alone is sufficient.

6. **Enforce authorization at the API layer, not the UI layer.**
   Hiding a button in the frontend is a UX decision, not a security control.
   Every API endpoint must independently verify that the authenticated user has the required permission for the requested operation on the requested resource.

   Assume that attackers will call your API directly using curl, Postman, or custom scripts -- they will never see your UI restrictions.
   UI visibility should mirror the permission model (do not show buttons the user cannot use) but the UI must never be the only enforcement mechanism.

7. **Scope roles to tenants in multi-tenant systems.**
   In SaaS applications, a user may be an `admin` in Organization A but a `viewer` in Organization B.
   Model this with role assignments that include a tenant scope: `(user_id, role_id, tenant_id)` triples.

   Permission checks must include the tenant context:

   ```
   user.hasRole('admin', currentOrganization)
   ```

   Never allow a role in one tenant to grant access to resources in another tenant.
   Tenant isolation is a hard boundary -- cross-tenant access is a critical vulnerability, not a feature.

## Details

### RBAC Variants (NIST Model)

The NIST RBAC standard (INCITS 359-2012) defines four levels of increasing sophistication:

- **RBAC0 (Core RBAC)**: Flat roles with no hierarchy. Users are assigned roles; roles contain permissions. Simple and sufficient for applications with few roles and clear separation.
- **RBAC1 (Hierarchical RBAC)**: Roles form an inheritance hierarchy. Senior roles inherit all permissions of junior roles. Reduces duplication but requires careful design to avoid unintended permission accumulation.
- **RBAC2 (Constrained RBAC)**: Adds constraints such as separation of duty (a user cannot hold both "requester" and "approver" roles), cardinality constraints (maximum N users per role), and prerequisite constraints (must hold role A before being assigned role B).
- **RBAC3 (Symmetric RBAC)**: Combines RBAC1 and RBAC2 -- hierarchical roles with constraints.

Most production applications need RBAC1 with selective RBAC2 constraints for sensitive operations (financial approvals, user administration, data deletion).

### The Role Explosion Problem

As features and teams grow, organizations create new roles for every combination of permissions: `marketing-editor`, `marketing-viewer`, `sales-editor`, `sales-viewer`, `marketing-sales-editor`, `marketing-admin-except-delete`.
This combinatorial explosion makes the role model unmanageable, unauditable, and error-prone.

Solutions to role explosion:

- **Permission groups with additive grants**: Assign users a base role plus individual permission grants for exceptions. Instead of creating `marketing-editor-with-export`, assign the `editor` role plus the `reports:export` permission directly.
- **Scoped roles**: Instead of creating department-specific roles, create generic roles (`editor`, `viewer`) that are scoped to a context (module, department, project). The role definition is reusable; the scope limits its application.
- **Switch to ABAC for complex rules**: When role proliferation is driven by attribute-based decisions (department, region, time of day, data classification), the problem space has outgrown RBAC. ABAC policies express these decisions naturally.
- **Regular role pruning**: Audit roles quarterly. Identify roles with zero assignments, roles with identical permission sets (merge them), and roles that differ by a single permission (consider additive grants instead).

### Separation of Duty

Critical operations should require two distinct roles held by two distinct users.
Example: the person who creates a payment (role: `payment-creator`) must not be the same person who approves it (role: `payment-approver`).

Two implementation approaches:

- **Static separation of duty**: A user cannot be assigned both conflicting roles simultaneously. Enforced at role assignment time.
- **Dynamic separation of duty**: A user who created a specific payment cannot approve that same payment, even if they hold both roles in general. Enforced at operation time. More flexible but harder to implement.

### When to Choose ABAC Over RBAC

RBAC is sufficient when authorization decisions depend primarily on who the user is and what their job function is.

ABAC (Attribute-Based Access Control) is needed when decisions depend on multiple attributes:

- **Resource attributes**: classification level, owner, creation date, geographic region
- **User attributes**: department, clearance level, employment status, location
- **Environment attributes**: time of day, IP address, device posture, risk score

The diagnostic signal for needing ABAC: if you find yourself creating roles that encode attribute combinations (e.g., `us-east-daytime-senior-analyst`), you are encoding policy in role names.
Switch to ABAC and express the policy as rules over attributes.

### When to Choose ReBAC Over RBAC

ReBAC (Relationship-Based Access Control) models authorization as relationships in a graph.
Instead of assigning roles, you define relationships: "User X is an editor of Document Y," "Team A owns Project B," "Organization C is the parent of Team A."

ReBAC is appropriate when:

- Access depends on the relationship between the user and the specific resource (not just the user's role)
- Resources have complex ownership hierarchies (organizations contain teams, teams own projects, projects contain documents)
- You need to answer questions like "Who can access this specific document?" efficiently

Systems like Google Zanzibar (and its open-source implementations: SpiceDB, OpenFGA) implement ReBAC with global consistency and low-latency evaluation.

### Authorization Middleware Patterns

Implement authorization as middleware or decorators that execute before the business logic:

- **Express.js**: `app.get('/orders/:id', authorize('orders:read'), checkOwnership, handler)`
- **Django**: `@permission_required('orders.view_order')` decorator plus object-level check in the view
- **Spring**: `@PreAuthorize("hasPermission(#id, 'Order', 'read')")` annotation with a custom PermissionEvaluator
- **Go**: Middleware function that extracts the user from context, checks the permission, and returns 403 if denied

The authorization check must happen on every request, at the framework level, before any business logic executes.

## Anti-Patterns

1. **The "god role" with all permissions and no audit trail.**
   A single `super-admin` or `root` role that bypasses all permission checks entirely.
   If this role's credentials are compromised, the attacker has unlimited, unlogged access to every resource.
   Instead: even the highest-privilege role should be subject to permission checks and full audit logging.
   Administrative actions should require MFA step-up authentication.

2. **Permission checks only in the UI.**
   Hiding buttons and menu items in the frontend without corresponding server-side checks.
   Attackers use API clients (curl, Postman, custom scripts) and never see the UI.
   Every API endpoint must independently verify authorization.

3. **Hardcoded role names in business logic.**
   Code like `if (user.role === 'admin')` scattered throughout the codebase.
   This couples the authorization model to the codebase, making role changes and additions extremely fragile.
   Check permissions, not role names: `if (user.hasPermission('orders:approve'))`.
   This allows role definitions to evolve without code changes.

4. **No resource-level checks (IDOR vulnerability).**
   Verifying `user.hasRole('editor')` but not verifying that the user has access to the specific resource being edited.
   This enables horizontal privilege escalation: User A edits User B's order by changing the order ID in the API request.
   The role check passes (User A is an editor), but the ownership check is missing.

5. **Roles that only grow, never shrink.**
   Over time, roles accumulate permissions as features are added, but permissions are never removed when features are deprecated or projects end.
   This violates least privilege through entropy.
   Audit roles quarterly: review every permission in every role, remove permissions that are no longer needed, and document the rationale for each permission that remains.

6. **Implicit deny not enforced as default.**
   Authorization systems that default to "allow" when no rule matches, rather than defaulting to "deny."
   The safe default is always deny -- if there is no explicit permission grant, access is denied.
   This prevents new endpoints or resources from being accidentally accessible before permission rules are written.

7. **No audit logging of authorization decisions.**
   Authorization decisions (both grants and denials) must be logged with the user identity, the requested resource, the requested operation, the decision (allow/deny), and the reason (which permission or lack thereof).
   Without audit logs, detecting privilege escalation, investigating breaches, and demonstrating compliance are impossible.
