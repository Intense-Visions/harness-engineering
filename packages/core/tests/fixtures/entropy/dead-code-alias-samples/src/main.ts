import { reachedViaAlias } from '@lib/aliased'; // tsconfig paths alias
import { reachedViaRelative } from './lib/relative'; // plain relative

console.log(reachedViaAlias(), reachedViaRelative());
