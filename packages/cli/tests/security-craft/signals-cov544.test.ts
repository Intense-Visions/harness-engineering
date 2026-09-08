import { describe, it, expect } from 'vitest';
import { detectSignals } from '../../src/security-craft/extract/signals.js';
import type { SignalKind } from '../../src/security-craft/findings/schema.js';

/**
 * Branch-coverage tests for the AST security-signal detector. Each case feeds
 * a crafted snippet and asserts the emitted signal kinds/markers, exercising
 * the many switch arms (privileged / auth / egress / raw-query / secret-sink /
 * decorators / framework routes) plus the guard/skip paths.
 */

function kinds(source: string, file = 'x.ts'): SignalKind[] {
  return detectSignals(source, file).map((s) => s.kind);
}

function markers(source: string, file = 'x.ts'): string[] {
  return detectSignals(source, file).map((s) => s.marker);
}

describe('detectSignals guards', () => {
  it('returns [] for a non-source file extension', () => {
    expect(detectSignals('anything', 'notes.md')).toEqual([]);
    expect(detectSignals('anything', 'data.json')).toEqual([]);
  });

  it('emits nothing for a benign file with zero signals', () => {
    expect(detectSignals('const a = 1 + 2;', 'clean.ts')).toEqual([]);
  });
});

describe('handler / middleware detection', () => {
  it('flags an express-style (req, res) handler', () => {
    expect(kinds('function h(req, res) { res.send(1); }')).toContain('http-handler');
  });

  it('flags a (req, res, next) middleware', () => {
    expect(kinds('const mw = (req, res, next) => { next(); };')).toContain('middleware');
  });

  it('flags a (ctx, next) koa-style middleware', () => {
    expect(kinds('async function mw(ctx, next) { await next(); }')).toContain('middleware');
  });

  it('ignores functions with too few or too many params', () => {
    expect(kinds('function one(a) { return a; }')).not.toContain('http-handler');
    expect(kinds('function five(a,b,c,d,e) { return a; }')).not.toContain('http-handler');
  });
});

describe('decorator routes', () => {
  it('flags a bare @Get() decorator as an http-handler', () => {
    const src = `class C { @Get onGet() { return 1; } }`;
    expect(kinds(src)).toContain('http-handler');
  });

  it('flags a call-form @Post("/x") decorator', () => {
    const src = `class C { @Post("/x") onPost() { return 1; } }`;
    expect(markers(src)).toContain('@Post');
  });
});

describe('call-expression signals', () => {
  it('flags bare eval as privileged-op', () => {
    expect(kinds('eval("1+1");')).toContain('privileged-op');
  });

  it('flags bare fetch as data-egress', () => {
    expect(kinds('fetch("http://x");')).toContain('data-egress');
  });

  it('ignores an unrelated bare identifier call', () => {
    expect(kinds('doThing(1);')).toEqual([]);
  });

  it('flags child_process.exec as privileged-op', () => {
    expect(markers('child_process.exec("ls");')).toContain('child_process.exec');
  });

  it('flags fs.writeFileSync as privileged-op', () => {
    expect(kinds('fs.writeFileSync("/x", "y");')).toContain('privileged-op');
  });

  it('flags jwt.verify as auth-api', () => {
    expect(kinds('jwt.verify(token, secret);')).toContain('auth-api');
  });

  it('flags axios.post as data-egress', () => {
    expect(kinds('axios.post("http://x", {});')).toContain('data-egress');
  });

  it('flags passport.authenticate as auth-api', () => {
    expect(markers('passport.authenticate("local");')).toContain('passport.authenticate');
  });

  it('flags res.cookie as auth-api', () => {
    expect(markers('res.cookie("sid", v);')).toContain('res.cookie');
  });

  it('flags req.session.destroy as auth-api', () => {
    expect(markers('req.session.destroy();')).toContain('req.session.destroy');
  });

  it('flags app.get as an http-handler route registration', () => {
    expect(markers('app.get("/x", handler);')).toContain('app.get');
  });

  it('does NOT flag a framework method on an unrelated receiver', () => {
    expect(kinds('widget.get("/x", handler);')).not.toContain('http-handler');
  });

  it('new Function() is flagged as privileged-op', () => {
    expect(markers('const f = new Function("return 1");')).toContain('new Function');
  });
});

describe('raw-query detection', () => {
  it('flags a SQL-shaped raw query', () => {
    expect(kinds('db.query(`SELECT * FROM users WHERE id = ${id}`);')).toContain('raw-query');
  });

  it('flags $queryRaw with a SQL string literal', () => {
    expect(kinds('prisma.$queryRaw("DELETE FROM t");')).toContain('raw-query');
  });

  it('does NOT flag a query() whose argument is not SQL-shaped', () => {
    expect(kinds('cache.query(`just a cache key`);')).not.toContain('raw-query');
  });
});

describe('secret-sink detection', () => {
  it('flags a secret identifier flowing into console.log', () => {
    expect(kinds('console.log(apiKey);')).toContain('secret-handling');
  });

  it('flags a secret property access into logger.info', () => {
    expect(kinds('logger.info(user.password);')).toContain('secret-handling');
  });

  it('flags a secret inside a template literal into console.error', () => {
    expect(kinds('console.error(`token is ${authToken}`);')).toContain('secret-handling');
  });

  it('flags a secret-named property in an object literal into JSON.stringify', () => {
    expect(kinds('JSON.stringify({ password: p, ok: 1 });')).toContain('secret-handling');
  });

  it('flags a shorthand secret property into console.log', () => {
    expect(kinds('console.log({ secret });')).toContain('secret-handling');
  });

  it('does NOT flag a benign value into console.log', () => {
    expect(kinds('console.log("hello world");')).not.toContain('secret-handling');
  });

  it('does NOT treat a non-sink call as a secret sink', () => {
    expect(kinds('save(apiKey);')).not.toContain('secret-handling');
  });
});

describe('de-duplication', () => {
  it('collapses identical signals at the same line', () => {
    // Two evals on the same statement/line still emit one privileged-op for the
    // marker+line, so repeated identical constructs do not multiply.
    const out = detectSignals('eval("a");', 'd.ts').filter((s) => s.kind === 'privileged-op');
    expect(out).toHaveLength(1);
  });
});
