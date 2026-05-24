/**
 * Parse `design-system/DESIGN.md` `## Brand Rules` section into a
 * structured BrandRules object.
 *
 * v1 USES only `voice.forbiddenPhrases`. Other subsections
 * (toneByContext, assets, semanticTokenAliases) are parsed-but-unused
 * for forward-compatibility — when v1.x rules ship, they read from the
 * already-populated fields with no parser change.
 *
 * Returns null when DESIGN.md is absent or `## Brand Rules` section is
 * missing. Both rule families using brand rules then silently skip
 * (same pattern as detect-design-drift's resolvers).
 *
 * Schema source: docs/knowledge/decisions/0028-brand-guidelines-source-of-truth.md
 *   (Schema sketch).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface BrandVoice {
  constant?: string;
  forbiddenPhrases: string[];
  readingLevel?: number;
  maxSentenceWords?: number;
}

export interface BrandAssetUseRule {
  rule: string;
}

export interface BrandAssetLogoVariation {
  use: string;
  path: string;
}

export interface BrandAssets {
  logo?: {
    primary?: string;
    variations?: BrandAssetLogoVariation[];
  };
  forbiddenAssetUses?: BrandAssetUseRule[];
}

export interface BrandRules {
  voice: BrandVoice | null;
  toneByContext: Record<string, string> | null;
  assets: BrandAssets | null;
  semanticTokenAliases: Record<string, string> | null;
}

export function loadBrandRules(projectRoot: string): BrandRules | null {
  const designMdPath = path.join(projectRoot, 'design-system', 'DESIGN.md');
  if (!fs.existsSync(designMdPath)) return null;
  let raw: string;
  try {
    raw = fs.readFileSync(designMdPath, 'utf-8');
  } catch {
    return null;
  }
  const section = extractBrandRulesSection(raw);
  if (section === null) return null;
  return parseBrandRules(section);
}

function extractBrandRulesSection(markdown: string): string | null {
  const lines = markdown.split('\n');
  let inSection = false;
  const collected: string[] = [];
  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (inSection) break;
      if (line.toLowerCase().startsWith('## brand rules')) {
        inSection = true;
        continue;
      }
    }
    if (inSection) collected.push(line);
  }
  return inSection ? collected.join('\n') : null;
}

function parseBrandRules(section: string): BrandRules {
  const subsections = splitH3Subsections(section);
  return {
    voice: subsections.voice ? parseVoice(subsections.voice) : null,
    toneByContext: subsections['tone by context']
      ? (parseKvBlock(subsections['tone by context']) as Record<string, string>)
      : null,
    assets: subsections.assets ? parseAssets(subsections.assets) : null,
    semanticTokenAliases: subsections['semantic token aliases']
      ? (parseKvBlock(subsections['semantic token aliases']) as Record<string, string>)
      : null,
  };
}

function splitH3Subsections(section: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = section.split('\n');
  let currentKey: string | null = null;
  let currentBuf: string[] = [];
  for (const line of lines) {
    const h3 = /^###\s+(.+?)\s*$/.exec(line);
    if (h3) {
      if (currentKey !== null) out[currentKey] = currentBuf.join('\n');
      currentKey = h3[1]!.trim().toLowerCase();
      currentBuf = [];
      continue;
    }
    if (currentKey !== null) currentBuf.push(line);
  }
  if (currentKey !== null) out[currentKey] = currentBuf.join('\n');
  return out;
}

/**
 * Parse a tolerant YAML-ish key-value block:
 *
 *   key1: value1
 *   key2:
 *     - item1
 *     - item2
 *   key3: 7
 *
 * Returns nested structure where list items become arrays and scalars
 * become strings/numbers based on content.
 */
function parseKvBlock(text: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const lines = text.split('\n').filter((l) => l.trim().length > 0 && !l.trim().startsWith('#'));
  let currentListKey: string | null = null;
  let currentList: string[] = [];
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (trimmed.startsWith('-')) {
      // list item
      if (currentListKey !== null) {
        const item = trimmed.replace(/^-\s*/, '').replace(/^['"]|['"]$/g, '');
        currentList.push(item);
      }
      continue;
    }
    // flush previous list if any
    if (currentListKey !== null) {
      out[currentListKey] = currentList;
      currentListKey = null;
      currentList = [];
    }
    // key: value form
    const kv = /^([A-Za-z_][\w]*)\s*:\s*(.*)$/.exec(trimmed);
    if (kv) {
      const [, key, value] = kv;
      if (value!.trim() === '') {
        // start of a list block
        currentListKey = key!;
        currentList = [];
      } else {
        const clean = value!.replace(/^['"]|['"]$/g, '').trim();
        const asNum = Number(clean);
        out[key!] = !Number.isNaN(asNum) && /^\d+(\.\d+)?$/.test(clean) ? asNum : clean;
      }
    }
  }
  if (currentListKey !== null) {
    out[currentListKey] = currentList;
  }
  return out;
}

function parseVoice(block: string): BrandVoice {
  const kv = parseKvBlock(block);
  const voice: BrandVoice = {
    forbiddenPhrases: Array.isArray(kv.forbidden_phrases) ? (kv.forbidden_phrases as string[]) : [],
  };
  if (typeof kv.constant === 'string') voice.constant = kv.constant;
  if (typeof kv.reading_level === 'number') voice.readingLevel = kv.reading_level;
  if (typeof kv.max_sentence_words === 'number') voice.maxSentenceWords = kv.max_sentence_words;
  return voice;
}

function parseAssets(block: string): BrandAssets {
  // Defer structured asset parsing to v1.x (asset rules don't ship in v1).
  // For now, capture the raw subsection so a future parser doesn't have to
  // re-extract it.
  const kv = parseKvBlock(block);
  const assets: BrandAssets = {};
  if (typeof kv.logo === 'object' && kv.logo !== null) {
    assets.logo = kv.logo as NonNullable<BrandAssets['logo']>;
  }
  if (Array.isArray(kv.forbidden_asset_uses)) {
    assets.forbiddenAssetUses = (kv.forbidden_asset_uses as string[]).map((rule) => ({ rule }));
  }
  return assets;
}
