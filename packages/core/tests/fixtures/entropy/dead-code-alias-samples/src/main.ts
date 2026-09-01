import { reachedViaAlias } from '@lib/aliased'; // tsconfig paths alias
import { reachedViaNestedAlias } from '@lib/nested/deep'; // alias with a nested wildcard capture
import { reachedViaRelative } from './lib/relative'; // plain relative

console.log(reachedViaAlias(), reachedViaNestedAlias(), reachedViaRelative());
