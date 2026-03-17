import type { SkillArg } from './types';

export function buildArgumentHint(args: SkillArg[]): string {
  return args
    .map((arg) =>
      arg.required ? `--${arg.name} <${arg.name}>` : `[--${arg.name} <${arg.name}>]`
    )
    .join(' ');
}
