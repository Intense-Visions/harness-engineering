#!/usr/bin/env node
/**
 * Regenerate the frozen LMLM candidate snapshot from the live HuggingFace API.
 *
 * ON-DEMAND ONLY. This is deliberately NOT wired into CI or release (LMLM
 * wiring spec, D5): the frozen candidate list steers which models the
 * orchestrator recommends and installs, so it must stay human-reviewed and
 * deterministic. Run it by hand, review the diff, and commit.
 *
 * Fail-closed: any fetch error — or an empty parse result — aborts WITHOUT
 * overwriting the committed snapshot, so a HuggingFace outage can never land a
 * degraded file.
 *
 * Usage:
 *   pnpm --filter @harness-engineering/local-models build   # build dist first
 *   node scripts/refresh-model-candidates.mjs [org ...]
 *
 * Defaults to the standard allow-listed orgs. Honours HF_TOKEN when set.
 *
 * @see docs/changes/lmlm-functional-wiring/proposal.md (Phase 2, D5)
 */

import { writeFileSync, readFileSync } from 'node:fs';

const OUT = new URL('../packages/local-models/src/candidates/candidates.json', import.meta.url);
const DIST = new URL('../packages/local-models/dist/index.mjs', import.meta.url);
const DEFAULT_ORGS = ['Qwen', 'deepseek-ai', 'meta-llama'];
const PER_ORG_LIMIT = 25;

const { HuggingFaceClient, parseHfModelToCandidates } = await import(DIST.href).catch((err) => {
  console.error(
    '[refresh] could not load @harness-engineering/local-models dist — build it first ' +
      '(`pnpm --filter @harness-engineering/local-models build`).'
  );
  throw err;
});

/** Re-emit a candidate with a stable key order so diffs stay minimal. */
function normalize(candidate, tags) {
  const out = { hfRepoId: candidate.hfRepoId };
  const ollamaName = candidate.ollamaName ?? tags?.ollamaName;
  const family = candidate.family ?? tags?.family;
  if (ollamaName) out.ollamaName = ollamaName;
  if (family) out.family = family;
  out.sizeB = candidate.sizeB;
  if (candidate.activeB !== undefined) out.activeB = candidate.activeB;
  out.quant = candidate.quant;
  return out;
}

async function main() {
  const orgs = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_ORGS;
  const client = new HuggingFaceClient();
  const collected = new Map(); // `${hfRepoId}||${quant}` -> candidate

  for (const org of orgs) {
    console.error(`[refresh] listing GGUF models for ${org} ...`);
    const models = await client.listModels({
      author: org,
      search: 'gguf',
      sort: 'downloads',
      limit: PER_ORG_LIMIT,
    });
    for (const model of models) {
      if (!model.tags?.includes('gguf')) continue;
      const detail = await client.getModel(model.id);
      for (const candidate of parseHfModelToCandidates(detail)) {
        collected.set(`${candidate.hfRepoId}||${candidate.quant}`, candidate);
      }
    }
  }

  if (collected.size === 0) {
    console.error(
      '[refresh] no candidates parsed — refusing to overwrite the committed snapshot (fail closed).'
    );
    process.exit(1);
  }

  // The HF API does not carry our `family` / `ollamaName` curation tags —
  // preserve them from the existing snapshot, keyed by repo id.
  const tagByRepo = new Map();
  try {
    const existing = JSON.parse(readFileSync(OUT, 'utf-8'));
    for (const candidate of existing.candidates ?? []) {
      if (!tagByRepo.has(candidate.hfRepoId)) {
        tagByRepo.set(candidate.hfRepoId, {
          family: candidate.family,
          ollamaName: candidate.ollamaName,
        });
      }
    }
  } catch {
    // First run / missing file — no tags to preserve.
  }

  const candidates = [...collected.values()]
    .map((candidate) => normalize(candidate, tagByRepo.get(candidate.hfRepoId)))
    .sort((a, b) =>
      a.hfRepoId === b.hfRepoId
        ? a.quant.localeCompare(b.quant)
        : a.hfRepoId.localeCompare(b.hfRepoId)
    );

  const doc = {
    version: 1,
    generatedAt: new Date().toISOString().slice(0, 10),
    source: 'hf-refresh',
    candidates,
  };
  writeFileSync(OUT, `${JSON.stringify(doc, null, 2)}\n`);
  console.error(`[refresh] wrote ${candidates.length} candidates to ${OUT.pathname}`);
}

main().catch((err) => {
  console.error('[refresh] failed — committed snapshot left unchanged:', err?.message ?? err);
  process.exit(1);
});
