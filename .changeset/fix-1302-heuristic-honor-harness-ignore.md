---
'@harness-engineering/core': patch
---

fix(review): honor `harness-ignore` on the heuristic review path (#1302)

The heuristic review agents re-reported findings that the workspace had already
reviewed and justified with a `// harness-ignore SEC-XXX-NNN` annotation. The
mechanical `SecurityScanner` path honored the annotation (dropping the finding),
but the heuristic fan-out did not — so a suppressed finding silently re-appeared
as a live one whenever the file was touched, indistinguishable from a new hit.

The heuristic security agent now tags each finding with the scanner rule it
mirrors (`securityRuleId`), and the VALIDATE chokepoint (`validate-findings.ts`)
applies the same suppression as the mechanical path — reusing the scanner's own
`parseHarnessIgnore` parser (extracted to a dependency-free `security/harness-ignore`
module). A heuristic finding whose file+line carries a matching `harness-ignore`
annotation is dropped exactly as the mechanical path drops it; un-annotated
findings on other lines are unaffected. Applied once at the shared chokepoint so
every heuristic agent flows through it.
