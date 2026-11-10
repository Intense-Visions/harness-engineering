import { configure } from '@testing-library/react';

/**
 * Wait budget for every `waitFor` / `findBy*` in the client suite.
 *
 * RTL's default is 1000 ms. On a loaded CI runner (macOS especially) the first
 * render of a cold module can take longer than that to settle even when every
 * fetch is a mock that resolves at once, so a correct assertion timed out on
 * the loading state (#2339). This changes how long a query waits, not what it
 * asserts, and only costs time when a query is about to fail anyway.
 *
 * Keep it well below the per-test `testTimeout` in vitest.config.mts so a real
 * failure still surfaces as RTL's descriptive DOM error, not a bare timeout.
 */
const CLIENT_ASYNC_UTIL_TIMEOUT_MS = 5_000;

configure({ asyncUtilTimeout: CLIENT_ASYNC_UTIL_TIMEOUT_MS });
