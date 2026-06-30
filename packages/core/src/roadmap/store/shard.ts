import matter from 'gray-matter';
import type { Result } from '@harness-engineering/types';
import { Ok, Err } from '@harness-engineering/types';
import { parseFeatureBlock } from '../parse';
import { serializeFeature } from '../serialize';
import { quoteYamlScalar } from './yaml-scalar';
import type { Shard } from './roadmap-store';

const H3_NAME = /^###\s+(?:Feature:\s+)?(.+)$/m;

/** Validated shard frontmatter fields (slug/milestone/order). */
interface ShardFrontmatter {
  slug: string;
  milestone: string;
  order: number;
}

/**
 * Validate and coerce the `slug`/`milestone`/`order` fields from parsed shard
 * frontmatter. Split out of `parseShard` so the field-by-field guards do not
 * inflate the parser's branch count.
 */
function parseShardFrontmatter(data: Record<string, unknown>): Result<ShardFrontmatter> {
  const slug = data.slug;
  if (typeof slug !== 'string' || slug.length === 0) {
    return Err(new Error('Shard frontmatter missing required field: slug'));
  }

  const milestone = data.milestone;
  if (typeof milestone !== 'string' || milestone.length === 0) {
    return Err(new Error('Shard frontmatter missing required field: milestone'));
  }

  const rawOrder = data.order;
  const order = typeof rawOrder === 'number' ? rawOrder : Number(rawOrder);
  if (rawOrder === undefined || rawOrder === null || Number.isNaN(order)) {
    return Err(
      new Error(`Shard "${slug}" has invalid order: "${String(rawOrder)}" (must be a number)`)
    );
  }

  return Ok({ slug, milestone, order });
}

/**
 * Parse a per-row shard markdown string into a `Shard`.
 *
 * The shard is `slug`/`milestone`/`order` YAML frontmatter (parsed via
 * gray-matter) followed by an H3 heading and the existing `- **Field:** value`
 * row block, which is parsed by the shared `parseFeatureBlock` (spec: reuse, do
 * not reimplement).
 */
export function parseShard(md: string): Result<Shard> {
  let data: Record<string, unknown>;
  let content: string;
  try {
    const parsed = matter(md);
    data = parsed.data as Record<string, unknown>;
    content = parsed.content;
  } catch (err) {
    return Err(new Error(`Shard frontmatter is not valid YAML: ${(err as Error).message}`));
  }

  const frontmatterResult = parseShardFrontmatter(data);
  if (!frontmatterResult.ok) return frontmatterResult;
  const { slug, milestone, order } = frontmatterResult.value;

  const nameMatch = content.match(H3_NAME);
  if (!nameMatch) {
    return Err(new Error(`Shard "${slug}" is missing its "### <name>" heading`));
  }
  const name = nameMatch[1]!.trim();

  const featureResult = parseFeatureBlock(name, content);
  if (!featureResult.ok) return featureResult;

  return Ok({ slug, milestone, order, feature: featureResult.value });
}

/**
 * Serialize a `Shard` back to markdown. Frontmatter is hand-emitted in fixed key
 * order (slug, milestone, order) for byte-determinism — `matter.stringify` is NOT
 * used because its key ordering/quoting is not stable. Free-form string scalars
 * (`slug`, `milestone`) are double-quoted via `quoteYamlScalar` so values with
 * colons or boolean/number shapes round-trip; `order` is a number and emitted
 * raw. The row body is emitted by the shared `serializeFeature` (which includes
 * the `### name` heading), so the output is byte-stable with `parseShard`.
 */
export function serializeShard(shard: Shard): string {
  const frontmatter = [
    '---',
    `slug: ${quoteYamlScalar(shard.slug)}`,
    `milestone: ${quoteYamlScalar(shard.milestone)}`,
    `order: ${shard.order}`,
    '---',
    '',
  ];
  return [...frontmatter, ...serializeFeature(shard.feature)].join('\n') + '\n';
}
