---
'@harness-engineering/core': patch
---

Bring `detectDeploymentSurface` under the complexity budget

`detectDeploymentSurface` carried a cyclomatic complexity of 30 against the
repo's error threshold of 15 — a standing breach in an `entryPoints` package
(`packages/core/src/index.ts`), not a new regression. The single 90-line body
inlined four unrelated passes: CI/CD pipeline discovery, deploy-script
discovery, `.env.*` discovery, and derived-signal accumulation.

Each pass is now a module-private helper — `collectPipelineFiles`,
`collectDeployScripts`, `collectEnvFiles`, `accumulateContentSignals` and
`accumulateEnvFileSignals` — with the derived booleans and sets threaded
through a single `DerivedSignals` accumulator instead of five loose locals.
The duplicated inline `/\.ya?ml$/i` test also collapses onto the existing
`isYamlPipeline` predicate.

This is a behaviour-preserving extract-method refactor. The exported signature
`(root: string, fsPort: DeploymentFsPort) => DeploymentSurface` is unchanged,
accumulation order (and therefore `detectedEnvironments` ordering) is
preserved, and `packages/core/tests/deployment/detect.test.ts` passes
unmodified.

Refs #2037.
