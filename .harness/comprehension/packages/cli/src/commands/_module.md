---
schemaVersion: 1
module: 'packages/cli/src/commands'
sourceHash: '688682a07f92279f3991e14ca1ee341508fc07ff723df9d16193638c3183aa84'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    '_registry.ts',
    'add.ts',
    'adoption.ts',
    'advise-skills.test.ts',
    'advise-skills.ts',
    'align-design-system.ts',
    'api-craft.ts',
    'audit-protected.ts',
    'backfill-skill-provenance.ts',
    'blueprint.ts',
    'check-arch.ts',
    'check-deployment.ts',
    'check-deps.ts',
    'check-design.test.ts',
    'check-design.ts',
    'check-docs.ts',
    'check-harness-strength.ts',
    'check-operational-drift-action.test.ts',
    'check-operational-drift.test.ts',
    'check-operational-drift.ts',
    'check-perf.ts',
    'check-phase-gate.ts',
    'check-security.ts',
    'check-vocabulary.ts',
    'cleanup-sessions.ts',
    'cleanup.ts',
    'cli-ergonomics-craft.ts',
    'code-craft.ts',
    'comprehend.test.ts',
    'comprehend.ts',
    'comprehension-merge-driver.ts',
    'copy-craft.ts',
    'create-skill.ts',
    'cross-check.ts',
    'dashboard.ts',
    'design-pipeline.ts',
    'distortion.ts',
    'docs-craft.ts',
    'doctor.ts',
    'fix-drift.ts',
    'generate-agent-definitions.ts',
    'generate-slash-commands.ts',
    'generate.ts',
    'holiday-confidence.ts',
    'impact-preview.ts',
    'init-minimal.ts',
    'init.ts',
    'insights.ts',
    'install-constraints.ts',
    'install.ts',
    'knowledge-craft.ts',
    'knowledge-pipeline.test.ts',
    'knowledge-pipeline.ts',
    'maintenance-config.test.ts',
    'maintenance-config.ts',
    'maintenance-run.ts',
    'maintenance.test.ts',
    'maintenance.ts',
    'mcp-guard.ts',
    'mcp.ts',
    'migrate-backends.ts',
    'migrate.ts',
    'models-drift.test.ts',
    'models.ts',
    'naming-craft.ts',
    'operational-drift.test.ts',
    'operational-drift.ts',
    'orchestrator-black-box.test.ts',
    'orchestrator-black-box.ts',
    'orchestrator.ts',
    'outcome-eval-ci.ts',
    'perf.ts',
    'pre-merge-brief.ts',
    'predict.ts',
    'proposals.ts',
    'publish-analyses.ts',
    'recommend.ts',
    'rehearse.test.ts',
    'rehearse.ts',
    'release-inventory.test.ts',
    'release-inventory.ts',
    'review-ci-local-adapter.ts',
    'review-ci.ts',
    'rework.test.ts',
    'rework.ts',
    'rollback.ts',
    'scan-config.ts',
    'search.ts',
    'security-craft.ts',
    'setup-mcp.ts',
    'setup-types.ts',
    'setup.ts',
    'share.ts',
    'skill-regression.test.ts',
    'skill-regression.ts',
    'snapshot.ts',
    'spec-craft.ts',
    'stale-constraints.ts',
    'sync-analyses.ts',
    'sync-main.ts',
    'taint.ts',
    'telemetry-wizard.ts',
    'test-craft.ts',
    'traceability.ts',
    'uninstall-constraints.ts',
    'uninstall.ts',
    'update.ts',
    'usage.ts',
    'validate-cross-check.ts',
    'validate-scope.ts',
    'validate.ts',
    'verify.test.ts',
    'verify.ts',
  ]
---

## Interface Contract

```ts
export ALL_MCP_TOOLS
export BRIEF_MARKER
export CLEANUP_TARGETS
export CURSOR_CURATED_TOOLS
export DEFAULT_FIXTURES_DIR
export DEFAULT_OPERATIONAL_DRIFT_POLICY
export GIT_MAX_BUFFER_BYTES
export OUTCOME_BLOCK_ON_LEVELS
export SCOPED_WALKERS
export SKILL_REGRESSION_BLOCK_ON
export ScanConfigFileResult
export ScanConfigFinding
export ScanConfigResult
export StepResult
export actStatusCommand
export aggregateReport
export assertKnownRunner
export buildBriefBody
export buildDegradedResult
export buildDiffInfo
export buildOutcomeBody
export buildReviewBody
export buildSkillRegressionBody
export buildTaskRunner
export buildUpgradePath
export changedThresholdPaths
export checkBaselineFreshness
export checkCatalogFreshness
export checkHookValidity
export checkLivePings
export checkSessionCorruption
export collectChangedFiles
export commandCreators
export configureTier0Integrations
export createAddCommand
export createAdoptionCommand
export createAdviseSkillsCommand
export createAlignDesignSystemCommand
export createApiCraftCommand
export createAuditProtectedCommand
export createBackendsSubcommand
export createBackfillSkillProvenanceCommand
export createBlackBoxCommand
export createBlueprintCommand
export createCheckArchCommand
export createCheckDeploymentCommand
export createCheckDepsCommand
export createCheckDesignCommand
export createCheckDocsCommand
export createCheckHarnessStrengthCommand
export createCheckOperationalDriftCommand
export createCheckPerfCommand
export createCheckPhaseGateCommand
export createCheckRunner
export createCheckSecurityCommand
export createCheckVocabularyCommand
export createCleanupCommand
export createCleanupSessionsCommand
export createCliErgonomicsCraftCommand
export createCodeCraftCommand
export createCommandExecutor
export createComprehendCommand
export createComprehensionMergeDriverCommand
export createCopyCraftCommand
export createCreateSkillCommand
export createCrossCheckCommand
export createDashboardCommand
export createDesignPipelineCommand
export createDistortionCommand
export createDocsCraftCommand
export createDoctorCommand
export createFixDispatcher
export createFixDriftCommand
export createFsPort
export createGenerateAgentDefinitionsCommand
export createGenerateCommand
export createGenerateSlashCommandsCommand
export createGhSeam
export createGitPort
export createHolidayConfidenceCommand
export createImpactPreviewCommand
export createInitCommand
export createInsightsCommand
export createInstallCommand
export createInstallConstraintsCommand
export createKnowledgeCraftCommand
export createKnowledgePipelineCommand
export createLocalInvoke
export createMaintenanceCommand
export createMcpCommand
export createMcpContextReportCommand
export createMcpGuardCommand
export createMcpListCapabilitiesCommand
export createMcpRefinementDemandCommand
export createMigrateCommand
export createModelsCommand
export createNamingCraftCommand
export createOrchestratorCommand
export createOutcomeEvalCiCommand
export createPerfCommand
export createPreMergeBriefCommand
export createPredictCommand
export createProposalsCommand
export createPublishAnalysesCommand
export createRecommendCommand
export createRehearseCommand
export createReleaseInventoryCommand
export createReviewCiCommand
export createReworkCommand
export createRollbackCommand
export createScanConfigCommand
export createSearchCommand
export createSecurityCraftCommand
export createSetupCommand
export createSetupMcpCommand
export createShareCommand
export createSkillRegressionCommand
export createSnapshotCommand
export createSpecCraftCommand
export createStaleConstraintsCommand
export createSyncAnalysesCommand
export createSyncMainCommand
export createTaintCommand
export createTestCraftCommand
export createTraceabilityCommand
export createUninstallCommand
export createUninstallConstraintsCommand
export createUpdateCommand
export createUsageCommand
export createValidateCommand
export createVerifyCommand
export deepEqual
export defaultPostBrief
export defaultRunGit
export deriveChangedSurface
export deriveExitCode
export detectLegacyArtifacts
export detectOperationalDrift
export detectPackageManager
export detectPackageManagerFromPath
export emitOutcomeEvalCi
export emitReviewCi
export ensureTelemetryConfigured
export extractAnalysisFromComments
export extractNpmPackages
export filterToDesignSurface
export findAllInstalls
export findOutcomeVerdict
export formatCapabilitiesByPermission
export formatCapabilitiesTable
export formatCompiledUnits
export formatContextReport
export formatRefinementDemand
export gatherGuardianSafe
export gatherSignalsSafe
export generateAgentDefinitions
export generateSkillFiles
export generateSlashCommands
export getActiveInstallDir
export getByPath
export getInstalledPackages
export getInstalledVersion
export getInstalledVersions
export getLatestVersion
export getLatestVersionAsync
export handleOrphanDeletion
export installSkillDir
export isCatalogStale
export isTelemetryConfigured
export loadAgentBackends
export loadFixtures
export loadMaintenanceConfig
export loadOutcomeStore
export loadRunHistory
export makeResolveBackend
export mergeResolvedTasks
export normalizeRel
export offerGenerateSlashCommands
export offerIntegrationsSync
export offerSkillProviderUpdates
export parseConcurrency
export parseNpmSpec
export printMinimalInitSuccess
export readReview
export referencesTargetPr
export refreshExitCode
export renderTable
export resolveBaseRef
export resolveCandidates
export resolveChangedScope
export resolveCommunityBase
export resolveCompileProvider
export resolveDiffRange
export resolveHarnessSpawn
export resolveMode
export resolveSelection
export resolveSkillSources
export resolveSpecPath
export resolveStaticOnlyPosture
export runAdd
export runAdviseSkills
export runAuditProtected
export runBackfillSkillProvenance
export runBulkInstall
export runCheckArch
export runCheckDeployment
export runCheckDeps
export runCheckDesign
export runCheckDocs
export runCheckHarnessStrength
export runCheckOperationalDrift
export runCheckPerf
export runCheckPhaseGate
export runCheckSecurity
export runCheckVocabulary
export runCleanup
export runCleanupAll
export runCleanupSessions
export runCrossCheck
export runCursorToolPicker
export runDoctor
export runFixDrift
export runImpactPreview
export runInit
export runInstall
export runInstallConstraints
export runMaintenanceRun
export runMcpGuardCheck
export runMigrate
export runMigrateBackends
export runMinimalInit
export runModelsApprove
export runModelsDrift
export runModelsProbe
export runModelsProposals
export runModelsRefresh
export runModelsReject
export runOutcomeEvalCi
export runPreMergeBrief
export runPredict
export runProposalsList
export runProposalsReject
export runProposalsShow
export runProposalsStatus
export runRecommend
export runReleaseInventory
export runReviewCi
export runReworkCommand
export runRollbackEvaluate
export runRollbackSweepCommand
export runScanConfig
export runSetup
export runSkillRegression
export runSnapshotCapture
export runSyncMain
export runTelemetryWizard
export runUninstall
export runUninstallConstraints
export runValidate
export runVerify
export setupMcp
export stageCompiledUnits
export summarizeSweepReport
export upsertComment
export writeTelemetryConfig
```

## Dependency Slice

```
import { AgentDefinition, generateAgentDefinition } from '../agent-definitions/generator'
import { renderClaudeCodeAgent } from '../agent-definitions/render-claude-code'
import { renderCodexAgent } from '../agent-definitions/render-codex'
import { renderCursorAgent } from '../agent-definitions/render-cursor'
import { renderGeminiAgent } from '../agent-definitions/render-gemini-cli'
import { AlignDesignSystemOutput, AlignInput, FixOutcome, runAlignDesignSystem } from '../align/index.js'
import { ApiCraftInput, ApiCraftOutput, runApiCraft } from '../api-craft/index.js'
import { AnatomyFinding } from '../audit/component-anatomy/findings/finding'
import { BrandFinding } from '../brand/findings/finding'
import { CliErgonomicsCraftInput, CliErgonomicsCraftOutput, runCliErgonomicsCraft } from '../cli-ergonomics-craft/index.js'
import { CodeCraftInput, CodeCraftOutput, runCodeCraft } from '../code-craft/index.js'
import { ComprehendRunResult, runComprehend, runComprehendCheck, runComprehendStats } from '../comprehension/compile-run'
import { comprehensionCli, comprehensionEndpoint, readComprehensionConfig, resolveComprehensionCiMode, selectSemanticModel } from '../comprehension/config'
import { maybeCreateGenerateSemantic } from '../comprehension/generate-semantic'
import { shouldRunComprehendHook } from '../comprehension/hook'
import { enumerateModules, filesToModules } from '../comprehension/invalidation'
import { committedSemanticAllowed } from '../comprehension/policy'
import { RefreshJobGateReason, explainInactiveRefreshGate, resolveRefreshJobGate } from '../comprehension/refresh-gate'
import { RegressionContext, defaultRefReadDeps, detectCommittedSemanticOnBranch, detectSemanticRegressions, readSemanticMapAtRef } from '../comprehension/regression'
import { createStaticExtractor } from '../comprehension/static-extractor'
import { loadAnalysisExclude, loadDesignExclude } from '../config/analysis-schema.js'
import { findConfigFile, loadConfig, resolveConfig } from '../config/loader'
import { BranchingConfigSchema, ComprehensionConfig, HarnessConfig, VocabularyConfigSchema, loadDepsExclude } from '../config/schema'
import { CopyCraftInput, CopyCraftOutput, CopySurface, runCopyCraft } from '../copy-craft/index.js'
import { CraftFinding } from '../design-craft/findings/schema'
import { DesignPipelineContext, DesignPipelineInput, runDesignPipeline } from '../design-pipeline/index.js'
import { DocsCraftInput, DocsCraftOutput, runDocsCraft } from '../docs-craft/index.js'
import { DriftFinding } from '../drift/findings/finding'
import { DriftStrictness } from '../drift/findings/finding.js'
import { runComprehensionMergeDriver } from '../git/comprehension-merge-driver'
import { configureComprehensionMergeDriver, configureMergeOursDriver } from '../git/merge-driver-setup'
import { HookProfile } from '../hooks/profiles'
import { readIntegrationsConfig, readMcpConfig, writeMcpEntry, writeOpencodeMcpEntry } from '../integrations/config'
import { reconcileIntegrations } from '../integrations/reconcile'
import { CATALOG_LAST_REVIEWED, INTEGRATION_REGISTRY } from '../integrations/registry'
import { writeTomlMcpEntry } from '../integrations/toml'
import { KnowledgeCraftInput, KnowledgeCraftOutput, runKnowledgeCraft } from '../knowledge-craft/index.js'
import from '../mcp/context-surface.js'
import from '../mcp/index.js'
import { ToolCapability, ToolScope } from '../mcp/tool-capabilities.js'
import { McpToolTier } from '../mcp/tool-tiers.js'
import { AuditAnatomyOutput, runAnatomyAudit, runComponentAnatomyAudit } from '../mcp/tools/audit-anatomy'
import { runAuditBrand } from '../mcp/tools/audit-brand'
import { runDesignCraft } from '../mcp/tools/design-craft'
import { runDetectDrift } from '../mcp/tools/detect-drift'
import { handleGetImpact } from '../mcp/tools/graph/index'
import { runInstructionDensityAudit } from '../mcp/tools/instruction-density'
import from '../mcp/tools/refinement-telemetry.js'
import { resolveAnalysisProvider } from '../mcp/utils/analysis-provider'
import { loadGraphStore } from '../mcp/utils/graph-loader'
import { IdentifierKind, NamingCraftInput, NamingCraftOutput, runNamingCraft } from '../naming-craft/index.js'
import { OutputFormatter, OutputMode, OutputModeType } from '../output/formatter'
import { logger } from '../output/logger'
import { prompt } from '../output/prompt'
import { listPersonas, loadPersona } from '../persona/loader'
import { getBundledSkillNames } from '../registry/bundled-skills'
import { isFreshnessCheckEnabled } from '../registry/freshness-checker'
import { LockfileEntry, SkillSource, readLockfile, removeLockfileEntry, updateLockfileEntry, writeLockfile } from '../registry/lockfile'
import { downloadTarball, extractSkillName, fetchPackageMetadata, readNpmrcToken, resolvePackageName } from '../registry/npm-client'
import { findDependentsOf, resolveVersion } from '../registry/resolver'
import { cleanupTempDir, extractTarball, placeSkillContent, removeSkillContent } from '../registry/tarball'
import { appendRollbackEvent, linkRollbackEventToGraph } from '../rollback/breadcrumb'
import { ComposeGhSeam, ROLLBACK_LABEL, composeRevertPr } from '../rollback/compose'
import { createNodeRollbackIO } from '../rollback/io'
import { SweepSignalReport, SweepSignalRule, createPrResolver, createTimelineReader, runRollbackSweep } from '../rollback/sweep'
import { SecurityCraftInput, SecurityCraftOutput, runSecurityCraft } from '../security-craft/index.js'
import { SETUP_CLIENTS } from '../setup/clients'
import { CraftScanTally, formatCraftDiagnostic } from '../shared/craft/diagnostics.js'
import { findOrchestratorMd, readBackendsFromOrchestratorMd } from '../shared/craft/llm/orchestrator-md'
import { CraftLlmResolution, resolveCraftLlmConfig } from '../shared/craft/llm/provider.js'
import { matchContent } from '../skill/content-matcher'
import { ContentMatchResult, SkillMatch } from '../skill/content-matcher-types'
import { HealthSnapshot, captureHealthSnapshot, isSnapshotFresh, loadCachedSnapshot } from '../skill/health-snapshot'
import { loadOrRebuildIndex } from '../skill/index-builder'
import { recommend } from '../skill/recommendation-engine'
import { Recommendation, RecommendationResult } from '../skill/recommendation-types'
import { ALLOWED_COGNITIVE_MODES, SkillAddress, SkillMetadataSchema } from '../skill/schema'
import { extractSignals } from '../skill/signal-extractor'
import { generateSkillsMd } from '../skill/skills-md-writer'
import { SkillSource, normalizeSkills } from '../slash-commands/normalize'
import { renderClaudeCode } from '../slash-commands/render-claude-code'
import { renderCodexAgentsMd } from '../slash-commands/render-codex'
import { renderCursor } from '../slash-commands/render-cursor'
import { renderCursorCommand } from '../slash-commands/render-cursor-command'
import { renderGemini } from '../slash-commands/render-gemini'
import { applySyncPlan, computeSyncPlan } from '../slash-commands/sync'
import { computeCodexSync, detectLegacyCodexOrphans } from '../slash-commands/sync-codex'
import { GenerateOptions, Platform, SlashCommandSpec, VALID_PLATFORMS } from '../slash-commands/types'
import { SpecCraftInput, SpecCraftOutput, SpecKind, runSpecCraft } from '../spec-craft/index.js'
import { DetectedFramework, TemplateEngine } from '../templates/engine'
import { appendFrameworkAgents, applyEcosystemAfterCreate, ensureComprehensionSearchIgnore, ensureHarnessGitignore, persistToolingConfig } from '../templates/post-write'
import { TemplateMetadata } from '../templates/schema'
import { TestCraftInput, TestCraftOutput, TestFramework, runTestCraft } from '../test-craft/index.js'
import { mapWithConcurrency } from '../utils/concurrency'
import { envEnabled } from '../utils/env-flag.js'
import { CLIError, ExitCode, ExitCodeType, handleError } from '../utils/errors'
import { findFiles } from '../utils/files'
import { markSetupComplete } from '../utils/first-run'
import { checkNode } from '../utils/node-version'
import { resolveOutputMode } from '../utils/output'
import { resolveCommunitySkillsDir, resolveGlobalCommunityBaseDir, resolveGlobalCommunitySkillsDir, resolveGlobalSkillsDir, resolvePersonasDir, resolveProjectSkillsDir, resolveSkillsDir, resolveTemplatesDir } from '../utils/paths'
import { CLI_VERSION } from '../version'
import { Violation, formatViolations, resolveScanFiles, scanFiles } from '../vocabulary/scanner'
import { createAddCommand } from './add'
import { createAdoptionCommand } from './adoption'
import { createAdviseSkillsCommand, runAdviseSkills } from './advise-skills'
import { createAgentCommand } from './agent'
import { createAlignDesignSystemCommand } from './align-design-system'
import { createApiCraftCommand } from './api-craft'
import { createAuditProtectedCommand } from './audit-protected'
import { createBackfillSkillProvenanceCommand } from './backfill-skill-provenance'
import { createBlueprintCommand } from './blueprint'
import { createBurnCommand } from './burn'
import { createCheckArchCommand } from './check-arch'
import { createCheckDeploymentCommand } from './check-deployment'
import { createCheckDepsCommand } from './check-deps'
import { createCheckDesignCommand, runCheckDesign } from './check-design'
import { createCheckDocsCommand } from './check-docs'
import { createCheckHarnessStrengthCommand } from './check-harness-strength'
import { RunGit, collectChangedFiles, createCheckOperationalDriftCommand, resolveBaseRef, runCheckOperationalDrift } from './check-operational-drift'
import { createCheckPerfCommand } from './check-perf'
import { createCheckPhaseGateCommand } from './check-phase-gate'
import { createCheckSecurityCommand } from './check-security'
import { createCheckVocabularyCommand } from './check-vocabulary'
import { createCICommand } from './ci'
import { generateCIConfig } from './ci/init'
import { createCleanupCommand } from './cleanup'
import { createCleanupSessionsCommand } from './cleanup-sessions'
import { createCliErgonomicsCraftCommand } from './cli-ergonomics-craft'
import { createCodeCraftCommand } from './code-craft'
import { createCompoundCommand } from './compound'
import { createComprehendCommand, formatCompiledUnits, resolveChangedScope, resolveCompileProvider, resolveMode, resolveStaticOnlyPosture, stageCompiledUnits } from './comprehend'
import { createComprehensionMergeDriverCommand } from './comprehension-merge-driver'
import { createContextDictionaryCommand } from './context-dictionary'
import { createCopyCraftCommand } from './copy-craft'
import { createCreateSkillCommand } from './create-skill'
import { createCrossCheckCommand } from './cross-check'
import { createDashboardCommand } from './dashboard'
import { createDesignPipelineCommand } from './design-pipeline'
import { createDistortionCommand } from './distortion'
import { createDocsCraftCommand } from './docs-craft'
import { createDocsPublishCommand } from './docs-publish'
import { createDoctorCommand } from './doctor'
import { createFixDriftCommand } from './fix-drift'
import { createFleetCommand } from './fleet'
import { createGatewayCommand } from './gateway'
import { createGenerateCommand } from './generate'
import { createGenerateAgentDefinitionsCommand, generateAgentDefinitions } from './generate-agent-definitions'
import { createGenerateSlashCommandsCommand, generateSlashCommands, handleOrphanDeletion } from './generate-slash-commands'
import { createGoldenBuildCommand } from './golden-build'
import { createGraphCommand } from './graph'
import from './graph/scan.js'
import { createHolidayConfidenceCommand } from './holiday-confidence'
import { createHooksCommand } from './hooks'
import { initHooks } from './hooks/init'
import { createImpactPreviewCommand } from './impact-preview'
import { createInitCommand } from './init'
import { printMinimalInitSuccess, runMinimalInit } from './init-minimal'
import { createInsightsCommand } from './insights'
import { createInstallCommand, resolveCommunityBase } from './install'
import { createInstallConstraintsCommand } from './install-constraints'
import { createIntegrationsCommand } from './integrations'
import { readConfiguredServers } from './integrations/sync'
import { createKnowledgeCommand } from './knowledge'
import { createKnowledgeCraftCommand } from './knowledge-craft'
import { createKnowledgePipelineCommand } from './knowledge-pipeline'
import { createLearningsCommand } from './learnings'
import { createLinterCommand } from './linter'
import { createMaintenanceCommand } from './maintenance'
import { loadAgentBackends, loadMaintenanceConfig, mergeResolvedTasks } from './maintenance-config'
import { runMaintenanceRun } from './maintenance-run'
import { createMcpCommand, createMcpContextReportCommand, createMcpListCapabilitiesCommand, createMcpRefinementDemandCommand } from './mcp'
import { createMcpGuardCommand } from './mcp-guard'
import { createMigrateCommand, detectLegacyArtifacts } from './migrate'
import { createBackendsSubcommand } from './migrate-backends'
import { createModelsCommand, runModelsDrift } from './models'
import { createNamingCraftCommand } from './naming-craft'
import { createNotificationsCommand } from './notifications'
import { DEFAULT_OPERATIONAL_DRIFT_POLICY, OperationalDriftFinding, OperationalDriftPolicy, OperationalDriftSeverity, changedThresholdPaths, deepEqual, detectOperationalDrift, getByPath, normalizeRel } from './operational-drift'
import { createOrchestratorCommand } from './orchestrator'
import { createBlackBoxCommand } from './orchestrator-black-box'
import { createOutcomeEvalCiCommand } from './outcome-eval-ci'
import { createPerfCommand } from './perf'
import { createPersonaCommand } from './persona'
import { createPreMergeBriefCommand } from './pre-merge-brief'
import { createPredictCommand } from './predict'
import { createProposalsCommand } from './proposals'
import { createPublishAnalysesCommand } from './publish-analyses'
import { createPulseCommand } from './pulse'
import { createRecommendCommand } from './recommend'
import { createRehearseCommand } from './rehearse'
import { RunGit, createFsPort, createGitPort, createReleaseInventoryCommand, runReleaseInventory } from './release-inventory'
import { RunGit, buildDiffInfo, createReviewCiCommand, resolveDiffRange } from './review-ci'
import { createLocalInvoke } from './review-ci-local-adapter'
import { createReworkCommand, runReworkCommand } from './rework'
import { createRoadmapCommand } from './roadmap'
import { createRollbackCommand } from './rollback'
import { createRoutingCommand } from './routing'
import { createRulesCommand } from './rules'
import { createScanConfigCommand } from './scan-config'
import { createSearchCommand } from './search'
import { createSecurityCraftCommand } from './security-craft'
import { createSetupCommand } from './setup'
import { createSetupMcpCommand, setupMcp } from './setup-mcp'
import { StepResult } from './setup-types'
import { createShareCommand } from './share'
import { createSkillCommand } from './skill'
import { LoadedFixture, SkillRegressionEvaluatorLike, buildSkillRegressionBody, createSkillRegressionCommand, deriveExitCode, resolveCandidates, runSkillRegression } from './skill-regression'
import { probeProviders, updateProviders } from './skill/provider-update'
import { createSnapshotCommand } from './snapshot'
import { createSpecCraftCommand } from './spec-craft'
import { createStaleConstraintsCommand } from './stale-constraints'
import { createStateCommand } from './state'
import { createSyncAnalysesCommand } from './sync-analyses'
import { createSyncMainCommand } from './sync-main'
import { createTaintCommand } from './taint'
import { createTelemetryCommand } from './telemetry'
import { ensureTelemetryConfigured } from './telemetry-wizard'
import { createTestCraftCommand } from './test-craft'
import { createTraceabilityCommand } from './traceability'
import { createUninstallCommand } from './uninstall'
import { createUninstallConstraintsCommand } from './uninstall-constraints'
import { createUpdateCommand } from './update'
import { createUsageCommand } from './usage'
import { createValidateCommand } from './validate'
import { runCrossCheck } from './validate-cross-check'
import { ChangedSurface, SCOPED_WALKERS, deriveChangedSurface, filterToDesignSurface } from './validate-scope'
import { createVerifyCommand, runVerify } from './verify'
import * as clack from '@clack/prompts'
import { AdjustedForecast, AgentConfigValidation, AllowanceFilteredDiff, AnnotationIssue, ArchAllowance, ArchAllowanceSchema, ArchBaseline, ArchBaselineManager, ArchConfig, ArchConfigSchema, ArchDiffResult, ArchMetricCategory, AuditResult, BaselineManager, BlueprintGenerator, BranchingConfig, Bundle, BundleSchema, CI_ASSESSMENTS, COMPREHENSION_ROOT, CiBlockOn, CiReviewResult, ComprehensionStore, ConflictReport, ConstraintNodeStore, Contributions, CriticalPathResolver, DEFAULT_RELEASE_INVENTORY_THRESHOLDS, DeploymentExitCode, DeploymentFsPort, DeploymentGateConfig, DeploymentGateResult, DetectStaleResult, DiffInfo, DriftConfig, EntropyAnalyzer, EntropyConfig, Err, HarnessStrengthAuditor, InjectionFinding, LayerConfig, ListProposalsOptions, LocalEndpointInvoke, Lockfile, LockfilePackage, MetricResult, ModelDriftResult, Ok, OsvAdvisory, OsvCheckResult, PatternConfig, PredictionEngine, PredictionResult, PredictionWarning, ProjectScanner, Proposal, ProposalStatus, ProtectedRegion, RUNNER_PRESETS, RawBackendsMap, RecoveryRecordSchema, RehearsalManifest, RehearsalScore, ReleaseChannel, ReleaseInventoryFsPort, ReleaseInventoryGitPort, ReleaseInventoryResult, ReleaseInventoryThresholds, ReleaseTag, Result, ReworkReport, RoadmapMeta, RollbackDecision, RollbackIO, RunCiReviewOptions, RunnerId, SECURITY_SCAN_DEFAULT_IGNORE, SECURITY_SCAN_GLOB, ScanConfigFileResult, ScanConfigFinding, ScanConfigResult, SecurityFinding, SecurityScanner, SecuritySeverity, SecurityTimelineManager, SentinelRecord, Severity, SpecImpactEstimator, StrengthFinding, TimelineManager, TimelineSnapshot, TrendLine, TrendResult, TypeScriptParser, UnreleasedCommit, Violation, acknowledgeModelDrift, addProvenance, applyFixes, archAllowanceSlug, archAllowancesDir, buildCiReviewVerdict, buildSnapshot, checkDocCoverage, checkRoadmapAggregateDrift, checkRoadmapHealth, checkTaint, classifyRevert, clearTaint, computeOverallSeverity, computeReleaseInventory, computeRework, computeScanExitCode, createFixes, createNodeComprehensionIO, createNodeModuleSourceReader, createNodeRoadmapIO, createOsvClient, createTrackerClient, deepMergeConstraints, defineLayer, deriveDeploymentExitCode, detectCircularDepsInFiles, detectDeadCode, detectDeploymentSurface, detectDocDrift, detectRoadmapStorageMode, detectStaleConstraints, diff, evaluateDeploymentGate, evaluateModelSentinel, evaluateReleaseInventory, extractBundle, filterDiffByAllowances, findFixture, generateAgentsMap, generateSuggestions, getProposal, hasUnacknowledgedMaterialDrift, invalidateCheckState, isWholeSnapshotContext, listProposals, listTaintedSessions, loadArchAllowances, loadCatalog, loadProjectRoadmapMode, loadTrackerClientConfigFromProject, loadTrackerSyncConfig, mapInjectionFindings, mapSecurityFindings, needsMergeOursDriverWarning, parseDiff, parseFileRegions, parseManifest, parseRoadmap, parseSecurityConfig, plannedIssuesFromExternalIds, readLockfile, readSentinelHistory, regenerate, removeContributions, removeProvenance, resolveArchBaseline, resolveRoadmapStore, roadmapSourceExists, runAll, runCiReview, scanForInjection, scoreRecovery, serializeMeta, updateProposal, validateAgentConfigs, validateAgentsMap, validateBranchName, validateDecisionNumbers, validateDependencies, validateKnowledgeMap, validatePulseConfig, validateRoadmapMode, validateSolutionsDir, validateStrategy, writeArchAllowance, writeConfig, writeLockfile } from '@harness-engineering/core'
import { CraftFindingRecord, DEFAULT_SKIP_DIRS, DesignConstraintAdapter, GraphStore, KnowledgePipelineResult, NodeType, skipDirGlobs } from '@harness-engineering/graph'
import { AbandonedSkill, AnalysisProvider, FailingSkill, GuardianAnalysis, OpenAICompatibleAnalysisProvider, OutcomeVerdict, SkillEffectivenessScore, SkillRegressionFixture, SkillRegressionVerdict, guardianFileLines, guardianFlags, readGuardianAnalyses, summarizeGuardian } from '@harness-engineering/intelligence'
import { AgentDispatcher, AnalysisRecord, BUILT_IN_TASKS, CheckCommandRunner, CheckScriptRunner, CommandExecutor, FlightRecorder, MAINTENANCE_CHECK_MAX_BUFFER, MAINTENANCE_CHECK_TIMEOUT_MS, MaintenanceReporter, Orchestrator, PersistedOutputEntry, RunMode, RunRecord, RunResult, SyncMainResult, TaskDefinition, TaskOutputStore, TaskRunner, TaskSelectionFilter, UnitVerdict, WorkflowLoader, createAgentDispatcher, defaultFetchModels, defaultSyncMain, discoverCandidates, launchTUI, loadPublishedIndex, makeBackendResolver, migrateAgentConfig, renderAnalysisComment, runHarnessCheck, savePublishedIndex, selectTasks } from '@harness-engineering/orchestrator'
import { HolidayConfidenceResult, OutcomeQueryStore, SignalResult, SignalsResult, computeHolidayConfidence, gatherSignals } from '@harness-engineering/signals'
import { AgentBackend, AgentConfig, BackendDef, CustomTaskDefinition, INDEXED_FILE_KINDS, INSIGHTS_KEYS, IndexedFileKind, InsightsKey, InsightsReport, MaintenanceConfig, Result, SkillAdoptionSummary, TrackerComment, UsageRecord, formatFindingsContract } from '@harness-engineering/types'
import chalk from 'chalk'
import { execFileSync, execSync } from 'child_process'
import { Command, InvalidArgumentError, Option, OptionValues } from 'commander'
import * as fs from 'fs'
import * as fs from 'fs/promises'
import { glob } from 'glob'
import { minimatch } from 'minimatch'
import { execFile, execFileSync, execSync, spawn, spawnSync } from 'node:child_process'
import * as fs, fs, { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import from 'node:fs/promises'
import { createRequire } from 'node:module'
import * as os, os, { tmpdir } from 'node:os'
import * as path, path, { dirname, join, relative, resolve } from 'node:path'
import readline from 'node:readline'
import { setTimeout } from 'node:timers'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import * as os from 'os'
import * as path from 'path'
import from 'prettier'
import * as readline from 'readline'
import semver from 'semver'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import YAML, { parseYaml, stringifyYaml, yamlParse } from 'yaml'
import { z } from 'zod'
```
