# Trust Boundaries

> Every security control exists because data crosses from a trusted zone to a less-trusted one -- identify the boundaries first, then concentrate defenses there

## When to Use

- Drawing or reviewing a system architecture diagram and need to identify where security controls belong
- Designing a microservices architecture and need to determine which service-to-service calls require authentication
- Evaluating whether an internal API needs the same input validation as a public API
- Planning network segmentation or firewall rules
- Assessing the blast radius of a compromised component

## Threat Context

The majority of exploitable vulnerabilities exist at trust boundary crossings -- the points where data moves between zones of different privilege levels. SQL injection occurs at the boundary between application code and the database query engine. XSS occurs at the boundary between server-generated content and the browser's rendering engine. SSRF occurs at the boundary between user-controlled input and server-side HTTP clients. API authorization failures occur at the boundary between an authenticated session and resource-level access control.

If you cannot draw your trust boundaries on an architecture diagram, you cannot reason about where your controls should be, and you will place them in the wrong locations -- or omit them entirely.

## Instructions

1. **Enumerate trust zones.** A trust zone is a region where all components operate at the same privilege level and share the same trust assumptions. Identify each zone by asking: "If component A is compromised within this zone, what else can the attacker reach without crossing another control?"

   Common zones in modern architectures:
   - **Public internet** (untrusted): User browsers, mobile apps, unknown third-party callers
   - **DMZ / edge** (minimally trusted): Load balancers, CDN edge nodes, API gateways, WAFs
   - **Application tier** (trusted): Application servers, microservices, background workers
   - **Data tier** (highly trusted): Databases, caches, persistent message queues
   - **Secrets / control plane** (maximally trusted): Secrets managers (Vault, KMS), PKI infrastructure, CI/CD pipeline credentials
   - **Cloud infrastructure zones**: VPC, subnet, security group, Kubernetes namespace, pod network, service mesh sidecar

   Each zone should have a clearly stated trust assumption documented alongside the architecture: "Components in this zone have been authenticated at the gateway but have not been authorized for specific resources."

2. **Draw boundaries between zones.** Every point where data crosses from one zone to another is a trust boundary. Mark these with dashed lines on architecture diagrams -- this is standard DFD notation for trust boundaries.

   Label each boundary with:
   - The direction of data flow (unidirectional or bidirectional)
   - The data classification of what crosses it (public, internal, confidential, restricted)
   - The transport mechanism (HTTPS, gRPC, message queue, shared filesystem)

3. **Apply the boundary security principle.** At every trust boundary crossing, apply all five control categories:
   - **Validate all input**: Never trust data arriving from a less-trusted zone. Validate schema, types, ranges, and business rules. Reject malformed input before processing.
   - **Authenticate the caller**: Verify identity before processing any request. This applies at every boundary, not just the perimeter.
   - **Authorize the action**: Verify that the authenticated caller has permission for the specific operation on the specific resource. Authentication without authorization is an open door with a guest book.
   - **Encrypt data in transit**: TLS 1.3 minimum for all boundary crossings. Mutual TLS (mTLS) for service-to-service calls in zero-trust architectures where both parties must prove identity.
   - **Log the crossing**: Record who crossed, what data was accessed, when, and from where. Boundary crossing logs are the primary data source for intrusion detection and incident forensics.

4. **Classify boundary types.** Different boundary types require different control implementations:
   - **Network boundaries**: Firewall rules, load balancer configurations, API gateway policies, VPN tunnels. Controls are infrastructure-level. Managed by operations/platform teams.
   - **Process boundaries**: Inter-process communication (IPC), shared memory, Unix domain sockets, pipes between processes on the same host. Often overlooked because they are "local," but a compromised process can attack its neighbors through these channels.
   - **Application boundaries**: Module imports, function calls that cross security domains within the same process. Example: the admin module calling the user module -- the admin module trusts its own input, but the user module should not trust data arriving from any caller without validation.
   - **Data boundaries**: Encryption and decryption points, serialization and deserialization, encoding and decoding. Every point where data changes representation is a boundary where injection, corruption, or information leakage can occur.

5. **Assess blast radius per zone.** For each zone, answer: "If an attacker gains code execution in this zone, what is the maximum damage they can inflict before hitting another boundary?" The answer defines the blast radius.

   Minimize blast radius through:
   - Limiting cross-zone access to explicit allow-lists (deny by default)
   - Using separate credentials and service accounts per zone (compromising one zone does not yield credentials for another)
   - Applying network-level segmentation (security groups, firewall rules) as a defense-in-depth layer behind application-level controls
   - Implementing circuit breakers that detect anomalous cross-boundary traffic patterns and shed load

6. **Validate boundary effectiveness.** For each identified trust boundary, verify these invariants:
   - Can an unauthenticated request cross it? If yes, the authentication control is missing or misconfigured.
   - Can a request from a lower-trust zone bypass input validation? If yes, there is a validation gap.
   - Can data exfiltrate across it without generating a log entry? If yes, the logging control is incomplete.
   - Can a caller in the lower-trust zone escalate to the privilege level of the higher-trust zone? If yes, the authorization boundary is permeable.

   Any "yes" answer represents a boundary gap that must be mitigated before the system can be considered secure at that crossing point.

## Details

### The Implicit Trust Boundary Problem

Most exploitable vulnerabilities arise not from boundaries that were analyzed and found weak, but from boundaries that developers did not recognize as boundaries at all. The most dangerous implicit boundary is the service-to-service call within a "trusted" network.

Example: Microservice A receives user input, performs some validation, and sends a transformed payload to Microservice B via an internal message queue. Developers assume "B only receives messages from A, so B does not need input validation." This assumption is wrong for three reasons:

1. If A is compromised, the attacker controls what B receives.
2. If the message queue is accessible to other services (most are), any compromised service can send messages to B.
3. If B is later exposed to another caller (a common architectural evolution), the assumption silently breaks with no warning.

The rule: **treat every deserialization point as a trust boundary.** If a component parses JSON, Protocol Buffers, XML, YAML, or any structured data from any external source -- including "trusted internal" sources -- it must validate the schema and reject malformed input. The cost of redundant validation is negligible. The cost of a missing boundary is a breach.

### Cloud-Native Trust Boundaries

In Kubernetes environments, trust boundaries are layered and each layer has distinct control mechanisms:

- **Ingress controller** (internet to cluster): The primary perimeter boundary. TLS termination, rate limiting, WAF rules, and initial authentication (API key validation, OAuth token verification) happen here.
- **Service mesh sidecar** (pod to pod): mTLS between services, fine-grained authorization policies (e.g., Istio AuthorizationPolicy), request-level telemetry. The mesh enforces that Service A can only call Service B on specific endpoints with specific methods.
- **Namespace boundaries** (logical isolation): Kubernetes NetworkPolicy restricts which pods can communicate across namespaces. Namespace-level RBAC controls who can deploy to or read secrets from each namespace.
- **Node boundaries** (VM-level isolation): Pod scheduling constraints (node affinity, taints/tolerations) ensure sensitive workloads run on dedicated nodes with hardened OS configurations.
- **Cloud IAM boundaries** (service account permissions): Workload identity binds Kubernetes service accounts to cloud IAM roles with least-privilege policies. A compromised pod can only access the cloud resources its service account is authorized for.

Each layer is a trust boundary with its own authentication, authorization, and audit mechanism. Defense in depth means that compromising one layer does not automatically grant access to the next.

### Zero Trust and the Dissolution of the Perimeter

Traditional network architecture establishes a single hard boundary -- the firewall -- and treats everything inside as trusted. This model fails because:

1. Attackers who breach the perimeter (via phishing, compromised VPN credentials, supply chain attack) have unrestricted lateral movement inside the network.
2. Cloud and hybrid environments have no single perimeter -- workloads span multiple providers, regions, and network topologies.
3. Remote work means corporate devices connect from untrusted networks, making the "inside the office firewall" assumption obsolete.

Zero trust eliminates the concept of a trusted interior. Every component boundary is a trust boundary. Every request is authenticated and authorized regardless of network position. This is not about adding more firewalls -- it is about making every service enforce its own boundary controls independently.

The practical implication: service-to-service authentication (mTLS, JWT validation, signed requests) is mandatory, not optional. Network location is no longer a proxy for trust. See `security-zero-trust-principles` for the complete zero trust architecture model.

### Boundary Inventory Checklist

When documenting trust boundaries for a system, verify that each of these common boundary types has been identified and classified:

- **External user to application**: Browser/mobile app to API gateway or web server. The most obvious boundary, but often the only one teams analyze.
- **Application to database**: Every database connection is a trust boundary. The application authenticates to the database, and the database authorizes queries. SQL injection exploits this boundary.
- **Service to service**: Every inter-service call in a microservices architecture. Often unprotected because developers assume the internal network is safe.
- **Application to third-party API**: Outbound calls to payment processors, identity providers, analytics services, email providers. Data leaving your trust zone enters someone else's.
- **CI/CD pipeline to production**: Deployment credentials, artifact signing, and deployment authorization. A compromised pipeline is a direct path to production.
- **Admin interface to application**: Administrative endpoints, SSH access, database consoles, monitoring dashboards. These are high-privilege boundaries that attackers specifically target.
- **Background job to data store**: Batch processors, cron jobs, and queue workers that read from and write to data stores. These often run with elevated privileges and bypass the API-level controls.
- **Log aggregator boundary**: Application logs flowing to centralized logging (ELK, Splunk, Datadog). Logs may contain sensitive data; the logging pipeline is a data exfiltration path if compromised.

Missing any of these boundaries means missing the threats that exploit them.

### Data Classification Drives Boundary Strength

Not all trust boundaries need identical controls. The strength of controls at a boundary should be proportional to the sensitivity of the data crossing it:

- **Public data** (marketing pages, public API docs): Basic input validation, rate limiting. No encryption requirement beyond standard TLS.
- **Internal data** (operational metrics, non-sensitive configuration): Input validation, service authentication, TLS. Standard audit logging.
- **Confidential data** (user PII, business financials): Full boundary controls -- input validation, strong authentication, fine-grained authorization, TLS with certificate pinning, comprehensive audit logging, data masking in logs.
- **Restricted data** (cryptographic keys, credentials, payment card numbers): Maximum controls -- all confidential controls plus hardware security module (HSM) integration, dual-control access, break-glass procedures for emergency access, real-time alerting on boundary crossings.

Applying maximum controls uniformly across all boundaries is wasteful and creates operational friction that leads teams to bypass controls entirely. Match control strength to data sensitivity.

### Testing Boundary Controls

Boundary controls must be tested, not assumed. For each trust boundary, write tests that verify:

- **Negative authentication tests**: Send requests without credentials, with expired credentials, and with credentials for a different service. All must be rejected.
- **Input validation at the boundary**: Send malformed payloads, oversized payloads, payloads with unexpected fields, and payloads with type mismatches. The boundary must reject them before they reach business logic.
- **Authorization enforcement**: Send authenticated requests that attempt to access resources belonging to other principals. The boundary must enforce ownership and permission checks.
- **Logging verification**: Perform a boundary crossing and verify that the audit log contains the expected entry with caller identity, timestamp, action, and outcome.

These tests serve double duty: they verify the controls work today, and they prevent future regressions when the boundary code is refactored.

## Anti-Patterns

1. **The "trusted internal network" assumption.** Assuming that anything inside the VPC, firewall, or corporate network is inherently safe. Internal networks are compromised routinely -- lateral movement is the single most common post-exploitation technique in breach reports (Mandiant M-Trends, Verizon DBIR). Every service-to-service call crosses a trust boundary even within the same network segment. The internal network is a transport layer, not a security control.

2. **Validating input at the perimeter only.** Placing all input validation at the API gateway or edge proxy and trusting all data downstream. This creates a single point of failure: if any downstream service is reachable by another path (internal message queue, batch job, admin endpoint, debugging interface, or a future integration not yet built), the validation is completely bypassed. Every component must validate input at its own boundary, regardless of what upstream components may have done.

3. **Symmetric trust across an asymmetric boundary.** Two services that mutually trust each other equally when the data flow is asymmetric in risk. If Service A sends user-controlled data to Service B, then B must validate that data even if A is a "trusted" internal service -- because A might be relaying attacker input without modification or with insufficient sanitization. Trust must be proportional to the risk of the data, not the reputation of the sender.

4. **Missing deserialization boundaries.** Deserializing data from any external source (JSON.parse, pickle.loads, Java ObjectInputStream, YAML.load, XML parsing) without treating the deserialization point as a trust boundary. Deserialization of untrusted data is effectively code execution in many languages and frameworks. Every deserialization of data from a less-trusted source must: validate against a strict schema, reject unexpected types and fields, enforce maximum payload size, and use safe deserialization methods (e.g., JSON.parse is generally safe; Java ObjectInputStream is not without explicit class allowlisting; Python pickle is never safe for untrusted input).
