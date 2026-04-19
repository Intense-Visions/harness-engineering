export interface StepResult {
  status: 'pass' | 'warn' | 'fail';
  message: string;
}
