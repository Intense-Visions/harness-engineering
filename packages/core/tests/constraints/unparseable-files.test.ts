/**
 * Unparseable files are reported, never silently dropped (#2073).
 *
 * `buildDependencyGraph` skipped a file whose parse (or import extraction)
 * failed and said nothing. `validateDependencies` then checked the edges of the
 * files that DID parse, so a layer violation inside a file with one syntax
 * error disappeared — and `check-deps` still reported a clean pass.
 *
 * The fixture is written to a temp dir at test time: a checked-in `.ts` file
 * with a syntax error would trip the repo's own prettier/eslint/tsc gates.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { validateDependencies } from '../../src/constraints/dependencies';
import { detectCircularDepsInFiles } from '../../src/constraints/circular-deps';
import { defineLayer } from '../../src/constraints/layers';
import { TypeScriptParser } from '../../src/shared/parsers/typescript';

const VIOLATING = "import { db } from '../infra/db';\nexport const order = db;\n";

describe('unparseable files are surfaced (#2073)', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-2073-'));
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/infra'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/infra/db.ts'), 'export const db = 1;\n');
    fs.writeFileSync(path.join(root, 'src/domain/order.ts'), VIOLATING);
    // A non-source file under a layer pattern is out of scope, not "unparseable".
    fs.writeFileSync(path.join(root, 'src/domain/README.md'), '# not code\n');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function config() {
    return {
      layers: [
        defineLayer('domain', ['src/domain/**'], []),
        defineLayer('infra', ['src/infra/**'], ['domain']),
      ],
      rootDir: root,
      parser: new TypeScriptParser(),
    };
  }

  it('baseline: the violation is found and nothing is reported unparsed', async () => {
    const result = await validateDependencies(config());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.violations).toHaveLength(1);
    expect(result.value.unparsedFiles).toBeUndefined();
    expect(result.value.analyzedFiles).toBe(2);
  });

  it('names a source file that failed to parse instead of dropping it', async () => {
    fs.appendFileSync(path.join(root, 'src/domain/order.ts'), 'function broken( {\n');

    const result = await validateDependencies(config());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The violation is hidden by the syntax error — that is unavoidable. What
    // must not happen is the file vanishing without a trace.
    expect(result.value.violations).toHaveLength(0);
    expect(result.value.unparsedFiles).toHaveLength(1);
    expect(result.value.unparsedFiles![0]!.file.replace(/\\/g, '/')).toMatch(
      /src\/domain\/order\.ts$/
    );
    expect(result.value.unparsedFiles![0]!.reason.length).toBeGreaterThan(0);
    // Only the file that actually parsed counts as analysed.
    expect(result.value.analyzedFiles).toBe(1);
  });

  it('surfaces unparsed files from circular-dependency detection too', async () => {
    const broken = path.join(root, 'src/domain/order.ts');
    fs.appendFileSync(broken, 'function broken( {\n');
    const files = [broken, path.join(root, 'src/infra/db.ts')];

    const result = await detectCircularDepsInFiles(files, new TypeScriptParser());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.unparsedFiles).toHaveLength(1);
    expect(result.value.analyzedFiles).toBe(1);
  });
});
