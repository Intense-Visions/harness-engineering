import { execFileSync } from 'node:child_process';

/**
 * The pull request a command reads and comments on, through `gh`. Not about review receipts:
 * the brief and its poster share it (one `gh pr view` a run), and so can any other reader of a
 * PR body. Imports nothing from the harness packages.
 */

const PR_NUMBER = /^[1-9][0-9]*$/;

/** A PR number, or undefined when the digits are past the safe integers (Number would round). */
function prNumberOf(digits: string): number | undefined {
  const n = Number(digits);
  return Number.isSafeInteger(n) ? n : undefined;
}

/**
 * The PR number from `--pr`, else from the `refs/pull/N/merge` (or `/head`) ref a pull_request
 * run has, else none. A value that is given and is not a PR number (digits only, no leading zero,
 * a safe integer) is an error, never "none": a silent fallback, or a number Number() rounded,
 * would read and comment on another PR.
 */
export function resolvePrNumber(
  flag: unknown,
  ref: string | undefined
): { ok: true; pr: number | undefined } | { ok: false; error: string } {
  if (flag !== undefined) {
    const pr = typeof flag === 'string' && PR_NUMBER.test(flag) ? prNumberOf(flag) : undefined;
    if (pr !== undefined) return { ok: true, pr };
    const got = JSON.stringify(flag);
    return { ok: false, error: `--pr must be a pull request number (digits only); got ${got}` };
  }
  if (ref === undefined || !/^refs\/pull\//.test(ref)) return { ok: true, pr: undefined };
  const n = /^refs\/pull\/([1-9][0-9]*)\/(?:merge|head)$/.exec(ref)?.[1];
  const pr = n === undefined ? undefined : prNumberOf(n);
  if (pr !== undefined) return { ok: true, pr };
  return { ok: false, error: `GITHUB_REF ${JSON.stringify(ref)} is not a pull request ref` };
}

/** A PR comment as the sticky upsert needs it: an id and a body. */
export interface PrComment {
  id: number;
  body: string;
}

/**
 * A pull request as the review commands read it. `headSha`: the PR's head commit, when known.
 * `comments`: its comments, when the reply listed them (the poster lists them itself otherwise).
 */
export interface PrRead {
  number: number;
  body: string;
  headSha?: string;
  comments?: PrComment[];
}

/**
 * A PR's number, body, head and comments: the PR `pr` names, else the current branch's.
 * undefined when the branch has no PR (gh says so). Throws when `gh` is absent, unauthenticated
 * or fails for any other reason, and on a reply it cannot make sense of (not JSON, not an
 * object, no positive integer `number`, a `body` that is not a string): that is "unknown", which
 * is not "no PR".
 */
export type PrReader = (cwd: string, pr?: number) => PrRead | undefined;

export const defaultPrReader: PrReader = (cwd, pr) => {
  const target = pr === undefined ? [] : [String(pr)];
  const args = ['pr', 'view', ...target, '--json', 'number,body,headRefOid,comments'];
  let raw: string;
  try {
    raw = execFileSync('gh', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    if (/no pull requests found/i.test(String((err as { stderr?: unknown }).stderr))) {
      return undefined;
    }
    throw err;
  }
  const parsed: unknown = JSON.parse(raw);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('gh pr view: the reply is not a JSON object');
  }
  const { number, body, headRefOid, comments } = { ...parsed } as Record<string, unknown>;
  if (typeof number !== 'number' || !Number.isSafeInteger(number) || number < 1) {
    throw new Error('gh pr view: the reply has no pull request number');
  }
  if (typeof body !== 'string') throw new Error('gh pr view: the reply has no body text');
  return {
    number,
    body,
    ...(typeof headRefOid === 'string' && { headSha: headRefOid }),
    ...(Array.isArray(comments) && { comments: commentsOf(comments) }),
  };
};

/** The comments of a `gh` reply that carry a numeric id and a string body. */
export function commentsOf(list: readonly unknown[]): PrComment[] {
  return list.flatMap((c) => {
    const { id, body } = { ...(c !== null && typeof c === 'object' ? c : {}) } as Record<
      string,
      unknown
    >;
    return typeof id === 'number' && typeof body === 'string' ? [{ id, body }] : [];
  });
}
