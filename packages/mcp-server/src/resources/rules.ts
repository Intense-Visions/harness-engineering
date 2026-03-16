import * as fs from 'fs';
import * as path from 'path';

export async function getRulesResource(projectRoot: string): Promise<string> {
  const rules: Record<string, unknown>[] = [];

  // Try to read harness config
  const configPath = path.join(projectRoot, 'harness.config.json');
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (config.layers) {
        rules.push({ type: 'layer-enforcement', config: config.layers });
      }
      if (config.phaseGates) {
        rules.push({ type: 'phase-gates', config: config.phaseGates });
      }
      if (config.rules) {
        rules.push({ type: 'custom-rules', config: config.rules });
      }
    } catch {
      /* skip malformed config */
    }
  }

  // Try to read .harness/linter.json for linter rules
  const linterPath = path.join(projectRoot, '.harness', 'linter.json');
  if (fs.existsSync(linterPath)) {
    try {
      const linterConfig = JSON.parse(fs.readFileSync(linterPath, 'utf-8'));
      rules.push({ type: 'linter', config: linterConfig });
    } catch {
      /* skip malformed linter config */
    }
  }

  return JSON.stringify(rules, null, 2);
}
