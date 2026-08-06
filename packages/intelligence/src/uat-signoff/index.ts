// uat-signoff — human-judged intent(Success Criteria)-vs-shipped-reality
// acceptance record. The terminal, human-authority stage of the change lifecycle
// under docs/changes/<slug>/: it records the human's UAT decision as an
// execution_outcome node. Human is the authority — no LLM verdict, no derived
// ship authority, advisory / record-only.
export type {
  UatItemDisposition,
  UatOverallDecision,
  UatSignoffItem,
  UatSignoffInput,
} from './types.js';
export { toUatExecutionOutcome, UatSignoffRecorder, UAT_SIGNOFF_SOURCE } from './recorder.js';
