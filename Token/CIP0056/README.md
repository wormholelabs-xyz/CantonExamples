# Token/CIP0056

A minimal example of Canton's Splice Token Standard v1 (CIP-0056): a
singleton, multi-instrument coin registry that implements the
`BurnMintFactory`, `TransferFactory`, and `AllocationFactory` interfaces
directly, so any conforming wallet or counterparty can mint, transfer, and
allocate the coin without a per-token wrapper.

## Shape

One `CoinFactory` contract, signed by a single `admin` party, is created
once and never replaced. It is the sole authority for every `InstrumentId`
it serves: every choice implementation asserts
`instrumentId.admin == admin` (and the interfaces' own `expectedAdmin ==
admin` check) before touching value, so the factory can host any number of
distinct instruments -- each just an `InstrumentId` with `admin` set to this
factory's party and a distinguishing `id`/`name` -- while remaining a single
long-lived contract.

## Templates

| Module | Template | Role |
| --- | --- | --- |
| `Token.CIP0056.Coin` | `Coin` | The token holding. Implements `Holding`. Signed by `instrumentId.admin` and `owner`. |
| `Token.CIP0056.CoinFactory` | `CoinFactory` | The genesis singleton. Implements `BurnMintFactory`, `TransferFactory`, `AllocationFactory`. |
| `Token.CIP0056.CoinTransfer` | `TransferPreapproval` | A recipient's standing consent to receive transfers of one instrument without being present to accept. |
| `Token.CIP0056.CoinTransfer` | `CoinTransferInstruction` | Pending state for an in-flight transfer that has no standing preapproval and no receiver authority present. Implements `TransferInstruction`. |
| `Token.CIP0056.CoinAllocation` | `CoinAllocation` | A single-contract allocation (value plus the allocation record folded together; no separate locked holding). Implements `Allocation`. |

## The preapproval convention

`TransferFactory_Transfer`'s interface choice args are fixed by the Token
Standard, so there is no dedicated field for "does the receiver have a
standing preapproval." Instead, the caller passes the `TransferPreapproval`
contract id through `ExtraArgs.context.values`, keyed by
`transferPreapprovalContextKey` (`"token-cip0056.transferPreapprovalCid"`,
defined in `Token.CIP0056.CoinTransfer`). `lookupTransferPreapprovalCid`
decodes it defensively: if the key is absent, or the value isn't the
expected `AV_ContractId`, the transfer falls back to the pending path
(`CoinTransferInstruction`) rather than failing or silently misrouting
funds. This fail-safe-to-pending behavior means a malformed or missing
`ExtraArgs` entry can only make a transfer *more* conservative, never less.

## Anti-forgery: pinning inputs to the template

Every choice that consumes existing value (`debitInputs` in
`Token.CIP0056.CoinTransfer`, the burn path in `CoinFactory`) fetches inputs
with `fetchFromInterface @Coin`, not by trusting the caller-supplied
`Holding` interface view. A `Holding` interface view is caller-authored data
-- any party could implement `Holding` on a contract that claims whatever
`owner`/`amount`/`instrumentId` it likes. Pinning the fetch to the concrete
`Coin` template means only contracts actually created by `createCoin` (and
thus actually signed by the right `instrumentId.admin`) can be spent as
value. `Token/CIP0056/test`'s `TestCoinAuthenticity` suite proves this with
a `ForgedHolding` template that implements `Holding` with attacker-chosen
fields and confirms every debit path rejects it.

## main/test split

`Token/CIP0056/main` is templates only -- no `daml-script` -- so it can be
uploaded to a participant as-is. `Token/CIP0056/test` carries the
daml-script scenarios and data-depends on `main`'s built DAR
(`../main/.daml/dist/token-cip0056-0.1.0.dar`). This keeps test code and the
`daml-script` dependency out of the uploadable artifact.

## Layering constraints (why CIP0112 can't just reuse these templates)

Daml requires an interface instance to be declared alongside either the
interface or the template it's for -- you cannot bolt a new interface
instance onto an existing template from a different module. Token Standard
v2 (the planned `Token/CIP0112` example) changes the coin's own fields and
signatories (adding `provider`/`accountId`), which means its `Coin` is
necessarily a different template from this one, not an extension of it.
Consequently there is no way to share `Coin`/`CoinFactory` template
*definitions* across Token Standard versions: each version brings its own
templates. What genuinely carries over is the vendored-DAR mechanism (`/dars`
plus `dars/README.md`'s provenance/sha256 convention) and the directory
shape (`main`/`test` sibling packages, `TestUtils` helper scaffolding) --
structural conventions, not shared code.
