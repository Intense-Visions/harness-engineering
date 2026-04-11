# SBOM and Build Provenance

> Know exactly what is in your software (SBOM) and prove how it was built (provenance) -- because
> you cannot secure what you cannot inventory

## When to Use

- Responding to a new CVE and need to know which deployments include the affected library
- Meeting regulatory requirements for software transparency (US Executive Order 14028, EU Cyber
  Resilience Act)
- Implementing SLSA (Supply-chain Levels for Software Artifacts) to harden the build pipeline
- Publishing software to customers who require SBOMs as part of procurement
- Auditing the software supply chain for compliance or security review
- Investigating whether a compromised upstream dependency is present in your deployed artifacts

## Threat Context

The 2021 US Executive Order 14028 on Improving Cybersecurity requires SBOMs for software sold to
the federal government. The EU Cyber Resilience Act extends similar requirements to all software
sold in the EU market. Beyond compliance, SBOMs enable rapid vulnerability response: when
Log4Shell (CVE-2021-44228) dropped in December 2021, organizations with SBOMs identified all
affected applications in minutes. Organizations without SBOMs spent days to weeks manually
searching codebases, build artifacts, and container images -- many discovered affected deployments
only after active exploitation was detected.

Build provenance addresses the SolarWinds-class attack: the SUNBURST backdoor was injected into
a legitimate build artifact by compromising the build pipeline. The signed, "trusted" artifact
contained malicious code. Code signing alone could not detect this because the signing happened
after the injection. SLSA provenance proves that an artifact was built from a specific source
commit, on a specific build system, using a specific build process. Without provenance, a
compromised CI system can produce arbitrary artifacts and no consumer can detect the tampering.

The combination of SBOM (what is in the artifact) and provenance (how the artifact was built)
forms the foundation of software supply chain security. Neither alone is sufficient.

## Instructions

1. **Generate SBOMs as part of the build process.** Use SPDX or CycloneDX format -- both are ISO
   standards with broad tooling support. Tools for SBOM generation: `syft` (Anchore, generates
   SBOMs for containers and filesystems), `cdxgen` (CycloneDX generator supporting 20+
   ecosystems), `spdx-sbom-generator` (SPDX native), `trivy sbom` (Aqua Security, combined
   vulnerability scanning and SBOM generation). Generate the SBOM in CI at the same build step
   that produces the artifact. Store the SBOM alongside the artifact -- they are a pair.

2. **Include both direct and transitive dependencies.** An SBOM that lists only direct
   dependencies misses approximately 90% of the dependency tree. A vulnerability in a transitive
   dependency is just as exploitable as one in a direct dependency. Use tools that resolve the
   full dependency graph. For each component include: package name, exact version, license,
   supplier, and package URL (purl) for unambiguous identification across ecosystems.

3. **Implement SLSA build provenance.** SLSA defines four levels of supply chain security. Level
   1: the build process is documented. Level 2: the build service generates provenance
   attestations automatically. Level 3: the build service is hardened and provenance is
   unforgeable (the build service, not the developer, generates the attestation). Level 4: all
   dependencies are recursively verified with hermetic, reproducible builds. Start with SLSA L1
   (document the build process), move to L2 (use GitHub Actions with `slsa-github-generator` or
   Sigstore to generate signed provenance), then plan for L3 (hardened build service with
   non-falsifiable provenance).

4. **Sign provenance attestations.** Use in-toto attestations (the CNCF standard for build
   provenance) signed with Sigstore (keyless signing using OIDC identity). The attestation binds
   the artifact (by cryptographic digest) to the source commit, builder identity, and build
   parameters. Consumers verify the attestation to confirm the artifact was built from the
   expected source by the expected builder. Without signing, provenance attestations can be
   forged by anyone with write access to the artifact store.

5. **Store and distribute SBOMs alongside artifacts.** Attach SBOMs to container images as OCI
   artifacts using `oras`, `cosign attach sbom`, or `docker buildx` with attestation support.
   Publish SBOMs to a central management platform (Dependency-Track, GUAC) for organization-wide
   visibility. Make SBOMs available to customers and auditors upon request -- this is a
   regulatory requirement in many jurisdictions, not a courtesy.

6. **Use SBOMs for continuous vulnerability management.** Ingest SBOMs into a vulnerability
   management tool (Dependency-Track, Grype, Trivy) that correlates SBOM components against
   vulnerability databases (NVD, OSV, GitHub Advisory Database). When a new CVE is published,
   immediately identify all affected artifacts across the organization and prioritize patching
   based on exposure and severity. This turns vulnerability response from a manual search into an
   automated query.

7. **Verify provenance before deployment.** Integrate provenance verification into the deployment
   pipeline. In Kubernetes, use Kyverno or Sigstore policy-controller to verify SLSA provenance
   at admission time. Reject artifacts that lack provenance or whose provenance does not match
   the expected builder identity and source repository. Generating provenance without verifying
   it provides no security benefit.

## Details

- **SPDX vs CycloneDX comparison**: SPDX (Linux Foundation, ISO/IEC 5962:2021) is the more
  mature format with strong license compliance features. It supports documents, packages, files,
  and relationships. CycloneDX (OWASP) is newer and more security-focused, with native support
  for vulnerability correlation, services, and formulation (build provenance). Both are valid
  choices. For security-focused SBOM work, CycloneDX has better tooling integration. For license
  compliance, SPDX is more established. Many organizations generate both formats from the same
  source data.

- **SLSA levels in practice**: Most organizations should target SLSA L2 immediately -- it
  requires only that the build service generates signed provenance, which GitHub Actions and
  Google Cloud Build support natively. SLSA L3 requires that the build service is hardened such
  that insiders and project maintainers cannot influence the provenance generation -- this
  typically requires using an isolated build service like Google Cloud Build or the SLSA GitHub
  generator (which runs in a reusable workflow the project cannot modify). SLSA L4 (hermetic,
  reproducible builds with recursive dependency verification) is aspirational for most
  organizations and primarily relevant for critical infrastructure software.

- **in-toto framework**: Defines a "supply chain layout" that specifies which steps are allowed,
  who performs them, and what artifacts each step produces. Each step generates a "link"
  attestation signed by the step's functionary. The final verification checks that all required
  steps were performed by authorized actors and that artifact digests chain correctly from source
  to final artifact. This provides end-to-end verification of the entire build process, not just
  the final signing step.

- **GUAC (Graph for Understanding Artifact Composition)**: An open-source project (Google-led)
  that ingests SBOMs, SLSA attestations, and vulnerability data into a graph database. Enables
  queries like "which of my deployed artifacts are affected by CVE-2021-44228?" and "what is the
  full dependency chain from this artifact to the vulnerable library?" GUAC provides the
  queryable intelligence layer on top of raw SBOM and provenance data.

- **Package URL (purl) specification**: A standardized format for identifying software packages
  across ecosystems: `pkg:npm/%40angular/core@16.0.0`, `pkg:pypi/requests@2.31.0`,
  `pkg:maven/org.apache.logging.log4j/log4j-core@2.17.1`. Using purls in SBOMs enables
  unambiguous cross-ecosystem vulnerability correlation. Without purls, matching "lodash 4.17.21"
  in an SBOM to a CVE advisory requires ecosystem-specific logic.

## Anti-Patterns

1. **Generating SBOMs only on demand.** An SBOM generated after a CVE is discovered requires
   re-running the build analysis on the deployed version, which may not be reproducible weeks or
   months later. Dependencies may have changed, lock files may have been updated, and the exact
   build environment may no longer exist. Generate SBOMs in CI for every release and store them
   as permanent artifacts alongside the build output.

2. **SBOMs without version specificity.** An SBOM that lists "lodash" without a version, or
   "log4j" without distinguishing between log4j-core and log4j-api, is useless for vulnerability
   correlation. Every component must include an exact version and ideally a package URL (purl)
   for unambiguous identification across vulnerability databases.

3. **Provenance without verification.** Generating SLSA provenance but never verifying it before
   deployment is security theater. The provenance exists, the compliance checkbox is checked, but
   the deployment pipeline accepts any artifact regardless. Integrate provenance verification
   into admission control so that unverified artifacts are rejected.

4. **Treating SBOM as a one-time compliance artifact.** Generating an SBOM once per year for an
   audit captures a snapshot that is stale within days. Vulnerability databases update daily with
   newly disclosed CVEs. SBOMs should be generated for every build and continuously correlated
   against current vulnerability data.

5. **No SBOM for container base images.** The base image (Debian, Alpine, Ubuntu) often contains
   more OS packages than the application layer. A vulnerability in a base image library (OpenSSL,
   glibc, zlib) affects every application built on that image. Include base image components in
   the SBOM, or layer the application SBOM on top of the base image SBOM. Tools like Syft and
   Trivy scan the full container filesystem, capturing both layers.

6. **Confusing SBOM with dependency lock files.** A lock file (package-lock.json, Pipfile.lock)
   records direct and transitive dependency versions for reproducible builds. An SBOM is a
   broader document that includes license information, supplier data, component relationships,
   and can cover non-package components (OS libraries, configuration files, embedded firmware).
   Lock files are a build tool input; SBOMs are a security and compliance output.
