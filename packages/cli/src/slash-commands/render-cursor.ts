import type { SkillCursor } from '../skill/schema';
import type { SlashCommandSpec } from './types';
import { GENERATED_HEADER_CURSOR } from './types';

export function renderCursor(
  spec: SlashCommandSpec,
  skillMdContent: string,
  cursorConfig?: SkillCursor
): string {
  const lines: string[] = ['---'];
  lines.push(`description: ${spec.description}`);

  if (cursorConfig?.globs && cursorConfig.globs.length > 0) {
    lines.push('globs:');
    for (const glob of cursorConfig.globs) {
      lines.push(`  - ${glob}`);
    }
  }

  const alwaysApply = cursorConfig?.alwaysApply ?? false;
  lines.push(`alwaysApply: ${alwaysApply}`);
  lines.push('---');
  lines.push('');
  lines.push(GENERATED_HEADER_CURSOR);
  lines.push('');
  lines.push(skillMdContent);
  lines.push('');

  return lines.join('\n');
}
