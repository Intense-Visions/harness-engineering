# Relationship-Based Access Control

> Model authorization as a graph of relationships -- "User X is an editor of Document Y which belongs to Folder Z owned by Team W" -- enabling inherited permissions that follow resource hierarchies

## When to Use

- Building a document management, file sharing, or collaborative editing system
- Resources have complex ownership hierarchies (org -> team -> project -> resource)
- Access depends on the relationship between the user and the specific resource, not just the user's global role
- You need to answer "who can access this document?" efficiently (permission listing)
- Google Docs-style sharing is a product requirement
- RBAC or ABAC cannot naturally express hierarchical resource ownership

## Threat Context

IDOR (Insecure Direct Object Reference) is the most common authorization vulnerability because most systems check "can this user type do this operation?" (role check) but not "does this user have a relationship to this specific resource?" (object-level check). The 2021 Parler data scrape exploited the absence of object-level authorization -- sequential post IDs with no ownership check allowed bulk download of every post, including deleted ones with geolocation metadata. The 2019 First American Financial data exposure leaked 885 million mortgage documents because the application checked authentication but not document-to-user relationships.

Google designed Zanzibar specifically to solve this class of vulnerability at scale: every access check resolves relationships in a globally consistent graph, ensuring that revoking a team's access to a folder immediately revokes access to all documents in that folder for all team members -- no stale permissions, no orphaned grants, no race conditions between revocation and access.

## Instructions

1. **Model resources and relationships as a graph.** Define object types (user, team, org, document, folder, project) and relationship types (owner, editor, viewer, member, parent). Store relationships as tuples: `(object, relation, subject)`. Examples:
   - `(document:readme, editor, user:alice)` -- Alice is an editor of the readme document
   - `(folder:docs, parent, document:readme)` -- The readme document belongs to the docs folder
   - `(team:engineering, member, user:alice)` -- Alice is a member of the engineering team
   - `(folder:docs, viewer, team:engineering)` -- The engineering team has viewer access to the docs folder

   The tuple store is the single source of truth for all authorization relationships. Every permission in the system derives from tuples and composition rules -- no permission exists outside this model.

2. **Define permission rules using relationship composition.** Permissions are computed by traversing relationships through the graph. A user can view a document if they are a direct viewer, OR an editor (editors can view), OR an owner (owners can edit and view), OR a viewer of the document's parent folder (inherited permission). Express this as composition rules:

   ```
   document#viewer = document#viewer
                   + document#editor
                   + document#owner
                   + document#parent->folder#viewer
   ```

   This composition allows permissions to flow through the resource hierarchy without denormalization. When a team is granted viewer access to a folder, every team member automatically gains viewer access to every document in that folder -- without writing individual tuples for each document-member combination.

3. **Implement check, expand, and list APIs.** Three core operations that the ReBAC system must support:
   - **Check:** "Can user:alice view document:readme?" Traverses the relationship graph starting from the resource, following composition rules, and returns a boolean. This is the authorization gate called on every API request that accesses a resource.
   - **Expand:** "What relationships does user:alice have to document:readme?" Returns all matching relations with the traversal path (e.g., "viewer via team:engineering membership and folder:docs inheritance"). Used for debugging authorization issues and for UX (showing why a user has access in a sharing panel).
   - **List:** "Who can view document:readme?" Returns all subjects with the computed viewer permission. Used for sharing panels, audit logs, compliance reporting, and answering "who has access to sensitive data?" Also supports the reverse: "What can user:alice access?" for user-centric audit.

4. **Ensure consistency on revocation.** When a team is removed from a folder, all members of that team must immediately lose access to all documents in that folder. This requires the relationship graph to be strongly consistent: writes (adding/removing tuples) must be immediately visible to subsequent reads (check calls).

   Zanzibar uses a Zookie (opaque consistency token returned on writes, passed on subsequent reads) to guarantee "read your writes" consistency. SpiceDB provides ZedTokens with equivalent semantics. OpenFGA provides consistency tokens via its API. Without consistency guarantees, there is a time window after revocation where access checks still return "allow" -- meaning "eventually consistent authorization" is equivalent to "temporarily insecure."

5. **Design the schema before writing tuples.** Define the type system: which object types exist, which relations each type supports, how relations compose into permissions, and which subject types can appear in each relation. This schema is the authorization model -- in SpiceDB it is a `.zed` schema file, in OpenFGA it is a JSON authorization model.

   Validate the schema against test scenarios before deploying: enumerate known-good access patterns (Alice should be able to view her own documents) and known-bad access patterns (Bob should not be able to view Alice's private documents). Schema errors produce permission leaks that are extremely difficult to detect at runtime because the system silently grants access it should not.

6. **Integrate with your API layer.** Every API endpoint that accesses or modifies a resource must call the ReBAC check API before proceeding. The check call includes three parameters: subject (authenticated user), resource (object being accessed, identified by type and ID), and permission (operation being performed: view, edit, delete, share). If the check returns deny, return HTTP 403. Never check permissions after performing the operation -- check before, and fail closed. Treat a failed check call (network error, timeout) as deny, not as allow.

## Details

### Google Zanzibar Paper Summary

Published at USENIX ATC 2019, the Zanzibar paper describes Google's global authorization system that processes over 10 million authorization checks per second across all Google products (Drive, YouTube, Cloud, Maps, Photos, Calendar). Key innovations:

- **Global consistency via Zookies:** Each relationship write returns an opaque token (Zookie) encoding the write timestamp. Passing the Zookie on subsequent check calls guarantees the read reflects all writes up to that point. This solves the "new enemy" problem where a permission is revoked but a stale cache serves the old allow result.

- **Leopard indexing:** A specialized index structure for efficient reverse lookups ("who can access resource X?"). Forward lookups (can user Y access resource X?) follow the graph from X through composition rules. Reverse lookups require traversing all possible paths to X, which leopard indexing pre-computes and maintains incrementally.

- **Namespace configuration:** A schema language for defining object types, relations, and permission computations. Each Google product defines its own namespace (Drive uses document/folder/team types; YouTube uses video/channel/playlist types) but shares the global infrastructure and consistency guarantees.

- **Tuple format:** `(namespace:object_id#relation@subject_namespace:subject_id)` became the de facto standard adopted by all major open-source implementations.

### Open-Source Implementations

| System   | Creator    | API Protocol | Schema Language          | Standout Feature                                                              |
| -------- | ---------- | ------------ | ------------------------ | ----------------------------------------------------------------------------- |
| SpiceDB  | AuthZed    | gRPC + HTTP  | `.zed` (rich, validated) | Most mature schema language, watch API, caveats for conditional relations     |
| OpenFGA  | Auth0/Okta | HTTP (REST)  | JSON authorization model | Contextual tuples (dynamic attributes), simple API, managed service available |
| Ory Keto | Ory        | gRPC + REST  | Namespace configuration  | Part of Ory identity ecosystem (Kratos, Hydra, Oathkeeper)                    |

SpiceDB has the most mature schema language, the best developer tooling (interactive playground, schema validation, integration testing framework), and the closest adherence to the Zanzibar model including consistency tokens and the watch API for real-time change streams. OpenFGA has the simplest integration path for web applications and offers a managed service via Auth0. All three support the core Zanzibar model of tuple storage, relationship traversal, and consistency guarantees.

### Worked Example -- Google Docs-Style Sharing

**Type definitions:**

- `user` -- an individual person
- `group` -- a set of users (relation: `member`)
- `folder` -- a container for documents (relations: `owner`, `editor`, `viewer`)
- `document` -- a file within a folder (relations: `owner`, `editor`, `viewer`, `parent` pointing to folder)

**Permission composition rules:**

```
document#viewer = document#viewer
               + document#editor
               + document#owner
               + document#parent->folder#viewer
               + document#parent->folder#editor
               + document#parent->folder#owner

folder#viewer = folder#viewer + folder#editor + folder#owner
```

**Scenario:** Share the "Engineering" folder with the "Backend Team" group as viewers.

**Tuples written:**

- `(group:backend-team, member, user:alice)`
- `(group:backend-team, member, user:bob)`
- `(folder:engineering, viewer, group:backend-team#member)`
- `(document:api-spec, parent, folder:engineering)`
- `(document:architecture, parent, folder:engineering)`

**Check: Can user:alice view document:api-spec?**
Traversal path: `document:api-spec` -> `parent` -> `folder:engineering` -> `viewer` -> `group:backend-team#member` -> `user:alice`. Result: ALLOW.

**Revocation: Remove Backend Team from Engineering folder.**
Delete single tuple: `(folder:engineering, viewer, group:backend-team#member)`. Immediately, both Alice and Bob lose access to both api-spec and architecture documents. One tuple deletion revokes access for all group members to all documents in the folder hierarchy -- this is the power of graph-based permission inheritance versus denormalized permission tables.

### When to Choose ReBAC Over RBAC or ABAC

Use this decision framework to select the right authorization model:

- **RBAC** is sufficient when: access depends on the user's role, resources do not have individual ownership semantics, and the number of role combinations is manageable (under 20-30 distinct roles).

- **ABAC** is the right choice when: access depends on multiple contextual attributes (time, location, classification level), the same user should have different access to different instances of the same resource type based on resource properties, and policy rules change frequently without code changes.

- **ReBAC** is the right choice when: resources form hierarchies (folders containing documents, teams within organizations), access to a resource depends on the user's relationship to that specific resource instance, permission inheritance through resource hierarchies is a core requirement, and you need to efficiently answer "who can access this?" and "what can this user access?"

Many production systems combine models: RBAC at the feature/module level ("engineers can access the code review tool"), ABAC for contextual constraints ("only during business hours from managed devices"), and ReBAC for resource-level authorization ("Alice can edit this document because she is a member of the owning team").

### Performance and Scaling

ReBAC checks require graph traversal, and deep or wide hierarchies create performance challenges that must be addressed:

- **Depth limits:** Set a maximum traversal depth (typically 10-15 levels) to prevent runaway graph walks on pathological hierarchies. Most real-world resource hierarchies are 3-5 levels deep (org -> team -> project -> folder -> document).

- **Caching:** Cache intermediate traversal results with short TTLs (seconds, not minutes). Authorization caches with long TTLs create security windows where revoked permissions are still granted. SpiceDB's watch API enables push-based cache invalidation when tuples change, allowing tighter cache consistency.

- **Pre-computation:** For frequently checked permissions (e.g., "can this user access the dashboard?"), pre-compute the result and store it. Invalidate on tuple changes that affect the computation path. This trades storage and write-time computation for read-time speed.

- **Sharding:** Shard the tuple store by namespace or object type. Documents and folders can be in separate shards with cross-shard lookups for hierarchy traversal. SpiceDB supports horizontal sharding with consistent hashing.

- **Batching:** When rendering a list of documents, batch all permission checks into a single request (`BulkCheckPermission` in SpiceDB, batch check in OpenFGA) rather than issuing one check per document. A document listing page showing 50 items should make 1 batch check call, not 50 individual calls.

## Anti-Patterns

1. **Implementing ReBAC by querying a relational database with recursive CTEs.** While technically possible, recursive SQL queries for authorization graph traversal do not scale, cannot provide the consistency guarantees needed for real-time authorization, and are extremely difficult to reason about for correctness. A subtle error in a recursive CTE silently grants or denies access incorrectly. Use a purpose-built ReBAC engine that handles traversal, caching, and consistency natively.

2. **No consistency guarantees on revocation.** If a relationship write (revoke team access to folder) is not immediately visible to subsequent check calls, there is a window where revoked users can still access resources. This is not a theoretical concern -- eventual consistency in authorization means "eventually secure," which means "currently insecure." Use consistency tokens (ZedTokens, Zookies) or ensure linearizable reads.

3. **Over-flattening the hierarchy.** Storing direct permission tuples on every leaf document (`document:X, viewer, user:Y` for every document in every folder for every user) instead of modeling the folder hierarchy through parent relations. This denormalization makes granting easy (write one tuple) but makes revocation O(N) -- revoking folder access requires finding and deleting tuples from every document in the folder. The fundamental value of ReBAC is hierarchical inheritance through graph traversal.

4. **No schema validation before deployment.** Writing ad-hoc tuples without a validated schema leads to inconsistent relationship names (is it "viewer" or "read" or "can_view"?), orphaned tuples referencing deleted objects, and permission composition rules that silently fail because the relation name in the rule does not match the relation name in the stored tuples. Define the schema first, validate it against test scenarios, and enforce it on every tuple write.

5. **Ignoring the "list" and "expand" queries.** Many implementations focus solely on the "check" operation (can user X access resource Y?) but neglect "list" (who can access resource Y?) and "expand" (why can user X access resource Y?). Check is the authorization gate. List is essential for sharing UIs ("show me who has access"), compliance auditing ("who can access PII?"), and data governance. Expand is essential for support ("why does this contractor have access to production data?") and debugging. All three operations are required for a production-grade system.
