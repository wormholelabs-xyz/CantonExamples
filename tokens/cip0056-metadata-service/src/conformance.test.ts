// Conformance: validate real response bodies against the vendored OpenAPI
// document itself, rather than against a hand-copied list of field names.
//
// Nothing about the spec is transcribed here, so bumping
// openapi/token-metadata-v1.yaml to a newer Splice release surfaces as a
// failing test instead of as a silent divergence a reviewer has to catch.
import { describe, expect, test } from "bun:test";

import Ajv from "ajv";
import addFormats from "ajv-formats";
import { parse as parseYaml } from "yaml";

import { parseConfig } from "./config.ts";
import { createHandler } from "./handler.ts";
import { configInstrumentSource } from "./instruments.ts";
import { readJson } from "./testing.ts";

const SPEC_URL = new URL("../openapi/token-metadata-v1.yaml", import.meta.url);
const spec = parseYaml(await Bun.file(SPEC_URL).text());

const ajv = new Ajv({
  // The document is OpenAPI 3.0, not bare JSON Schema: `nullable`, `example`,
  // `deprecated` and `format: int8` are not draft-07 keywords, so strict mode
  // would reject the schemas themselves rather than validate against them.
  strict: false,
  allErrors: true,
});
addFormats(ajv);
ajv.addFormat("int8", () => true);
ajv.addSchema(spec, "spec");

function validatorFor(schemaName: string) {
  expect(spec.components.schemas[schemaName]).toBeDefined();
  return ajv.compile({ $ref: `spec#/components/schemas/${schemaName}` });
}

/** Assert a body validates, reporting ajv's own errors when it does not. */
function assertValid(schemaName: string, body: unknown) {
  const validate = validatorFor(schemaName);
  if (!validate(body)) {
    throw new Error(
      `${schemaName} rejected by ${SPEC_URL.pathname}: ${ajv.errorsText(validate.errors, { separator: "; " })}\n` +
        JSON.stringify(body, null, 2),
    );
  }
}

const BASE = "https://registry.example.com";
const PREFIX = "/registry/metadata/v1";

// Instruments from w7-registry, keyed by the underlying asset's Solana mint.
const W_ID = "solana:85VBFQZC9TZkfaptBWjvUw7YbZjy52A6mjtPGjstQAmQ";
const USDC_ID = "solana:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SPCX_ID = "solana:SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb";

// Exercises the widest instrument the config-backed source can produce (paused,
// with pauseInfo and an override) alongside the narrowest (required keys only).
const config = parseConfig({
  adminId: "gg::1220aabbccdd",
  instruments: [
    { id: W_ID, name: "Wormhole", symbol: "W", decimals: 6 },
    {
      id: USDC_ID,
      name: "USD Coin",
      symbol: "USDC",
      decimals: 6,
      paused: true,
      pauseInfo: { reason: "guardian governance halt", until: "2026-09-01T00:00:00Z" },
      supportedApis: { "splice-api-token-metadata-v1": 1 },
    },
    { id: SPCX_ID, name: "SpaceX", symbol: "SPCX", decimals: 6 },
  ],
});
const handler = createHandler({ config, source: configInstrumentSource(config) });

const get = (path: string) => handler(new Request(`${BASE}${path}`));

test("the vendored spec is the token metadata API we think it is", () => {
  expect(spec.info.title).toBe("token metadata service");
  expect(spec.openapi).toStartWith("3.0");
  expect(Object.keys(spec.paths)).toEqual([
    `${PREFIX}/info`,
    `${PREFIX}/instruments`,
    `${PREFIX}/instruments/{instrumentId}`,
  ]);
});

describe("responses validate against the vendored schemas", () => {
  test("GetRegistryInfoResponse", async () => {
    assertValid("GetRegistryInfoResponse", await readJson(await get(`${PREFIX}/info`)));
  });

  test("Instrument, for every instrument served", async () => {
    for (const id of [W_ID, USDC_ID, SPCX_ID]) {
      assertValid("Instrument", await readJson(await get(`${PREFIX}/instruments/${encodeURIComponent(id)}`)));
    }
  });

  test("ListInstrumentsResponse, both a paged and a terminal response", async () => {
    const paged = await readJson(await get(`${PREFIX}/instruments?pageSize=1`));
    expect(paged.nextPageToken).toBeString();
    assertValid("ListInstrumentsResponse", paged);

    const terminal = await readJson(await get(`${PREFIX}/instruments`));
    expect(terminal.nextPageToken).toBeUndefined();
    assertValid("ListInstrumentsResponse", terminal);
  });

  test("ErrorResponse, on each path that can 404", async () => {
    const bodies = await Promise.all([
      readJson(await get(`${PREFIX}/instruments/solana:missing`)),
      readJson(await get(`${PREFIX}/instruments?pageToken=solana:missing`)),
      readJson(await get("/registry/metadata/v9/info")),
    ]);
    for (const body of bodies) assertValid("ErrorResponse", body);
  });
});

describe("schema-level guarantees the spec states only in prose", () => {
  // "Must be a number between 0 and 10" lives in the `decimals` description,
  // not in the schema, so ajv cannot enforce it -- config.ts does, and this
  // records that the served values honour it.
  test("every served decimals is an integer in [0, 10]", async () => {
    const { instruments } = await readJson(await get(`${PREFIX}/instruments`));
    for (const instrument of instruments) {
      expect(Number.isInteger(instrument.decimals)).toBe(true);
      expect(instrument.decimals).toBeGreaterThanOrEqual(0);
      expect(instrument.decimals).toBeLessThanOrEqual(10);
    }
  });

  // Extra keys would validate (the schemas do not set additionalProperties:
  // false) but would be non-standard, so we hold ourselves to the declared set.
  test("no response invents a property the spec does not declare", async () => {
    const declaredIn = (schemaName: string) =>
      new Set(Object.keys(spec.components.schemas[schemaName].properties));
    const undeclared = (schemaName: string, body: object) =>
      Object.keys(body).filter((key) => !declaredIn(schemaName).has(key));

    const info = await readJson(await get(`${PREFIX}/info`));
    expect(undeclared("GetRegistryInfoResponse", info)).toEqual([]);

    const list = await readJson(await get(`${PREFIX}/instruments?pageSize=1`));
    expect(undeclared("ListInstrumentsResponse", list)).toEqual([]);
    for (const instrument of list.instruments) {
      expect(undeclared("Instrument", instrument)).toEqual([]);
    }

    const paused = await readJson(await get(`${PREFIX}/instruments/${encodeURIComponent(USDC_ID)}`));
    expect(undeclared("Instrument", paused)).toEqual([]);
    expect(undeclared("PauseInfo", paused.pauseInfo)).toEqual([]);

    const error = await readJson(await get(`${PREFIX}/instruments/nope`));
    expect(undeclared("ErrorResponse", error)).toEqual([]);
  });
});
