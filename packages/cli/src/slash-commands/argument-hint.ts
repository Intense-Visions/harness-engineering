import type { SkillArg } from './types';

export function buildArgumentHint(args: SkillArg[]): string {
  return args
    .map((arg) => {
      // skill.yaml `cli.args` names may already carry their leading dashes
      // (e.g. `--fleets`); strip them so the prefix is never doubled (#1969).
      const name = arg.name.replace(/^-+/, '');
      return arg.required ? `--${name} <${name}>` : `[--${name} <${name}>]`;
    })
    .join(' ');
}
