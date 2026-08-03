# CantonExamples

Standalone Daml examples for building on Canton's Splice Token Standard.
Each example is a pair of sibling packages: a production package (templates
only, uploadable to a participant) and a `-test` package (daml-script
scenarios, never uploaded). Examples share vendored interface DARs and a
common repo layout, but each defines its own templates -- there is no
cross-example runtime dependency.

## Layout

| Path | Status | Description |
| --- | --- | --- |
| `dars/` | -- | Vendored Splice Token Standard interface DARs (shared, committed binaries; see `dars/README.md` for provenance and sha256). |
| `tokens/cip0056` + `tokens/cip0056-test` | present | Token Standard v1: a singleton, multi-instrument coin factory implementing `BurnMintFactory`, `TransferFactory`, and `AllocationFactory`. |
| `tokens/cip0112` + `tokens/cip0112-test` | present | Token Standard v1 + v2: the same coin registry as `tokens/cip0056`'s, extended with provider/sub-account fields and the v2 `TransferFactory`/`AllocationFactory`/`SettlementFactory` interfaces on its own templates, backed by its own vendored v2 DARs. |

`multi-package.yaml` at the repo root lists every package so `dpm build --all`
builds them all in dependency order; each production/`-test` package pair is
otherwise independent.

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
cd tokens/cip0056-test && dpm test
```

## Provenance

`tokens/cip0056` was extracted from
[`wormholelabs-xyz/native-token-transfers`](https://github.com/wormholelabs-xyz/native-token-transfers)
at commit `002e9ed1`, where it originated as the CIP-0056-only slice of a
Canton NTT (Native Token Transfers) coin registry. The production templates
(`Coin`, `CoinFactory`, `CoinTransfer`, `CoinAllocation`) had no dependency on
NTT/bridge-specific code even in the source repo -- they only import Splice's
Token Standard v1 interfaces and each other -- so the extraction is a rename
(`Wormhole.Ntt.*` to `Token.CIP0056.*`, `guardianGovernance` to `admin`) with
no logic changes. See `dars/README.md` for the vendored-DAR provenance and
`tokens/cip0056/README.md` for the example's own design notes.

`tokens/cip0112` was extracted from the same source repo one commit earlier
-- `002e9ed1~1`, the commit before the CIP-0056-only strip -- which still
carried the Token Standard v2 templates (`CoinAllocationV2` and the v2 coin
fields `provider`/`accountId`) alongside v1. Same rename treatment
(`Wormhole.Ntt.*` to `Token.CIP0112.*`, `guardianGovernance` to `admin`,
`NttCoin*`/`NttTransferInstruction` to their `Coin*`/`CoinTransferInstruction`
counterparts), no logic changes. See `dars/README.md` for the v2 DAR
provenance and `tokens/cip0112/README.md` for the example's own design notes.

## CIP0112 example

`tokens/cip0112` extends `tokens/cip0056`'s coin registry with Token
Standard v2 (CIP-0112): account-model holdings (owner/provider/sub-account),
actors-based v2 transfers with synchronous completion, and multi-leg net
settlement via `SettlementFactory_SettleBatch`. See
`tokens/cip0112/README.md` for what v2 adds, how one template set implements
both standard versions, and the `ExtraArgs` context-key conventions it
relies on.
