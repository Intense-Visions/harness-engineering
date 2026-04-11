# Multi-Factor Authentication Design

> Something you know, something you have, something you are -- combining authentication factors so that compromising one factor alone is insufficient to gain access

## When to Use

- Adding MFA to an existing authentication system
- Choosing between TOTP, WebAuthn/passkeys, SMS, and email as second factors
- Designing recovery flows for users who lose their second factor
- Implementing step-up authentication for sensitive operations (payment, account changes)
- Evaluating the security properties of different MFA factor types
- Migrating from SMS-based 2FA to phishing-resistant alternatives

## Threat Context

Credential stuffing attacks use billions of leaked username/password combinations from breaches (Collection #1 had 773 million email addresses). Without MFA, every breached password is a working credential. Google reported that SMS-based 2FA blocks 100% of automated bot attacks, 96% of bulk phishing, but only 76% of targeted attacks (because SIM-swap and SS7 interception defeat SMS). WebAuthn/FIDO2 blocks 100% of phishing because the credential is bound to the origin -- a phishing site at `evil.com` cannot trigger a credential scoped to `bank.com`.

The 2022 Uber breach started with MFA fatigue: the attacker spammed push notifications until the employee approved one at 1AM. The 2023 MGM Resorts breach began with a social engineering call to the help desk that bypassed MFA entirely by convincing the support agent to reset the employee's credentials. These attacks show that MFA design must consider the human element, not just the cryptographic protocol.

## Instructions

1. **Understand the three factor categories.** Knowledge (passwords, PINs, security questions), Possession (phone, hardware key, authenticator app), Inherence (fingerprint, face, iris). True MFA requires factors from at least two different categories. Two passwords are not MFA. A password plus a TOTP code (possession of the phone/app) is MFA. A password plus a security question is single-factor (both are knowledge). A passkey with biometric unlock combines possession (device) and inherence (fingerprint) in a single interaction.

2. **Prefer phishing-resistant factors.** WebAuthn/FIDO2 (hardware keys like YubiKey, platform authenticators like Touch ID/Windows Hello, synced passkeys) is phishing-resistant because the browser binds the credential to the relying party origin. An attacker's phishing site at `evil-bank.com` cannot trigger a WebAuthn credential registered for `bank.com`. TOTP is phishable -- an attacker shows a fake login page, the user types the TOTP code, the attacker replays it to the real site in real time before the 30-second window expires. SMS is phishable and additionally vulnerable to SIM swap and SS7 attacks. Security ranking: WebAuthn > TOTP > Email > SMS.

3. **Implement TOTP correctly.** Use RFC 6238 with the following parameters:
   - Hash algorithm: SHA-1 (the standard -- SHA-256/512 are allowed but not universally supported by authenticator apps like Google Authenticator)
   - Digits: 6
   - Time step: 30 seconds
   - Validation window: +/- 1 time step (90 seconds total) to accommodate clock drift

   Store the shared secret encrypted at rest using a KMS-managed key. Display the QR code using the `otpauth://totp/Issuer:account?secret=BASE32SECRET&issuer=Issuer` URI format. Generate and offer backup codes: 8-10 single-use codes, 8 alphanumeric characters each, stored hashed with a unique salt per code.

4. **Design the enrollment flow.** Present the QR code for TOTP enrollment alongside the raw Base32 secret for manual entry. Require the user to enter a valid TOTP code to confirm successful enrollment before activating MFA on the account -- this prevents users from scanning the QR code incorrectly and locking themselves out. For WebAuthn, use the `navigator.credentials.create()` API with `attestation: "none"` (sufficient for most applications). Allow and encourage users to register multiple credentials (backup hardware key, phone authenticator, etc.).

5. **Design the recovery flow.** Recovery codes are the safety net -- display them exactly once at enrollment, store only their hashes in the database. Require the user to acknowledge they have saved them (checkbox or re-entry of one code) before completing enrollment.

   For account recovery without any second factor: require identity verification through one of these approaches:
   - Support ticket with government ID verification (high assurance, high friction)
   - Time-delayed recovery: send notification to all registered emails, impose a 48-72 hour waiting period, allow the existing account holder to cancel the recovery during the waiting period
   - Admin-assisted recovery with manager approval

   Never allow a recovery flow that is weaker than the MFA it replaces -- that makes the recovery path the real authentication mechanism and the MFA merely theater.

6. **Implement step-up authentication.** For sensitive operations (changing email, changing password, authorizing large payments, viewing sensitive data, downloading bulk exports), require a fresh MFA challenge even if the session is already authenticated. Use a short-lived "elevated" session state (15 minutes) that expires and requires re-authentication for subsequent sensitive operations. This limits the blast radius of session hijacking: a stolen session cookie cannot change the account email without the second factor.

7. **Defend against MFA fatigue.** Rate-limit push notifications (max 3 unanswered prompts per hour). Use number matching instead of simple approve/deny: display a two-digit number on the login screen and require the user to enter it in the authenticator app, proving they are looking at the actual login attempt rather than blindly approving. Log and alert on repeated denied MFA prompts as a potential attack indicator. Microsoft, Google, and Duo all added number matching after the Uber breach demonstrated the real-world impact of MFA fatigue.

## Details

### WebAuthn, FIDO2, and Passkeys

WebAuthn is the W3C browser API for public-key credential creation and authentication. FIDO2 is the umbrella term covering WebAuthn (browser API) and CTAP2 (client-to-authenticator protocol for hardware keys). Passkeys are a specific implementation of WebAuthn where the credential private key is synced across the user's devices via a platform credential manager (iCloud Keychain, Google Password Manager, 1Password).

**Registration ceremony:** The relying party (your server) generates a challenge (random bytes). The browser calls `navigator.credentials.create()` with the challenge, relying party ID (your domain), and user information. The authenticator generates a new key pair, stores the private key, and returns the public key, credential ID, and signed attestation. The server stores the public key and credential ID associated with the user account.

**Authentication ceremony:** The server generates a challenge and sends it with a list of allowed credential IDs. The browser calls `navigator.credentials.get()`. The authenticator finds the matching credential, signs the challenge with the private key, and returns the assertion. The server verifies the signature against the stored public key.

Passkeys eliminate passwords entirely -- they are not just a second factor but a complete replacement for password-based authentication. The user experience: click "Sign in," select the passkey from the platform prompt, authenticate with biometrics or device PIN. No password to remember, no TOTP code to type, no SMS to wait for.

### TOTP vs HOTP

TOTP (Time-based One-Time Password, RFC 6238) derives the OTP from the current Unix timestamp divided by the time step (default 30 seconds). HOTP (HMAC-based One-Time Password, RFC 4226) derives the OTP from a monotonically increasing counter maintained by both server and authenticator.

TOTP is preferred because: (1) codes expire automatically after 30 seconds, limiting the replay window; (2) no counter synchronization is needed; (3) HOTP can desynchronize if the user generates codes without submitting them (the authenticator counter advances but the server counter does not), requiring a look-ahead window that weakens security.

Both compute `HMAC-SHA-1(secret, counter_or_time)` and truncate the result to a 6-digit decimal code using dynamic truncation: extract 4 bytes from an offset determined by the last nibble of the HMAC output, interpret as a 31-bit unsigned integer, and take modulo 10^6.

### Hardware Security Keys

Hardware security keys (YubiKey, Google Titan, SoloKeys) provide the strongest MFA guarantees because:

- The private key is generated on the device and never leaves it -- there is no secret to steal from a server breach
- The key is bound to the relying party origin, providing phishing resistance identical to passkeys
- The key requires physical presence (touch or biometric) to sign, preventing remote exploitation
- Hardware keys are resistant to malware -- even if the user's device is fully compromised, the attacker cannot extract the key or use it without physical access

Deployment considerations:

- **Cost:** $25-50 per key, plus users should have two keys (primary + backup). Budget $50-100 per user for hardware-based MFA.
- **Logistics:** Keys must be physically distributed to employees. Remote employees need keys shipped securely. Lost keys require a recovery flow.
- **Compatibility:** USB-A, USB-C, NFC, and Lightning form factors exist. Ensure compatibility with the user's devices. NFC keys work with mobile devices.
- **Protocol support:** Modern keys support FIDO2/WebAuthn, which is the preferred protocol. Older keys may only support U2F (the predecessor) or Yubico OTP.
- **User training:** Hardware keys require user education on registration, daily use, and what to do if the key is lost. Provide clear documentation and a self-service portal for registering backup keys.

For organizations with high-security requirements (financial services, government, infrastructure providers), hardware security keys for all employees with access to production systems or sensitive data is the strongest available MFA deployment. Google reported zero successful phishing attacks against its 85,000+ employees after mandating hardware keys in 2017.

The investment in hardware keys pays for itself after preventing a single credential-based breach, which averages $4.45 million according to IBM's 2023 Cost of a Data Breach Report.

### SMS as MFA -- Risk Analysis

SMS-based verification is the weakest commonly deployed second factor:

- **SIM swap attacks:** The attacker contacts the carrier, impersonates the victim, and convinces the carrier to transfer the phone number to a new SIM. The 2019 Twitter CEO Jack Dorsey account compromise used SIM swap. Success rates remain disturbingly high despite carrier awareness.
- **SS7 protocol vulnerabilities:** The Signaling System 7 network that routes SMS messages has no authentication between carriers. Any entity with SS7 access can intercept SMS messages. SS7 access can be purchased from telecom resellers for a few hundred dollars.
- **Real-time phishing:** An attacker's phishing site prompts the victim for their SMS code and relays it to the real site in real time, completing authentication before the code expires. Automated phishing kits (EvilGinx, Modlishka) handle this transparently.

NIST SP 800-63B (Digital Identity Guidelines) classifies SMS as a "restricted" authenticator: agencies must offer an alternative and must assess SMS-specific risks. If your application must offer SMS, treat it as the lowest-tier option and actively encourage migration to TOTP or WebAuthn through in-app prompts.

### MFA Enrollment UX Considerations

MFA adoption rates depend heavily on the enrollment experience. Poor UX leads to low opt-in rates (when MFA is optional) or high support ticket volume (when MFA is mandatory):

- **Progressive enrollment:** Do not force MFA setup during initial registration. Allow the user to complete registration first, then prompt for MFA setup on the second or third login with clear messaging about why MFA matters.
- **QR code + manual entry:** Always provide both the QR code and the raw Base32 secret text for TOTP enrollment. Some users cannot scan QR codes (accessibility, screen reader users, users on the same device as the authenticator app).
- **Confirmation step:** After scanning the QR code, require the user to enter a valid TOTP code before activating MFA. This catches misconfigured authenticator apps before the user locks themselves out.
- **Backup code emphasis:** Display backup codes prominently and require explicit acknowledgment. Consider asking the user to re-enter one backup code to prove they saved them. Many users skip this step and later need account recovery.
- **Multiple factor registration:** Encourage (or require) registration of at least two independent factors at enrollment time. "Add a backup method" should be a prominent call-to-action, not a hidden settings option.

### Adaptive MFA

Risk-based adaptive MFA adjusts the authentication challenge based on contextual signals:

- **Low risk** (known device, usual IP, usual time): Skip the MFA challenge or accept a remembered device token
- **Medium risk** (new IP, unusual time): Require TOTP or push notification
- **High risk** (new device, impossible travel, high-value operation): Require WebAuthn or hardware key

Signals to evaluate: device fingerprint, IP address and geolocation, login time patterns, velocity (multiple failed attempts), impossible travel (login from two geographically distant locations within minutes), and the sensitivity of the requested operation. Adaptive MFA reduces friction for legitimate users while maintaining strong security for anomalous patterns.

However, the risk scoring model itself becomes an attack surface. If an attacker can manipulate the signals (using a VPN to match the victim's usual location, spoofing device fingerprints, timing the attack during the victim's usual login hours), they may downgrade the MFA requirement. Adaptive MFA should lower friction but never eliminate the MFA requirement entirely for high-value operations.

### MFA Deployment Strategy

Rolling out MFA to an existing user base requires careful planning:

1. **Soft launch (optional enrollment):** Make MFA available but not required. Track enrollment rates. Identify UX friction points from support tickets and drop-off analytics.

2. **Incentivized enrollment:** Offer benefits for MFA adoption: priority support, extended session lifetimes, access to beta features. Show users their account security score.

3. **Mandatory for high-privilege users:** Require MFA for administrators, users with access to sensitive data, and users with billing privileges. This is often the minimum for SOC2 and ISO 27001 compliance.

4. **Progressive mandatory rollout:** Expand MFA requirements to all users in waves: new users first (they set up MFA during registration with no disruption), then active users (30-day grace period with increasing urgency of prompts), then remaining users.

5. **Ongoing monitoring:** Track MFA bypass rates (support tickets for account recovery), factor distribution (are users choosing weak factors like SMS?), and step-up authentication success rates. Alert on sudden spikes in MFA reset requests (may indicate a phishing campaign).

## Anti-Patterns

1. **SMS as the only MFA option.** SMS is vulnerable to SIM swap, SS7 interception, and real-time phishing relay. Always offer TOTP as an alternative at minimum. Prefer WebAuthn/passkeys as the primary recommendation and incentivize adoption through reduced friction (passkeys are faster than typing TOTP codes).

2. **Recovery flow that bypasses MFA.** If "forgot my authenticator" sends an email with a magic link that grants full account access, then email is the real authentication mechanism and the MFA provides zero additional security. The recovery path must be at least as strong as the factor it replaces -- otherwise the weakest recovery path defines the system's actual security level.

3. **MFA fatigue through push notification spam.** Simple approve/deny push notifications can be overcome by sending repeated prompts until the user approves one out of frustration, confusion, or at an inattentive moment. Use number matching (requiring the user to enter a displayed code), rate limit unanswered prompts, and alert the security team on patterns of repeated denials.

4. **Storing TOTP secrets in plaintext.** The TOTP shared secret is functionally equivalent to a password -- if the database is breached, the attacker can generate valid TOTP codes for every user. Encrypt TOTP secrets at rest using a KMS-managed envelope encryption key stored separately from the database. Apply the same protection rigor as you would to password hashes.

5. **No backup authentication method.** If a user's only second factor is a single phone and they lose it, they are permanently locked out of their account. Require enrollment of at least two independent factors (e.g., TOTP app + backup codes, or hardware key + phone). Present clear recovery documentation at enrollment time -- not after the user is already locked out and panicking.

6. **TOTP with excessively long validity windows.** Accepting TOTP codes with a +/- 5 time step window (5 minutes total) increases the replay window significantly. An attacker who phishes a TOTP code has 5 minutes to use it instead of 90 seconds. Use +/- 1 time step (90 seconds total) as the standard. If clock drift is a concern, track the observed drift per user and adjust server-side rather than widening the window globally.

7. **MFA for login but not for account recovery.** If the "forgot password" flow sends a reset link via email with no MFA challenge, and the "change email" flow allows changing the recovery email without MFA, then an attacker who compromises the email account can take over the application account by: resetting the password via email, changing the recovery email to their own, and removing the MFA factor. Every account-altering flow must require MFA verification, not just the login flow.
