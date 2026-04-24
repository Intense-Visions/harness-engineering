/**
 * Signal extractor for the Pipeline Skill Advisor.
 * Extracts ContentSignals from spec text and project dependency information.
 * Pure functions — no file I/O. Callers provide raw text and parsed deps.
 */

import type { ContentSignals } from './content-matcher-types.js';
import { DOMAIN_KEYWORD_MAP } from './content-matcher-types.js';

// ---------------------------------------------------------------------------
// Stemming
// ---------------------------------------------------------------------------

/** Suffixes to strip, ordered longest-first for greedy matching. */
const STEM_SUFFIXES = [
  'ation',
  'tion',
  'sion',
  'ment',
  'ness',
  'ible',
  'able',
  'ive',
  'ous',
  'ful',
  'ing',
  'ity',
  'ly',
  'ed',
  'er',
  'es',
  's',
];

/**
 * Naive stemmer: lowercase + strip one common English suffix.
 * Good enough for keyword matching; not a full Porter stemmer.
 */
export function simpleStem(word: string): string {
  const w = word.toLowerCase();
  if (w.length <= 4) return w;
  for (const suffix of STEM_SUFFIXES) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 3) {
      return w.slice(0, -suffix.length);
    }
  }
  return w;
}

// ---------------------------------------------------------------------------
// Keyword extraction
// ---------------------------------------------------------------------------

/**
 * Extract keywords from spec text.
 * Looks for a `**Keywords:**` line (bold markdown format used in this repo).
 */
export function extractSpecKeywords(specText: string): string[] {
  const match = specText.match(/\*\*Keywords?:\*\*\s*(.+)/i);
  if (!match?.[1]) return [];
  return match[1]
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

// ---------------------------------------------------------------------------
// Stack detection
// ---------------------------------------------------------------------------

/** Map from npm package names to stack signal identifiers. */
const STACK_SIGNAL_MAP: Record<string, string> = {
  react: 'react',
  'react-dom': 'react',
  'react-native': 'react-native',
  next: 'next',
  vue: 'vue',
  nuxt: 'nuxt',
  angular: 'angular',
  svelte: 'svelte',
  express: 'express',
  fastify: 'fastify',
  nestjs: 'nest',
  '@nestjs/core': 'nest',
  typescript: 'typescript',
  tailwindcss: 'tailwind',
  prisma: 'prisma',
  '@prisma/client': 'prisma',
  'drizzle-orm': 'drizzle',
  graphql: 'graphql',
  '@trpc/server': 'trpc',
  trpc: 'trpc',
  vitest: 'vitest',
  jest: 'jest',
  playwright: 'playwright',
  cypress: 'cypress',
  vite: 'vite',
  webpack: 'webpack',
  zod: 'zod',
  mongoose: 'mongoose',
  redis: 'redis',
  ioredis: 'redis',
  'socket.io': 'websocket',
  ws: 'websocket',
};

/**
 * Detect tech stack signals from parsed package.json dependencies.
 * Returns deduplicated, sorted array of signal identifiers.
 */
export function detectStackFromDeps(
  dependencies: Record<string, string>,
  devDependencies: Record<string, string>
): string[] {
  const signals = new Set<string>();
  const allDeps = { ...dependencies, ...devDependencies };

  for (const pkgName of Object.keys(allDeps)) {
    const signal = STACK_SIGNAL_MAP[pkgName];
    if (signal) {
      signals.add(signal);
    }
  }

  return [...signals].sort();
}

// ---------------------------------------------------------------------------
// Domain inference
// ---------------------------------------------------------------------------

/**
 * Infer feature domain categories from spec text.
 * Uses DOMAIN_KEYWORD_MAP (shared with content-matcher) as single source of truth.
 * Requires at least 2 marker hits per domain to reduce noise.
 */
export function inferDomain(specText: string): string[] {
  const lower = specText.toLowerCase();
  const domains: string[] = [];

  for (const [domain, markers] of Object.entries(DOMAIN_KEYWORD_MAP)) {
    const hits = markers.filter((m) => lower.includes(m)).length;
    if (hits >= 2) {
      domains.push(domain);
    }
  }

  return domains.sort();
}

// ---------------------------------------------------------------------------
// Combined signal extraction
// ---------------------------------------------------------------------------

/**
 * Extract ContentSignals from spec text and project dependency info.
 *
 * Pure function — no file I/O. Callers provide raw text and parsed deps.
 */
export function extractSignals(
  specText: string,
  dependencies: Record<string, string>,
  devDependencies: Record<string, string>,
  contextKeywords?: string[],
  taskText?: string
): ContentSignals {
  const specKeywords = extractSpecKeywords(specText);

  if (contextKeywords) {
    const existing = new Set(specKeywords);
    for (const kw of contextKeywords) {
      if (!existing.has(kw)) {
        specKeywords.push(kw);
        existing.add(kw);
      }
    }
  }

  const stackSignals = detectStackFromDeps(dependencies, devDependencies);
  const featureDomain = inferDomain(specText);

  return {
    specKeywords,
    specText,
    stackSignals,
    featureDomain,
    ...(taskText !== undefined && { taskText }),
  };
}
