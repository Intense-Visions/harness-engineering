# Zero Trust Principles

> No implicit trust based on network position, VPN status, or previous authentication -- every request is authenticated, authorized, and encrypted regardless of origin

## When to Use

- Designing a new system architecture and need to establish the security model
- Migrating from a perimeter-based security model to a modern architecture
- Planning service-to-service authentication in a microservices environment
- Evaluating whether internal APIs need authentication and encryption
- Responding to a breach and hardening the architecture against lateral movement
- Implementing security for remote and hybrid workforce access

## Threat Context

Perimeter-based security -- the "hard shell, soft interior" model where a firewall or VPN guards the boundary and everything inside the network is trusted -- fails because attackers who breach the perimeter have unrestricted lateral movement across all internal resources.
The assumption that "inside the network equals trustworthy" has been catastrophically disproven by every major breach of the last decade.

The 2020 SolarWinds supply chain attack demonstrated this at nation-state scale.
Once the compromised Orion update was deployed inside government agencies and Fortune 500 companies, the attackers (attributed to Russia's SVR) moved laterally through "trusted" internal networks for nine months, accessing email systems, source code repositories, and classified infrastructure.
Internal services trusted other internal services implicitly; there was no authentication or authorization between components within the perimeter.

The 2023 Microsoft Storm-0558 breach exploited implicit trust in internal token-signing infrastructure.
Attackers obtained a Microsoft account consumer signing key and used it to forge enterprise Azure AD tokens, accessing email accounts of US government officials.
The signing key was trusted implicitly across services -- there was no per-request verification of whether the key should be authorized to sign tokens for that specific audience.

The 2021 Colonial Pipeline ransomware attack began with a compromised VPN credential -- a single password without multi-factor authentication.
Once inside the VPN, the attackers had broad network access because the internal network did not segment or authenticate traffic between systems.

Zero trust assumes the network is always hostile and every component may already be compromised.
This is not paranoia; it is the empirically validated reality of modern threat environments.

## Instructions

1. **Never trust, always verify.**
   Every request to every resource must be authenticated and authorized, regardless of its network origin.
   An API call from inside the corporate network, from a Kubernetes pod in the same cluster, or from a service on the same physical host receives the same authentication and authorization scrutiny as a request from the public internet.

   There is no "trusted zone," no "internal network exception," and no "localhost bypass."
   Every request is unverified until proven otherwise.

2. **Apply least privilege everywhere and continuously.**
   Users, services, infrastructure components, and automated processes receive the minimum permissions required for their current task -- not their potential tasks, not their historical tasks, and not "everything they might need someday."

   Permissions are scoped to specific resources and time-limited where possible:
   - A CI/CD pipeline token that deploys to staging should not have production credentials
   - A microservice that reads from a database should not have write access
   - A developer who manages application code should not have access to production secrets

   Review and reduce permissions continuously; access that was appropriate six months ago may not be appropriate today.

3. **Assume breach as the baseline design posture.**
   Design every component under the assumption that adjacent components may already be compromised.
   This architectural assumption drives concrete design decisions:
   - Mutual authentication between all services (mTLS)
   - Encrypted communication even on internal networks (TLS everywhere)
   - Network segmentation that limits blast radius (a compromised web server cannot reach the database server directly)
   - Monitoring that detects lateral movement (anomalous service-to-service communication patterns)

   If Service A is compromised, it should not be able to access Service B's data, Service C's configuration, or Service D's secrets without individually authenticating and being individually authorized for each.

4. **Verify explicitly and continuously.**
   Authentication is not a one-time event at session start.
   Continuously evaluate the trust factors that supported the original access decision:
   - Is the user's session still valid?
   - Has the device's security posture changed (OS patch level, disk encryption status, endpoint detection agent running)?
   - Has the user's risk profile changed (impossible travel between login locations, unusual access patterns, access outside normal hours)?
   - Has the network context changed (different IP range, different geographic region)?

   When risk indicators change, require step-up authentication.
   Implement continuous access evaluation as a background process, not just at login time.

5. **Use identity as the new perimeter.**
   Replace network-based access controls (VPN, firewall rules based on IP ranges, network ACLs) with identity-based controls.
   Access decisions use a rich context of signals:
   - User identity: who is requesting?
   - Device identity and health: is the device managed, patched, and compliant?
   - Application identity: which service is making the request?
   - Data classification: how sensitive is the requested resource?
   - Real-time risk signals: behavioral analytics, threat intelligence

   Google's BeyondCorp model is the canonical implementation: employees access internal applications through an identity-aware proxy that evaluates all these signals on every request, with no VPN required.
   Network location is not a factor in the access decision.

6. **Encrypt all communications without exception.**
   TLS for all HTTP traffic, including between services on the same internal network.
   mTLS (mutual TLS) for service-to-service communication, where both the client and server present certificates and verify each other's identity.
   Encryption at rest for all stored data.

   Even "internal" network traffic may be observed by:
   - Compromised hosts on the same network segment
   - Compromised network switches or routers
   - Cloud provider infrastructure (where "your" network is a virtual overlay on shared physical hardware)
   - Legitimate monitoring tools that are misconfigured or compromised

7. **Log everything and use the logs.**
   Zero trust architecture generates an audit trail at every access decision point.
   Centralize these logs in a SIEM (Security Information and Event Management) system.
   Apply anomaly detection to identify patterns that indicate compromise:
   - A service suddenly calling APIs it has never called before
   - A user accessing resources outside their normal pattern
   - Authentication failures from new geographic locations
   - Privilege escalation attempts

   Alert on policy violations in real time.
   If you cannot observe and verify what is happening, you cannot enforce zero trust -- you are just hoping the policies work.

## Details

### The BeyondCorp Model (Google)

Google's internal zero trust implementation has been operational since 2014, replacing the traditional VPN-based access model for over 100,000 employees.

Key components:

1. **Device inventory database**: Every device that accesses Google resources has a certificate-based identity issued during provisioning. The device's hardware characteristics, OS version, patch level, disk encryption status, and endpoint security agent status are continuously monitored.

2. **User identity database**: Single sign-on with hardware security key MFA (FIDO2/WebAuthn). User identity is verified on every request, not just at VPN login. Risk-based authentication adjusts requirements based on the sensitivity of the requested resource.

3. **Access proxy**: All requests to internal applications route through an identity-aware proxy. The proxy enforces per-request authorization based on user identity, device identity, device posture, and resource sensitivity. No direct network access to applications is possible.

4. **Trust tiers**: Devices and users are classified into trust levels based on posture, role, and behavioral signals. A fully managed device with current patches and a hardware security key gets Tier 1 access. A personal device with only a password gets Tier 3 access with restricted resource availability.

5. **No VPN**: Access decisions are made per-request based on identity and context, not based on network position. An employee at a coffee shop has the same access as an employee in a Google office, provided their identity and device meet the required trust tier.

### NIST SP 800-207: Zero Trust Architecture

The NIST reference standard (published 2020) defines the core tenets:

- All data sources and computing services are considered resources
- All communication is secured regardless of network location
- Access to individual resources is granted on a per-session basis
- Access is determined by dynamic policy -- including user identity, application/service identity, device state, and behavioral and environmental attributes
- The enterprise monitors and measures the security posture of all owned and associated assets
- All resource authentication and authorization are dynamic and strictly enforced before access is allowed
- The enterprise collects information about asset state, network infrastructure, and communications and uses it to improve security posture

### Practical Implementation Layers

Zero trust is not an all-or-nothing proposition.
Implement incrementally, starting with the highest-value controls:

**Layer 1 -- Quick wins (weeks):**

- Enforce TLS on all internal communication
- Add authentication to all internal APIs (even "internal-only" ones)
- Implement service-to-service mTLS using a service mesh or certificate infrastructure
- Enable audit logging on all access decisions

These changes have the highest security impact relative to effort.

**Layer 2 -- Identity-centric controls (months):**

- Deploy an identity-aware proxy or API gateway that enforces per-request authorization
- Implement device trust verification (managed device certificates, posture checks)
- Add continuous authentication that re-evaluates sessions based on risk signals
- Implement just-in-time access provisioning for privileged operations

**Layer 3 -- Advanced capabilities (quarters):**

- Real-time risk scoring that adjusts access decisions dynamically
- Policy engine that evaluates environmental attributes (time, location, behavioral patterns)
- Microsegmentation at the application level (not just the network level)
- Automated response to anomalous access patterns (session termination, forced re-authentication, alert escalation)

### Zero Trust in Kubernetes and Microservices

In a containerized microservices environment, zero trust translates to specific architectural patterns:

- **Service identity**: Every pod has a cryptographic identity, typically provided by SPIFFE (Secure Production Identity Framework for Everyone) and SPIRE (SPIFFE Runtime Environment). The identity is bound to the workload, not the network address.

- **Service mesh for mTLS**: A service mesh (Istio, Linkerd, Cilium) transparently enforces mTLS between all pods. Application code does not need to manage TLS certificates -- the mesh sidecar proxy handles encryption and identity verification.

- **Network policies**: Kubernetes NetworkPolicy resources restrict pod-to-pod communication to explicit allow lists. Default deny all ingress and egress traffic; selectively allow only the communication paths that are architecturally required.

- **API gateway authorization**: An API gateway (or ingress controller with authorization plugins) enforces user-level authorization on every inbound request. The gateway validates the user's identity token, checks permissions, and only forwards authorized requests to backend services.

- **Secrets management**: Secrets (database credentials, API keys, TLS certificates) are injected at runtime from a secrets manager (HashiCorp Vault, AWS Secrets Manager, Kubernetes Secrets with external secrets operator), not baked into container images or deployment manifests.

### Zero Trust for Developer Workflows

Zero trust applies to the software development lifecycle as well:

- **Source code access**: Repository access requires per-repository authorization, not blanket organization membership. Read access and write access are distinct permissions.
- **CI/CD pipelines**: Pipeline credentials are scoped to the specific environment and resources the pipeline deploys to. Production deployment requires separate approval and uses distinct, short-lived credentials.
- **Infrastructure access**: SSH to production servers requires just-in-time access provisioning with MFA, time-limited sessions, and full command audit logging. Persistent SSH keys are a zero trust violation.
- **Secrets in development**: Developers use personal credentials for development environments, not shared production secrets. Production secrets are accessible only through the deployment pipeline.

## Anti-Patterns

1. **"We have a VPN, so internal traffic is safe."**
   A VPN moves the perimeter boundary to the VPN server but does nothing to secure communication between internal hosts.
   Any compromised host on the VPN -- whether from malware, a phished employee, or a compromised contractor device -- has the same network access as a legitimate host.
   VPN is a transport mechanism for remote access, not a security architecture.
   The Colonial Pipeline attack began with a single compromised VPN password.

2. **Zero trust in name only: mTLS without authorization.**
   Encrypting and authenticating internal traffic is necessary but not sufficient.
   If Service A can call any endpoint on Service B with a valid mTLS certificate, lateral movement is still trivial -- the attacker just needs to compromise any service with a valid certificate.
   Per-endpoint, per-operation authorization is required.
   Authentication answers "who is calling?" Authorization answers "are they allowed to do this specific thing?"

3. **One-time authentication treated as continuous trust.**
   Authenticating a user at login and trusting the session for 8-24 hours without re-evaluation.
   During those hours, the device could be compromised by malware, the user's credentials could be phished and used from another device, or the user's role could change (terminated employee).
   Implement step-up authentication for sensitive operations, continuous device posture evaluation, and session risk scoring.

4. **Treating zero trust as a product purchase.**
   No single vendor provides "zero trust in a box."
   Zero trust is an architectural model and a set of design principles, not a product.
   It requires coordinated changes to identity management, network architecture, application design, data classification, monitoring, and incident response.
   Vendor products implement components of a zero trust architecture, but purchasing them without the architectural changes provides security theater, not security.

5. **All-or-nothing implementation.**
   Attempting to implement zero trust across the entire organization simultaneously leads to either analysis paralysis (nothing gets done) or rushed deployment (controls are misconfigured and bypassed).
   Start with the highest-value assets: production databases, customer data stores, administrative interfaces, and secrets management infrastructure.
   Implement zero trust for those first, validate, measure operational impact, then expand.
   Google's BeyondCorp was rolled out incrementally over six years.

6. **Exempting service accounts from zero trust policies.**
   Service accounts, machine identities, and API keys are frequently exempted from MFA, session timeouts, and authorization checks because "they are not users."
   Service accounts are the most common vector for lateral movement because they typically have broad permissions, long-lived credentials, and no behavioral monitoring.
   Apply the same principles: least privilege, short-lived credentials, mutual authentication, and continuous monitoring.

7. **Confusing network segmentation with zero trust.**
   Network segmentation (VLANs, firewall rules between subnets) reduces blast radius but does not provide zero trust.
   Within each segment, hosts still trust each other implicitly.
   Zero trust requires authentication and authorization at the application layer, between individual services, regardless of network topology.
   Segmentation is a complementary control, not a substitute.
