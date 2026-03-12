import { helper, anotherHelper } from './helper';
// anotherHelper is imported but never used

export function wrapper() {
  return helper();
}
