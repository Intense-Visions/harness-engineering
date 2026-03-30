#!/usr/bin/env npx tsx
/**
 * Backfill existing learnings.md entries with frontmatter hash comments.
 *
 * Non-destructive: adds <!-- hash:XXXX tags:a,b --> comments before entries
 * that do not already have them. Does not modify entry content.
 *
 * Usage: npx tsx packages/core/scripts/backfill-learnings-frontmatter.ts <path-to-learnings.md>
 */
import * as fs from 'fs';
import * as crypto from 'crypto';

function computeHash(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 8);
}

function extractTags(line: string): string[] {
  const tags: string[] = [];
  const skillMatch = line.match(/\[skill:([^\]]+)\]/);
  if (skillMatch?.[1]) tags.push(skillMatch[1]);
  const outcomeMatch = line.match(/\[outcome:([^\]]+)\]/);
  if (outcomeMatch?.[1]) tags.push(outcomeMatch[1]);
  return tags;
}

function backfill(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const output: string[] = [];
  let modified = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const isDatedBullet = /^- \*\*\d{4}-\d{2}-\d{2}/.test(line);
    const isHeading = /^## \d{4}-\d{2}-\d{2}/.test(line);

    if (isDatedBullet || isHeading) {
      // Check if previous non-empty line is already a frontmatter comment
      const prevLine = output.length > 0 ? output[output.length - 1] : '';
      const hasFrontmatter = prevLine !== undefined && /^<!--\s+hash:[a-f0-9]+/.test(prevLine);

      if (!hasFrontmatter) {
        const hash = computeHash(line);
        const tags = extractTags(line);
        const tagsStr = tags.length > 0 ? ` tags:${tags.join(',')}` : '';
        output.push(`<!-- hash:${hash}${tagsStr} -->`);
        modified++;
      }
    }

    output.push(line);
  }

  fs.writeFileSync(filePath, output.join('\n'));
  console.log(`Backfilled ${modified} entries in ${filePath}`);
}

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: npx tsx backfill-learnings-frontmatter.ts <path-to-learnings.md>');
  process.exit(1);
}

backfill(filePath);
