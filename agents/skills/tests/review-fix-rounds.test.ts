// agents/skills/tests/review-fix-rounds.test.ts
//
// Shift-left pipeline fidelity, unit 2: fix rounds. A review run again after a fix commit is a
// new round; both skills state when a round ends, how it is archived and what the gate checks.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const skill = (name: string) =>
  readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '..', 'claude-code', name, 'SKILL.md'),
    'utf-8'
  );
const autopilot = () => skill('harness-autopilot');
/** The text from a heading to the next heading of the same or higher level. */
const section = (text: string, heading: string): string => {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start < 0) throw new Error(`heading not found: ${heading}`);
  const level = heading.indexOf(' ');
  const end = lines.findIndex((l, i) => i > start && /^#+ /.test(l) && l.indexOf(' ') <= level);
  return lines.slice(start, end < 0 ? undefined : end).join('\n');
};
const codeReview = () => skill('harness-code-review');
/** The one paragraph (or list item) that starts with `start`. */
const paragraph = (text: string, start: string) => {
  const i = text.indexOf(start);
  if (i < 0) throw new Error(`not found: ${start}`);
  const end = text.indexOf('\n\n', i);
  return text.slice(i, end < 0 ? undefined : end);
};

describe('autopilot, Review records, Fix rounds', () => {
  const rounds = () => section(autopilot(), '### Review records');
  it('the round is 1 + the archives, and only a fix commit starts a new one', () => {
    const text = rounds();
    expect(text).not.toMatch(/\*\*After a fix\.\*\*/);
    expect(text).toMatch(
      /The round of a review is 1 \+ the number of `round-R\/` archives in its review directory \(`R` a positive integer without leading zeros\), and nothing else: not whether the directory holds a receipt now\. Only a fix commit starts a new round\./
    );
    expect(text).toMatch(
      /A review run again at the same head \(after a crash, to rewrite the receipt's counts, or as a `re-run` after a failed gate\) stays in its round: it archives nothing, and its reviewers and this session overwrite that round's files\./
    );
  });
  it('archives with the CLI only after a round wrote a receipt, and only after a fix commit', () => {
    const text = rounds();
    expect(text).toMatch(
      /If the review directory holds a `receipt\.json` and HEAD is not that receipt's `diff\.head`, the round it records has ended: archive it with `harness check-review-receipt --archive-round \{review directory\}`\. Archive only after a round wrote a receipt\./
    );
    expect(text).toContain('`archived round R into round-R/; the next review is round R+1`');
    expect(text).toMatch(/a staging directory first and renames that to `round-R\/` in one step/);
    for (const refusal of [
      /when the directory holds no `receipt\.json` \(a round that wrote no receipt is not a round\)/,
      /when HEAD is still the head it reviewed \(a fix round needs a fix commit\)/,
      /when the path is not a review directory/,
      /when the archives present are not numbered `round-1` to `round-\(R-1\)`/,
    ]) {
      expect(text).toMatch(refusal);
    }
  });
  it('the new receipt records round and priorRounds, and the gate checks them', () => {
    const text = rounds();
    expect(text).toMatch(
      /Write the new receipt with `"round"` set to the next round the command printed \(1 \+ the archives\) and `"priorRounds"` listing every archived round once/
    );
    expect(text).toMatch(/fail `ROUND_MISMATCH`/);
    expect(text).toMatch(/fails `PRIOR_ROUNDS_MISMATCH`/);
    expect(text).toMatch(
      /a round after the first whose `diff\.head` is the head the round before it reviewed fails `ROUND_SAME_HEAD`/
    );
  });
  it('an attempt that wrote no receipt keeps its round and archives nothing', () => {
    expect(rounds()).toMatch(
      /An attempt that wrote no receipt is not a round: a failed mechanical phase, and a stop or a crash after the archive and before the receipt is written, leave the round number where it was/
    );
    expect(section(autopilot(), '### REVIEW')).toMatch(
      /No receipt was written for this attempt, so it is not a round: the review that follows keeps this attempt's round number/
    );
  });
  it('a moved HEAD re-runs all as a fix round; every override names its round', () => {
    expect(rounds()).toMatch(
      /when HEAD has moved since the review, re-run all whatever the codes, as a fix round \(Fix rounds: archive the ended round first\)/
    );
    expect(paragraph(autopilot(), '**Overrides.**')).toMatch(
      /the round of this review: 1 \+ the `round-R\/` archives in its review directory \(the receipt's `round` when it has one that passed the round check; an override applies only to that round's receipt\)/
    );
  });
  it('an interrupted archive is finished or undone by the next --archive-round; the gate fails until then', () => {
    const text = rounds();
    expect(text).not.toMatch(/so a failure leaves the round where it was/);
    expect(text).toMatch(
      /moving `receipt\.json` last\. An error moves the files back, so the round is archived whole or not at all\. An interruption \(the session dies mid-archive\) leaves the staging directory `\.round-R\.partial`: the gate fails `ROUND_ARCHIVE_INTERRUPTED` while it exists, and the next `--archive-round` finishes the archive \(`completed an interrupted archive of round R`, when the staging directory holds the receipt\) or moves its files back and then archives/
    );
    for (const refusal of [
      /when that receipt is not a readable review receipt or not a regular file/,
      /when a staging directory is not the next archive's, or holds a file the review directory also holds/,
    ]) {
      expect(text).toMatch(refusal);
    }
  });
  it('an unreadable ended receipt is rewritten at its old head, then archived; never deleted', () => {
    expect(rounds()).toMatch(
      /When it refuses the ended round's receipt as unreadable, rewrite that `receipt\.json` from the round's findings files at the head they record \(as \*\*rewrite receipt\*\* does\), then archive; never delete it\./
    );
  });
  it('priorRounds blocking is the count the archived findings files hold', () => {
    expect(rounds()).toMatch(
      /`\{ "round": r, "head": "<diff\.head of round-r\/receipt\.json>", "blocking": <the blocking findings in round-r's findings files> \}`/
    );
  });
  it('the Retry table repairs an interrupted archive with --archive-round', () => {
    expect(autopilot()).toMatch(
      /\| `ROUND_ARCHIVE_INTERRUPTED` +\| before any other row: run `harness check-review-receipt --archive-round \{review directory\}` to finish or undo the archive, then gate again; when it refuses, stop for the human +\|/
    );
  });
});

describe('autopilot, REVIEW and FINAL_REVIEW point at Fix rounds', () => {
  it('REVIEW step 3 archives only when HEAD moved, and keeps the round at the same head', () => {
    expect(section(autopilot(), '### REVIEW')).toMatch(
      /If it already holds a `receipt\.json` and HEAD is not its `diff\.head`, the round that receipt records has ended and this review is a fix round: archive it as Review records, Fix rounds, says before dispatching\. At the same head the review stays in that round and overwrites its files\./
    );
  });
  it('REVIEW fix, FINAL_REVIEW directory, FINAL_REVIEW fix and OUTCOME_EVAL fix are fix rounds', () => {
    const text = autopilot();
    expect(text).not.toMatch(/After a fix\)/);
    expect(text).toMatch(/`fix`: re-enter EXECUTE; the review that follows is a fix round/);
    expect(text).toMatch(
      /when it already holds a `receipt\.json` whose `diff\.head` is not HEAD, this is a fix round: archive it first \(Review records, Fix rounds\)/
    );
    expect(text).toMatch(/Re-run FINAL_REVIEW from step 1, as a new round at the new head/);
    expect(text).toMatch(/return to FINAL_REVIEW step 1 \(a new round at the new head\)/);
  });
  it('the gate step names the round codes', () => {
    expect(section(autopilot(), '### REVIEW')).toMatch(
      /a `round` or `priorRounds` that does not match the `round-R\/` archives \(`ROUND_MISMATCH`, `PRIOR_ROUNDS_MISMATCH`\), a fix round at the head the round before it reviewed \(`ROUND_SAME_HEAD`\) or an archive left interrupted beside it \(`ROUND_ARCHIVE_INTERRUPTED`\)/
    );
  });
});

describe('code-review, Review Receipt, rounds', () => {
  it('states the same archive condition as autopilot', () => {
    const bullet = paragraph(codeReview(), '- `round` and `priorRounds` are set only');
    expect(bullet).toMatch(/Archive only after a round wrote a receipt/);
    expect(bullet).toMatch(
      /refuses a directory with no `receipt\.json` \(a round that wrote none is not a round\), a path that is not a review directory, archives not numbered `round-1` to `round-\(R-1\)`, and a HEAD that is still the head the ended round reviewed \(a fix round needs a fix commit\), and a `receipt\.json` that is unreadable or not a regular file, and on an error it moves nothing/
    );
    expect(bullet).toMatch(
      /A review run again at the same head .* stays in its round and overwrites its files/
    );
    expect(bullet).not.toMatch(/on any failure it moves nothing/);
    expect(bullet).toMatch(
      /on an error it moves nothing\. An interrupted archive leaves `\.round-R\.partial`: the gate fails `ROUND_ARCHIVE_INTERRUPTED` until the next `--archive-round` finishes or undoes it/
    );
    expect(bullet).toMatch(/the blocking findings each archive's own findings files hold/);
  });
  it('the code table states each round condition', () => {
    const rows = new Map(
      codeReview()
        .split('\n')
        .map((l) => /^\| `([A-Z_]+)` +\| (.*) \|$/.exec(l))
        .filter((m): m is RegExpExecArray => m !== null)
        .map((m) => [m[1], m[2]])
    );
    expect(rows.get('ROUND_MISMATCH')).toMatch(
      /not numbered `round-1` to `round-n`, or `round` \(absent: 1\) is not 1 \+ the number of those archives/
    );
    expect(rows.get('PRIOR_ROUNDS_MISMATCH')).toMatch(
      /the blocking findings that archive's own findings files hold, or an archive has no readable receipt or findings file/
    );
    expect(rows.get('ROUND_ARCHIVE_INTERRUPTED')).toMatch(
      /a `\.round-R\.partial` staging directory is in the review directory: an archive was interrupted; `--archive-round` finishes or undoes it/
    );
    expect(rows.get('ROUND_SAME_HEAD')).toMatch(/a fix round needs a fix commit/);
  });
  it('the tool summary names --archive-round', () => {
    expect(codeReview()).toMatch(
      /`--archive-round <review directory>` archives an ended round before a fix round/
    );
  });
});
