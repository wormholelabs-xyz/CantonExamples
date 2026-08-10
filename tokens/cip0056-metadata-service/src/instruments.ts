// Where instrument metadata comes from.
//
// The handler talks to this interface only, so a deployment can swap the
// config-backed source below for a ledger-backed one -- reading the ACS over
// the JSON Ledger API to fill in `totalSupply` -- without touching routing.
import { DEFAULT_INSTRUMENT_SUPPORTED_APIS, type InstrumentConfig, type RegistryConfig } from "./config.ts";
import type { components } from "./generated/token-metadata-v1.d.ts";

export type Instrument = components["schemas"]["Instrument"];

export interface InstrumentSource {
  /** Every instrument this registry administers, ordered by id. */
  list(): Promise<readonly Instrument[]>;
  /** One instrument, or `undefined` if this registry does not administer it. */
  get(id: string): Promise<Instrument | undefined>;
}

function toInstrument(config: InstrumentConfig): Instrument {
  return {
    id: config.id,
    name: config.name,
    symbol: config.symbol,
    decimals: config.decimals,
    supportedApis: config.supportedApis ?? DEFAULT_INSTRUMENT_SUPPORTED_APIS,
    // Stated explicitly rather than left to the schema default, so a wallet
    // never has to infer it. Advisory: not enforced on-ledger.
    paused: config.paused,
    ...(config.pauseInfo === undefined ? {} : { pauseInfo: config.pauseInfo }),
    // CIP-0056 v1 holdings have no provider/accountId -- those arrive with
    // Token Standard v2 (CIP-0112) -- so there is no account input to show.
    showAccountInputFields: false,
    // `totalSupply`/`totalSupplyAsOf` are omitted: a config file cannot know
    // the live supply. A ledger-backed source is the place to fill them in.
  };
}

/**
 * Serve the instruments declared in a deployment's config file, in id order.
 *
 * Ordering is by code point and is fixed at construction: pagination hands out
 * an id as its page token, so the sequence must not shift between requests.
 */
export function configInstrumentSource(config: RegistryConfig): InstrumentSource {
  const instruments: readonly Instrument[] = Object.freeze(
    config.instruments.map(toInstrument).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  );
  const byId = new Map(instruments.map((instrument) => [instrument.id, instrument]));

  return {
    list: async () => instruments,
    get: async (id) => byId.get(id),
  };
}
