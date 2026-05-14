import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { stringify } from 'yaml';
import { buildAuthDocument } from './registry';

/**
 * Emit the OpenAPI artifact for the auth routes to `out`.
 * Idempotent: identical inputs produce byte-identical output (sorted keys,
 * stable indent).
 */
export function generateOpenApiYaml(out: string): void {
  const doc = buildAuthDocument();
  // JSON round-trip strips reference identity so `yaml.stringify` does not
  // emit anchors/aliases (which break under sortMapEntries: true).
  const plain = JSON.parse(JSON.stringify(doc)) as unknown;
  mkdirSync(dirname(out), { recursive: true });
  const yaml = stringify(plain, { sortMapEntries: true, indent: 2, lineWidth: 0 });
  writeFileSync(out, yaml, 'utf8');
}

// Build-time entry: `node dist/gateway/openapi/generate.js docs/api/openapi.yaml`
if (require.main === module) {
  const target = process.argv[2] ?? 'docs/api/openapi.yaml';
  generateOpenApiYaml(target);
  console.log(`Wrote ${target}`);
}
