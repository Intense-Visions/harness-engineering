import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { loadPersona } from '../../persona/loader';
import { generateRuntime } from '../../persona/generators/runtime';
import { generateAgentsMd } from '../../persona/generators/agents-md';
import { generateCIWorkflow } from '../../persona/generators/ci-workflow';
import { logger } from '../../output/logger';
import { ExitCode } from '../../utils/errors';

function resolvePersonasDir(): string {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');
  return path.join(repoRoot, 'agents', 'personas');
}

function toKebabCase(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

export function createGenerateCommand(): Command {
  return new Command('generate')
    .description('Generate artifacts from a persona config')
    .argument('<name>', 'Persona name (e.g., architecture-enforcer)')
    .option('--output-dir <dir>', 'Output directory', '.')
    .option('--only <type>', 'Generate only: ci, agents-md, runtime')
    .action(async (name, opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const personasDir = resolvePersonasDir();
      const filePath = path.join(personasDir, `${name}.yaml`);
      const personaResult = loadPersona(filePath);
      if (!personaResult.ok) {
        logger.error(personaResult.error.message);
        process.exit(ExitCode.ERROR);
      }
      const persona = personaResult.value;
      const outputDir = path.resolve(opts.outputDir);
      const slug = toKebabCase(persona.name);
      const only = opts.only as string | undefined;
      const generated: string[] = [];

      if (!only || only === 'runtime') {
        const result = generateRuntime(persona);
        if (result.ok) {
          const outPath = path.join(outputDir, `${slug}.runtime.json`);
          fs.mkdirSync(path.dirname(outPath), { recursive: true });
          fs.writeFileSync(outPath, result.value);
          generated.push(outPath);
        }
      }
      if (!only || only === 'agents-md') {
        const result = generateAgentsMd(persona);
        if (result.ok) {
          const outPath = path.join(outputDir, `${slug}.agents.md`);
          fs.writeFileSync(outPath, result.value);
          generated.push(outPath);
        }
      }
      if (!only || only === 'ci') {
        const result = generateCIWorkflow(persona, 'github');
        if (result.ok) {
          const outPath = path.join(outputDir, '.github', 'workflows', `${slug}.yml`);
          fs.mkdirSync(path.dirname(outPath), { recursive: true });
          fs.writeFileSync(outPath, result.value);
          generated.push(outPath);
        }
      }
      if (!globalOpts.quiet) {
        logger.success(`Generated ${generated.length} artifacts for ${persona.name}:`);
        for (const f of generated) console.log(`  - ${f}`);
      }
      process.exit(ExitCode.SUCCESS);
    });
}
