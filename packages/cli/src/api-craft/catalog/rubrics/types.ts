/**
 * Rubric + kind types for api-craft.
 *
 * An API surface is discovered either as an OpenAPI/Swagger specification
 * document or as a route/handler definition in code. A rubric declares which
 * surface kinds it is critique-relevant for so per-surface critique skips
 * rubrics that cannot be honestly judged from that kind (the analogue of
 * cli-ergonomics-craft's leaf/group filter and security-craft's
 * appliesToSignals gate).
 */

/**
 * Coarse classification of a discovered API surface. Used to filter rubrics
 * and to shape the critique prompt.
 *
 * - `openapi`: an OpenAPI / Swagger specification document (YAML or JSON). The
 *   declared contract — resource names, paths, verbs, status codes, response
 *   schemas, pagination parameters, and version are all legible here.
 * - `route`: a route / handler definition in code (Express, Fastify, Koa, Nest,
 *   LoopBack, Hono, Next.js route handlers, …). The implemented contract —
 *   plus runtime concerns a static spec rarely captures, such as whether a
 *   mutation is safe to retry.
 */
export type ApiSurfaceKind = 'openapi' | 'route';

export interface ApiRubric {
  id: string;
  title: string;
  description: string;
  /** Surface kinds this rubric applies to. `'*'` means every discovered surface. */
  appliesTo: ReadonlyArray<ApiSurfaceKind> | ['*'];
  source: string;
  contribution: { addedAt: string; addedBy: string };
  signal: { invocations: number; suppressedAt: string[] };
  version: number;
}
