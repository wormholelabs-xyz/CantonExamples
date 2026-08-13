# cip0056-metadata-service

Off-ledger `splice-api-token-metadata-v1` registry service for the
`tokens/cip0056` example. Wallets read an instrument's name, symbol and
decimals from this API, not from the ledger; this is the standard Amulet uses
to be displayed as "Canton Coin".

- `GET /registry/metadata/v1/info`
- `GET /registry/metadata/v1/instruments`
- `GET /registry/metadata/v1/instruments/{instrumentId}`

## Running

```sh
bun install --frozen-lockfile
bun test
bun run start --config config/example.instruments.json
```

`PORT` (default 8080) and `METADATA_CONFIG` also work.

## Config

One JSON file per deployment, validated on load; see
`config/example.instruments.json`. Top level: `adminId`, optional
`supportedApis`. Per instrument: `id`, `name`, `symbol`, `decimals` (0-10),
optional `paused`, `pauseInfo`, `supportedApis` (defaults to the APIs a
CIP-0056 `CoinFactory` implements). Unknown keys, out-of-range decimals,
duplicate ids and `pauseInfo` without `paused: true` are rejected.

## Limits

- `paused` is advisory; `tokens/cip0056` does not enforce it on-ledger.
- No icon field in the API.
- `pageSize` is clamped to [1, 100].
- `totalSupply` is omitted; a ledger-backed `InstrumentSource`
  (`src/instruments.ts`) would fill it in.
- Discovery (admin party to registry URL, via scan / the app directory) is not
  automated.
- The transfer choice-context endpoints are separate APIs, not implemented
  here.
- Not production: no TLS, rate limiting, or metrics. `/healthz` is a
  non-standard probe endpoint.

## Spec

`openapi/token-metadata-v1.yaml` is vendored verbatim from
`digital-asset/decentralized-canton-sync` tag `v0.6.14` (spec 1.2.0, sha256
`a89e03efe77285a6151a7d1c814e8f135b43038d9c4fd097d131bc58e4153f0c`), the same
release as the DARs in `/dars`. `test/conformance.test.ts` validates every
response against it. Response types are hand-written in `src/types.ts`.

## Dependencies

`zod` at runtime; `ajv`, `ajv-formats`, `yaml`, `typescript`, `@types/bun` for
dev. Exact pins, `bun.lock` committed; install with `--frozen-lockfile`. All 13
resolved packages OSV-clean and `bun audit` clean as of 2026-08-13.
