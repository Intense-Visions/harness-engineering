// AUTO-GENERATED — do not edit. Run `pnpm run generate-barrel-exports` to regenerate.

import type { Command } from 'commander';

import { createAddCommand } from './add';
import { createAdoptionCommand } from './adoption';
import { createAgentCommand } from './agent';
import { createBlueprintCommand } from './blueprint';
import { createCheckArchCommand } from './check-arch';
import { createCheckDepsCommand } from './check-deps';
import { createCheckDocsCommand } from './check-docs';
import { createCheckPerfCommand } from './check-perf';
import { createCheckPhaseGateCommand } from './check-phase-gate';
import { createCheckSecurityCommand } from './check-security';
import { createCICommand } from './ci';
import { createCleanupCommand } from './cleanup';
import { createCleanupSessionsCommand } from './cleanup-sessions';
import { createCreateSkillCommand } from './create-skill';
import { createDashboardCommand } from './dashboard';
import { createDoctorCommand } from './doctor';
import { createFixDriftCommand } from './fix-drift';
import { createGenerateAgentDefinitionsCommand } from './generate-agent-definitions';
import { createGenerateCommand } from './generate';
import { createGenerateSlashCommandsCommand } from './generate-slash-commands';
import { createGraphCommand } from './graph';
import { createHooksCommand } from './hooks';
import { createImpactPreviewCommand } from './impact-preview';
import { createIngestCommand } from './graph/ingest';
import { createInitCommand } from './init';
import { createInstallCommand } from './install';
import { createInstallConstraintsCommand } from './install-constraints';
import { createIntegrationsCommand } from './integrations';
import { createLearningsCommand } from './learnings';
import { createLinterCommand } from './linter';
import { createMcpCommand } from './mcp';
import { createOrchestratorCommand } from './orchestrator';
import { createPerfCommand } from './perf';
import { createPersonaCommand } from './persona';
import { createPredictCommand } from './predict';
import { createQueryCommand } from './graph/query';
import { createRecommendCommand } from './recommend';
import { createScanCommand } from './graph/scan';
import { createScanConfigCommand } from './scan-config';
import { createSetupCommand } from './setup';
import { createSetupMcpCommand } from './setup-mcp';
import { createShareCommand } from './share';
import { createSkillCommand } from './skill';
import { createSnapshotCommand } from './snapshot';
import { createStateCommand } from './state';
import { createTaintCommand } from './taint';
import { createTraceabilityCommand } from './traceability';
import { createUninstallCommand } from './uninstall';
import { createUninstallConstraintsCommand } from './uninstall-constraints';
import { createUpdateCommand } from './update';
import { createUsageCommand } from './usage';
import { createValidateCommand } from './validate';

/**
 * All discovered command creators, sorted alphabetically.
 * Used by createProgram() to register commands without manual imports.
 */
export const commandCreators: Array<() => Command> = [
  createAddCommand,
  createAdoptionCommand,
  createAgentCommand,
  createBlueprintCommand,
  createCheckArchCommand,
  createCheckDepsCommand,
  createCheckDocsCommand,
  createCheckPerfCommand,
  createCheckPhaseGateCommand,
  createCheckSecurityCommand,
  createCICommand,
  createCleanupCommand,
  createCleanupSessionsCommand,
  createCreateSkillCommand,
  createDashboardCommand,
  createDoctorCommand,
  createFixDriftCommand,
  createGenerateAgentDefinitionsCommand,
  createGenerateCommand,
  createGenerateSlashCommandsCommand,
  createGraphCommand,
  createHooksCommand,
  createImpactPreviewCommand,
  createIngestCommand,
  createInitCommand,
  createInstallCommand,
  createInstallConstraintsCommand,
  createIntegrationsCommand,
  createLearningsCommand,
  createLinterCommand,
  createMcpCommand,
  createOrchestratorCommand,
  createPerfCommand,
  createPersonaCommand,
  createPredictCommand,
  createQueryCommand,
  createRecommendCommand,
  createScanCommand,
  createScanConfigCommand,
  createSetupCommand,
  createSetupMcpCommand,
  createShareCommand,
  createSkillCommand,
  createSnapshotCommand,
  createStateCommand,
  createTaintCommand,
  createTraceabilityCommand,
  createUninstallCommand,
  createUninstallConstraintsCommand,
  createUpdateCommand,
  createUsageCommand,
  createValidateCommand,
];
