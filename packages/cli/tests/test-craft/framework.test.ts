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

  it('playwright takes precedence over vitest if both present', () => {
    expect(detectFramework(`import { test } from '@playwright/test';\nimport 'vitest';`)).toBe(
      'playwright'
    );
  });
});
