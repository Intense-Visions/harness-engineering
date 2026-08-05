// Intentional finding in an ESM .mjs module. Regression fixture for #1084: the
// scan glob omitted .mjs, so an ESM-only project's source went unread and the gate
// passed because it matched nothing.

export const api_key = 'sk_live_abc123secretkey456def';
