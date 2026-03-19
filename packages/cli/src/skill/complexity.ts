// packages/cli/src/skill/complexity.ts
import { execFileSync } from 'child_process';

export type Complexity = 'light' | 'full' | 'auto';

interface Signals {
  fileCount: number;
  testOnly: boolean;
  docsOnly: boolean;
  newDir: boolean;
  newDep: boolean;
}

export function evaluateSignals(signals: Signals): 'light' | 'full' {
  // Full if any "full" signal is present
  if (signals.fileCount >= 3) return 'full';
  if (signals.newDir) return 'full';
  if (signals.newDep) return 'full';

  // Light if single file or test/docs only
  if (signals.fileCount <= 1) return 'light';
  if (signals.testOnly) return 'light';
  if (signals.docsOnly) return 'light';

  return 'full';
}

export function detectComplexity(projectPath: string): 'light' | 'full' {
  try {
    // Find base commit
    const base = execFileSync('git', ['merge-base', 'HEAD', 'main'], {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const diffFiles = execFileSync('git', ['diff', '--name-only', base], {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
      .trim()
      .split('\n')
      .filter(Boolean);

    const diffStat = execFileSync('git', ['diff', '--stat', base], {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const signals: Signals = {
      fileCount: diffFiles.length,
      testOnly: diffFiles.every((f) => f.match(/\.(test|spec)\./)),
      docsOnly: diffFiles.every((f) => f.startsWith('docs/') || f.endsWith('.md')),
      newDir:
        diffStat.includes('create mode') ||
        diffFiles.some((f) => {
          const parts = f.split('/');
          return parts.length > 1; // Rough heuristic
        }),
      newDep: diffFiles.some((f) =>
        ['package.json', 'Cargo.toml', 'go.mod', 'requirements.txt'].includes(f)
      ),
    };

    return evaluateSignals(signals);
  } catch {
    // No git context → default to full
    return 'full';
  }
}
