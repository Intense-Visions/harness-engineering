export {
  registerPulseAdapter,
  getPulseAdapter,
  listPulseAdapters,
  clearPulseAdapters,
  PulseAdapterAlreadyRegisteredError,
} from './registry';
export { registerMockAdapter, MOCK_ADAPTER_NAME } from './mock';

import { registerMockAdapter, MOCK_ADAPTER_NAME } from './mock';
import { listPulseAdapters } from './registry';

// Side-effect: auto-register the mock adapter when @harness-engineering/core
// is imported, so consumers don't need explicit registration. Defensive guard
// against double-registration (e.g., dual ESM+CJS resolution paths).
if (!listPulseAdapters().includes(MOCK_ADAPTER_NAME)) {
  registerMockAdapter();
}
