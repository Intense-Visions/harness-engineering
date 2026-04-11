# Continuous Identity Verification

> Authentication at login is necessary but insufficient -- continuously evaluate identity
> confidence using device trust, behavioral signals, and environmental context throughout
> the session

## When to Use

- Implementing zero trust architecture that requires continuous verification
- Designing device trust policies (MDM enrollment, OS version, encryption status)
- Building risk-adaptive authentication that adjusts challenge level based on context
- Replacing VPN-based network access with identity-aware access proxies
- Evaluating Google BeyondCorp or similar zero trust access models
- Adding session risk scoring to detect account takeover mid-session

## Threat Context

Traditional authentication verifies identity once at login and trusts the session for its
entire lifetime. Session hijacking (stolen cookies, XSS-extracted tokens), credential
compromise discovered mid-session, and device compromise after login all exploit this
one-time-check model. Google's BeyondCorp (deployed internally after the 2009 Operation
Aurora attack by Chinese state hackers) eliminated the trusted network perimeter and
replaced it with continuous per-request identity and device verification. The 2022 Uber
breach demonstrated that initial authentication (even with MFA) is insufficient when
session tokens are subsequently stolen via social engineering -- the attacker MFA-bombed
an employee, obtained a session token, and accessed internal systems for hours before
detection. The 2023 MGM Resorts breach used social engineering to bypass MFA and then
operated freely within sessions that were never re-evaluated.

## Instructions

1. **Evaluate device trust posture before granting access.** Collect device signals: OS
   version (is it patched?), disk encryption status, screen lock enabled, MDM enrollment
   status, firewall enabled, antivirus status. Define a minimum device posture profile for
   each access level: accessing public docs requires basic posture; accessing production
   systems requires fully managed, encrypted devices with current patches. Reject or
   downgrade access for devices that do not meet the required posture.

2. **Implement risk-based session scoring.** Assign a risk score to each session based on
   signals: IP geolocation change, impossible travel (login from New York and London within
   30 minutes), new device, new browser, unusual time of day, high-velocity actions (100
   API calls per minute from a normally low-volume user). When the risk score exceeds a
   threshold, trigger step-up authentication (re-enter password, MFA challenge) or
   terminate the session. Score continuously, not just at login.

3. **Use identity-aware access proxies.** Replace VPN with a reverse proxy that evaluates
   identity, device posture, and access policy on every request. Google BeyondCorp,
   Cloudflare Access, Zscaler Private Access, and Palo Alto Prisma Access implement this
   model. The proxy intercepts every request, validates the user's identity (via session
   token), checks device posture (via client certificate or agent attestation), and
   evaluates the access policy before forwarding the request to the backend. No request
   reaches the backend without passing all checks.

4. **Implement device attestation.** Use client certificates (issued by your CA, bound to
   the device's TPM) or device attestation protocols (Apple DeviceCheck, Android
   SafetyNet/Play Integrity, Windows Device Health Attestation) to cryptographically
   verify that the device meets your posture requirements. Self-reported device attributes
   are insufficient -- they can be spoofed by malware or a rooted device.

5. **Define access tiers by sensitivity.** Not all resources need the same level of
   identity assurance. Tier 1 (public docs): authenticated user, any device. Tier 2
   (internal tools): authenticated user, managed device, current patches. Tier 3
   (production access, financial data): authenticated user, managed device, MFA within
   last hour, device attestation, trusted network or VPN. Document these tiers and enforce
   them consistently across all access paths.

6. **Handle degradation gracefully.** When device posture degrades mid-session (e.g., MDM
   detects the device is rooted or a required certificate expires), the system should
   reduce access level, not crash. Downgrade from Tier 3 to Tier 1 and notify the user
   that additional verification is needed to regain full access. Never fail open -- if
   posture cannot be determined, default to the lowest access tier.

## Details

### Google BeyondCorp Architecture

BeyondCorp has four components: device inventory (tracks all devices and their trust
level), access control engine (evaluates policies per request), access proxy (intercepts
all traffic), and single sign-on (authenticates users). Request flow: user sends request
to access proxy, proxy checks SSO for authentication, proxy queries device inventory for
device trust level, proxy evaluates access policy (user identity + device trust +
resource sensitivity), proxy forwards or denies the request. No VPN, no trusted network,
every request is individually authorized. Google published the BeyondCorp papers in
2014-2016, and the model has become the foundation of modern zero trust architecture.

### Risk Signals Taxonomy

| Signal Category    | Signals                                                        | Risk Weight |
| ------------------ | -------------------------------------------------------------- | ----------- |
| Authentication age | Time since last MFA, token age                                 | High        |
| Location           | IP geolocation change, impossible travel, VPN/Tor exit node    | High        |
| Device             | New device, OS change, missing MDM, disabled encryption        | Medium-High |
| Behavioral         | Unusual API calls, unusual data volume, off-hours access       | Medium      |
| Session            | Concurrent sessions from different locations, rapid IP changes | Medium      |

Combine signals into a composite risk score. Weight them based on your threat model.
A geolocation change alone might not warrant a challenge, but a geolocation change
combined with a new device and off-hours access should trigger immediate step-up
authentication.

### FIDO2/WebAuthn for Continuous Authentication

WebAuthn can be used not just at login but for continuous re-authentication. Silent
authentication using a platform authenticator (Touch ID, Windows Hello, Android
biometric) provides a low-friction re-verification that confirms the user is still
physically present. This is stronger than session timeout-based re-authentication because
it proves physical presence, not just session liveness. Use silent WebAuthn challenges
before high-sensitivity operations (financial transactions, admin changes, data exports).

### Session Risk Scoring Implementation

A practical session risk scoring system assigns numeric weights to each signal and
maintains a running composite score per session. Example: new device (+30), impossible
travel (+50), failed MFA attempt (+20), unusual time of day (+10), high API velocity
(+15), known Tor exit node IP (+40). Thresholds: below 25 is normal (no action), 25-50
triggers enhanced logging, 50-75 triggers step-up authentication, above 75 terminates
the session. Store the score in the session metadata and update it on every request.
Decay scores over time (reduce by 5 points per hour of normal activity) to avoid
permanent lockout from a single anomalous event.

### Identity Proxy Comparison

| Solution          | Type        | Device Posture   | Best For                                    |
| ----------------- | ----------- | ---------------- | ------------------------------------------- |
| Cloudflare Access | Cloud proxy | Limited          | Simple setup, cloud-only                    |
| Teleport          | Open source | Strong (mTLS)    | SSH, Kubernetes, database access            |
| Boundary          | HashiCorp   | Via integrations | Session-based access, credential brokering  |
| Pomerium          | Open source | mTLS-based       | Identity-aware proxy, self-hosted           |
| Zscaler ZPA       | Commercial  | Full MDM         | Enterprise, complex compliance requirements |

## Anti-Patterns

1. **Authenticate once, trust forever.** A session that is valid for 30 days without
   re-verification gives an attacker 30 days to exploit a stolen session token. Implement
   session risk scoring and periodic re-authentication, especially for sensitive
   operations. Long session lifetimes are a gift to attackers.

2. **Self-reported device posture.** Trusting the client to report its own OS version,
   encryption status, or MDM enrollment without cryptographic attestation. An attacker can
   spoof any self-reported attribute. Require device attestation via TPM-bound certificates
   or platform attestation APIs.

3. **VPN as the zero trust solution.** VPN authenticates at connection time and then
   grants broad network access to the internal network. This is perimeter security, not
   zero trust. A compromised device with a VPN connection has the same access as a trusted
   device. Replace VPN with identity-aware proxies that evaluate policy per-request.

4. **Binary access decisions.** Either full access or no access, with no intermediate
   states. This forces administrators to over-provision access to avoid blocking
   legitimate users. Implement tiered access that degrades gracefully based on trust
   level: high trust equals full access, medium trust equals read-only, low trust equals
   blocked.

5. **No visibility into device fleet.** If you do not know how many devices access your
   systems, their OS versions, or their security posture, you cannot enforce device trust
   policies. Implement device inventory and posture collection as a prerequisite to
   continuous verification. You cannot protect what you cannot see.
