# token-cip0112

An example of Canton's Splice Token Standard v1 **and** v2 (CIP-0112) on one
template set: a singleton, multi-instrument coin registry that implements
`BurnMintFactory`, `TransferFactory` v1, `AllocationFactory` v1 (Token
Standard v1, same as `tokens/cip0056`) alongside `TransferFactory` v2,
`AllocationFactory` v2, and `SettlementFactory` (Token Standard v2), so any
conforming wallet or counterparty can use either version of the standard
against the same registry.

## What v2 adds

- **Account model.** v1 holdings are owned by a bare `Party`. v2 introduces
  `HoldingV2.Account`: an `owner` party, an optional `provider` co-signer
  (a custodian or delegate whose authority is required alongside the
  owner's to move the holding), and a sub-account `id` (a `Text`
  distinguishing multiple accounts under the same owner/provider pair). A
  "basic account" is just `owner = Some p, provider = None, id = ""` -- the
  v1 shape lifted into the v2 type. A **null-owner account**
  (`owner = None`) is reserved for mint/burn: `requireAccountOwner` rejects
  it everywhere else.
- **Actors-based transfers with synchronous completion.** v2's
  `TransferFactory_Transfer` takes an `actors` list instead of relying on
  the interface caller's own signature. `transferCore` completes
  synchronously whenever the receiver's account control parties (owner +
  provider, if any) are all present in `actors` -- no separate accept step
  needed. Otherwise it falls back to the same pending-instruction path v1
  uses (`CoinTransferInstruction`), or a standing `TransferPreapproval` if
  one exists.
- **Multi-leg net settlement (`SettleBatch`).** v2's `AllocationFactory`
  locks funds into a `CoinAllocationV2` up front; `SettlementFactory`'s
  `SettleBatch` choice atomically settles a batch of matched transfer legs
  across possibly many allocations in one transaction, crediting each
  allocation's authorizer directly rather than moving value leg-by-leg.
- **Iterated / committed allocations.** A `CoinAllocationV2` can carry
  `nextIterationFunding`: an `Allocation_Settle` that only partially spends
  the locked amount re-locks the remainder into a fresh iteration
  (`numIterations` increments, `originalAllocationCid` tracks the lineage)
  instead of returning it to the authorizer. `allocation.committed`
  additionally restricts unilateral withdrawal to after a
  `settlementDeadline`.

## One template set, two standard versions

`Coin` implements both `Holding` (v1) and `HoldingV2.Holding` (v2) on the
same contract: the v2 view is built from the v1 fields plus `provider` and
`accountId` (`Token.CIP0112.Coin`'s `coinAccount`). `CoinFactory` implements
all five interfaces (`BurnMintFactory`, `TransferFactory` v1/v2,
`AllocationFactory` v1/v2, `SettlementFactory`) on one signatory-`admin`
contract, keyed the same way `tokens/cip0056`'s factory is: every choice
asserts `instrumentId.admin == admin` (and the interface's own
`expectedAdmin` check) before touching value.

v1 paths lift bare parties into basic accounts (`basicAccountV2`) and drive
the same account-based core (`transferCore`, `debitInputs`) that v2 uses
directly -- there is exactly one value-movement implementation underneath
both standard versions.

`CoinTransferInstruction`'s v2 `Accept` illustrates where the two versions
can and cannot literally share a code path: it nests v1's own `Accept`
choice when the receiving account is basic (`provider == None`), but takes
the direct v2 body when a provider is present. The reason is authority, not
convenience -- a nested `exercise`'s authority is exactly the exercised
contract's signatories plus that particular exercise's own controllers.
v1's `TransferInstruction_Accept` controller is the receiver party alone,
so nesting it can never bring a provider's signature into the nested
`create Coin`, which needs the provider as signatory whenever one is set.
Reject and withdraw have no such bottleneck -- v1's credit path draws its
authority from the instruction's own signatories, which are ambiently
present in any nested exercise regardless of account shape -- so those two
choices nest unconditionally. See the comments on
`transferInstruction_acceptImpl` in `Token.CIP0112.CoinTransfer` for the
full authority analysis.

## Two `ExtraArgs` context-key conventions

Both rely on `Splice.Api.Token.MetadataV1.ExtraArgs.context.values`, since
the Token Standard interfaces' choice arguments are fixed and neither
convention has a dedicated field:

- `transferPreapprovalContextKey` (`"token-cip0112.transferPreapprovalCid"`,
  in `Token.CIP0112.CoinTransfer`) -- same convention as `tokens/cip0056`:
  passes a receiver's standing `TransferPreapproval` contract id through a
  transfer. Absent or undecodable falls back to the pending path rather
  than failing or misrouting funds -- fail-safe by construction.
- `settleBatchContextKey` (`"token-cip0112.viaSettleBatch"`, in
  `Token.CIP0112.CoinAllocationV2`) -- stamped onto the nested
  `Allocation_Settle` calls that `SettlementFactory_SettleBatch` makes, so
  `allocation_settleImpl` can require it and reject any direct,
  un-batched `Allocation_Settle`. This is explicitly **not** a security
  boundary: it is forgeable by anyone who already holds the
  `admin :: executors` authority `Allocation_Settle` requires, so it stops
  accidental misuse (a naked settle that skips `SettleBatch`'s two-sided
  leg matching), not a malicious one. Soundness against value creation
  comes entirely from `SettlementFactory_SettleBatch` checking both sides
  of every leg atomically before it exercises anything.

## Templates

| Module | Template | Role |
| --- | --- | --- |
| `Token.CIP0112.Coin` | `Coin` | The token holding. Implements `Holding` (v1) and `HoldingV2.Holding` (v2). Signed by `instrumentId.admin`, `owner`, and `provider` if set. |
| `Token.CIP0112.CoinFactory` | `CoinFactory` | The genesis singleton. Implements `BurnMintFactory`, `TransferFactory` v1/v2, `AllocationFactory` v1/v2, `SettlementFactory`. |
| `Token.CIP0112.CoinTransfer` | `TransferPreapproval` | A recipient's standing consent to receive transfers of one instrument without being present to accept. |
| `Token.CIP0112.CoinTransfer` | `CoinTransferInstruction` | Pending state for an in-flight transfer with no standing preapproval and no receiver authority present. Implements `TransferInstruction` v1 and v2. |
| `Token.CIP0112.CoinAllocation` | `CoinAllocation` | A v1, single-contract allocation (value plus the allocation record folded together; no separate locked holding). Implements `Allocation`. |
| `Token.CIP0112.CoinAllocationV2` | `CoinAllocationV2` | A v2 allocation: locked funds keyed by instrument, multi-leg settlement via `SettlementFactory_SettleBatch`, optional iterated re-locking. Implements `Allocation` v2. |

## Anti-forgery: pinning inputs to the template

Exactly as in `tokens/cip0056`: every choice that consumes existing value
(`debitInputs` in `Token.CIP0112.CoinTransfer`, the burn path and the v2
allocate path in `CoinFactory`) fetches inputs with `fetchFromInterface
@Coin`, never by trusting the caller-supplied `Holding`/`HoldingV2.Holding`
interface view, which is caller-authored and cannot be trusted to describe
its own owner, provider, or amount honestly. Pinning the fetch to the
concrete `Coin` template means only contracts actually created by
`createCoinIn` can be spent as value.

## Production/test package split

`tokens/cip0112` is templates only -- no `daml-script` -- so it can be
uploaded to a participant as-is. `tokens/cip0112-test` carries the
daml-script scenarios and data-depends on the production package's built DAR
(`../cip0112/.daml/dist/token-cip0112-0.1.0.dar`).

## Relation to `tokens/cip0056`

`tokens/cip0056` documents the shared conventions both examples follow: the
production/`-test` package split, the vendored-DAR mechanism under `/dars`
(provenance and sha256 in `dars/README.md`), and the `TestUtils` helper
scaffolding. See its README's "Layering constraints" section for why this
example cannot simply extend `tokens/cip0056`'s templates with v2 interface
instances: Daml requires an interface instance to be declared alongside
either the interface or the template it is for, and Token Standard v2
changes the coin's own fields and signatories (adding `provider`/
`accountId`), so `Token.CIP0112.Coin` is necessarily its own template, not
an extension of `Token.CIP0056.Coin`. What carries over between the two
examples is structural convention, not shared template code.
