import * as fs from 'fs';
import * as path from 'path';

export async function getLearningsResource(projectRoot: string): Promise<string> {
  const sections: string[] = [];

  const reviewPath = path.join(projectRoot, '.harness', 'review-learnings.md');
  if (fs.existsSync(reviewPath)) {
    sections.push('## Review Learnings\n\n' + fs.readFileSync(reviewPath, 'utf-8'));
  }

  const antiPath = path.join(projectRoot, '.harness', 'anti-patterns.md');
  if (fs.existsSync(antiPath)) {
    sections.push('## Anti-Pattern Log\n\n' + fs.readFileSync(antiPath, 'utf-8'));
  }

  return sections.length > 0 ? sections.join('\n\n---\n\n') : 'No learnings files found.';
}
