import { afterEach, describe, expect, it } from 'vitest';
// eslint-disable-next-line import/no-relative-packages -- test reaches into repo-root scripts/ on purpose
import { prepushTestOptions } from '../../../../scripts/vitest-prepush-reporter.mjs';

const original = process.env.HARNESS_PREPUSH;
afterEach(() => {
  if (original === undefined) delete process.env.HARNESS_PREPUSH;
  else process.env.HARNESS_PREPUSH = original;
});

describe('prepushTestOptions', () => {
  it('is inert (returns {}) when HARNESS_PREPUSH is unset', () => {
    delete process.env.HARNESS_PREPUSH;
    expect(prepushTestOptions()).toEqual({});
  });

  it('is inert for any value other than exactly "1"', () => {
    process.env.HARNESS_PREPUSH = '0';
    expect(prepushTestOptions()).toEqual({});
    process.env.HARNESS_PREPUSH = 'true';
    expect(prepushTestOptions()).toEqual({});
  });

  it('adds the json reporter fragment when HARNESS_PREPUSH=1', () => {
    process.env.HARNESS_PREPUSH = '1';
    expect(prepushTestOptions()).toEqual({
      reporters: ['default', ['json', { outputFile: '.vitest-report.json' }]],
    });
  });
});
