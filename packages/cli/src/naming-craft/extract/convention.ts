/**
 * Convention sampler — derives the project's dominant naming convention
 * per identifier kind via majority-rule over a sample of up to 500
 * identifiers. Returns null when no convention has >50% majority; the
 * convention-conformance rubric silently skips in that case.
 *
 * Source: docs/changes/craft-pipeline/naming-craft/proposal.md
 *   (Technical Design → Convention sampling).
 */

import type { NamingConvention, ProjectConvention } from '../findings/schema.js';
import type { ExtractedIdentifier } from './identifiers.js';

const SAMPLE_CAP = 500;
const MAJORITY_THRESHOLD = 0.5;

export function sampleConventions(
  identifiers: readonly ExtractedIdentifier[],
  files: readonly string[]
): ProjectConvention {
  return {
    variables: sampleForKind(identifiers, 'variable', ['camelCase', 'snake_case', 'PascalCase']),
    functions: sampleForKind(identifiers, 'function', ['camelCase', 'snake_case', 'PascalCase']),
    types: sampleForKind(identifiers, 'type', ['PascalCase', 'camelCase']),
    files: sampleFiles(files),
  };
}

function sampleForKind(
  identifiers: readonly ExtractedIdentifier[],
  kind: ExtractedIdentifier['kind'],
  candidates: readonly NamingConvention[]
): NamingConvention | null {
  const samples = identifiers.filter((i) => i.kind === kind).slice(0, SAMPLE_CAP);
  return mode(
    samples.map((i) => i.name),
    candidates
  );
}

function sampleFiles(files: readonly string[]): NamingConvention | null {
  const basenames = files.slice(0, SAMPLE_CAP).map((f) => {
    const last = f.split(/[\\/]/).pop() ?? f;
    return last.replace(/\.(?:ts|tsx|js|jsx|css|scss|md|json)$/i, '');
  });
  return mode(basenames, ['kebab-case', 'camelCase', 'PascalCase']);
}

function mode(
  names: readonly string[],
  candidates: readonly NamingConvention[]
): NamingConvention | null {
  if (names.length === 0) return null;
  const counts = new Map<NamingConvention, number>();
  for (const c of candidates) counts.set(c, 0);
  for (const name of names) {
    const conv = classify(name);
    if (conv !== null && counts.has(conv)) {
      counts.set(conv, (counts.get(conv) ?? 0) + 1);
    }
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  let maxCount = 0;
  let maxConv: NamingConvention | null = null;
  for (const [conv, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      maxConv = conv;
    }
  }
  if (maxCount / total < MAJORITY_THRESHOLD) return null;
  return maxConv;
}

export function classify(name: string): NamingConvention | null {
  if (/^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/.test(name)) return 'kebab-case';
  if (/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(name)) return 'snake_case';
  if (/^[A-Z][a-zA-Z0-9]*$/.test(name)) return 'PascalCase';
  if (/^[a-z][a-zA-Z0-9]*$/.test(name)) return 'camelCase';
  return null;
}
