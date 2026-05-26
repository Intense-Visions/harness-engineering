/**
 * Living catalog (ADR 0020) — seed rubrics for copy-craft v1.
 * Each rubric is a separate file under ./rubrics/. The registry below
 * gates which rubrics are available at runtime.
 *
 * Source: docs/changes/craft-pipeline/copy-craft/proposal.md
 *   (Technical Design → Rubric → surface mapping).
 */

import type { CopySurface } from '../../findings/schema.js';

export interface CopyRubric {
  id: string;
  title: string;
  description: string;
  source: string;
  /** Surfaces this rubric applies to. */
  appliesToSurfaces: CopySurface[];
  /** ADR 0020 — catalog growth metadata (reserved). */
  contribution: { addedAt: string; addedBy: string };
  signal: { invocations: number; suppressedAt: string[] };
  version: number;
}

export function rubricApplies(rubric: CopyRubric, surface: CopySurface): boolean {
  return rubric.appliesToSurfaces.includes(surface);
}

import { whatWhyHowToFixRubric } from './what-why-how-to-fix.js';
import { calmNotPanickyRubric } from './calm-not-panicky.js';
import { specificNotGenericRubric } from './specific-not-generic.js';
import { signalNotNoiseRubric } from './signal-not-noise.js';
import { grepSurvivesRubric } from './grep-survives.js';
import { describesChangeNotWorkRubric } from './describes-change-not-work.js';
import { strangerInSixMonthsRubric } from './stranger-in-6-months.js';
import { whyNotWhatRubric } from './why-not-what.js';

/**
 * v1 default rubric set — 8 seed entries from the prose-in-code craft canon.
 */
export const SEED_RUBRICS: ReadonlyArray<CopyRubric> = [
  whatWhyHowToFixRubric,
  calmNotPanickyRubric,
  specificNotGenericRubric,
  signalNotNoiseRubric,
  grepSurvivesRubric,
  describesChangeNotWorkRubric,
  strangerInSixMonthsRubric,
  whyNotWhatRubric,
];
