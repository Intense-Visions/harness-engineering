export {
  registerPulseAdapter,
  getPulseAdapter,
  listPulseAdapters,
  clearPulseAdapters,
  PulseAdapterAlreadyRegisteredError,
} from './registry';
export { registerMockAdapter, MOCK_ADAPTER_NAME } from './mock';

import { registerMockAdapter } from './mock';

// Side-effect: auto-register the mock adapter when @harness-engineering/core
// is imported, so consumers don't need explicit registration. registerMock-
// Adapter is idempotent — dual ESM+CJS resolution paths will not throw.
registerMockAdapter();
