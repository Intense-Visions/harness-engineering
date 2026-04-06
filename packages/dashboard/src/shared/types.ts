/** Health check response shape */
export interface HealthCheckResponse {
  status: 'ok' | 'error';
}

/**
 * Placeholder for API response types.
 * Will be expanded in Phase 2 (shared types + data gathering layer).
 */
export interface ApiResponse<T> {
  data: T;
  timestamp: string;
}
