# Code and Artifact Signing

> Sign every artifact you produce and verify every artifact you consume -- because an unsigned
> binary could have been built by anyone, including an attacker

## When to Use

- Publishing container images, packages, or binaries that users need to verify as authentic
- Implementing a deployment pipeline that rejects unsigned or untrusted artifacts
- Signing git commits and tags for non-repudiation of source changes
- Evaluating Sigstore (cosign, Fulcio, Rekor) for keyless signing workflows
- Meeting compliance requirements for software integrity and chain of custody
- Establishing a trusted publisher policy for your organization's artifact registries

## Threat Context

The 2020 SolarWinds attack injected the SUNBURST backdoor into a legitimate build artifact by
compromising the build pipeline. The artifact was signed with SolarWinds' code signing
certificate, making it appear trustworthy. Code signing alone did not prevent this attack because
the signing happened after the malicious code was injected. This demonstrates that code signing
proves who built the artifact but not whether the build process was compromised -- build
provenance (SLSA) addresses that complementary concern.

Without artifact signing, any entity with write access to a container registry, package
repository, or download server can replace a legitimate artifact with a malicious one. A
man-in-the-middle on the registry network path, a compromised CI/CD credential, or a rogue
insider can publish a trojaned artifact that downstream consumers deploy without question.
Container image tags are mutable -- `myapp:latest` can point to a completely different image
tomorrow. Only cryptographic signing tied to a verified identity provides assurance that the
artifact was produced by the expected party.

The 2024 xz-utils backdoor (CVE-2024-3094) further demonstrated how compromised maintainers can
inject malicious code into signed releases. Transparency logs and identity-bound signing (rather
than long-lived keys) help detect such attacks by making every signing event publicly auditable.

## Instructions

1. **Sign container images with cosign.** Run `cosign sign <image-digest>` to sign the image and
   store the signature in the same OCI registry. Use keyless signing via Sigstore Fulcio to avoid
   long-lived key management: cosign obtains a short-lived certificate (valid for 10 minutes)
   from Fulcio using the OIDC identity of the CI system (GitHub Actions, GitLab CI, Google
   Workload Identity), signs the artifact, and records the signature in Rekor (the transparency
   log). No long-lived signing keys to manage, rotate, or protect from theft.

2. **Verify signatures before deployment.** In Kubernetes, enforce signature verification at
   admission time using a policy engine: Kyverno (ClusterPolicy with `verifyImages` rule),
   Sigstore policy-controller, or Connaisseur. The policy specifies the expected signer identity
   (OIDC issuer and subject) and rejects any image that is unsigned, signed by an unexpected
   identity, or whose signature does not verify. A deployment pipeline that signs but does not
   verify is performing security theater.

3. **Sign git commits and tags.** Configure git to sign commits using GPG (`git commit -S`), SSH
   keys (supported since Git 2.34), or Sigstore Gitsign (keyless, OIDC-based). Sign release tags
   with `git tag -s`. Configure GitHub or GitLab to require signed commits on protected branches
   and to display verification status. Signed commits provide non-repudiation: the committer
   cannot deny making the commit, and reviewers can verify the author's identity.

4. **Use Sigstore for keyless signing workflows.** The Sigstore ecosystem eliminates long-lived
   key management: Fulcio issues short-lived certificates (10-minute validity) based on OIDC
   identity. Cosign signs the artifact with the ephemeral key. Rekor records the signing event
   in an immutable, publicly auditable transparency log. Verification checks four properties:
   (1) the signature is cryptographically valid, (2) the certificate was issued by Fulcio,
   (3) the signing event exists in Rekor, (4) the OIDC identity matches the expected publisher.

5. **Implement a trusted publisher policy.** Define which identities are authorized to sign which
   artifacts. Example: only the GitHub Actions workflow in the `org/repo` repository, triggered
   by a push to the `main` branch, is authorized to sign the `registry.io/org/app` image.
   Encode this policy in the verification layer (Kyverno policy, cosign verify flags, or
   Sigstore policy-controller CRD). This prevents a compromised workflow in a different
   repository from signing artifacts for your production images.

6. **Sign all release artifacts, not just containers.** Binaries, npm packages, Python wheels,
   Helm charts, Terraform modules -- every artifact you distribute should be signed. Provide
   verification instructions and your signing identity (public key or Sigstore OIDC identity) in
   your release documentation. npm supports Sigstore provenance natively via `--provenance` on
   publish. PyPI supports Trusted Publisher via GitHub Actions OIDC. Both enable consumers to
   verify that the published package was built from the expected repository.

## Details

- **Sigstore ecosystem components**: Cosign (the signing and verification CLI), Fulcio
  (certificate authority that issues short-lived certificates based on OIDC identity), Rekor
  (transparency log that records all signing events as immutable entries), Gitsign (git commit
  signing via Sigstore). The keyless signing flow: CI authenticates via OIDC -> Fulcio issues a
  10-minute certificate binding the OIDC identity to a signing key -> cosign signs the artifact
  -> cosign stores the signature and certificate in the OCI registry -> cosign records the event
  in Rekor -> any verifier can check signature + certificate + Rekor entry without needing the
  signer's cooperation.

- **GPG vs SSH vs Sigstore for git signing**: GPG is the traditional approach -- complex key
  management, long-lived keys, web of trust model. SSH signing (Git 2.34+) is simpler -- uses
  existing SSH keys, supported by GitHub and GitLab. Sigstore Gitsign is the newest option --
  keyless, uses OIDC, records in Rekor, no long-lived keys to manage. Recommendation: Sigstore
  Gitsign for teams that want zero key management overhead. SSH signing for teams already using
  SSH keys. GPG for organizations with established PGP key infrastructure.

- **Container image verification in Kubernetes**: A Kyverno ClusterPolicy specifies the expected
  cosign signer identity (OIDC issuer URL and subject claim) for each image pattern. When a pod
  is created, the admission webhook calls cosign verify against the image digest, checks the
  Rekor transparency log, and rejects the pod if verification fails. This happens at admission
  time -- the image never runs if it fails verification.

- **Transparency logs and key compromise detection**: Without a transparency log, a stolen
  signing key allows an attacker to silently sign malicious artifacts. With Rekor, every signing
  event is recorded publicly. Monitoring the transparency log for unexpected signing events
  (signatures from your identity that you did not produce) enables detection of key compromise
  or identity impersonation. This is the same principle behind Certificate Transparency for TLS.

- **npm and PyPI provenance**: npm v9.5+ supports `npm publish --provenance`, which generates a
  Sigstore-signed SLSA provenance attestation linking the published package to the GitHub Actions
  workflow that built it. PyPI Trusted Publisher links a GitHub repository to a PyPI project via
  OIDC, eliminating long-lived API tokens and enabling consumers to verify the build source.

## Anti-Patterns

1. **Signing without verifying.** Many organizations implement signing as a compliance checkbox
   but never configure their deployment pipeline to verify signatures. Signing without
   verification provides zero security benefit -- the signatures exist but are never checked.
   Always implement admission-time verification alongside signing.

2. **Long-lived signing keys stored in CI secrets.** A static signing key stored as a CI/CD
   secret is a high-value target. If the CI system is compromised, the attacker can sign
   arbitrary artifacts with your identity. Use Sigstore keyless signing to eliminate long-lived
   keys entirely, or store signing keys in a hardware security module (HSM) or cloud KMS with
   strict access controls and audit logging.

3. **Signing after the artifact is modified.** If the build pipeline modifies the artifact after
   signing (re-tagging a Docker image, repackaging a binary, adding metadata), the signature
   becomes invalid or, worse, does not cover the final artifact. Sign the final artifact as the
   absolute last step of the build process. Reference artifacts by digest, not by tag.

4. **No transparency log.** Without a transparency log (Rekor or equivalent), a signing key
   compromise is undetectable after the fact. The attacker signs malicious artifacts, distributes
   them, and no public record exists to detect the unauthorized signatures. Transparency logs
   provide the same security property as Certificate Transparency: public auditability of all
   signing events.

5. **Trusting image tags instead of digests.** Tags are mutable pointers: `myapp:v1.2.3` can
   point to completely different image content at different times. Signing a tag is meaningless
   because the tag can be reassigned. Always sign and verify by digest (`@sha256:abc123...`).
   Tags are human-readable labels; digests are cryptographic identifiers. Your deployment
   manifests should reference digests, not tags.

6. **Signing only production artifacts.** If staging and development artifacts are unsigned, an
   attacker who compromises the pre-production pipeline can inject malicious code that is
   eventually promoted to production. Sign artifacts at every stage of the pipeline and verify
   at every promotion boundary.

7. **No key rotation or revocation plan.** Organizations using traditional (non-keyless) signing
   keys often have no documented process for rotating keys or revoking compromised keys. If a
   signing key is compromised, every artifact signed with that key is suspect, and consumers
   need a way to distinguish pre-compromise signatures from post-compromise ones. Maintain a
   key rotation schedule, document the revocation process, and test it before you need it. This
   is another reason Sigstore keyless signing is preferred -- ephemeral keys cannot be stolen
   because they exist for only 10 minutes.
