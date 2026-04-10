# Capability-Based Security

> Replace ambient authority ("who are you?") with explicit capabilities ("what token do you hold?") -- eliminating confused deputy attacks by making every permission a transferable, revocable, unforgeable object

## When to Use

- Designing a plugin or extension system where untrusted code runs with limited permissions
- Building a sandboxed execution environment (serverless functions, browser iframes, Deno)
- Preventing confused deputy attacks in service-to-service communication
- Implementing fine-grained, delegatable permissions that can be scoped and revoked
- Evaluating whether ambient authority (ACLs/RBAC) or capability-based models better fit your threat model
- Designing pre-signed URLs or capability URLs for resource sharing

## Threat Context

The confused deputy problem (first described by Norm Hardy in 1988) occurs when a privileged program is tricked into misusing its authority on behalf of an attacker. Classic example: a compiler service has write access to billing logs through ambient authority (its process identity grants access); an attacker passes a crafted output filename that targets the billing log, and the compiler overwrites it using authority that was granted for a different purpose entirely. In ACL-based systems, the compiler's identity grants write access regardless of who initiated the request or for what purpose. In capability-based systems, the compiler only possesses capabilities explicitly passed to it by the caller -- no ambient authority exists to misuse.

CSRF is a web-specific confused deputy: the browser attaches cookies (ambient authority) to cross-origin requests, allowing a malicious site to act with the user's authority on any site the user is logged into. SameSite cookies are a partial mitigation; capability-based tokens (where the request must explicitly include a token, not relying on automatic cookie attachment) eliminate the attack class entirely.

Pre-signed URLs (S3, GCS, Azure Blob) are real-world capabilities deployed at massive scale: unforgeable, time-limited, scoped to a specific action on a specific resource -- the architectural opposite of ambient authority.

## Instructions

1. **Understand the core principle: authority follows the reference.** A capability is an unforgeable reference that both designates a resource and authorizes an action on it. Possessing the capability is sufficient to perform the action -- no additional identity check is needed. This contrasts fundamentally with ACL/RBAC systems where the system asks "who are you?" and checks a permission list associated with the resource. In capability systems, the question is "what token do you hold?" The capability itself carries the authorization.

2. **Design capabilities as unforgeable tokens.** A capability must be impossible to guess or fabricate. Three implementation approaches:
   - **Cryptographic opaque tokens:** CSPRNG-generated strings (128+ bits of randomness) mapped to permissions on the server side. The holder presents the token; the server looks up the associated rights in a database. Simple to implement, requires server-side state.
   - **Signed structured tokens:** A payload containing resource ID, allowed action, expiration, and constraints, signed with HMAC or a digital signature. The server verifies the signature without a database lookup. Macaroons extend this model with chainable caveats.
   - **Object references in memory-safe runtimes:** In memory-safe languages and sandboxed environments, an object reference is itself a capability because the runtime guarantees it cannot be forged (no pointer arithmetic, no access to arbitrary memory addresses). This is the foundation of the object-capability (ocap) model.

   The critical property across all approaches is unforgeability: a party that does not possess a capability cannot create one through guessing, computation, or manipulation.

3. **Apply the Principle of Least Authority (POLA).** When creating a new process, plugin, service call, or function invocation, grant only the capabilities it needs -- nothing more. Do not pass a database connection object when the function only needs to read one table. Do not pass a write capability when read suffices. Do not pass an unbounded-time capability when a 5-minute window is appropriate.

   Capability systems make POLA natural because authority is explicit at the call site: the caller constructs and passes exactly the set of capabilities the callee needs. In contrast, ACL systems make POLA difficult because services accumulate ambient authority through their identity, and restricting that authority requires modifying the central permission list rather than the call site.

4. **Support attenuation (narrowing but never expanding rights).** A holder of a write capability should be able to derive a read-only capability from it and pass that derived capability to a less-trusted party. Attenuation is strictly one-directional: you can narrow capabilities but never widen them.

   If Alice has `(document:X, read+write, expires:2025-12-31)`, she can derive `(document:X, read-only, expires:2025-06-30)` -- same or narrower action scope, same or earlier expiration -- and share it with Bob. Bob cannot re-derive write access or extend the expiration. Macaroons implement attenuation via HMAC-chained caveats that can only be appended, never removed.

5. **Implement revocation.** Capabilities that cannot be revoked are permanent, transferable, irrevocable grants of authority -- unacceptable for most production systems. Revocation strategies ordered by complexity:
   - **Short expiration:** The capability auto-expires after a fixed duration. No active revocation needed, but no early revocation possible. Suitable for pre-signed URLs (5-minute to 24-hour lifetimes).
   - **Revocation list:** Maintain a set of revoked capability IDs checked at the enforcement point on every use. Adds a lookup on every check but enables immediate revocation.
   - **Caretaker pattern:** An intermediary object mediates all access. Disabling the caretaker blocks all capabilities routed through it. Useful for revoking an entire delegation chain at once (e.g., revoking a team's access by disabling the team's caretaker).
   - **Epoch-based rotation:** Issue capabilities with an epoch number. Incrementing the epoch invalidates all capabilities from the previous epoch. Coarse-grained but simple to implement.

6. **Apply to real-world systems.** Capability-based security is not theoretical -- it is deployed at massive scale in production systems:
   - **Deno:** `--allow-read=/tmp` grants a filesystem read capability scoped to `/tmp`. Without the flag, the runtime has zero filesystem access. Every permission is an explicit capability grant on the command line.
   - **Browser iframes:** The `sandbox` attribute strips all ambient capabilities (scripts, forms, popups, top navigation). Adding `allow-scripts` restores only the script execution capability.
   - **Docker:** `--cap-drop ALL --cap-add NET_BIND_SERVICE` drops all Linux kernel capabilities and selectively restores only the ability to bind privileged ports below 1024.
   - **Pre-signed URLs:** S3, GCS, and Azure Blob pre-signed URLs embed the resource, action, expiration, and a cryptographic signature. Anyone possessing the URL can perform the specified action without any additional authentication.
   - **WebAssembly Component Model:** Wasm components declare their required imports (capabilities). The host runtime provides only the capabilities it chooses. Unfulfilled imports mean the component simply cannot access the corresponding resource.

## Details

### Capability vs ACL Comparison

| Property                   | ACL / RBAC                                                               | Capability-Based                                                           |
| -------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Authority model            | Ambient (identity checked against resource's permission list)            | Explicit (token/reference held by the caller)                              |
| Confused deputy resistance | Vulnerable (program uses its own ambient authority on attacker's behalf) | Resistant by construction (program only has capabilities passed to it)     |
| Delegation                 | Complex (requires delegating identity or modifying ACLs)                 | Natural (pass the capability token to the delegate)                        |
| Attenuation                | Not native (requires creating new restricted roles)                      | Native (derive narrower capability from existing one)                      |
| Revocation                 | Immediate (remove entry from ACL)                                        | Requires explicit mechanism (expiration, revocation list)                  |
| Centralized audit          | Natural (one ACL per resource, query centrally)                          | Harder (capabilities are distributed, must track delegation chains)        |
| Integration effort         | Standard in most frameworks (RBAC middleware)                            | Requires architectural changes (explicit capability passing at call sites) |

Many production systems use both models: ACL-based identity checks at the perimeter (who can log in, what features can they access) and capability-based tokens for specific resource operations (pre-signed URLs for file access, scoped API tokens for third-party integrations, sandboxed execution environments for plugins).

### Macaroons (Google, 2014)

Macaroons are bearer credentials that support decentralized attenuation through HMAC-chained caveats. Published by Google researchers, they are the most sophisticated capability token format in widespread use.

**Construction:**

1. The **root macaroon** is created by the resource server: `HMAC(root_key, identifier)`. This represents the unrestricted capability.
2. **First-party caveats** add verifiable restrictions: `new_mac = HMAC(previous_mac, "time < 2025-06-01")`. Each caveat further restricts what the token authorizes. Any holder can append caveats, but no one can remove them -- removal would require recomputing the HMAC chain from the root key, which only the issuing server possesses.
3. **Third-party caveats** enable delegated verification: the macaroon includes a caveat requiring a discharge macaroon from a third-party service (e.g., "holder must present proof of authentication from IdP X"). This enables federated authorization without sharing secrets between services.

**Example attenuation chain:**

- Root: "access to /data/reports" (issued by resource server)
- Caveat 1: "action = read" (added by API gateway to restrict to read-only)
- Caveat 2: "source_ip in 10.0.0.0/8" (added by network proxy to restrict to internal network)
- Caveat 3: "expires < 2025-06-01T12:00:00Z" (added by delegating user to set a time limit)

Each party in the chain narrows the capability independently without contacting the others. The resource server verifies the entire chain by recomputing the HMAC from the root key and evaluating all caveats against the current request context.

### Capability URLs

URLs like `https://app.com/share/a8f3c9d1e2b4f5a6789012345678abcd` where the random token in the path is the capability. Knowing the URL grants access -- no additional authentication required. This pattern is used extensively by Google Docs ("anyone with the link can view"), Figma, Notion, Dropbox, WeTransfer, and most modern file-sharing services.

**Security considerations:**

- **URL logging:** Web servers, reverse proxies, CDNs, and browser history all log full URLs including the capability token. Anyone with access to logs gains access to the shared resource.
- **Referrer header leakage:** When a user clicks a link on the shared page, the referrer header sends the full URL (including the capability token) to the destination site. Mitigate with `Referrer-Policy: no-referrer` or `Referrer-Policy: origin`.
- **Uncontrolled sharing:** Users copy and paste capability URLs freely. Unlike ACL-based sharing where removing a user from the list revokes their access, a forwarded capability URL continues to work for anyone who receives it.
- **Search engine indexing:** If a capability URL is posted publicly or linked from a crawlable page, search engines will index it. Use `robots.txt` exclusions and `X-Robots-Tag: noindex` headers on capability URL paths.

Mitigations: short expiration times, access logging with alerting on anomalous patterns, download count limits, and the ability to revoke (regenerate) the sharing link from the UI.

### Capabilities in Microservice Architecture

In microservice systems, capabilities solve the confused deputy problem that arises when Service A calls Service B on behalf of User X. With ambient authority (service-to-service mTLS + RBAC), Service B checks that Service A is authorized -- but Service A might be calling on behalf of any user, including an attacker who found an SSRF vulnerability in Service A.

With capability-based inter-service communication:

1. The API gateway issues a scoped capability token when the user authenticates: `{resource: "order:123", action: "read", user: "alice", expires: "2025-06-01T12:05:00Z", sig: "..."}`.
2. Service A receives this capability and forwards it to Service B when making the downstream call.
3. Service B verifies the capability token's signature, checks expiration, and validates that the requested action matches the capability's scope.
4. If an attacker exploits an SSRF in Service A, they cannot forge a capability token (they do not have the signing key), and any capability they intercept is scoped to the original user's authorized actions and expires quickly.

This pattern is implemented by Google's ALTS (Application Layer Transport Security) and by service mesh systems using SPIFFE-based identity with request-level authorization tokens.

### Object Capabilities in Programming Languages

The object-capability (ocap) model uses language-level object references as capabilities. In a true ocap language:

- **No global mutable state:** A module cannot access any resource it was not explicitly given a reference to at construction time.
- **No ambient imports:** Standard library access (filesystem, network, system clock, random number generator) is mediated through capability objects passed as constructor parameters, not through global import statements that any code can call.
- **No runtime reflection on capabilities:** A module cannot enumerate, inspect, or forge object references it does not hold.

Languages with ocap properties: E (the original ocap language by Mark S. Miller), Newspeak (Gilad Bracha), Monte (descendant of E), and the WebAssembly Component Model. JavaScript approaches ocap through Hardened JS (SES -- Secure ECMAScript) using `lockdown()` and `Compartment`, deployed in production by Agoric for blockchain smart contracts and by MetaMask for secure plugin isolation.

The practical benefit of the ocap model: security analysis becomes tractable because authority flows are visible in the code structure. You can audit a module's authority by examining its constructor parameters and method arguments -- there is no hidden ambient access to search for. If a module's constructor does not receive a filesystem capability, it provably cannot access the filesystem, regardless of what code it contains.

### Capability Patterns in API Design

Capability-based thinking improves API security even in systems that use ACLs as the primary authorization model:

- **Scoped API tokens:** Instead of issuing a single API key with full account access, issue tokens scoped to specific resources and actions. GitHub's fine-grained personal access tokens are an example: each token specifies which repositories it can access and what operations it can perform.

- **Pre-signed upload URLs:** Instead of giving the client credentials to upload to S3 directly, the server generates a pre-signed PUT URL scoped to a specific object key with a short expiration. The client uploads without ever possessing AWS credentials.

- **Invite links:** Instead of adding a user to a resource's ACL and notifying them, generate a capability URL that grants specific access when followed. The link itself carries the authorization. The recipient does not need an account -- the link is the credential.

- **Delegated tokens for third-party integrations:** When a user connects a third-party app to your service, issue a capability token scoped to exactly the data and actions the integration needs. OAuth 2.0 scopes are a coarse version of this; true capabilities would scope to specific resource instances, not just resource types.

### Auditing Capability-Based Systems

Auditing capabilities requires different approaches than auditing ACLs:

- **ACL audit:** Query the ACL for each resource to see who has access. Centralized and straightforward.
- **Capability audit:** Track which capabilities have been issued, to whom, with what scope, and whether they have been used. Requires a capability issuance log and usage log.

Best practices for capability auditing: log every capability issuance with the scope, recipient, and expiration; log every capability exercise (successful use) with the resource accessed; alert on capabilities that are used after the expected session lifetime; and periodically enumerate all outstanding capabilities to identify over-permissioned or expired-but-not-revoked tokens.

## Anti-Patterns

1. **Capabilities that cannot be revoked.** A capability with no expiration and no revocation mechanism is a permanent, transferable, irrevocable grant of authority. If the token leaks (logged by a proxy, forwarded via email, scraped from a public page), the authority persists indefinitely. Always include either a short expiration, an active revocation mechanism, or both. The maximum acceptable lifetime depends on the sensitivity of the resource being protected.

2. **Leaking capabilities through logs or URL parameters.** Pre-signed URLs and capability tokens in URL paths are recorded by web servers, proxy servers, CDNs, analytics platforms, browser history, and browser extensions. Use POST request bodies or HTTP headers for capability transmission when the protocol allows it. When URLs must be used (sharing links, email links), enforce short expiration times and monitor access patterns for anomalies.

3. **Ambient authority disguised as capabilities.** An API key that grants access to all resources a user can reach is not a capability -- it is an identity credential with ambient authority formatted as a bearer token. True capabilities are scoped to a specific resource, a specific action, and ideally a specific time window. If revoking one token requires regenerating a single global key that breaks all integrations, the system uses ambient authority regardless of the token format.

4. **Forgeable capabilities.** A capability URL using sequential IDs (`/share/1234`, `/share/1235`) or predictable tokens (MD5 of the resource name, base64-encoded resource ID, timestamp-based generation) is trivially forgeable by enumeration or computation. Capabilities must be unguessable: 128+ bits of CSPRNG output for opaque tokens, or cryptographically signed structured payloads with tamper detection.

5. **All-or-nothing permission scoping.** A capability system that only offers "full access" and "no access" misses the fundamental value proposition. The power of capabilities lies in fine-grained scoping: read vs write vs delete, specific resource vs collection, time-limited vs permanent, single-use vs reusable, specific IP range vs anywhere. Design the capability model with the granularity that the application's security requirements demand -- then enforce it at the verification point.
