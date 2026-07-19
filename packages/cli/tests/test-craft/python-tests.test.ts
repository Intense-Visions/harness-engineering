import { describe, it, expect } from 'vitest';
import { extractPythonTests, isPythonTestFile } from '../../src/test-craft/extract/python-tests';

describe('isPythonTestFile', () => {
  it('matches test_*.py', () => {
    expect(isPythonTestFile('test_foo.py')).toBe(true);
    expect(isPythonTestFile('/abs/path/test_foo.py')).toBe(true);
  });

  it('matches *_test.py', () => {
    expect(isPythonTestFile('foo_test.py')).toBe(true);
  });

  it('rejects non-test python files and non-python files', () => {
    expect(isPythonTestFile('foo.py')).toBe(false);
    expect(isPythonTestFile('conftest.py')).toBe(false);
    expect(isPythonTestFile('foo.test.ts')).toBe(false);
    expect(isPythonTestFile('test_foo.pyc')).toBe(false);
  });
});

describe('extractPythonTests', () => {
  it('extracts module-level test functions with bodies', () => {
    const source = [
      'import pytest',
      '',
      'def test_addition():',
      '    assert 1 + 1 == 2',
      '',
      'def helper():',
      '    pass',
      '',
      'def test_subtraction():',
      '    assert 2 - 1 == 1',
    ].join('\n');
    const tests = extractPythonTests({ file: 'test_math.py', source });
    expect(tests.map((t) => t.testName)).toEqual(['test_addition', 'test_subtraction']);
    expect(tests[0].line).toBe(3);
    expect(tests[0].framework).toBe('pytest');
    expect(tests[0].body).toContain('assert 1 + 1 == 2');
    expect(tests[0].nesting).toEqual([]);
  });

  it('captures Test class nesting', () => {
    const source = [
      'class TestCalculator:',
      '    def test_add(self):',
      '        assert add(1, 2) == 3',
      '',
      '    def test_sub(self):',
      '        assert sub(3, 2) == 1',
      '',
      'def test_top_level():',
      '    pass',
    ].join('\n');
    const tests = extractPythonTests({ file: 'test_calc.py', source });
    expect(tests).toHaveLength(3);
    expect(tests[0].nesting).toEqual(['TestCalculator']);
    expect(tests[1].nesting).toEqual(['TestCalculator']);
    expect(tests[2].nesting).toEqual([]);
  });

  it('flags @pytest.mark.skip / skipif as skipped', () => {
    const source = [
      'import pytest',
      '',
      '@pytest.mark.skip(reason="broken")',
      'def test_skipped():',
      '    assert False',
      '',
      '@pytest.mark.skipif(True, reason="cond")',
      'def test_skipped_if():',
      '    assert False',
      '',
      '@pytest.mark.parametrize("n", [1, 2])',
      'def test_param(n):',
      '    assert n > 0',
    ].join('\n');
    const tests = extractPythonTests({ file: 'test_marks.py', source });
    expect(tests.map((t) => t.skipped)).toEqual([true, true, false]);
  });

  it('extracts async test functions', () => {
    const source = ['async def test_async_flow():', '    await do_thing()'].join('\n');
    const tests = extractPythonTests({ file: 'test_async.py', source });
    expect(tests).toHaveLength(1);
    expect(tests[0].testName).toBe('test_async_flow');
  });

  it('body ends at dedent back to def level', () => {
    const source = [
      'def test_first():',
      '    x = 1',
      '    assert x == 1',
      '',
      'def test_second():',
      '    assert True',
    ].join('\n');
    const tests = extractPythonTests({ file: 'test_dedent.py', source });
    expect(tests[0].body).not.toContain('test_second');
    expect(tests[0].body).toContain('assert x == 1');
  });

  it('truncates very long bodies', () => {
    const longBody = Array.from({ length: 200 }, (_, i) => `    assert step_${i}()`).join('\n');
    const source = `def test_long():\n${longBody}\n`;
    const tests = extractPythonTests({ file: 'test_long.py', source });
    expect(tests[0].body.length).toBeLessThanOrEqual(1500 + '\n[…truncated]'.length);
    expect(tests[0].body).toContain('[…truncated]');
  });

  it('non-Test classes do not contribute nesting', () => {
    const source = [
      'class Helper:',
      '    def test_should_not_nest_under_helper(self):',
      '        pass',
    ].join('\n');
    const tests = extractPythonTests({ file: 'test_helper.py', source });
    // pytest would not collect this either, but light-parse extracts it
    // without the non-Test class in the nesting chain.
    expect(tests[0].nesting).toEqual([]);
  });
});
