// AUTO-GENERATED — do not edit. Run `pnpm run generate-barrel-exports` to regenerate.

import type { Command } from 'commander';

import { createAddCommand } from './add';
import { createAdoptionCommand } from './adoption';
import { createAdviseSkillsCommand } from './advise-skills';
import { createAgentCommand } from './agent';
import { createAlignDesignSystemCommand } from './align-design-system';
import { createAuditProtectedCommand } from './audit-protected';
import { createBackfillSkillProvenanceCommand } from './backfill-skill-provenance';
import { createBlueprintCommand } from './blueprint';
import { createCheckArchCommand } from './check-arch';
import { createCheckDepsCommand } from './check-deps';
import { createCheckDesignCommand } from './check-design';
import { createCheckDocsCommand } from './check-docs';
import { createCheckHarnessStrengthCommand } from './check-harness-strength';
import { createCheckPerfCommand } from './check-perf';
import { createCheckPhaseGateCommand } from './check-phase-gate';
import { createCheckSecurityCommand } from './check-security';
import { createCICommand } from './ci';
import { createCleanupCommand } from './cleanup';
import { createCleanupSessionsCommand } from './cleanup-sessions';
import { createCompoundCommand } from './compound';
import { createCopyCraftCommand } from './copy-craft';
import { createCreateSkillCommand } from './create-skill';
import { createCrossCheckCommand } from './cross-check';
import { createDashboardCommand } from './dashboard';
import { createDesignPipelineCommand } from './design-pipeline';
import { createDoctorCommand } from './doctor';
import { createFixDriftCommand } from './fix-drift';
import { createGatewayCommand } from './gateway';
import { createGenerateAgentDefinitionsCommand } from './generate-agent-definitions';
import { createGenerateCommand } from './generate';
import { createGenerateSlashCommandsCommand } from './generate-slash-commands';
import { createGraphCommand } from './graph';
import { createHooksCommand } from './hooks';
import { createImpactPreviewCommand } from './impact-preview';
import { createInitCommand } from './init';
import { createInsightsCommand } from './insights';
import { createInstallCommand } from './install';
import { createInstallConstraintsCommand } from './install-constraints';
import { createIntegrationsCommand } from './integrations';
import { createKnowledgeCraftCommand } from './knowledge-craft';
import { createKnowledgePipelineCommand } from './knowledge-pipeline';
import { createLearningsCommand } from './learnings';
import { createLinterCommand } from './linter';
import { createMaintenanceCommand } from './maintenance';
import { createMcpCommand } from './mcp';
import { createMcpGuardCommand } from './mcp-guard';
import { createMigrateCommand } from './migrate';
import { createModelsCommand } from './models';
import { createNamingCraftCommand } from './naming-craft';
import { createNotificationsCommand } from './notifications';
import { createOrchestratorCommand } from './orchestrator';
import { createPerfCommand } from './perf';
import { createPersonaCommand } from './persona';
import { createPredictCommand } from './predict';
import { createPreMergeBriefCommand } from './pre-merge-brief';
import { createProposalsCommand } from './proposals';
import { createPublishAnalysesCommand } from './publish-analyses';
import { createPulseCommand } from './pulse';
import { createRecommendCommand } from './recommend';
import { createReviewCiCommand } from './review-ci';
import { createRoadmapCommand } from './roadmap';
import { createRoutingCommand } from './routing';
import { createScanConfigCommand } from './scan-config';
import { createSearchCommand } from './search';
import { createSecurityCraftCommand } from './security-craft';
import { createSetupCommand } from './setup';
import { createSetupMcpCommand } from './setup-mcp';
import { createShareCommand } from './share';
import { createSkillCommand } from './skill';
import { createSnapshotCommand } from './snapshot';
import { createSpecCraftCommand } from './spec-craft';
import { createStaleConstraintsCommand } from './stale-constraints';
import { createStateCommand } from './state';
import { createSyncAnalysesCommand } from './sync-analyses';
import { createSyncMainCommand } from './sync-main';
import { createTaintCommand } from './taint';
import { createTelemetryCommand } from './telemetry';
import { createTestCraftCommand } from './test-craft';
import { createTraceabilityCommand } from './traceability';
import { createUninstallCommand } from './uninstall';
import { createUninstallConstraintsCommand } from './uninstall-constraints';
import { createUpdateCommand } from './update';
import { createUsageCommand } from './usage';
import { createValidateCommand } from './validate';
import { createVerifyCommand } from './verify';

/**
 * All discovered command creators, sorted alphabetically.
 * Used by createProgram() to register commands without manual imports.
 */
export const commandCreators: Array<() => Command> = [
  createAddCommand,
  createAdoptionCommand,
  createAdviseSkillsCommand,
  createAgentCommand,
  createAlignDesignSystemCommand,
  createAuditProtectedCommand,
  createBackfillSkillProvenanceCommand,
  createBlueprintCommand,
  createCheckArchCommand,
  createCheckDepsCommand,
  createCheckDesignCommand,
  createCheckDocsCommand,
  createCheckHarnessStrengthCommand,
  createCheckPerfCommand,
  createCheckPhaseGateCommand,
  createCheckSecurityCommand,
  createCICommand,
  createCleanupCommand,
  createCleanupSessionsCommand,
  createCompoundCommand,
  createCopyCraftCommand,
  createCreateSkillCommand,
  createCrossCheckCommand,
  createDashboardCommand,
  createDesignPipelineCommand,
  createDoctorCommand,
  createFixDriftCommand,
  createGatewayCommand,
  createGenerateAgentDefinitionsCommand,
  createGenerateCommand,
  createGenerateSlashCommandsCommand,
  createGraphCommand,
  createHooksCommand,
  createImpactPreviewCommand,
  createInitCommand,
  createInsightsCommand,
  createInstallCommand,
  createInstallConstraintsCommand,
  createIntegrationsCommand,
  createKnowledgeCraftCommand,
  createKnowledgePipelineCommand,
  createLearningsCommand,
  createLinterCommand,
  createMaintenanceCommand,
  createMcpCommand,
  createMcpGuardCommand,
  createMigrateCommand,
  createModelsCommand,
  createNamingCraftCommand,
  createNotificationsCommand,
  createOrchestratorCommand,
  createPerfCommand,
  createPersonaCommand,
  createPredictCommand,
  createPreMergeBriefCommand,
  createProposalsCommand,
  createPublishAnalysesCommand,
  createPulseCommand,
  createRecommendCommand,
  createReviewCiCommand,
  createRoadmapCommand,
  createRoutingCommand,
  createScanConfigCommand,
  createSearchCommand,
  createSecurityCraftCommand,
  createSetupCommand,
  createSetupMcpCommand,
  createShareCommand,
  createSkillCommand,
  createSnapshotCommand,
  createSpecCraftCommand,
  createStaleConstraintsCommand,
  createStateCommand,
  createSyncAnalysesCommand,
  createSyncMainCommand,
  createTaintCommand,
  createTelemetryCommand,
  createTestCraftCommand,
  createTraceabilityCommand,
  createUninstallCommand,
  createUninstallConstraintsCommand,
  createUpdateCommand,
  createUsageCommand,
  createValidateCommand,
  createVerifyCommand,
];
