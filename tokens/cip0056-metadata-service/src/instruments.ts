// Instrument metadata source. The handler talks to this interface only, so
// the config-backed source can be swapped for a ledger-backed one.
import { DEFAULT_INSTRUMENT_SUPPORTED_APIS, type InstrumentConfig, type RegistryConfig } from "./config.ts";
import type { Instrument } from "./types.ts";

export type { Instrument };

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
    // Advisory, but not enforced on-ledger.
    paused: config.paused,
    ...(config.pauseInfo === undefined ? {} : { pauseInfo: config.pauseInfo }),
    // Omitted: `totalSupply`/`totalSupplyAsOf`.
  };
}

/**
 * Serve the config file's instruments in id order. Order is fixed at
 * construction: page tokens are ids, so the sequence must not shift.
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
