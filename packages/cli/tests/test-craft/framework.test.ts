import { describe, it, expect } from 'vitest';
import { detectFramework } from '../../src/test-craft/extract/framework';

describe('detectFramework', () => {
  it('detects playwright from @playwright/test import', () => {
    expect(detectFramework(`import { test, expect } from '@playwright/test';`)).toBe('playwright');
  });

  it('detects jest from @jest/globals import', () => {
    expect(detectFramework(`import { describe, it } from '@jest/globals';`)).toBe('jest');
  });

  it('detects vitest from vitest import', () => {
    expect(detectFramework(`import { describe, it, expect } from 'vitest';`)).toBe('vitest');
  });

  it('detects mocha from import "mocha"', () => {
    expect(detectFramework(`import 'mocha';\n\ndescribe('x', () => {});`)).toBe('mocha');
  });

  it('falls back to vitest when no framework import present', () => {
    expect(detectFramework(`describe('x', () => { it('y', () => {}); });`)).toBe('vitest');
  });

  it('detects pytest from a .py file path regardless of content', () => {
    expect(detectFramework(`import unittest`, 'tests/test_foo.py')).toBe('pytest');
  });

  it('detects pytest from import pytest signature', () => {
    expect(detectFramework(`import pytest\n\ndef test_x():\n    assert True`)).toBe('pytest');
  });

  it('detects pytest from bare def test_* signature', () => {
    expect(detectFramework(`def test_addition():\n    assert 1 + 1 == 2`)).toBe('pytest');
  });

  it('a TS file path does not shadow TS framework detection', () => {
    expect(detectFramework(`import { it } from 'vitest';`, 'src/foo.test.ts')).toBe('vitest');
  });

  it('playwright takes precedence over vitest if both present', () => {
    expect(detectFramework(`import { test } from '@playwright/test';\nimport 'vitest';`)).toBe(
      'playwright'
    );
  });
});
