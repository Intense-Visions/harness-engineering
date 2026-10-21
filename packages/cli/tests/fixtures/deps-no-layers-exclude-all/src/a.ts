// Source exists, but deps.exclude discards every file: the command was asked to
// analyse something and analysed nothing, which is an abstention (#2098).
import { b } from './b.js';
export const a = (): string => b();
