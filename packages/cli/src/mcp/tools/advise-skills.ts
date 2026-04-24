import fs from 'node:fs';
import path from 'node:path';
import { loadOrRebuildIndex } from '../../skill/index-builder.js';
import { extractSignals } from '../../skill/signal-extractor.js';
import { matchContent } from '../../skill/content-matcher.js';
import { generateSkillsMd } from '../../skill/skills-md-writer.js';
import { resolveConfig } from '../../config/loader.js';

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

  const specPath = path.resolve(projectRoot, specRelPath);

  if (!fs.existsSync(specPath)) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: `Spec not found: ${specPath}` }) }],
    };
  }

  const specText = fs.readFileSync(specPath, 'utf-8');

  // Detect stack from package.json
  let deps: Record<string, string> = {};
  let devDeps: Record<string, string> = {};
  const pkgPath = path.join(projectRoot, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    deps = pkg.dependencies ?? {};
    devDeps = pkg.devDependencies ?? {};
  }

  const signals = extractSignals(specText, deps, devDeps);

  // Load skill index
  const configResult = resolveConfig();
  const tierOverrides = configResult.ok ? configResult.value.skills?.tierOverrides : undefined;
  const index = loadOrRebuildIndex('claude-code', projectRoot, tierOverrides);
  const totalSkills = Object.keys(index.skills).length;

  const result = matchContent(index, signals);

  // Filter by tiers and top
  const applySkills = result.matches.filter((m) => m.tier === 'apply').slice(0, top);
  const refSkills = result.matches.filter((m) => m.tier === 'reference').slice(0, top * 2);
  const considerSkills = thorough
    ? result.matches.filter((m) => m.tier === 'consider').slice(0, top)
    : [];

  const filteredMatches = [...applySkills, ...refSkills, ...considerSkills];

  // Extract feature name from spec
  const titleMatch = specText.match(/^#\s+(.+)/m);
  const featureName = titleMatch?.[1] ?? path.basename(path.dirname(specPath));

  // Write SKILLS.md alongside spec
  const skillsMdPath = path.join(path.dirname(specPath), 'SKILLS.md');
  const filteredResult = { ...result, matches: filteredMatches };
  const md = generateSkillsMd(featureName, filteredResult, totalSkills);
  fs.writeFileSync(skillsMdPath, md, 'utf-8');

  const response = {
    featureName,
    skillsPath: path.relative(projectRoot, skillsMdPath).replaceAll('\\', '/'),
    totalScanned: totalSkills,
    scanDuration: result.scanDuration,
    apply: applySkills.map((m) => ({
      skill: m.skillName,
      score: m.score,
      when: m.when,
      reasons: m.matchReasons,
    })),
    reference: refSkills.map((m) => ({
      skill: m.skillName,
      score: m.score,
      when: m.when,
      reasons: m.matchReasons,
    })),
    consider: considerSkills.map((m) => ({
      skill: m.skillName,
      score: m.score,
      when: m.when,
      reasons: m.matchReasons,
    })),
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
  };
}
