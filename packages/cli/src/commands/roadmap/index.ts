import { Command } from 'commander';
import { createRoadmapMigrateCommand } from './migrate';
import { createRoadmapShardCommand } from './shard';
import { createRoadmapUnshardCommand } from './unshard';
import { createRoadmapRegenCommand } from './regen';

export function createRoadmapCommand(): Command {
  const roadmap = new Command('roadmap').description('Roadmap management');
  roadmap.addCommand(createRoadmapMigrateCommand());
  roadmap.addCommand(createRoadmapShardCommand());
  roadmap.addCommand(createRoadmapUnshardCommand());
  roadmap.addCommand(createRoadmapRegenCommand());
  return roadmap;
}
