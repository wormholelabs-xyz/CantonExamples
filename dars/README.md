# Vendored Canton DARs

This directory vendors the built DAR binaries the example packages
data-depend on. Daml has no git or URL dependency mechanism
(`data-dependencies` in `daml.yaml` only accepts local paths to built `.dar`
files), so cross-repo dependencies are committed here as binaries with
provenance and sha256. These DARs are taken verbatim from a canonical build
and must never be rebuilt from source: a different compiler produces
different package-ids, which would break on-network vetting (Splice
interfaces are only trusted at the exact package-id that participants have
vetted).

## Splice token-standard interfaces (CIP-0056 -- Token Standard V1)

Interface-only packages. The package-ids must match what participants on the
Canton Network have vetted. `token-cip0056` drives them all directly:
`holding` and `metadata` (holdings and choice context), `transfer-instruction`
(plain transfers), `allocation` + `allocation-instruction` (DvP/atomic
settlement), and `burn-mint` (a mint/burn factory interface that sits outside
the Token Standard's transfer/allocation family; see `Token.CIP0056.CoinFactory`'s
module header). All copies must be the same network-vetted packages: damlc
dedupes transitive DALFs by package-id, and mixing incompatible copies risks
conflicts.

Provenance: `0.6.14_splice-node.tar.gz` from
https://github.com/digital-asset/decentralized-canton-sync/releases/tag/v0.6.14
(path `splice-node/dars/` inside the bundle). These interface DARs are
immutable and distributed identically across releases (verified byte-for-byte
by sha256 against the copies shipped in cn-quickstart). Built `--target=2.1`;
our packages target LF 2.3, which may data-depend on lower LF 2.x versions.

## sha256

| DAR | consumed by | sha256 |
| --- | --- | --- |
| `splice-api-token-metadata-v1-1.0.0.dar` | `token-cip0056`, `token-cip0056-test` | `455eb160cb5abd4ae9918a6fbb9dad471f721adda39f0e5c76feef08d05637fc` |
| `splice-api-token-holding-v1-1.0.0.dar` | `token-cip0056`, `token-cip0056-test` | `ef75f8eb41a65810221784fdb78bb9dfac7cb22245aba14fa7cb7f69c34e0175` |
| `splice-api-token-allocation-v1-1.0.0.dar` | `token-cip0056`, `token-cip0056-test` | `c3f3b447142577ea4fa7d912ca11cd6821de7588e324e8877425932a02fccaa1` |
| `splice-api-token-allocation-instruction-v1-1.0.0.dar` | `token-cip0056`, `token-cip0056-test` | `e2607ca3a1d735a82d3066b78132aa8f94b1886c99a5f14148742d252c7220a2` |
| `splice-api-token-burn-mint-v1-1.0.0.dar` | `token-cip0056`, `token-cip0056-test` | `a18e85c4841a278bce000df8329c3f0e2fee3b30b55dd6a31492d10a72b4f9c1` |
| `splice-api-token-transfer-instruction-v1-1.0.0.dar` | `token-cip0056`, `token-cip0056-test` | `e4c73aa7ae73fb2fc330b938ffb99f568792321640ba4b9472902aa8d742c994` |

Verify with `sha256sum <file>` against this table before trusting a copy.
