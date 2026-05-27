/**
 * Public barrel for the HuggingFace API integration. Phase 2a surface only —
 * the ranker math, benchmark adapters, and ranking algorithm that consume
 * `HuggingFaceModelSummary` land in Phases 2b–2d.
 */

export { HuggingFaceClient, cacheKeyForList, cacheKeyForGet } from './client.js';
export type { HuggingFaceClientOptions } from './client.js';

export { InMemoryHuggingFaceCache, FileHuggingFaceCache } from './cache.js';
export type {
  HuggingFaceCache,
  InMemoryHuggingFaceCacheOptions,
  FileHuggingFaceCacheOptions,
  FileCacheFs,
} from './cache.js';

export { defaultHttpFetcher } from './http.js';
export type { HttpFetcher, HttpFetchInit, HttpResponse } from './http.js';

export { HuggingFaceModelSummarySchema, decodeModelSummaries } from './types.js';
export type {
  HuggingFaceModelSummary,
  HuggingFaceWarning,
  HuggingFaceFetchResult,
  HuggingFaceFetchSource,
  HuggingFaceListOptions,
} from './types.js';
