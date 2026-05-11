import { Command } from 'commander';
import { createRoadmapMigrateCommand } from './migrate';

export function createRoadmapCommand(): Command {
  const roadmap = new Command('roadmap').description('Roadmap management');
  roadmap.addCommand(createRoadmapMigrateCommand());
  return roadmap;
}
