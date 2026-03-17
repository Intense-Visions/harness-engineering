/**
 * Normalize a skill name for use as a slash command name.
 *
 * Rules:
 * 1. Strip leading "harness-" prefix
 * 2. Strip interior "-harness-" segments
 * 3. Strip trailing "-harness"
 * 4. Pass through all other names unchanged
 */
export function normalizeName(skillName: string): string {
  let name = skillName;

  // Rule 1: strip leading "harness-"
  if (name.startsWith('harness-')) {
    name = name.slice('harness-'.length);
  }

  // Rule 2: strip interior "-harness-"
  name = name.replace(/-harness-/g, '-');

  // Rule 3: strip trailing "-harness"
  if (name.endsWith('-harness')) {
    name = name.slice(0, -'-harness'.length);
  }

  return name;
}
