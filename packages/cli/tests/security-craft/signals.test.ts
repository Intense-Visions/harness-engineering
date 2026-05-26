import { describe, it, expect } from 'vitest';
import { detectSignals } from '../../src/security-craft/extract/signals';

describe('detectSignals', () => {
  it('returns [] for a pure utility file', () => {
    const src = `
      export function add(a: number, b: number): number {
        return a + b;
      }
    `;
    expect(detectSignals(src, '/tmp/util.ts')).toEqual([]);
  });

  it('detects child_process.exec as privileged-op', () => {
    const src = `
      import * as child_process from 'child_process';
      child_process.exec(\`bash -c "\${userScript}"\`);
    `;
    const sigs = detectSignals(src, '/tmp/run.ts');
    expect(sigs.some((s) => s.kind === 'privileged-op' && s.marker === 'child_process.exec')).toBe(
      true
    );
  });

  it('detects bare eval as privileged-op', () => {
    const src = `eval(userCode);`;
    const sigs = detectSignals(src, '/tmp/eval.ts');
    expect(sigs.some((s) => s.kind === 'privileged-op' && s.marker === 'eval')).toBe(true);
  });

  it('detects new Function as privileged-op', () => {
    const src = `const f = new Function('x', 'return x + 1');`;
    const sigs = detectSignals(src, '/tmp/f.ts');
    expect(sigs.some((s) => s.kind === 'privileged-op' && s.marker === 'new Function')).toBe(true);
  });

  it('detects jwt.verify and jwt.sign as auth-api', () => {
    const src = `
      jwt.verify(token, secret);
      jwt.sign(payload, secret);
    `;
    const sigs = detectSignals(src, '/tmp/auth.ts');
    expect(sigs.some((s) => s.kind === 'auth-api' && s.marker === 'jwt.verify')).toBe(true);
    expect(sigs.some((s) => s.kind === 'auth-api' && s.marker === 'jwt.sign')).toBe(true);
  });

  it('detects res.cookie as auth-api', () => {
    const src = `function setCookie(req, res) { res.cookie('session', sid); }`;
    const sigs = detectSignals(src, '/tmp/c.ts');
    expect(sigs.some((s) => s.kind === 'auth-api' && s.marker === 'res.cookie')).toBe(true);
  });

  it('detects (req, res) shape as http-handler', () => {
    const src = `function handler(req, res) { res.json({}); }`;
    const sigs = detectSignals(src, '/tmp/h.ts');
    expect(sigs.some((s) => s.kind === 'http-handler')).toBe(true);
  });

  it('detects (req, res, next) shape as middleware', () => {
    const src = `const mw = (req, res, next) => { next(); };`;
    const sigs = detectSignals(src, '/tmp/m.ts');
    expect(sigs.some((s) => s.kind === 'middleware')).toBe(true);
  });

  it('detects app.get / router.post as http-handler', () => {
    const src = `
      app.get('/users', handler);
      router.post('/items', handler);
    `;
    const sigs = detectSignals(src, '/tmp/routes.ts');
    expect(sigs.some((s) => s.kind === 'http-handler' && s.marker === 'app.get')).toBe(true);
    expect(sigs.some((s) => s.kind === 'http-handler' && s.marker === 'router.post')).toBe(true);
  });

  it('detects @Get / @Post decorators as http-handler', () => {
    const src = `
      class UserController {
        @Get('/users')
        list() {}
        @Post('/users')
        create() {}
      }
    `;
    const sigs = detectSignals(src, '/tmp/ctrl.ts');
    expect(sigs.some((s) => s.kind === 'http-handler' && s.marker === '@Get')).toBe(true);
    expect(sigs.some((s) => s.kind === 'http-handler' && s.marker === '@Post')).toBe(true);
  });

  it('detects fetch as data-egress', () => {
    const src = `await fetch('https://api.example.com');`;
    const sigs = detectSignals(src, '/tmp/eg.ts');
    expect(sigs.some((s) => s.kind === 'data-egress' && s.marker === 'fetch')).toBe(true);
  });

  it('detects axios.post as data-egress', () => {
    const src = `await axios.post(url, body);`;
    const sigs = detectSignals(src, '/tmp/eg.ts');
    expect(sigs.some((s) => s.kind === 'data-egress' && s.marker === 'axios.post')).toBe(true);
  });

  it('detects template-literal SQL as raw-query', () => {
    const src = 'db.query(`SELECT * FROM users WHERE id = ${id}`);';
    const sigs = detectSignals(src, '/tmp/q.ts');
    expect(sigs.some((s) => s.kind === 'raw-query' && s.marker.includes('query'))).toBe(true);
  });

  it('does NOT fire raw-query on non-SQL template literals', () => {
    const src = 'logger.info(`User logged in: ${id}`);';
    const sigs = detectSignals(src, '/tmp/log.ts');
    expect(sigs.every((s) => s.kind !== 'raw-query')).toBe(true);
  });

  it('detects fs.writeFileSync as privileged-op', () => {
    const src = `fs.writeFileSync(path, contents);`;
    const sigs = detectSignals(src, '/tmp/w.ts');
    expect(sigs.some((s) => s.kind === 'privileged-op' && s.marker === 'fs.writeFileSync')).toBe(
      true
    );
  });

  it('detects secret-named variable flowing into console.log as secret-handling', () => {
    const src = `
      const token = getToken();
      console.log(token);
    `;
    const sigs = detectSignals(src, '/tmp/s.ts');
    expect(sigs.some((s) => s.kind === 'secret-handling')).toBe(true);
  });

  it('detects secret in template literal interpolation inside logger.warn', () => {
    const src = 'logger.warn(`auth failed for token=${apiKey}`);';
    const sigs = detectSignals(src, '/tmp/s.ts');
    expect(sigs.some((s) => s.kind === 'secret-handling')).toBe(true);
  });

  it('does NOT fire secret-handling when the sink is not log/JSON.stringify', () => {
    const src = `
      const token = getToken();
      sendToAuthService(token);
    `;
    const sigs = detectSignals(src, '/tmp/s.ts');
    expect(sigs.every((s) => s.kind !== 'secret-handling')).toBe(true);
  });

  it('is AST-aware: "exec" in a comment does NOT fire privileged-op', () => {
    const src = `
      // TODO: maybe use exec here later, but for now we do something safe
      function safe() { return 42; }
    `;
    const sigs = detectSignals(src, '/tmp/c.ts');
    expect(sigs.every((s) => s.kind !== 'privileged-op')).toBe(true);
  });

  it('is AST-aware: "eval" as a variable name does NOT fire privileged-op', () => {
    const src = `
      const eval = 5; // not the keyword
      const evaluation = process(eval);
    `;
    const sigs = detectSignals(src, '/tmp/v.ts');
    // No CallExpression on 'eval' so privileged-op should not fire
    expect(sigs.every((s) => s.marker !== 'eval')).toBe(true);
  });

  it('deduplicates signals at the same line+marker+kind', () => {
    const src = `app.get('/a'); app.get('/b');`;
    const sigs = detectSignals(src, '/tmp/d.ts');
    const appGets = sigs.filter((s) => s.kind === 'http-handler' && s.marker === 'app.get');
    // Both calls are on the same line, so dedup collapses to one signal
    expect(appGets).toHaveLength(1);
  });

  it('every signal carries kind, marker, and line', () => {
    const src = `
      function handler(req, res) {
        eval(req.body.code);
      }
    `;
    const sigs = detectSignals(src, '/tmp/h.ts');
    for (const s of sigs) {
      expect(typeof s.kind).toBe('string');
      expect(typeof s.marker).toBe('string');
      expect(typeof s.line).toBe('number');
      expect(s.line).toBeGreaterThan(0);
    }
  });

  it('returns [] for non-source extensions', () => {
    expect(detectSignals('whatever', '/tmp/data.json')).toEqual([]);
    expect(detectSignals('whatever', '/tmp/notes.md')).toEqual([]);
  });
});
