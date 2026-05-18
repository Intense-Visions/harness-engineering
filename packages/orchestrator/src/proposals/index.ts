export { runGate, GateRunError } from './gate.js';
export type { GateResult } from './gate.js';
export { promote, GateNotReadyError, PromotionError } from './promote.js';
export type { PromotionResult } from './promote.js';
export { emitProposalCreated, emitProposalApproved, emitProposalRejected } from './events.js';
export type { ProposalCreatedData, ProposalApprovedData, ProposalRejectedData } from './events.js';
