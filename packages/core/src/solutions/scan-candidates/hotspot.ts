import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { normalizeSince } from './git-scan';

const execFileAsync = promisify(execFile);

export interface HotspotOptions {
  since: string;
  cwd: string;
  threshold: number; // file appears more than `threshold` times in window
}

export interface Hotspot {
  path: string;
  churn: number;
}

export async function computeHotspots(opts: HotspotOptions): Promise<Hotspot[]> {
  let stdout: string;
  try {
    const r = await execFileAsync(
      'git',
      ['log', `--since=${normalizeSince(opts.since)}`, '--name-only', '--format='],
      { cwd: opts.cwd, maxBuffer: 16 * 1024 * 1024 }
    );
    stdout = r.stdout;
  } catch {
    return [];
  }
  const counts = new Map<string, number>();
  for (const line of stdout.split('\n')) {
    const path = line.trim();
    if (path.length === 0) continue;
    counts.set(path, (counts.get(path) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, c]) => c > opts.threshold)
    .map(([path, churn]) => ({ path, churn }))
    .sort((a, b) => b.churn - a.churn);
}
