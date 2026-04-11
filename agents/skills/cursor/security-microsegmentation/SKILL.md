# Microsegmentation

> Isolate every workload behind its own perimeter -- so compromising the web server does
> not hand the attacker the database, the secrets store, and the internal APIs

## When to Use

- Designing network architecture for a microservices system
- Implementing zero trust networking within a data center or cloud VPC
- Reducing blast radius after a service compromise
- Configuring Kubernetes NetworkPolicies or cloud security groups
- Auditing east-west traffic (service-to-service) for unauthorized communication
- Preparing for compliance frameworks that require network segmentation (PCI-DSS, HIPAA)

## Threat Context

Traditional perimeter security (firewall at the edge, flat network inside) fails
catastrophically when the perimeter is breached. The 2013 Target breach started with
compromised HVAC vendor credentials and used the flat internal network to reach the POS
systems -- lateral movement across 40 million credit cards. The 2017 Equifax breach
exploited a single web application vulnerability and pivoted through unsegmented internal
systems to access 147 million records. The 2020 SolarWinds attack demonstrated lateral
movement at national scale: once inside the perimeter, the attacker moved freely between
systems for months. Microsegmentation limits blast radius: if the web server is
compromised, it can only reach the services it was explicitly allowed to communicate with.
Everything else is unreachable.

## Instructions

1. **Map all service-to-service communication flows.** Before writing a single firewall
   rule, document which services talk to which services, on which ports, using which
   protocols. This is your baseline. Any communication not in this map should be denied by
   default. Use network flow logs, service mesh telemetry, or traffic analysis tools to
   discover actual traffic patterns. In AWS, VPC Flow Logs capture every packet accepted or
   rejected by security groups. In Kubernetes, Cilium's Hubble provides real-time
   visibility into all network flows with identity context.

2. **Apply default-deny network policies.** Start with "deny all ingress and egress" for
   every workload. Then add explicit allow rules for each documented communication flow.
   In Kubernetes: create a NetworkPolicy with `policyTypes: [Ingress, Egress]` and empty
   rules (deny-all), then add specific allow rules per service. In cloud: use security
   groups with deny-all and explicit allow rules. The default in most Kubernetes clusters
   and cloud VPCs is allow-all -- this must be explicitly corrected as the first step.

3. **Segment by trust level, not just by service.** Group services into trust zones:
   public-facing (web servers, API gateways), application logic (business services), data
   stores (databases, caches), management (monitoring, logging, CI/CD). Apply stricter
   rules at zone boundaries. Data stores should only accept connections from application
   logic, never from public-facing services directly. Management systems should be in an
   isolated zone accessible only from specific bastion hosts or jump servers.

4. **Use service identity, not IP addresses.** IP-based rules are fragile in dynamic
   environments (containers, autoscaling, spot instances). Use service identity (mTLS
   certificates, SPIFFE IDs, Kubernetes service accounts) to define policies. Service
   mesh (Istio, Linkerd, Cilium) provides identity-based policy enforcement. When a pod
   restarts with a new IP, identity-based policies continue to work because they reference
   the service account, not the ephemeral IP.

5. **Enforce application-layer segmentation.** Network segmentation (L3/L4) blocks
   unauthorized IP/port combinations but does not prevent an authorized connection from
   sending malicious requests. Add L7 policies: only allow specific HTTP methods and paths
   between services. For example, the order service can call `GET /api/inventory` and
   `POST /api/inventory/reserve` on the inventory service, but cannot call
   `DELETE /api/inventory/*`. Service mesh authorization policies (Istio
   AuthorizationPolicy, Cilium L7 policies) enable this granularity.

6. **Monitor and alert on policy violations.** Log denied connections. Alert on unexpected
   communication patterns. A sudden spike in denied traffic between two services may
   indicate a compromised service attempting lateral movement. Review flow logs
   periodically to discover new communication patterns that need policy updates. In
   production, treat any unexpected denied connection as a potential indicator of
   compromise until proven otherwise.

## Details

### Microsegmentation vs Traditional VLANs

VLANs segment at the network layer but every host within a VLAN can communicate freely.
Microsegmentation applies per-workload policies, so two containers on the same host can
be in different segments. VLANs are insufficient for containerized and cloud-native
environments where workload density is high and IP addresses are ephemeral. A single
Kubernetes node may run 50 pods from 20 different services -- VLAN-level segmentation
treats them all as one trust zone.

### Implementation Technologies

| Technology                | Layer | Identity-Aware | Notes                                                |
| ------------------------- | ----- | -------------- | ---------------------------------------------------- |
| Kubernetes NetworkPolicy  | L3/L4 | Label-based    | Requires CNI support (Calico, Cilium, Antrea)        |
| Cilium Network Policies   | L3-L7 | Yes (eBPF)     | Richest model: L7 HTTP/gRPC, DNS-based egress        |
| Istio AuthorizationPolicy | L7    | mTLS identity  | Full HTTP method/path control, JWT validation        |
| AWS Security Groups       | L3/L4 | No             | Instance-level, can reference other security groups  |
| Azure NSGs                | L3/L4 | No             | Subnet or NIC level, service tags for Azure services |
| GCP Firewall Rules        | L3/L4 | No             | Network tags or service accounts for targeting       |

For Kubernetes, Cilium provides the richest policy model. For cloud-native without
Kubernetes, use the cloud provider's security groups with cross-referencing (security
group A allows traffic from security group B, not from IP ranges).

### PCI-DSS Segmentation Requirements

PCI-DSS requires that the Cardholder Data Environment (CDE) is segmented from all other
systems. Microsegmentation implements this by: placing CDE components in a dedicated
segment, allowing only authorized services to communicate with the CDE, logging all CDE
traffic, and testing segmentation controls annually. Penetration testers must verify that
non-CDE systems cannot reach CDE systems, and this verification must be documented.

### Blast Radius Analysis

For each service, enumerate what an attacker with full control of that service can reach.
If compromising the web server gives access to the database, the secrets store, and the
CI/CD system, the blast radius is the entire system. After segmentation, the web server
should only reach the API gateway and the application services -- the database and secrets
store are unreachable. Perform blast radius analysis quarterly and after any significant
architecture change. Document the analysis: "If service X is compromised, the attacker
can reach services Y and Z, which contain data classifications A and B."

### Migration Strategy for Existing Systems

Retrofitting segmentation onto a flat network is high-risk if done incorrectly. The
recommended approach: (1) deploy monitoring first -- enable flow logs and observe all
traffic for 2-4 weeks without enforcing any policy, (2) generate a baseline communication
map from observed traffic, (3) create policies that match the observed baseline (this
should change nothing), (4) enable enforcement in audit/log-only mode, (5) verify no
legitimate traffic is being flagged, (6) switch to enforcing mode, (7) incrementally
tighten policies by removing overly broad rules. Never go from flat network to strict
segmentation in one step -- the result is always a production outage.

## Anti-Patterns

1. **Flat network with no internal segmentation.** All services can reach all other
   services. Compromising any single service grants access to the entire system. This is
   the default in most cloud VPCs and Kubernetes clusters and must be explicitly corrected.

2. **Overly permissive allow rules.** Rules like "allow all traffic from the application
   subnet to the data subnet" defeat the purpose of segmentation. Be specific: allow
   service-A to reach database-B on port 5432 using TCP. Every rule should name specific
   source and destination identities, not broad CIDR ranges.

3. **Segmentation without monitoring.** Policies without monitoring are unverifiable. If
   you cannot see what traffic is flowing and what is being denied, you cannot know if the
   segmentation is effective or if rules have drifted. Enable flow logs, review them, and
   alert on anomalies.

4. **IP-based policies in dynamic environments.** Kubernetes pods get new IPs on every
   restart. Security group rules referencing specific IPs become stale immediately. Use
   service identity and label selectors instead. If you find yourself updating firewall
   rules every time a pod restarts, your segmentation model is fundamentally wrong.

5. **Segmentation only at the network layer.** L3/L4 policies prevent unauthorized
   connections but do not prevent authorized connections from being misused. A compromised
   order service with L4 access to the payment service can send arbitrary requests. Add
   L7 policies for sensitive services: only allow specific HTTP methods and paths, reject
   everything else.
