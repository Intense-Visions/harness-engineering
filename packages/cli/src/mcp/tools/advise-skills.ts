import path from 'node:path';
import { runAdviseSkills } from '../../commands/advise-skills.js';

export const adviseSkillsDefinition = {
  name: 'advise_skills',
  description:
    'Content-based skill recommendations for a spec or feature description. Returns tiered matches with purpose and timing guidance.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'Project root path (defaults to cwd)',
      },
      specPath: {
        type: 'string',
        description: 'Path to the spec file (proposal.md), relative to project root',
      },
      thorough: {
        type: 'boolean',
        description: 'Include Consider tier in output',
      },
      top: {
        type: 'number',
        description: 'Max skills per tier (default 5 apply, 10 reference)',
      },
    },
    required: ['specPath'] as string[],
  },
};

export async function handleAdviseSkills(
  input: Record<string, unknown>
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const projectRoot = (input.path as string) || process.cwd();
  const specRelPath = input.specPath as string;
  const thorough = (input.thorough as boolean) || false;
  const top = (input.top as number) || 5;

  try {
    const { result, skillsMdPath, featureName, totalSkills } = await runAdviseSkills({
      specPath: specRelPath,
      cwd: projectRoot,
      thorough,
      top,
    });

    const response = {
      featureName,
      skillsPath: path.relative(projectRoot, skillsMdPath).replaceAll('\\', '/'),
      totalScanned: totalSkills,
      scanDuration: result.scanDuration,
      apply: result.matches
        .filter((m) => m.tier === 'apply')
        .map((m) => ({
          skill: m.skillName,
          score: m.score,
          when: m.when,
          reasons: m.matchReasons,
        })),
      reference: result.matches
        .filter((m) => m.tier === 'reference')
        .map((m) => ({
          skill: m.skillName,
          score: m.score,
          when: m.when,
          reasons: m.matchReasons,
        })),
      consider: result.matches
        .filter((m) => m.tier === 'consider')
        .map((m) => ({
          skill: m.skillName,
          score: m.score,
          when: m.when,
          reasons: m.matchReasons,
        })),
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
    };
  } catch (err) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: (err as Error).message }) }],
    };
  }
}
