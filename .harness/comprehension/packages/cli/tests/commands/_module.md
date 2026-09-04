---
schemaVersion: 1
module: 'packages/cli/tests/commands'
sourceHash: '5b3a75277aeb5bbb3949d3786514b93a3b7accda8991c47281cb7d17e350481e'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'add-extra.test.ts',
    'add.test.ts',
    'adoption-retrospective.test.ts',
    'adoption.test.ts',
    'agent-review.test.ts',
    'agent-run-persona.test.ts',
    'agent-run.test.ts',
    'agent.test.ts',
    'audit-protected.test.ts',
    'backfill-skill-provenance.test.ts',
    'check-arch.test.ts',
    'check-deployment.test.ts',
    'check-deps.test.ts',
    'check-design.test.ts',
    'check-docs.test.ts',
    'check-harness-strength.test.ts',
    'check-perf.test.ts',
    'check-phase-gate.test.ts',
    'check-security.test.ts',
    'check-vocabulary.test.ts',
    'cleanup-sessions.test.ts',
    'cleanup.test.ts',
    'compound-scan-candidates.test.ts',
    'create-skill.test.ts',
    'cross-check.test.ts',
    'dashboard.test.ts',
    'deprecated-graph-aliases.test.ts',
    'distortion.test.ts',
    'doctor-hardening.test.ts',
    'doctor.test.ts',
    'fix-drift.test.ts',
    'generate-agent-definitions.test.ts',
    'generate-slash-commands.test.ts',
    'generate.test.ts',
    'golden-build.test.ts',
    'graph-ingest-decisions.integration.test.ts',
    'graph-ingest.test.ts',
    'graph-integrity.test.ts',
    'graph.test.ts',
    'hooks.test.ts',
    'impact-preview.test.ts',
    'ingest-options.test.ts',
    'init-extra.test.ts',
    'init-minimal.test.ts',
    'init.test.ts',
    'insights.test.ts',
    'install-constraints.test.ts',
    'install.test.ts',
    'integrations-sync.test.ts',
    'integrations.test.ts',
    'learnings-prune.test.ts',
    'linter-generate.test.ts',
    'maintenance-command-shape.test.ts',
    'maintenance-run-check-runner.test.ts',
    'maintenance-run-integration.test.ts',
    'maintenance-run-selection.test.ts',
    'mcp-guard.test.ts',
    'mcp-list-capabilities.test.ts',
    'mcp-refinement-demand.test.ts',
    'migrate-backends.test.ts',
    'migrate.test.ts',
    'models-probe.test.ts',
    'models.test.ts',
    'outcome-eval-ci.test.ts',
    'perf.test.ts',
    'persona-list.test.ts',
    'persona.test.ts',
    'pre-merge-brief-guardian.test.ts',
    'pre-merge-brief.test.ts',
    'predict.test.ts',
    'proposals-status.test.ts',
    'proposals.test.ts',
    'publish-analyses.test.ts',
    'pulse-run.test.ts',
    'recommend.test.ts',
    'resolve-skill-sources.test.ts',
    'review-ci-local-adapter.test.ts',
    'review-ci.test.ts',
    'rollback.test.ts',
    'scan-config.test.ts',
    'search.test.ts',
    'setup-mcp.picker-message.test.ts',
    'setup-mcp.test.ts',
    'setup.test.ts',
    'share.test.ts',
    'skill-create.test.ts',
    'skill-info.test.ts',
    'skill-list.test.ts',
    'skill-local-resolution.test.ts',
    'skill-publish.test.ts',
    'skill-run.test.ts',
    'skill-search.test.ts',
    'skill-update.test.ts',
    'skill-validate.test.ts',
    'skill.test.ts',
    'snapshot.test.ts',
    'stale-constraints.test.ts',
    'state-show.test.ts',
    'state-streams.test.ts',
    'state.test.ts',
    'sync-analyses-action.test.ts',
    'sync-analyses.test.ts',
    'sync-main.test.ts',
    'taint.test.ts',
    'telemetry-synthesize.test.ts',
    'telemetry-wizard.test.ts',
    'telemetry.test.ts',
    'traceability.test.ts',
    'uninstall-constraints.test.ts',
    'uninstall.test.ts',
    'update-integrations-sync.test.ts',
    'update-skill-providers.test.ts',
    'update.test.ts',
    'usage-pipeline.test.ts',
    'usage.test.ts',
    'validate-cross-check.test.ts',
    'validate-scope.test.ts',
    'validate.changed.test.ts',
    'validate.merge-driver.test.ts',
    'validate.roadmap-abstention.test.ts',
    'validate.roadmap-health.test.ts',
    'validate.roadmap-mode.test.ts',
    'validate.test.ts',
    'waypoint.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { createAddCommand, runAdd } from '../../src/commands/add'
import { createAdoptionCommand } from '../../src/commands/adoption'
import { createAgentCommand } from '../../src/commands/agent'
import { createReviewCommand, runAgentReview } from '../../src/commands/agent/review'
import { createRunCommand, runAgentTask } from '../../src/commands/agent/run'
import { createAuditProtectedCommand, runAuditProtected } from '../../src/commands/audit-protected'
import { runBackfillSkillProvenance } from '../../src/commands/backfill-skill-provenance'
import { createCheckArchCommand, runCheckArch } from '../../src/commands/check-arch'
import { createCheckDeploymentCommand, runCheckDeployment } from '../../src/commands/check-deployment'
import { createCheckDepsCommand, runCheckDeps } from '../../src/commands/check-deps'
import { createCheckDesignCommand, runCheckDesign } from '../../src/commands/check-design'
import { createCheckDocsCommand, runCheckDocs } from '../../src/commands/check-docs'
import { runCheckHarnessStrength } from '../../src/commands/check-harness-strength'
import { createCheckPerfCommand, runCheckPerf } from '../../src/commands/check-perf'
import { createCheckPhaseGateCommand, runCheckPhaseGate } from '../../src/commands/check-phase-gate'
import { runCheckSecurity } from '../../src/commands/check-security'
import { createCheckVocabularyCommand, runCheckVocabulary } from '../../src/commands/check-vocabulary'
import { createCleanupCommand, runCleanup } from '../../src/commands/cleanup'
import { runCleanupAll, runCleanupSessions } from '../../src/commands/cleanup-sessions'
import { runCompoundScanCandidatesCommand } from '../../src/commands/compound/scan-candidates'
import { createCreateSkillCommand, generateSkillFiles } from '../../src/commands/create-skill'
import { createCrossCheckCommand } from '../../src/commands/cross-check'
import { createDashboardCommand } from '../../src/commands/dashboard'
import { createDistortionCommand } from '../../src/commands/distortion'
import { checkBaselineFreshness, checkCatalogFreshness, checkHookValidity, checkLivePings, checkSessionCorruption, isCatalogStale, runDoctor } from '../../src/commands/doctor'
import { createFixDriftCommand, runFixDrift } from '../../src/commands/fix-drift'
import { createGenerateCommand } from '../../src/commands/generate'
import { createGenerateAgentDefinitionsCommand, generateAgentDefinitions } from '../../src/commands/generate-agent-definitions'
import { GenerateResult, createGenerateSlashCommandsCommand, generateSlashCommands, handleOrphanDeletion, resolveSkillSources } from '../../src/commands/generate-slash-commands'
import { runGoldenDiff, runGoldenPromote, runGoldenVerify } from '../../src/commands/golden-build'
import { registerDeprecatedGraphAliases } from '../../src/commands/graph/deprecated-aliases'
import { runGraphExport } from '../../src/commands/graph/export'
import { createGraphCommand } from '../../src/commands/graph/index'
import { createIngestCommand, runIngest } from '../../src/commands/graph/ingest'
import { loadIngestOptions } from '../../src/commands/graph/ingest-options'
import { runGraphIntegrity } from '../../src/commands/graph/integrity'
import { createQueryCommand, runQuery, runShortestPath } from '../../src/commands/graph/query'
import { createScanCommand, runScan } from '../../src/commands/graph/scan'
import { runGraphStatus } from '../../src/commands/graph/status'
import { addHooks } from '../../src/commands/hooks/add'
import { createHooksCommand } from '../../src/commands/hooks/index'
import { buildHookCommand, buildSettingsHooks, initHooks, mergeSettings } from '../../src/commands/hooks/init'
import { listHooks } from '../../src/commands/hooks/list'
import { removeHooks } from '../../src/commands/hooks/remove'
import { runImpactPreview } from '../../src/commands/impact-preview'
import { createInitCommand, runInit } from '../../src/commands/init'
import { buildUpgradePath, runMinimalInit } from '../../src/commands/init-minimal'
import { createInsightsCommand } from '../../src/commands/insights'
import { createInstallCommand, installSkillDir, offerGenerateSlashCommands, runBulkInstall, runInstall } from '../../src/commands/install'
import { createInstallConstraintsCommand, runInstallConstraints } from '../../src/commands/install-constraints'
import from '../../src/commands/integrations/add'
import from '../../src/commands/integrations/dismiss'
import from '../../src/commands/integrations/list'
import from '../../src/commands/integrations/remove'
import { SyncIO, runSyncIntegrations } from '../../src/commands/integrations/sync'
import { createGenerateCommand } from '../../src/commands/linter/generate'
import { createMaintenanceCommand } from '../../src/commands/maintenance'
import { MaintenanceRunDeps, aggregateReport, buildTaskRunner, createCheckRunner, createFixDispatcher, deriveExitCode, loadRunHistory, makeResolveBackend, parseConcurrency, renderTable, resolveHarnessSpawn, resolveSelection, runMaintenanceRun } from '../../src/commands/maintenance-run'
import { createMcpRefinementDemandCommand, formatCapabilitiesByPermission, formatCapabilitiesTable, formatRefinementDemand } from '../../src/commands/mcp'
import { extractNpmPackages, parseNpmSpec, runMcpGuardCheck } from '../../src/commands/mcp-guard'
import { detectLegacyArtifacts, runMigrate } from '../../src/commands/migrate'
import { runMigrateBackends } from '../../src/commands/migrate-backends'
import { refreshExitCode, runModelsApprove, runModelsProbe, runModelsProposals, runModelsRefresh, runModelsReject } from '../../src/commands/models'
import { OutcomeEvaluatorLike, buildOutcomeBody, deriveExitCode, emitOutcomeEvalCi, resolveSpecPath, runOutcomeEvalCi } from '../../src/commands/outcome-eval-ci'
import { createPerfCommand } from '../../src/commands/perf'
import { createPersonaCommand } from '../../src/commands/persona/index'
import { createListCommand } from '../../src/commands/persona/list'
import { BRIEF_MARKER, buildBriefBody, createPreMergeBriefCommand, findOutcomeVerdict, gatherGuardianSafe, gatherSignalsSafe, loadOutcomeStore, readReview, runPreMergeBrief, upsertComment } from '../../src/commands/pre-merge-brief'
import { createPredictCommand, runPredict } from '../../src/commands/predict'
import { actStatusCommand, runProposalsList, runProposalsReject, runProposalsShow, runProposalsStatus } from '../../src/commands/proposals'
import { createPublishAnalysesCommand } from '../../src/commands/publish-analyses'
import { runPulseRunCommand } from '../../src/commands/pulse/run'
import { createRecommendCommand, runRecommend } from '../../src/commands/recommend'
import { GIT_MAX_BUFFER_BYTES, assertKnownRunner, buildDegradedResult, buildDiffInfo, buildReviewBody, createReviewCiCommand, defaultRunGit, emitReviewCi, resolveDiffRange, runReviewCi } from '../../src/commands/review-ci'
import { createLocalInvoke } from '../../src/commands/review-ci-local-adapter'
import { referencesTargetPr, runRollbackEvaluate, runRollbackSweepCommand, summarizeSweepReport } from '../../src/commands/rollback'
import { runScanConfig } from '../../src/commands/scan-config'
import { createSearchCommand } from '../../src/commands/search'
import { configureTier0Integrations, runSetup } from '../../src/commands/setup'
import { ALL_MCP_TOOLS, CURSOR_CURATED_TOOLS, createSetupMcpCommand, runCursorToolPicker, setupMcp } from '../../src/commands/setup-mcp'
import { createShareCommand } from '../../src/commands/share'
import { createCreateCommand, runCreate } from '../../src/commands/skill/create'
import { createSkillCommand } from '../../src/commands/skill/index'
import { createInfoCommand } from '../../src/commands/skill/info'
import { collectSkills, createListCommand } from '../../src/commands/skill/list'
import { probeProviders, updateProviders } from '../../src/commands/skill/provider-update'
import { createPublishCommand, runPublish } from '../../src/commands/skill/publish'
import { createRunCommand } from '../../src/commands/skill/run'
import { createSearchCommand, runSearch } from '../../src/commands/skill/search'
import { createUpdateCommand } from '../../src/commands/skill/update'
import { createValidateCommand, validateSkillEntry } from '../../src/commands/skill/validate'
import { createSnapshotCommand, runSnapshotCapture } from '../../src/commands/snapshot'
import { createStaleConstraintsCommand } from '../../src/commands/stale-constraints'
import { createStateCommand } from '../../src/commands/state/index'
import { createShowCommand } from '../../src/commands/state/show'
import { createStreamsCommand } from '../../src/commands/state/streams'
import { createSyncAnalysesCommand, extractAnalysisFromComments } from '../../src/commands/sync-analyses'
import { runSyncMain } from '../../src/commands/sync-main'
import { createTaintCommand } from '../../src/commands/taint'
import { createTelemetryCommand } from '../../src/commands/telemetry'
import { ensureTelemetryConfigured, isTelemetryConfigured, writeTelemetryConfig } from '../../src/commands/telemetry-wizard'
import { createTelemetryCommand } from '../../src/commands/telemetry/index'
import { createTraceabilityCommand } from '../../src/commands/traceability'
import { createUninstallCommand, runUninstall } from '../../src/commands/uninstall'
import { runUninstallConstraints } from '../../src/commands/uninstall-constraints'
import { createUpdateCommand, detectPackageManager, detectPackageManagerFromPath, findAllInstalls, getActiveInstallDir, getInstalledPackages, getInstalledVersion, getInstalledVersions, getLatestVersion, getLatestVersionAsync, offerIntegrationsSync, offerSkillProviderUpdates } from '../../src/commands/update'
import { createUsageCommand } from '../../src/commands/usage'
import { createValidateCommand, runValidate } from '../../src/commands/validate'
import { runCrossCheck } from '../../src/commands/validate-cross-check'
import { SCOPED_WALKERS, deriveChangedSurface, filterToDesignSurface } from '../../src/commands/validate-scope'
import { createWaypointCommand } from '../../src/commands/waypoint'
import { resolveConfig } from '../../src/config/loader'
import { HarnessConfig } from '../../src/config/schema'
import { createProgram } from '../../src/index'
import { readMcpConfig, writeMcpEntry, writeOpencodeMcpEntry } from '../../src/integrations/config'
import { CATALOG_LAST_REVIEWED, INTEGRATION_REGISTRY } from '../../src/integrations/registry'
import { getToolDefinitions } from '../../src/mcp/index'
import { getToolDefinitions } from '../../src/mcp/server'
import { NETWORK_TOOL_NAMES, deriveScope, deriveToolCapabilities, deriveToolCapability } from '../../src/mcp/tool-capabilities'
import { TOOL_CAPABILITY_DECLARATIONS } from '../../src/mcp/tool-capability-declarations'
import { runAnatomyAudit, runComponentAnatomyAudit } from '../../src/mcp/tools/audit-anatomy'
import { runAuditBrand } from '../../src/mcp/tools/audit-brand'
import { runDesignCraft } from '../../src/mcp/tools/design-craft'
import { runDetectDrift } from '../../src/mcp/tools/detect-drift'
import { handleGetImpact } from '../../src/mcp/tools/graph/index'
import from '../../src/mcp/utils/graph-loader'
import { logger } from '../../src/output/logger'
import { prompt } from '../../src/output/prompt'
import { loadPersona } from '../../src/persona/loader'
import { runPersona } from '../../src/persona/runner'
import { getBundledSkillNames } from '../../src/registry/bundled-skills'
import { readLockfile, removeLockfileEntry, updateLockfileEntry, writeLockfile } from '../../src/registry/lockfile'
import { downloadTarball, fetchPackageMetadata, searchNpmRegistry } from '../../src/registry/npm-client'
import { findDependentsOf, resolveVersion } from '../../src/registry/resolver'
import { cleanupTempDir, extractTarball, placeSkillContent, removeSkillContent } from '../../src/registry/tarball'
import { validateForPublish } from '../../src/registry/validator'
import { ROLLBACK_EVENTS_FILE } from '../../src/rollback/breadcrumb'
import { SweepSignalRule } from '../../src/rollback/sweep'
import { HealthSnapshot, captureHealthSnapshot, isSnapshotFresh, loadCachedSnapshot } from '../../src/skill/health-snapshot'
import { loadOrRebuildIndex } from '../../src/skill/index-builder'
import { derivePackageJson } from '../../src/skill/package-json'
import { recommend } from '../../src/skill/recommendation-engine'
import { RecommendationResult } from '../../src/skill/recommendation-types'
import { CLIError, ExitCode } from '../../src/utils/errors'
import { markSetupComplete } from '../../src/utils/first-run'
import { CLI_VERSION } from '../../src/version'
import { VocabularyRule, formatViolations, scanFiles, scanText } from '../../src/vocabulary/scanner'
import * as clack from '@clack/prompts'
import { CiReviewResult, DiffInfo, Err, Ok, RefinementDemandReport, RollbackDecision, RunCiReviewOptions, SECURITY_SCAN_EXTENSIONS, SECURITY_SCAN_GLOB, applyFixes, archiveStream, buildSnapshot, checkTaint, clearTaint, createFixes, createProposal, createStream, detectDeadCode, detectDocDrift, extractBundle, generateSuggestions, listStreams, listTaintedSessions, loadStreamIndex, parseCiReviewVerdict, parseDiff, parseManifest, readAdoptionRecords, requestPeerReview, resetWaypointEmitterForTests, runReviewPipeline, setActiveStream, validateAgentConfigs, validateAgentsMap, validateKnowledgeMap, writeConfig } from '@harness-engineering/core'
import from '@harness-engineering/graph'
import { GUARDIAN_ANALYSIS_SCHEMA, GUARDIAN_ANALYSIS_VERSION, GuardianAnalysis, OutcomeVerdict } from '@harness-engineering/intelligence'
import { AnalysisRecord, MockBackend, RunMode, RunResult, SyncMainResult, TaskDefinition, renderAnalysisComment } from '@harness-engineering/orchestrator'
import { SignalResult, SignalsResult } from '@harness-engineering/signals'
import { SdlcEvent, TrackerComment } from '@harness-engineering/types'
import { execFileSync, execSync } from 'child_process'
import { Command } from 'commander'
import * as fs from 'fs'
import * as fs from 'fs/promises'
import { execFile, execFileSync, execSync, spawnSync } from 'node:child_process'
import * as fs, * as nodeFs, fs, { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import * as fs, { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import * as os, os, { tmpdir } from 'node:os'
import * as nodePath, * as path, path, { join } from 'node:path'
import { mockedSetTimeout } from 'node:timers'
import { fileURLToPath } from 'node:url'
import * as os from 'os'
import * as path, { join } from 'path'
import { MockedFunction, afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import YAML, { parseYaml, yamlParse } from 'yaml'
```
