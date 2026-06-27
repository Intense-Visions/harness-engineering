// agents/skills/tests/interaction-channel.test.ts
//
// Guards the UX-channel invariant for skill prompts.
//
// `emit_interaction` with `type: 'question'` or `type: 'confirmation'` renders and
// records a prompt but does NOT display it to the human: the client collapses the
// call to "Called harness" and the rendered text only returns to the model. A skill
// that routes a user-facing ask through it leaves the human staring at "Called
// harness" while the agent narrates a question they cannot answer.
//
// User-facing asks must be made in PLAIN TEXT in the agent's own reply — the only
// channel that reliably reaches the human across every platform (Claude Code,
// Cursor, Codex, Gemini CLI). `AskUserQuestion` is Claude-Code-only and caps headers
// at 12 chars / 4 options, so it is not a portable substitute either.
//
// `type: 'transition'` is exempt: it does real work (saveHandoff + telemetry) and is
// not a question posed to the human.

import { describe, it, expect } from 'vitest';
import { glob } from 'glob';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = resolve(__dirname, '..');

// Matches `type: "question"`, `type: 'confirmation'`, and inline `type: \`question\``
// forms — i.e. an emit_interaction ask aimed at the human. Does NOT match the prose
// rationale that names the tool ("do NOT route this through `emit_interaction`"),
// which never writes `type: question`.
const FORBIDDEN_ASK = /type:\s*["'`](question|confirmation)["'`]/;

describe('skill prompts use a human-visible channel', () => {
  const skillMdFiles = glob.sync('**/SKILL.md', {
    cwd: SKILLS_DIR,
    ignore: ['**/node_modules/**', '**/tests/**'],
  });

  if (skillMdFiles.length === 0) {
    it.skip('no SKILL.md files found yet', () => {});
    return;
  }

  it.each(skillMdFiles)(
    '%s does not route a user-facing ask through emit_interaction (question/confirmation)',
    (file) => {
      const content = readFileSync(resolve(SKILLS_DIR, file), 'utf-8');
      const offending = content
        .split('\n')
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => FORBIDDEN_ASK.test(line));

      expect(
        offending,
        `${file} asks the human via emit_interaction at line(s) ` +
          `${offending.map((o) => o.n).join(', ')}. ` +
          `Ask in plain text in the reply instead — emit_interaction does not display ` +
          `the prompt to the human (it collapses to "Called harness"). ` +
          `type: 'transition' is exempt and uses a different type literal.`
      ).toHaveLength(0);
    }
  );
});
