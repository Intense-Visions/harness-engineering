import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { WorkspaceConfig, Result, Ok, Err } from '@harness-engineering/types';
import { parseIntroducedHunks, type IntroducedHunk } from '../agent/quality-verdict.js';

/**
 * Structured event emitted when {@link WorkspaceManager.resolveBaseRef}
 * falls back past `origin/HEAD` and `origin/main`/`origin/master` to a
 * local-only ref. Operators see this in the dashboard's maintenance
 * event stream when the remote is misconfigured or unreachable.
 */
export interface BaseRefFallbackEvent {
  kind: 'baseref_fallback';
  /** The ref that was selected — `'main'`, `'master'`, or `'HEAD'`. */
  ref: string;
  /** Absolute path to the git repository root. */
  repoRoot: string;
}

/** Optional dependencies injected into {@link WorkspaceManager}. */
export interface WorkspaceManagerOptions {
  /**
   * Synchronous fire-and-forget callback invoked when {@link
   * WorkspaceManager.resolveBaseRef} falls back to a local-only ref.
   * When omitted, fallback emission is silently skipped.
   */
  emitEvent?: (event: BaseRefFallbackEvent) => void;
}

export class WorkspaceManager {
  private config: WorkspaceConfig;
  /** Absolute path to the git repository root (resolved lazily). */
  private repoRoot: string | null = null;
  /** Phase 3 (D6): emit baseref_fallback when fallback chain selects a local-only ref. */
  private emitEvent: ((event: BaseRefFallbackEvent) => void) | null;

  constructor(config: WorkspaceConfig, options: WorkspaceManagerOptions = {}) {
    this.config = config;
    this.emitEvent = options.emitEvent ?? null;
  }

  /** Runs a git command and returns stdout. Extracted for testability. */
  protected async git(args: string[], cwd: string): Promise<string> {
    const exec = promisify(execFile);
    try {
      // Large buffer so a hook's output (pre-push gauntlet can be verbose) isn't
      // truncated into a maxBuffer error that hides the real reason.
      const { stdout } = await exec('git', args, { cwd, maxBuffer: 32 * 1024 * 1024 });
      return stdout;
    } catch (err) {
      // Surface the hook/git output so a failed ship commit/push carries WHAT the
      // gate flagged (missing changeset, formatting, arch regression) into the
      // staged-gate retry feedback — the remediation loop needs it. Probe callers
      // (ls-remote / rev-parse) still catch-and-ignore; a richer message is harmless.
      const e = err as { stdout?: string; stderr?: string; message?: string };
      const detail = [e.stdout, e.stderr].filter(Boolean).join('\n').trim();
      throw new Error(
        detail ? `${e.message ?? 'git failed'}\n${detail}` : (e.message ?? String(err)),
        {
          cause: err,
        }
      );
    }
  }

  /** Backoff between PR-create retries. Overridable so tests don't actually wait. */
  protected async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Runs a `gh` CLI command and returns stdout. Extracted for testability
   * (mirrors {@link git}) so {@link shipWorkspace} can create a PR without
   * spawning the real `gh`. Array argv (execFile, no shell) so PR title/body
   * content can never break out into shell metacharacters.
   */
  protected async gh(args: string[], cwd: string): Promise<string> {
    const exec = promisify(execFile);
    const { stdout } = await exec('gh', args, { cwd });
    return stdout;
  }

  /**
   * Sanitizes an issue identifier to be safe for use as a directory name.
   */
  public sanitizeIdentifier(identifier: string): string {
    return identifier
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64);
  }

  /**
   * Resolves the full path for an issue's workspace.
   */
  public resolvePath(identifier: string): string {
    const sanitized = this.sanitizeIdentifier(identifier);
    return path.join(this.config.root, sanitized);
  }

  /**
   * AMR 4c: the lines the dispatched agent INTRODUCED in its worktree, as
   * per-hunk added-line blocks — the sound input for a baseline-relative quality
   * scan (pre-existing content is excluded by construction). Diffs the working
   * tree (so both committed AND uncommitted agent work is captured) against the
   * MERGE-BASE of the worktree HEAD and the base ref — merge-base, not the base
   * ref itself, so a base branch that advanced mid-dispatch never attributes
   * other merges to this agent. The seeded handoff overlay (`seedPaths`) is
   * excluded — those files are not the agent's work.
   */
  public async getIntroducedDiff(identifier: string): Promise<IntroducedHunk[]> {
    const workspacePath = path.resolve(this.resolvePath(identifier));
    const repoRoot = await this.getRepoRoot();
    const baseRef = await this.resolveBaseRef(repoRoot);
    const mergeBase = (await this.git(['merge-base', 'HEAD', baseRef], workspacePath)).trim();
    await this.markUntrackedIntentToAdd(workspacePath);
    const raw = await this.git(['diff', '--unified=0', mergeBase, '--', '.'], workspacePath);
    const seedPaths = this.config.seedPaths ?? WorkspaceManager.DEFAULT_SEED_PATHS;
    return parseIntroducedHunks(raw, seedPaths);
  }

  /**
   * AMR 4c v2: the SAME introduced change as {@link getIntroducedDiff}, but as the
   * RAW unified diff text (default context, NOT `--unified=0`) — the input an LLM
   * spec-satisfaction eval needs to judge whether the diff satisfies the spec.
   * Merge-base relative for the same reason (a base branch that advanced
   * mid-dispatch never attributes other merges here), and the seeded handoff
   * overlay is excluded via git `:(exclude)` pathspecs so the judge never reads
   * pre-seeded proposal/roadmap content as the agent's work.
   */
  public async getIntroducedDiffText(identifier: string): Promise<string> {
    const workspacePath = path.resolve(this.resolvePath(identifier));
    const repoRoot = await this.getRepoRoot();
    const baseRef = await this.resolveBaseRef(repoRoot);
    const mergeBase = (await this.git(['merge-base', 'HEAD', baseRef], workspacePath)).trim();
    const seedPaths = this.config.seedPaths ?? WorkspaceManager.DEFAULT_SEED_PATHS;
    // Normalize identically to seedWorkspace: relativize an absolute seed entry
    // against the repo root and drop anything that escapes it, so a git
    // `:(exclude)` pathspec always matches the same overlay that was seeded (an
    // un-relativized absolute path would be a silent no-op exclude, leaking the
    // seeded overlay into the eval diff). Array argv (no shell) makes each pathspec
    // a single literal arg — special chars can't break or inject.
    const excludes = [...seedPaths, ...WorkspaceManager.EVAL_DIFF_EXCLUDES]
      .map((p) => (path.isAbsolute(p) ? path.relative(repoRoot, p).replaceAll('\\', '/') : p))
      .filter((rel) => rel && rel !== '..' && !rel.startsWith('../') && !path.isAbsolute(rel))
      .map((rel) => `:(exclude)${rel}`);
    await this.markUntrackedIntentToAdd(workspacePath);
    return this.git(['diff', mergeBase, '--', '.', ...excludes], workspacePath);
  }

  /**
   * Mark untracked (non-ignored) files in the worktree as intent-to-add so a
   * subsequent `git diff` INCLUDES their full content. Without this, `git diff`
   * silently omits untracked files entirely — so a brand-NEW file the agent
   * created (e.g. a new rule module, not a modification of an existing one) is
   * invisible to the introduced-diff, and any spec-vs-diff judge concludes the
   * work is missing even though it is present and passing. `--intent-to-add`
   * respects `.gitignore` (build output / node_modules stay out) and leaves file
   * contents untouched; the residual index entries are harmless (the ship stages
   * with `git add -A` regardless). Best-effort: a failure falls back to the
   * tracked-only diff rather than blocking the eval/scan.
   */
  private async markUntrackedIntentToAdd(workspacePath: string): Promise<void> {
    try {
      await this.git(['add', '--intent-to-add', '--', '.'], workspacePath);
    } catch {
      // Non-fatal: without intent-to-add the diff is tracked-only (the prior
      // behavior), never an error that aborts the gate.
    }
  }

  /**
   * Discovers the git repository root from the workspace root directory.
   */
  private async getRepoRoot(): Promise<string> {
    if (this.repoRoot) return this.repoRoot;
    // Ensure the workspace root exists before using it as cwd for git.
    // On a fresh machine the directory may not have been created yet,
    // and execFile throws a misleading ENOENT ("spawn git ENOENT") when
    // the cwd doesn't exist.
    const root = path.resolve(this.config.root);
    await fs.mkdir(root, { recursive: true });
    const stdout = await this.git(['rev-parse', '--show-toplevel'], root);
    this.repoRoot = stdout.trim();
    return this.repoRoot;
  }

  /**
   * Ensures the workspace exists as a git worktree so the agent has
   * access to the full project source.
   *
   * Reuse-on-retry contract: when `opts.preserve` is true AND a valid
   * worktree already exists at the target path, the existing worktree is
   * returned untouched (`reused: true`) — skipping remove, `worktree add`,
   * and seeding — so a within-run retry preserves the agent's uncommitted
   * partial progress. Otherwise (the default, and every fresh dispatch /
   * orchestrator restart) the worktree is removed and recreated from the
   * latest base ref (`reused: false`), preserving the anti-stale guarantee.
   *
   * @param identifier - The issue/unit identifier for the workspace.
   * @param opts.preserve - When true, reuse an existing valid worktree
   *   instead of wiping it. Defaults false → current wipe-and-recreate flow.
   */
  public async ensureWorkspace(
    identifier: string,
    opts?: { preserve?: boolean }
  ): Promise<Result<{ path: string; reused: boolean }, Error>> {
    try {
      const workspacePath = path.resolve(this.resolvePath(identifier));

      // Reuse-on-retry: if the caller opted to preserve AND a valid worktree
      // already exists (same `.git` marker check used below), return it
      // untouched — skipping remove, recreate, and seeding — so a within-run
      // retry keeps the agent's uncommitted progress. Without a leftover
      // worktree we fall through to the fresh-create path (anti-stale).
      if (opts?.preserve === true) {
        try {
          await fs.access(path.join(workspacePath, '.git'));
          return Ok({ path: workspacePath, reused: true });
        } catch {
          // No valid worktree to preserve — proceed to fresh create below.
        }
      }

      // Remove any existing worktree so the agent always starts from the
      // latest base ref. Previously this path reused stale worktrees which
      // caused agents to work on outdated code after an orchestrator restart.
      try {
        await fs.access(path.join(workspacePath, '.git'));
        // Valid worktree exists — remove it so we recreate from latest base.
        const repoRoot = await this.getRepoRoot();
        try {
          await this.git(['worktree', 'remove', '--force', workspacePath], repoRoot);
        } catch {
          await fs.rm(workspacePath, { recursive: true, force: true });
        }
      } catch {
        // No .git marker — check for a stale directory from a partial run.
        try {
          await fs.access(workspacePath);
          const repoRoot = await this.getRepoRoot();
          try {
            await this.git(['worktree', 'remove', '--force', workspacePath], repoRoot);
          } catch {
            await fs.rm(workspacePath, { recursive: true, force: true });
          }
        } catch {
          // Directory doesn't exist — that's fine.
        }
      }

      const repoRoot = await this.getRepoRoot();

      // Best-effort fetch so origin/<default> reflects the latest remote
      // state. Silent on failure so offline / no-remote setups still work.
      await this.tryFetch(repoRoot);

      // Resolve the base ref (configured → auto-detected → fallbacks). We
      // create the worktree in detached mode so it can't collide with a
      // branch that is already checked out elsewhere.
      const baseRef = await this.resolveBaseRef(repoRoot);
      await this.git(['worktree', 'add', '--detach', workspacePath, baseRef], repoRoot);

      // Overlay uncommitted handoff artifacts (brainstorm proposal + promoted
      // roadmap row) from the root working tree. The worktree was just checked
      // out from a committed remote ref and would otherwise lack them, leaving
      // a dispatched agent with a roadmap entry but no proposal to work from.
      await this.seedWorkspace(workspacePath, repoRoot);

      return Ok({ path: workspacePath, reused: false });
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Best-effort `git fetch origin` so subsequent ref resolution sees the
   * latest remote state. Failures (offline, no remote, auth errors) are
   * swallowed — dispatch should not be blocked by transient network issues.
   */
  private async tryFetch(repoRoot: string): Promise<void> {
    try {
      await this.git(['fetch', 'origin', '--quiet'], repoRoot);
    } catch {
      // Intentional: proceed with whatever refs already exist locally.
    }
  }

  /**
   * Default paths seeded into a fresh worktree when {@link WorkspaceConfig.seedPaths}
   * is unset — the artifacts produced by the brainstorm → orchestrator handoff.
   */
  private static readonly DEFAULT_SEED_PATHS = ['.harness/proposals', 'docs/roadmap.md'];

  /**
   * Process artifacts excluded from the spec-vs-diff EVAL diff (on top of the
   * seed overlay) — they are NOT the agent's implementation:
   *   - `docs/changes` — the design stage's proposal/plan (the proposal IS the
   *     spec, re-included redundantly; the plan is planning).
   *   - `docs/roadmap.d` — roadmap shards written by the run.
   *   - `.pnpm-store` — the local package store (binary noise).
   * Why it matters: left in, these DWARF the actual code change (e.g. a ~280-line
   * proposal/plan vs a ~90-line rule+test) and let the judge conflate "described
   * in the proposal" with "implemented", so it reports the new file "missing"
   * among the noise. Validated end-to-end: excluding these flips the local
   * outcome-eval from a false NOT_SATISFIED to SATISFIED on a correct diff. The
   * 4c hunk scan keeps the fuller diff; only the eval text is narrowed.
   */
  private static readonly EVAL_DIFF_EXCLUDES = ['docs/changes', 'docs/roadmap.d', '.pnpm-store'];

  /**
   * Copies the configured seed paths from the root working tree into a
   * freshly-created worktree, overlaying the committed checkout.
   *
   * A new worktree is based on a committed remote ref, so it does not contain
   * uncommitted artifacts that exist only in the root working tree (a
   * just-written proposal under `.harness/proposals/`, a promoted row in
   * `docs/roadmap.md`). Seeding carries them over so a dispatched agent sees
   * the same state the orchestrator dispatched from.
   *
   * Best-effort by design: a missing source is skipped, and a copy failure is
   * swallowed — neither must ever block dispatch.
   */
  private async seedWorkspace(workspacePath: string, repoRoot: string): Promise<void> {
    const seedPaths = this.config.seedPaths ?? WorkspaceManager.DEFAULT_SEED_PATHS;
    for (const entry of seedPaths) {
      // Seed paths are repo-relative by convention, but a configured roadmap
      // location may arrive absolute. Relativize against the repo root and skip
      // anything that escapes it, so seeding can never copy a source from — or
      // write a destination — outside the worktree.
      const rel = path.isAbsolute(entry)
        ? path.relative(repoRoot, entry).replaceAll('\\', '/')
        : entry;
      if (!rel || rel === '..' || rel.startsWith('../') || path.isAbsolute(rel)) {
        continue;
      }
      const src = path.join(repoRoot, rel);
      try {
        // Only carry over what actually exists in the root working tree.
        await fs.access(src);
      } catch {
        continue;
      }
      const dest = path.join(workspacePath, rel);
      try {
        await fs.cp(src, dest, { recursive: true, force: true });
      } catch {
        // Seeding is an enhancement, not a precondition for dispatch.
      }
    }
  }

  /**
   * Resolves the ref that new worktrees should be based on.
   *
   * Priority order:
   *   1. `config.baseRef` (explicit override). Throws if it doesn't resolve.
   *   2. Default branch via `git symbolic-ref --short refs/remotes/origin/HEAD`.
   *   3. Remote fallbacks: `origin/main`, `origin/master`. (No event.)
   *   4. Local-only fallbacks: `main`, `master`. (Emits `baseref_fallback`.)
   *   5. `HEAD` as ultimate fallback. (Emits `baseref_fallback`.)
   *
   * Phase 3 / spec D6 / R4: when the priority chain falls past `origin/*`
   * to a local-only ref, the optional `emitEvent` callback (if injected)
   * is invoked exactly once with `{ kind: 'baseref_fallback', ref, repoRoot }`
   * so operators are warned when the remote is misconfigured or unreachable.
   */
  private async resolveBaseRef(repoRoot: string): Promise<string> {
    const configured = this.config.baseRef;
    if (configured) {
      if (await this.refExists(configured, repoRoot)) return configured;
      throw new Error(
        `Configured workspace.baseRef "${configured}" does not resolve in this repository`
      );
    }

    try {
      const stdout = await this.git(
        ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'],
        repoRoot
      );
      const detected = stdout.trim();
      if (detected) return detected;
    } catch {
      // origin/HEAD not set — fall through to known-name lookups.
    }

    // origin/* candidates are NOT fallbacks worth warning about — they
    // still ground the worktree on a remote tracking ref.
    for (const candidate of ['origin/main', 'origin/master']) {
      if (await this.refExists(candidate, repoRoot)) return candidate;
    }

    // Local-only candidates ARE worth warning about. Per spec D6, falling
    // past origin/* nearly always means the remote is misconfigured or
    // unreachable; the operator should know rather than have the
    // orchestrator silently dispatch agents from a local-only ref.
    for (const candidate of ['main', 'master']) {
      if (await this.refExists(candidate, repoRoot)) {
        this.emitFallback(candidate, repoRoot);
        return candidate;
      }
    }

    this.emitFallback('HEAD', repoRoot);
    return 'HEAD';
  }

  /**
   * Phase 3 (D6): emit a `baseref_fallback` event via the injected
   * callback (if any). Errors from the callback are swallowed so a
   * broken emitter does not block worktree dispatch.
   */
  private emitFallback(ref: string, repoRoot: string): void {
    if (!this.emitEvent) return;
    try {
      this.emitEvent({ kind: 'baseref_fallback', ref, repoRoot });
    } catch {
      // emitEvent must never block worktree creation. Swallow errors —
      // a broken emitter shouldn't take down dispatch.
    }
  }

  /** Returns true iff `git rev-parse --verify` accepts the ref. */
  private async refExists(ref: string, repoRoot: string): Promise<boolean> {
    try {
      await this.git(['rev-parse', '--verify', '--quiet', ref], repoRoot);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Checks if a workspace exists.
   */
  public async exists(identifier: string): Promise<boolean> {
    try {
      const workspacePath = this.resolvePath(identifier);
      await fs.access(workspacePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Checks whether a worktree has commits ahead of the base branch that have
   * been pushed to a remote branch. Returns the remote branch name if found,
   * or null if the worktree is on a detached HEAD with no pushed branch.
   */
  public async findPushedBranch(identifier: string): Promise<string | null> {
    try {
      const workspacePath = path.resolve(this.resolvePath(identifier));
      try {
        await fs.access(path.join(workspacePath, '.git'));
      } catch {
        return null;
      }

      // In detached HEAD worktrees the agent creates and pushes a branch.
      // Detect it by looking for remote branches whose tip matches HEAD.
      // We use %(refname) (full) instead of %(refname:short) because the short
      // form of refs/remotes/origin/HEAD is "origin" — not "origin/HEAD" — which
      // defeats the skip check and can be mistaken for a real branch.
      const head = (await this.git(['rev-parse', 'HEAD'], workspacePath)).trim();
      const refs = (
        await this.git(
          ['for-each-ref', '--format=%(refname) %(objectname)', 'refs/remotes/origin/'],
          workspacePath
        )
      ).trim();

      if (!refs) return null;

      const PREFIX = 'refs/remotes/origin/';
      for (const line of refs.split('\n')) {
        const spaceIdx = line.indexOf(' ');
        if (spaceIdx < 0) continue;
        const refName = line.slice(0, spaceIdx);
        const sha = line.slice(spaceIdx + 1);
        if (!refName || !sha) continue;
        // Skip the symbolic HEAD pointer and default branches — these match
        // HEAD on freshly-created worktrees and are never agent-pushed branches.
        const short = refName.startsWith(PREFIX) ? refName.slice(PREFIX.length) : refName;
        if (short === 'HEAD' || short === 'main' || short === 'master') continue;
        // Agent-pushed branches always use a prefix with a slash (e.g. feat/..., fix/...).
        // Reject anything without a slash to catch symbolic refs or other non-agent branches
        // that slip past the skip-list above.
        if (!short.includes('/')) continue;
        if (sha === head) {
          return short;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Checks whether a branch exists on the remote by querying `git ls-remote`.
   * Returns false if the branch is not found or the command fails.
   */
  public async branchExistsOnRemote(branch: string): Promise<boolean> {
    try {
      const repoRoot = await this.getRepoRoot();
      const result = await this.git(['ls-remote', '--heads', 'origin', branch], repoRoot);
      return result.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * staged-verify-gate-convergence D4 — deterministically SHIP a worktree's
   * accumulated work. A local staged unit's worktree is a DETACHED-HEAD git
   * worktree whose acceptance gate just passed, but the weak local model often
   * skips push+PR (LESSONS.md #874). This commits the uncommitted work, creates
   * a SLASH-prefixed branch `orchestrator/<identifier>` (so {@link
   * findPushedBranch} recognizes it), pushes it, and opens a PR via `gh pr
   * create` — so the existing `cleanWorkspaceWithGuard` "branch pushed + PR
   * exists" path fires and the PR-merge auto-dones the roadmap row (the loop
   * stops).
   *
   * Fully GUARDED / fail-safe: every step is awaited inside one try/catch and any
   * failure returns `Err` (never throws out), so the caller can treat a ship
   * failure as a BLOCK (retry) rather than a silent success.
   *
   * IDEMPOTENT / RESUMABLE (IMPORTANT #1). A prior partial ship (push landed but
   * `gh pr create` failed — gh down/unauth/5xx) leaves a pushed remote branch AND
   * a local `orchestrator/<id>` branch in the PR-preserved worktree. Calling ship
   * again MUST converge to exactly one PR and never error on the pre-existing
   * branch. So each mutating step is preceded by an existence probe:
   *   - branch pushed + an OPEN PR already covers it ⇒ ALREADY DONE (return that
   *     PR; no duplicate).
   *   - branch exists locally ⇒ `git switch` (no `-c`) instead of `switch -c`.
   *   - branch pushed but NO PR ⇒ skip the push, resume at `gh pr create`.
   *
   * Sequence (in the worktree):
   *   0. `branchExistsOnRemote` + `openPrForBranch` — if pushed AND an open PR
   *      exists, return it (idempotent short-circuit; no git/gh mutation).
   *   1. `git add -A`; `git commit -m <msg>` — ONLY when `status --porcelain`
   *      reports changes (a no-op commit would exit non-zero and must not error
   *      the flow — the accumulated work may already be committed).
   *   2. `git switch [-c] orchestrator/<identifier>` — `-c` only when the branch
   *      does not already exist locally.
   *   3. `git push -u origin orchestrator/<identifier>` — skipped when already pushed.
   *   4. `gh pr create --head <branch> --base <default> --title <t> --body <b>`.
   *
   * @returns the created (or pre-existing) branch name and the PR URL on success.
   */
  public async shipWorkspace(
    identifier: string,
    opts: { title: string; body: string; workspacePath?: string }
  ): Promise<Result<{ branch: string; prUrl?: string }, Error>> {
    try {
      // S1: prefer the caller's ALREADY-KNOWN, gate-verified worktree path so the
      // ship commits EXACTLY the worktree whose acceptance gate passed — eliminating
      // a divergent `resolvePath(identifier)` re-derivation (they can differ if the
      // identifier's sanitized form ever drifts from the live dispatch path). Falls
      // back to the derived path for any caller that does not thread it.
      const workspacePath = path.resolve(opts.workspacePath ?? this.resolvePath(identifier));
      const branch = `orchestrator/${this.sanitizeIdentifier(identifier)}`;

      // IMPORTANT #1 — RESUMABILITY. A prior partial ship (push OK, `gh pr create`
      // failed) leaves a pushed remote branch AND a local `orchestrator/<id>`
      // branch in the PR-preserved worktree. This retry MUST converge to the same
      // single PR, never error on the pre-existing branch, never duplicate a PR.
      // Probe the remote branch + open-PR state UP FRONT: if the branch is pushed
      // AND an open PR already covers it, the ship is ALREADY DONE — return that
      // PR without touching git/gh again (no duplicate).
      const remoteExists = await this.branchExistsOnRemote(branch);
      if (remoteExists) {
        const existingPr = await this.openPrForBranch(branch, workspacePath);
        if (existingPr !== null) {
          return Ok(existingPr.length > 0 ? { branch, prUrl: existingPr } : { branch });
        }
      }

      // 1. Commit the accumulated uncommitted work — but only if the tree is
      //    dirty. A `git commit` on a clean tree exits non-zero; probing
      //    porcelain status first keeps a no-op commit from failing the flow.
      const status = (await this.git(['status', '--porcelain'], workspacePath)).trim();
      if (status.length > 0) {
        await this.git(['add', '-A'], workspacePath);
        // Commit THROUGH the real pre-commit gate (no --no-verify): the autonomous
        // ship must not bypass the gates a human push hits — it fixes what they flag,
        // like a real session. The worktree's `afterCreate` builds the CLI so
        // `harness ci check` actually runs here instead of dying on a missing dist. If
        // a hook blocks (arch regression, missing changeset, formatting), the commit
        // throws → shipWorkspace returns Err → the staged gate re-dispatches with the
        // hook output as feedback so the NEXT attempt addresses it.
        await this.git(
          ['commit', '-m', opts.title || `orchestrator: ${identifier}`],
          workspacePath
        );
      }

      // 2. Move onto the SLASH-prefixed branch. On a RESUMED ship the branch may
      //    already exist locally (the prior attempt created it before failing at
      //    PR-create) — a blind `switch -c` would error. Probe first: switch WITHOUT
      //    `-c` to an existing branch, else create it. (If we are already on it, a
      //    plain `switch` is a harmless no-op.)
      const localExists = await this.localBranchPresent(branch, workspacePath);
      await this.git(localExists ? ['switch', branch] : ['switch', '-c', branch], workspacePath);

      // 3. Push it, setting upstream so the branch exists on the remote — UNLESS it
      //    is already pushed (a resumed ship whose push already landed), in which
      //    case skip straight to PR creation.
      if (!remoteExists) {
        // Push THROUGH the real pre-push gauntlet (changeset / format:check /
        // reference-docs) — same principle as the commit: don't bypass, satisfy. A
        // block throws → Err → re-dispatch with feedback so the run adds the changeset,
        // formats, etc. and converges to a mergeable PR.
        await this.git(['push', '-u', 'origin', branch], workspacePath);
      }

      // 4. Open the PR against the resolved default branch. Reuses the
      //    pr-manager gh-create arg pattern (array argv, no shell). resolveBaseRef
      //    may return an `origin/<name>` tracking ref — gh wants a plain branch
      //    name for --base, so strip an `origin/` prefix (default to `main`).
      const repoRoot = await this.getRepoRoot();
      const rawBase = await this.resolveBaseRef(repoRoot);
      const base = rawBase.startsWith('origin/') ? rawBase.slice('origin/'.length) : rawBase;
      const prArgs = [
        'pr',
        'create',
        '--head',
        branch,
        '--base',
        base || 'main',
        '--title',
        opts.title,
        '--body',
        opts.body,
      ];
      // Run `gh pr create` from the REPO ROOT, not the detached worktree: gh infers
      // repo/head context from the working dir, and a detached-HEAD worktree makes it
      // fail (the branch is pushed + explicit via --head, but gh still trips) — the
      // observed "ship failed: gh pr create" while the branch was already on origin.
      // Retry too, to absorb the push→PR propagation race (a just-pushed branch can be
      // briefly invisible: "No commits between …") and transient gh/API blips. Bounded;
      // the backoff is an overridable seam so tests don't wait.
      let prUrl = '';
      let lastErr: Error | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) await this.sleep(2000 * attempt);
        try {
          prUrl = (await this.gh(prArgs, repoRoot)).trim();
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err instanceof Error ? err : new Error(String(err));
        }
      }
      if (lastErr !== null) throw lastErr;

      return Ok(prUrl.length > 0 ? { branch, prUrl } : { branch });
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * IMPORTANT #1 helper — true iff a LOCAL branch `refs/heads/<branch>` exists.
   * Used by {@link shipWorkspace} to pick `switch` vs `switch -c` so a resumed
   * ship never errors on the branch its prior attempt already created. Reuses the
   * {@link refExists} `rev-parse --verify --quiet` probe (exit-1 ⇒ absent). Never
   * throws — an unexpected failure reports "absent" so the caller falls back to
   * the create path (which surfaces any real error at `switch -c` time, guarded).
   */
  private async localBranchPresent(branch: string, cwd: string): Promise<boolean> {
    return this.refExists(`refs/heads/${branch}`, cwd);
  }

  /**
   * IMPORTANT #1 helper — the URL of an OPEN pull request whose head is `branch`,
   * or `null` if none. Used by {@link shipWorkspace} to treat a pushed-branch +
   * open-PR world as ALREADY SHIPPED (no duplicate PR). Queries `gh pr list --head
   * <branch> --state open --json url`. A non-empty JSON array ⇒ a PR exists; its
   * `url` (when parseable) is returned so the caller can surface it. Any failure
   * (gh down/unauth) returns `null` (⇒ "no known PR"): the caller then RESUMES at
   * `gh pr create`, which is itself guarded — so a transient gh error never strands.
   */
  private async openPrForBranch(branch: string, cwd: string): Promise<string | null> {
    try {
      const out = (
        await this.gh(['pr', 'list', '--head', branch, '--state', 'open', '--json', 'url'], cwd)
      ).trim();
      if (!out) return null;
      const parsed = JSON.parse(out) as Array<{ url?: string }>;
      if (!Array.isArray(parsed) || parsed.length === 0) return null;
      return parsed[0]?.url ?? '';
    } catch {
      return null;
    }
  }

  /**
   * Deletes remote branches whose PRs are merged and that are older than
   * `maxAgeDays`. Only considers branches matching agent naming conventions
   * (feat/*, fix/*). Returns the list of deleted branch names.
   *
   * Requires a `checkPR` callback so this class doesn't depend on PRDetector
   * directly. The orchestrator wires this up at call time.
   */
  public async sweepStaleBranches(opts: {
    maxAgeDays: number;
    checkPR: (branch: string) => Promise<{ found: boolean; error?: string }>;
  }): Promise<string[]> {
    const deleted: string[] = [];
    try {
      const repoRoot = await this.getRepoRoot();
      const refs = (
        await this.git(
          [
            'for-each-ref',
            '--format=%(refname) %(committerdate:unix)',
            'refs/remotes/origin/feat/',
            'refs/remotes/origin/fix/',
          ],
          repoRoot
        )
      ).trim();

      if (!refs) return deleted;

      const PREFIX = 'refs/remotes/origin/';
      const cutoffUnix = Date.now() / 1000 - opts.maxAgeDays * 86400;
      const candidates: Array<{ short: string; age: number }> = [];

      for (const line of refs.split('\n')) {
        const spaceIdx = line.lastIndexOf(' ');
        if (spaceIdx < 0) continue;
        const refName = line.slice(0, spaceIdx);
        const unixStr = line.slice(spaceIdx + 1);
        const unix = parseInt(unixStr, 10);
        if (isNaN(unix) || unix > cutoffUnix) continue;
        const short = refName.startsWith(PREFIX) ? refName.slice(PREFIX.length) : refName;
        candidates.push({ short, age: unix });
      }

      // Throttle to 3 concurrent gh CLI calls
      const concurrency = 3;
      for (let i = 0; i < candidates.length; i += concurrency) {
        const batch = candidates.slice(i, i + concurrency);
        const results = await Promise.allSettled(
          batch.map(async ({ short }) => {
            const pr = await opts.checkPR(short);
            return { short, pr };
          })
        );
        for (const result of results) {
          if (result.status !== 'fulfilled') continue;
          const { short, pr } = result.value;
          if (!pr.found || pr.error) continue;
          // PR exists and was found without error — safe to delete the remote branch
          try {
            await this.git(['push', 'origin', '--delete', short], repoRoot);
            deleted.push(short);
          } catch {
            // Deletion failed (permissions, already deleted, etc.) — skip
          }
        }
      }
    } catch {
      // Sweep is best-effort; don't fail the tick
    }
    return deleted;
  }

  /**
   * Removes a workspace directory and its git worktree registration.
   */
  public async removeWorkspace(identifier: string): Promise<Result<void, Error>> {
    try {
      const workspacePath = path.resolve(this.resolvePath(identifier));

      // Try to remove via git worktree first (cleans up .git/worktrees entry).
      try {
        const repoRoot = await this.getRepoRoot();
        await this.git(['worktree', 'remove', '--force', workspacePath], repoRoot);
      } catch {
        // If git worktree remove fails (not a worktree, already removed, etc.),
        // fall back to plain directory removal.
        await fs.rm(workspacePath, { recursive: true, force: true });
      }

      return Ok(undefined);
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
