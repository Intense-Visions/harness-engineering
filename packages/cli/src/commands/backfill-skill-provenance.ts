import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

/**
 * Hermes Phase 4 one-shot migration: stamp `provenance: user-authored` on
 * every existing catalog skill so the audit trail is complete from day one.
 * Idempotent — re-running is a no-op once every skill carries provenance.
 *
 * The task runs over `agents/skills/<host>/<skill>/skill.yaml`. It does NOT
 * touch SKILL.md and does NOT modify any skill that already declares a
 * `provenance` value.
 */

export interface BackfillResult {
  scanned: number;
  updated: number;
  skipped: number;
  errors: Array<{ file: string; message: string }>;
  updatedFiles: string[];
}

function listSkillYamlFiles(skillsRoot: string): string[] {
  const out: string[] = [];
  let hosts: string[];
  try {
    hosts = fs.readdirSync(skillsRoot);
  } catch {
    return out;
  }
  for (const host of hosts) {
    const hostDir = path.join(skillsRoot, host);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(hostDir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    let skills: string[];
    try {
      skills = fs.readdirSync(hostDir);
    } catch {
      continue;
    }
    for (const skill of skills) {
      const skillDir = path.join(hostDir, skill);
      try {
        if (!fs.statSync(skillDir).isDirectory()) continue;
      } catch {
        continue;
      }
      const yamlFile = path.join(skillDir, 'skill.yaml');
      if (fs.existsSync(yamlFile)) out.push(yamlFile);
    }
  }
  return out;
}

function backfillFile(yamlFile: string): 'updated' | 'skipped' | { error: string } {
  let raw: string;
  try {
    raw = fs.readFileSync(yamlFile, 'utf-8');
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  let doc: unknown;
  try {
    doc = parseYaml(raw);
  } catch (err) {
    return { error: `parse failure: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!doc || typeof doc !== 'object') {
    return { error: 'top-level is not a YAML mapping' };
  }
  const obj = doc as Record<string, unknown>;
  if (typeof obj['provenance'] === 'string' && obj['provenance'].length > 0) {
    return 'skipped';
  }
  obj['provenance'] = 'user-authored';
  fs.writeFileSync(yamlFile, stringifyYaml(obj));
  return 'updated';
}

export function runBackfillSkillProvenance(projectRoot: string): BackfillResult {
  const skillsRoot = path.join(projectRoot, 'agents', 'skills');
  const files = listSkillYamlFiles(skillsRoot);

  const result: BackfillResult = {
    scanned: files.length,
    updated: 0,
    skipped: 0,
    errors: [],
    updatedFiles: [],
  };

  for (const file of files) {
    const outcome = backfillFile(file);
    if (outcome === 'updated') {
      result.updated += 1;
      result.updatedFiles.push(file);
    } else if (outcome === 'skipped') {
      result.skipped += 1;
    } else {
      result.errors.push({ file, message: outcome.error });
    }
  }

  return result;
}

export function createBackfillSkillProvenanceCommand(): Command {
  const cmd = new Command('backfill-skill-provenance')
    .description(
      'Stamp `provenance: user-authored` on every catalog skill missing the field (Hermes Phase 4 one-shot)'
    )
    .option('--root <path>', 'Project root containing agents/skills/', process.cwd())
    .action((opts: { root: string }) => {
      const result = runBackfillSkillProvenance(opts.root);
      console.log(JSON.stringify(result, null, 2));
      if (result.errors.length > 0) process.exitCode = 1;
    });
  return cmd;
}
