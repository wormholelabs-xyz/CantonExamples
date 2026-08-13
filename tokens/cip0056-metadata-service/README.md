# cip0056-metadata-service

Serves the Token Standard's registry metadata API for the `tokens/cip0056`
example:

- `GET /registry/metadata/v1/info`
- `GET /registry/metadata/v1/instruments`
- `GET /registry/metadata/v1/instruments/{instrumentId}`

Wallets read an instrument's name, symbol and decimals from here, not from the
ledger. `InstrumentId` is an opaque `(admin, id)` key and
`splice-api-token-metadata-v1` has no on-ledger metadata interface -- Canton
Coin's ledger id is `"Amulet"`; "Canton Coin" comes from the DSO's scan app.
Until an admin serves this API, a conforming wallet shows the raw id text.

## Running it

```sh
bun install --frozen-lockfile
bun test
bun run start --config config/example.instruments.json
```

`PORT` (default 8080) and `METADATA_CONFIG` also work.

## Config

One JSON file per deployment, validated on load; see
`config/example.instruments.json`. Top level: `adminId`, and optionally
`supportedApis` for `/info` (defaults to metadata-v1 only). Per instrument:
`id`, `name`, `symbol`, `decimals` (0-10), and optionally `paused`, `pauseInfo`,
`supportedApis`. Unknown keys, out-of-range decimals, duplicate ids and
`pauseInfo` without `paused: true` are rejected rather than served.

An instrument's `supportedApis` defaults to what a CIP-0056 `CoinFactory`
implements (metadata, holding, transfer-instruction, allocation,
allocation-instruction, burn-mint, all at minor version 1), since that follows
from the DARs, not from the instrument.

## Things to know

- **`paused` is advisory.** We report it; `tokens/cip0056` does not enforce it,
  so a paused instrument's coins are still transferable. Enforcing it needs the
  registry choice-context endpoints and has to fail closed. Not a safety
  control.
- **The API has no icon field.** Nothing to serve; icons come from wallet-side
  token lists.
- **`pageSize` is clamped to [1, 100].** The spec declares no maximum and no
  400 response, so out-of-range values are clamped to a usable page rather
  than rejected.
- **`totalSupply` is omitted.** A config file can't know it. Swap
  `InstrumentSource` (`src/instruments.ts`) for a ledger-backed one that sums
  the `Coin` ACS.
- **Discovery is on the operator.** Wallets resolve the admin party to a
  registry base URL via scan / the app directory. Nothing here automates that.
- **Metadata alone doesn't enable transfers.** The choice-context endpoints are
  separate APIs, not implemented here.
- External-minter deployments serve their own metadata, since their party is
  the instrument admin.
- Not production: no TLS, rate limiting, or metrics. `/healthz` is
  non-standard, for probes.

## Spec

`openapi/token-metadata-v1.yaml` is vendored verbatim from
`digital-asset/decentralized-canton-sync` tag `v0.6.14` (spec 1.2.0), sha256
`a89e03efe77285a6151a7d1c814e8f135b43038d9c4fd097d131bc58e4153f0c` -- the same
release as the DARs in `/dars`, so the HTTP and Daml surfaces can't drift.

`test/conformance.test.ts` validates every response against the document
itself, so bumping the spec fails a test instead of drifting quietly. The
TypeScript response types are hand-written mirrors in `src/types.ts`, kept
honest by that same suite.

## Dependencies

`zod` at runtime (no transitive deps); `ajv`, `ajv-formats`, `yaml`,
`typescript`, `@types/bun` for dev. Exact pins, `bun.lock` committed, so
install with `--frozen-lockfile`.

Vetted 2026-08-10 (re-audited 2026-08-13): all 13 resolved packages clean on
OSV, `bun audit` clean. `hono` was the obvious routing choice and was dropped
-- 47 advisories, two of them in the CORS middleware we'd have used, and three
static GET routes don't justify tracking that. Re-check with OSV per resolved
version, not per package name, when bumping a pin.
