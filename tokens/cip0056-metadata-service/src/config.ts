// Deployment config: the source of truth for a config-backed registry.
//
// CIP-56 instrument metadata is off-ledger by design -- the vendored
// splice-api-token-metadata-v1 DAR carries only `Metadata`/`ExtraArgs`, no
// instrument-metadata interface -- so name, symbol and decimals for every
// instrument this registry administers are declared here.
import { z } from "zod";

import type { components } from "./generated/token-metadata-v1.d.ts";

export type SupportedApis = components["schemas"]["SupportedApis"];

/**
 * The token standard APIs a CIP-0056 `CoinFactory` implements, all at minor
 * version 1. This is a property of the DAR set the registry runs, not of an
 * individual instrument, which is why it is a service default rather than a
 * required config field. Deployments running a modified factory override it
 * per instrument.
 */
export const DEFAULT_INSTRUMENT_SUPPORTED_APIS: SupportedApis = {
  "splice-api-token-metadata-v1": 1,
  "splice-api-token-holding-v1": 1,
  "splice-api-token-transfer-instruction-v1": 1,
  "splice-api-token-allocation-v1": 1,
  "splice-api-token-allocation-instruction-v1": 1,
  "splice-api-token-burn-mint-v1": 1,
};

/**
 * What `/registry/metadata/v1/info` advertises. Only the registry-wide APIs
 * belong here; per the spec, wallets use the instrument endpoints to learn
 * what a given instrument supports.
 */
export const DEFAULT_REGISTRY_SUPPORTED_APIS: SupportedApis = {
  "splice-api-token-metadata-v1": 1,
};

/** Daml `Decimal` carries exactly 10 decimal places, which caps `decimals`. */
export const MAX_DECIMALS = 10;

const supportedApisSchema = z.record(z.string().min(1), z.number().int().nonnegative());

const pauseInfoSchema = z.strictObject({
  reason: z.string().min(1).optional(),
  until: z.iso.datetime({ offset: true }).optional(),
});

const instrumentConfigSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  symbol: z.string().min(1),
  decimals: z.number().int().min(0).max(MAX_DECIMALS),
  // Advisory only: `tokens/cip0056` does not enforce a pause on-ledger. See
  // this package's README.
  paused: z.boolean().default(false),
  pauseInfo: pauseInfoSchema.optional(),
  supportedApis: supportedApisSchema.optional(),
});

export const registryConfigSchema = z
  .strictObject({
    /** The instrument admin's party id, served verbatim as `info.adminId`. */
    adminId: z.string().min(1),
    supportedApis: supportedApisSchema.default(DEFAULT_REGISTRY_SUPPORTED_APIS),
    instruments: z.array(instrumentConfigSchema),
  })
  .check((ctx) => {
    // Duplicate ids would make both lookup and pagination ambiguous: lookup
    // would silently pick one, and a page token pointing at the first copy
    // would skip the second.
    const seen = new Set<string>();
    for (const [index, instrument] of ctx.value.instruments.entries()) {
      if (seen.has(instrument.id)) {
        ctx.issues.push({
          code: "custom",
          input: instrument.id,
          path: ["instruments", index, "id"],
          message: `duplicate instrument id ${JSON.stringify(instrument.id)}`,
        });
      }
      seen.add(instrument.id);
    }
  });

export type RegistryConfig = z.infer<typeof registryConfigSchema>;
export type InstrumentConfig = RegistryConfig["instruments"][number];

/** Parse and validate a config value, throwing a `ZodError` on any problem. */
export function parseConfig(value: unknown): RegistryConfig {
  return registryConfigSchema.parse(value);
}

/** Read and validate a config file. */
export async function loadConfig(path: string | URL): Promise<RegistryConfig> {
  return parseConfig(await Bun.file(path).json());
}
