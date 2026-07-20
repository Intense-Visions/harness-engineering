// agents/skills/tests/harness-tdd.test.ts
//
// Contract tests for the harness-tdd skill. Locks in the canary wiring from
// GH issue 913 (Wiring A): the RED phase probes the canary CLI once, offers
// the deterministic `/canary-write-test` scaffolding path when canary is
// available, picks a framework via `canary_recommend_framework` when no test
// framework is configured, and degrades gracefully (never blocking TDD) when
// canary is unavailable. Generic schema/structure/parity checks live in the
// sibling *.test.ts files.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = resolve(__dirname, '..');

const SKILL_NAME = 'harness-tdd';
const PLATFORMS = ['claude-code', 'gemini-cli', 'cursor', 'codex'] as const;

function readSkillMd(platform: string): string {
  return readFileSync(resolve(SKILLS_DIR, platform, SKILL_NAME, 'SKILL.md'), 'utf-8');
}

// Isolate the RED phase so the assertions cannot be satisfied by canary
// references that leak in from GREEN/REFACTOR/VALIDATE.
function redPhase(body: string): string {
  const start = body.indexOf('### Phase 1: RED');
  const end = body.indexOf('### Phase 2: GREEN');
  expect(start, `missing "### Phase 1: RED" section`).toBeGreaterThan(-1);
  expect(end, `missing "### Phase 2: GREEN" section`).toBeGreaterThan(start);
  return body.slice(start, end);
}

describe('harness-tdd RED phase probes canary (deterministic scaffolding)', () => {
  it.each(PLATFORMS)('%s SKILL.md calls canary_probe in the RED phase', (platform) => {
    expect(redPhase(readSkillMd(platform))).toContain('canary_probe');
  });

  it.each(PLATFORMS)('%s SKILL.md offers /canary-write-test on the available path', (platform) => {
    const red = redPhase(readSkillMd(platform));
    expect(red).toContain('/canary-write-test');
    expect(red).toContain('canary:canary-write-test');
  });

  it.each(PLATFORMS)(
    '%s SKILL.md picks a framework via canary_recommend_framework when none is configured',
    (platform) => {
      expect(redPhase(readSkillMd(platform))).toContain('canary_recommend_framework');
    }
  );

  it.each(PLATFORMS)('%s SKILL.md degrades gracefully when canary is unavailable', (platform) => {
    const red = redPhase(readSkillMd(platform));
    // The degraded branch and its one-line install nudge, mirroring
    // harness-test-advisor's PROBE fallback wording.
    expect(red).toMatch(/degraded/);
    expect(red).toMatch(/canary CLI unavailable/);
    expect(red).toMatch(/canary-test-cli/);
    // Canary absence must never block the TDD cycle.
    expect(red).toMatch(/never blocks TDD/i);
  });
});
