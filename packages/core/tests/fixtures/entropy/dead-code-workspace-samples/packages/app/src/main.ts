import { z } from 'zod';
import { usedByRelative } from '../../lib/src/index.js';
import { usedByBare } from '@probe/lib';
import { usedBySubpath } from '@probe/lib/util';

export const schema = z.string();
export const out = [usedByRelative(), usedByBare(), usedBySubpath()];
