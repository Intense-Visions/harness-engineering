/**
 * Check an event against pnyon's published `sdlc.*` v1 contract BEFORE shipping it.
 *
 * Why this exists: harness and the Waypoint Worker have drifted before. The tracker adapters spoke
 * `/v1/items` REST CRUD at a server that only ever served
 * `/outpost/<oid>/project/<pid>/(events|board|…)` — nothing failed fast, `/v1/items` simply 404'd in
 * production. pnyon's ADR-0055 then made an undeclared `data` field a hard rejection, so a producer
 * can now be wrong about a FIELD, not merely a route, and learn it only from a 400 after the round
 * trip. Worse, the spool ships in batches on a schedule, so the discovery is both late and remote.
 *
 * The contract itself is DATA, not code: `contract/sdlc-v1.schema.json` is vendored verbatim from
 * https://pnyon.com/schema/sdlc-v1.schema.json, which pnyon GENERATES from its live validator's own
 * tables. Nothing here restates a field name, a type list or an enum member — a contract change is
 * absorbed by re-vendoring the JSON, with no edit to this file. That is deliberate: a hand-written
 * second copy of the contract is precisely the drift being prevented, reintroduced as a validator.
 *
 * What IS code here is a small, generic evaluator for the JSON Schema constructs the artifact uses.
 * It is intentionally not a complete JSON Schema implementation; it covers what the published
 * document contains and refuses anything it does not understand rather than passing it silently.
 *
 * Two limits, both stated rather than hidden:
 *
 *   1. Seven of the ten identifier shapes are NOT regexes — pnyon marks them
 *      `"x-pnyon-shape-authority": "server"` because predicates like `isSlugShaped` apply segment
 *      caps and a real-word requirement no `pattern` reproduces. Those fields are checked as strings
 *      here and remain the server's call. This preflight therefore catches structural error
 *      (unknown type, undeclared field, wrong JS type, bad enum, malformed ULID) and does not
 *      pretend to be the server.
 *   2. It validates what the spool is about to send. It cannot know whether the ledger will scrub
 *      the prose inside it.
 */
// Imported, not read from disk. `package.json` publishes only `dist`, so a `readFileSync` against
// `src/waypoint/contract/` resolves in this repo and throws in every installed copy — the shape of
// bug that passes all its tests and fails only for users. An import is inlined by tsup into both
// bundles, needs no `files` entry, and drops the `node:fs` dependency so this stays usable wherever
// harness runs.
import schemaDocument from './contract/sdlc-v1.schema.json';

/** A JSON Schema node, as far as this evaluator is concerned. */
type SchemaNode = Record<string, unknown>;

/** One reason an event does not satisfy the contract. */
export interface ContractViolation {
  /** Dotted path to the offending value, e.g. `data.outcome`. */
  readonly path: string;
  readonly message: string;
}

export interface ContractVerdict {
  readonly ok: boolean;
  readonly violations: readonly ContractViolation[];
}

/**
 * The vendored contract document, verbatim from https://pnyon.com/schema/sdlc-v1.schema.json.
 * Refresh it by re-downloading that URL; nothing here needs editing when the contract changes.
 */
export function sdlcContract(): SchemaNode {
  return schemaDocument as unknown as SchemaNode;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** JSON Schema's `type` keyword, against a runtime value. */
function matchesType(type: string, value: unknown): boolean {
  switch (type) {
    case 'object':
      return isRecord(value);
    case 'array':
      return Array.isArray(value);
    case 'null':
      return value === null;
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'string':
    case 'boolean':
      return typeof value === type;
    default:
      return false;
  }
}

/**
 * The keywords that judge a value on its own — `const`, `enum`, `type`, `pattern`. Returns the
 * violation when one fails, or null when they all hold. A failure here is disqualifying, so the
 * caller stops rather than piling structural complaints on a value of the wrong kind entirely.
 */
function checkAssertions(node: SchemaNode, value: unknown, path: string): ContractViolation | null {
  if ('const' in node && value !== node['const']) {
    return { path, message: `must equal ${JSON.stringify(node['const'])}` };
  }

  const enumValues = node['enum'];
  if (Array.isArray(enumValues) && !enumValues.includes(value)) {
    return { path, message: `must be one of ${enumValues.map((v) => String(v)).join(', ')}` };
  }

  const type = node['type'];
  if (typeof type === 'string' && !matchesType(type, value)) {
    return { path, message: `must be of type ${type}` };
  }

  const pattern = node['pattern'];
  if (
    typeof pattern === 'string' &&
    typeof value === 'string' &&
    !new RegExp(pattern).test(value)
  ) {
    return { path, message: `must match ${pattern}` };
  }

  return null;
}

/** Does `value` satisfy this subschema? Used to try a branch without recording its complaints. */
function satisfies(node: SchemaNode, value: unknown, path: string): boolean {
  const probe: ContractViolation[] = [];
  evaluate(node, value, path, probe);
  return probe.length === 0;
}

/**
 * `anyOf` / `oneOf`: the value must satisfy at least one alternative. Reports the whole failure
 * rather than one arbitrary branch's errors, which would misdirect the reader.
 */
function checkBranches(node: SchemaNode, value: unknown, path: string): ContractViolation | null {
  for (const key of ['anyOf', 'oneOf'] as const) {
    const branches = node[key];
    if (!Array.isArray(branches)) continue;
    if (!branches.some((branch) => satisfies(branch as SchemaNode, value, path))) {
      return { path, message: `does not satisfy any ${key} branch of the contract` };
    }
  }
  return null;
}

/** Evaluate one node, appending any violations found. */
function evaluate(node: SchemaNode, value: unknown, path: string, out: ContractViolation[]): void {
  const assertion = checkAssertions(node, value, path);
  if (assertion !== null) {
    out.push(assertion);
    return;
  }

  const branch = checkBranches(node, value, path);
  if (branch !== null) {
    out.push(branch);
    return;
  }

  const items = node['items'];
  if (Array.isArray(value) && isRecord(items)) {
    value.forEach((entry, index) => {
      evaluate(items as SchemaNode, entry, `${path}[${index}]`, out);
    });
  }

  if (isRecord(value)) evaluateObject(node, value, path, out);

  // `allOf` carries the per-type `data` branches as if/then pairs.
  const allOf = node['allOf'];
  if (Array.isArray(allOf)) {
    for (const member of allOf) {
      if (isRecord(member)) evaluateConditional(member, value, path, out);
    }
  }
}

/** `properties`, `required` and `additionalProperties: false` against an object value. */
function evaluateObject(
  node: SchemaNode,
  value: Record<string, unknown>,
  path: string,
  out: ContractViolation[]
): void {
  const properties = isRecord(node['properties']) ? node['properties'] : undefined;
  const required = node['required'];

  if (Array.isArray(required)) {
    for (const key of required) {
      if (typeof key === 'string' && value[key] === undefined) {
        out.push({ path: path === '' ? key : `${path}.${key}`, message: 'is required' });
      }
    }
  }

  if (properties === undefined) return;

  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined) continue;
    const child = path === '' ? key : `${path}.${key}`;
    const propertySchema = properties[key];
    if (isRecord(propertySchema)) {
      evaluate(propertySchema, entry, child, out);
      continue;
    }
    if (node['additionalProperties'] === false) {
      // ADR-0055's central rule. Naming the `.v2` escape hatch here is what turns a rejection into
      // an instruction: the vocabulary is pinned, so a new field is a new type, never a new key.
      out.push({
        path: child,
        message:
          'is not declared in the pinned v1 contract — an undeclared field is refused by the ledger, not ignored (a new field is a new .v2 type)',
      });
    }
  }
}

/** One `{ if, then }` pair: apply `then` only when `if` already holds. */
function evaluateConditional(
  member: Record<string, unknown>,
  value: unknown,
  path: string,
  out: ContractViolation[]
): void {
  const condition = member['if'];
  const consequent = member['then'];
  if (!isRecord(condition) || !isRecord(consequent)) return;

  const probe: ContractViolation[] = [];
  evaluate(condition as SchemaNode, value, path, probe);
  if (probe.length === 0) evaluate(consequent as SchemaNode, value, path, out);
}

/**
 * Check one event against the vendored contract.
 *
 * A verdict of `ok` means the event is structurally shippable — not that the ledger will accept it,
 * because seven identifier shapes and the whole scrub decision remain server-side. A verdict of not
 * `ok` means the ledger WOULD refuse it, so sending it can only waste a round trip and land the
 * event in the dead-letter file the long way round.
 */
export function validateAgainstContract(event: unknown): ContractVerdict {
  const violations: ContractViolation[] = [];
  evaluate(sdlcContract(), event, '', violations);
  return { ok: violations.length === 0, violations };
}

/** Render violations as one line for a log or a rejection reason. */
export function describeViolations(violations: readonly ContractViolation[]): string {
  return violations.map((v) => `${v.path === '' ? '(root)' : v.path}: ${v.message}`).join('; ');
}
