import { helper, unusedHelper } from './helper';
// unusedHelper is imported but never used

export function wrapper() {
  return helper();
}
