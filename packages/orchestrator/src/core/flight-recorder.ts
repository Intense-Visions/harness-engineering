import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

/**
 * Orchestrator flight recorder ("black-box").
 *
 * A first-class, always-on forensic record of a single orchestrator RUN (one
 * process lifetime). The per-issue {@link StreamRecorder} already captures what
 * each dispatch DID (attempts, tools, tokens, outcome); this ties a whole run
 * together with the two things a stream can't answer on its own:
 *
 *   1. PROVENANCE — exactly WHICH code/config produced the run (git HEAD, node,
 *      harness version, the resolved backends + routing). Without it, a verdict
 *      ("shipped" / "looped" / "needs-human") is unfalsifiable: you can't tell a
 *      real convergence from one that ran stale code or an off-goal config.
 *   2. VERDICTS — the terminal disposition of each unit (shipped / needs-human /
 *      gate-blocked) WITH the gate reason, which otherwise lives only in the
 *      process's stdout log and in-memory retry state.
 *
 * Written durably to `<workspace.root>/../black-box/<runId>/run.json` so any past
 * run can be read back and analyzed later (see the `orchestrator black-box` CLI).
 *
 * DESIGN: every method is best-effort and NEVER throws — a recorder failure must
 * not break a dispatch. Reads are static so a CLI can inspect runs without
 * constructing an Orchestrator.
 */

export interface ProvenanceBackend {
  name: string;
  type: string;
  endpoint?: string;
  model?: string;
}

export interface RunProvenance {
  gitHead: string | null;
  gitSubject: string | null;
  branch: string | null;
  harnessVersion: string | null;
  node: string;
  backends: ProvenanceBackend[];
  routing: { default?: string; modes?: Record<string, string> };
}

export type Verdict = 'shipped' | 'needs-human' | 'gate-blocked' | 'error' | 'in-progress';

export interface UnitVerdict {
  issueId: string;
  identifier: string;
  verdict: Verdict;
  attempt: number | null;
  /** Truncated gate/verify reason when the disposition is a block or escalation. */
  gateReason?: string;
  /** Number of times the enforced gate blocked this unit across the run. */
  gateBlocks: number;
  pr?: number;
  backend?: string;
  updatedAt: string;
}

export interface RunRecord {
  runId: string;
  orchestratorId: string | null;
  startedAt: string;
  endedAt: string | null;
  provenance: RunProvenance;
  /** Keyed by issueId; last-write-wins on verdict, gateBlocks accumulates. */
  units: Record<string, UnitVerdict>;
}

interface RecorderLogger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
}

/** Keep gate reasons readable in the record without swallowing the whole verify dump. */
const MAX_GATE_REASON = 2000;

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}\n…(${s.length - max} more chars truncated)`;
}

/**
 * Best-effort provenance from the resolved config + the git working tree. Git is
 * optional (adopters may run outside a repo) — every probe degrades to null.
 * `execFile` is injectable so tests never shell out.
 */
export function gatherProvenance(
  config: {
    agent?: {
      backends?: Record<string, { type?: string; endpoint?: string; model?: unknown }>;
      routing?: { default?: unknown; modes?: Record<string, unknown> };
    };
  },
  opts?: {
    cwd?: string;
    harnessVersion?: string | null;
    execFile?: (cmd: string, args: string[], cwd: string) => string;
  }
): RunProvenance {
  const cwd = opts?.cwd ?? process.cwd();
  const run =
    opts?.execFile ??
    ((cmd: string, args: string[], c: string) =>
      execFileSync(cmd, args, { cwd: c, encoding: 'utf-8' }).trim());
  const git = (args: string[]): string | null => {
    try {
      return run('git', args, cwd) || null;
    } catch {
      return null;
    }
  };

  const backendsIn = config.agent?.backends ?? {};
  const backends: ProvenanceBackend[] = Object.entries(backendsIn).map(([name, def]) => {
    const model = Array.isArray(def?.model)
      ? def.model.join(',')
      : typeof def?.model === 'string'
        ? def.model
        : undefined;
    return {
      name,
      type: def?.type ?? 'unknown',
      ...(def?.endpoint ? { endpoint: def.endpoint } : {}),
      ...(model ? { model } : {}),
    };
  });

  const routingIn = config.agent?.routing ?? {};
  const modesIn = routingIn.modes ?? {};
  const modes: Record<string, string> = {};
  for (const [k, v] of Object.entries(modesIn)) {
    if (typeof v === 'string') modes[k] = v;
  }

  return {
    gitHead: git(['rev-parse', 'HEAD']),
    gitSubject: git(['log', '-1', '--format=%s']),
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
    harnessVersion: opts?.harnessVersion ?? null,
    node: process.version,
    backends,
    routing: {
      ...(typeof routingIn.default === 'string' ? { default: routingIn.default } : {}),
      ...(Object.keys(modes).length > 0 ? { modes } : {}),
    },
  };
}

export class FlightRecorder {
  private readonly runDir: string;
  private record: RunRecord | null = null;

  constructor(
    baseDir: string,
    private readonly runId: string,
    private readonly logger: RecorderLogger
  ) {
    this.runDir = path.join(baseDir, runId);
  }

  /** Begin a run: pin provenance and write the initial record. Idempotent. */
  startRun(orchestratorId: string | null, provenance: RunProvenance): void {
    this.record = {
      runId: this.runId,
      orchestratorId,
      startedAt: new Date().toISOString(),
      endedAt: null,
      provenance,
      units: {},
    };
    this.flush();
    this.logger.info(`Flight recorder started run ${this.runId}`, { dir: this.runDir });
  }

  /**
   * Upsert a unit's disposition. `verdict:'gate-blocked'` increments the block
   * counter (the retry loop calls this once per block); terminal verdicts
   * (shipped/needs-human) overwrite it while preserving the accumulated count.
   */
  recordVerdict(v: {
    issueId: string;
    identifier: string;
    verdict: Verdict;
    attempt?: number | null;
    gateReason?: string;
    pr?: number;
    backend?: string;
  }): void {
    if (this.record === null) return;
    const prev = this.record.units[v.issueId];
    const gateBlocks = (prev?.gateBlocks ?? 0) + (v.verdict === 'gate-blocked' ? 1 : 0);
    this.record.units[v.issueId] = {
      issueId: v.issueId,
      identifier: v.identifier,
      verdict: v.verdict,
      attempt: v.attempt ?? prev?.attempt ?? null,
      gateBlocks,
      ...(v.gateReason
        ? { gateReason: truncate(v.gateReason, MAX_GATE_REASON) }
        : prev?.gateReason
          ? { gateReason: prev.gateReason }
          : {}),
      ...(v.pr !== undefined ? { pr: v.pr } : prev?.pr !== undefined ? { pr: prev.pr } : {}),
      ...(v.backend ? { backend: v.backend } : prev?.backend ? { backend: prev.backend } : {}),
      updatedAt: new Date().toISOString(),
    };
    this.flush();
  }

  /** Stamp the run's end. Safe to call more than once. */
  finishRun(): void {
    if (this.record === null) return;
    this.record.endedAt = new Date().toISOString();
    this.flush();
  }

  private flush(): void {
    if (this.record === null) return;
    try {
      fs.mkdirSync(this.runDir, { recursive: true });
      fs.writeFileSync(path.join(this.runDir, 'run.json'), JSON.stringify(this.record, null, 2));
    } catch (err) {
      this.logger.warn(`Flight recorder failed to persist run ${this.runId}`, {
        error: String(err),
      });
    }
  }

  // --- Read-back (static so a CLI needs no Orchestrator) ----------------------

  static getRun(baseDir: string, runId: string): RunRecord | null {
    try {
      const content = fs.readFileSync(path.join(baseDir, runId, 'run.json'), 'utf-8');
      // harness-ignore SEC-DES-001: reading self-written run.json — trusted internal source
      return JSON.parse(content) as RunRecord;
    } catch {
      return null;
    }
  }

  /** All runs, newest-started first. */
  static listRuns(baseDir: string): RunRecord[] {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(baseDir, { withFileTypes: true });
    } catch {
      return [];
    }
    const runs: RunRecord[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const run = FlightRecorder.getRun(baseDir, entry.name);
      if (run) runs.push(run);
    }
    runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return runs;
  }
}
