import { execFileSync } from 'node:child_process';
import { escape } from 'minimatch';

/**
 * Exclude globs, relative to `rootDir`, for every path git ignores there.
 *
 * Asks git itself (`git ls-files --others --ignored --exclude-standard
 * --directory`) rather than re-parsing `.gitignore`, so nested `.gitignore`
 * files, negations, `.git/info/exclude` and the global excludes file all apply
 * with git's own semantics. Only UNTRACKED ignored paths are listed: a file
 * that is ignored by a rule but tracked anyway is in every CI checkout, so it
 * stays analysed. `--directory` collapses a wholly-ignored directory into one
 * `dir/` entry, which becomes a `dir/**` glob.
 *
 * Returns `[]` when `rootDir` is not inside a git work tree or git is not
 * available — the caller then analyses what it would have analysed before.
 */
export function gitIgnoredExcludeGlobs(rootDir: string): string[] {
  let out: string;
  try {
    out = execFileSync(
      'git',
      ['ls-files', '-z', '--others', '--ignored', '--exclude-standard', '--directory'],
      {
        cwd: rootDir,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
        maxBuffer: 64 * 1024 * 1024,
      }
    );
  } catch {
    return [];
  }
  const globs: string[] = [];
  for (const entry of out.split('\0')) {
    if (entry === '') continue;
    const rel = entry.replaceAll('\\', '/');
    // `magicalBraces`: a literal `{a,b}` in a filename must not brace-expand.
    const literal = escape(rel, { magicalBraces: true });
    globs.push(rel.endsWith('/') ? `${literal}**` : literal);
  }
  return globs;
}
