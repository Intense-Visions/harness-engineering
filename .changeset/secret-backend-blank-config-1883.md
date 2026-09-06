---
'@harness-engineering/orchestrator': patch
---

Treat a blank secret-backend setting as unconfigured instead of forwarding it (#1883)

`createSecretBackend` supplied its three optional defaults with `??`, which falls
back only on `null` / `undefined`. An empty string is not nullish, so a blank
`opVault` was treated as a real vault name and built the 1Password reference
`op:///API_KEY/password` — no vault segment at all. A blank `vaultAddr` spawned
the Vault CLI with `VAULT_ADDR=''`, and a blank `vaultPath` ran
`vault kv get -format=json ''`.

Blank is what an unset environment variable interpolated into JSON, a templated
config whose substitution never fired, or a key created to be filled in later all
leave behind — every one of which means "I did not configure this", which is what
an absent key already means. A `nonEmptyString` guard now normalises blank and
whitespace-only to `undefined` before the `??`, so those two spellings of
unconfigured finally agree and take the same documented default.

Blank is treated as absent rather than rejected because this repo draws its line
at required-vs-optional, not blank-vs-absent: `registry.ts` rejects a blank
required `url` and, two lines later, silently drops a blank optional `token`;
`serverless.ts` validates the required `image` while leaving every
optional-with-default field on a plain `??`. All three fields here are optional
with a documented default. The refusal of a falsy `backend` — the required
discriminant — is unchanged.

Values are matched blank-or-not but returned untrimmed, so a legitimate vault name
containing spaces still reaches the CLI unaltered. Absent-key and real-value
behaviour is unchanged, which the pre-existing assertions continue to pin.
