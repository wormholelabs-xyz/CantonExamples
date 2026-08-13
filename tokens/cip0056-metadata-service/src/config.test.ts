// Config validation: what a deployment is and is not allowed to declare.
//
// The config file is the source of truth for a config-backed registry, so a
// typo here becomes wrong metadata in every wallet. These tests pin the
// rejections down.
import { describe, expect, test } from "bun:test";

import { DEFAULT_INSTRUMENT_SUPPORTED_APIS, parseConfig } from "./config.ts";

const instrument = {
  id: "solana:85VBFQZC9TZkfaptBWjvUw7YbZjy52A6mjtPGjstQAmQ",
  name: "Wormhole",
  symbol: "W",
  decimals: 6,
};

const config = {
  adminId: "gg::1220aabb",
  instruments: [instrument],
};

describe("decimals", () => {
  // The standard caps decimals at 10: Daml's `Decimal` carries exactly 10
  // decimal places, so a larger value cannot be represented on-ledger.
  test.each([0, 1, 8, 10])("accepts %i", (decimals) => {
    const parsed = parseConfig({ ...config, instruments: [{ ...instrument, decimals }] });
    expect(parsed.instruments[0]?.decimals).toBe(decimals);
  });

  test.each([11, -1, 1.5])("rejects %p", (decimals) => {
    expect(() => parseConfig({ ...config, instruments: [{ ...instrument, decimals }] })).toThrow();
  });
});

describe("required fields", () => {
  test("rejects a missing symbol", () => {
    const { symbol, ...withoutSymbol } = instrument;
    expect(() => parseConfig({ ...config, instruments: [withoutSymbol] })).toThrow();
  });

  test("rejects an empty adminId", () => {
    expect(() => parseConfig({ ...config, adminId: "" })).toThrow();
  });

  test("rejects an empty instrument id", () => {
    expect(() => parseConfig({ ...config, instruments: [{ ...instrument, id: "" }] })).toThrow();
  });

  test("rejects an unknown key, so a misspelled field is never silently ignored", () => {
    expect(() => parseConfig({ ...config, instruments: [{ ...instrument, decimal: 8 }] })).toThrow();
  });
});

describe("instrument ids", () => {
  test("rejects duplicates, which would make lookup and pagination ambiguous", () => {
    expect(() => parseConfig({ ...config, instruments: [instrument, { ...instrument, name: "Other" }] })).toThrow(
      /duplicate/i,
    );
  });

  test("accepts the derived keccak ids the bridge actually mints", () => {
    const id = `wormhole-ntt:${"ab".repeat(32)}`;
    const parsed = parseConfig({ ...config, instruments: [{ ...instrument, id }] });
    expect(parsed.instruments[0]?.id).toBe(id);
  });
});

describe("supportedApis", () => {
  test("defaults to the API set a CIP-0056 CoinFactory implements", () => {
    const parsed = parseConfig(config);
    expect(parsed.instruments[0]?.supportedApis).toBeUndefined();
    // toEqual, not toMatchObject: advertising an API the factory does not
    // implement is exactly the mistake worth catching here.
    expect(DEFAULT_INSTRUMENT_SUPPORTED_APIS).toEqual({
      "splice-api-token-metadata-v1": 1,
      "splice-api-token-holding-v1": 1,
      "splice-api-token-transfer-instruction-v1": 1,
      "splice-api-token-allocation-v1": 1,
      "splice-api-token-allocation-instruction-v1": 1,
      "splice-api-token-burn-mint-v1": 1,
    });
  });

  test("a per-instrument override is kept verbatim", () => {
    const supportedApis = { "splice-api-token-metadata-v1": 1, "splice-api-token-holding-v1": 1 };
    const parsed = parseConfig({ ...config, instruments: [{ ...instrument, supportedApis }] });
    expect(parsed.instruments[0]?.supportedApis).toEqual(supportedApis);
  });

  test("rejects a non-integer minor version", () => {
    expect(() =>
      parseConfig({ ...config, instruments: [{ ...instrument, supportedApis: { "splice-api-token-metadata-v1": 1.5 } }] }),
    ).toThrow();
  });
});

describe("pause state", () => {
  test("defaults to not paused", () => {
    expect(parseConfig(config).instruments[0]?.paused).toBe(false);
  });

  test("accepts paused with a reason and an RFC 3339 until", () => {
    const pauseInfo = { reason: "guardian governance halt", until: "2026-09-01T00:00:00Z" };
    const parsed = parseConfig({
      ...config,
      instruments: [{ ...instrument, paused: true, pauseInfo }],
    });
    expect(parsed.instruments[0]?.paused).toBe(true);
    expect(parsed.instruments[0]?.pauseInfo).toEqual(pauseInfo);
  });

  test("rejects an `until` that is not a timestamp", () => {
    expect(() =>
      parseConfig({ ...config, instruments: [{ ...instrument, pauseInfo: { until: "next tuesday" } }] }),
    ).toThrow();
  });
});

test("an empty instrument list is valid -- a registry may serve nothing yet", () => {
  expect(parseConfig({ ...config, instruments: [] }).instruments).toEqual([]);
});

test("the worked example config in this package parses", async () => {
  const path = new URL("../config/example.instruments.json", import.meta.url);
  const parsed = parseConfig(await Bun.file(path).json());
  expect(parsed.instruments.length).toBeGreaterThan(1);
});
