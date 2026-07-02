import { Command } from 'commander';
import { parseReferencedIssues } from '@harness-engineering/core';

/** Testable core: parse `text` and emit each issue number via `print`. */
export function runReferencedIssues(text: string, print: (line: string) => void): void {
  for (const n of parseReferencedIssues(text)) print(String(n));
}

/** `harness roadmap referenced-issues` — reads PR text from stdin, prints issue numbers (one per line). */
export function createRoadmapReferencedIssuesCommand(): Command {
  return new Command('referenced-issues')
    .description(
      'Parse issue references (#N, Closes/Fixes/Resolves #N, owner/repo#N) from stdin ' +
        'text (PR body + title) and print each issue number on its own line. Backstop ' +
        "for auto-done when a PR's closing keyword is malformed."
    )
    .action(async () => {
      const chunks: Buffer[] = [];
      for await (const c of process.stdin) chunks.push(c as Buffer);
      const text = Buffer.concat(chunks).toString('utf8');
      runReferencedIssues(text, (line) => process.stdout.write(line + '\n'));
    });
}
