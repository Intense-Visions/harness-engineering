// uat-signoff — human-judged intent(BRD)-vs-shipped-reality acceptance record.
// The far-end mirror of product-advisor's inception edge: it records the
// human's UAT decision as an execution_outcome node. Human is the authority —
// no LLM verdict, no derived ship authority, advisory / record-only.
export type {
  UatItemDisposition,
  UatOverallDecision,
  UatSignoffItem,
  UatSignoffInput,
} from './types.js';
export { toUatExecutionOutcome, UatSignoffRecorder, UAT_SIGNOFF_SOURCE } from './recorder.js';
