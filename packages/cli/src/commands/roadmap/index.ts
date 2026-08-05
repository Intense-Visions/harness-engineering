import { Command } from 'commander';
import { createRoadmapMigrateCommand } from './migrate';
import { createRoadmapShardCommand } from './shard';
import { createRoadmapUnshardCommand } from './unshard';
import { createRoadmapRegenCommand } from './regen';
import { createRoadmapInstallHookCommand } from './install-hook';
import { createRoadmapReconcileCommand } from './reconcile';
import { createRoadmapSyncCommand } from './sync';
import { createRoadmapReferencedIssuesCommand } from './referenced-issues';
import { createRoadmapTriageCommand } from './triage';

export function createRoadmapCommand(): Command {
  const roadmap = new Command('roadmap').description('Roadmap management');
  roadmap.addCommand(createRoadmapMigrateCommand());
  roadmap.addCommand(createRoadmapShardCommand());
  roadmap.addCommand(createRoadmapUnshardCommand());
  roadmap.addCommand(createRoadmapRegenCommand());
  roadmap.addCommand(createRoadmapInstallHookCommand());
  roadmap.addCommand(createRoadmapReconcileCommand());
  roadmap.addCommand(createRoadmapSyncCommand());
  roadmap.addCommand(createRoadmapReferencedIssuesCommand());
  roadmap.addCommand(createRoadmapTriageCommand());
  return roadmap;
}
