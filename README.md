# CantonExamples

Standalone Daml examples for building on Canton's Splice Token Standard.
Each `Token/<CIP>` directory is a self-contained example: a production
package (templates only, uploadable to a participant) and a test package
(daml-script scenarios, never uploaded). Examples share vendored interface
DARs and a common repo layout, but each defines its own templates -- there is
no cross-example runtime dependency.

## Layout

| Path | Status | Description |
| --- | --- | --- |
| `dars/` | -- | Vendored Splice Token Standard interface DARs (shared, committed binaries; see `dars/README.md` for provenance and sha256). |
| `Token/CIP0056/` | present | Token Standard v1: a singleton, multi-instrument coin factory implementing `BurnMintFactory`, `TransferFactory`, and `AllocationFactory`. |
| `Token/CIP0112/` | planned | Token Standard v2: adds provider/account-holder fields to the coin, its own templates, its own vendored v2 DARs. Not yet extracted -- see "CIP0112 recipe" below. |

`multi-package.yaml` at the repo root lists every package so `dpm build --all`
builds them all in dependency order; each `Token/<CIP>/main` and
`Token/<CIP>/test` package pair is otherwise independent.

## Prerequisites

- [dpm](https://docs.digitalasset.com), Digital Asset's Daml package manager:
  `curl -sSL https://get.digitalasset.com/install/install.sh | sh`
- The SDK version pinned by every `daml.yaml` in this repo:
  `dpm install 3.5.1`
- A JDK (Canton and the Daml toolchain run on the JVM); Eclipse Temurin 17 is
  what `.devcontainer/` uses.

## Build and test

```sh
# From the repo root: builds every package in multi-package.yaml, in order.
dpm build --all

# Run an example's test suite (daml-script), from its test package directory.
cd Token/CIP0056/test && dpm test
```

## Provenance

`Token/CIP0056` was extracted from
[`wormholelabs-xyz/native-token-transfers`](https://github.com/wormholelabs-xyz/native-token-transfers)
at commit `002e9ed1`, where it originated as the CIP-0056-only slice of a
Canton NTT (Native Token Transfers) coin registry. The production templates
(`Coin`, `CoinFactory`, `CoinTransfer`, `CoinAllocation`) had no dependency on
NTT/bridge-specific code even in the source repo -- they only import Splice's
Token Standard v1 interfaces and each other -- so the extraction is a rename
(`Wormhole.Ntt.*` to `Token.CIP0056.*`, `guardianGovernance` to `admin`) with
no logic changes. See `dars/README.md` for the vendored-DAR provenance and
`Token/CIP0056/README.md` for the example's own design notes.

## CIP0112 recipe

`Token/CIP0112` is not yet extracted. When it is, the source is the same NTT
repo one commit before the CIP-0056-only strip -- `002e9ed1~1` -- which still
carries the Token Standard v2 templates (`CoinAllocationV2` and the v2 coin
fields `provider`/`accountId`) alongside v1. This repo's layout anticipates
that extraction:

1. Create `Token/CIP0112/{main,test}` mirroring `Token/CIP0056`'s shape;
   package name `token-cip0112`.
2. Restore the four Token Standard v2 DARs into `/dars/` from NTT history
   (`git show 002e9ed1~1:canton/dars/…` in
   `wormholelabs-xyz/native-token-transfers`), verify each against the
   sha256 table in `002e9ed1~1:canton/dars/README.md`, and append rows plus a
   v2 provenance paragraph to `dars/README.md`.
3. Seed sources from the parent commit's combined v1+v2 files
   (`002e9ed1~1:canton/ntt/daml/Wormhole/Ntt/{Coin,CoinFactory,CoinTransfer,CoinAllocation,CoinAllocationV2}.daml`
   and the corresponding v2 test files), renamed into `Token.CIP0112.*`. Note
   that CIP0112's `Coin` is its own template (different fields and
   signatories from CIP0056's) -- see "Layering constraints" in
   `Token/CIP0056/README.md` for why genuine template sharing isn't possible
   across Token Standard versions.
4. Copy `TestUtils` from `Token/CIP0056/test` and extend it with v2 account
   helpers.
5. Append `./Token/CIP0112/main` and `./Token/CIP0112/test` to the root
   `multi-package.yaml`. No `Token/CIP0056` file needs to change.
