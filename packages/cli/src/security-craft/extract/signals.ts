/**
 * AST signal detector — single TS Compiler API walk per file that emits
 * SecuritySignals (http-handler, middleware, auth-api, privileged-op,
 * data-egress, raw-query, secret-handling).
 *
 * Files with zero signals are skipped entirely by the orchestrator —
 * this is the FP-management strategy from proposal Decision #2
 * (AST-driven targeting, no path-heuristic fallback).
 *
 * AST awareness (not regex) avoids common false positives like 'exec'
 * appearing in a comment or 'eval' as a variable name.
 *
 * Source: docs/changes/craft-pipeline/security-craft/proposal.md
 *   (Technical Design → Signal detection).
 */

import ts from 'typescript';
import type { SecuritySignal, SignalKind } from '../findings/schema.js';

/** Privileged module-namespace calls. */
const PRIVILEGED_NAMESPACE_CALLS: ReadonlyArray<{ ns: string; method: string }> = [
  { ns: 'child_process', method: 'exec' },
  { ns: 'child_process', method: 'spawn' },
  { ns: 'child_process', method: 'execSync' },
  { ns: 'child_process', method: 'spawnSync' },
  { ns: 'child_process', method: 'fork' },
  { ns: 'fs', method: 'writeFile' },
  { ns: 'fs', method: 'writeFileSync' },
  { ns: 'fs', method: 'unlink' },
  { ns: 'fs', method: 'unlinkSync' },
  { ns: 'fs', method: 'chmod' },
  { ns: 'fs', method: 'chmodSync' },
  { ns: 'fs', method: 'chown' },
  { ns: 'fs', method: 'chownSync' },
  { ns: 'vm', method: 'runInNewContext' },
  { ns: 'vm', method: 'runInThisContext' },
  { ns: 'vm', method: 'runInContext' },
];

/** Auth/authz API surface — namespace.method calls. */
const AUTH_API_CALLS: ReadonlyArray<{ ns: string; method: string }> = [
  { ns: 'jwt', method: 'sign' },
  { ns: 'jwt', method: 'verify' },
  { ns: 'bcrypt', method: 'hash' },
  { ns: 'bcrypt', method: 'compare' },
  { ns: 'argon2', method: 'hash' },
  { ns: 'argon2', method: 'verify' },
];

/** Network egress API surface. */
const EGRESS_NAMESPACE_CALLS: ReadonlyArray<{ ns: string; method: string }> = [
  { ns: 'axios', method: 'get' },
  { ns: 'axios', method: 'post' },
  { ns: 'axios', method: 'put' },
  { ns: 'axios', method: 'delete' },
  { ns: 'axios', method: 'patch' },
  { ns: 'axios', method: 'request' },
  { ns: 'http', method: 'request' },
  { ns: 'http', method: 'get' },
  { ns: 'https', method: 'request' },
  { ns: 'https', method: 'get' },
  { ns: 'net', method: 'connect' },
];

/** Bare-identifier privileged ops. */
const BARE_PRIVILEGED_IDENTIFIERS = new Set(['eval']);

/** Bare-identifier data egress. */
const BARE_EGRESS_IDENTIFIERS = new Set(['fetch']);

/** Express/Hono/Fastify/Koa method names on app/router instances. */
const HTTP_FRAMEWORK_METHODS = new Set([
  'get',
  'post',
  'put',
  'delete',
  'patch',
  'head',
  'options',
  'all',
  'route',
  'use',
]);

/** Decorator names commonly used for HTTP routes (NestJS / TSyringe / Hono RPC). */
const HTTP_ROUTE_DECORATORS = new Set([
  'Get',
  'Post',
  'Put',
  'Delete',
  'Patch',
  'Options',
  'Head',
  'All',
  'Route',
]);

/** Match variable / parameter names that look like secrets. */
const SECRET_NAME_PATTERN =
  /(?:^|[._-])(?:secret|token|password|passwd|api[-_]?key|private[-_]?key|access[-_]?key|client[-_]?secret|auth[-_]?token|session[-_]?id|jwt|bearer)(?:$|[._A-Z-])/i;

/** Sink methods that secrets should NOT flow into. */
const SECRET_SINK_NAMESPACES = new Set(['console', 'logger', 'log']);
const SECRET_SINK_METHODS = new Set([
  'log',
  'info',
  'warn',
  'error',
  'debug',
  'trace',
  'fatal',
  'stringify',
]);

export function detectSignals(sourceText: string, filePath: string): SecuritySignal[] {
  if (!/\.(?:ts|tsx|js|jsx|mjs|cjs)$/i.test(filePath)) return [];

  let sourceFile: ts.SourceFile;
  try {
    sourceFile = ts.createSourceFile(
      filePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );
  } catch {
    return [];
  }

  const out: SecuritySignal[] = [];
  // De-duplicate signals at the same line+marker+kind so a handler with
  // multiple matching constructs at one line doesn't fire multiple identical
  // signals.
  const seen = new Set<string>();

  visit(sourceFile, sourceFile, out, seen);
  return out;
}

function emit(
  out: SecuritySignal[],
  seen: Set<string>,
  kind: SignalKind,
  marker: string,
  line: number
): void {
  const key = `${kind}:${marker}:${line}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push({ kind, marker, line });
}

function lineOf(node: ts.Node, sf: ts.SourceFile): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

function visit(node: ts.Node, sf: ts.SourceFile, out: SecuritySignal[], seen: Set<string>): void {
  // HTTP handler / middleware detection on function-like nodes
  detectHandlerOrMiddleware(node, sf, out, seen);

  // Decorator-based HTTP route detection
  detectRouteDecorator(node, sf, out, seen);

  // Call expressions: most signal kinds are call-shaped
  if (ts.isCallExpression(node)) {
    detectCallSignals(node, sf, out, seen);
  }

  // new Function(...)
  if (
    ts.isNewExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'Function'
  ) {
    emit(out, seen, 'privileged-op', 'new Function', lineOf(node, sf));
  }

  // Secret-handling: variable/parameter named like a secret reaching a sink
  if (ts.isCallExpression(node)) {
    detectSecretSink(node, sf, out, seen);
  }
  // Secret in template literal interpolation inside a sink call is covered
  // by detectSecretSink (it inspects arguments).

  ts.forEachChild(node, (child) => visit(child, sf, out, seen));
}

function detectHandlerOrMiddleware(
  node: ts.Node,
  sf: ts.SourceFile,
  out: SecuritySignal[],
  seen: Set<string>
): void {
  let params: ReadonlyArray<ts.ParameterDeclaration> | undefined;
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node)
  ) {
    params = node.parameters;
  }
  if (params === undefined) return;
  if (params.length < 2 || params.length > 4) return;
  const paramNames = params.map((p) => (ts.isIdentifier(p.name) ? p.name.text : '')).join(',');
  // Match (req, res), (req, res, next), or (ctx, next) shapes
  const isHandler = /^req,res(,next)?(,.*)?$/.test(paramNames);
  const isMiddleware = /^req,res,next$/.test(paramNames) || /^ctx,next$/.test(paramNames);
  if (isMiddleware) {
    emit(out, seen, 'middleware', paramNames, lineOf(node, sf));
  } else if (isHandler) {
    emit(out, seen, 'http-handler', paramNames, lineOf(node, sf));
  }
}

function detectRouteDecorator(
  node: ts.Node,
  sf: ts.SourceFile,
  out: SecuritySignal[],
  seen: Set<string>
): void {
  if (!ts.canHaveDecorators(node)) return;
  const decorators = ts.getDecorators(node);
  if (decorators === undefined) return;
  for (const dec of decorators) {
    const expr = dec.expression;
    let name: string | undefined;
    if (ts.isIdentifier(expr)) name = expr.text;
    else if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression))
      name = expr.expression.text;
    if (name !== undefined && HTTP_ROUTE_DECORATORS.has(name)) {
      emit(out, seen, 'http-handler', `@${name}`, lineOf(node, sf));
    }
  }
}

function detectCallSignals(
  node: ts.CallExpression,
  sf: ts.SourceFile,
  out: SecuritySignal[],
  seen: Set<string>
): void {
  const callee = node.expression;
  const line = lineOf(node, sf);

  // Bare identifier calls: eval(...), fetch(...)
  if (ts.isIdentifier(callee)) {
    if (BARE_PRIVILEGED_IDENTIFIERS.has(callee.text)) {
      emit(out, seen, 'privileged-op', callee.text, line);
      return;
    }
    if (BARE_EGRESS_IDENTIFIERS.has(callee.text)) {
      emit(out, seen, 'data-egress', callee.text, line);
      return;
    }
    return;
  }

  // Property access calls: ns.method(...)
  if (ts.isPropertyAccessExpression(callee)) {
    const method = callee.name.text;
    const obj = callee.expression;
    // Namespace.method matches
    if (ts.isIdentifier(obj)) {
      const ns = obj.text;
      for (const entry of PRIVILEGED_NAMESPACE_CALLS) {
        if (entry.ns === ns && entry.method === method) {
          emit(out, seen, 'privileged-op', `${ns}.${method}`, line);
          return;
        }
      }
      for (const entry of AUTH_API_CALLS) {
        if (entry.ns === ns && entry.method === method) {
          emit(out, seen, 'auth-api', `${ns}.${method}`, line);
          return;
        }
      }
      for (const entry of EGRESS_NAMESPACE_CALLS) {
        if (entry.ns === ns && entry.method === method) {
          emit(out, seen, 'data-egress', `${ns}.${method}`, line);
          return;
        }
      }
      // req.session.* / req.cookies / passport.*
      if (ns === 'passport') {
        emit(out, seen, 'auth-api', `passport.${method}`, line);
        return;
      }
    }

    // res.cookie(...) and req.session.* via chained member access
    if (ts.isIdentifier(obj) && obj.text === 'res' && method === 'cookie') {
      emit(out, seen, 'auth-api', 'res.cookie', line);
      return;
    }
    if (
      ts.isPropertyAccessExpression(obj) &&
      ts.isIdentifier(obj.expression) &&
      obj.expression.text === 'req' &&
      obj.name.text === 'session'
    ) {
      emit(out, seen, 'auth-api', `req.session.${method}`, line);
      return;
    }

    // app.get / router.post / etc — HTTP framework route registration
    if (HTTP_FRAMEWORK_METHODS.has(method) && ts.isIdentifier(obj)) {
      const objName = obj.text;
      if (/^(app|router|server|api|route|fastify|hono|koa)$/i.test(objName)) {
        emit(out, seen, 'http-handler', `${objName}.${method}`, line);
        return;
      }
    }

    // Raw query: db.query(`...${x}...`) or db.raw(...)
    if (
      (method === 'query' ||
        method === 'raw' ||
        method === '$queryRaw' ||
        method === '$executeRaw') &&
      node.arguments.length > 0
    ) {
      const firstArg = node.arguments[0];
      if (
        firstArg !== undefined &&
        (ts.isTemplateExpression(firstArg) || ts.isStringLiteral(firstArg))
      ) {
        // Only fire raw-query if the string looks SQL-ish (contains SELECT/INSERT/UPDATE/DELETE/CREATE).
        const text = firstArg.getText(sf).toUpperCase();
        if (/\b(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|WITH)\b/.test(text)) {
          emit(out, seen, 'raw-query', `${method}(...)`, line);
          return;
        }
      }
    }
  }
}

function detectSecretSink(
  node: ts.CallExpression,
  sf: ts.SourceFile,
  out: SecuritySignal[],
  seen: Set<string>
): void {
  const callee = node.expression;
  if (!ts.isPropertyAccessExpression(callee)) return;
  const obj = callee.expression;
  const method = callee.name.text;
  // Only fire on calls into known sinks (console.*, logger.*, log.*, JSON.stringify)
  let inSecretSink = false;
  if (ts.isIdentifier(obj)) {
    const ns = obj.text;
    if (SECRET_SINK_NAMESPACES.has(ns.toLowerCase()) && SECRET_SINK_METHODS.has(method)) {
      inSecretSink = true;
    }
    if (ns === 'JSON' && method === 'stringify') {
      inSecretSink = true;
    }
  }
  if (!inSecretSink) return;

  // Inspect arguments for secret-named identifiers or secret-named property accesses,
  // including those inside template literal interpolations.
  for (const arg of node.arguments) {
    const marker = findSecretMarker(arg);
    if (marker !== undefined) {
      emit(out, seen, 'secret-handling', `${marker} → sink`, lineOf(node, sf));
      return;
    }
  }
}

function findSecretMarker(node: ts.Node): string | undefined {
  // Identifier or property access
  if (ts.isIdentifier(node) && SECRET_NAME_PATTERN.test(node.text)) return node.text;
  if (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.name) &&
    SECRET_NAME_PATTERN.test(node.name.text)
  )
    return node.name.text;
  // Template literal interpolation
  if (ts.isTemplateExpression(node)) {
    for (const span of node.templateSpans) {
      const sub = findSecretMarker(span.expression);
      if (sub !== undefined) return sub;
    }
  }
  // Object literal property whose key looks secret
  if (ts.isObjectLiteralExpression(node)) {
    for (const prop of node.properties) {
      if (
        ts.isPropertyAssignment(prop) &&
        ts.isIdentifier(prop.name) &&
        SECRET_NAME_PATTERN.test(prop.name.text)
      ) {
        return prop.name.text;
      }
      if (ts.isShorthandPropertyAssignment(prop) && SECRET_NAME_PATTERN.test(prop.name.text)) {
        return prop.name.text;
      }
    }
  }
  return undefined;
}
